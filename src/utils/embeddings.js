const { execSync } = require('child_process');
const path = require('path');

const EMBED_SCRIPT = path.join(__dirname, 'embeddings.py');

/**
 * Compute embedding for a text string via Python sentence-transformers.
 * Returns JSON string (float array) or null on failure.
 */
function computeEmbedding(text) {
  try {
    const escaped = text.replace(/'/g, "'\\''");
    const result = execSync(`python3 -c "
import sys, json
sys.path.insert(0, '${path.dirname(EMBED_SCRIPT)}')
from embeddings import compute_embedding
print(json.dumps(compute_embedding('''${escaped}''')))
"`, { timeout: 30000 });
    return result.toString().trim();
  } catch (err) {
    console.error('Embedding error:', err.message);
    return null;
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function embeddingTextForContact(contact) {
  const parts = [contact.name];
  if (contact.relationship_type) parts.push(contact.relationship_type);
  if (contact.notes) parts.push(contact.notes);
  try {
    const tags = JSON.parse(contact.tags || '[]');
    if (tags.length) parts.push(tags.join(' '));
  } catch (e) {}
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
  computeEmbedding,
  cosineSimilarity,
  embeddingTextForContact,
  embeddingTextForInteraction,
};
