"""Generate config_<season>.json by verifying existing team_ids and discovering new ones."""

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import cache as _cache

_CLUB_PARTIAL = "Kloten-Dietlikon"


def _cfg():
    with open(ROOT / "config.json", encoding="utf-8") as f:
        return json.load(f)


def _rows(data):
    for region in (data or {}).get("data", {}).get("regions", []):
        yield from region.get("rows", [])


def _text(cell, idx=0):
    return (cell.get("text") or [""])[idx]


def _log(endpoint, params, status, note=""):
    qs = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    url_part = f"{endpoint}?{qs}" if qs else endpoint
    print(f"  > GET {url_part:<70} [{status}]  {note}")


def _fetch(endpoint, params, cfg):
    data = _cache.fetch(endpoint, params, cfg["cache_dir"], cfg["cache_ttl_hours"])
    status = 200 if data is not None else 404
    return data, status


def get_seasons(cfg):
    data, status = _fetch("/api/seasons", {}, cfg)
    entries = (data or {}).get("entries", [])
    _log("/api/seasons", {}, status, f"{len(entries)} seasons")
    return entries


def resolve_season(entries, target):
    for e in entries:
        if e.get("set_in_context", {}).get("season") == target:
            return target
    for e in entries:
        if e.get("highlight"):
            return e["set_in_context"]["season"]
    return entries[0]["set_in_context"]["season"] if entries else target


def get_team_games(team_id, season, cfg):
    params = {"mode": "team", "team_id": team_id, "season": season}
    data, status = _fetch("/api/games", params, cfg)
    rows = list(_rows(data))
    return data, rows, status


def extract_league_from_response(data, rows):
    """Pull league_id and game_class from response context or cell links."""
    ctx = ((data or {}).get("data", {}).get("context") or {})
    if ctx.get("league") and ctx.get("game_class"):
        return ctx["league"], ctx["game_class"]
    for row in rows:
        for cell in row.get("cells", []):
            link = cell.get("link", {})
            if link.get("page") == "league_group_detail":
                ids = link.get("ids", [])
                if len(ids) >= 3:
                    return ids[1], ids[2]
    return None, None


def get_club_games(club_id, season, cfg):
    params = {"mode": "club", "club_id": club_id, "season": season}
    data, status = _fetch("/api/games", params, cfg)
    rows = list(_rows(data))
    _log("/api/games", params, status, f"{len(rows)} games")
    return rows


def discover_jets_team_ids(club_rows, known_ids):
    """Extract Jets team_ids embedded in home/away cell links from mode=club rows."""
    found = {}
    for row in club_rows:
        cells = row.get("cells", [])
        league_ids = (cells[2].get("link", {}).get("ids", []) if len(cells) > 2 else [])
        league_id = league_ids[1] if len(league_ids) > 1 else None
        game_class = league_ids[2] if len(league_ids) > 2 else None

        for cell in cells[3:5]:
            name = _text(cell)
            link = cell.get("link", {})
            tid = (link.get("ids") or [None])[0]
            if (
                tid
                and tid not in known_ids
                and tid not in found
                and _CLUB_PARTIAL.lower() in name.lower()
                and link.get("page") == "team_detail"
            ):
                found[tid] = {"name": name, "league_id": league_id, "game_class": game_class}
    return found


def main():
    parser = argparse.ArgumentParser(description="Generate config_<season>.json")
    parser.add_argument("--season", type=int, required=True, help="Target season year (e.g. 2026)")
    args = parser.parse_args()

    cfg = _cfg()
    season = args.season

    print(f"\nGenerating config for season {season}")
    print("=" * 80)

    # 1. Confirm season is known to the API
    season_entries = get_seasons(cfg)
    resolved = resolve_season(season_entries, season)
    if resolved != season:
        print(f"  ! Season {season} not in API -- using {resolved}")
        season = resolved

    # 2. Verify every team in current config
    print()
    verified_teams = []
    known_ids = {t["team_id"] for t in cfg["teams"]}

    for team in cfg["teams"]:
        data, rows, status = get_team_games(team["team_id"], season, cfg)
        count = len(rows)

        if count > 0:
            api_league, api_class = extract_league_from_response(data, rows)
            new_league = api_league or team["league_id"]
            new_class = api_class or team["game_class"]
            changed = (new_league != team["league_id"] or new_class != team["game_class"])
            note = f"OK {count} games  ({team['league_name']})" + ("  <- league changed" if changed else "")
            entry_status = "verified"
        else:
            new_league, new_class = team["league_id"], team["game_class"]
            note = "not registered yet for this season"
            entry_status = "not_registered"

        params = {"mode": "team", "team_id": team["team_id"], "season": season}
        _log("/api/games", params, status, note)

        verified_teams.append({
            **team,
            "league_id": new_league,
            "game_class": new_class,
            "status": entry_status,
        })

    # 3. Discover new teams via mode=club
    print()
    club_rows = get_club_games(cfg["club_id"], season, cfg)
    discovered = discover_jets_team_ids(club_rows, known_ids)

    new_teams = []
    for tid, info in discovered.items():
        data2, rows2, status2 = get_team_games(tid, season, cfg)
        params2 = {"mode": "team", "team_id": tid, "season": season}
        _log("/api/games", params2, status2, f"NEW: {info['name']}  {len(rows2)} games")
        new_teams.append({
            "name": info["name"],
            "team_id": tid,
            "league_id": info["league_id"],
            "game_class": info["game_class"],
            "league_name": "",
            "is_junior": 1,
            "status": "new",
        })

    # 4. Write output
    all_teams = verified_teams + new_teams
    output = {
        "api_base_url": cfg["api_base_url"],
        "club_id": cfg["club_id"],
        "season": season,
        "teams": all_teams,
        "cache_ttl_hours": cfg["cache_ttl_hours"],
        "cache_dir": cfg["cache_dir"],
        "db_path": cfg["db_path"],
    }

    out_path = ROOT / f"config_{season}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    n_verified = sum(1 for t in all_teams if t.get("status") == "verified")
    n_stale    = sum(1 for t in all_teams if t.get("status") == "not_registered")
    n_new      = sum(1 for t in all_teams if t.get("status") == "new")

    print(f"\n{'='*80}")
    print(f"Written: {out_path}")
    print(f"  {n_verified} verified  |  {n_stale} not registered yet  |  {n_new} new discovered")
    if n_stale:
        print(f"  ! Re-run later once those teams have registered for season {season}")


if __name__ == "__main__":
    main()
