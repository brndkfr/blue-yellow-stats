/* Roster Editor — configure opponent, format and squad for a new match.
   Goalies and players default to fully selected; tap to deselect.
   Field player role chip (corner) cycles Ctr → Def → Wing → Ctr on tap. */

const CHROME_BG_ED  = "rgba(1,9,35,.95)";
const GOLD_LINE_ED  = "1px solid rgba(255,205,0,.2)";
const ROLE_CYCLE    = ["center", "defender", "winger"];

/* ── EditorTile ── */
function EditorTile({ nr, name, role = "player", selected, playerRole, onToggle, onCycleRole }) {
  const numColor = role === "goalie"
    ? (selected ? "#ffcd00" : "rgba(255,205,0,.25)")
    : (selected ? "var(--blue-400)" : "rgba(96,165,250,.2)");

  return (
    <div role="button" tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => e.key === "Enter" && onToggle?.()}
      style={{
        position: "relative", cursor: "pointer", userSelect: "none",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "0.15rem", width: "100%", padding: "0.7rem 0.3rem",
        background: selected ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.02)",
        borderRadius: "var(--radius-xl)",
        border: selected
          ? "1px solid rgba(255,255,255,.1)"
          : "1px solid rgba(255,255,255,.04)",
        opacity: selected ? 1 : 0.38,
        transition: "opacity 120ms ease, background 120ms ease, border-color 120ms ease",
        touchAction: "manipulation",
      }}>

      {/* Role cycle chip — field players only, shown when selected */}
      {role === "player" && selected && (
        <button
          type="button"
          aria-label="Rolle wechseln"
          onClick={(e) => { e.stopPropagation(); onCycleRole?.(); }}
          style={{
            position: "absolute", top: "0.28rem", right: "0.28rem",
            display: "grid", placeItems: "center",
            width: "1.2rem", height: "1.2rem",
            borderRadius: "var(--radius-sm)",
            background: "rgba(0,0,0,.45)",
            border: "none", cursor: "pointer", padding: 0,
            touchAction: "manipulation",
          }}>
          <Icon name={ROLE_ICON[playerRole || "center"]} size={10}
            color={ROLE_COLOR[playerRole || "center"]} strokeWidth={2.5} />
        </button>
      )}

      {nr ? (
        <span style={{
          display: "flex", alignItems: "baseline", gap: "1px",
          fontWeight: 900,
          fontSize: role === "goalie" ? "1.5rem" : "1.25rem",
          lineHeight: 1, color: numColor, fontVariantNumeric: "tabular-nums",
        }}>
          <span style={{ fontSize: "0.55em", opacity: 0.5, fontWeight: 700 }}>#</span>
          {nr}
        </span>
      ) : null}
      <span style={{
        fontSize: nr ? "0.875rem" : "1rem", fontWeight: nr ? 500 : 700, lineHeight: 1.2,
        color: selected ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.3)",
        textAlign: "center", padding: "0 0.2rem",
      }}>{name}</span>
    </div>
  );
}

/* ── Input ── */
function TextInput({ label, value, onChange, placeholder, type = "text" }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <label style={{
        fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(255,255,255,.35)",
      }}>{label}</label>
      <input
        type={type} value={value} placeholder={type === "text" ? placeholder : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          background: focused ? "rgba(0,44,140,.18)" : "rgba(255,255,255,.05)",
          border: `1px solid ${focused ? "rgba(0,51,160,.7)" : "rgba(255,255,255,.1)"}`,
          borderRadius: "var(--radius-lg)",
          color: "#fff", fontFamily: "var(--font-sans)",
          fontSize: "0.9375rem", fontWeight: 500,
          padding: "0.65rem 0.85rem", outline: "none", width: "100%",
          boxSizing: "border-box",
          transition: "background 120ms ease, border-color 120ms ease",
          colorScheme: "dark",
          "::placeholder": { color: "rgba(255,255,255,.2)" },
        }}
      />
    </div>
  );
}

/* ── FormatPicker ── */
function FormatPicker({ value, onChange }) {
  const opts = [
    { v: 2, label: "2 × Hälfte" },
    { v: 3, label: "3 × Drittel" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      <label style={{
        fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(255,255,255,.35)",
      }}>Format</label>
      <div style={{
        display: "flex", gap: "0.25rem",
        background: "rgba(255,255,255,.05)", padding: "0.22rem",
        borderRadius: "var(--radius-lg)",
      }}>
        {opts.map((o) => (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            flex: 1, appearance: "none", cursor: "pointer",
            padding: "0.5rem", border: "none",
            borderRadius: "var(--radius-md)",
            background: value === o.v ? "#0033a0" : "transparent",
            color: value === o.v ? "#fff" : "rgba(255,255,255,.4)",
            fontFamily: "var(--font-sans)", fontWeight: 600,
            fontSize: "0.8125rem", transition: "background 100ms ease, color 100ms ease",
            touchAction: "manipulation",
          }}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Count badge ── */
function CountBadge({ selected, total }) {
  return (
    <span style={{
      fontSize: "0.6875rem", fontWeight: 600, color: "rgba(255,255,255,.28)",
      letterSpacing: "0.04em",
    }}>{selected}/{total}</span>
  );
}

/* ── RosterEditor ── */
function RosterEditor({ goalies, players, scriptUrl, initialGame, initialRoster, onSave, onBack }) {
  const isEdit = Boolean(initialGame && initialGame.id);

  // Parse initialGame date from DD.MM.YYYY or YYYY-MM-DD to YYYY-MM-DD for <input type=date>
  function _toIso(raw) {
    if (!raw) return "";
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) {
      const [d, m, y] = raw.split(".");
      return `${y}-${m}-${d}`;
    }
    return raw;
  }

  const [opponent,   setOpponent]   = React.useState(initialGame ? initialGame.opponent || "" : "");
  const [venue,      setVenue]      = React.useState(initialGame ? initialGame.venue    || "" : "");
  const [format,     setFormat]     = React.useState(initialGame ? (Number(initialGame.format) || 2) : 2);
  const [date,       setDate]       = React.useState(initialGame ? _toIso(initialGame.date) : "");
  const [time,       setTime]       = React.useState(initialGame ? initialGame.time || "" : "");

  // Build selected sets from initialRoster if editing; otherwise select all
  const [selGoalies, setSelGoalies] = React.useState(() => {
    if (initialRoster && initialRoster.length > 0) {
      const selIds = new Set(
        initialRoster.filter((r) => String(r.selected).toLowerCase() !== "no")
                     .map((r) => Number(r.player_id))
      );
      return new Set(goalies.filter((g) => selIds.has(g.id)).map((g) => g.id));
    }
    return new Set(goalies.map((g) => g.id));
  });
  const [selPlayers, setSelPlayers] = React.useState(() => {
    if (initialRoster && initialRoster.length > 0) {
      const selIds = new Set(
        initialRoster.filter((r) => String(r.selected).toLowerCase() !== "no")
                     .map((r) => Number(r.player_id))
      );
      return new Set(players.filter((p) => selIds.has(p.id)).map((p) => p.id));
    }
    return new Set(players.map((p) => p.id));
  });

  // Build roles from initialRoster overrides, fall back to squad defaults
  const [roles, setRoles] = React.useState(() => {
    const r = {};
    players.forEach((p) => { r[p.id] = p.role || "center"; });
    if (initialRoster) {
      initialRoster.forEach((row) => {
        if (row.role) r[Number(row.player_id)] = row.role;
      });
    }
    return r;
  });
  const [saving, setSaving] = React.useState(false);

  function toggleGoalie(id) {
    setSelGoalies((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function togglePlayer(id) {
    setSelPlayers((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function cycleRole(id) {
    setRoles((prev) => {
      const cur = prev[id] || "center";
      const next = ROLE_CYCLE[(ROLE_CYCLE.indexOf(cur) + 1) % ROLE_CYCLE.length];
      return { ...prev, [id]: next };
    });
  }

  async function handleSave() {
    const todayIso    = new Date().toISOString().split("T")[0];
    const rawDate     = date || todayIso;
    const [y, m, d]   = rawDate.split("-");
    const displayDate = `${d}.${m}.${y}`;
    const timeStr     = time || "";
    const oppStr      = opponent.trim() || "Gegner";
    const timePart    = timeStr.replace(":", "");
    // Reuse existing game_id when editing so the Query sheet and all events stay linked
    const gameId      = isEdit ? initialGame.id : `${rawDate.replace(/-/g, "")}_${timePart}`;
    const displayName = `${rawDate} ${timeStr} ${oppStr}`.trim();

    const selectedGoalies = goalies.filter((g) => selGoalies.has(g.id));
    const selectedPlayers = players.filter((p) => selPlayers.has(p.id));

    // Build per-game roster payload
    const rosterRows = [
      ...selectedGoalies.map((g) => ({ player_id: g.id, number: g.nr, name: g.name, selected: "yes", role: "" })),
      ...selectedPlayers.map((p) => ({ player_id: p.id, number: p.nr, name: p.name, selected: "yes", role: roles[p.id] || "center" })),
    ];

    if (scriptUrl) {
      setSaving(true);
      try {
        const body = new URLSearchParams({
          action_type:  "saveGame",
          game_id:      gameId,
          display_name: displayName,
          game_date:    displayDate,
          game_start:   timeStr,
          opponent:     oppStr,
          type:         "regular",
          venue:        venue.trim(),
          home:         "yes",
          format:       String(format),
          team:         "Jets U14B Blau",
        });
        await fetch(scriptUrl, { method: "POST", body });

        const rosterBody = new URLSearchParams({
          action_type: "saveGameRoster",
          game_id:     gameId,
          roster:      JSON.stringify(rosterRows),
        });
        await fetch(scriptUrl, { method: "POST", body: rosterBody });
      } catch (_) {
        // Network failure — continue locally anyway
      } finally {
        setSaving(false);
      }
    }

    // Build roles map keyed by player id for the tracker
    const rolesById = {};
    selectedPlayers.forEach((p) => { rolesById[p.id] = roles[p.id] || "center"; });

    onSave(
      { id: gameId, opponent: oppStr, venue: venue.trim(),
        date: displayDate, time: timeStr, format, home: true, type: "regular", _rawDate: rawDate },
      selectedGoalies,
      selectedPlayers,
      rolesById,
    );
  }

  const canStart = selGoalies.size + selPlayers.size > 0;

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      background: "var(--bg-app)", color: "#fff",
    }}>

      {/* Header */}
      <header style={{
        flexShrink: 0, zIndex: 10,
        background: CHROME_BG_ED,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: GOLD_LINE_ED,
        padding: "0.9rem 1rem",
        display: "flex", alignItems: "center", gap: "0.75rem",
      }}>
        <button onClick={onBack} style={{
          appearance: "none", cursor: "pointer",
          width: "2.25rem", height: "2.25rem",
          borderRadius: "var(--radius-pill)",
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.1)",
          display: "grid", placeItems: "center",
          flexShrink: 0,
        }}>
          <Icon name="chevron-left" size={17} strokeWidth={2} color="rgba(255,255,255,.65)" />
        </button>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
          <span style={{ fontWeight: 900, fontSize: "1.0625rem", color: "#fff" }}>
            {isEdit ? "Spiel bearbeiten" : "Neues Spiel"}
          </span>
        </div>
      </header>

      {/* Scrollable content */}
      <main style={{
        flex: 1, overflowY: "auto",
        padding: "1.25rem 1rem 5.5rem",
        display: "flex", flexDirection: "column", gap: "1.5rem",
      }}>

        {/* Game info */}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <TextInput label="Datum" value={date} onChange={setDate} type="date" />
            <TextInput label="Uhrzeit" value={time} onChange={setTime} type="time" />
          </div>
          <TextInput label="Gegner" value={opponent} onChange={setOpponent} placeholder="z.B. Zürich Dragons" />
          <TextInput label="Spielort" value={venue} onChange={setVenue} placeholder="z.B. Sporthalle Stighag, Kloten" />
          <FormatPicker value={format} onChange={setFormat} />
        </section>

        {/* Goalies */}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SectionLabel>Goalie</SectionLabel>
            <CountBadge selected={selGoalies.size} total={goalies.length} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "var(--tile-gap)" }}>
            {goalies.map((g) => (
              <EditorTile key={g.id} nr={g.nr} name={g.name} role="goalie"
                selected={selGoalies.has(g.id)}
                onToggle={() => toggleGoalie(g.id)} />
            ))}
          </div>
        </section>

        {/* Field players */}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <SectionLabel>Feldspieler</SectionLabel>
            <CountBadge selected={selPlayers.size} total={players.length} />
          </div>

          {/* Role legend */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {[
              { id: "center",   icon: "circle-dot", color: "rgba(255,255,255,.5)", label: "Center" },
              { id: "defender", icon: "shield",      color: "#60a5fa",             label: "Def" },
              { id: "winger",   icon: "zap",         color: "#4ade80",             label: "Wing" },
            ].map((r) => (
              <span key={r.id} style={{
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
                fontSize: "0.75rem", color: "rgba(255,255,255,.38)", fontWeight: 500,
              }}>
                <Icon name={r.icon} size={12} color={r.color} strokeWidth={2} />
                {r.label}
              </span>
            ))}
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,.25)", fontStyle: "italic" }}>
              — Chip tippen zum Wechseln
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--tile-gap)" }}>
            {players.map((p) => (
              <EditorTile key={p.id} nr={p.nr} name={p.name} role="player"
                selected={selPlayers.has(p.id)}
                playerRole={roles[p.id] || "center"}
                onToggle={() => togglePlayer(p.id)}
                onCycleRole={() => cycleRole(p.id)} />
            ))}
          </div>
        </section>

      </main>

      {/* Fixed bottom CTA */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
        background: CHROME_BG_ED,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: GOLD_LINE_ED,
        padding: "0.6rem 1rem max(0.6rem, env(safe-area-inset-bottom))",
      }}>
        <Button variant="primary" size="lg" fullWidth icon={saving ? "loader" : "check"}
          disabled={!canStart || saving} onClick={handleSave}>
          {saving ? "Speichern…" : "Speichern"}
        </Button>
      </div>

    </div>
  );
}

window.RosterEditor = RosterEditor;
