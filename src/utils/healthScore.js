const db = require('../db');

/**
 * Computes health score (0-100) based on recency, frequency, and depth of interactions.
 */
async function computeHealthScore(contactId) {
  const contact = await db('contacts').where('id', contactId).first();
  if (!contact) return 0;

  const interactions = await db('interaction_log')
    .where('contact_id', contactId)
    .orderBy('interaction_date', 'desc');

  if (interactions.length === 0) return 50; // Default baseline if no interactions

  // Recency (40% weight): Days since last interaction
  const lastInteraction = interactions[0].interaction_date;
  const daysSinceLastInteraction = Math.floor(
    (Date.now() - new Date(lastInteraction)) / (1000 * 60 * 60 * 24)
  );
  // decays 2 points per day
  const recencyScore = Math.max(0, 100 - (daysSinceLastInteraction * 2));

  // Frequency (35% weight): Interactions per month (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentInteractions = interactions.filter(
    i => new Date(i.interaction_date) > thirtyDaysAgo
  ).length;
  // caps at 10 interactions (100 points)
  const frequencyScore = Math.min(100, recentInteractions * 10);

  // Depth (25% weight): Weighted by interaction type
  const typeWeights = { call: 1.0, meeting: 1.0, email: 0.5, message: 0.3, lunch: 1.0, video: 1.0, other: 0.5 };
  const totalWeight = interactions
    .slice(0, 10) // analyze the last 10 interactions
    .reduce((sum, i) => sum + (typeWeights[i.type] || 0.5), 0);
  
  const depthScore = Math.min(100, (totalWeight / 10) * 100);

  const healthScore = Math.round(
    (recencyScore * 0.4) +
    (frequencyScore * 0.35) +
    (depthScore * 0.25)
  );

  return healthScore;
}

module.exports = { computeHealthScore };
