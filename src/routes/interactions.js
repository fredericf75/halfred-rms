const express = require('express');
const router = express.Router();
const db = require('../db');
const { computeHealthScore } = require('../utils/healthScore');
const { computeEmbedding, embeddingTextForInteraction } = require('../utils/embeddings');

// POST /contacts/:contact_id/interactions - Log a new interaction
router.post('/contacts/:contact_id/interactions', async (req, res, next) => {
  try {
    const { contact_id } = req.params;
    const {
      type, subject, summary, notes,
      interaction_date, duration_minutes, related_task_id, tags
    } = req.body;

    const contact = await db('contacts').where('id', contact_id).first();
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const id = `interaction_${Date.now()}`;
    const interaction = {
      id,
      contact_id,
      type,
      subject,
      summary,
      notes,
      interaction_date: new Date(interaction_date).toISOString(),
      duration_minutes,
      related_task_id,
      tags: tags ? JSON.stringify(tags) : null,
      created_at: new Date().toISOString()
    };

    const embeddingText = embeddingTextForInteraction(interaction);
    interaction.embedding = await computeEmbedding(embeddingText);

    // Save interaction within a transaction to guarantee data integrity
    await db.transaction(async (trx) => {
      await trx('interaction_log').insert(interaction);
      
      // Update contact's last interaction date if it's strictly newer
      if (!contact.last_interaction_date || new Date(interaction_date) > new Date(contact.last_interaction_date)) {
        await trx('contacts')
          .where('id', contact_id)
          .update({ 
            last_interaction_date: new Date(interaction_date).toISOString(),
            last_interaction_type: type,
            updated_at: new Date().toISOString()
          });
      }
    });

    // Recompute health score asynchronously 
    // (don't block the response, let it happen in the background)
    computeHealthScore(contact_id).then(score => {
      db('contacts').where('id', contact_id).update({ health_score: score }).catch(console.error);
    }).catch(console.error);

    res.status(201).json(interaction);
  } catch (error) {
    next(error);
  }
});

// GET /contacts/:contact_id/interactions - Retrieve all interactions
router.get('/contacts/:contact_id/interactions', async (req, res, next) => {
  try {
    const { contact_id } = req.params;
    const { type, skip = 0, limit = 50 } = req.query;

    let query = db('interaction_log').where('contact_id', contact_id);
    if (type) query = query.where('type', type);

    const totalRes = await query.clone().count('* as count').first();
    const interactions = await query
      .orderBy('interaction_date', 'desc')
      .offset(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      interactions,
      total: totalRes ? totalRes.count : 0,
      skip: parseInt(skip),
      limit: parseInt(limit)
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /contacts/:contact_id/interactions/:interaction_id - Update a specific interaction
router.patch('/contacts/:contact_id/interactions/:interaction_id', async (req, res, next) => {
  try {
     const { interaction_id } = req.params;
     const updates = { ...req.body };

     const interaction = await db('interaction_log').where('id', interaction_id).first();
     if (!interaction) {
       return res.status(404).json({ error: 'Interaction not found' });
     }

     if (updates.tags) updates.tags = JSON.stringify(updates.tags);
     if (updates.interaction_date) updates.interaction_date = new Date(updates.interaction_date).toISOString();

     const merged = { ...interaction, ...updates };
     if (updates.subject || updates.summary || updates.notes) {
        merged.embedding = await computeEmbedding(embeddingTextForInteraction(merged));
        updates.embedding = merged.embedding;
     }

     await db('interaction_log').where('id', interaction_id).update(updates);
     const updated = await db('interaction_log').where('id', interaction_id).first();
     
     res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
