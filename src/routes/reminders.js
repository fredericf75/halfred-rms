const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /reminders - Create a manual reminder
router.post('/', async (req, res, next) => {
  try {
    const { contact_id, type, scheduled_date, scheduled_time, message } = req.body;

    const contact = await db('contacts').where('id', contact_id).first();
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const id = `reminder_${Date.now()}`;
    const reminder = {
      id,
      contact_id,
      type,
      scheduled_date,
      scheduled_time,
      message,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    await db('reminders').insert(reminder);
    res.status(201).json(reminder);
  } catch (error) {
    next(error);
  }
});

// GET /reminders - Retrieve pending reminders
router.get('/', async (req, res, next) => {
  try {
    const { status = 'pending', contact_id, from_date, to_date } = req.query;

    let query = db('reminders').where('reminders.status', status);

    if (contact_id) {
       query = query.where('reminders.contact_id', contact_id);
    }
    if (from_date) {
       query = query.where('reminders.scheduled_date', '>=', from_date);
    }
    if (to_date) {
       query = query.where('reminders.scheduled_date', '<=', to_date);
    }

    const reminders = await query
      .join('contacts', 'reminders.contact_id', 'contacts.id')
      .select('reminders.*', 'contacts.name as contact_name')
      .orderBy('reminders.scheduled_date', 'asc');

    res.json({ reminders });
  } catch (error) {
    next(error);
  }
});

// PATCH /reminders/:id - Update reminder
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, snoozed_until } = req.body;

    const reminder = await db('reminders').where('id', id).first();
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const updates = {};
    if (status) updates.status = status;
    if (snoozed_until) updates.snoozed_until = snoozed_until;
    if (status === 'dismissed' || status === 'sent') updates.completed_at = new Date().toISOString();

    await db('reminders').where('id', id).update(updates);
    const updated = await db('reminders').where('id', id).first();
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
