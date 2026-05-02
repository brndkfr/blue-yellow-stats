# Database Views

Planned SQLite views for the blue-yellow-stats archive. Views are virtual (no storage cost) and live in `scripts/db.py` alongside the schema.

Data basis as of May 2026: 78 games · 1 019 event rows · 73/78 games with venue distances · 58/78 games with verified event completeness.

---

## Tier 1 — Core leaderboard (build first)

### `v_player_season_stats`
The main leaderboard. Joins `player_seasons` + `players`. Adds derived rates.

Columns: `player_id`, `name`, `season`, `league_name`, `games`, `goals`, `assists`, `points`, `goals_per_game`, `assists_per_game`, `points_per_game`

Feeds: player cards, leaderboard table on the web dashboard.

---

### `v_game_results`
Jets-perspective game log. Joins `games` + `venues`.

Columns: `game_id`, `date`, `season`, `league_name`, `opponent`, `is_home`, `jets_score`, `opp_score`, `result` (W/L/D), `margin`, `distance_km`

Feeds: game log, Road Warrior, Comeback Tracker, Derby Barometer.

---

### `v_player_career`
Cross-season totals per player. Aggregates `player_seasons` across years.

Columns: `player_id`, `name`, `seasons_played`, `total_games`, `total_goals`, `total_assists`, `total_points`

Feeds: player profile pages as career stats grow.

---

## Tier 2 — Moneyball (data is already there)

### `v_clutch_goals` — Clutch Factor
Goals scored when the game was close **and** late. Defined as: score differential ≤ 1 **before** this goal was scored, AND scored in the last 10 minutes of the final period.

Implementation notes:
- "Before" score: if home team scored → `(score_home - 1, score_away)`; if away scored → `(score_home, score_away - 1)`.
- "Final period" cutoff: requires `MAX(period)` per game to handle 2-period junior games (cutoff at 30:00) vs. 3-period senior games (cutoff at 50:00) correctly.
- Own goals count as clutch if they happen in that window.

Columns: `game_id`, `player`, `team`, `game_time`, `period`, `diff_before`, `score_after`, `is_jets_goal`

Aggregated companion view `v_clutch_player_stats`: `player`, `clutch_goals`, `clutch_assists`, `clutch_points`

Feeds: Clutch Factor badge on player cards.

---

### `v_penalty_stats` — Pest precursor
Per-player and per-opponent penalty summary.

Columns: `player`, `team`, `league_name`, `season`, `penalties_2min`, `penalties_10min`, `total_pim`, `top_reason`

**Limitation:** The API records who *committed* the penalty, not who *drew* it. The full "Pest" metric (net penalty balance) is not computable from current data — it would require a field the API does not expose. This view covers the committal side only.

Feeds: coaching context, penalty discipline tracking.

---

### `v_buzzer_beaters`
Goals scored in the final 60 seconds of any period.

Filter: `CAST(game_time minutes AS INT) >= (period * 20 - 1)` — works for any number of periods.

Columns: `game_id`, `date`, `period`, `game_time`, `player`, `team`, `score_after`

Aggregated: goals + assists per player in these situations.

Feeds: "Buzzer-Beater Stats" highlight reel.

---

### `v_road_warrior`
Record and points-per-game correlated with travel distance. Joins `v_game_results` + `venues.distance_km`. 73 of 78 games have distances.

Distance buckets:
- **Home** — 0 km
- **Local** — < 20 km
- **Regional** — 20–80 km
- **Away** — > 80 km

Columns: `bucket`, `games`, `wins`, `draws`, `losses`, `points_per_game`, `avg_margin`

Feeds: Road Warrior Index, venue map circle sizes.

---

### `v_opponent_record`
Head-to-head record against each opponent, per season and league.

Columns: `opponent`, `season`, `league_name`, `games`, `wins`, `draws`, `losses`, `jets_goals_for`, `jets_goals_against`

Filter for specific rivals (GC, Uster, Rychenberg) to produce the **Derby Barometer**.

Feeds: rivalry stats, Derby Barometer panel.

---

## Tier 3 — Advanced (feasible but complex SQL)

### `v_comeback_games`
Games where Jets won after trailing by 2 or more goals at any point.

Requires a correlated subquery over `game_event_details` to find the maximum trailing margin faced during a game, then cross-reference with the final result. A game qualifies if `max_jets_deficit >= 2` AND `jets_score > opp_score`.

Columns: `game_id`, `date`, `opponent`, `max_deficit`, `jets_score`, `opp_score`, `comeback_from_period`

Feeds: Comeback Tracker metric.

---

### `v_powerplay_goals`
Goals scored while the opponent had a penalty in effect.

A powerplay goal = Jets goal with `game_time` falling within `[penalty_time, penalty_time + 2:00]` for a concurrent opponent penalty (or until the next Jets goal ends the powerplay early).

Requires temporal overlap: for each Jets goal, check if any opponent penalty was active at that `game_time`. Doable in SQLite with a correlated subquery but non-trivial.

Columns: `game_id`, `player`, `game_time`, `is_powerplay_goal`, `is_shorthanded_goal`

Aggregated: PPG count and PP% per player and team.

---

### `v_scoring_by_period`
Jets goals scored per period, team level and player level. Shows whether the team is a fast starter or a slow finisher across a season.

Simple `GROUP BY period` over filtered `game_event_details`. Trivial to implement.

---

## Not computable from current data

| Metric | Reason |
|---|---|
| **Catalyst Index** (pre-assist) | API records scorer + 1 assist only — no 3-event chains |
| **Pest** (penalties *drawn*) | API records who committed, not who drew the penalty |
| **The Wall** (goalie GAA / powerplay save %) | No goalie-linked events in the API for junior games |
| **Lineup Reconstruction** | No on-ice presence data — only goal and penalty events |

---

## Build order

1. `v_player_season_stats` + `v_game_results` — immediate value, web dashboard foundation
2. `v_clutch_goals` + `v_buzzer_beaters` — differentiating Moneyball stats, zero new data needed
3. `v_road_warrior` + `v_opponent_record` + `v_scoring_by_period` — nearly free from existing data
4. `v_comeback_games` + `v_powerplay_goals` — more complex SQL, build when leaderboard is solid
5. `v_player_career` + `v_penalty_stats` — straightforward aggregations, add any time
