/* Live tracker screen — Jets brand palette, Lucide icons, modern sports-app UX.
   Replaces all emoji from the source app with clean SVG icons.
   Brand: #0033a0 navy · #ffcd00 gold
   Roles: defender (shield/blue) · center (circle-dot/white) · winger (zap/green) */

const LS_QUEUE_KEY = 'jets_event_queue';

function _readQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]'); }
  catch (_) { return []; }
}
function _writeQueue(q) {
  try { localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(q)); }
  catch (_) {}
}

const FIELD_ROLES = [
  { id: "defender", icon: "shield",      label: "Def",  color: "#60a5fa", bg: "rgba(37,99,235,.2)",  border: "rgba(96,165,250,.4)"   },
  { id: "center",   icon: "circle-dot",  label: "Ctr",  color: "rgba(255,255,255,.75)", bg: "rgba(255,255,255,.08)", border: "rgba(255,255,255,.22)" },
  { id: "winger",   icon: "zap",         label: "Wing", color: "#4ade80", bg: "rgba(34,197,94,.18)", border: "rgba(74,222,128,.4)"   },
];

const GOALIE_ACTIONS = [
  { code: "save",       label: "Parade",        icon: "shield-check",  tint: "blue"   },
  { code: "mega_save",  label: "Mega Parade",   icon: "award",         tint: "yellow" },
  { code: "key_pass",   label: "Schlüsselpass", icon: "key",           tint: "yellow" },
  { code: "bad_throw",  label: "Fehlauswurf",   icon: "alert-circle",  tint: "red"    },
];
const PLAYER_ACTIONS = [
  { code: "recovery",   label: "Ballgewinn",    icon: "refresh-cw",    tint: "blue"   },
  { code: "defense",    label: "Abwehr",        icon: "shield",        tint: "blue"   },
  { code: "key_pass",   label: "Schlüsselpass", icon: "key",           tint: "yellow" },
  { code: "slot_shot",  label: "Torschuss",     icon: "crosshair",     tint: "yellow" },
  { code: "bad_pass",   label: "Fehlpass",      icon: "alert-circle",  tint: "red",   span: 2 },
];
const GEGENGOAL_REASONS = [
  { code: "bad_pass",     label: "Fehlpass",        icon: "alert-circle", tint: "red"     },
  { code: "no_coverage",  label: "Deckungsfehler",  icon: "shield-off",   tint: "red"     },
  { code: "counter",      label: "Konter",          icon: "zap",          tint: "yellow"  },
  { code: "unlucky",      label: "Pech",            icon: "dices",        tint: "neutral" },
  { code: "power_play",   label: "Überzahl",        icon: "users",        tint: "blue"    },
  { code: "free_shot",    label: "Freier Schuss",   icon: "crosshair",    tint: "yellow"  },
];

/* Shared navy chrome background used for header + bars */
const CHROME_BG     = "rgba(1,9,35,.95)";
const CHROME_BORDER = "1px solid rgba(255,255,255,.08)";
const GOLD_LINE     = "1px solid rgba(255,205,0,.2)";

function Scrim({ onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 40,
      background: "rgba(0,0,0,.72)", backdropFilter: "blur(3px)",
      WebkitBackdropFilter: "blur(3px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0.75rem 0.75rem",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%" }}>
        {children}
      </div>
    </div>
  );
}

function Grabber() {
  return (
    <div style={{
      width: "2rem", height: "0.25rem",
      borderRadius: "999px", background: "rgba(255,255,255,.15)",
      margin: "0 auto 1rem",
    }} />
  );
}

function IconBtn({ name, onClick, label, badge }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      appearance: "none", cursor: "pointer",
      width: "2.25rem", height: "2.25rem",
      borderRadius: "var(--radius-pill)",
      background: "rgba(255,255,255,.06)",
      border: "1px solid rgba(255,255,255,.1)",
      color: "rgba(255,255,255,.65)",
      display: "grid", placeItems: "center",
      fontFamily: "var(--font-sans)", position: "relative",
      flexShrink: 0,
    }}>
      <Icon name={name} size={17} strokeWidth={2} />
      {badge && (
        <span style={{
          position: "absolute", top: "-3px", right: "-3px",
          width: "0.95rem", height: "0.95rem",
          borderRadius: "999px", background: "#dc2626",
          fontSize: "0.55rem", fontWeight: 700, color: "#fff",
          display: "grid", placeItems: "center",
        }}>{badge}</span>
      )}
    </button>
  );
}

function ScoreDisplay({ us, them }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.4rem",
      background: "rgba(255,255,255,.07)",
      border: "1px solid rgba(255,255,255,.12)",
      borderRadius: "var(--radius-pill)",
      padding: "0.3rem 0.85rem",
    }}>
      <span style={{
        fontWeight: 900, fontSize: "1.375rem", lineHeight: 1,
        color: "#fff", fontVariantNumeric: "tabular-nums",
      }}>{us}</span>
      <span style={{ color: "rgba(255,255,255,.22)", fontSize: "1rem", lineHeight: 1 }}>–</span>
      <span style={{
        fontWeight: 900, fontSize: "1.375rem", lineHeight: 1,
        color: "rgba(255,255,255,.35)", fontVariantNumeric: "tabular-nums",
      }}>{them}</span>
    </div>
  );
}

function SheetSurface({ children, style }) {
  return (
    <div style={{
      background: "#0b1120",
      border: "1px solid rgba(255,255,255,.09)",
      borderRadius: "var(--radius-2xl)",
      padding: "0.75rem 0.85rem 1rem",
      boxShadow: "0 -16px 48px rgba(0,0,0,.6)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function LTBoxPlayPanel({ mode, seconds, onResolve }) {
  const isBox  = mode === "box";
  const mins   = Math.floor(seconds / 60);
  const secs   = seconds % 60;
  const tStr   = `${mins}:${secs.toString().padStart(2, "0")}`;
  const pct    = (seconds / 120) * 100;
  const urgent = seconds <= 30;
  const accent = isBox ? "#f87171" : "#ffcd00";
  return (
    <div style={{ background: isBox ? "rgba(220,38,38,.1)" : "rgba(255,205,0,.08)", border: `1px solid ${isBox ? "rgba(239,68,68,.3)" : "rgba(255,205,0,.25)"}`, borderRadius: "var(--radius-xl)", padding: "0.75rem 0.875rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.625rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: accent, background: isBox ? "rgba(239,68,68,.18)" : "rgba(255,205,0,.12)", padding: "0.2rem 0.55rem", borderRadius: "var(--radius-sm)", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
          <Icon name={isBox ? "shield-off" : "shield-plus"} size={10} color={accent} strokeWidth={2.5} />
          {isBox ? "Unterzahl" : "Überzahl"}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, fontSize: "2rem", lineHeight: 1, letterSpacing: "-0.02em", color: urgent ? "#f87171" : "#fff", transition: "color 0.4s ease" }}>{tStr}</span>
      </div>
      <div style={{ height: "3px", background: "rgba(255,255,255,.08)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: urgent ? "#ef4444" : accent, borderRadius: "2px", transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
        {isBox ? (<>
          <button onClick={() => onResolve("killed")} style={{ appearance: "none", cursor: "pointer", minHeight: "3rem", borderRadius: "var(--radius-lg)", background: "rgba(22,163,74,.16)", border: "1px solid rgba(34,197,94,.3)", color: "#4ade80", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", touchAction: "manipulation" }}>
            <Icon name="shield-check" size={15} color="#4ade80" />Box gekilled
          </button>
          <button onClick={() => onResolve("conceded")} style={{ appearance: "none", cursor: "pointer", minHeight: "3rem", borderRadius: "var(--radius-lg)", background: "rgba(185,28,28,.16)", border: "1px solid rgba(239,68,68,.3)", color: "#fca5a5", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", touchAction: "manipulation" }}>
            <Icon name="circle-x" size={15} color="#fca5a5" />Tor kassiert
          </button>
        </>) : (<>
          <button onClick={() => onResolve("scored")} style={{ appearance: "none", cursor: "pointer", minHeight: "3rem", borderRadius: "var(--radius-lg)", background: "rgba(255,205,0,.14)", border: "1px solid rgba(255,205,0,.35)", color: "#ffcd00", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", touchAction: "manipulation" }}>
            <Icon name="zap" size={15} color="#ffcd00" />Überzahltreffer
          </button>
          <button onClick={() => onResolve("expired")} style={{ appearance: "none", cursor: "pointer", minHeight: "3rem", borderRadius: "var(--radius-lg)", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.45)", fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: "0.8125rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", touchAction: "manipulation" }}>
            <Icon name="clock" size={15} color="rgba(255,255,255,.4)" />Powerplay vorbei
          </button>
        </>)}
      </div>
    </div>
  );
}

function LTStrafeSheet({ onGegentor, onBoxPlay, onPowerPlay, onClose }) {
  const ltRowStyle = { appearance: "none", cursor: "pointer", touchAction: "manipulation", display: "flex", alignItems: "center", gap: "0.85rem", borderRadius: "var(--radius-xl)", padding: "0.85rem 1rem", fontFamily: "var(--font-sans)", textAlign: "left", width: "100%" };
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.65)", zIndex: 45, backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 55, background: "#0b1120", border: "1px solid rgba(255,255,255,.09)", borderBottom: "none", borderRadius: "var(--radius-2xl) var(--radius-2xl) 0 0", padding: "0.75rem 0.85rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem", boxShadow: "0 -16px 48px rgba(0,0,0,.6)" }}>
        <div style={{ width: "2rem", height: "3px", background: "rgba(255,255,255,.15)", borderRadius: "2px", margin: "0 auto 0.25rem" }} />
        <button onClick={onGegentor} style={{ ...ltRowStyle, background: "rgba(185,28,28,.12)", border: "1px solid rgba(220,38,38,.28)" }}>
          <span style={{ display: "grid", placeItems: "center", width: "2.25rem", height: "2.25rem", borderRadius: "var(--radius-lg)", background: "rgba(185,28,28,.2)", flexShrink: 0 }}>
            <Icon name="circle-x" size={18} color="#fca5a5" strokeWidth={2} />
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9375rem", color: "#fff" }}>Gegentor</p>
            <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "rgba(255,255,255,.35)" }}>Gegner hat ein Tor erzielt</p>
          </div>
        </button>
        <button onClick={onBoxPlay} style={{ ...ltRowStyle, background: "rgba(220,38,38,.1)", border: "1px solid rgba(239,68,68,.22)" }}>
          <span style={{ display: "grid", placeItems: "center", width: "2.25rem", height: "2.25rem", borderRadius: "var(--radius-lg)", background: "rgba(239,68,68,.18)", flexShrink: 0 }}>
            <Icon name="shield-off" size={18} color="#f87171" strokeWidth={2} />
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9375rem", color: "#fff" }}>BoxPlay</p>
            <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "rgba(255,255,255,.35)" }}>Jets in Unterzahl — 2 Min.</p>
          </div>
        </button>
        <button onClick={onPowerPlay} style={{ ...ltRowStyle, background: "rgba(255,205,0,.07)", border: "1px solid rgba(255,205,0,.2)" }}>
          <span style={{ display: "grid", placeItems: "center", width: "2.25rem", height: "2.25rem", borderRadius: "var(--radius-lg)", background: "rgba(255,205,0,.1)", flexShrink: 0 }}>
            <Icon name="shield-plus" size={18} color="#ffcd00" strokeWidth={2} />
          </span>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9375rem", color: "#fff" }}>Powerplay</p>
            <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "rgba(255,255,255,.35)" }}>Jets in Überzahl — 2 Min.</p>
          </div>
        </button>
      </div>
    </>
  );
}

function LiveTracker({ game, goalies, players, scriptUrl, onBack, initialRoles = {} }) {
  const [period,      setPeriod]      = React.useState(1);
  const [format,      setFormat]      = React.useState(game.format || 2);
  const [active,      setActive]      = React.useState(null);
  const [assistFor,   setAssistFor]   = React.useState(null);
  const [powerPlay,   setPowerPlay]   = React.useState(false);
  const [gegengoal,   setGegengoal]   = React.useState(false);
  const [help,        setHelp]        = React.useState(false);
  const [toast,       setToast]       = React.useState(null);
  const [lastEvent,   setLastEvent]   = React.useState(null);
  const [score,       setScore]       = React.useState({ us: 0, them: 0 });
  const [boxPlay,     setBoxPlay]     = React.useState(null); // null | { mode:"box"|"power", seconds:120 }
  const [playerRoles, setPlayerRoles] = React.useState(() => {
    const r = {};
    players.forEach((p) => { r[p.id] = (initialRoles && initialRoles[p.id]) || p.role || "center"; });
    return r;
  });
  const [queueSize,   setQueueSize]   = React.useState(() => _readQueue().length);
  const toastTimer = React.useRef(null);
  const flushRef   = React.useRef(null);

  // Flush offline queue on mount, on window focus, and on tab visibility
  React.useEffect(() => {
    if (!scriptUrl) return;

    async function flush() {
      const q = _readQueue();
      if (q.length === 0) return;
      const remaining = [];
      for (const params of q) {
        try {
          await fetch(scriptUrl, { method: 'POST', body: new URLSearchParams(params) });
        } catch (_) {
          remaining.push(params);
        }
      }
      _writeQueue(remaining);
      setQueueSize(remaining.length);
    }

    flushRef.current = flush;
    flush();

    function onFocus() { flushRef.current?.(); }
    function onVisible() { if (document.visibilityState === 'visible') flushRef.current?.(); }

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scriptUrl]);

  React.useEffect(() => {
    if (!boxPlay) return;
    if (boxPlay.seconds <= 0) {
      fireToast({ icon: "clock", tone: "info", text: "Strafe abgelaufen" });
      setBoxPlay(null); return;
    }
    const t = setTimeout(() => setBoxPlay((p) => p ? { ...p, seconds: p.seconds - 1 } : null), 1000);
    return () => clearTimeout(t);
  }, [boxPlay]);

  const isGoalie    = (p) => goalies.some((g) => g.id === p?.id);
  const getRole     = (p) => playerRoles[p?.id] || "center";
  const setRole     = (id, role) => setPlayerRoles((prev) => ({ ...prev, [id]: role }));
  const toggleFormat = () => { setPeriod(1); setFormat((f) => f === 2 ? 3 : 2); };

  function fireToast(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  function postEvent(fields) {
    if (!scriptUrl) return;
    const params = {
      game_id:    game.id       || "",
      game_date:  game.date     || "",
      game_start: game.time     || "",
      opponent:   game.opponent || "",
      type:       game.type     || "",
      venue:      game.venue    || "",
      home:       game.home ? "yes" : "no",
      period:     String(period),
      timestamp:  new Date().toISOString(),
      scout:      localStorage.getItem("jets_scout") || "",
      was_queued: "no",
      ...fields,
    };
    fetch(scriptUrl, { method: "POST", body: new URLSearchParams(params) })
      .then(() => { flushRef.current?.(); })
      .catch(() => {
        const q = _readQueue();
        q.push({ ...params, was_queued: "yes" });
        _writeQueue(q);
        setQueueSize(q.length);
      });
  }

  function sendAction(a) {
    postEvent({
      player_id:   String(active.id  || ""),
      player_nr:   active.nr ? String(active.nr) : "",
      player_name: active.name,
      action:      a.code,
    });
    const t = { icon: "check", tone: "info", text: `${a.label} — ${active.nr ? "#" + active.nr + " " : ""}${active.name}` };
    setLastEvent(t); fireToast(t); setActive(null);
  }
  function startGoal() { setAssistFor(active); setActive(null); }
  function pickAssist(p) {
    if (p.id === assistFor.id) return;
    const scorer = assistFor.nr ? `#${assistFor.nr} ${assistFor.name}` : assistFor.name;
    finishGoal(
      `Goal ${scorer} · Assist ${p.name}${powerPlay ? " · PP" : ""}`,
      p,
    );
  }
  function skipAssist() {
    const scorer = assistFor.nr ? `#${assistFor.nr} ${assistFor.name}` : assistFor.name;
    finishGoal(`Goal ${scorer}${powerPlay ? " · PP" : ""}`, null);
  }
  function finishGoal(text, assistPlayer) {
    postEvent({
      player_id:   String(assistFor.id  || ""),
      player_nr:   assistFor.nr ? String(assistFor.nr) : "",
      player_name: assistFor.name,
      action:      "goal",
      assist_id:   assistPlayer ? String(assistPlayer.id  || "") : "",
      assist_nr:   assistPlayer && assistPlayer.nr ? String(assistPlayer.nr) : "",
      assist_name: assistPlayer ? assistPlayer.name : "",
      power_play:  powerPlay ? "yes" : "",
    });
    setScore((s) => ({ ...s, us: s.us + 1 }));
    const t = { icon: "goal", tone: "success", text };
    setLastEvent(t); fireToast(t);
    setAssistFor(null); setPowerPlay(false);
  }
  function pickReason(r) {
    postEvent({
      player_id:   "",
      player_nr:   "",
      player_name: "",
      action:      "gegengoal",
      reason:      r ? r.code : "",
    });
    setScore((s) => ({ ...s, them: s.them + 1 }));
    const t = { icon: "shield-off", tone: "pending", text: `Gegengoal${r ? ` · ${r.label}` : ""}` };
    setLastEvent(t); fireToast(t); setGegengoal(false);
  }
  function undo() {
    if (!lastEvent) return;
    fireToast({ icon: "undo-2", tone: "info", text: "Korrektur gesendet" });
    setLastEvent(null);
  }

  function resolveBoxPlay(type) {
    const msgs = {
      killed:   { icon: "shield-check", tone: "success", text: "Box gekilled!" },
      conceded: { icon: "circle-x",     tone: "pending", text: "Unterzahltor kassiert" },
      scored:   { icon: "zap",          tone: "success", text: "Überzahltreffer!" },
      expired:  { icon: "clock",        tone: "info",    text: "Powerplay vorbei" },
    }[type];
    postEvent({ action: type === "killed" ? "box_killed" : type === "conceded" ? "box_conceded" : type === "scored" ? "pp_scored" : "pp_expired" });
    if (type === "conceded") setScore((s) => ({ ...s, them: s.them + 1 }));
    if (type === "scored")   setScore((s) => ({ ...s, us: s.us + 1 }));
    if (msgs) fireToast(msgs);
    setBoxPlay(null);
  }

  function tileState(p) {
    if (assistFor) return assistFor.id === p.id ? "disabled" : "assistTarget";
    return active?.id === p.id ? "selected" : "default";
  }
  function onTile(p) {
    if (assistFor) { pickAssist(p); return; }
    setActive(active?.id === p.id ? null : p);
  }

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      background: "var(--bg-app)", color: "#fff", userSelect: "none",
    }}>

      {/* ── Header ── */}
      <header style={{
        flexShrink: 0, zIndex: 20,
        background: CHROME_BG,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: GOLD_LINE,
        padding: "0.7rem 0.75rem 0.6rem",
        display: "flex", flexDirection: "column", gap: "0.55rem",
      }}>

        {/* Row 1: back + title | score | help */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1 }}>
            <IconBtn name="chevron-left" onClick={onBack} label="Zurück zu Spielen" />
            <div style={{ minWidth: 0 }}>
              <p style={{
                margin: 0, fontWeight: 700, fontSize: "0.875rem",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                color: "#fff",
              }}>Jets · {game.opponent}</p>
              <p style={{ margin: 0, fontSize: "0.6875rem", color: "rgba(255,255,255,.38)" }}>
                {game.venue || "Vollkader"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
            <ScoreDisplay us={score.us} them={score.them} />
            {queueSize > 0 && (
              <IconBtn name="wifi-off" label={`${queueSize} ausstehend`} badge={queueSize}
                onClick={() => flushRef.current?.()} />
            )}
            <IconBtn name="circle-help" onClick={() => setHelp(true)} label="Hilfe" />
          </div>
        </div>

        {/* Row 2: period tabs + undo */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Format toggle */}
          <button onClick={toggleFormat} style={{
            flexShrink: 0, appearance: "none", cursor: "pointer",
            padding: "0.4rem 0.55rem", borderRadius: "var(--radius-md)",
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.1)",
            color: "rgba(255,255,255,.55)",
            fontSize: "0.6875rem", fontWeight: 700, lineHeight: 1,
            letterSpacing: "0.04em", touchAction: "manipulation",
          }}>{format === 2 ? "2×H" : "3×D"}</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PeriodTabs format={format} active={period} onChange={setPeriod} />
          </div>
          <Button variant="secondary" size="sm" icon="undo-2"
            disabled={!lastEvent} onClick={undo}>Undo</Button>
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position: "absolute", top: "7rem", left: "0.75rem", right: "0.75rem", zIndex: 30 }}>
          <Toast tone={toast.tone} icon={toast.icon}>{toast.text}</Toast>
        </div>
      )}

      {/* ── Roster ── */}
      <main style={{
        flex: 1, overflowY: "auto",
        padding: "1rem 0.75rem",
        display: "flex", flexDirection: "column", gap: "1.25rem",
      }}>
        {boxPlay && (
          <LTBoxPlayPanel mode={boxPlay.mode} seconds={boxPlay.seconds} onResolve={resolveBoxPlay} />
        )}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <SectionLabel count={goalies.length}>Goalie</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "var(--tile-gap)" }}>
            {goalies.map((g) => (
              <RosterTile key={g.id} nr={g.nr} name={g.name} role="goalie"
                state={tileState(g)} onClick={() => onTile(g)} />
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <SectionLabel count={players.length}>Feldspieler</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--tile-gap)" }}>
            {players.map((p) => (
              <RosterTile key={p.id} nr={p.nr} name={p.name} role="player"
                playerRole={playerRoles[p.id] || "center"}
                state={tileState(p)} onClick={() => onTile(p)} />
            ))}
          </div>
        </section>
      </main>

      {/* ── Assist strip ── */}
      {assistFor && (
        <div style={{
          flexShrink: 0, zIndex: 20,
          background: "rgba(0,5,20,.97)",
          borderTop: "2px solid rgba(255,205,0,.45)",
          padding: "0.6rem 0.75rem",
          display: "flex", flexDirection: "column", gap: "0.5rem",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "0.4rem", fontSize: "0.75rem", fontWeight: 600, color: "#ffcd00",
          }}>
            <Icon name="goal" size={15} color="#ffcd00" />
            #{assistFor.nr} {assistFor.name} — Assist tippen oder:
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => setPowerPlay(!powerPlay)} style={{
              flex: 1, appearance: "none", cursor: "pointer",
              borderRadius: "var(--radius-lg)", padding: "0.6rem",
              fontSize: "0.75rem", fontWeight: 600,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
              border: powerPlay ? "1px solid rgba(0,51,160,.7)" : "1px solid rgba(255,255,255,.1)",
              background: powerPlay ? "rgba(0,51,160,.3)" : "rgba(255,255,255,.04)",
              color: powerPlay ? "#93c5fd" : "rgba(255,255,255,.45)",
              touchAction: "manipulation",
            }}>
              <Icon name="users" size={14} /> Überzahl
            </button>
            <Button variant="secondary" size="md" fullWidth onClick={skipAssist} style={{ flex: 1 }}>
              Kein Assist
            </Button>
          </div>
        </div>
      )}

      {/* ── Bottom bar ── */}
      <div style={{
        flexShrink: 0, zIndex: 20,
        background: CHROME_BG,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: CHROME_BORDER,
        padding: "0.55rem 0.75rem max(0.55rem, env(safe-area-inset-bottom))",
        display: "flex", flexDirection: "column", gap: "0.4rem",
      }}>
        <Button variant="danger" size="lg" fullWidth icon="circle-x"
          onClick={() => setGegengoal(true)}>
          Gegentor
        </Button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          <button
            onClick={() => boxPlay ? null : setBoxPlay({ mode: "box", seconds: 120 })}
            style={{
              appearance: "none", cursor: boxPlay?.mode === "box" ? "default" : "pointer",
              minHeight: "2.75rem", borderRadius: "var(--radius-lg)",
              background: boxPlay?.mode === "box" ? "rgba(239,68,68,.25)" : "rgba(220,38,38,.12)",
              border: `1px solid ${boxPlay?.mode === "box" ? "rgba(239,68,68,.6)" : "rgba(239,68,68,.25)"}`,
              color: "#f87171", fontFamily: "var(--font-sans)", fontWeight: 700,
              fontSize: "0.875rem", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "0.4rem", touchAction: "manipulation",
              opacity: boxPlay && boxPlay.mode !== "box" ? 0.35 : 1,
              transition: "opacity 0.2s ease, background 0.15s ease",
            }}>
            <Icon name="shield-off" size={15} color="#f87171" strokeWidth={2} />
            BoxPlay
          </button>
          <button
            onClick={() => boxPlay ? null : setBoxPlay({ mode: "power", seconds: 120 })}
            style={{
              appearance: "none", cursor: boxPlay?.mode === "power" ? "default" : "pointer",
              minHeight: "2.75rem", borderRadius: "var(--radius-lg)",
              background: boxPlay?.mode === "power" ? "rgba(255,205,0,.18)" : "rgba(255,205,0,.07)",
              border: `1px solid ${boxPlay?.mode === "power" ? "rgba(255,205,0,.5)" : "rgba(255,205,0,.2)"}`,
              color: "#ffcd00", fontFamily: "var(--font-sans)", fontWeight: 700,
              fontSize: "0.875rem", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "0.4rem", touchAction: "manipulation",
              opacity: boxPlay && boxPlay.mode !== "power" ? 0.35 : 1,
              transition: "opacity 0.2s ease, background 0.15s ease",
            }}>
            <Icon name="shield-plus" size={15} color="#ffcd00" strokeWidth={2} />
            Powerplay
          </button>
        </div>
      </div>

      {/* ── Action sheet ── */}
      {active && (
        <div onClick={() => setActive(null)} style={{
          position: "absolute", inset: 0, zIndex: 30,
          background: "rgba(0,0,0,.65)",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "#0b1120",
            borderTop: "1px solid rgba(255,255,255,.1)",
            borderRadius: "var(--radius-2xl) var(--radius-2xl) 0 0",
            padding: "0.75rem 0.85rem 1rem",
            boxShadow: "0 -16px 48px rgba(0,0,0,.65)",
          }}>
            <Grabber />
            {/* Header: number + name + close */}
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: "0.75rem",
            }}>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: "0.4rem" }}>
                <span style={{
                  fontWeight: 900, fontSize: "1.5rem", lineHeight: 1,
                  color: isGoalie(active) ? "#ffcd00" : "var(--blue-400)",
                }}>#{active.nr}</span>
                <span style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
                  {active.name}
                </span>
              </span>
              <IconBtn name="x" onClick={() => setActive(null)} label="Schliessen" />
            </div>

            {/* Role picker (field players only) */}
            {!isGoalie(active) && (
              <div style={{
                display: "flex", gap: "0.35rem", marginBottom: "0.85rem",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid rgba(255,255,255,.08)",
              }}>
                {FIELD_ROLES.map((r) => {
                  const on = getRole(active) === r.id;
                  return (
                    <button key={r.id}
                      onClick={(e) => { e.stopPropagation(); setRole(active.id, r.id); }}
                      style={{
                        flex: 1, appearance: "none", cursor: "pointer",
                        padding: "0.45rem 0.25rem",
                        borderRadius: "var(--radius-lg)",
                        background: on ? r.bg : "rgba(255,255,255,.04)",
                        border: `1px solid ${on ? r.border : "rgba(255,255,255,.08)"}`,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", gap: "0.25rem",
                        touchAction: "manipulation",
                        transition: "background 100ms ease, border-color 100ms ease",
                      }}>
                      <Icon name={r.icon} size={15}
                        color={on ? r.color : "rgba(255,255,255,.2)"}
                        strokeWidth={2} />
                      <span style={{
                        fontSize: "0.625rem", fontWeight: 700,
                        letterSpacing: "0.06em", textTransform: "uppercase",
                        color: on ? r.color : "rgba(255,255,255,.2)",
                      }}>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Goalie role indicator */}
            {isGoalie(active) && (
              <div style={{
                display: "flex", alignItems: "center", gap: "0.4rem",
                marginBottom: "0.85rem", paddingBottom: "0.85rem",
                borderBottom: "1px solid rgba(255,255,255,.08)",
              }}>
                <span style={{
                  display: "grid", placeItems: "center",
                  width: "2rem", height: "2rem",
                  borderRadius: "var(--radius-lg)",
                  background: "rgba(255,205,0,.15)",
                  border: "1px solid rgba(255,205,0,.35)",
                }}>
                  <Icon name="shield-check" size={14} color="#ffcd00" strokeWidth={2} />
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(255,205,0,.8)" }}>
                  Goalie
                </span>
              </div>
            )}

            <div style={{
              display: "grid",
              gridTemplateColumns: isGoalie(active) ? "repeat(2,1fr)" : "repeat(3,1fr)",
              gap: "var(--tile-gap)", marginBottom: "0.65rem",
            }}>
              {(isGoalie(active) ? GOALIE_ACTIONS : PLAYER_ACTIONS).map((a) => (
                <ActionTile key={a.code} icon={a.icon} label={a.label}
                  tint={a.tint} span={a.span} onClick={() => sendAction(a)} />
              ))}
            </div>

            <Button variant="goal" size="lg" fullWidth icon="goal" onClick={startGoal}>
              Goal
            </Button>
          </div>
        </div>
      )}

      {/* ── Gegengoal reason picker ── */}
      {gegengoal && (
        <Scrim onClose={() => setGegengoal(false)}>
          <SheetSurface>
            <Grabber />
            <div style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.9rem",
            }}>
              <Icon name="shield-off" size={17} color="#fca5a5" />
              Gegengoal — Grund?
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3,1fr)",
              gap: "var(--tile-gap)", marginBottom: "0.65rem",
            }}>
              {GEGENGOAL_REASONS.map((r) => (
                <ActionTile key={r.code} icon={r.icon} label={r.label}
                  tint={r.tint} onClick={() => pickReason(r)} />
              ))}
            </div>
            <Button variant="secondary" size="md" fullWidth onClick={() => pickReason(null)}>
              Kein Grund
            </Button>
          </SheetSurface>
        </Scrim>
      )}

      {/* ── Help modal ── */}
      {help && (
        <Scrim onClose={() => setHelp(false)}>
          <SheetSurface style={{ maxHeight: "80%", overflowY: "auto" }}>
            <Grabber />
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: "1rem",
            }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9375rem" }}>Kurzanleitung</p>
              <IconBtn name="x" onClick={() => setHelp(false)} label="Schliessen" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem",
              fontSize: "0.875rem", color: "rgba(255,255,255,.65)" }}>
              {[
                ["list-checks", "Spieler antippen",      "Spieler oder Goalie antippen — ein Panel mit den passenden Aktionen öffnet sich."],
                ["target",      "Aktion wählen",         "Im Panel die Aktion tippen — wird sofort gesendet und das Panel schliesst sich."],
                ["goal",        "Goal erfassen",         "Torschützen antippen → Goal → Assistspieler antippen oder «Kein Assist»."],
                ["wifi-off",    "Kein Netz? Kein Stress.","Einträge werden lokal gespeichert und gesendet sobald wieder Verbindung besteht."],
              ].map(([ic, title, desc]) => (
                <div key={ic} style={{ display: "flex", gap: "0.75rem" }}>
                  <span style={{
                    flexShrink: 0, display: "grid", placeItems: "center",
                    width: "2rem", height: "2rem",
                    borderRadius: "var(--radius-lg)",
                    background: "rgba(0,51,160,.28)", color: "#93c5fd",
                  }}>
                    <Icon name={ic} size={16} color="#93c5fd" />
                  </span>
                  <div>
                    <p style={{ margin: "0 0 0.15rem", fontWeight: 600, color: "#fff" }}>{title}</p>
                    <p style={{ margin: 0, color: "rgba(255,255,255,.45)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </SheetSurface>
        </Scrim>
      )}

    </div>
  );
}

window.LiveTracker = LiveTracker;
