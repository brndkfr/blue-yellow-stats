/* Live tracker screen — Jets brand palette, Lucide icons, modern sports-app UX.
   Replaces all emoji from the source app with clean SVG icons.
   Brand: #0033a0 navy · #ffcd00 gold
   Roles: defender (shield/blue) · center (circle-dot/white) · winger (zap/green) */


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

function IconBtn({ name, onClick, label, badge, danger = false }) {
  return (
    <button onClick={onClick} aria-label={label} style={{
      appearance: "none", cursor: "pointer",
      width: "2.25rem", height: "2.25rem",
      borderRadius: "var(--radius-pill)",
      background: danger ? "rgba(185,28,28,.25)" : "rgba(255,255,255,.06)",
      border: danger ? "1px solid rgba(239,68,68,.5)" : "1px solid rgba(255,255,255,.1)",
      color: danger ? "#fca5a5" : "rgba(255,255,255,.65)",
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

function LTBoxPlayPanel({ mode, remaining, onResolve }) {
  const isBox  = mode === "box";
  const mins   = Math.floor(remaining / 60);
  const secs   = remaining % 60;
  const tStr   = `${mins}:${secs.toString().padStart(2, "0")}`;
  const pct    = (remaining / 120) * 100;
  const urgent = remaining <= 30;
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

function LiveTracker({
  game, goalies, players, allGoalies = [], allPlayers = [],
  scriptUrl, onBack, onEndGame, onRosterChange, initialRoles = {},
  enqueueOrSend, queueSize = 0, swQueueSize = 0, stuckQueue = false, onFlush,
}) {
  const scout = localStorage.getItem("jets_scout") || "";

  // Stable session key: real game.id or an ephemeral id for ad-hoc games.
  // Used to scope score persistence so sessions never collide.
  const sessionKey = React.useRef(
    game.id ? ('jets_score_' + game.id) : ('jets_score_adhoc_' + Date.now())
  ).current;

  const minutesPerPeriod = game.minutes_per_period || 20;

  const [period,      setPeriod]      = React.useState(1);
  const [format,      setFormat]      = React.useState(game.format || 2);
  const [active,      setActive]      = React.useState(null);
  const [assistFor,   setAssistFor]   = React.useState(null);
  const [powerPlay,   setPowerPlay]   = React.useState(false);
  const [gegengoal,   setGegengoal]   = React.useState(false);
  const [help,        setHelp]        = React.useState(false);
  const [toast,       setToast]       = React.useState(null);
  const [lastEvent,   setLastEvent]   = React.useState(null);
  const [score,       setScore]       = React.useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(sessionKey));
      if (s && typeof s.us === 'number' && typeof s.them === 'number') return s;
    } catch (_) {}
    return { us: 0, them: 0 };
  });
  const [boxPlay,     setBoxPlay]     = React.useState(null); // null | { mode:"box"|"power", startedAt, totalSecs }
  const [playerRoles, setPlayerRoles] = React.useState(() => {
    const r = {};
    players.forEach((p) => { r[p.id] = (initialRoles && initialRoles[p.id]) || p.role || "center"; });
    return r;
  });
  const [confirmLeave,  setConfirmLeave]  = React.useState(false);
  const [endGame,       setEndGame]       = React.useState(false);
  const [confirmPeriod, setConfirmPeriod] = React.useState(false);
  const [periodPending, setPeriodPending] = React.useState(null);
  const lastEventRef = React.useRef(null); // { params, scoreEffect: 'us'|'them'|null }

  // Timer state — restored from localStorage on mount
  const [timerBaseSecs,  setTimerBaseSecs]  = React.useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(sessionKey + '_timer'));
      if (s && typeof s.timerBaseSecs === 'number') return s.timerBaseSecs;
    } catch (_) {}
    return minutesPerPeriod * 60;
  });
  const [timerStartedAt, setTimerStartedAt] = React.useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(sessionKey + '_timer'));
      if (s && s.timerRunning && typeof s.timerStartedAt === 'number') return s.timerStartedAt;
    } catch (_) {}
    return null;
  });
  const [timerRunning,   setTimerRunning]   = React.useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(sessionKey + '_timer'));
      return !!(s && s.timerRunning);
    } catch (_) {}
    return false;
  });

  // Per-period goalie assignment: { [period]: goalieId }
  const [periodGoalies, setPeriodGoalies] = React.useState(() => {
    if (goalies.length === 1) {
      return { 1: goalies[0].id, 2: goalies[0].id, 3: goalies[0].id, 4: goalies[0].id };
    }
    try {
      const s = JSON.parse(localStorage.getItem(sessionKey + '_goalies'));
      if (s && typeof s === 'object') return s;
    } catch (_) {}
    return {};
  });
  const [goalieModal, setGoalieModal] = React.useState(false);

  // Live roster — starts from pre-game selection, can change mid-game via Kader sheet
  const [liveGoalies, setLiveGoalies] = React.useState(goalies);
  const [livePlayers, setLivePlayers] = React.useState(players);
  const [kaderSheet,  setKaderSheet]  = React.useState(false);

  const activeGoalieId = periodGoalies[period] || null;
  const activeGoalie   = liveGoalies.find((g) => g.id === activeGoalieId) || null;

  // Tick counter — bumped every 500ms to drive re-renders while timers run
  const [tick, setTick] = React.useState(0);

  // Derived countdown values — recomputed from Date.now() each render (iOS-safe)
  const timerRemaining = timerRunning
    ? Math.max(0, timerBaseSecs - Math.floor((Date.now() - timerStartedAt) / 1000))
    : timerBaseSecs;
  const timerIsUrgent = timerRemaining > 0 && timerRemaining <= 180;
  const timerPulse    = timerIsUrgent && tick % 2 === 0;

  const boxPlayRemaining = boxPlay
    ? Math.max(0, boxPlay.totalSecs - Math.floor((Date.now() - boxPlay.startedAt) / 1000))
    : 0;

  const toastTimer = React.useRef(null);

  // Hide the external scout bar while tracking — scout is shown in the header pill
  React.useEffect(() => {
    const bar = document.getElementById('scout-bar');
    if (bar) bar.style.display = 'none';
    return () => { if (bar) bar.style.display = ''; };
  }, []);

  // Persist score so an accidental reload restores it
  React.useEffect(() => {
    try { localStorage.setItem(sessionKey, JSON.stringify(score)); } catch (_) {}
  }, [score, sessionKey]);

  // Persist timer state so an accidental reload restores it
  React.useEffect(() => {
    try {
      localStorage.setItem(sessionKey + '_timer', JSON.stringify({
        timerBaseSecs, timerStartedAt, timerRunning,
      }));
    } catch (_) {}
  }, [timerBaseSecs, timerStartedAt, timerRunning]);

  // Tick interval — only runs while a countdown is active
  React.useEffect(() => {
    if (!timerRunning && !boxPlay) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [timerRunning, !!boxPlay]);

  // BoxPlay expiry
  React.useEffect(() => {
    if (!boxPlay || boxPlayRemaining > 0) return;
    fireToast({ icon: "clock", tone: "info", text: "Strafe abgelaufen" });
    setBoxPlay(null);
  }, [boxPlayRemaining, !!boxPlay]);

  // Timer expiry
  React.useEffect(() => {
    if (!timerRunning || timerRemaining > 0) return;
    setTimerRunning(false);
    setTimerStartedAt(null);
    try { navigator.vibrate?.([200, 100, 200]); } catch (_) {}
    fireToast({ icon: "flag", tone: "pending", text: "Zeit abgelaufen!" });
  }, [timerRemaining, timerRunning]);

  // Persist per-period goalie assignments
  React.useEffect(() => {
    if (liveGoalies.length <= 1) return;
    try {
      localStorage.setItem(sessionKey + '_goalies', JSON.stringify(periodGoalies));
    } catch (_) {}
  }, [periodGoalies]);

  // Show goalie picker when entering a period with no assigned goalie
  React.useEffect(() => {
    if (liveGoalies.length <= 1) return;
    if (!periodGoalies[period]) setGoalieModal(true);
  }, [period]);

  const isGoalie    = (p) => liveGoalies.some((g) => g.id === p?.id);
  const getRole     = (p) => playerRoles[p?.id] || "center";
  const setRole     = (id, role) => setPlayerRoles((prev) => ({ ...prev, [id]: role }));

  function resetTimerForPeriod() {
    setTimerBaseSecs(minutesPerPeriod * 60);
    setTimerStartedAt(null);
    setTimerRunning(false);
  }
  function startTimer() {
    setTimerStartedAt(Date.now());
    setTimerRunning(true);
  }
  function pauseTimer() {
    setTimerBaseSecs(timerRemaining);
    setTimerStartedAt(null);
    setTimerRunning(false);
  }
  function handlePeriodChange(p) {
    if (timerRunning && p !== period) {
      setPeriodPending(p);
      setConfirmPeriod(true);
    } else {
      setPeriod(p);
      resetTimerForPeriod();
    }
  }

  const toggleFormat = () => { setPeriod(1); setFormat((f) => f === 2 ? 3 : 2); resetTimerForPeriod(); };

  function fireToast(t) {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  function postEvent(fields) {
    if (!scriptUrl || !enqueueOrSend) return null;
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
    enqueueOrSend(params);
    return params;
  }

  function sendAction(a) {
    const params = postEvent({
      player_id:   String(active.id  || ""),
      player_nr:   active.nr ? String(active.nr) : "",
      player_name: active.name,
      player_role: isGoalie(active) ? "goalie" : getRole(active),
      action:      a.code,
    });
    lastEventRef.current = { params, scoreEffect: null };
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
    const params = postEvent({
      player_id:   String(assistFor.id  || ""),
      player_nr:   assistFor.nr ? String(assistFor.nr) : "",
      player_name: assistFor.name,
      player_role: isGoalie(assistFor) ? "goalie" : getRole(assistFor),
      action:      "goal",
      assist_id:   assistPlayer ? String(assistPlayer.id  || "") : "",
      assist_nr:   assistPlayer && assistPlayer.nr ? String(assistPlayer.nr) : "",
      assist_name: assistPlayer ? assistPlayer.name : "",
      power_play:  powerPlay ? "yes" : "",
    });
    lastEventRef.current = { params, scoreEffect: 'us' };
    setScore((s) => ({ ...s, us: s.us + 1 }));
    const t = { icon: "goal", tone: "success", text };
    setLastEvent(t); fireToast(t);
    setAssistFor(null); setPowerPlay(false);
  }
  function pickReason(r) {
    const params = postEvent({
      player_id:   activeGoalie ? String(activeGoalie.id || "") : "",
      player_nr:   activeGoalie && activeGoalie.nr ? String(activeGoalie.nr) : "",
      player_name: activeGoalie ? activeGoalie.name : "",
      action:      "gegengoal",
      reason:      r ? r.code : "",
    });
    lastEventRef.current = { params, scoreEffect: 'them' };
    setScore((s) => ({ ...s, them: s.them + 1 }));
    const t = { icon: "shield-off", tone: "pending", text: `Gegengoal${r ? ` · ${r.label}` : ""}` };
    setLastEvent(t); fireToast(t); setGegengoal(false);
  }
  function undo() {
    if (!lastEvent || !lastEventRef.current) return;
    const { params, scoreEffect } = lastEventRef.current;
    if (scoreEffect === 'us')   setScore((s) => ({ ...s, us:   Math.max(0, s.us   - 1) }));
    if (scoreEffect === 'them') setScore((s) => ({ ...s, them: Math.max(0, s.them - 1) }));
    if (enqueueOrSend && params) {
      enqueueOrSend({
        action_type: 'deleteEvent',
        game_id:     params.game_id   || '',
        player_id:   params.player_id || '',
        action:      params.action    || '',
        timestamp:   params.timestamp || '',
      });
    }
    fireToast({ icon: "undo-2", tone: "info", text: "Letzter Eintrag gelöscht" });
    setLastEvent(null);
    lastEventRef.current = null;
  }

  function resolveBoxPlay(type) {
    const msgs = {
      killed:   { icon: "shield-check", tone: "success", text: "Box gekilled!" },
      conceded: { icon: "circle-x",     tone: "pending", text: "Unterzahltor kassiert" },
      scored:   { icon: "zap",          tone: "success", text: "Überzahltreffer!" },
      expired:  { icon: "clock",        tone: "info",    text: "Powerplay vorbei" },
    }[type];
    const actionCode = type === "killed" ? "box_killed" : type === "conceded" ? "box_conceded" : type === "scored" ? "pp_scored" : "pp_expired";
    const params = postEvent({ action: actionCode });
    const scoreEffect = type === "conceded" ? 'them' : type === "scored" ? 'us' : null;
    lastEventRef.current = { params, scoreEffect };
    if (type === "conceded") setScore((s) => ({ ...s, them: s.them + 1 }));
    if (type === "scored")   setScore((s) => ({ ...s, us: s.us + 1 }));
    if (msgs) { setLastEvent(msgs); fireToast(msgs); }
    setBoxPlay(null);
  }

  function fireRosterEvent(newGoalies, newPlayers) {
    if (!game.id) return;
    const rosterRows = [
      ...newGoalies.map((g) => ({ player_id: g.id, number: g.nr, name: g.name, selected: "yes", role: "" })),
      ...newPlayers.map((p) => ({ player_id: p.id, number: p.nr, name: p.name, selected: "yes", role: playerRoles[p.id] || "center" })),
    ];
    enqueueOrSend({ action_type: "saveGameRoster", game_id: game.id, roster: JSON.stringify(rosterRows) });
    onRosterChange?.(newGoalies, newPlayers);
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
            <IconBtn name="chevron-left" label="Zurück zu Spielen" onClick={() => {
              if (game.id && (score.us + score.them > 0 || lastEvent !== null)) {
                setConfirmLeave(true);
              } else {
                onBack();
              }
            }} />
            <div style={{ minWidth: 0 }}>
              <p style={{
                margin: 0, fontWeight: 700, fontSize: "0.875rem",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                color: "#fff",
              }}>Jets · {game.opponent}</p>
              <p style={{ margin: 0, fontSize: "0.6875rem", color: "rgba(255,255,255,.38)", display: "flex", alignItems: "center", gap: "0.35rem", overflow: "hidden" }}>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{game.venue || "Vollkader"}</span>
                {scout && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "0.2rem",
                    background: "rgba(255,205,0,.1)", border: "1px solid rgba(255,205,0,.25)",
                    borderRadius: "var(--radius-pill)",
                    padding: "1px 6px", fontSize: "0.625rem", fontWeight: 700,
                    color: "rgba(255,205,0,.75)", letterSpacing: "0.04em",
                  }}>
                    <Icon name="user" size={9} color="rgba(255,205,0,.6)" strokeWidth={2.5} />
                    {scout}
                  </span>
                )}
                {liveGoalies.length > 0 && (
                  <span
                    onClick={liveGoalies.length > 1 ? () => setGoalieModal(true) : undefined}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.2rem",
                      background: activeGoalie ? "rgba(255,205,0,.1)" : "rgba(239,68,68,.12)",
                      border: activeGoalie ? "1px solid rgba(255,205,0,.25)" : "1px solid rgba(239,68,68,.3)",
                      borderRadius: "var(--radius-pill)",
                      padding: "1px 6px", fontSize: "0.625rem", fontWeight: 700,
                      color: activeGoalie ? "rgba(255,205,0,.75)" : "#fca5a5",
                      letterSpacing: "0.04em", flexShrink: 0,
                      cursor: liveGoalies.length > 1 ? "pointer" : "default",
                      touchAction: "manipulation",
                    }}>
                    <Icon name={activeGoalie ? "shield-check" : "shield-off"} size={9}
                      color={activeGoalie ? "rgba(255,205,0,.6)" : "#f87171"} strokeWidth={2.5} />
                    {activeGoalie
                      ? `Goal: ${activeGoalie.nr ? `#${activeGoalie.nr}` : activeGoalie.name}`
                      : "Goal: ?"}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
            <ScoreDisplay us={score.us} them={score.them} />
            {(queueSize + swQueueSize) > 0 && (
              <IconBtn name="wifi-off" label={`${queueSize + swQueueSize} ausstehend`}
                badge={queueSize + swQueueSize} danger={stuckQueue}
                onClick={() => onFlush?.()} />
            )}
            <IconBtn name="users" onClick={() => setKaderSheet(true)} label="Kader" />
            <IconBtn name="circle-help" onClick={() => setHelp(true)} label="Hilfe" />
          </div>
        </div>

        {/* Row 2: format toggle + timer + period tabs + undo */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
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

          {/* Timer pill — tap to start/pause; red + pulsing in last 3 min */}
          <button onClick={timerRunning ? pauseTimer : startTimer} style={{
            flexShrink: 0, appearance: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "0.3rem",
            padding: "0.35rem 0.5rem",
            borderRadius: "var(--radius-md)",
            background: timerIsUrgent ? "rgba(220,38,38,.2)" : "rgba(255,255,255,.06)",
            border: timerIsUrgent ? "1px solid rgba(239,68,68,.4)" : "1px solid rgba(255,255,255,.1)",
            touchAction: "manipulation",
          }}>
            <span style={{
              fontVariantNumeric: "tabular-nums", fontWeight: 800,
              fontSize: "0.8125rem", lineHeight: 1,
              color: timerIsUrgent ? (timerPulse ? "#fca5a5" : "#f87171") : "rgba(255,255,255,.8)",
            }}>
              {String(Math.floor(timerRemaining / 60)).padStart(2, "0")}:{String(timerRemaining % 60).padStart(2, "0")}
            </span>
            <Icon name={timerRunning ? "pause" : "play"} size={11}
              color={timerIsUrgent ? "#f87171" : "rgba(255,255,255,.4)"} strokeWidth={2.5} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <PeriodTabs format={format} active={period} onChange={handlePeriodChange} />
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
          <LTBoxPlayPanel mode={boxPlay.mode} remaining={boxPlayRemaining} onResolve={resolveBoxPlay} />
        )}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <SectionLabel count={liveGoalies.length}>Goalie</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "var(--tile-gap)" }}>
            {liveGoalies.map((g) => {
              const isReserve = activeGoalieId !== null && g.id !== activeGoalieId;
              return (
                <div key={g.id} style={{ opacity: isReserve ? 0.4 : 1 }}>
                  <RosterTile nr={g.nr} name={g.name} role="goalie"
                    state={tileState(g)} onClick={() => onTile(g)} />
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          <SectionLabel count={livePlayers.length}>Feldspieler</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--tile-gap)" }}>
            {livePlayers.map((p) => (
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
            {assistFor.nr ? `#${assistFor.nr} ` : ""}{assistFor.name} — Assist tippen oder:
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
            <button onClick={() => { setAssistFor(null); setActive(assistFor); }} style={{
              appearance: "none", cursor: "pointer",
              width: "2.75rem", flexShrink: 0,
              borderRadius: "var(--radius-lg)",
              background: "rgba(255,255,255,.04)",
              border: "1px solid rgba(255,255,255,.1)",
              display: "grid", placeItems: "center",
              touchAction: "manipulation",
            }} aria-label="Abbrechen">
              <Icon name="x" size={16} color="rgba(255,255,255,.4)" strokeWidth={2} />
            </button>
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
            onClick={() => boxPlay ? null : setBoxPlay({ mode: "box", startedAt: Date.now(), totalSecs: 120 })}
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
            onClick={() => boxPlay ? null : setBoxPlay({ mode: "power", startedAt: Date.now(), totalSecs: 120 })}
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
        {game.id && (
          <button onClick={() => setEndGame(true)} style={{
            appearance: "none", cursor: "pointer", width: "100%",
            minHeight: "2.25rem", borderRadius: "var(--radius-lg)",
            background: "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.08)",
            color: "rgba(255,255,255,.35)", fontFamily: "var(--font-sans)",
            fontWeight: 600, fontSize: "0.8125rem",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
            touchAction: "manipulation",
          }}>
            <Icon name="flag" size={14} color="rgba(255,255,255,.3)" strokeWidth={2} />
            Spielende
          </button>
        )}
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

      {/* ── End game ── */}
      {endGame && (
        <Scrim onClose={() => setEndGame(false)}>
          <SheetSurface>
            <Grabber />
            <div style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.75rem",
            }}>
              <Icon name="flag" size={17} color="rgba(255,255,255,.6)" />
              Spiel beenden
            </div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "0.75rem", marginBottom: "1rem",
              fontVariantNumeric: "tabular-nums",
            }}>
              <span style={{ fontWeight: 900, fontSize: "3rem", lineHeight: 1, color: "#fff" }}>{score.us}</span>
              <span style={{ fontWeight: 700, fontSize: "2rem", color: "rgba(255,255,255,.25)" }}>:</span>
              <span style={{ fontWeight: 900, fontSize: "3rem", lineHeight: 1, color: "rgba(255,255,255,.35)" }}>{score.them}</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="secondary" size="md" fullWidth onClick={() => setEndGame(false)}>
                Abbrechen
              </Button>
              <Button variant="primary" size="md" fullWidth icon="check"
                onClick={() => {
                  try {
                    localStorage.removeItem(sessionKey);
                    localStorage.removeItem(sessionKey + '_timer');
                    localStorage.removeItem(sessionKey + '_goalies');
                  } catch (_) {}
                  onEndGame({ us: score.us, them: score.them });
                }}>
                Speichern &amp; beenden
              </Button>
            </div>
          </SheetSurface>
        </Scrim>
      )}

      {/* ── Confirm leave ── */}
      {confirmLeave && (
        <Scrim onClose={() => setConfirmLeave(false)}>
          <SheetSurface>
            <Grabber />
            <div style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem",
            }}>
              <Icon name="log-out" size={17} color="rgba(255,255,255,.6)" />
              Spiel verlassen?
            </div>
            <p style={{ margin: "0 0 1rem", fontSize: "0.8125rem", color: "rgba(255,255,255,.4)" }}>
              Alle Ereignisse wurden bereits gesendet.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="secondary" size="md" fullWidth onClick={() => setConfirmLeave(false)}>
                Weiter tracken
              </Button>
              <Button variant="danger" size="md" fullWidth onClick={onBack}>
                Verlassen
              </Button>
            </div>
          </SheetSurface>
        </Scrim>
      )}

      {/* ── Kader sheet ── */}
      {kaderSheet && (
        <Scrim onClose={() => setKaderSheet(false)}>
          <SheetSurface style={{ maxHeight: "75%", overflowY: "auto" }}>
            <Grabber />
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "1rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem",
                fontWeight: 700, fontSize: "0.9375rem" }}>
                <Icon name="users" size={17} color="rgba(255,255,255,.6)" />
                Kader
              </div>
              <IconBtn name="x" onClick={() => setKaderSheet(false)} label="Schliessen" />
            </div>

            {/* Goalies — tap to set as active for this period */}
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.625rem", fontWeight: 800,
              letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.3)" }}>
              Goalies
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "1rem" }}>
              {allGoalies.map((g) => {
                const isCurrent = g.id === activeGoalieId;
                return (
                  <button key={g.id} onClick={() => {
                    if (!liveGoalies.some((x) => x.id === g.id)) {
                      const next = [...liveGoalies, g];
                      setLiveGoalies(next);
                      fireRosterEvent(next, livePlayers);
                    }
                    setPeriodGoalies((prev) => ({ ...prev, [period]: g.id }));
                    setKaderSheet(false);
                  }} style={{
                    appearance: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.65rem 0.875rem", width: "100%",
                    borderRadius: "var(--radius-lg)", fontFamily: "var(--font-sans)",
                    background: isCurrent ? "rgba(255,205,0,.12)" : "rgba(255,255,255,.04)",
                    border: isCurrent ? "1px solid rgba(255,205,0,.35)" : "1px solid rgba(255,255,255,.08)",
                    touchAction: "manipulation",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <Icon name="shield-check" size={15}
                        color={isCurrent ? "#ffcd00" : "rgba(255,255,255,.25)"} strokeWidth={2} />
                      <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#fff" }}>
                        {g.nr ? `#${g.nr} ` : ""}{g.name}
                      </span>
                    </div>
                    {isCurrent && (
                      <span style={{
                        fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.08em",
                        textTransform: "uppercase", color: "rgba(255,205,0,.7)",
                        background: "rgba(255,205,0,.1)", borderRadius: "var(--radius-sm)",
                        padding: "0.15rem 0.45rem",
                      }}>aktiv</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Field players — toggle active/inactive */}
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.625rem", fontWeight: 800,
              letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,.3)" }}>
              Feldspieler
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {allPlayers.map((p) => {
                const isActive = livePlayers.some((x) => x.id === p.id);
                return (
                  <button key={p.id} onClick={() => {
                    let next;
                    if (isActive) {
                      next = livePlayers.filter((x) => x.id !== p.id);
                      if (active?.id === p.id) setActive(null);
                      if (assistFor?.id === p.id) setAssistFor(null);
                    } else {
                      next = [...livePlayers, p];
                      if (!playerRoles[p.id]) setRole(p.id, p.role || "center");
                    }
                    setLivePlayers(next);
                    fireRosterEvent(liveGoalies, next);
                  }} style={{
                    appearance: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "0.65rem 0.875rem", width: "100%",
                    borderRadius: "var(--radius-lg)", fontFamily: "var(--font-sans)",
                    background: isActive ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.02)",
                    border: isActive ? "1px solid rgba(255,255,255,.15)" : "1px solid rgba(255,255,255,.06)",
                    opacity: isActive ? 1 : 0.5, touchAction: "manipulation",
                  }}>
                    <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#fff" }}>
                      {p.nr ? `#${p.nr} ` : ""}{p.name}
                    </span>
                    <div style={{
                      width: "1.25rem", height: "1.25rem", borderRadius: "4px", flexShrink: 0,
                      background: isActive ? "rgba(34,197,94,.25)" : "transparent",
                      border: isActive ? "1px solid rgba(74,222,128,.5)" : "1px solid rgba(255,255,255,.2)",
                      display: "grid", placeItems: "center",
                    }}>
                      {isActive && <Icon name="check" size={10} color="#4ade80" strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </SheetSurface>
        </Scrim>
      )}

      {/* ── Goalie picker ── */}
      {goalieModal && (
        <Scrim onClose={() => setGoalieModal(false)}>
          <SheetSurface>
            <Grabber />
            <div style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              fontWeight: 700, fontSize: "0.9375rem", marginBottom: "1rem",
            }}>
              <Icon name="shield-check" size={17} color="#ffcd00" />
              Wer steht im Goal?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {liveGoalies.map((g) => (
                <button key={g.id} onClick={() => {
                  setPeriodGoalies((prev) => ({ ...prev, [period]: g.id }));
                  setGoalieModal(false);
                }} style={{
                  appearance: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "0.75rem 0.875rem",
                  borderRadius: "var(--radius-xl)",
                  background: g.id === activeGoalieId ? "rgba(255,205,0,.12)" : "rgba(255,255,255,.04)",
                  border: g.id === activeGoalieId ? "1px solid rgba(255,205,0,.35)" : "1px solid rgba(255,255,255,.08)",
                  fontFamily: "var(--font-sans)", touchAction: "manipulation", width: "100%",
                }}>
                  <span style={{
                    display: "grid", placeItems: "center",
                    width: "2.25rem", height: "2.25rem", flexShrink: 0,
                    borderRadius: "var(--radius-lg)",
                    background: "rgba(255,205,0,.15)", border: "1px solid rgba(255,205,0,.3)",
                  }}>
                    <Icon name="shield-check" size={16} color="#ffcd00" strokeWidth={2} />
                  </span>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9375rem", color: "#fff" }}>
                      {g.nr ? `#${g.nr} ` : ""}{g.name}
                    </p>
                    {g.id === activeGoalieId && (
                      <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "rgba(255,205,0,.6)" }}>
                        aktiv
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </SheetSurface>
        </Scrim>
      )}

      {/* ── Confirm period change (timer running) ── */}
      {confirmPeriod && (
        <Scrim onClose={() => { setConfirmPeriod(false); setPeriodPending(null); }}>
          <SheetSurface>
            <Grabber />
            <div style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              fontWeight: 700, fontSize: "0.9375rem", marginBottom: "0.5rem",
            }}>
              <Icon name="timer-reset" size={17} color="rgba(255,255,255,.6)" />
              Timer zurücksetzen?
            </div>
            <p style={{ margin: "0 0 1rem", fontSize: "0.8125rem", color: "rgba(255,255,255,.4)" }}>
              Der Timer läuft noch. Periode wechseln setzt ihn auf {minutesPerPeriod}:00 zurück.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="secondary" size="md" fullWidth
                onClick={() => { setConfirmPeriod(false); setPeriodPending(null); }}>
                Abbrechen
              </Button>
              <Button variant="primary" size="md" fullWidth
                onClick={() => {
                  setPeriod(periodPending);
                  resetTimerForPeriod();
                  setConfirmPeriod(false);
                  setPeriodPending(null);
                }}>
                Wechseln &amp; zurücksetzen
              </Button>
            </div>
          </SheetSurface>
        </Scrim>
      )}

    </div>
  );
}

window.LiveTracker = LiveTracker;
