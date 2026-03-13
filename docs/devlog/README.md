# Devlog

One YAML file per session, named by date (`YYYY-MM-DD.yaml`). Multiple sessions on the same day append a suffix (`2026-03-13b.yaml`).

---

## Schema

```yaml
- date: YYYY-MM-DD
  area: garden | wiki | chat | infrastructure | docs
  title: Short description of the session
  status: done | in-progress | blocked | deferred
  files:
    - path/to/file.tsx        # paths relative to project root
  changes:
    - Human-readable bullet describing what changed
  decisions:
    - Architectural or design decisions made and why
  next: What comes next (optional)
```

### Field notes

- `area`: primary domain affected; use the closest match if a session spans multiple areas
- `status`: `done` means shipped or merged; `in-progress` means work continues; `blocked` means waiting on an external dependency; `deferred` means deliberately postponed
- `files`: list the files most meaningfully changed — not every touched file, just the ones another dev would want to look at first
- `changes`: describe the observable result, not the mechanism (prefer "messages now anchor to bottom of viewport" over "set justify-content: flex-end")
- `decisions`: record the reasoning behind non-obvious choices so future sessions don't relitigate them
- `next`: optional; one line pointing to the next concrete step
