const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /task-links - Link a contact to a task
router.post('/', async (req, res, next) => {
  try {
    const { task_id, contact_id, link_type, context } = req.body;

    const contact = await db('contacts').where('id', contact_id).first();
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const id = `link_${Date.now()}`;
    const link = {
      id,
      task_id,
      contact_id,
      link_type,
      context,
      created_at: new Date().toISOString()
    };

    await db('task_contact_link').insert(link);
    res.status(201).json(link);
  } catch (error) {
    next(error);
  }
});

// GET /task-links?task_id={task_id} - Read contacts linked to a task
router.get('/', async (req, res, next) => {
  try {
    const { task_id } = req.query;
    if (!task_id) {
       return res.status(400).json({ error: 'Missing task_id query parameter' });
    }

    const links = await db('task_contact_link')
      .where('task_id', task_id)
      .join('contacts', 'task_contact_link.contact_id', 'contacts.id')
      .select(
        'task_contact_link.id as link_id',
        'task_contact_link.link_type',
        'task_contact_link.context',
        'contacts.id as contact_id',
        'contacts.name',
        'contacts.email',
        'contacts.phone',
        'contacts.last_interaction_date',
        'contacts.preferred_contact_method'
      );

    res.json({
      task_id,
      contacts: links
    });
  } catch (error) {
    next(error);
  }
});

// GET /contacts/:contact_id/linked-tasks - Read tasks linked to a given contact
router.get('/contacts/:contact_id/linked-tasks', async (req, res, next) => {
  try {
    const { contact_id } = req.params;

    const linked_tasks = await db('task_contact_link')
      .where('contact_id', contact_id)
      .select('task_id', 'link_type', 'context');

    res.json({
      contact_id,
      linked_tasks
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /task-links/:task_id/:contact_id - Remove link entirely
router.delete('/:task_id/:contact_id', async (req, res, next) => {
  try {
    const { task_id, contact_id } = req.params;

    const deleted = await db('task_contact_link')
      .where('task_id', task_id)
      .where('contact_id', contact_id)
      .delete();

    if (!deleted) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.json({ message: 'Link removed' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
