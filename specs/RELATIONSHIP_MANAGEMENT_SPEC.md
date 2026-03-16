# Relationship Management System (RMS) - Technical Specification

**Status:** Specification | **Version:** 1.0 | **Target:** Antigravity Team Implementation  
**Context:** Frederic currently stores contact info in halfred-tasks notes; RMS provides a dedicated, portable solution with bidirectional task linking.

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Integration with halfred-tasks](#integration-with-halfred-tasks)
5. [Data Model & Bidirectional References](#data-model--bidirectional-references)
6. [Implementation Notes & Gotchas](#implementation-notes--gotchas)
7. [Tech Stack](#tech-stack)
8. [Deployment & Portability](#deployment--portability)

---

## Overview

### Purpose

Replace ad-hoc contact storage (currently in halfred-tasks notes) with a dedicated, queryable Relationship Management System that:

- Maintains a single source of truth for contact information
- Logs all interactions (emails, calls, meetings) with metadata
- Tracks relationship health and status
- Provides reminders for relationship maintenance ("check in with X")
- Links bidirectionally with tasks in halfred-tasks to avoid duplication

### Architectural Principles

- **Separation of Concerns:** RMS and halfred-tasks are separate databases but communicate via clean APIs
- **Portable-First:** Embeddable, works offline, stores locally
- **Lean Data Model:** No redundancy; contacts are linked, not cloned
- **Explicit Linking:** Task-contact associations are queryable and maintainable

---

## Database Schema

### Core Tables

#### 1. `contacts`

Stores contact records with metadata and relationship context.

```sql
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,                    -- UUID or "contact_<timestamp>"
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  
  -- Relationship metadata
  relationship_type TEXT,                 -- "friend", "family", "colleague", "acquaintance", etc.
  status TEXT DEFAULT 'active',           -- "active", "dormant", "archived"
  date_met DATE,
  last_interaction_date DATETIME,
  last_interaction_type TEXT,             -- "email", "call", "meeting", "message", etc.
  
  -- Health & reminders
  health_score INTEGER DEFAULT 50,        -- 0-100: relationship strength
  check_in_interval_days INTEGER,         -- Suggested reminder frequency (null = no auto-reminders)
  next_check_in_date DATE,                -- Computed or manually set
  
  -- Context & preferences
  notes TEXT,                             -- Rich text: preferences, history, family info
  preferred_contact_method TEXT,          -- "email", "phone", "meeting", "message"
  time_zone TEXT,                         -- For reminder scheduling
  
  -- Metadata
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tags TEXT,                              -- JSON array: ["close-friend", "mentor", "client"]
  custom_fields JSON,                     -- Extensible: {"nickname": "T", "birthday": "1985-06-15"}
  embedding TEXT                          -- JSON float array from all-MiniLM-L6-v2
);

-- Indexes
CREATE INDEX idx_contacts_name ON contacts(name);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_last_interaction ON contacts(last_interaction_date DESC);
CREATE INDEX idx_contacts_next_check_in ON contacts(next_check_in_date);
```

#### 2. `interaction_log`

Immutable log of all interactions with a contact.

```sql
CREATE TABLE interaction_log (
  id TEXT PRIMARY KEY,                    -- UUID
  contact_id TEXT NOT NULL,
  type TEXT NOT NULL,                     -- "email", "call", "meeting", "message", "video", "lunch", etc.
  
  -- Content & metadata
  subject TEXT,                           -- Email subject, meeting title, etc.
  summary TEXT,                           -- 1-3 sentences of what happened
  notes TEXT,                             -- Detailed notes (rich text)
  
  -- Timing
  interaction_date DATETIME NOT NULL,
  duration_minutes INTEGER,               -- For calls/meetings
  
  -- Cross-references
  external_id TEXT,                       -- Gmail message ID, Slack timestamp, etc. (if applicable)
  related_task_id TEXT,                   -- FK to halfred_tasks.id (if applicable)
  
  -- Metadata
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tags TEXT,                              -- JSON array: ["urgent", "follow-up-needed"]
  embedding TEXT,                         -- JSON float array from all-MiniLM-L6-v2
  
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_interaction_log_contact ON interaction_log(contact_id);
CREATE INDEX idx_interaction_log_date ON interaction_log(interaction_date DESC);
CREATE INDEX idx_interaction_log_type ON interaction_log(type);
```

#### 3. `relationship_notes`

Structured storage for preferences, history, and family info (versioned for audit trail).

```sql
CREATE TABLE relationship_notes (
  id TEXT PRIMARY KEY,                    -- UUID
  contact_id TEXT NOT NULL,
  
  category TEXT NOT NULL,                 -- "family", "preferences", "history", "goals", "notes"
  content TEXT NOT NULL,                  -- Rich markdown content
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER DEFAULT 1,
  
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_notes_contact ON relationship_notes(contact_id);
CREATE INDEX idx_notes_category ON relationship_notes(contact_id, category);
```

#### 4. `task_contact_link` (Bidirectional Linking)

Junction table linking tasks from halfred_tasks to contacts in RMS.

```sql
CREATE TABLE task_contact_link (
  id TEXT PRIMARY KEY,                    -- UUID
  task_id TEXT NOT NULL,                  -- Reference to halfred_tasks.id (NOT a FK - separate DB)
  contact_id TEXT NOT NULL,
  
  -- Link metadata
  link_type TEXT,                         -- "primary", "related", "mentioned", "assigned-to"
  context TEXT,                           -- Why this contact is linked to this task
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  
  UNIQUE(task_id, contact_id)             -- Prevent duplicate links
);

-- Indexes
CREATE INDEX idx_task_contact_link_task ON task_contact_link(task_id);
CREATE INDEX idx_task_contact_link_contact ON task_contact_link(contact_id);
```

#### 5. `reminders`

Automated reminders to check in with contacts.

```sql
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,                    -- UUID
  contact_id TEXT NOT NULL,
  
  type TEXT NOT NULL,                     -- "check_in", "birthday", "anniversary", "custom"
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,                    -- NULL = all-day
  
  status TEXT DEFAULT 'pending',          -- "pending", "sent", "snoozed", "dismissed"
  snoozed_until DATE,                     -- If snoozed, when to re-surface
  
  message TEXT,                           -- Custom message or template
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_reminders_contact ON reminders(contact_id);
CREATE INDEX idx_reminders_scheduled ON reminders(scheduled_date, status);
```

### Summary of All Tables

| Table | Purpose | Key Relationships | Notable Columns |
|-------|---------|-------------------|-----------------|
| `contacts` | Contact records with metadata | PK for all other tables | `embedding TEXT` (nullable JSON blob) |
| `interaction_log` | Immutable log of interactions | FK: contacts.id; optional: halfred_tasks.id | `embedding TEXT` (nullable JSON blob) |
| `relationship_notes` | Versioned notes (family, preferences, history) | FK: contacts.id | — |
| `task_contact_link` | Bidirectional linking to halfred_tasks | FK: contacts.id; soft FK: halfred_tasks.id | — |
| `reminders` | Scheduled check-in reminders | FK: contacts.id | — |

---

## API Endpoints

### Base Path
```
/api/v1/rms
```

### Contact Management

#### `GET /api/v1/rms/contacts`
Retrieve all contacts (with optional filtering and pagination).

**Query Parameters:**
- `status` (string, optional): Filter by status ("active", "dormant", "archived")
- `relationship_type` (string, optional): Filter by relationship type
- `tags` (string, optional): Filter by tag (comma-separated)
- `search` (string, optional): Full-text search on name, email, phone
- `skip` (integer, default 0): Pagination offset
- `limit` (integer, default 50): Pagination limit

**Response:**
```json
{
  "contacts": [
    {
      "id": "contact_1706543200",
      "name": "Trosa",
      "email": "trosa@example.com",
      "phone": "+1-555-0123",
      "relationship_type": "friend",
      "status": "active",
      "health_score": 72,
      "last_interaction_date": "2026-03-10T14:30:00Z",
      "last_interaction_type": "call",
      "next_check_in_date": "2026-03-20",
      "tags": ["close-friend", "mentor"],
      "linked_tasks_count": 3
    }
  ],
  "total": 45,
  "skip": 0,
  "limit": 50
}
```

#### `POST /api/v1/rms/contacts`
Create a new contact.

**Request Body:**
```json
{
  "name": "Trosa",
  "email": "trosa@example.com",
  "phone": "+1-555-0123",
  "relationship_type": "friend",
  "preferred_contact_method": "email",
  "check_in_interval_days": 14,
  "time_zone": "America/New_York",
  "notes": "Met at conference 2025. Interested in ML. Prefers email for casual updates.",
  "tags": ["close-friend", "mentor"],
  "custom_fields": {
    "nickname": "T",
    "birthday": "1985-06-15"
  }
}
```

**Response:** `201 Created` with the created contact object.

#### `GET /api/v1/rms/contacts/{contact_id}`
Retrieve a single contact with all associated data.

**Response:**
```json
{
  "id": "contact_1706543200",
  "name": "Trosa",
  "email": "trosa@example.com",
  "phone": "+1-555-0123",
  "relationship_type": "friend",
  "status": "active",
  "date_met": "2025-06-15",
  "last_interaction_date": "2026-03-10T14:30:00Z",
  "last_interaction_type": "call",
  "health_score": 72,
  "check_in_interval_days": 14,
  "next_check_in_date": "2026-03-20",
  "notes": "...",
  "preferred_contact_method": "email",
  "time_zone": "America/New_York",
  "tags": ["close-friend", "mentor"],
  "custom_fields": {...},
  
  "interactions": [
    {
      "id": "interaction_abc123",
      "type": "call",
      "subject": "Career advice discussion",
      "summary": "Discussed ML roles and team dynamics.",
      "interaction_date": "2026-03-10T14:30:00Z",
      "duration_minutes": 45,
      "tags": ["follow-up-needed"]
    }
  ],
  
  "notes": [
    {
      "id": "notes_xyz",
      "category": "preferences",
      "content": "Prefers email for quick updates, calls for deep discussions."
    }
  ],
  
  "linked_tasks": [
    {
      "task_id": "task_123",
      "link_type": "primary",
      "context": "Schedule next check-in call"
    }
  ],
  
  "reminders": [
    {
      "id": "reminder_001",
      "type": "check_in",
      "scheduled_date": "2026-03-20",
      "status": "pending"
    }
  ]
}
```

#### `PATCH /api/v1/rms/contacts/{contact_id}`
Update a contact.

**Request Body:** (partial; any field can be updated)
```json
{
  "health_score": 78,
  "status": "active",
  "next_check_in_date": "2026-03-25",
  "notes": "Updated with recent conversation insights."
}
```

#### `DELETE /api/v1/rms/contacts/{contact_id}`
Archive or delete a contact (soft delete recommended; mark status as "archived").

**Query Parameters:**
- `permanent` (boolean, default false): If true, permanently delete (cascades to linked data)

### Interaction Logging

#### `POST /api/v1/rms/contacts/{contact_id}/interactions`
Log a new interaction.

**Request Body:**
```json
{
  "type": "call",
  "subject": "Career advice discussion",
  "summary": "Discussed recent ML projects and team structure.",
  "notes": "Detailed notes about what was discussed...",
  "interaction_date": "2026-03-10T14:30:00Z",
  "duration_minutes": 45,
  "related_task_id": "task_123",
  "tags": ["follow-up-needed", "urgent"]
}
```

**Response:** `201 Created` with the interaction object.

#### `GET /api/v1/rms/contacts/{contact_id}/interactions`
Retrieve all interactions for a contact (paginated).

**Query Parameters:**
- `type` (string, optional): Filter by interaction type
- `from_date` (ISO8601, optional): Start date
- `to_date` (ISO8601, optional): End date
- `skip`, `limit`: Pagination

#### `GET /api/v1/rms/contacts/{contact_id}/interactions/{interaction_id}`
Retrieve a single interaction.

#### `PATCH /api/v1/rms/contacts/{contact_id}/interactions/{interaction_id}`
Update an interaction (e.g., add notes, update summary).

### Relationship Notes

#### `POST /api/v1/rms/contacts/{contact_id}/notes`
Create or update a relationship note.

**Request Body:**
```json
{
  "category": "preferences",
  "content": "Prefers email for casual updates, calls for deep discussions. Birthday: June 15."
}
```

**Response:** `201 Created` with the note object.

#### `GET /api/v1/rms/contacts/{contact_id}/notes`
Retrieve all notes for a contact (grouped by category).

#### `GET /api/v1/rms/contacts/{contact_id}/notes/{category}`
Retrieve notes for a specific category.

#### `PATCH /api/v1/rms/contacts/{contact_id}/notes/{note_id}`
Update a note (creates a new version, keeps history).

### Task-Contact Linking

#### `POST /api/v1/rms/task-links`
Create a link between a task and a contact.

**Request Body:**
```json
{
  "task_id": "task_123",
  "contact_id": "contact_abc",
  "link_type": "primary",
  "context": "Implement ML recommendation system; Trosa is mentor/reviewer"
}
```

**Response:** `201 Created` with the link object.

#### `GET /api/v1/rms/task-links?task_id={task_id}`
Retrieve all contacts linked to a task.

**Response:**
```json
{
  "task_id": "task_123",
  "contacts": [
    {
      "contact_id": "contact_abc",
      "name": "Trosa",
      "email": "trosa@example.com",
      "phone": "+1-555-0123",
      "link_type": "primary",
      "context": "Mentor for this project",
      "last_interaction_date": "2026-03-10T14:30:00Z"
    }
  ]
}
```

#### `GET /api/v1/rms/contacts/{contact_id}/linked-tasks`
Retrieve all tasks linked to a contact.

**Response:**
```json
{
  "contact_id": "contact_abc",
  "name": "Trosa",
  "linked_tasks": [
    {
      "task_id": "task_123",
      "link_type": "primary",
      "context": "Mentor for ML implementation"
    }
  ]
}
```

#### `DELETE /api/v1/rms/task-links/{task_id}/{contact_id}`
Remove a task-contact link.

### Reminders & Health

#### `GET /api/v1/rms/reminders`
Retrieve pending reminders (with filtering).

**Query Parameters:**
- `status` (string, optional): "pending", "sent", "snoozed", "dismissed"
- `from_date`, `to_date`: Date range
- `contact_id` (string, optional): Filter by contact

**Response:**
```json
{
  "reminders": [
    {
      "id": "reminder_001",
      "contact_id": "contact_abc",
      "contact_name": "Trosa",
      "type": "check_in",
      "scheduled_date": "2026-03-20",
      "status": "pending",
      "message": "Check in with Trosa — last contact was 10 days ago."
    }
  ]
}
```

#### `POST /api/v1/rms/reminders`
Create a manual reminder.

**Request Body:**
```json
{
  "contact_id": "contact_abc",
  "type": "custom",
  "scheduled_date": "2026-03-25",
  "scheduled_time": "14:00",
  "message": "Call Trosa about conference"
}
```

#### `PATCH /api/v1/rms/reminders/{reminder_id}`
Update a reminder (e.g., snooze, mark as sent).

**Request Body:**
```json
{
  "status": "snoozed",
  "snoozed_until": "2026-04-01"
}
```

#### `POST /api/v1/rms/contacts/{contact_id}/compute-health`
Recompute health score for a contact based on interaction history.

**Response:**
```json
{
  "contact_id": "contact_abc",
  "health_score": 72,
  "calculation": {
    "interaction_frequency": 60,
    "last_contact_recency": 15,
    "interaction_depth": 85
  }
}
```

### Statistics & Analytics

#### `GET /api/v1/rms/stats`
Retrieve summary statistics.

**Response:**
```json
{
  "total_contacts": 45,
  "active_contacts": 38,
  "dormant_contacts": 5,
  "archived_contacts": 2,
  "total_interactions": 234,
  "interactions_this_month": 18,
  "average_health_score": 67,
  "contacts_needing_check_in": 12
}
```

#### `GET /api/v1/rms/contacts/{contact_id}/stats`
Retrieve stats for a single contact.

### Semantic Search

#### `GET /api/v1/rms/search?q={query}`
Semantic search across all contacts and interactions using vector similarity.

**Query Parameters:**
- `q` (string, required): Natural language query string
- `limit` (integer, default 20): Maximum results to return
- `min_score` (float, default 0.5): Minimum cosine similarity threshold

**How it works:**
1. Computes embedding of the query string using `sentence-transformers/all-MiniLM-L6-v2`
2. Scores all contacts and interactions via cosine similarity against stored embeddings
3. Returns merged, ranked results with type and score

**Response:**
```json
{
  "query": "moving company follow up",
  "results": [
    { "type": "contact", "id": "contact_abc", "name": "Trosa", "score": 0.91 },
    { "type": "interaction", "id": "interaction_xyz", "subject": "Trosa move date", "score": 0.87 }
  ]
}
```

**Implementation notes:**
- Embeddings are computed **on write** (create/update) for contacts and interactions
- On first search, any rows with `embedding IS NULL` are lazily embedded and saved
- Model loads once at server startup via `lru_cache` (or module-level singleton in JS)
- Cosine similarity computed in-process over all rows (sufficient for personal-scale data)

**Embedding text helpers:**
```python
from functools import lru_cache
from sentence_transformers import SentenceTransformer

@lru_cache(maxsize=1)
def get_model():
    return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

def embedding_text_for_contact(name, notes, relationship_type, tags):
    parts = [name]
    if relationship_type: parts.append(relationship_type)
    if notes: parts.append(notes)
    if tags: parts.append(tags)  # tags is a JSON array string
    return " ".join(parts)

def embedding_text_for_interaction(subject, summary, notes):
    parts = []
    if subject: parts.append(subject)
    if summary: parts.append(summary)
    if notes: parts.append(notes)
    return " ".join(parts)

def compute_embedding(text: str) -> str:
    """Returns JSON-serialized float array."""
    import json
    model = get_model()
    vector = model.encode(text).tolist()
    return json.dumps(vector)

def cosine_similarity(a, b):
    import math
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0
```

**JS equivalent (using `@xenova/transformers`):**
```javascript
import { pipeline } from '@xenova/transformers';
let _model = null;
async function getModel() {
  if (!_model) _model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return _model;
}
```

---

## Integration with halfred-tasks

### Architecture: Separate Databases, Clean API Contract

**Key Principle:** RMS and halfred-tasks are **separate systems** that communicate via well-defined APIs. No direct database dependencies.

### Integration Points

#### 1. **Task View → Show Linked Contacts**

When halfred-tasks displays a task, it queries RMS for linked contacts:

```
GET /api/v1/rms/task-links?task_id={task_id}
```

**Response used by halfred-tasks task view:**
```json
{
  "task_id": "task_123",
  "contacts": [
    {
      "contact_id": "contact_abc",
      "name": "Trosa",
      "email": "trosa@example.com",
      "phone": "+1-555-0123",
      "link_type": "primary",
      "context": "Mentor/Reviewer",
      "last_interaction_date": "2026-03-10T14:30:00Z",
      "preferred_contact_method": "email"
    }
  ]
}
```

**Rendering (in halfred-tasks UI):**
```
Task: "Implement ML recommendation system"
Status: In Progress
Priority: High

Linked Contacts:
  🧑 Trosa (mentor/reviewer)
     Email: trosa@example.com | Phone: +1-555-0123
     Last interaction: Mar 10 (call, 45 min)
     Preferred: Email
     Context: Mentor for ML implementation
```

#### 2. **Contact View → Show Linked Tasks**

When RMS displays a contact, it queries halfred-tasks API to fetch task metadata:

```
GET /api/v1/halfred-tasks/tasks?contact_id={contact_id}
```

OR (if halfred-tasks doesn't support this directly):

```
GET /api/v1/rms/contacts/{contact_id}/linked-tasks
  → Responds with task IDs
  → halfred-tasks queries its own DB for task metadata
```

**Response from RMS:**
```json
{
  "contact_id": "contact_abc",
  "name": "Trosa",
  "linked_tasks": [
    {
      "task_id": "task_123",
      "link_type": "primary",
      "context": "Mentor for ML implementation"
    }
  ]
}
```

**halfred-tasks then fetches full task details:**
```
GET /api/v1/halfred-tasks/tasks/task_123
```

#### 3. **Create Task → Link to Contact**

Workflow: Frederic creates a task in halfred-tasks and associates it with a contact.

**halfred-tasks POST /tasks request:**
```json
{
  "title": "Implement ML recommendation system",
  "description": "Core feature for v2.0",
  "priority": "high",
  "linked_contacts": [
    {
      "contact_id": "contact_abc",
      "link_type": "primary",
      "context": "Mentor/Reviewer for this project"
    }
  ]
}
```

**halfred-tasks, after creating the task, calls:**
```
POST /api/v1/rms/task-links
{
  "task_id": "task_123",
  "contact_id": "contact_abc",
  "link_type": "primary",
  "context": "Mentor/Reviewer for this project"
}
```

#### 4. **Log Interaction → Update Task if Linked**

When an interaction is logged with a contact (e.g., a call):

```
POST /api/v1/rms/contacts/{contact_id}/interactions
{
  "type": "call",
  "subject": "Project review",
  "interaction_date": "2026-03-15T10:00:00Z",
  "related_task_id": "task_123"
}
```

RMS creates the interaction and stores the `related_task_id` reference. This allows:
- Contact view → See "Related Task: task_123"
- Task view → See "Last interaction: Call on Mar 15 with Trosa"

#### 5. **Task Completion → Update Contact Health**

Optional: When a task linked to a contact is completed, RMS can recompute the contact's health score:

```
POST /api/v1/rms/contacts/{contact_id}/compute-health
```

(Triggered by halfred-tasks webhook or periodic sync)

### Data Consistency & Sync Strategy

#### Soft Consistency Model

- **No foreign keys across databases** (RMS doesn't directly FK to halfred_tasks.id)
- **Links are soft references:** `task_contact_link.task_id` is TEXT, not a hard FK
- **Resolution:** Always query the other system's API to verify existence

#### Sync Patterns

**Pattern A: Query-Time Resolution**
- Task view queries RMS API for linked contacts
- Contact view queries halfred-tasks API for linked task metadata
- ✅ Always consistent; ❌ More latency

**Pattern B: Webhook-Based Sync**
- halfred-tasks → POST /api/v1/rms/task-links on task creation
- halfred-tasks → DELETE /api/v1/rms/task-links on task deletion
- halfred-tasks → PATCH /api/v1/rms/task-links on task update
- ✅ Lower latency; ❌ Eventual consistency

**Recommended:** Start with Pattern A (query-time), migrate to Pattern B (webhooks) if latency becomes an issue.

### Error Handling

**Scenario: Contact is deleted, but a task still links to it**
```
GET /api/v1/halfred-tasks/tasks/task_123
  → Linked contacts: [contact_abc]
  
GET /api/v1/rms/task-links?task_id=task_123
  → 404: Linked contact not found
  
Response to halfred-tasks UI:
  "⚠️ Contact has been deleted (contact_abc). Unlink task?"
```

**Scenario: Task is deleted, but contact still shows the link**
```
GET /api/v1/rms/contacts/contact_abc/linked-tasks
  → Returns: [task_123]
  
halfred-tasks API query: GET /api/v1/halfred-tasks/tasks/task_123
  → 404: Task not found
  
Response to RMS UI:
  "⚠️ Linked task has been deleted. Remove link?"
```

---

## Data Model & Bidirectional References

### Reference Architecture

```
halfred-tasks DB                   RMS DB
┌──────────────────┐              ┌──────────────────┐
│ tasks            │              │ contacts         │
├──────────────────┤              ├──────────────────┤
│ id (PK)          │              │ id (PK)          │
│ title            │              │ name             │
│ description      │              │ email            │
│ ... (no contacts)│              │ phone            │
└──────────────────┘              │ ... (no tasks)   │
         ↑                         └──────────────────┘
         │                                 ↑
         │        ┌─────────────────────────┘
         │        │
         │        │ (foreign key)
         │        │
      ┌──────────────────────────────┐
      │ task_contact_link (in RMS)   │
      ├──────────────────────────────┤
      │ id                           │
      │ task_id (soft FK to tasks)   │ ← Points to halfred-tasks
      │ contact_id (FK to contacts)  │ ← Points to local RMS
      │ link_type                    │
      │ context                      │
      └──────────────────────────────┘
```

### Bidirectional Query Examples

#### Scenario 1: View a Task → Show Its Contacts

```
halfred-tasks: GET /tasks/task_123

UI calls: GET /api/v1/rms/task-links?task_id=task_123

RMS responds:
{
  "task_id": "task_123",
  "contacts": [
    {
      "contact_id": "contact_abc",
      "name": "Trosa",
      "email": "trosa@example.com",
      "link_type": "primary",
      ...
    }
  ]
}

UI displays:
📋 Task: Implement ML recommendation system
🧑 Linked Contacts:
   └─ Trosa (Primary Mentor)
```

#### Scenario 2: View a Contact → Show Its Tasks

```
rms: GET /contacts/contact_abc

UI calls: GET /api/v1/rms/contacts/contact_abc/linked-tasks

RMS responds:
{
  "contact_id": "contact_abc",
  "linked_tasks": [
    {
      "task_id": "task_123",
      "link_type": "primary",
      "context": "Mentor for this project"
    }
  ]
}

UI queries halfred-tasks for task metadata:
GET /api/v1/halfred-tasks/tasks/task_123

halfred-tasks responds:
{
  "id": "task_123",
  "title": "Implement ML recommendation system",
  "status": "in-progress",
  ...
}

UI displays:
👤 Contact: Trosa
📋 Linked Tasks:
   └─ [In Progress] Implement ML recommendation system
      (Mentor/Reviewer for this project)
```

#### Scenario 3: Create a Task with Contact Linking

```
halfred-tasks: POST /tasks
{
  "title": "Schedule follow-up",
  "description": "Follow up on recent conversation",
  "linked_contacts": [
    {
      "contact_id": "contact_abc",
      "link_type": "primary",
      "context": "Discuss career growth"
    }
  ]
}

halfred-tasks creates task, gets task_id = "task_124"

halfred-tasks calls: POST /api/v1/rms/task-links
{
  "task_id": "task_124",
  "contact_id": "contact_abc",
  "link_type": "primary",
  "context": "Discuss career growth"
}

RMS creates the link and returns 201.
```

### Avoiding Duplicate Data

**❌ WRONG: Storing contact info in task description**
```json
{
  "task_id": "task_123",
  "title": "Call Trosa",
  "description": "Call Trosa (trosa@example.com, +1-555-0123) about career advice"
}
```
Problem: Data is redundant. If Trosa's email changes, the task description is stale.

**✅ RIGHT: Linking to contact via task_contact_link**
```json
{
  "task_id": "task_123",
  "title": "Call Trosa",
  "description": "Discuss career advice"
}

// Linked contact:
GET /api/v1/rms/task-links?task_id=task_123
{
  "contacts": [
    {
      "contact_id": "contact_abc",
      "name": "Trosa",
      "email": "trosa@example.com",  // ← Always current
      "phone": "+1-555-0123"         // ← Always current
    }
  ]
}
```

---

## Semantic Search & Embeddings

### Overview

RMS uses the same vector embedding approach as **halfred-tasks** to enable natural language queries across contacts and interactions. This allows queries like:

- _"find contacts related to legal work"_
- _"search interactions mentioning moving"_
- _"show people I know in finance"_

Embeddings are generated via `sentence-transformers` (model: `all-MiniLM-L6-v2`), stored as JSON TEXT blobs in SQLite, and ranked at query time using cosine similarity — no external vector DB required.

### Embedding Text Composition

| Record Type | Text Used for Embedding |
|-------------|------------------------|
| `contacts` | `name + relationship_type + notes` |
| `interaction_log` | `subject + summary + notes` |

Fields are concatenated with spaces; null fields are skipped.

```python
# contacts
def embedding_text_for_contact(name, relationship_type, notes):
    parts = [p for p in [name, relationship_type, notes] if p]
    return " ".join(parts)

# interactions
def embedding_text_for_interaction(subject, summary, notes):
    parts = [p for p in [subject, summary, notes] if p]
    return " ".join(parts)
```

### Module: `embeddings.py`

Mirror the halfred-tasks pattern exactly:

```python
from __future__ import annotations

import json
import numpy as np
from functools import lru_cache
from typing import List


@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer("all-MiniLM-L6-v2")


def compute_embedding(text: str) -> List[float]:
    model = _get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


def cosine_similarity(a: List[float], b: List[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)
```

Key properties:
- **Lazy-loaded:** Model is only loaded on first use via `lru_cache(maxsize=1)`
- **Normalized embeddings:** `normalize_embeddings=True` makes cosine similarity equivalent to dot product
- **No GPU required:** `all-MiniLM-L6-v2` runs efficiently on CPU

### Embedding Lifecycle

Embeddings are computed (or recomputed) on **create and update**:

```python
# On contact create/update:
text = embedding_text_for_contact(contact.name, contact.relationship_type, contact.notes)
contact.embedding = json.dumps(compute_embedding(text))

# On interaction create/update:
text = embedding_text_for_interaction(interaction.subject, interaction.summary, interaction.notes)
interaction.embedding = json.dumps(compute_embedding(text))
```

Existing rows with `embedding = NULL` are silently skipped during search (treated as no match).

### API Endpoint: Semantic Search

#### `GET /api/v1/rms/search?q=...`

Semantic search across contacts **and** interactions, returns results ranked by cosine similarity.

**Query Parameters:**
- `q` (string, required): Natural language search query
- `limit` (integer, default 20): Max results to return
- `type` (string, optional): Filter to `"contacts"` or `"interactions"` only

**Example Request:**
```
GET /api/v1/rms/search?q=legal+work&limit=10
```

**Example Response:**
```json
{
  "query": "legal work",
  "results": [
    {
      "type": "contact",
      "id": "contact_abc123",
      "name": "Jane Smith",
      "relationship_type": "colleague",
      "score": 0.87,
      "snippet": "Corporate attorney, handles real estate contracts..."
    },
    {
      "type": "interaction",
      "id": "interaction_xyz789",
      "contact_id": "contact_abc123",
      "contact_name": "Jane Smith",
      "subject": "Contract review call",
      "score": 0.81,
      "interaction_date": "2026-02-14T10:00:00Z"
    }
  ],
  "total": 2
}
```

**Implementation sketch:**
```python
@app.get("/api/v1/rms/search")
def semantic_search(q: str, limit: int = 20, type: str = None):
    query_vec = compute_embedding(q)
    results = []

    if type in (None, "contacts"):
        for contact in db.execute("SELECT * FROM contacts WHERE embedding IS NOT NULL"):
            score = cosine_similarity(query_vec, json.loads(contact["embedding"]))
            results.append({"type": "contact", "score": score, **contact})

    if type in (None, "interactions"):
        for interaction in db.execute("SELECT * FROM interaction_log WHERE embedding IS NOT NULL"):
            score = cosine_similarity(query_vec, json.loads(interaction["embedding"]))
            results.append({"type": "interaction", "score": score, **interaction})

    results.sort(key=lambda r: r["score"], reverse=True)
    return {"query": q, "results": results[:limit], "total": len(results[:limit])}
```

---

## Implementation Notes & Gotchas

### 1. **Soft Foreign Keys & Dangling References**

**Problem:** `task_contact_link.task_id` references halfred_tasks, but you can't enforce a hard FK across databases.

**Solution:**
- On task deletion in halfred-tasks, **halfred-tasks must call RMS API** to remove the link:
  ```
  DELETE /api/v1/rms/task-links/{task_id}/*
  ```
- Alternatively, RMS runs a **periodic cleanup job** (daily/weekly) that queries halfred-tasks API to validate `task_id` existence, removes stale links
- Always handle `404` gracefully when a linked task doesn't exist

**Implementation checklist:**
- [ ] halfred-tasks DELETE /tasks/{id} calls RMS cleanup endpoint
- [ ] RMS GET /task-links validates task existence on every read
- [ ] UI gracefully handles missing linked contacts/tasks

### 2. **Interaction Logging with External Sources**

**Problem:** How do you log interactions that come from Gmail, Slack, etc.?

**Solution:**
- RMS stores `external_id` on interactions (Gmail message ID, Slack thread, etc.)
- Optional: **Webhook from Gmail/Slack** → RMS auto-creates interaction logs
- Manual logging via API for non-integrated sources
- Use `created_at` for system-created, allow override for backdated interactions

**Example workflow:**
```
1. Frederic receives email from Trosa
2. Gmail integration detects sender = trosa@example.com
3. Gmail → RMS webhook: POST /interactions for contact_abc
4. RMS logs interaction with external_id = gmail_message_id_xyz
5. Frederic can view in contact's interaction log + task view
```

### 3. **Timezone-Aware Reminders**

**Problem:** Reminder scheduled for "14:00" — in what timezone?

**Solution:**
- Store `time_zone` on contacts (e.g., "America/New_York")
- Store scheduled time as ISO8601 (e.g., "2026-03-20T14:00:00-04:00")
- When generating reminders, respect the contact's timezone
- Deliver reminders in contact's local time, but store in UTC

**Code example:**
```javascript
// Contact's preferred time: 2 PM in their timezone
const contactTz = contact.time_zone; // "America/Chicago"
const reminderTime = "14:00";

// Convert to UTC for storage
const utcTime = moment.tz(reminderTime, "HH:mm", contactTz).utc();

// When delivering, convert back to contact's TZ
const deliveryTime = utcTime.tz(contactTz);
```

### 4. **Health Score Calculation**

**Problem:** How do you compute "relationship health"?

**Solution:** Multi-factor scoring system:

```javascript
function computeHealthScore(contact, interactions) {
  const lastInteractionDaysAgo = daysSince(contact.last_interaction_date);
  const interactionsPerMonth = interactions.filter(i => 
    i.interaction_date > today() - 30 days
  ).length;
  
  const recencyScore = Math.max(0, 100 - (lastInteractionDaysAgo * 2));
  const frequencyScore = Math.min(100, interactionsPerMonth * 10);
  const depthScore = calculateInteractionDepth(interactions);
  
  return Math.round(
    (recencyScore * 0.4) +
    (frequencyScore * 0.35) +
    (depthScore * 0.25)
  );
}
```

**Configurable weights:**
- Recency (40%): How recent the last interaction
- Frequency (35%): How often you interact
- Depth (25%): Quality of interactions (e.g., calls > emails > messages)

### 5. **Reminder Deduplication**

**Problem:** Auto-reminders trigger multiple times if you miss one.

**Solution:**
- Mark reminders as "completed" after delivery
- Implement snooze → new reminder at future date
- Only generate one active reminder per contact per check-in cycle
- Query: `WHERE status = 'pending' AND contact_id = X AND type = 'check_in'` (should return ≤1 row)

### 6. **Data Portability**

**Problem:** Frederic wants portable-first; RMS must work offline.

**Solution:**
- Store RMS as **SQLite locally** — single file, no server needed, copy anywhere
- Keep `task_contact_link` table rebuildable from task metadata if needed
- Timestamped fields (`created_at`, `updated_at`) support conflict resolution if sync is ever added

### 7. **Versioning & API Stability**

**Problem:** What happens when halfred-tasks or RMS API changes?

**Solution:**
- **API versioning:** `/api/v1/rms/...` (enable v2 alongside v1)
- **Graceful degradation:** If RMS is unavailable, halfred-tasks UI hides linked contact section
- **Schema versioning:** Use migrations to evolve tables without breaking reads
- **Deprecation policy:** Announce API changes 2+ versions ahead

### 8. **Permissions & Multi-User (if needed)**

**Problem:** Should different contacts have different access levels?

**Solution (for future):**
- Add `visibility` column to contacts: "private", "shared", "public"
- Add `user_id` to all tables (if multi-user)
- Implement API-level access checks
- For now, assume single-user (Frederic); can be added later

### 9. **Task Auto-Linking**

**Problem:** Should RMS auto-detect and link tasks to contacts?

**Solution:**
- Implement **optional NLP-based detection:** Scan task title/description for contact names
- Manual review before linking (avoid false positives)
- Explicit API call is safer: halfred-tasks explicitly provides `linked_contacts` on task create/update

### 10. **Archival & Soft Deletes**

**Problem:** Deleting a contact cascades to lose interaction history.

**Solution:**
- Mark contacts as `status = 'archived'` instead of hard delete
- Hard delete only on explicit permanent removal
- Archive keeps interaction_log intact for audit trail

### 11. **Vector Embeddings for Semantic Search**

**Problem:** Keyword search misses semantic matches (e.g., "moving company" doesn't match "Trosa" who helped with a move).

**Solution:**
- Model: `sentence-transformers/all-MiniLM-L6-v2` (384-dim, fast, high quality)
- Storage: `embedding TEXT` column (JSON-serialized float array) on `contacts` and `interaction_log`
- Library: Python `sentence-transformers` or JS `@xenova/transformers`
- Similarity: cosine similarity

**Compute on write:** Every `POST /contacts`, `PATCH /contacts/:id`, `POST /interactions`, and `PATCH /interactions/:id` recomputes and stores the embedding.

**Lazy backfill:** On first call to `GET /search`, any row with `embedding IS NULL` is embedded in-place and saved before scoring.

**Model lifecycle:** Load model once at startup via `lru_cache` (Python) or a module-level promise (JS). Cold start ~1s; subsequent calls are fast.

**Checklist:**
- [ ] `embeddings.py` (or `embeddings.js`) module with `get_model()`, `compute_embedding()`, helpers
- [ ] Wire `compute_embedding()` into contact create/update routes
- [ ] Wire `compute_embedding()` into interaction create/update routes
- [ ] Implement `GET /api/v1/rms/search` with cosine scoring + lazy backfill

---

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (`better-sqlite3`, single file, zero config)
- **ORM:** better-sqlite3 (direct queries) or TypeORM (SQLite driver)
- **Deployment:** `npm start` — runs locally, no server or infrastructure required

**Implementation sketch:**
```javascript
// Node.js + SQLite + Express
const express = require('express');
const Database = require('better-sqlite3');

const db = new Database('rms.db');
const app = express();

app.get('/api/v1/rms/contacts', (req, res) => {
  const contacts = db.prepare('SELECT * FROM contacts').all();
  res.json(contacts);
});

app.post('/api/v1/rms/contacts', (req, res) => {
  const stmt = db.prepare(`
    INSERT INTO contacts (id, name, email, ...)
    VALUES (?, ?, ?, ...)
  `);
  const result = stmt.run(req.body.id, req.body.name, ...);
  res.status(201).json(result);
});
```

---

## Deployment & Portability

### Local Deployment (Frederic)

**Setup:**
```bash
# Clone RMS repo
git clone <rms-repo>
cd rms

# Install dependencies
npm install

# Create .env
cat > .env << EOF
DATABASE_URL=sqlite:///rms.db
PORT=3333
RMS_API_URL=http://localhost:3333
HALFRED_TASKS_URL=http://localhost:3334
EOF

# Initialize database
npm run migrate

# Start server
npm start
# → RMS running at http://localhost:3333
```

**Integration with halfred-tasks:**
```bash
# halfred-tasks .env
CONTACT_SERVICE_URL=http://localhost:3333
```

### Backup Strategy

```bash
# Copy SQLite file
cp rms.db rms.db.backup

# Or version in git (small file)
git add rms.db
git commit -m "RMS backup"
```

---

## Summary

| Component | Purpose | Tech |
|-----------|---------|------|
| **contacts** | Contact registry | SQLite |
| **interaction_log** | Immutable interaction history | SQLite |
| **relationship_notes** | Versioned preferences & context | SQLite |
| **task_contact_link** | Bidirectional task linking | SQLite |
| **reminders** | Scheduled check-ins | SQLite |
| **API** | REST endpoints | Express.js |
| **Embeddings** | Semantic search (contacts + interactions) | sentence-transformers / @xenova/transformers |
| **Deployment** | Local | npm start |

---

## Next Steps for Antigravity Team

1. **Review schema** — Verify all tables & indexes meet requirements
2. **Implement API endpoints** — Follow OpenAPI spec (can be auto-generated)
3. **Integration testing** — Test bidirectional linking with halfred-tasks
4. **Embeddings** — Wire sentence-transformers into contact/interaction create & update routes
5. **Deployment** — Deploy locally (`npm start`)
6. **Documentation** — Generate OpenAPI docs + client SDKs
7. **Monitoring** — Set up logging, error tracking, metrics

---

**Generated:** 2026-03-16  
**For:** Frederic & Antigravity Team  
**License:** Use freely for implementation
