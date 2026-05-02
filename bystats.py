"""bystats — unified CLI for the blue-yellow-stats pipeline.

Usage:
    uv run bystats.py sync   --team "Jets U14B" --season 2025
    uv run bystats.py scan   --team "Jets U14B" --season 2025 --start 1093600 --end 1093800
    uv run bystats.py game   1093702 --team "Jets U14B" --season 2025 [--force]
    uv run bystats.py events 1093702 [--force]
    uv run bystats.py status [--team "Jets U14B"]
    uv run bystats.py player-stats --team "Jets U14B" --season 2025 [--show]
    uv run bystats.py check-player-collisions
    uv run bystats.py correct 1093702 --field season --value 2024 --reason "wrong season"
    uv run bystats.py cancel  1093702 --reason "game was cancelled"
    uv run bystats.py corrections [--game 1093702]
    uv run bystats.py game-summary 1093711
    uv run bystats.py config --season 2026
"""

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "scripts"))

from rich import print as rprint
from rich.console import Console
from rich.logging import RichHandler
from rich.progress import BarColumn, MofNCompleteColumn, Progress, TextColumn, TimeElapsedColumn
from rich.table import Table

import api as _api
import cache as _cache
import db as _db
import pipeline as _pipe

console = Console()

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(console=console, show_path=False, markup=True)],
)
log = logging.getLogger("bystats")


# ---------- helpers ----------------------------------------------------------

def _open(config: dict):
    db_path = str(ROOT / config["db_path"])
    return _db.open_db(db_path)


def _cache_args(config: dict) -> tuple[str, int]:
    return str(ROOT / config["cache_dir"]), config["cache_ttl_hours"]


def _require_team(config: dict, name: str) -> dict:
    tcfg = _api.team_cfg(config, name)
    if tcfg is None:
        available = [t["name"] for t in config["teams"]]
        log.error("team [bold]%s[/bold] not found. Available: %s", name, ", ".join(available))
        sys.exit(1)
    return tcfg


def _summary_table(title: str, rows: list[tuple[str, str]]) -> Table:
    t = Table(title=title, show_header=False, box=None, padding=(0, 2))
    t.add_column(style="dim")
    t.add_column(style="bold")
    for label, value in rows:
        t.add_row(label, value)
    return t


# ---------- sync -------------------------------------------------------------

def cmd_sync(args, config: dict) -> None:
    tcfg = _require_team(config, args.team)
    cache_dir, ttl = _cache_args(config)
    lookback = args.lookback or config.get("scan_lookback", 150)
    db = _open(config)

    log.info("sync [bold]%s[/bold]  season=%d  lookback=%d", args.team, args.season, lookback)

    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    ) as progress:
        task = progress.add_task("Scanning game IDs...", total=None)

        def on_progress(current, total):
            progress.update(task, completed=current, total=total)

        def on_hit(gid, date, home, score, away):
            tag = "[yellow]~[/yellow]" if score == "Abgesagt" else "[green]+[/green]"
            progress.console.print(
                f"  {tag} {gid}  {date}  {home} [bold]{score}[/bold] {away}"
            )

        result = _pipe.sync_team(
            args.team, args.season, db, cache_dir, ttl,
            scan_lookback=lookback,
            progress_cb=on_progress,
            hit_cb=on_hit,
        )
        progress.update(task, description="Done")

    console.print()
    console.print(_summary_table(
        f"{args.team} — season {args.season}/{args.season + 1}",
        [
            ("Games found",      str(result["found"])),
            ("Ingested",         str(result["ingested"])),
            ("Events available", f"{result['events_available']} / {result['found']}"),
            ("Players tracked",  str(result.get("players_resolved", 0))),
        ],
    ))


# ---------- scan -------------------------------------------------------------

def cmd_scan(args, config: dict) -> None:
    tcfg = _require_team(config, args.team)
    cache_dir, ttl = _cache_args(config)
    db = _open(config)

    log.info("scan [bold]%s[/bold]  %d..%d  season=%d",
             args.team, args.start, args.end, args.season)

    total = args.end - args.start + 1
    hits = []

    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Scanning...", total=total)

        for gid in range(args.start, args.end + 1):
            data = _cache.fetch(f"/api/games/{gid}", {}, cache_dir, ttl)
            if data is not None and tcfg["team_id"] in _api.team_ids_in_game(data):
                hits.append(gid)
                header = _api.parse_game_header(data)
                home_id, home_name, away_id, away_name = _api.parse_game_detail(data)
                date = header["date"] or "?"
                if header.get("is_cancelled"):
                    score_str = "Abgesagt"
                    tag = "[yellow]~[/yellow]"
                else:
                    events = _cache.fetch(f"/api/game_events/{gid}", {}, cache_dir, ttl)
                    score_home = header["score_home"]
                    score_away = header["score_away"]
                    if score_home is None and events:
                        ev = _api.final_score_from_events(events)
                        if ev:
                            score_home, score_away = (int(x) for x in ev.split(":"))
                    score_str = f"{score_home}:{score_away}" if score_home is not None else "?"
                    tag = "[green]+[/green]"
                progress.console.print(
                    f"  {tag} {gid}  {date}  "
                    f"{home_name or '?'} [bold]{score_str}[/bold] {away_name or '?'}"
                )
                club_partial = config.get("club_name_partial", "Kloten-Dietlikon")
                tcfg_with_partial = {**tcfg, "_club_name_partial": club_partial}
                _pipe.ingest_game(gid, tcfg_with_partial, args.season, db, cache_dir, ttl)
            progress.advance(task)

    console.print()
    log.info("%d hit(s) in %d IDs scanned — all ingested", len(hits), total)


# ---------- game -------------------------------------------------------------

def cmd_game(args, config: dict) -> None:
    tcfg = _require_team(config, args.team)
    cache_dir, ttl = _cache_args(config)
    db = _open(config)
    club_partial = config.get("club_name_partial", "Kloten-Dietlikon")
    tcfg = {**tcfg, "_club_name_partial": club_partial}

    force_str = " [bold yellow](force)[/bold yellow]" if args.force else ""
    log.info("game [bold]%d[/bold]%s  team=%s  season=%d",
             args.game_id, force_str, args.team, args.season)

    ok = _pipe.ingest_game(args.game_id, tcfg, args.season, db, cache_dir, ttl, force=args.force)
    if ok:
        log.info("game [bold]%d[/bold] ingested", args.game_id)
    else:
        log.warning("game [bold]%d[/bold]: no data returned (404 or network error)", args.game_id)


# ---------- events -----------------------------------------------------------

def cmd_events(args, config: dict) -> None:
    cache_dir, ttl = _cache_args(config)
    db = _open(config)

    force_str = " [bold yellow](force)[/bold yellow]" if args.force else ""
    log.info("events [bold]%d[/bold]%s", args.game_id, force_str)

    ok = _pipe.refresh_events(args.game_id, db, cache_dir, ttl, force=args.force)
    if ok:
        log.info("events [bold]%d[/bold]: available, stored", args.game_id)
    else:
        log.warning("events [bold]%d[/bold]: not available (404 or network error)", args.game_id)


# ---------- status -----------------------------------------------------------

def cmd_status(args, config: dict) -> None:
    db = _open(config)

    teams = [args.team] if args.team else [t["name"] for t in config["teams"]]

    for name in teams:
        try:
            s = _pipe.team_status(name, db)
        except ValueError as e:
            log.error(str(e))
            continue
        wdl = f"{s['wins']} W / {s['draws']} D / {s['losses']} L"
        rows = [
            ("Games in DB",      str(s["games"])),
            ("Events available", f"{s['events_available']} / {s['games']}"),
            ("Record",           wdl),
        ]
        if s["cancelled"]:
            rows.append(("Cancelled",  str(s["cancelled"])))
        console.print(_summary_table(f"{s['team']} — {s['league']}", rows))
        console.print()


# ---------- parse-events -----------------------------------------------------

def cmd_parse_events(args, config: dict) -> None:
    db = _open(config)
    force_str = " [bold yellow](force)[/bold yellow]" if args.force else ""
    log.info("parse-events%s", force_str)
    result = _pipe.parse_all_events(db, force=args.force)
    console.print(_summary_table(
        "parse-events",
        [
            ("Parsed",  str(result["parsed"])),
            ("Skipped", str(result["skipped"])),
            ("No data", str(result["no_data"])),
        ],
    ))


# ---------- correct / cancel / corrections -----------------------------------

_VALID_FIELDS = {"season", "score_home", "score_away", "date",
                 "is_home", "is_cancelled", "venue_id"}


def cmd_correct(args, config: dict) -> None:
    if args.field not in _VALID_FIELDS:
        log.error("Unknown field [bold]%s[/bold]. Valid: %s",
                  args.field, ", ".join(sorted(_VALID_FIELDS)))
        sys.exit(1)
    db = _open(config)
    _db.upsert_game_correction(db, args.game_id, args.field, args.value, args.reason)
    _db.apply_game_corrections(db, args.game_id)
    log.info("correction saved and applied: game [bold]%d[/bold]  %s = %s",
             args.game_id, args.field, args.value)


def cmd_cancel(args, config: dict) -> None:
    db = _open(config)
    _db.upsert_game_correction(db, args.game_id, "is_cancelled", "1", args.reason)
    _db.apply_game_corrections(db, args.game_id)
    log.info("game [bold]%d[/bold] marked as cancelled", args.game_id)


def cmd_corrections(args, config: dict) -> None:
    db = _open(config)
    rows = _db.list_game_corrections(db, game_id=args.game if hasattr(args, "game") else None)
    if not rows:
        console.print("[dim]No corrections recorded.[/dim]")
        return
    t = Table(title="Game corrections", show_header=True)
    t.add_column("game_id", justify="right")
    t.add_column("field")
    t.add_column("value")
    t.add_column("reason")
    t.add_column("created_at", style="dim")
    for r in rows:
        t.add_row(str(r["game_id"]), r["field"], str(r["value"] or "NULL"),
                  r["reason"], r["created_at"])
    console.print(t)


# ---------- player-stats -----------------------------------------------------

def cmd_player_stats(args, config: dict) -> None:
    tcfg = _require_team(config, args.team)
    db = _open(config)
    club_id = config["club_id"]

    log.info("player-stats [bold]%s[/bold]  season=%d", args.team, args.season)
    result = _pipe.aggregate_junior_player_stats(db, tcfg, args.season, club_id)

    console.print(_summary_table(
        f"Player stats — {args.team}  season {args.season}/{args.season + 1}",
        [
            ("Players resolved",     str(result["players_resolved"])),
            ("Player-game entries",  str(result["player_games_updated"])),
            ("Player-season entries", str(result["player_seasons_updated"])),
        ],
    ))

    if args.show:
        t = Table(title="Player season totals", show_header=True)
        t.add_column("Name")
        t.add_column("G",  justify="right")
        t.add_column("A",  justify="right")
        t.add_column("Pts", justify="right")
        t.add_column("GP",  justify="right")
        rows = db.execute("""
            SELECT p.name, ps.goals, ps.assists, ps.points, ps.games
            FROM player_seasons ps JOIN players p ON ps.player_id = p.player_id
            WHERE ps.season=? AND ps.league_name=?
            ORDER BY ps.points DESC, ps.goals DESC, p.name
        """, [args.season, tcfg.get("league_name", "")]).fetchall()
        for r in rows:
            t.add_row(r[0], str(r[1]), str(r[2]), str(r[3]), str(r[4]))
        console.print(t)


# ---------- check-player-collisions ------------------------------------------

def cmd_check_player_collisions(args, config: dict) -> None:
    db = _open(config)
    log.info("check-player-collisions")

    # Find internal_ids that appear under more than one player_id in player_name_map
    rows = db.execute("""
        SELECT p.internal_id, COUNT(DISTINCT pnm.player_id) AS n_players,
               GROUP_CONCAT(DISTINCT p2.name) AS names,
               GROUP_CONCAT(DISTINCT pnm.team_name) AS teams
        FROM player_name_map pnm
        JOIN players p  ON pnm.player_id = p.player_id
        JOIN players p2 ON p.internal_id  = p2.internal_id
        GROUP BY p.internal_id
        HAVING n_players > 1
        ORDER BY n_players DESC
    """).fetchall()

    if not rows:
        console.print("[green]No player name collisions detected.[/green]")
        return

    t = Table(title="Potential player collisions", show_header=True)
    t.add_column("internal_id")
    t.add_column("# records", justify="right")
    t.add_column("Names seen")
    t.add_column("Teams seen")
    for r in rows:
        t.add_row(r[0], str(r[1]), r[2] or "", r[3] or "")
    console.print(t)
    console.print()
    console.print(
        "[dim]To fix: insert a row into [bold]player_name_map[/bold] with the correct "
        "player_id, then re-run [bold]player-stats[/bold].[/dim]"
    )


# ---------- game-summary -----------------------------------------------------

def cmd_game_summary(args, config: dict) -> None:
    import summariser as _summariser

    db = _open(config)
    try:
        facts = _pipe.game_facts(db, args.game_id)
    except ValueError as e:
        log.error(str(e))
        sys.exit(1)

    jets_home = facts["jets_home"]
    sh, sa = facts["score_home"], facts["score_away"]
    score_str = f"{sh} - {sa}" if sh is not None else "? - ?"
    home_away = "Home" if jets_home else "Away"

    console.print("[dim]" + "-" * 60 + "[/dim]")
    console.print(
        f"[bold]{facts['home_team']}  {score_str}  {facts['away_team']}[/bold]"
    )
    console.print(f"[dim]{facts['date']} - {facts['league']} - {home_away}[/dim]")
    console.print()

    # Period scores
    period_scores = facts["period_scores"]
    if period_scores:
        t = Table(show_header=True, box=None, padding=(0, 2))
        t.add_column("Periods", style="dim")
        for i in range(len(period_scores)):
            t.add_column(f"P{i + 1}", justify="right")
        jets_row = ["Jets"] + [str(p["home"] if jets_home else p["away"]) for p in period_scores]
        opp_row  = ["Opponent"] + [str(p["away"] if jets_home else p["home"]) for p in period_scores]
        t.add_row(*jets_row)
        t.add_row(*opp_row)
        console.print(t)
        console.print()

    # Jets goals
    jets_goals = facts["jets_goals"]
    if jets_goals:
        console.print("[bold]Jets Goals[/bold]")
        for g in jets_goals:
            assist = f"  ({g['assist']})" if g["assist"] else ""
            own    = "  [dim](own goal)[/dim]" if g.get("is_own_goal") else ""
            sc     = f"  [dim]{g['score']}[/dim]" if g["score"] else ""
            console.print(f"  {g['time']}  {g['player'] or '?'}{assist}{own}{sc}")
        console.print()

    # Jets penalties
    jets_penalties = facts["jets_penalties"]
    if jets_penalties:
        console.print("[bold]Jets Penalties[/bold]")
        for p in jets_penalties:
            reason = f"  {p['reason']}" if p["reason"] else ""
            console.print(f"  {p['time']}  {p['player'] or '?'}  {p['minutes']}'{reason}")
        console.print()

    # Notable
    notable = facts["notable"]
    if notable:
        console.print("[bold]Notable[/bold]")
        for n in notable:
            console.print(f"  * {n}")
        console.print()

    # Bilingual narrative
    console.print("[dim]" + "-" * 60 + "[/dim]")
    try:
        de, en = _summariser.generate_match_report(facts)
    except Exception as exc:
        log.error("Claude API error: %s", exc)
        log.error("Set the ANTHROPIC_API_KEY environment variable and retry.")
        sys.exit(1)
    console.print()
    console.print("[bold]Deutsch[/bold]")
    console.print(de)
    console.print()
    console.print("[bold]English[/bold]")
    console.print(en)
    console.print("[dim]" + "-" * 60 + "[/dim]")


# ---------- config -----------------------------------------------------------

def cmd_config(args, config: dict) -> None:
    import subprocess
    log.info("gen_config --season %d", args.season)
    result = subprocess.run(
        ["uv", "run", "scripts/gen_config.py", "--season", str(args.season)],
        cwd=ROOT,
    )
    sys.exit(result.returncode)


# ---------- CLI wiring -------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="bystats",
        description="blue-yellow-stats pipeline CLI",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # sync
    p = sub.add_parser("sync", help="Fetch all games for a team (mode=team + auto-scan)")
    p.add_argument("--team", required=True, metavar="NAME")
    p.add_argument("--season", required=True, type=int, metavar="YEAR")
    p.add_argument("--lookback", type=int, metavar="N",
                   help="Game IDs to scan before the first Finalrunde game (default: from config)")

    # scan
    p = sub.add_parser("scan", help="Brute-force scan a game ID range and ingest hits")
    p.add_argument("--team", required=True, metavar="NAME")
    p.add_argument("--season", required=True, type=int, metavar="YEAR")
    p.add_argument("--start", required=True, type=int, metavar="ID")
    p.add_argument("--end", required=True, type=int, metavar="ID")

    # game
    p = sub.add_parser("game", help="Fetch / refresh a single game by public API game ID")
    p.add_argument("game_id", type=int, metavar="GAME_ID")
    p.add_argument("--team", required=True, metavar="NAME")
    p.add_argument("--season", required=True, type=int, metavar="YEAR")
    p.add_argument("--force", action="store_true",
                   help="Delete cache entry before fetching (guaranteed fresh data)")

    # events
    p = sub.add_parser("events", help="Fetch / refresh game_events for a single game")
    p.add_argument("game_id", type=int, metavar="GAME_ID")
    p.add_argument("--force", action="store_true")

    # status
    p = sub.add_parser("status", help="Show game counts and records from the DB")
    p.add_argument("--team", metavar="NAME", help="Limit to one team (default: all teams)")

    # parse-events
    p = sub.add_parser("parse-events",
                       help="Parse raw game_events JSON into game_event_details table")
    p.add_argument("--force", action="store_true",
                   help="Re-parse games that already have event details")

    # player-stats
    p = sub.add_parser("player-stats",
                       help="Aggregate goal/assist stats for a junior team from parsed events")
    p.add_argument("--team", required=True, metavar="NAME")
    p.add_argument("--season", required=True, type=int, metavar="YEAR")
    p.add_argument("--show", action="store_true", help="Print the resulting leaderboard")

    # check-player-collisions
    p = sub.add_parser("check-player-collisions",
                       help="Report player names that hash to the same internal_id (possible duplicates)")

    # correct
    p = sub.add_parser("correct", help="Override a single field on a game (survives future syncs)")
    p.add_argument("game_id", type=int, metavar="GAME_ID")
    p.add_argument("--field", required=True,
                   choices=sorted(_VALID_FIELDS), metavar="FIELD")
    p.add_argument("--value", required=True, metavar="VALUE")
    p.add_argument("--reason", required=True, metavar="TEXT")

    # cancel
    p = sub.add_parser("cancel", help="Mark a game as cancelled (excluded from all aggregations)")
    p.add_argument("game_id", type=int, metavar="GAME_ID")
    p.add_argument("--reason", required=True, metavar="TEXT")

    # corrections
    p = sub.add_parser("corrections", help="List all recorded game corrections")
    p.add_argument("--game", type=int, metavar="GAME_ID",
                   help="Limit to a specific game_id")

    # game-summary
    p = sub.add_parser("game-summary",
                       help="Print a structured match report with bilingual Claude narrative")
    p.add_argument("game_id", type=int, metavar="GAME_ID")

    # config
    p = sub.add_parser("config", help="Verify team IDs for a season and write config_YEAR.json")
    p.add_argument("--season", required=True, type=int, metavar="YEAR")

    args = parser.parse_args()
    config = _api.cfg()

    dispatch = {
        "sync":                    cmd_sync,
        "scan":                    cmd_scan,
        "game":                    cmd_game,
        "events":                  cmd_events,
        "status":                  cmd_status,
        "parse-events":            cmd_parse_events,
        "player-stats":            cmd_player_stats,
        "check-player-collisions": cmd_check_player_collisions,
        "correct":                 cmd_correct,
        "cancel":                  cmd_cancel,
        "corrections":             cmd_corrections,
        "game-summary":            cmd_game_summary,
        "config":                  cmd_config,
    }
    dispatch[args.command](args, config)


if __name__ == "__main__":
    main()
