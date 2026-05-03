# SQL Examples

Sample queries against `data/archive/blue_yellow_archive.db`.

## Results

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

**Record against each opponent:**
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

## Events

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

**Events availability per game:**
```sql
SELECT g.date, g.home_team, g.score_home, g.score_away, g.away_team,
       e.available, e.events_complete
FROM games g
LEFT JOIN game_events e ON g.game_id = e.game_id
WHERE g.league_name = 'Junioren U14 B'
ORDER BY g.date;
```

## Travel

**Away games by distance:**
```sql
SELECT g.date, g.home_team, g.score_home, g.score_away, g.away_team,
       v.name AS arena, v.city, v.distance_km
FROM games g
JOIN venues v ON g.venue_id = v.venue_id
WHERE g.league_name = 'Junioren U14 B'
  AND g.is_home = 0
ORDER BY v.distance_km DESC;
```
