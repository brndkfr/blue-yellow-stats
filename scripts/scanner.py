"""Brute-force scanner: crawls a range of game IDs and finds all games for a team."""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import cache as _cache
import db as _db
import geo_helper as _geo
from scraper import _CLUB_NAME, _cfg, _parse_game_detail, _rows


def _team_ids_in_game(data) -> set[int]:
    """Return all team IDs referenced in a game detail response."""
    ids = set()
    for row in _rows(data):
        for cell in row.get("cells", []):
            link = cell.get("link") or {}
            if link.get("page") == "team_detail":
                tid = (link.get("ids") or [None])[0]
                if tid:
                    ids.add(tid)
    return ids


def _final_score(events_data) -> str | None:
    """Extract final score from game_events response.

    Events are in reverse chronological order (countdown timer), so the first
    Torschütze / Eigentor entry encountered is the last goal = final score.
    """
    for region in (events_data or {}).get("data", {}).get("regions", []):
        for row in region.get("rows", []):
            cells = row.get("cells", [])
            if len(cells) >= 2:
                desc = " ".join(cells[1].get("text", []))
                m = re.search(r"(\d+:\d+)$", desc)
                if m and ("orsch" in desc or "igentor" in desc):
                    return m.group(1)
    return None


def _parse_game_header(data) -> dict:
    """Extract date, score, period_scores, and venue from a game detail response.

    The header row contains: home, away, "H:A (p1, p2, p3)", date, time, venue, ...
    The venue map cell carries lat/lng.

    Score is identified by the period-breakdown parenthetical "(p1, p2, p3)" which
    makes it unambiguous vs the game start time (e.g. "11:45").
    """
    result = {
        "date": None,
        "score_home": None,
        "score_away": None,
        "period_scores": None,
        "venue_name": None,
        "venue_lat": None,
        "venue_lng": None,
    }

    date_re = re.compile(r"^\d{2}\.\d{2}\.\d{4}$")
    # Score must include the period breakdown to avoid matching game start times
    score_re = re.compile(r"^(\d+):(\d+)\s+(\(.+\))$")

    for row in _rows(data):
        cells = row.get("cells", [])
        texts = [" ".join(c.get("text", [])) for c in cells]

        # Locate the header row by the presence of a DD.MM.YYYY date
        if not any(date_re.match(t) for t in texts):
            continue

        for t in texts:
            if date_re.match(t):
                result["date"] = t
            m = score_re.match(t)
            if m:
                result["score_home"] = int(m.group(1))
                result["score_away"] = int(m.group(2))
                result["period_scores"] = json.dumps(m.group(3))

        # Venue: map link cell
        for cell in cells:
            link = cell.get("link") or {}
            if link.get("type") == "map":
                vt = cell.get("text", [])
                result["venue_name"] = vt[0] if vt else None
                result["venue_lat"] = link.get("y")
                result["venue_lng"] = link.get("x")

        break  # header row found

    return result


def scan(team_id: int, start: int, end: int, cache_dir: str, ttl: int,
         output: str | None = None) -> list[dict]:
    total = end - start + 1
    hits = []
    no_data = 0

    print(f"[scanner] scanning {start}..{end} ({total} IDs) for team_id={team_id}")

    for gid in range(start, end + 1):
        data = _cache.fetch(f"/api/games/{gid}", {}, cache_dir, ttl)
        if data is None:
            no_data += 1
            continue

        if team_id not in _team_ids_in_game(data):
            continue

        home_id, home_name, away_id, away_name = _parse_game_detail(data)
        header = _parse_game_header(data)
        events = _cache.fetch(f"/api/game_events/{gid}", {}, cache_dir, ttl)

        # Header score (with period breakdown) is authoritative.
        # Fall back to event stream; last resort is "?"
        if header["score_home"] is not None:
            score_str = f"{header['score_home']}:{header['score_away']}"
        else:
            ev_score = _final_score(events)
            if ev_score:
                sh, sa = ev_score.split(":")
                header["score_home"], header["score_away"] = int(sh), int(sa)
            score_str = ev_score or "?"

        hit = {
            "game_id": gid,
            "home_id": home_id,
            "home_name": home_name or "?",
            "away_id": away_id,
            "away_name": away_name or "?",
            "score": score_str,
            "date": header["date"] or "?",
            "score_home": header["score_home"],
            "score_away": header["score_away"],
            "period_scores": header["period_scores"],
            "venue_name": header["venue_name"],
            "venue_lat": header["venue_lat"],
            "venue_lng": header["venue_lng"],
            "events_available": events is not None,
        }
        hits.append(hit)
        print(f"[scanner] {gid} -- HIT  {hit['date']}  "
              f"{hit['home_name']} {hit['score']} {hit['away_name']}")

    checked = total - no_data
    print(f"[scanner] done -- {len(hits)} hit(s) in {checked} game(s) checked "
          f"({no_data} IDs had no data)")

    _print_table(hits)

    if output:
        _write_markdown(hits, team_id, start, end, output)
        print(f"[scanner] results written to {output}")

    return hits


def ingest(hits: list[dict], team_cfg: dict, season: int, db_path: str,
           cache_dir: str, ttl: int) -> None:
    """Write scanner hits into the archive database."""
    db = _db.open_db(db_path)

    _db.upsert_season(db, season, f"{season}/{season + 1}")
    _db.upsert_league(db, {
        "league_id": team_cfg["league_id"],
        "game_class": team_cfg["game_class"],
        "name": team_cfg["league_name"],
        "is_junior": team_cfg.get("is_junior", 1),
    })

    stored = 0
    for h in hits:
        # Venue
        lat, lng = h.get("venue_lat"), h.get("venue_lng")
        dist = round(_geo.haversine_km(lat, lng), 2) if lat and lng else None
        venue_id = _db.get_or_create_venue(
            db, h.get("venue_name") or "", "", lat, lng, dist
        )

        home_name = h["home_name"]
        away_name = h["away_name"]

        # Register teams if IDs are known
        if h["home_id"]:
            _db.upsert_team(db, {
                "team_id": h["home_id"], "name": home_name,
                "league_id": team_cfg["league_id"],
                "game_class": team_cfg["game_class"],
            })
        if h["away_id"]:
            _db.upsert_team(db, {
                "team_id": h["away_id"], "name": away_name,
                "league_id": team_cfg["league_id"],
                "game_class": team_cfg["game_class"],
            })

        game = {
            "game_id": h["game_id"],
            "season": season,
            "date": h["date"],
            "home_team": home_name,
            "home_team_id": h["home_id"],
            "away_team": away_name,
            "away_team_id": h["away_id"],
            "score_home": h["score_home"],
            "score_away": h["score_away"],
            "league_id": team_cfg["league_id"],
            "game_class": team_cfg["game_class"],
            "league_name": team_cfg["league_name"],
            "venue_id": venue_id,
            "is_home": int(_CLUB_NAME.lower() in home_name.lower()),
            "is_junior": team_cfg.get("is_junior", 1),
            "period_scores": h.get("period_scores"),
        }
        _db.upsert_game(db, game)

        import json as _json
        events_data = _cache.fetch(
            f"/api/game_events/{h['game_id']}", {}, cache_dir, ttl
        )
        _db.mark_game_events(
            db, h["game_id"],
            available=events_data is not None,
            raw_json=_json.dumps(events_data) if events_data else None,
        )
        stored += 1

    print(f"[scanner] ingested {stored} game(s) into DB")


def _print_table(hits: list[dict]) -> None:
    if not hits:
        print("[scanner] no games found")
        return
    print()
    print(f"{'Game ID':<10} {'Date':<12} {'Home':<32} {'Score':<7} {'Away':<32} {'Events'}")
    print("-" * 100)
    for h in hits:
        ev = "yes" if h["events_available"] else "no"
        print(f"{h['game_id']:<10} {h.get('date','?'):<12} {h['home_name']:<32} "
              f"{h['score']:<7} {h['away_name']:<32} {ev}")


def _write_markdown(hits: list[dict], team_id: int, start: int, end: int,
                    path: str) -> None:
    lines = [
        f"# Scanner results — team_id={team_id}, range {start}..{end}",
        "",
        "| Game ID | Date | Home | Score | Away | Events |",
        "|---------|------|------|-------|------|--------|",
    ]
    for h in hits:
        ev = "yes" if h["events_available"] else "no"
        lines.append(
            f"| {h['game_id']} | {h.get('date','?')} | {h['home_name']} "
            f"| {h['score']} | {h['away_name']} | {ev} |"
        )
    lines.append("")
    Path(path).write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scan a range of game IDs and report all games involving a team"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--team-id", type=int, metavar="ID",
                       help="Numeric team ID to search for")
    group.add_argument("--team", metavar="NAME",
                       help="Team name as in config.json (e.g. 'Jets U14B')")
    parser.add_argument("--start", type=int, required=True,
                        help="First game ID to check (inclusive)")
    parser.add_argument("--end", type=int, required=True,
                        help="Last game ID to check (inclusive)")
    parser.add_argument("--season", type=int,
                        help="Season year (e.g. 2025) — required with --ingest")
    parser.add_argument("--ingest", action="store_true",
                        help="Write found games into the archive database")
    parser.add_argument("--output", metavar="FILE",
                        help="Write results to this markdown file")
    args = parser.parse_args()

    if args.ingest and not (args.team and args.season):
        parser.error("--ingest requires --team NAME and --season YEAR")

    cfg = _cfg()
    cache_dir = str(ROOT / cfg["cache_dir"])
    ttl = cfg["cache_ttl_hours"]
    db_path = str(ROOT / cfg["db_path"])

    team_cfg = None
    if args.team:
        team_cfg = next(
            (t for t in cfg["teams"] if t["name"].lower() == args.team.lower()), None
        )
        if not team_cfg:
            available = [t["name"] for t in cfg["teams"]]
            print(f"[scanner] team '{args.team}' not found in config.json")
            print(f"[scanner] available: {available}")
            sys.exit(1)
        team_id = team_cfg["team_id"]
        print(f"[scanner] resolved '{args.team}' -> team_id={team_id}")
    else:
        team_id = args.team_id

    hits = scan(team_id, args.start, args.end, cache_dir, ttl, args.output)

    if args.ingest:
        ingest(hits, team_cfg, args.season, db_path, cache_dir, ttl)
