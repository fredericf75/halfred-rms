const express = require('express');
const router = express.Router();
const db = require('../db');

const REL_TYPES = ['friend', 'family', 'colleague', 'vendor', 'acquaintance', 'other'];

// Helper: sidebar data (relationship type counts)
async function sidebarData() {
  const rows = await db('contacts')
    .select('relationship_type')
    .count('* as count')
    .where('status', 'active')
    .whereNotNull('relationship_type')
    .groupBy('relationship_type');
  return rows.map(r => [r.relationship_type, r.count]);
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(d) {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  return Math.floor(ms / 86400000);
}

// ────────────────────────────────────────────────
// DASHBOARD
// ────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Reminders due today or overdue
    const reminderRows = await db('reminders as r')
      .join('contacts as c', 'r.contact_id', 'c.id')
      .select('r.*', 'c.name as contact_name')
      .where('r.status', 'pending')
      .where('r.scheduled_date', '<=', todayStr)
      .orderBy('r.scheduled_date', 'asc');

    const reminders = reminderRows.map(r => ({
      ...r,
      days_overdue: daysSince(r.scheduled_date),
    }));

    // Needs attention: health < 40 OR last_interaction_date > 30 days ago
    const threshold = new Date(Date.now() - 30 * 86400000).toISOString();
    const attentionRows = await db('contacts')
      .where('status', 'active')
      .where(function () {
        this.where('health_score', '<', 40)
          .orWhere(function () {
            this.where('last_interaction_date', '<', threshold)
              .orWhereNull('last_interaction_date');
          });
      })
      .orderBy('health_score', 'asc')
      .limit(10);

    const needsAttention = attentionRows.map(c => ({
      ...c,
      days_since: daysSince(c.last_interaction_date),
    }));

    // Recently contacted (last 7 days)
    const recentThreshold = new Date(Date.now() - 7 * 86400000).toISOString();
    const recentRows = await db('contacts as c')
      .join('interaction_log as i', 'i.contact_id', 'c.id')
      .select('c.id', 'c.name', 'i.type as last_interaction_type', 'i.interaction_date')
      .where('c.status', 'active')
      .where('i.interaction_date', '>', recentThreshold)
      .orderBy('i.interaction_date', 'desc')
      .limit(10);

    // Deduplicate by contact id (keep most recent)
    const seen = new Set();
    const recentlyContacted = recentRows
      .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
      .map(c => ({ ...c, days_ago: daysSince(c.interaction_date) }));

    res.render('dashboard', {
      active: 'dashboard',
      rel_type_counts: await sidebarData(),
      dateLabel: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      reminders,
      needsAttention,
      recentlyContacted,
    });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
// CONTACTS LIST
// ────────────────────────────────────────────────
router.get('/contacts', async (req, res, next) => {
  try {
    const { relationship_type, status, q } = req.query;
    let query = db('contacts');
    if (relationship_type) query = query.where('relationship_type', relationship_type);
    if (status) query = query.where('status', status);
    if (q) query = query.where('name', 'like', `%${q}%`);
    const contacts = await query.orderBy('name', 'asc');

    const now = Date.now();
    const enriched = contacts.map(c => {
      const interval = c.check_in_interval_days;
      const lastDate = c.last_interaction_date ? new Date(c.last_interaction_date) : null;
      let next_checkin_fmt = null;
      let checkin_overdue = false;
      if (interval && lastDate) {
        const nextDate = new Date(lastDate.getTime() + interval * 86400000);
        next_checkin_fmt = fmtDate(nextDate);
        checkin_overdue = nextDate < new Date();
      }
      return {
        ...c,
        last_interaction_date_fmt: fmtDate(c.last_interaction_date),
        next_checkin_fmt,
        checkin_overdue,
      };
    });

    res.render('contacts', {
      active: 'contacts',
      rel_type_counts: await sidebarData(),
      contacts: enriched,
      rel_types: REL_TYPES,
      filters: { relationship_type, status, q },
    });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
// NEW CONTACT FORM
// ────────────────────────────────────────────────
router.get('/contacts/new', async (req, res, next) => {
  try {
    res.render('contact_form', {
      active: 'contacts',
      rel_type_counts: await sidebarData(),
      contact: null,
    });
  } catch (err) { next(err); }
});

router.post('/contacts', async (req, res, next) => {
  try {
    const { computeEmbedding, embeddingTextForContact } = require('../utils/embeddings');
    const { name, email, phone, relationship_type, status, preferred_contact_method,
            check_in_interval_days, date_met, time_zone, tags, notes } = req.body;

    const id = `contact_${Date.now()}`;
    const tagArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const contact = {
      id, name, email, phone, relationship_type,
      status: status || 'active', preferred_contact_method,
      check_in_interval_days: check_in_interval_days || null,
      date_met: date_met || null, time_zone, notes,
      tags: JSON.stringify(tagArr),
      custom_fields: JSON.stringify({}),
      health_score: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const emb = embeddingTextForContact(contact);
      contact.embedding = await computeEmbedding(emb);
    } catch (e) { /* embeddings optional */ }

    await db('contacts').insert(contact);
    res.redirect(`/contacts/${id}`);
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
// CONTACT DETAIL
// ────────────────────────────────────────────────
router.get('/contacts/:id', async (req, res, next) => {
  try {
    const contact = await db('contacts').where('id', req.params.id).first();
    if (!contact) return res.status(404).send('Contact not found');

    const interactions = await db('interaction_log').where('contact_id', contact.id).orderBy('interaction_date', 'desc');
    const notes = await db('relationship_notes').where('contact_id', contact.id);
    const linked_tasks = await db('task_contact_link').where('contact_id', contact.id);
    const reminders = await db('reminders').where('contact_id', contact.id).where('status', 'pending');

    const interval = contact.check_in_interval_days;
    const lastDate = contact.last_interaction_date ? new Date(contact.last_interaction_date) : null;
    let next_checkin_fmt = null, checkin_overdue = false;
    if (interval && lastDate) {
      const nextDate = new Date(lastDate.getTime() + interval * 86400000);
      next_checkin_fmt = fmtDate(nextDate);
      checkin_overdue = nextDate < new Date();
    }

    let tags_display = '';
    try { tags_display = JSON.parse(contact.tags || '[]').join(', '); } catch (e) {}

    res.render('contact_detail', {
      active: 'contacts',
      rel_type_counts: await sidebarData(),
      contact: {
        ...contact,
        last_interaction_date_fmt: fmtDate(contact.last_interaction_date),
        next_checkin_fmt,
        checkin_overdue,
        tags_display,
      },
      interactions: interactions.map(i => ({ ...i, interaction_date_fmt: fmtDate(i.interaction_date) })),
      notes,
      linked_tasks,
      reminders: reminders.map(r => ({ ...r, scheduled_date_fmt: fmtDate(r.scheduled_date) })),
    });
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
// EDIT CONTACT
// ────────────────────────────────────────────────
router.get('/contacts/:id/edit', async (req, res, next) => {
  try {
    const contact = await db('contacts').where('id', req.params.id).first();
    if (!contact) return res.status(404).send('Contact not found');
    let tags_display = '';
    try { tags_display = JSON.parse(contact.tags || '[]').join(', '); } catch (e) {}
    res.render('contact_form', {
      active: 'contacts',
      rel_type_counts: await sidebarData(),
      contact: { ...contact, tags_display },
    });
  } catch (err) { next(err); }
});

router.post('/contacts/:id/edit', async (req, res, next) => {
  try {
    const { name, email, phone, relationship_type, status, preferred_contact_method,
            check_in_interval_days, date_met, time_zone, tags, notes } = req.body;
    const tagArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const updates = {
      name, email, phone, relationship_type, status, preferred_contact_method,
      check_in_interval_days: check_in_interval_days || null,
      date_met: date_met || null, time_zone, notes,
      tags: JSON.stringify(tagArr),
      updated_at: new Date().toISOString(),
    };
    await db('contacts').where('id', req.params.id).update(updates);
    res.redirect(`/contacts/${req.params.id}`);
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
// LOG INTERACTION
// ────────────────────────────────────────────────
router.get('/contacts/:id/interactions/new', async (req, res, next) => {
  try {
    const contact = await db('contacts').where('id', req.params.id).first();
    if (!contact) return res.status(404).send('Contact not found');
    const now = new Date();
    const now_fmt = now.toISOString().slice(0, 16);
    res.render('interaction_form', {
      active: 'contacts',
      rel_type_counts: await sidebarData(),
      contact,
      now_fmt,
    });
  } catch (err) { next(err); }
});

router.post('/contacts/:id/interactions', async (req, res, next) => {
  try {
    const { type, subject, summary, notes, interaction_date, duration_minutes, related_task_id, tags } = req.body;
    const contact = await db('contacts').where('id', req.params.id).first();
    if (!contact) return res.status(404).send('Contact not found');

    const tagArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const id = `interaction_${Date.now()}`;
    await db('interaction_log').insert({
      id, contact_id: req.params.id,
      type, subject, summary, notes,
      interaction_date: new Date(interaction_date).toISOString(),
      duration_minutes: duration_minutes || null,
      related_task_id: related_task_id || null,
      tags: JSON.stringify(tagArr),
      created_at: new Date().toISOString(),
    });

    // Update contact last_interaction_date and recompute health
    await db('contacts').where('id', req.params.id).update({
      last_interaction_date: new Date(interaction_date).toISOString(),
      updated_at: new Date().toISOString(),
    });

    res.redirect(`/contacts/${req.params.id}`);
  } catch (err) { next(err); }
});

// ────────────────────────────────────────────────
// HTMX: Reminder done / snooze
// ────────────────────────────────────────────────
router.post('/reminders/:id/done', async (req, res) => {
  await db('reminders').where('id', req.params.id).update({ status: 'completed', updated_at: new Date().toISOString() });
  res.send(''); // removes element via hx-swap outerHTML with empty response
});

router.post('/reminders/:id/snooze', async (req, res) => {
  const snoozeDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await db('reminders').where('id', req.params.id).update({ snoozed_until: snoozeDate, updated_at: new Date().toISOString() });
  res.send('');
});

// ────────────────────────────────────────────────
// SEARCH
// ────────────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    let results = [];

    if (q) {
      // Try semantic search endpoint first
      try {
        const { cosineSimilarity } = require('../utils/embeddings');
        const { computeEmbedding } = require('../utils/embeddings');
        const queryEmbedding = JSON.parse(await computeEmbedding(q));

        const contacts = await db('contacts').whereNotNull('embedding').where('status', 'active');
        const interactions = await db('interaction_log').whereNotNull('embedding');

        const scored = [];
        for (const c of contacts) {
          try {
            const emb = JSON.parse(c.embedding);
            const score = cosineSimilarity(queryEmbedding, emb);
            if (score > 0.3) scored.push({ type: 'contact', id: c.id, contact_id: c.id, name: c.name, relationship_type: c.relationship_type, score });
          } catch (e) {}
        }
        for (const i of interactions) {
          try {
            const emb = JSON.parse(i.embedding);
            const score = cosineSimilarity(queryEmbedding, emb);
            if (score > 0.3) scored.push({ type: 'interaction', id: i.id, contact_id: i.contact_id, subject: i.subject, score });
          } catch (e) {}
        }
        results = scored.sort((a, b) => b.score - a.score).slice(0, 20);
      } catch (e) {
        // Fallback: plain text search
        const contacts = await db('contacts').where('name', 'like', `%${q}%`).orWhere('notes', 'like', `%${q}%`).limit(20);
        results = contacts.map(c => ({ type: 'contact', id: c.id, contact_id: c.id, name: c.name, relationship_type: c.relationship_type }));
      }
    }

    res.render('search', {
      active: 'search',
      rel_type_counts: await sidebarData(),
      search_q: q,
      q,
      results,
    });
  } catch (err) { next(err); }
});

module.exports = router;
