"""bystats — unified CLI for the blue-yellow-stats pipeline.

Usage:
    uv run bystats.py sync   --team "Jets U14B" --season 2025
    uv run bystats.py scan   --team "Jets U14B" --season 2025 --start 1093600 --end 1093800
    uv run bystats.py game   1093702 --team "Jets U14B" --season 2025 [--force]
    uv run bystats.py events 1093702 [--force]
    uv run bystats.py status [--team "Jets U14B"]
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
            progress.console.print(
                f"  [green]+[/green] {gid}  {date}  {home} [bold]{score}[/bold] {away}"
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
                events = _cache.fetch(f"/api/game_events/{gid}", {}, cache_dir, ttl)
                score_home = header["score_home"]
                score_away = header["score_away"]
                if score_home is None and events:
                    ev = _api.final_score_from_events(events)
                    if ev:
                        score_home, score_away = (int(x) for x in ev.split(":"))
                score_str = f"{score_home}:{score_away}" if score_home is not None else "?"
                date = header["date"] or "?"
                progress.console.print(
                    f"  [green]+[/green] {gid}  {date}  "
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
        console.print(_summary_table(
            f"{s['team']} — {s['league']}",
            [
                ("Games in DB",      str(s["games"])),
                ("Events available", f"{s['events_available']} / {s['games']}"),
                ("Record",           wdl),
            ],
        ))
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

    # config
    p = sub.add_parser("config", help="Verify team IDs for a season and write config_YEAR.json")
    p.add_argument("--season", required=True, type=int, metavar="YEAR")

    args = parser.parse_args()
    config = _api.cfg()

    dispatch = {
        "sync":         cmd_sync,
        "scan":         cmd_scan,
        "game":         cmd_game,
        "events":       cmd_events,
        "status":       cmd_status,
        "parse-events": cmd_parse_events,
        "config":       cmd_config,
    }
    dispatch[args.command](args, config)


if __name__ == "__main__":
    main()
