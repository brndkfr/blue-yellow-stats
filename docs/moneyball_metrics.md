# Moneyball Metrics

Player impact metrics tracked beyond simple goals and assists. Used by the [Blue-Yellow Floorball Tracker](blue-yellow-game-tracker.md) for live sideline capture and by the Python analytics pipeline for offline scoring.

## Tracked Events

| Action | Code | Category | Description |
|--------|------|----------|-------------|
| 🔄 Recovery | `recovery` | Possession | Hustle play — winning a loose ball or regaining possession under pressure |
| 🛡️ Stop | `stop` | Defense | Interceptions, shot blocks, or successful box-play defense |
| 🔑 Key Pass | `key_pass` | Playmaking | Pre-assist or high-value transition pass that directly creates a scoring chance |
| 🎯 Slot Shot | `slot_shot` | Offense | High-danger shot taken from the slot area |
| 🧤 Slot Save | `slot_save` | Goalkeeper | High-danger save made from the slot area |
| ⚠️ Turnover | `turnover` | Error | Lost possession in a dangerous area |

## Event Data Schema

Every tracked action logs:

```json
{
  "game_id":     "unique string",
  "opponent":    "team name",
  "period":      1,
  "timestamp":   "MM:SS",
  "player_nr":   12,
  "player_name": "Nils Muster",
  "action":      "stop"
}
```

## Impact Scoring (Planned)

The offline Python analysis will compute a weighted **Impact Score** per player per game:

| Action | Weight | Rationale |
|--------|--------|-----------|
| Recovery | +1 | Possession retention |
| Stop | +2 | High defensive leverage |
| Key Pass | +2 | Pre-assist value |
| Slot Shot | +1 | Offensive quality attempt |
| Slot Save | +3 | Prevents high-danger goals |
| Turnover | -2 | Direct possession loss |

These weights are provisional and will be calibrated against game outcomes over the season.

## Integration with Analytics Pipeline

The live-tracking events feed a separate data source from the official swissunihockey API. The SQLite pipeline (`scripts/pipeline.py`) ingests official results (goals, assists, penalties from `game_event_details`). Moneyball events augment that with hustle and defensive data not captured by the official feed.

A future merge step will join both sources on `(game_id, player_name)` to build a unified per-player profile.
