const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

// Mock embeddings module to avoid loading ESM @xenova/transformers during tests
jest.mock('../src/utils/embeddings', () => ({
  computeEmbedding: jest.fn().mockResolvedValue('[0.1, 0.2, 0.3]'),
  embeddingTextForContact: jest.fn().mockReturnValue('dummy contact text'),
  embeddingTextForInteraction: jest.fn().mockReturnValue('dummy interaction text')
}));

describe('Contacts API', () => {
  let createdContactId;

  beforeAll(async () => {
    // Run migrations before all tests
    await db.migrate.latest();
  });

  afterAll(async () => {
    // Delete all test data
    await db('reminders').del();
    await db('task_contact_link').del();
    await db('relationship_notes').del();
    await db('interaction_log').del();
    await db('contacts').del();
    await db.destroy();
  });

  test('POST /api/v1/rms/contacts creates a contact', async () => {
    const res = await request(app)
      .post('/api/v1/rms/contacts')
      .send({
        name: 'Trosa Test',
        email: 'trosa@example.com',
        phone: '+1-555-0123',
        relationship_type: 'friend',
        tags: ['test']
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Trosa Test');
    expect(res.body.email).toBe('trosa@example.com');
    expect(res.body.id).toBeDefined();
    
    // Check if the embedding vector array JSON string was created
    expect(res.body.embedding).toBeDefined();

    createdContactId = res.body.id;
  });

  test('GET /api/v1/rms/contacts returns contacts', async () => {
    const res = await request(app).get('/api/v1/rms/contacts');

    expect(res.status).toBe(200);
    expect(res.body.contacts.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });
  
  test('GET /api/v1/rms/contacts/:id returns single contact details', async () => {
     const res = await request(app).get(`/api/v1/rms/contacts/${createdContactId}`);

     expect(res.status).toBe(200);
     expect(res.body.name).toBe('Trosa Test');
     expect(res.body.interactions).toBeDefined();
     expect(res.body.notes).toBeDefined();
     expect(res.body.linked_tasks).toBeDefined();
     expect(res.body.reminders).toBeDefined();
  });

  test('POST /api/v1/rms/contacts/:id/interactions creates an interaction log', async () => {
    const res = await request(app)
      .post(`/api/v1/rms/contacts/${createdContactId}/interactions`)
      .send({
        type: 'call',
        subject: 'Test Call',
        summary: 'Just a test call',
        interaction_date: new Date().toISOString(),
        duration_minutes: 30
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.subject).toBe('Test Call');
  });

  test('POST /api/v1/rms/task-links links a task', async () => {
     const res = await request(app)
      .post('/api/v1/rms/task-links')
      .send({
        task_id: 'task_001',
        contact_id: createdContactId,
        link_type: 'related',
        context: 'Testing links'
      });

     expect(res.status).toBe(201);
     expect(res.body.task_id).toBe('task_001');
     expect(res.body.contact_id).toBe(createdContactId);
  });
  
  test('GET /api/v1/rms/task-links?task_id returns linked contacts', async () => {
     const res = await request(app)
       .get('/api/v1/rms/task-links?task_id=task_001');
       
     expect(res.status).toBe(200);
     expect(res.body.contacts.length).toBe(1);
     expect(res.body.contacts[0].contact_id).toBe(createdContactId);
     expect(res.body.contacts[0].name).toBe('Trosa Test');
  });
});
