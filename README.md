# blue-yellow-stats

Stats, analytics, and live game tracking for a floorball team.

Two tools in one repo:

- **Live Tracker** -- mobile web app for scouting events during games, backed by Google Sheets
- **Data Pipeline** -- pulls season results from the Swiss Unihockey API into a local database and a GitHub Pages dashboard

---

## Live Tracker

Mobile web app for scouting floorball games. Open on any phone:
`https://brndkfr.github.io/blue-yellow-stats/web/tracker/`

React 18 (CDN, no build step) + Google Apps Script backend. All data lives in a Google Sheet.

### How it works

- **Schedule screen** - lists upcoming, today's, and past games loaded from the Games sheet
- **Roster editor** - before a game, select which players are active and set per-game roles
- **Live tracker** - tap a player, tap an action; events are sent to Google Sheets instantly
- **Squad manager** - manage default roles, activate/deactivate players, add new players (Vollkader button)

Works offline: if there is no network, events are queued in localStorage and flushed automatically when connectivity returns (queue badge shown in the header).

### Actions tracked

**Field players**

| Code | Label |
|------|-------|
| `recovery` | Ballgewinn |
| `defense` | Abwehr |
| `key_pass` | Schlüsselpass |
| `slot_shot` | Torschuss |
| `bad_pass` | Fehlpass |
| `goal` | Tor (with optional assist + power-play flag) |

**Goalies**

| Code | Label |
|------|-------|
| `save` | Parade |
| `mega_save` | Mega Parade |
| `key_pass` | Schlüsselpass |
| `bad_throw` | Fehlauswurf |

**Team events**

| Code | Label |
|------|-------|
| `gegengoal` | Gegentor (with optional reason) |
| `box_killed` / `box_conceded` | BoxPlay resolved |
| `pp_scored` / `pp_expired` | Powerplay resolved |

Every event also records: game, period (half/third), ISO timestamp, player id/nr/name/role, assist, scout, and whether it was queued offline.

### Google Sheets setup (first time)

1. Create a Google Sheet (e.g. "Jets Tracker 2026/27")
2. Extensions -> Apps Script -> delete the default code -> paste `web/tracker/code.gs`
3. Run `setup()` once (Run menu) - creates all sheets and seeds Squad + Scouts with the Jets U14B Blau roster
4. Deploy as Web App: Execute as Me, Who has access: Anyone
5. Paste the deployment URL into `web/tracker/config.js` -> `scriptUrl`

### Sheets managed by the backend

| Sheet | Description |
|-------|-------------|
| `Events` | One row per tracked action (23 columns) |
| `Games` | One row per game, upserted by game_id |
| `Squad` | Full player/goalie pool with roles and active status |
| `GameRoster` | Per-game player selection and role overrides |
| `Scouts` | List of scouts shown in the scout bar |
| `{date} {opponent}` | Auto-created QUERY sheet per game, filters Events |

### Updating the script

Paste the new `code.gs` into Apps Script, then update the **existing deployment** (Deploy -> Manage deployments -> edit -> New version). Do not create a new deployment - the URL must stay the same.

The script runs schema migrations automatically on first use after an update - no manual sheet edits needed.

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
