# Swiss Unihockey API v2 — Analysis & Reference

Base URL: `https://api-v2.swissunihockey.ch`

---

## Confirmed Public Endpoints

| Endpoint | Key Parameters | Returns |
|----------|---------------|---------|
| `GET /api/seasons` | — | Dropdown of all seasons 1996–2026 |
| `GET /api/leagues` | `season`, `format=dropdown` | League + game_class IDs with names |
| `GET /api/clubs` | — | All clubs (Jets = **463785**) |
| `GET /api/games` | `mode`, `club_id`/`league`/`game_class`, `season` | Game list |
| `GET /api/rankings` | `season`, `league`, `game_class` | Team standings |
| `GET /api/topscorers/su` | `season`, `amount` | Men's L-UPL top scorers with player IDs |
| `GET /api/players/{id}` | — | Player profile |
| `GET /api/players/{id}/overview` | — | Game-by-game stats |
| `GET /api/game_events` | `game_id` | **404 — partner access required** |

---

## Confirmed League / Game_Class IDs

| League | `league` | `game_class` | Notes |
|--------|----------|--------------|-------|
| Herren L-UPL | 24 | 11 | Men's top flight |
| Damen L-UPL | 24 | 21 | Women's top flight — Jets' adult league |
| Junioren A Regional | 12 | 31 | |
| Junioren B Regional | 12 | 32 | |
| Junioren C Regional | 12 | 33 | |
| Junioren D Regional | 12 | 34 | |
| Junioren E Regional | 12 | 35 | |
| Junioren D+ Regional | 12 | 36 | |
| Juniorinnen A Regional | 12 | 41 | |
| Juniorinnen B Regional | 12 | 42 | |
| Juniorinnen C Regional | 12 | 43 | |
| Juniorinnen D Regional | 12 | 44 | |

---

## Cell-Index Maps (response parsing)

### `GET /api/games?mode=club`
Top-level: `data.data.regions[*].rows[*]`

| Field | Source |
|-------|--------|
| game_id | `row.link.ids[0]` |
| date | `cells[0].text[0]` |
| venue | `cells[1].text[0]` |
| league_name | `" ".join(cells[2].text)` |
| home_team | `cells[3].text[0]` |
| away_team | `cells[4].text[0]` |
| score | `cells[5].text[0]` — final score only ("6:4") |

> **Note:** Period scores are NOT included in this endpoint.

### `GET /api/rankings`
Top-level: `data.data.regions[*].rows[*]`

| cells[] | Column | Example |
|---------|--------|---------|
| 0 | rank | "1" |
| 1 | logo (image) | — |
| 2 | team name | "Wizards Bern Burgdorf" |
| 3 | played (Sp) | "18" |
| 4 | SoW | "0" |
| 5 | wins regulation (S) | "14" |
| 6 | overtime/SO wins (SnV) | "1" |
| 7 | overtime/SO losses (NnV) | "2" |
| 8 | losses regulation (N) | "1" |
| 9 | goals for:against (T) | "98:53" |
| 10 | goal differential (TD) | "+45" |
| 11 | points quotient (PQ) | "2.556" |
| 12 | points (P) | "46" |

### `GET /api/topscorers/su`
Top-level: `data.data.regions[0].rows[*]`

| cells[] | Field | Notes |
|---------|-------|-------|
| 0 | rank + player_id link | `cells[0].link.ids[0]` |
| 1 | player name | also has player_id in link |
| 2 | club name | |
| 3 | games played | |
| 4 | goals | |
| 5 | assists | |
| 6 | points | |

> **Note:** Returns Herren L-UPL only. No known parameter for Women's L-UPL.

### `GET /api/players/{id}` (profile)
Top-level: `data.data.regions[0].rows[0].cells`

| cells[] | Field |
|---------|-------|
| 0 | portrait image |
| 1 | club name |
| 2 | jersey number |
| 3 | position |
| 4 | birth year |
| 5 | height ("174 cm") |
| 6 | weight |

### `GET /api/players/{id}/overview` (game-by-game)
Top-level: `data.data.regions[*].rows[*]`

| Field | Source |
|-------|--------|
| game_id | `row.id` |
| date | `cells[0].text[0]` |
| venue/city | `cells[1].text[0]` (has map link with lat/lng) |
| status | `cells[2].text[0]` ("Durchgeführt" / "Abgesagt") |
| home_team | `cells[3].text[0]` |
| away_team | `cells[4].text[0]` |
| score | `cells[5].text` — may include period scores and "n.P." |
| goals | `cells[6].text[0]` |
| assists | `cells[7].text[0]` |
| points | `cells[8].text[0]` |
| pim | `cells[9].text[0]` |

> **Bonus:** `cells[1].link` contains `{"type":"map","x":8.749,"y":47.495}` — venue coordinates for Road Warrior Index.

---

## Data Available but Currently Discarded

| Data | Where | What to do |
|------|-------|------------|
| Overtime wins | rankings cells[6] | Add `overtime_wins` to rankings table |
| Overtime losses | rankings cells[7] | Add `overtime_losses` to rankings table |
| Goals for | rankings cells[9] "98:53" left of ":" | Add `goals_for` to rankings table |
| Goals against | rankings cells[9] "98:53" right of ":" | Add `goals_against` to rankings table |
| is_home flag | games: check if home_team contains "Kloten-Dietlikon" | Add `is_home` to games table |
| Venue coordinates | player/overview cells[1].link (x, y) | Add to venues table or games table for Road Warrior Index |
| Period scores | player/overview cells[5].text (multi-item) | Parse and store per game for Comeback Tracker |

---

## Genuinely Unavailable from Public Endpoints

| Data | Why | Impact |
|------|-----|--------|
| Period scores in game schedule | `games?mode=club` returns final score only | Comeback Tracker blocked |
| Game events (goals, assists, penalties per minute) | `/api/game_events` returns 404; requires partner authentication | Catalyst Index, Clutch Factor, Pest, Lineup Reconstruction, Buzzer-Beater all blocked |

---

## Known Limitations

- **No women's player ID discovery via topscorers:** `/api/topscorers/su` is Men's L-UPL only. Jets plays in Women's L-UPL. No known public endpoint lists player IDs for a specific club's women's team.
- **Roster endpoint fallback:** `/api/teams/<team_id>/players` can return roster rows for top-division teams and provide player IDs plus season aggregates (goals/assists/points/pim). This helps seed `players` and `player_seasons`, but it is not a replacement for game-level stats and may not work for junior teams.
- **game_events blocked:** Contact it@swissunihockey.ch for partner API access if event-level metrics are required.
- **Season ambiguity:** `/api/seasons` highlights the upcoming registration season. Scraper probes both highlighted and previous year to find one with games.
