# RMS Architecture Diagrams & Visual Reference

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frederic's Workspace                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────┐          ┌──────────────────────────┐ │
│  │  halfred-tasks       │          │ Relationship Management  │ │
│  │  (Task Database)     │          │ System (RMS)             │ │
│  ├──────────────────────┤          ├──────────────────────────┤ │
│  │ SQLite               │          │ SQLite                   │ │
│  │                      │          │                          │ │
│  │ Tables:              │          │ Tables:                  │ │
│  │ - tasks              │          │ - contacts               │ │
│  │ - subtasks           │          │ - interaction_log        │ │
│  │ - tags               │          │ - relationship_notes     │ │
│  │ - projects           │          │ - task_contact_link ←────┼──┤ Bidirectional
│  │                      │          │ - reminders              │ │ Linking
│  └──────────────────────┘          └──────────────────────────┘ │
│         ↑         ↓                        ↑         ↓           │
│    REST API   REST API                REST API   REST API       │
│  (port 3334) (port 3333)             (port 3333)               │
│         ↓         ↑                        ↓         ↑           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  UI / Frontend                           │  │
│  │  (Desktop, Web, or CLI interfaces)                       │  │
│  │                                                          │  │
│  │  Task View:                Contact View:               │  │
│  │  ├─ Title                  ├─ Name                      │  │
│  │  ├─ Description            ├─ Email/Phone              │  │
│  │  └─ Linked Contacts ←──────├─ Linked Tasks             │  │
│  │     (inline display)       ├─ Interaction History      │  │
│  │                            └─ Check-in Reminders       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

```

---

## Database Relationship Diagram

```
┌─────────────────────┐
│   CONTACTS          │
├─────────────────────┤
│ id (PK)             │ ◄────────────────────┐
│ name                │                      │
│ email               │                      │ One-to-Many
│ phone               │                      │
│ relationship_type   │                      │
│ status              │        ┌─────────────┴──────────┐
│ health_score        │        │                        │
│ last_interaction    │        │                        │
│ next_check_in_date  │        │                        │
│ tags                │        │                        │
│ custom_fields       │        ▼                        ▼
└─────────────────────┘   ┌─────────────────┐  ┌───────────────┐
         ▲                │ INTERACTION_LOG │  │ RELATIONSHIP  │
         │                ├─────────────────┤  │ _NOTES        │
         │                │ id (PK)         │  ├───────────────┤
         │                │ contact_id (FK) │  │ id (PK)       │
         │                │ type            │  │ contact_id    │
         │                │ subject         │  │ (FK)          │
         │                │ summary         │  │ category      │
         │                │ interaction_    │  │ content       │
         │                │ date            │  │ version       │
         │                │ related_task_id │  └───────────────┘
         │                │ (soft FK)       │
         │                └─────────────────┘
         │
         │ One-to-Many
         │ (soft FK)
         │
┌────────┴──────────────┐
│ TASK_CONTACT_LINK     │
├──────────────────────┤
│ id (PK)              │
│ task_id              │────→ halfred_tasks.id (soft FK)
│ contact_id (FK)      │────→ contacts.id (hard FK)
│ link_type            │
│ context              │
│ created_at           │
└──────────────────────┘
         │
         │ One-to-Many
         │
         ▼
    ┌────────────────┐
    │   REMINDERS    │
    ├────────────────┤
    │ id (PK)        │
    │ contact_id(FK) │
    │ type           │
    │ scheduled_date │
    │ status         │
    │ message        │
    └────────────────┘
```

---

## Data Flow: Task → Contact Linking

### Creating a Task with Contact Links

```
┌─────────────────────────────────────────────────────────────┐
│ UI: Create Task Dialog                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Title: "Implement ML recommendation system"               │
│  Description: "Core feature for v2.0"                      │
│                                                              │
│  ┌──────────────────────────────────────────┐              │
│  │ Link Contacts:                           │              │
│  │ ☑ Trosa (Primary Mentor)                │              │
│  │ ☐ Sarah (Code Reviewer)                 │              │
│  └──────────────────────────────────────────┘              │
│  [Create Task] [Cancel]                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────┐
│ halfred-tasks: POST /tasks                                  │
│                                                              │
│ {                                                           │
│   "title": "Implement ML recommendation system",           │
│   "description": "Core feature for v2.0",                 │
│   "priority": "high",                                      │
│   "linked_contacts": [                                     │
│     {                                                      │
│       "contact_id": "contact_abc",                        │
│       "link_type": "primary",                             │
│       "context": "Primary mentor for this project"        │
│     }                                                      │
│   ]                                                        │
│ }                                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────┐
│ halfred-tasks: Creates task → task_id = "task_123"         │
│                                                              │
│ Then calls RMS:                                             │
│ POST /api/v1/rms/task-links                                │
│                                                              │
│ {                                                           │
│   "task_id": "task_123",                                  │
│   "contact_id": "contact_abc",                            │
│   "link_type": "primary",                                 │
│   "context": "Primary mentor for this project"            │
│ }                                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────┐
│ RMS: Creates task_contact_link entry                        │
│ Returns: 201 Created                                        │
│                                                              │
│ task_contact_link table:                                    │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ id: "link_xyz"                                       │   │
│ │ task_id: "task_123"                                  │   │
│ │ contact_id: "contact_abc"                            │   │
│ │ link_type: "primary"                                 │   │
│ │ context: "Primary mentor for this project"          │   │
│ │ created_at: 2026-03-16T12:00:00Z                    │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────────┐
│ halfred-tasks: Confirms task created                        │
│ Returns task_id to UI                                       │
│                                                              │
│ UI displays: "✓ Task created (ID: task_123)"              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow: View Task with Contact Details

### Task View with Inline Contact Info

```
┌─────────────────────────────────────────────────────────┐
│ User: Open Task "task_123"                              │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ halfred-tasks: GET /tasks/task_123                      │
│                                                         │
│ Response:                                               │
│ {                                                       │
│   "id": "task_123",                                    │
│   "title": "Implement ML recommendation system",       │
│   "description": "Core feature for v2.0",             │
│   "priority": "high",                                  │
│   "status": "in-progress"                             │
│ }                                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ Task View UI Logic:                                     │
│                                                         │
│ 1. Display task details (title, description, etc.)    │
│ 2. Query RMS for linked contacts:                     │
│    GET /api/v1/rms/task-links?task_id=task_123       │
│                                                         │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ RMS: GET /api/v1/rms/task-links?task_id=task_123      │
│                                                         │
│ Query task_contact_link & contacts:                   │
│ SELECT * FROM contacts                                │
│ WHERE id IN (                                          │
│   SELECT contact_id FROM task_contact_link            │
│   WHERE task_id = 'task_123'                          │
│ )                                                       │
│                                                         │
│ Response:                                               │
│ {                                                       │
│   "task_id": "task_123",                              │
│   "contacts": [                                        │
│     {                                                  │
│       "contact_id": "contact_abc",                    │
│       "name": "Trosa",                                │
│       "email": "trosa@example.com",                   │
│       "phone": "+1-555-0123",                         │
│       "link_type": "primary",                         │
│       "context": "Primary mentor for this project",   │
│       "last_interaction_date": "2026-03-10T14:30Z", │
│       "preferred_contact_method": "email"             │
│     }                                                  │
│   ]                                                    │
│ }                                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ Task View UI: Render                                    │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 📋 Implement ML recommendation system           │   │
│ │ Status: In Progress | Priority: High            │   │
│ │                                                 │   │
│ │ Description: Core feature for v2.0             │   │
│ │                                                 │   │
│ │ ─────────────────────────────────────────────── │   │
│ │ 🧑 Linked Contacts (1)                          │   │
│ │                                                 │   │
│ │   PRIMARY: Trosa                                │   │
│ │   ─────────────────────────────────────────     │   │
│ │   Role: Primary mentor for this project         │   │
│ │   Email: trosa@example.com                      │   │
│ │   Phone: +1-555-0123                            │   │
│ │   Preferred: Email                              │   │
│ │   Last contact: Mar 10 (call, 45 min)           │   │
│ │   [View Profile] [Log Interaction] [Message]    │   │
│ │                                                 │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│ ✅ Contact info is always current (linked, not cloned) │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow: View Contact with Linked Tasks

### Contact View with Inline Task Info

```
┌─────────────────────────────────────────────────────┐
│ User: Open Contact "contact_abc" (Trosa)            │
└─────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────┐
│ RMS: GET /api/v1/rms/contacts/contact_abc          │
│                                                     │
│ Response includes:                                  │
│ {                                                   │
│   "id": "contact_abc",                             │
│   "name": "Trosa",                                 │
│   "email": "trosa@example.com",                    │
│   "phone": "+1-555-0123",                          │
│   ... (other fields)                               │
│                                                     │
│   "linked_tasks": [                                │
│     {                                              │
│       "task_id": "task_123",                       │
│       "link_type": "primary",                      │
│       "context": "Mentor/Reviewer"                 │
│     },                                             │
│     {                                              │
│       "task_id": "task_456",                       │
│       "link_type": "related",                      │
│       "context": "Code review"                     │
│     }                                              │
│   ]                                                │
│ }                                                   │
│                                                     │
└─────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────┐
│ Contact View UI Logic:                              │
│                                                     │
│ For each linked task, query halfred-tasks:         │
│   GET /api/v1/halfred-tasks/tasks/task_123        │
│   GET /api/v1/halfred-tasks/tasks/task_456        │
│                                                     │
│ (Could batch this to reduce requests)              │
│                                                     │
└─────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────┐
│ halfred-tasks: Returns task metadata                │
│                                                     │
│ GET /tasks/task_123 →                              │
│ {                                                   │
│   "id": "task_123",                                │
│   "title": "Implement ML recommendation system",   │
│   "status": "in-progress",                         │
│   "priority": "high"                               │
│ }                                                   │
│                                                     │
│ GET /tasks/task_456 →                              │
│ {                                                   │
│   "id": "task_456",                                │
│   "title": "Code review: Auth module",            │
│   "status": "pending",                             │
│   "priority": "medium"                             │
│ }                                                   │
│                                                     │
└─────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────┐
│ Contact View UI: Render                             │
│                                                     │
│ ┌───────────────────────────────────────────────┐ │
│ │ 👤 Trosa                                      │ │
│ │ Email: trosa@example.com | +1-555-0123       │ │
│ │ Relationship: Friend | Status: Active         │ │
│ │ Health Score: 72/100 | Last Contact: Mar 10  │ │
│ │                                               │ │
│ │ ─────────────────────────────────────────────│ │
│ │ 📋 Linked Tasks (2)                           │ │
│ │                                               │ │
│ │ PRIMARY:                                      │ │
│ │ • [In Progress] Implement ML recommendation  │ │
│ │   system (Mentor/Reviewer)                    │ │
│ │   [Open in Tasks] [Log Interaction]          │ │
│ │                                               │ │
│ │ RELATED:                                      │ │
│ │ • [Pending] Code review: Auth module        │ │
│ │   (Code review) [Open in Tasks]              │ │
│ │                                               │ │
│ │ ─────────────────────────────────────────────│ │
│ │ 📞 Recent Interactions (5)                    │ │
│ │ • Mar 10: Call (45 min) - Career advice      │ │
│ │ • Mar 03: Email - Project update             │ │
│ │ • Feb 28: Meeting (60 min) - Team sync       │ │
│ │                                               │ │
│ └───────────────────────────────────────────────┘ │
│                                                     │
│ ✅ Task info is always current (queried, not      │
│    cloned from contact notes)                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## API Call Sequence Diagram

### Creating a Task with Contact Link

```
User                halfred-tasks              RMS
 │                      │                      │
 │──[1] Create Task──────>│                     │
 │   (with contacts)     │                     │
 │                       │                     │
 │                       │──[2] POST /tasks────>│
 │                       │                     │
 │                       │<──[3] task_id────────│
 │                       │                     │
 │                       │──[4] POST task-links>│
 │                       │   (task→contact)    │
 │                       │                     │
 │                       │<──[5] 201 Created───│
 │                       │                     │
 │<──[6] Task Created───│                     │
 │   (task_id + status)  │                     │
 │                       │                     │
```

### Viewing a Task with Linked Contacts

```
User                  halfred-tasks              RMS
 │                        │                      │
 │──[1] Open Task────────>│                      │
 │      (task_id)         │                      │
 │                        │                      │
 │<──[2] Task Details────│                      │
 │                        │                      │
 │                        │──[3] GET task-links─>│
 │                        │   (?task_id=X)       │
 │                        │                      │
 │                        │<──[4] Contact array──│
 │                        │   (email, phone,etc)│
 │                        │                      │
 │<──[5] Task + Contacts─│                      │
 │   (inline display)     │                      │
```

### Viewing a Contact with Linked Tasks

```
User                  RMS                   halfred-tasks
 │                     │                        │
 │──[1] Open Contact──>│                        │
 │      (contact_id)   │                        │
 │                     │                        │
 │<──[2] Contact Data──│                        │
 │  (+ linked_tasks)   │                        │
 │                     │                        │
 │                     │──[3] GET task IDs─────>│
 │                     │    (batch query)       │
 │                     │                        │
 │                     │<──[4] Task metadata────│
 │                     │    (status, title)     │
 │                     │                        │
 │<──[5] Contact +     │                        │
 │   Linked Tasks      │                        │
 │   (inline display)  │                        │
```

---

## Bidirectional Reference Pattern

### The Problem (Before RMS)

```
halfred-tasks.tasks table:
┌────────────────────────────────────────┐
│ id: "task_123"                         │
│ title: "Call Trosa"                    │
│ description: "Call Trosa               │
│              (trosa@example.com,       │
│               +1-555-0123) about       │
│              career advice"            │ ← REDUNDANT!
│                                        │   (data duplication)
└────────────────────────────────────────┘

Problem: If email changes → task stale
         Data lives in two places
         Hard to query tasks for a contact
```

### The Solution (With RMS)

```
Step 1: Separate Data
────────────────────────────────────────
halfred-tasks.tasks:              RMS.contacts:
┌─────────────────────┐          ┌──────────────────────┐
│ id: "task_123"      │          │ id: "contact_abc"    │
│ title: "Call Trosa" │          │ name: "Trosa"        │
│ description:        │          │ email: (current)     │
│   "Discuss career   │          │ phone: (current)     │
│    advice"          │          │ ... (always fresh)   │
└─────────────────────┘          └──────────────────────┘

Step 2: Link via Junction Table
────────────────────────────────────────
RMS.task_contact_link:
┌──────────────────────────┐
│ task_id: "task_123"      │ ──> points to task
│ contact_id: "contact_abc"│ ──> points to contact
│ context: "..."           │
└──────────────────────────┘

Step 3: Query at Runtime
────────────────────────────────────────
GET /api/v1/rms/task-links?task_id=task_123
  → Returns: contact_abc details (always current)
  
GET /api/v1/rms/contacts/contact_abc/linked-tasks
  → Returns: task_123 metadata
  
✅ Single source of truth
✅ No duplication
✅ Bidirectional queryable
```

---

## Health Score Calculation Visualization

```
Contact: Trosa

Last Interaction: 5 days ago
Recency Score = 100 - (5 × 2) = 90
Component Weight: 40%
Contribution: 90 × 0.40 = 36 points

Interactions This Month: 6
Frequency Score = min(100, 6 × 10) = 60
Component Weight: 35%
Contribution: 60 × 0.35 = 21 points

Interaction Depth: Calls > Emails > Messages
(6 calls, 3 emails, 2 messages recent)
Depth Score = 85 (weighted average)
Component Weight: 25%
Contribution: 85 × 0.25 = 21.25 points

────────────────────────────────────────
Total Health Score = 36 + 21 + 21.25 = 78.25 ≈ 78
```

---

## Error Handling Flows

### Linked Task Deleted

```
Contact View: "Linked Tasks"
GET /api/v1/rms/contacts/contact_abc/linked-tasks
  → Returns: [task_123, task_456]

UI queries: GET /api/v1/halfred-tasks/tasks/task_123
           ← 200 OK: Task exists

UI queries: GET /api/v1/halfred-tasks/tasks/task_456
           ← 404 NOT FOUND: Task deleted

UI renders:
┌────────────────────────────────┐
│ 📋 Linked Tasks (2)            │
│                                │
│ • [In Progress] Task 123       │
│                                │
│ • ⚠️ [DELETED] Task 456        │
│   [Remove Link] [View Archive] │
│                                │
└────────────────────────────────┘
```

### Linked Contact Deleted

```
Task View: "Linked Contacts"
GET /api/v1/rms/task-links?task_id=task_123
  → Returns: []
    (contact_abc no longer in RMS)

UI renders:
┌──────────────────────────────────┐
│ 🧑 Linked Contacts              │
│                                  │
│ ⚠️ One or more contacts were     │
│    deleted from RMS.            │
│    [View Link History] [Update]  │
│                                  │
└──────────────────────────────────┘
```

---

## Deployment Architecture Options

### Option 1: Local Only (Portable-First)

```
Frederic's Laptop
┌────────────────────────────────────────┐
│ RMS API (Express + SQLite)             │
│ Port: 3333                             │
│ Database: ~/rms.db (versionable)       │
│                                        │
│ halfred-tasks (Node + SQLite)          │
│ Port: 3334                             │
│ Database: ~/halfred-tasks.db           │
│                                        │
│ UI/CLI (local)                         │
│ Queries: localhost:3333, localhost:3334│
└────────────────────────────────────────┘
      (Offline-capable, fully portable)
```

---

## Summary Table: Components & Interactions

| Component | Database | Purpose | Ports |
|-----------|----------|---------|-------|
| **RMS API** | SQLite | Contact mgmt, interactions, linking | 3333 |
| **halfred-tasks** | SQLite | Task management | 3334 |
| **UI/Frontend** | None (client-side) | User interface | N/A |
| **Webhook Handler** | (Optional) | Task creation/deletion hooks | 3333 |

---

This visual reference should help Antigravity team understand the data flows and architectural decisions.
