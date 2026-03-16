# halfred-rms

Relationship Management System — personal + business contact tracking with interaction logging, health scoring, reminders, and bidirectional task linking with [halfred-tasks](https://github.com/fredericf75/halfred-tasks).

## Specs

See the [`specs/`](./specs/) folder:

- [`RELATIONSHIP_MANAGEMENT_SPEC.md`](./specs/RELATIONSHIP_MANAGEMENT_SPEC.md) — Database schema, API endpoints, task-contact linking, semantic search
- [`RMS_ARCHITECTURE_DIAGRAMS.md`](./specs/RMS_ARCHITECTURE_DIAGRAMS.md) — Architecture diagrams and data flow
- [`RMS_IMPLEMENTATION_QUICKSTART.md`](./specs/RMS_IMPLEMENTATION_QUICKSTART.md) — Implementation guide for Antigravity team
- [`RMS_DASHBOARD_SPEC.md`](./specs/RMS_DASHBOARD_SPEC.md) — Web UI / dashboard specification

## Stack

- **Backend:** Node.js + Express (or Python + FastAPI)
- **Database:** SQLite (`rms.db`)
- **Embeddings:** sentence-transformers `all-MiniLM-L6-v2` for semantic search
- **Frontend:** Jinja2/Nunjucks + htmx — mirrors halfred-tasks UI

## Integration

Bidirectionally linked with halfred-tasks via soft foreign keys. Tasks reference contacts by ID; contact views show linked task metadata fetched from the halfred-tasks API.
