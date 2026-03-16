const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeHealthScore } = require('../utils/healthScore');
const { computeEmbedding, embeddingTextForContact } = require('../utils/embeddings');

// GET /contacts - Retrieve all contacts (with optional filtering)
router.get('/', async (req, res, next) => {
  try {
    const { status, relationship_type, search, skip = 0, limit = 50 } = req.query;
    let query = db('contacts');

    if (status) query = query.where('status', status);
    if (relationship_type) query = query.where('relationship_type', relationship_type);
    
    if (search) {
      query = query.where((builder) => {
        builder
          .where('name', 'like', `%${search}%`)
          .orWhere('email', 'like', `%${search}%`)
          .orWhere('phone', 'like', `%${search}%`);
      });
    }

    const totalRes = await query.clone().count('* as count').first();
    const total = totalRes ? totalRes.count : 0;
    
    const contacts = await query.offset(parseInt(skip)).limit(parseInt(limit)).orderBy('name', 'asc');

    res.json({
      contacts,
      total,
      skip: parseInt(skip),
      limit: parseInt(limit)
    });
  } catch (error) {
    next(error);
  }
});

// POST /contacts - Create a new contact
router.post('/', async (req, res, next) => {
  try {
    const {
      name, email, phone, relationship_type,
      notes, tags, custom_fields, preferred_contact_method,
      check_in_interval_days, time_zone
    } = req.body;

    const id = `contact_${Date.now()}`;
    const contact = {
      id,
      name,
      email,
      phone,
      relationship_type,
      notes,
      preferred_contact_method,
      check_in_interval_days,
      time_zone,
      tags: JSON.stringify(tags || []),
      custom_fields: JSON.stringify(custom_fields || {}),
      status: 'active',
      health_score: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const embeddingText = embeddingTextForContact(contact);
    const embedding = await computeEmbedding(embeddingText);
    contact.embedding = embedding;

    await db('contacts').insert(contact);
    res.status(201).json(contact);
  } catch (error) {
    next(error);
  }
});

// GET /contacts/:id - Retrieve a single contact
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const contact = await db('contacts').where('id', id).first();

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const interactions = await db('interaction_log')
      .where('contact_id', id)
      .orderBy('interaction_date', 'desc');

    const notes = await db('relationship_notes')
      .where('contact_id', id);

    const linkedTasks = await db('task_contact_link')
      .where('contact_id', id);

    const reminders = await db('reminders')
      .where('contact_id', id)
      .where('status', 'pending');

    res.json({
      ...contact,
      interactions,
      notes,
      linked_tasks: linkedTasks,
      reminders
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /contacts/:id - Update a contact
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    
    const contact = await db('contacts').where('id', id).first();
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Only stringify arrays/objects if they are provided in the update
    if (updates.tags) updates.tags = JSON.stringify(updates.tags);
    if (updates.custom_fields) updates.custom_fields = JSON.stringify(updates.custom_fields);

    // Recompute embedding if core fields change
    const mergedContact = { ...contact, ...updates };
    if (updates.name || updates.relationship_type || updates.notes || updates.tags) {
      const embeddingText = embeddingTextForContact(mergedContact);
      updates.embedding = await computeEmbedding(embeddingText);
    }

    await db('contacts').where('id', id).update(updates);
    const updatedContact = await db('contacts').where('id', id).first();

    res.json(updatedContact);
  } catch (error) {
    next(error);
  }
});

// DELETE /contacts/:id - Delete or archive a contact
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;

    const contact = await db('contacts').where('id', id).first();
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (permanent === 'true') {
      await db('contacts').where('id', id).delete();
      res.json({ message: 'Contact deleted' });
    } else {
      await db('contacts').where('id', id).update({
        status: 'archived',
        updated_at: new Date().toISOString()
      });
      res.json({ message: 'Contact archived' });
    }
  } catch (error) {
    next(error);
  }
});

// POST /contacts/:id/compute-health - Recompute health score
router.post('/:id/compute-health', async (req, res, next) => {
  try {
    const { id } = req.params;
    const contact = await db('contacts').where('id', id).first();
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const health_score = await computeHealthScore(id);
    await db('contacts').where('id', id).update({ 
      health_score, 
      updated_at: new Date().toISOString() 
    });

    res.json({ contact_id: id, health_score });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
