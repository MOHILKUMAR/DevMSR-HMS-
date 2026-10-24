# API endpoints

The real list of endpoints. Base path: `/api/v1`. Conventions are in `CLAUDE.md`, section 10.

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness check. Returns `{ "status": "ok" }`. Gets `@Public()` and a database check with the request pipeline. |
