"""SQLite persistence layer using sqlite-utils."""

import os
from sqlite_utils import Database

_JUNIOR_GAME_CLASSES = set()


def open_db(db_path: str) -> Database:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    db = Database(db_path)
    _ensure_schema(db)
    return db


def _ensure_schema(db: Database) -> None:
    existing = db.table_names()

    if "seasons" not in existing:
        db["seasons"].create({"year": int, "label": str}, pk="year")

    if "clubs" not in existing:
        db["clubs"].create({
            "club_id": int, "name": str, "city": str, "home_venue": str,
        }, pk="club_id")

    if "venues" not in existing:
        db["venues"].create({
            "venue_id": int, "name": str, "city": str,
            "lat": float, "lng": float, "distance_km": float,
        }, pk="venue_id")

    if "teams" not in existing:
        db["teams"].create({
            "team_id": int, "name": str, "league_id": int, "game_class": int,
        }, pk="team_id")

    if "leagues" not in existing:
        db["leagues"].create({
            "league_id": int, "game_class": int,
            "name": str, "is_junior": int,
        }, pk=["league_id", "game_class"])

    if "games" not in existing:
        db["games"].create({
            "game_id": int, "season": int, "date": str,
            "home_team": str, "home_team_id": int,
            "away_team": str, "away_team_id": int,
            "score_home": int, "score_away": int,
            "league_id": int, "game_class": int,
            "league_name": str,
            "venue_id": int,
            "is_home": int,
            "is_junior": int,
            "is_cancelled": int,
            "period_scores": str,  # JSON or None
        }, pk="game_id")
    else:
        cols = {c.name for c in db["games"].columns}
        if "is_cancelled" not in cols:
            db["games"].add_column("is_cancelled", int)

    if "players" not in existing:
        db["players"].create({
            "player_id": int, "club_id": int, "name": str, "position": str,
            "birth_year": int, "height_cm": int, "is_junior": int,
            "swissunihockey_id": int, "internal_id": str, "composed_id": str,
        }, pk="player_id")
    else:
        cols = {c.name for c in db["players"].columns}
        if "swiss_id" in cols and "swissunihockey_id" not in cols:
            db.execute("ALTER TABLE players RENAME COLUMN swiss_id TO swissunihockey_id")
        elif "swissunihockey_id" not in cols:
            db["players"].add_column("swissunihockey_id", int)
        if "internal_id" not in cols:
            db["players"].add_column("internal_id", str)
        if "composed_id" not in cols:
            db["players"].add_column("composed_id", str)

    if "player_seasons" not in existing:
        db["player_seasons"].create({
            "player_id": int, "season": int, "club_id": int, "league_name": str,
            "games": int, "goals": int, "assists": int, "points": int, "pim": int,
        }, pk=["player_id", "season"])

    if "player_games" not in existing:
        db["player_games"].create({
            "player_id": int, "game_id": int,
            "goals": int, "assists": int, "points": int, "pim": int,
        }, pk=["player_id", "game_id"])

    if "rankings" not in existing:
        db["rankings"].create({
            "season": int, "league_id": int, "game_class": int,
            "team_id": int, "team_name": str, "rank": int, "played": int,
            "wins": int, "overtime_wins": int,
            "overtime_losses": int, "losses": int,
            "goals_for": int, "goals_against": int,
            "goal_diff": int, "points": int,
        }, pk=["season", "league_id", "game_class", "team_id"])

    if "game_events" not in existing:
        db["game_events"].create({
            "game_id": int, "available": int, "raw_json": str,
            "events_complete": int,  # 1=goal count matches score, 0=mismatch, NULL=unknown
        }, pk="game_id")
    else:
        cols = {c.name for c in db["game_events"].columns}
        if "events_complete" not in cols:
            db["game_events"].add_column("events_complete", int)

    if "game_event_details" not in existing:
        db["game_event_details"].create({
            "id":                  int,
            "game_id":             int,
            "seq":                 int,
            "period":              int,
            "game_time":           str,
            "event_type":          str,
            "team":                str,
            "player":              str,
            "player_internal_id":  str,
            "assist":              str,
            "assist_internal_id":  str,
            "score_home":          int,
            "score_away":          int,
            "penalty_reason":      str,
        }, pk="id")
        db["game_event_details"].create_index(["game_id", "seq"], unique=True)
    else:
        cols = {c.name for c in db["game_event_details"].columns}
        if "player_internal_id" not in cols:
            db["game_event_details"].add_column("player_internal_id", str)
        if "assist_internal_id" not in cols:
            db["game_event_details"].add_column("assist_internal_id", str)

    if "player_name_map" not in existing:
        db["player_name_map"].create({
            "raw_name":  str,
            "team_name": str,
            "season":    int,
            "player_id": int,
        }, pk=["raw_name", "team_name", "season"])

    if "game_corrections" not in existing:
        db["game_corrections"].create({
            "game_id":    int,
            "field":      str,
            "value":      str,   # stored as text; NULL means set the field to NULL
            "reason":     str,
            "created_at": str,
        }, pk=["game_id", "field"])


def configure_junior_classes(game_classes: list[int]) -> None:
    _JUNIOR_GAME_CLASSES.update(game_classes)


def anonymize(name: str, is_junior: bool) -> str:
    if not is_junior:
        return name
    parts = name.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1][0]}."
    return name


def upsert_season(db: Database, year: int, label: str) -> None:
    db["seasons"].upsert({"year": year, "label": label}, pk="year")


def get_or_create_venue(db: Database, name: str, city: str,
                        lat: float = None, lng: float = None,
                        distance_km: float = None) -> int:
    existing = next(db["venues"].rows_where("name=? AND city=?", [name, city]), None)
    if existing:
        return existing["venue_id"]
    return db["venues"].insert({
        "name": name, "city": city,
        "lat": lat, "lng": lng, "distance_km": distance_km,
    }).last_pk


def upsert_club(db: Database, row: dict) -> None:
    db["clubs"].upsert(row, pk="club_id")


def upsert_league(db: Database, row: dict) -> None:
    db["leagues"].upsert(row, pk=["league_id", "game_class"])


def upsert_game(db: Database, row: dict) -> None:
    db["games"].upsert(row, pk="game_id")


# ---------- game corrections -------------------------------------------------

_CORRECTION_FIELDS = {"season", "score_home", "score_away", "date", "is_home",
                      "is_cancelled", "venue_id"}


def upsert_game_correction(db: Database, game_id: int, field: str,
                            value, reason: str) -> None:
    if field not in _CORRECTION_FIELDS:
        raise ValueError(f"Unknown correction field '{field}'. "
                         f"Allowed: {sorted(_CORRECTION_FIELDS)}")
    import datetime
    db["game_corrections"].upsert({
        "game_id":    game_id,
        "field":      field,
        "value":      str(value) if value is not None else None,
        "reason":     reason,
        "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
    }, pk=["game_id", "field"])


def apply_game_corrections(db: Database, game_id: int) -> bool:
    """Re-apply all corrections for game_id onto the games table.

    Returns True if any corrections existed, False if none.
    Called automatically after every ingest_game so corrections survive syncs.
    """
    rows = list(db["game_corrections"].rows_where("game_id=?", [game_id]))
    if not rows:
        return False

    # Cast values back to appropriate Python types before upserting
    _int_fields = {"season", "score_home", "score_away", "is_home",
                   "is_cancelled", "venue_id"}
    update = {"game_id": game_id}
    for row in rows:
        field = row["field"]
        raw = row["value"]
        if raw is None:
            update[field] = None
        elif field in _int_fields:
            update[field] = int(raw)
        else:
            update[field] = raw

    db["games"].upsert(update, pk="game_id")
    return True


def list_game_corrections(db: Database, game_id: int = None) -> list[dict]:
    if game_id is not None:
        return list(db["game_corrections"].rows_where(
            "game_id=?", [game_id], order_by="game_id, field"))
    return list(db["game_corrections"].rows_where(order_by="game_id, field"))


def upsert_player(db: Database, row: dict) -> None:
    db["players"].upsert(row, pk="player_id")


def upsert_player_season(db: Database, row: dict) -> None:
    db["player_seasons"].upsert(row, pk=["player_id", "season"])


def upsert_player_game(db: Database, row: dict) -> None:
    db["player_games"].upsert(row, pk=["player_id", "game_id"])


def record_player_name_sighting(db: Database, raw_name: str, team_name: str,
                                 season: int, player_id: int) -> None:
    """Record a (name, team, season) → player_id mapping. Ignores if already set.

    Manual overrides can be inserted directly into player_name_map; this
    function will not overwrite an existing row, so overrides take precedence
    the next time resolve_or_create_junior_player runs a fresh aggregation.
    """
    db.execute(
        "INSERT OR IGNORE INTO player_name_map(raw_name, team_name, season, player_id) VALUES (?,?,?,?)",
        [raw_name, team_name, season, player_id],
    )


def lookup_player_name_map(db: Database, raw_name: str, team_name: str,
                            season: int) -> int | None:
    """Return a manually-overridden player_id for (name, team, season), or None."""
    row = db.execute(
        "SELECT player_id FROM player_name_map WHERE raw_name=? AND team_name=? AND season=?",
        [raw_name, team_name, season],
    ).fetchone()
    return row[0] if row else None


def upsert_team(db: Database, row: dict) -> None:
    db["teams"].upsert(row, pk="team_id")


def upsert_ranking(db: Database, row: dict) -> None:
    db["rankings"].upsert(row, pk=["season", "league_id", "game_class", "team_id"])


def mark_game_events(db: Database, game_id: int, available: bool,
                     raw_json: str = None, events_complete: int = None) -> None:
    db["game_events"].upsert({
        "game_id": game_id,
        "available": int(available),
        "raw_json": raw_json,
        "events_complete": events_complete,
    }, pk="game_id")


def store_event_details(db: Database, game_id: int, event_rows: list) -> None:
    db.execute("DELETE FROM game_event_details WHERE game_id=?", [game_id])
    if event_rows:
        db["game_event_details"].insert_all(event_rows)


def clear_event_details(db: Database, game_id: int) -> None:
    db.execute("DELETE FROM game_event_details WHERE game_id=?", [game_id])
