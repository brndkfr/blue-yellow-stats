# Swiss Unihockey API — Endpoint Reference

## Public API (`api-v2.swissunihockey.ch`)

No authentication required.

### Key findings

- `mode=team&team_id=<id>&season=<year>` is the correct way to get all games for a specific team.
- `mode=list&league=<id>&game_class=<id>` returns only the current/default group (Gruppe 1). The `group` parameter is accepted but ignored by the API.
- `mode=club&club_id=<id>&season=<year>` returns only recent/upcoming games across all club teams.
- Public API game IDs are 7-digit numbers (e.g. 1093736). These are **different** from the private API `GameID` values (6-digit, e.g. 105916).
- Public API `LeagueID` values (e.g. 14) are **different** from private API `LeagueID` values (e.g. 8568).

### Confirmed working endpoints

| Endpoint | Description |
|---|---|
| `GET /api/seasons` | All seasons |
| `GET /api/leagues?season=2025&format=dropdown` | All leagues/game_classes with group names |
| `GET /api/clubs` | All clubs |
| `GET /api/games?mode=club&club_id=463785&season=2025` | Upcoming/recent games for a club |
| `GET /api/games?mode=team&team_id=431482&season=2025` | Full season games for a specific team ✓ |
| `GET /api/games?mode=list&season=2025&league=14&game_class=14` | Games list (Gruppe 1 only, group param ignored) |
| `GET /api/games/<game_id>` | Game detail by public API game ID |
| `GET /api/games/<game_id>/summary` | Game summary |
| `GET /api/game_events/<game_id>` | Game events (returns 404 for most games — requires partner access) |
| `GET /api/rankings?season=2025&league=24&game_class=21` | Standings |
| `GET /api/players/<player_id>` | Player profile |
| `GET /api/players/<player_id>/overview` | Player game-by-game stats |
| `GET /api/teams?club_id=463785&season=2025` | Teams in same league as club |

### Jets U14B — season 2025/26 games (public API)

`team_id=431482`, `league_id=14`, `game_class=14`

| Date | Time | Home | Away | Score | GameID |
|---|---|---|---|---|---|
| 11.01.2026 | 17:15 | Zürich Oberland Pumas II | **Kloten-Dietlikon Jets** | 4:5 | 1093733 |
| 25.01.2026 | 09:00 | UHC Uster II | **Kloten-Dietlikon Jets** | 2:8 | 1093734 |
| 25.01.2026 | 10:50 | **Kloten-Dietlikon Jets** | Bülach Floorball II | 5:3 | 1093736 |
| 15.03.2026 | 15:25 | Innebandy Zürich 11 | **Kloten-Dietlikon Jets** | 4:5 | 1093751 |
| 15.03.2026 | 17:15 | **Kloten-Dietlikon Jets** | Zürich Oberland Pumas II | 4:4 | 1093753 |
| 22.03.2026 | 09:00 | **Kloten-Dietlikon Jets** | UHC Uster II | 3:4 | 1093754 |
| 22.03.2026 | 10:50 | Bülach Floorball II | **Kloten-Dietlikon Jets** | 5:4 | 1093756 |

Note: The private API (`swissunihockey-api.azurewebsites.net`) returns 10 games for the same team — the public API appears to be missing some rounds.

---

## Private API (`swissunihockey-api.azurewebsites.net`)

Requires authentication: Bearer token + `Origin`, `Referer`, `User-Agent`, `X-Platform: 2` headers.  
**Only works from the browser** — cannot be called from REST clients (401 otherwise, cause unknown).

### Confirmed working endpoints (browser only)

| Endpoint | Description |
|---|---|
| `GET /api/teamapi/getpreviousteamgames?TeamID=4239&LastGameID=0` | Previous games for a team (`LastGameID=0` = all) |

### Jets U14B — season 2025/26 games (private API)

`TeamID=4239` (private API team ID — different namespace from public API `team_id=431482`)

| Date | Home | Score | Away | GameID |
|---|---|---|---|---|
| 22.03.2026 | Bülach Floorball U13 | 5:4 | **Kloten-Dietlikon Jets U14B** | 105916 |
| 22.03.2026 | **Kloten-Dietlikon Jets U14B** | 3:4 | UHC Uster U14B II | 105914 |
| 15.03.2026 | **Kloten-Dietlikon Jets U14B** | 4:4 | Zürich Oberland Pumas U14 B | 105913 |
| 15.03.2026 | Innebandy Zürich 11 U14 | 4:5 | **Kloten-Dietlikon Jets U14B** | 105911 |
| 25.01.2026 | **Kloten-Dietlikon Jets U14B** | 5:3 | Bülach Floorball U13 | 105896 |
| 25.01.2026 | UHC Uster U14B II | 2:8 | **Kloten-Dietlikon Jets U14B** | 105894 |
| 11.01.2026 | Zürich Oberland Pumas U14 B | 4:5 | **Kloten-Dietlikon Jets U14B** | 105893 |
| 11.01.2026 | **Kloten-Dietlikon Jets U14B** | 3:4 | Innebandy Zürich 11 U14 | 105891 |
| 21.12.2025 | **Kloten-Dietlikon Jets U14B** | 0:6 | Bassersdorf Nürensdorf U14 I | 105883 |
| 30.11.2025 | Grasshopper Club Zürich U13 | 12:2 | **Kloten-Dietlikon Jets U14B** | 105871 |

---

## ID namespace summary

| Concept | Public API | Private API |
|---|---|---|
| Jets U14B team | `team_id=431482` | `TeamID=4239` |
| U14B league | `league=14, game_class=14` | `LeagueID=8568` |
| Game identifier | 7-digit (e.g. 1093736) | 6-digit (e.g. 105916) |
| Jets club | `club_id=463785` | — |

The two APIs share no common identifiers — IDs cannot be used interchangeably.

---

## Known limitations

### Junior league rankings
Junior leagues split teams mid-season: all teams play each other in the first half, then the
field splits (e.g. rank 1–5 vs 6–10) for the second half. A single standings table does not
represent the full picture, so rankings are not scraped for junior teams.

Additionally, the public API rankings endpoint ignores the `group` parameter and always returns
Gruppe 1 regardless of which group a team plays in.

**TODO**: derive standings from the raw game results stored in the `games` table, or explore
whether a group-aware rankings endpoint exists.

### `mode=list` group filter ignored
`GET /api/games?mode=list&league=14&game_class=14&group=Gruppe+9` returns Gruppe 1 every time.
Use `mode=team&team_id=<id>` instead to get the correct team's games.
