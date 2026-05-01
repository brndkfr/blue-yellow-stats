# Jets U14B — Vorrunde Game IDs (season 2025/26)

The public API `mode=team&team_id=431482` only returns **Finalrunde** (spring round) games.
The **Vorrunde** (fall round) games exist in the API but are not returned by any team-mode call —
they live in a separate competition phase.

## Missing Vorrunde games

| Public Game ID | Date | Home | Score | Away |
|---|---|---|---|---|
| 1093702 | 16.11.2025 | Kloten-Dietlikon Jets | 3:2 | Glattal Falcons |
| 1093709 | 30.11.2025 | Kloten-Dietlikon Jets | 0:6 | UHC Uster II |
| 1093711 | 30.11.2025 | Grasshopper Club Zürich III | 12:2 | Kloten-Dietlikon Jets |
| 1093723 | 21.12.2025 | Kloten-Dietlikon Jets | 0:6 | Bassersdorf Nürensdorf |
| 1093731 | 11.01.2026 | Kloten-Dietlikon Jets | 3:4 | Innebandy Zürich 11 |

Game events are available for all 5 games via `/api/game_events/{game_id}`.

## How they were found

1. `mode=team&team_id=431482&season=2025` returns 7 games (Finalrunde only).
2. Direct game detail calls to IDs in the range 1093700–1093732 revealed 5 more games
   referencing team_id 431482.
3. Scores were extracted from the game events endpoint (events are in reverse chronological order;
   the first `Torschütze X:Y` entry is the final score).

## Full season summary

12 games total: 5 Vorrunde + 7 Finalrunde.
