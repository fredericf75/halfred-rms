# RMS Implementation Quick-Start Guide

**For:** Antigravity Team  
**Status:** Ready for Implementation  
**Estimated Dev Time:** 3-4 weeks (MVP)

---

## Phase 1: MVP (Weeks 1-2)

### Goals
- ✅ Complete database schema
- ✅ Basic CRUD API endpoints for contacts
- ✅ Task-contact linking
- ✅ Integration with halfred-tasks

### Setup

```bash
# 1. Initialize repo
git clone <rms-repo>
cd rms
npm install

# 2. Install Python dependencies (for embeddings module)
pip install sentence-transformers numpy
# (JS alternative: @xenova/transformers — same model, runs in Node.js)

# 3. Environment setup
cat > .env << EOF
DATABASE_URL=sqlite:///rms.db
PORT=3333
NODE_ENV=development
HALFRED_TASKS_URL=http://localhost:3334
SECRET_KEY=your-secret-key
EOF

# 3. Database migrations
npx knex migrate:make initial_schema
# Edit migrations/xxx_initial_schema.js with tables from spec

npx knex migrate:latest

# 4. Seed sample data (optional)
npx knex seed:make dev_data
npm run seed
```

### Core Implementation Tasks

#### Task 1.1: Database Schema (Day 1)
```javascript
// knex migration file
exports.up = async (knex) => {
  // Create contacts table
  await knex.schema.createTable('contacts', (table) => {
    table.text('id').primary();
    table.text('name').notNullable();
    table.text('email');
    table.text('phone');
    table.enum('relationship_type', [
      'friend', 'family', 'colleague', 'acquaintance'
    ]);
    table.enum('status', ['active', 'dormant', 'archived']).defaultTo('active');
    table.date('date_met');
    table.datetime('last_interaction_date');
    table.text('last_interaction_type');
    table.integer('health_score').defaultTo(50);
    table.integer('check_in_interval_days');
    table.date('next_check_in_date');
    table.text('notes');
    table.text('preferred_contact_method');
    table.text('time_zone');
    table.json('tags');
    table.json('custom_fields');
    table.timestamps(true, true);
  });

  // Indexes
  await knex.schema.table('contacts', (table) => {
    table.index('name');
    table.index('status');
    table.index('last_interaction_date');
    table.index('next_check_in_date');
  });

  // Similar for other tables...
  // interaction_log, relationship_notes, task_contact_link, reminders
};

exports.down = async (knex) => {
  // Drop tables
};
```

#### Task 1.2: Express API Scaffold (Day 1-2)
```javascript
// src/server.js
const express = require('express');
const cors = require('cors');
const knex = require('knex');

const app = express();
app.use(express.json());
app.use(cors());

// Routes
const contactRoutes = require('./routes/contacts');
const interactionRoutes = require('./routes/interactions');
const linkRoutes = require('./routes/task-links');

app.use('/api/v1/rms/contacts', contactRoutes);
app.use('/api/v1/rms/interactions', interactionRoutes);
app.use('/api/v1/rms/task-links', linkRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(process.env.PORT || 3333, () => {
  console.log(`RMS API running on port ${process.env.PORT}`);
});
```

#### Task 1.3: Contact CRUD Endpoints (Day 2-3)
```javascript
// src/routes/contacts.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /contacts
router.get('/', async (req, res) => {
  try {
    const { status, search, skip = 0, limit = 50 } = req.query;
    let query = db('contacts');

    if (status) query = query.where('status', status);
    if (search) {
      query = query.where((builder) => {
        builder
          .where('name', 'ilike', `%${search}%`)
          .orWhere('email', 'ilike', `%${search}%`);
      });
    }

    const total = await query.clone().count('* as count').first();
    const contacts = await query.skip(skip).limit(limit);

    res.json({
      contacts,
      total: total.count,
      skip: parseInt(skip),
      limit: parseInt(limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /contacts
router.post('/', async (req, res) => {
  try {
    const {
      name, email, phone, relationship_type,
      notes, tags, custom_fields
    } = req.body;

    const id = `contact_${Date.now()}`;
    const contact = {
      id,
      name,
      email,
      phone,
      relationship_type,
      notes,
      tags: JSON.stringify(tags || []),
      custom_fields: JSON.stringify(custom_fields || {}),
      status: 'active',
      health_score: 50,
      created_at: new Date(),
      updated_at: new Date()
    };

    await db('contacts').insert(contact);
    res.status(201).json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /contacts/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await db('contacts').where('id', id).first();

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Get interactions
    const interactions = await db('interaction_log')
      .where('contact_id', id)
      .orderBy('interaction_date', 'desc');

    // Get notes
    const notes = await db('relationship_notes')
      .where('contact_id', id);

    // Get linked tasks
    const linkedTasks = await db('task_contact_link')
      .where('contact_id', id);

    // Get reminders
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
    res.status(500).json({ error: error.message });
  }
});

// PATCH /contacts/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updated_at: new Date() };

    await db('contacts').where('id', id).update(updates);
    const contact = await db('contacts').where('id', id).first();

    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;

    if (permanent === 'true') {
      // Hard delete
      await db('contacts').where('id', id).delete();
      res.json({ message: 'Contact deleted' });
    } else {
      // Soft delete
      await db('contacts').where('id', id).update({
        status: 'archived',
        updated_at: new Date()
      });
      res.json({ message: 'Contact archived' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

#### Task 1.4: Task-Contact Linking (Day 3)
```javascript
// src/routes/task-links.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');

// POST /task-links
router.post('/', async (req, res) => {
  try {
    const { task_id, contact_id, link_type, context } = req.body;

    // Verify contact exists
    const contact = await db('contacts').where('id', contact_id).first();
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Create link
    const id = `link_${Date.now()}`;
    await db('task_contact_link').insert({
      id,
      task_id,
      contact_id,
      link_type,
      context,
      created_at: new Date()
    });

    res.status(201).json({ id, task_id, contact_id, link_type, context });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /task-links?task_id=xxx
router.get('/', async (req, res) => {
  try {
    const { task_id } = req.query;

    const links = await db('task_contact_link')
      .where('task_id', task_id)
      .join('contacts', 'task_contact_link.contact_id', 'contacts.id')
      .select('task_contact_link.*', 'contacts.name', 'contacts.email', 
              'contacts.phone', 'contacts.last_interaction_date', 
              'contacts.preferred_contact_method');

    res.json({
      task_id,
      contacts: links.map(link => ({
        contact_id: link.contact_id,
        name: link.name,
        email: link.email,
        phone: link.phone,
        link_type: link.link_type,
        context: link.context,
        last_interaction_date: link.last_interaction_date,
        preferred_contact_method: link.preferred_contact_method
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /contacts/:id/linked-tasks
router.get('/contacts/:contact_id/linked-tasks', async (req, res) => {
  try {
    const { contact_id } = req.params;

    const links = await db('task_contact_link')
      .where('contact_id', contact_id);

    res.json({
      contact_id,
      linked_tasks: links
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /task-links/:task_id/:contact_id
router.delete('/:task_id/:contact_id', async (req, res) => {
  try {
    const { task_id, contact_id } = req.params;

    await db('task_contact_link')
      .where('task_id', task_id)
      .where('contact_id', contact_id)
      .delete();

    res.json({ message: 'Link removed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

#### Task 1.5: Integration Tests (Day 3-4)
```javascript
// tests/contacts.test.js
const request = require('supertest');
const app = require('../src/server');
const db = require('../src/db');

describe('Contacts API', () => {
  beforeAll(async () => {
    await db.migrate.latest();
  });

  afterEach(async () => {
    await db('contacts').del();
  });

  test('POST /contacts creates a contact', async () => {
    const res = await request(app)
      .post('/api/v1/rms/contacts')
      .send({
        name: 'Trosa',
        email: 'trosa@example.com',
        phone: '+1-555-0123',
        relationship_type: 'friend'
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Trosa');
    expect(res.body.email).toBe('trosa@example.com');
  });

  test('GET /contacts returns contacts', async () => {
    // Insert test contact
    await db('contacts').insert({
      id: 'test_1',
      name: 'Trosa',
      email: 'trosa@example.com'
    });

    const res = await request(app).get('/api/v1/rms/contacts');

    expect(res.status).toBe(200);
    expect(res.body.contacts.length).toBeGreaterThan(0);
  });

  // More tests...
});
```

---

## Phase 2: Core Features (Weeks 3)

### Goals
- ✅ Interaction logging
- ✅ Relationship notes
- ✅ Reminders system
- ✅ Health score calculation

### Implementation Tasks

#### Task 2.1: Interaction Logging Endpoints
```javascript
// src/routes/interactions.js
router.post('/contacts/:contact_id/interactions', async (req, res) => {
  const { contact_id } = req.params;
  const {
    type, subject, summary, notes,
    interaction_date, duration_minutes, related_task_id
  } = req.body;

  const id = `interaction_${Date.now()}`;
  await db('interaction_log').insert({
    id,
    contact_id,
    type,
    subject,
    summary,
    notes,
    interaction_date: new Date(interaction_date),
    duration_minutes,
    related_task_id,
    created_at: new Date()
  });

  // Update contact's last_interaction_date
  await db('contacts')
    .where('id', contact_id)
    .update({ last_interaction_date: new Date(interaction_date) });

  res.status(201).json({ id, contact_id, type, interaction_date });
});
```

#### Task 2.2: Health Score Calculation
```javascript
// src/utils/healthScore.js
async function computeHealthScore(contactId) {
  const contact = await db('contacts').where('id', contactId).first();
  const interactions = await db('interaction_log')
    .where('contact_id', contactId)
    .orderBy('interaction_date', 'desc');

  if (interactions.length === 0) return 50; // Default

  // Recency (40%): Days since last interaction
  const lastInteraction = interactions[0].interaction_date;
  const daysSinceLastInteraction = Math.floor(
    (Date.now() - new Date(lastInteraction)) / (1000 * 60 * 60 * 24)
  );
  const recencyScore = Math.max(0, 100 - (daysSinceLastInteraction * 2));

  // Frequency (35%): Interactions per month
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentInteractions = interactions.filter(
    i => new Date(i.interaction_date) > thirtyDaysAgo
  ).length;
  const frequencyScore = Math.min(100, recentInteractions * 10);

  // Depth (25%): Weighted by interaction type
  const typeWeights = { call: 1.0, meeting: 1.0, email: 0.5, message: 0.3 };
  const totalWeight = interactions
    .slice(0, 10)
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
```

#### Task 2.3: Reminders Endpoints
```javascript
router.post('/reminders', async (req, res) => {
  const { contact_id, type, scheduled_date, message } = req.body;

  const id = `reminder_${Date.now()}`;
  await db('reminders').insert({
    id,
    contact_id,
    type,
    scheduled_date: new Date(scheduled_date),
    message,
    status: 'pending',
    created_at: new Date()
  });

  res.status(201).json({ id, contact_id, type, scheduled_date });
});

router.get('/reminders', async (req, res) => {
  const { status = 'pending', contact_id } = req.query;

  let query = db('reminders').where('status', status);

  if (contact_id) {
    query = query.where('contact_id', contact_id);
  }

  const reminders = await query
    .join('contacts', 'reminders.contact_id', 'contacts.id')
    .select('reminders.*', 'contacts.name');

  res.json({ reminders });
});
```

---

## Phase 3: Polish & Integration (Week 4)

### Goals
- ✅ Error handling & validation
- ✅ Input sanitization
- ✅ API documentation (OpenAPI)
- ✅ Performance optimization
- ✅ halfred-tasks integration testing

### Key Implementation Details

#### Error Handling Middleware
```javascript
// src/middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.status === 404) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (err.message.includes('duplicate key')) {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
```

#### Input Validation
```javascript
// src/middleware/validate.js
const { body, validationResult } = require('express-validator');

const validateContact = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').optional().isEmail().withMessage('Invalid email'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

module.exports = { validateContact };
```

#### OpenAPI Documentation
```javascript
// src/swagger.js
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Relationship Management System API',
    version: '1.0.0',
    description: 'API for managing contacts and relationships'
  },
  servers: [
    { url: 'http://localhost:3333', description: 'Local' },
    { url: 'https://rms.example.com', description: 'Production' }
  ],
  paths: {
    '/api/v1/rms/contacts': {
      get: {
        summary: 'List contacts',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'skip', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ],
        responses: {
          '200': { description: 'List of contacts' }
        }
      }
      // ... more endpoints
    }
  }
};

module.exports = { swaggerUi, swaggerSpec };
```

---

## Testing Checklist

### Unit Tests
- [ ] Contact CRUD operations
- [ ] Task linking
- [ ] Health score calculation
- [ ] Reminder generation
- [ ] Input validation

### Integration Tests
- [ ] Contact + Interactions workflow
- [ ] Task-contact linking bidirectional
- [ ] Interaction logging updates contact metadata
- [ ] Soft delete vs hard delete

### API Contract Tests
- [ ] halfred-tasks can query linked contacts
- [ ] RMS can query halfred-tasks for task metadata
- [ ] Webhook payloads are valid

### Performance Tests
- [ ] GET /contacts with 1000+ records (< 200ms)
- [ ] Batch task-link queries (< 500ms)
- [ ] Health score recomputation (< 1s per contact)

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] API documentation generated
- [ ] Error monitoring configured (Sentry, etc.)

### Deployment (Local)
```bash
# Start server
npm start
# RMS running at http://localhost:3333
```

### Post-Deployment
- [ ] Health check endpoints responding
- [ ] Database connectivity verified
- [ ] API documentation accessible
- [ ] Error logs monitored
- [ ] Performance metrics tracked

---

## Monitoring & Maintenance

### Key Metrics
```javascript
// prometheus metrics
const promClient = require('prom-client');

const apiLatency = new promClient.Histogram({
  name: 'rms_api_latency_ms',
  help: 'API endpoint latency',
  labelNames: ['method', 'endpoint']
});

const contactCount = new promClient.Gauge({
  name: 'rms_contacts_total',
  help: 'Total number of contacts'
});

const interactionCount = new promClient.Counter({
  name: 'rms_interactions_created',
  help: 'Interactions created'
});
```

### Logging
```javascript
// winston logger
const logger = require('winston');

logger.info('Contact created', { contact_id, user_id });
logger.error('Database error', { error: err.message, query: sql });
```

### Alerting
- [ ] API response time > 500ms
- [ ] Error rate > 5%
- [ ] Database connection failures
- [ ] Disk space low

---

## Timeline Summary

```
Week 1-2: MVP
├─ Database schema ..................... Day 1
├─ Express scaffolding ............. Day 1-2
├─ Contact CRUD .................... Day 2-3
├─ Task-contact linking .............. Day 3
└─ Integration tests ............... Day 3-4

Week 3: Core Features
├─ Interaction logging ................ Day 1
├─ Relationship notes ................. Day 1
├─ Health score calculation ........... Day 2
├─ Reminders system ................... Day 2
└─ End-to-end testing .............. Day 2-3

Week 4: Polish & Deploy
├─ Error handling ..................... Day 1
├─ Input validation ................... Day 1
├─ OpenAPI documentation .............. Day 2
├─ Performance optimization ........... Day 2
├─ halfred-tasks integration .......... Day 3
└─ Deployment & monitoring ............ Day 3
```

---

## Estimated Effort

| Component | Est. Hours | Confidence |
|-----------|-----------|-----------|
| Database design & migrations | 8 | High |
| Contact CRUD + tests | 16 | High |
| Task-contact linking | 12 | High |
| Interactions & notes | 12 | Medium |
| Reminders & health score | 16 | Medium |
| Error handling & validation | 8 | High |
| Documentation & OpenAPI | 8 | High |
| Integration with halfred-tasks | 16 | Medium |
| **Total** | **96 hours** | **~3 weeks** |

---

## Resources & References

### Key Files
- Full Spec: `RELATIONSHIP_MANAGEMENT_SPEC.md`
- Architecture Diagrams: `RMS_ARCHITECTURE_DIAGRAMS.md`
- API Reference: (auto-generated OpenAPI)

### External Resources
- better-sqlite3 Docs: https://github.com/WiseLibs/better-sqlite3
- Express.js Guide: https://expressjs.com/
- Knex.js Query Builder: https://knexjs.org/
- Jest Testing: https://jestjs.io/

### Slack Channel / Communication
- #rms-development (for team sync)
- #rms-releases (for deployment notes)

---

Good luck! 🚀 Reach out if you need clarification on any component.
