# blue-yellow-stats

Game stats and analytics platform. 

Pulls data from the [Swiss Unihockey API v2](https://api-v2.swissunihockey.ch/api/doc), stores it in a local SQLite archive, and publishes interactive stats to a GitHub Pages dashboard.

## Quick start

```bash
uv sync
uv run bystats.py sync --team "Jets U14B" --season 2025
```

## bystats CLI

`bystats.py` is the single entry point for all pipeline operations.

### Commands

| Command | Description |
|---------|-------------|
| `sync` | Fetch all games for a team: runs `mode=team` for the Finalrunde, then auto-scans backwards to find Vorrunde games the API hides. Ingests everything. |
| `scan` | Brute-force scan an explicit game ID range. Useful when the auto-scan range needs widening. |
| `game` | Fetch or force-refresh a single game by its public API game ID. Use `--force` to bypass cache after a score correction. |
| `events` | Fetch or force-refresh game events for a single game. |
| `parse-events` | Parse raw `game_events` JSON into the structured `game_event_details` table. Runs automatically on `sync`/`game`; use manually to backfill. `--force` re-parses games already processed. |
| `status` | Show games in DB, events availability, and W/D/L record. |
| `config` | Verify team IDs for a new season and write `config_YEAR.json`. |

### Examples

```bash
# Full season sync — finds Vorrunde + Finalrunde automatically
uv run bystats.py sync --team "Jets U14B" --season 2025

# Scan a wider range manually
uv run bystats.py scan --team "Jets U14B" --season 2025 --start 1093500 --end 1093800

# Force-refresh one game (e.g. after a score correction or postponement)
uv run bystats.py game 1093702 --team "Jets U14B" --season 2025 --force

# Pull or re-pull game events for one game
uv run bystats.py events 1093702 --force

# Parse raw event JSON into game_event_details (runs automatically on sync/game)
uv run bystats.py parse-events          # skips games already parsed
uv run bystats.py parse-events --force  # re-parse everything

# Check what's in the DB (all teams or just one)
uv run bystats.py status
uv run bystats.py status --team "Jets U14B"

# Prepare config for a new season
uv run bystats.py config --season 2026
```

## Project structure

```
bystats.py      Unified CLI entry point
scripts/        Pipeline modules: api, cache, db, pipeline, geo_helper
data/archive/   SQLite database and historical JSON backups
data/cache/     Query-aware API cache (24h TTL, gitignored)
data/processed/ Cleaned JSONs for the web dashboard
web/            GitHub Pages frontend (Tailwind + Chart.js)
config.json     Club-ID, league IDs, and runtime settings
```

## Live Game Tracker

A mobile web app for scouting and tracking events during games in real time.
Served on GitHub Pages: `https://brndkfr.github.io/blue-yellow-stats/web/tracker/`

### How it works

1. Open the landing page and tap the current game card
2. Select a player from the roster (highlighted yellow)
3. Tap one of the six Moneyball actions or the ⚽ Tor button
4. Events are sent to Google Sheets instantly; if there is no network they are
   queued in `localStorage` and flushed automatically when connectivity returns

### Adding a new game

1. Create a kader file: `web/tracker/kader_YYYY-MM-DD_HHMM_OPP.json`
   (copy an existing file, update `game_info` and the roster lists)
2. Add an entry to `web/tracker/games.json`

### Actions tracked

| Icon | Code | Description |
|------|------|-------------|
| 🔄 | `recovery`  | Ballgewinn |
| 🛡️ | `stop`      | Abwehr |
| 🔑 | `key_pass`  | Schlüsselpass |
| 🎯 | `slot_shot` | Torschuss |
| 🧤 | `slot_save` | Topparade |
| ⚠️ | `turnover`  | Ballverlust |
| ⚽ | `goal`      | Tor (with optional assist) |

### Google Sheets backend

The script lives in `web/tracker/code.gs`. Events are written to two sheets:

- **Events** — one row per tap (17 columns: `game_id`, `game_date`, `game_start`,
  `opponent`, `type`, `venue`, `home`, `period`, `timestamp`, `player_nr`,
  `player_name`, `action`, `assist`, `scout`, `note`, `was_queued`, `received_at`)
- **Games** — one row per game, auto-upserted on the first event for that game

**Deployment:** paste `code.gs` into Apps Script, then always **edit the existing
deployment** (Manage deployments → pencil icon) rather than creating a new one —
editing keeps the URL stable so no kader files need updating.

---

## Metrics

| Badge | Metric | Description |
|-------|--------|-------------|
| ⚡ Catalyst | Catalyst Index | Pre-assist: who initiates the attack? |
| 🎣 Pest | Penalty Draw Rate | Net opponent penalty minutes drawn |
| 💥 Clutch | Clutch Factor | Goals/assists in last 10 min, ≤1 goal diff |
| 🛡️ Wall | Goalie — GAA | Goals against average + powerplay defence |

## Scraping

Fetch all data for a specific team and season into the archive DB:

```bash
uv run scripts/scraper.py --team "Jets U14B" --season 2025
```

Available team names match the `name` field in `config.json`.

Generate a season config (verifies which team IDs are still valid for a new season):

```bash
uv run scripts/gen_config.py --season 2026
```

---

## What's in the database

The SQLite archive is at `data/archive/blue_yellow_archive.db`.
Open it with any SQLite client (e.g. `sqlite3`, DB Browser for SQLite, or DuckDB).

### Tables

| Table | Description |
|---|---|
| `games` | One row per game: date, home/away team names and IDs, score, venue, league |
| `game_events` | Raw JSON event log per game + `events_complete` flag (1 = goal count matches score, 0 = API data incomplete, NULL = not yet evaluated) |
| `game_event_details` | Parsed per-event rows: seq, period, game_time, event_type, team, player, assist, score_home/away, penalty_reason |
| `teams` | Team registry: ID → name, league, game_class |
| `venues` | Arenas: name, city, lat/lng, distance from Jets home (km) |
| `leagues` | League registry: ID + game_class → name, is_junior flag |
| `seasons` | Season registry: year → label (e.g. "2025/2026") |
| `clubs` | Club registry (Jets only for now) |
| `rankings` | L-UPL standings (not populated for junior leagues — see known limitations) |
| `players` | Player profiles: position, birth year, height (empty — no player IDs for juniors) |
| `player_seasons` | Per-player season aggregates (empty) |
| `player_games` | Per-player per-game stats (empty) |

### Sample queries

**All U14B results, chronological:**
```sql
SELECT date, home_team, score_home, score_away, away_team,
       CASE WHEN is_home THEN 'HOME' ELSE 'AWAY' END AS venue_type
FROM games
WHERE league_name = 'Junioren U14 B'
ORDER BY date;
```

**Win / draw / loss record:**
```sql
SELECT
  SUM(CASE WHEN is_home AND score_home > score_away
            OR NOT is_home AND score_away > score_home THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN score_home = score_away THEN 1 ELSE 0 END)               AS draws,
  SUM(CASE WHEN is_home AND score_home < score_away
            OR NOT is_home AND score_away < score_home THEN 1 ELSE 0 END) AS losses
FROM games
WHERE league_name = 'Junioren U14 B';
```

**Goals scored and conceded per game:**
```sql
SELECT date, home_team, score_home, score_away, away_team,
       CASE WHEN is_home THEN score_home ELSE score_away END AS jets_goals,
       CASE WHEN is_home THEN score_away ELSE score_home END AS opponent_goals
FROM games
WHERE league_name = 'Junioren U14 B'
ORDER BY date;
```

**Home vs away record:**
```sql
SELECT
  CASE WHEN is_home THEN 'Home' ELSE 'Away' END AS venue,
  COUNT(*) AS played,
  SUM(CASE WHEN is_home AND score_home > score_away
            OR NOT is_home AND score_away > score_home THEN 1 ELSE 0 END) AS wins
FROM games
WHERE league_name = 'Junioren U14 B'
GROUP BY is_home;
```

**Opponents and record against each:**
```sql
SELECT
  CASE WHEN is_home THEN away_team ELSE home_team END AS opponent,
  COUNT(*) AS played,
  SUM(CASE WHEN is_home AND score_home > score_away
            OR NOT is_home AND score_away > score_home THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN is_home THEN score_home ELSE score_away END) AS jets_goals,
  SUM(CASE WHEN is_home THEN score_away ELSE score_home END) AS opp_goals
FROM games
WHERE league_name = 'Junioren U14 B'
GROUP BY opponent
ORDER BY opponent;
```

**Road trip distances (away games only):**
```sql
SELECT g.date, g.home_team, g.score_home, g.score_away, g.away_team,
       v.name AS arena, v.city, v.distance_km
FROM games g
JOIN venues v ON g.venue_id = v.venue_id
WHERE g.league_name = 'Junioren U14 B'
  AND g.is_home = 0
ORDER BY v.distance_km DESC;
```

**Game events availability and completeness:**
```sql
SELECT g.date, g.home_team, g.score_home, g.score_away, g.away_team,
       e.available, e.events_complete
FROM games g
LEFT JOIN game_events e ON g.game_id = e.game_id
WHERE g.league_name = 'Junioren U14 B'
ORDER BY g.date;
```

**Top scorers (complete events only):**
```sql
SELECT player, team,
       COUNT(*) AS goals,
       SUM(CASE WHEN assist IS NOT NULL THEN 1 ELSE 0 END) AS assists
FROM game_event_details d
JOIN game_events e ON d.game_id = e.game_id
WHERE e.events_complete = 1
  AND d.event_type IN ('goal', 'own_goal')
GROUP BY player, team
ORDER BY goals DESC;
```

**Damen L-UPL standings:**
```sql
SELECT rank, team_name, played, wins, overtime_losses, losses,
       goals_for, goals_against, goal_diff, points
FROM rankings
WHERE league_id = 24 AND game_class = 21
ORDER BY rank;
```

---

## Data sync

A GitHub Actions workflow runs every **Monday at 04:00 UTC** and commits updated data automatically.

---

*Data source: [Swiss Unihockey API](https://api-v2.swissunihockey.ch)*
