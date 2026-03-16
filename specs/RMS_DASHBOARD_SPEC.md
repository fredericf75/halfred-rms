# RMS Dashboard Specification

**Status:** Specification | **Version:** 1.0 | **Target:** Antigravity Team Implementation  
**Context:** Web UI for the Relationship Management System. Look and feel mirrors halfred-tasks — same sidebar layout, section-based content, htmx for lightweight interactivity.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Layout & Navigation](#layout--navigation)
3. [Pages](#pages)
   - [Dashboard (Home)](#1-dashboard-home)
   - [Contacts List](#2-contacts-list)
   - [Contact Detail](#3-contact-detail)
   - [Add / Edit Contact](#4-add--edit-contact)
   - [Log Interaction](#5-log-interaction)
   - [Search](#6-search)
4. [Shared Components](#shared-components)
5. [Implementation Notes](#implementation-notes)

---

## Tech Stack

Mirrors halfred-tasks:

| Layer | Choice |
|-------|--------|
| Templating | Jinja2 (Python/FastAPI) or Nunjucks (Node/Express) |
| Interactivity | htmx (no JS framework) |
| CSS | Single `style.css` — reuse/extend halfred-tasks stylesheet |
| Icons | Inline SVG or emoji (consistent with halfred-tasks) |

---

## Layout & Navigation

### Sidebar

```
┌────────────────────────┐
│  🧑 Halfred RMS        │  ← brand
├────────────────────────┤
│  Dashboard             │
│  Contacts              │
│  Search                │
├────────────────────────┤
│  [search box]          │  ← semantic search input
├────────────────────────┤
│  RELATIONSHIP TYPES    │  ← dynamic sections (like sidebar projects)
│    Friends (8)         │
│    Colleagues (14)     │
│    Vendors (5)         │
│    Family (4)          │
├────────────────────────┤
│  + New Contact         │
└────────────────────────┘
```

Sidebar relationship type counts update on page load. Clicking a type filters the Contacts list.

### Top Header

Right side: nothing required for MVP (no user switcher needed unless multi-user is added later).

---

## Pages

### 1. Dashboard (Home)

**Route:** `GET /`

**Purpose:** At-a-glance view of what needs attention today.

**Sections (top to bottom):**

#### 🔔 Reminders Due
Contacts with reminders scheduled for today or overdue.

```
🔔 Reminders Due
──────────────────────────────────────────
  Trosa                   [check_in] overdue 2 days   [Done] [Snooze]
  Sarah Chen              [birthday] today             [Done] [Snooze]
──────────────────────────────────────────
```

- `[Done]` → marks reminder as completed (htmx, no page reload)
- `[Snooze]` → snoozes 3 days (htmx)
- If none: "No reminders due. 🎉"

#### 🩺 Needs Attention
Contacts with health score < 40 or last interaction > 30 days ago (whichever threshold is configured).

```
🩺 Needs Attention
──────────────────────────────────────────
  Marcus Webb     health: 28   last contact: 47 days ago   [Log Interaction]
  Priya Nair      health: 35   last contact: 38 days ago   [Log Interaction]
──────────────────────────────────────────
```

- `[Log Interaction]` → opens log interaction form inline (htmx) or navigates to contact detail

#### 🕐 Recently Contacted
Last 5 contacts with interactions in the past 7 days — quick confirmation things are moving.

```
🕐 Recently Contacted (last 7 days)
──────────────────────────────────────────
  Trosa            call · 2 days ago
  Harvey Specter   email · 4 days ago
  Sarah Chen       meeting · 6 days ago
──────────────────────────────────────────
```

Names link to contact detail.

---

### 2. Contacts List

**Route:** `GET /contacts`

**Purpose:** Browse and filter all contacts.

**Layout:** Table/list with filters at top.

```
Contacts                                          [+ New Contact]
──────────────────────────────────────────────────────────────────
Filter: [All Types ▾]  [All Statuses ▾]  [Search by name...]

  Name             Type         Health   Last Contact     Next Check-in
  ───────────────────────────────────────────────────────────────────
  Sarah Chen       colleague    ████░ 82  Mar 10          Mar 24
  Trosa            vendor       ███░░ 64  Mar 8           Mar 22
  Marcus Webb      friend       █░░░░ 28  Jan 28          overdue
  ───────────────────────────────────────────────────────────────────
```

- Health score displayed as a small bar + number
- Overdue check-ins highlighted in red
- Clicking a row → Contact Detail
- Filter dropdowns filter in-place (htmx or plain form GET)

**Query params:** `?type=colleague&status=active&q=sarah`

---

### 3. Contact Detail

**Route:** `GET /contacts/{contact_id}`

**Purpose:** Full profile for a contact.

**Layout:** Page header + meta grid + tabbed or stacked sections (same pattern as halfred-tasks task detail).

#### Header
```
Sarah Chen                                    [Edit] [← Contacts]
colleague · active
```

#### Meta Grid (same style as halfred-tasks task-meta-grid)
```
Email              Phone              Health Score    Last Interaction
sarah@example.com  +1-555-0199        82 / 100       Mar 10 (meeting, 60 min)

Preferred Contact  Check-in Interval  Next Check-in  Date Met
Email              14 days            Mar 24         Jun 15, 2023
```

#### Sections (stacked, collapsible with `<details>` like halfred-tasks)

**📋 Linked Tasks**
```
  FM-001-T003  Schedule project kickoff        In Progress
  FM-001-T007  Send NDA for review             To Do
```
Tasks pulled from halfred-tasks API at render time. "No linked tasks" if empty.

**🗒 Notes**
Categorized notes (preferences, history, family, etc.). Editable inline.

```
  preferences   Prefers email for quick updates, calls for deep discussions.  [Edit]
  history       Met at Raleigh conference, Jun 2023. Introduced by Marcus.    [Edit]
```
`[+ Add Note]` button at bottom.

**📅 Interaction History**
Reverse-chronological log.

```
  Mar 10  meeting  Project kickoff planning (60 min)           [View]
  Feb 28  call     Q1 check-in (30 min)                        [View]
  Feb 10  email    Sent proposal draft                         [View]
```
`[+ Log Interaction]` button at top of section.

**🔔 Reminders**
```
  Mar 24  check_in  pending    [Done] [Snooze] [Delete]
```
`[+ Add Reminder]` at bottom.

---

### 4. Add / Edit Contact

**Route:** `GET /contacts/new` | `GET /contacts/{contact_id}/edit`

**Layout:** Simple single-column form (same style as halfred-tasks task_form.html).

**Fields:**

| Field | Type | Required |
|-------|------|----------|
| Name | text | ✅ |
| Email | email | — |
| Phone | text | — |
| Relationship Type | select (friend/family/colleague/vendor/acquaintance/other) | — |
| Status | select (active/dormant/archived) | — |
| Date Met | date | — |
| Preferred Contact Method | select (email/phone/meeting/message) | — |
| Check-in Interval (days) | number | — |
| Time Zone | select | — |
| Tags | text (comma-separated) | — |
| Notes | textarea | — |

`[Save Contact]` → redirects to Contact Detail on success.

---

### 5. Log Interaction

**Route:** `GET /contacts/{contact_id}/interactions/new`  
Also accessible inline from Contact Detail via htmx.

**Fields:**

| Field | Type | Required |
|-------|------|----------|
| Type | select (call/email/meeting/message/video/lunch/other) | ✅ |
| Date | datetime-local | ✅ |
| Subject | text | — |
| Summary | textarea (1–3 sentences) | — |
| Notes | textarea (detailed) | — |
| Duration (minutes) | number | — |
| Linked Task | text (task ID or ref) | — |
| Tags | text (comma-separated) | — |

`[Save]` → returns to Contact Detail, interaction appears at top of history.

On save: recompute contact's `health_score` and update `last_interaction_date` server-side.

---

### 6. Search

**Route:** `GET /search?q={query}`

**Purpose:** Semantic search across contacts and interactions (uses embedding endpoint).

**Layout:** Search box at top, results below in ranked order.

```
Search Results for "moving company follow up"
──────────────────────────────────────────────
  🧑 Trosa                    contact   score: 0.91   vendor · last: Mar 8
  💬 "Trosa move date call"   interaction  score: 0.87   Mar 5 · call · 30 min
  🧑 Marcus Webb              contact   score: 0.43   friend · last: Jan 28
──────────────────────────────────────────────
```

- Contact results → link to Contact Detail
- Interaction results → link to Contact Detail (scrolled to that interaction)
- Score displayed for transparency (can be hidden in a later polish pass)
- Empty state: "No results. Try different keywords."

Search box in sidebar also routes here.

---

## Shared Components

### Contact Row (partial)
Used in dashboard and contacts list:
```
  [avatar initial]  Name         type · health score   last contact date
```

### Health Score Bar
Small inline bar (CSS width %) + numeric score. Color:
- Green: ≥ 70
- Yellow: 40–69
- Red: < 40

### Reminder Badge
`[check_in]` / `[birthday]` / `[custom]` — small pill label.

---

## Implementation Notes

1. **Reuse halfred-tasks CSS** — same `.dashboard-section`, `.page-header`, `.meta-item`, `.btn` classes. Add RMS-specific overrides in a separate block at the bottom of `style.css`.

2. **htmx for inline actions** — reminder Done/Snooze, add note, log interaction quick-entry. Everything else is plain form POST + redirect (same as halfred-tasks).

3. **Linked tasks are read-only in RMS UI** — task management stays in halfred-tasks. RMS shows task metadata fetched from halfred-tasks API; no create/edit of tasks from RMS UI.

4. **Health score recomputed on interaction save** — not a background job for MVP; compute inline on the POST handler.

5. **Sidebar relationship type counts** — single query on page load: `SELECT relationship_type, COUNT(*) FROM contacts WHERE status='active' GROUP BY relationship_type`. Cache in template context, not a separate API call.

6. **No pagination for MVP** — contacts list loads all active contacts. Add pagination if count grows beyond ~200.

7. **Search results use the same `/api/v1/rms/search` endpoint** defined in the backend spec — the page just renders the JSON as HTML server-side (no client-side fetch needed).

---

**Generated:** 2026-03-16  
**For:** Frederic & Antigravity Team  
**Companion docs:** RELATIONSHIP_MANAGEMENT_SPEC.md, RMS_ARCHITECTURE_DIAGRAMS.md, RMS_IMPLEMENTATION_QUICKSTART.md
