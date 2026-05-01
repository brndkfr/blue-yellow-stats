# Jets Team Discovery — Research & Status

## API Limitation: mode=club is incomplete

`GET /api/games?mode=club&club_id=463785&season=2025` silently omits entire categories of teams.
All Jets teams share `club_id=463785` — the omissions are a filter in the API, not a separate registration.

**What mode=club returns:**
- Damen L-UPL (league_id=24, game_class=21)
- Junioren D Regional (league_id=12, game_class=34)
- Junioren E Regional (league_id=12, game_class=35)

**What mode=club silently skips:**
- All age-category leagues (league_id 13 and 14: U14, U16, U17, U18, U21)
- All Juniorinnen from league_id=12 (game_class 43, 44 — girls letter-based juniors)

Teams not returned by mode=club must be fetched via `GET /api/games?mode=team&team_id=X`.
That endpoint uses a different cell layout (5 cells, no league column) and paginates at 10 games/page.

---

## Teams currently in DB

| Team name | team_id | league_id | game_class | Source |
|-----------|---------|-----------|-----------|--------|
| Kloten-Dietlikon Jets (Damen L-UPL) | 431166 | 24 | 21 | mode=club |
| Kloten-Dietlikon Jets III (Junioren D Gr.18) | 431160 | 12 | 34 | mode=club |
| Kloten-Dietlikon Jets I (Junioren D Gr.26) | 432153 | 12 | 34 | mode=club |
| Kloten-Dietlikon Jets III (Junioren E Gr.18) | 431387 | 12 | 35 | mode=club |

---

## Teams in config supplemental_teams (not yet scraped — scraper step missing)

| team_name | team_id | league_id | game_class | API league label |
|-----------|---------|-----------|-----------|-----------------|
| Jets U14A | 431310 | 13 | 14 | Junioren U14 A Gr. 3 |
| Jets U14B | 431482 | 14 | 14 | Junioren U14 B Gr. 9 |
| Jets U16B | 431155 | 14 | 16 | Junioren U16 A Gr. 3 |
| Jets U18B | 431157 | 14 | 18 | Junioren U18 B Gr. 3 |
| Jets U21A | 431158 | 13 | 19 | Junioren U21 A Gr. 1 |

---

## Teams discovered but not yet in config

| User name | team_id | league_id | game_class | API league label | Notes |
|-----------|---------|-----------|-----------|-----------------|-------|
| Juniorinnen U21 A | 431170 | 13 | 26 | Juniorinnen U21 A Gr. 1 | Confirmed via rankings |
| Juniorinnen U17 A | 431483 | 13 | 28 | Juniorinnen U17 A Gr. 1 | Confirmed via rankings |
| Juniorinnen D | 432155 | 12 | 44 | Juniorinnen D Regional Gr. 3 | league_id=12 but mode=club skips it |

---

## Teams not yet found — need follow-up

| User name | Status |
|-----------|--------|
| Juniorinnen U17 B | Not found. Tried league_id=13/14, game_class=27-30. No Jets team appeared. Either the B-group team_id is outside searched ranges, or the team isn't registered this season. |
| Juniorinnen C | Not found in rankings for league_id=12, game_class=43. Jets not in any returned group. Same possibilities. |

### How to find missing team_ids
Easiest method: find a game URL on swissunihockey.ch for each missing team (like the U14B example:
`https://www.swissunihockey.ch/de/game-detail?game_id=1093736`). Pass the game_id to
`GET /api/games/{game_id}` — the response contains `team_detail` links with the team_id.

---

## Inactive / other Jets teams found

| team_id | Name | Liga | Status |
|---------|------|------|--------|
| 431442 | Kloten-Dietlikon Jets IV | 4. Liga (men's) | No 2025 games |
| 432152 | Kloten-Dietlikon Jets II | Regional | No 2025 games |
| 432154 | Kloten-Dietlikon Jets III | Regional | No 2025 games |
| 431529 | Kloten-Dietlikon Jets II | U18 C | No 2025 games |

---

## What needs to be done

### 1. Add missing teams to config.json
Once team_ids for Juniorinnen U17 B and Juniorinnen C are found, add them to `supplemental_teams`
alongside the three already discovered (Juniorinnen U21 A, U17 A, Juniorinnen D).

### 2. Implement scraper step 2b
New scraper step to fetch games via `mode=team` for all `supplemental_teams` entries, with pagination.
See plan file for full implementation spec. Files to change: `scripts/scraper.py`.

### 3. Parser for mode=team cell layout
`_parse_team_games(data, season, league_id, game_class, league_name)` — same as `_parse_games`
but 5-cell layout (no league column). League info injected from config.

### 4. Pagination helper
`_next_page(data)` — checks `data.data.slider.next.set_in_context.page`. U21 boys has 4 pages;
U17 A and others have 2-3 pages.
