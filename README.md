# blue-yellow-stats

Stats, analytics, and live game tracking for a floorball team.

Two tools in one repo:

- **Live Tracker** -- mobile web app for scouting events during games, backed by Google Sheets
- **Data Pipeline** -- pulls season results from the Swiss Unihockey API into a local database and a GitHub Pages dashboard

---

## Live Tracker

Open on any phone during a game:
`https://brndkfr.github.io/blue-yellow-stats/web/tracker/`

Select a player, tap an action. Events are sent to Google Sheets in real time.
Works offline: if there is no network, events are queued locally and sent automatically when connectivity returns.

### Adding a new game

1. Create `web/tracker/kader_YYYY-MM-DD_HHMM_OPP.json` (copy an existing file, update `game_info` and the roster)
2. Add an entry to `web/tracker/games.json`

### Actions tracked

| Icon | Code | Label |
|------|------|-------|
| 🔄 | `recovery`  | Ballgewinn |
| 🛡️ | `stop`      | Abwehr |
| 🔑 | `key_pass`  | Schluesselpass |
| 🎯 | `slot_shot` | Torschuss |
| 🧤 | `slot_save` | Topparade |
| ⚠️ | `turnover`  | Ballverlust |
| ⚽ | `goal`      | Tor (with optional assist) |

### Google Sheets setup

The backend script is `web/tracker/code.gs`. Events are written to two sheets:

- **Events** -- one row per tap (17 columns including `action`, `assist`, `scout`, `was_queued`)
- **Games** -- one row per game, auto-created on the first event

To update the script: paste `code.gs` into Apps Script, then edit the **existing deployment** (not "New deployment") so the URL stays the same.

---

## Data Pipeline

Pulls game results and events from the [Swiss Unihockey API](https://api-v2.swissunihockey.ch/api/doc).

```bash
uv sync
uv run bystats.py sync --team "Jets U14B" --season 2025
```

### CLI commands

| Command | Description |
|---------|-------------|
| `sync` | Fetch all games for a team and season |
| `game <id>` | Fetch or force-refresh a single game |
| `events <id>` | Fetch or refresh events for a single game |
| `parse-events` | Parse raw event JSON into structured rows |
| `status` | Show DB contents and W/D/L record |
| `config` | Verify team IDs for a new season |

Data syncs automatically every Monday at 04:00 UTC via GitHub Actions.

---

## Project structure

```
bystats.py           CLI entry point
scripts/             Pipeline modules (api, db, pipeline, scraper)
web/tracker/         Live tracker app (index.html, game.html, kader files)
web/dashboard/       GitHub Pages stats dashboard
data/archive/        SQLite database
data/cache/          API response cache (gitignored)
docs/                Reference documentation and SQL examples
config.json          Club and league IDs
```

---

## Database

SQLite at `data/archive/blue_yellow_archive.db`. Open with `sqlite3`, DuckDB, or DB Browser for SQLite.

| Table | Description |
|-------|-------------|
| `games` | One row per game: date, teams, score, venue, league |
| `game_event_details` | Parsed per-event rows: period, time, type, player, assist |
| `game_events` | Raw event JSON per game |
| `venues` | Arenas with lat/lng and distance from Jets home rink |

See [docs/sql_examples.md](docs/sql_examples.md) for sample queries.

---

*Data source: [Swiss Unihockey API](https://api-v2.swissunihockey.ch)*
