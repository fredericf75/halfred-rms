const express = require('express');
const cors = require('cors');
const nunjucks = require('nunjucks');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();

// Nunjucks templating
nunjucks.configure(path.join(__dirname, '../templates'), {
  autoescape: true,
  express: app,
});
app.set('view engine', 'html');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Static files
app.use('/static', express.static(path.join(__dirname, '../static')));

// Web UI routes (must come before API to catch /)
const webRoutes = require('./routes/web');
app.use('/', webRoutes);

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
