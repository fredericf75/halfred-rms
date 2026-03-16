const { pipeline } = require('@xenova/transformers');
const db = require('../db');

let _model = null;

async function getModel() {
  if (!_model) {
    // using the 'feature-extraction' pipeline for ALL-MiniLM-L6-v2
    _model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return _model;
}

async function computeEmbedding(text) {
  try {
    const model = await getModel();
    // Use pooling and normalization for cosine similarity compatibility
    const out = await model(text, { pooling: 'mean', normalize: true });
    // out.data is a Float32Array; convert to standard array then JSON
    return JSON.stringify(Array.from(out.data));
  } catch (err) {
    console.error('Error computing embedding:', err);
    return null;
  }
}

function embeddingTextForContact(contact) {
  const parts = [contact.name];
  if (contact.relationship_type) parts.push(contact.relationship_type);
  if (contact.notes) parts.push(contact.notes);
  
  try {
    const tags = JSON.parse(contact.tags || '[]');
    if (tags.length) parts.push(tags.join(' '));
  } catch(e) {}

  return parts.join(' ');
}

function embeddingTextForInteraction(interaction) {
  const parts = [];
  if (interaction.subject) parts.push(interaction.subject);
  if (interaction.summary) parts.push(interaction.summary);
  if (interaction.notes) parts.push(interaction.notes);
  return parts.join(' ');
}

module.exports = {
  getModel,
  computeEmbedding,
  embeddingTextForContact,
  embeddingTextForInteraction
};
