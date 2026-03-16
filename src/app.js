const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const contactRoutes = require('./routes/contacts');
const interactionRoutes = require('./routes/interactions');
const linkRoutes = require('./routes/task-links');
const reminderRoutes = require('./routes/reminders');
app.use('/api/v1/rms/contacts', contactRoutes);
app.use('/api/v1/rms/interactions', interactionRoutes);
app.use('/api/v1/rms/task-links', linkRoutes);
app.use('/api/v1/rms/reminders', reminderRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  if (err.status === 404) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (err.message && err.message.includes('duplicate key')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }
  if (err.message && err.message.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
