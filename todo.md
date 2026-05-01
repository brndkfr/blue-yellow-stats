# TODO

## Features / Data gaps

- **Period scores** — `period_scores` column in `games` is always `None`. Parse period breakdown from game detail or game events response and store as JSON string.

- **Junior league standings** — Public API rankings endpoint ignores the `group` parameter (always returns Gruppe 1). Junior leagues also split teams mid-season into top/bottom groups, so a single standings table is misleading. Derive standings from raw game results in the `games` table instead.

- **Player IDs for juniors** — No player IDs available from the public API for junior games. Only abbreviated names in event logs (e.g. "B. Kiefer"). Blocks populating `player_games` / `player_seasons` tables properly.

- **Web dashboard** — `web/` directory exists but dashboard not yet built. Planned: GitHub Pages frontend with Tailwind + Chart.js showing the metrics (Catalyst, Pest, Clutch, Wall).

## Infrastructure

- **GitHub Actions data sync** — Workflow scheduled for Monday 04:00 UTC. Verify it runs cleanly end-to-end with the current scraper CLI.
