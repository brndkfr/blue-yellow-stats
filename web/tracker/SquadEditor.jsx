/* Squad editor — manage default roles, active status, and add players.
   Accessed via the Vollkader button on the Schedule screen. */

const CHROME_BG_SQ = "rgba(1,9,35,.95)";
const GOLD_LINE_SQ = "1px solid rgba(255,205,0,.2)";
const SE_ROLE_CYCLE = ["center", "defender", "winger"];

const SE_ROLE_ICON  = { center: "circle-dot", defender: "shield", winger: "zap" };
const SE_ROLE_COLOR = { center: "rgba(255,255,255,.6)", defender: "#60a5fa", winger: "#4ade80" };
const SE_ROLE_LABEL = { center: "Center", defender: "Def", winger: "Wing" };

function SquadEditor({ goalies, players, scriptUrl, onBack, onSave }) {
  const [roles,        setRoles]        = React.useState(() => {
    const r = {};
    players.forEach((p) => { r[p.id] = p.role || "center"; });
    return r;
  });
  const [activeMap,    setActiveMap]    = React.useState(() => {
    const m = {};
    [...goalies, ...players].forEach((p) => { m[p.id] = true; });
    return m;
  });
  const [changed,      setChanged]      = React.useState(new Set());
  const [addedGoalies, setAddedGoalies] = React.useState([]);
  const [addedPlayers, setAddedPlayers] = React.useState([]);
  const [addForm,      setAddForm]      = React.useState(null); // null | 'goalie' | 'player'
  const [addName,      setAddName]      = React.useState('');
  const [addNr,        setAddNr]        = React.useState('');
  const [addRole,      setAddRole]      = React.useState('center');
  const [addSaving,    setAddSaving]    = React.useState(false);
  const [saving,       setSaving]       = React.useState(false);

  function cycleRole(id) {
    setRoles((prev) => {
      const cur  = prev[id] || "center";
      const next = SE_ROLE_CYCLE[(SE_ROLE_CYCLE.indexOf(cur) + 1) % SE_ROLE_CYCLE.length];
      return { ...prev, [id]: next };
    });
    setChanged((prev) => new Set(prev).add(id));
  }

  function toggleActive(id) {
    setActiveMap((prev) => ({ ...prev, [id]: !prev[id] }));
    setChanged((prev) => new Set(prev).add(id));
  }

  function openAddForm(type) {
    setAddName(''); setAddNr(''); setAddRole('center');
    setAddForm(type);
  }

  async function confirmAdd() {
    if (!addName.trim()) return;
    setAddSaving(true);
    const params = new URLSearchParams({
      action_type: 'saveSquadPlayer',
      name:   addName.trim(),
      number: addNr.trim(),
      type:   addForm === 'goalie' ? 'goalie' : 'player',
      role:   addForm === 'player' ? addRole : '',
      active: 'yes',
    });
    let newId = Date.now(); // fallback local id
    if (scriptUrl) {
      try {
        const res = await fetch(scriptUrl, { method: 'POST', body: params }).then((r) => r.json());
        if (res.id) newId = res.id;
      } catch (_) {}
    }
    const newEntry = {
      id:   newId,
      nr:   addNr.trim() ? Number(addNr.trim()) : NaN,
      name: addName.trim(),
      role: addForm === 'player' ? addRole : '',
    };
    if (addForm === 'goalie') {
      setAddedGoalies((prev) => [...prev, newEntry]);
      setActiveMap((prev) => ({ ...prev, [newId]: true }));
    } else {
      setAddedPlayers((prev) => [...prev, newEntry]);
      setActiveMap((prev) => ({ ...prev, [newId]: true }));
      setRoles((prev) => ({ ...prev, [newId]: addRole }));
    }
    setAddSaving(false);
    setAddForm(null);
  }

  async function handleSave() {
    setSaving(true);
    const allGoalies = [...goalies, ...addedGoalies];
    const allPlayers = [...players, ...addedPlayers];
    const toUpdate   = [...allGoalies, ...allPlayers].filter((p) => changed.has(p.id));

    if (scriptUrl && toUpdate.length > 0) {
      try {
        await Promise.all(toUpdate.map((p) =>
          fetch(scriptUrl, { method: 'POST', body: new URLSearchParams({
            action_type: 'saveSquadPlayer',
            id:     String(p.id),
            number: p.nr && !isNaN(p.nr) ? String(p.nr) : '',
            name:   p.name,
            type:   goalies.includes(p) || addedGoalies.includes(p) ? 'goalie' : 'player',
            role:   roles[p.id] || p.role || '',
            active: activeMap[p.id] ? 'yes' : 'no',
          })})
        ));
      } catch (_) {}
    }
    setSaving(false);

    const updatedGoalies = allGoalies.filter((p) => activeMap[p.id] !== false);
    const updatedPlayers = allPlayers
      .filter((p) => activeMap[p.id] !== false)
      .map((p) => ({ ...p, role: roles[p.id] || p.role }));
    onSave(updatedGoalies, updatedPlayers);
  }

  const allGoalies = [...goalies, ...addedGoalies];
  const allPlayers = [...players, ...addedPlayers];
  const dirtyCount = changed.size;

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      background: "var(--bg-app)", color: "#fff",
    }}>

      {/* Header */}
      <header style={{
        flexShrink: 0, zIndex: 10,
        background: CHROME_BG_SQ,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderBottom: GOLD_LINE_SQ,
        padding: "0.9rem 1rem",
        display: "flex", alignItems: "center", gap: "0.75rem",
      }}>
        <button onClick={onBack} style={{
          appearance: "none", cursor: "pointer",
          width: "2.25rem", height: "2.25rem",
          borderRadius: "var(--radius-pill)",
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.1)",
          display: "grid", placeItems: "center", flexShrink: 0,
        }}>
          <Icon name="chevron-left" size={17} strokeWidth={2} color="rgba(255,255,255,.65)" />
        </button>
        <span style={{ fontWeight: 900, fontSize: "1.0625rem", color: "#fff" }}>
          Kader verwalten
        </span>
      </header>

      {/* Scrollable content */}
      <main style={{
        flex: 1, overflowY: "auto",
        padding: "1.25rem 1rem 1.5rem",
        display: "flex", flexDirection: "column", gap: "1.5rem",
      }}>

        {/* Goalies */}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <SectionLabel count={allGoalies.length}>Goalie</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "var(--tile-gap)" }}>
            {allGoalies.map((g) => {
              const isActive = activeMap[g.id] !== false;
              return (
                <div key={g.id} style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: "0.15rem", padding: "0.7rem 0.3rem",
                  background: "rgba(255,255,255,.04)",
                  borderRadius: "var(--radius-xl)",
                  border: isActive ? "1px solid rgba(255,255,255,.07)" : "1px solid rgba(239,68,68,.2)",
                  opacity: isActive ? 1 : 0.4,
                  transition: "opacity 150ms ease, border-color 150ms ease",
                }}>
                  {/* Deactivate / re-activate toggle */}
                  <button
                    onClick={() => toggleActive(g.id)}
                    style={{
                      position: "absolute", top: "0.28rem", right: "0.28rem",
                      display: "grid", placeItems: "center",
                      width: "1.2rem", height: "1.2rem",
                      borderRadius: "var(--radius-sm)",
                      background: isActive ? "rgba(0,0,0,.45)" : "rgba(239,68,68,.2)",
                      border: "none", cursor: "pointer", padding: 0,
                      touchAction: "manipulation",
                    }}>
                    <Icon name={isActive ? "x" : "plus"} size={10}
                      color={isActive ? "rgba(255,255,255,.4)" : "#fca5a5"} strokeWidth={2.5} />
                  </button>

                  {g.nr && !isNaN(g.nr) ? (
                    <span style={{
                      display: "flex", alignItems: "baseline", gap: "1px",
                      fontWeight: 900, fontSize: "1.5rem", lineHeight: 1,
                      color: "rgba(255,205,0,.55)", fontVariantNumeric: "tabular-nums",
                    }}>
                      <span style={{ fontSize: "0.55em", opacity: 0.5, fontWeight: 700 }}>#</span>
                      {g.nr}
                    </span>
                  ) : null}
                  <span style={{
                    fontSize: g.nr && !isNaN(g.nr) ? "0.875rem" : "1rem",
                    fontWeight: g.nr && !isNaN(g.nr) ? 500 : 700,
                    color: "rgba(255,255,255,.55)", textAlign: "center", padding: "0 0.2rem",
                  }}>{g.name}</span>
                  <span style={{
                    marginTop: "0.25rem", fontSize: "0.625rem", fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: "rgba(255,205,0,.4)",
                  }}>Goalie</span>
                </div>
              );
            })}
            {/* Add goalie */}
            <button onClick={() => openAddForm('goalie')} style={{
              appearance: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "0.35rem", padding: "0.7rem 0.3rem",
              background: "rgba(255,255,255,.02)",
              borderRadius: "var(--radius-xl)",
              border: "1px dashed rgba(255,255,255,.12)",
              touchAction: "manipulation",
            }}>
              <Icon name="plus" size={18} color="rgba(255,255,255,.2)" strokeWidth={2} />
              <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "rgba(255,255,255,.2)",
                letterSpacing: "0.06em", textTransform: "uppercase" }}>Hinzufügen</span>
            </button>
          </div>
        </section>

        {/* Field players */}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <SectionLabel count={allPlayers.length}>Feldspieler</SectionLabel>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "rgba(255,255,255,.28)" }}>
            Rolle tippen zum Wechseln · X zum Deaktivieren
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--tile-gap)" }}>
            {allPlayers.map((p) => {
              const role     = roles[p.id] || "center";
              const isActive = activeMap[p.id] !== false;
              return (
                <div key={p.id} style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: "0.15rem", padding: "0.7rem 0.3rem",
                  background: isActive
                    ? (changed.has(p.id) ? "rgba(0,51,160,.12)" : "rgba(255,255,255,.04)")
                    : "rgba(255,255,255,.02)",
                  borderRadius: "var(--radius-xl)",
                  border: isActive
                    ? (changed.has(p.id) ? "1px solid rgba(0,51,160,.4)" : "1px solid rgba(255,255,255,.07)")
                    : "1px solid rgba(239,68,68,.2)",
                  opacity: isActive ? 1 : 0.4,
                  transition: "background 120ms ease, border-color 120ms ease, opacity 150ms ease",
                }}>
                  {/* Role chip (only when active) */}
                  {isActive && (
                    <button
                      onClick={() => cycleRole(p.id)}
                      style={{
                        position: "absolute", top: "0.28rem", right: "0.28rem",
                        display: "grid", placeItems: "center",
                        width: "1.2rem", height: "1.2rem",
                        borderRadius: "var(--radius-sm)",
                        background: "rgba(0,0,0,.45)",
                        border: "none", cursor: "pointer", padding: 0,
                        touchAction: "manipulation",
                      }}>
                      <Icon name={SE_ROLE_ICON[role]} size={10} color={SE_ROLE_COLOR[role]} strokeWidth={2.5} />
                    </button>
                  )}

                  {/* Deactivate / re-activate toggle */}
                  <button
                    onClick={() => toggleActive(p.id)}
                    style={{
                      position: "absolute", top: "0.28rem", left: "0.28rem",
                      display: "grid", placeItems: "center",
                      width: "1.2rem", height: "1.2rem",
                      borderRadius: "var(--radius-sm)",
                      background: isActive ? "rgba(0,0,0,.45)" : "rgba(239,68,68,.2)",
                      border: "none", cursor: "pointer", padding: 0,
                      touchAction: "manipulation",
                    }}>
                    <Icon name={isActive ? "x" : "plus"} size={10}
                      color={isActive ? "rgba(255,255,255,.4)" : "#fca5a5"} strokeWidth={2.5} />
                  </button>

                  {p.nr && !isNaN(p.nr) ? (
                    <span style={{
                      display: "flex", alignItems: "baseline", gap: "1px",
                      fontWeight: 900, fontSize: "1.25rem", lineHeight: 1,
                      color: "rgba(96,165,250,.55)", fontVariantNumeric: "tabular-nums",
                    }}>
                      <span style={{ fontSize: "0.55em", opacity: 0.5, fontWeight: 700 }}>#</span>
                      {p.nr}
                    </span>
                  ) : null}
                  <span style={{
                    fontSize: p.nr && !isNaN(p.nr) ? "0.875rem" : "1rem",
                    fontWeight: p.nr && !isNaN(p.nr) ? 500 : 700,
                    color: "rgba(255,255,255,.7)", textAlign: "center", padding: "0 0.2rem",
                    lineHeight: 1.2,
                  }}>{p.name}</span>
                  {isActive && (
                    <span style={{
                      marginTop: "0.2rem", fontSize: "0.625rem", fontWeight: 700,
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      color: SE_ROLE_COLOR[role],
                    }}>{SE_ROLE_LABEL[role]}</span>
                  )}
                </div>
              );
            })}
            {/* Add player */}
            <button onClick={() => openAddForm('player')} style={{
              appearance: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "0.35rem", padding: "0.7rem 0.3rem",
              background: "rgba(255,255,255,.02)",
              borderRadius: "var(--radius-xl)",
              border: "1px dashed rgba(255,255,255,.12)",
              touchAction: "manipulation",
            }}>
              <Icon name="plus" size={18} color="rgba(255,255,255,.2)" strokeWidth={2} />
              <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "rgba(255,255,255,.2)",
                letterSpacing: "0.06em", textTransform: "uppercase" }}>Hinzufügen</span>
            </button>
          </div>
        </section>

      </main>

      {/* Bottom CTA */}
      <div style={{
        flexShrink: 0, zIndex: 20,
        background: CHROME_BG_SQ,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: GOLD_LINE_SQ,
        padding: "0.6rem 1rem max(0.6rem, env(safe-area-inset-bottom))",
      }}>
        <Button variant="primary" size="lg" fullWidth icon={saving ? "loader" : "check"}
          disabled={saving || dirtyCount === 0} onClick={handleSave}>
          {saving ? "Speichern…" : `Speichern${dirtyCount > 0 ? ` (${dirtyCount})` : ""}`}
        </Button>
      </div>

      {/* Add player/goalie sheet */}
      {addForm && (
        <div onClick={() => setAddForm(null)} style={{
          position: "absolute", inset: 0, zIndex: 40,
          background: "rgba(0,0,0,.72)", backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: "0 0.75rem 0.75rem",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "100%",
            background: "#0b1120",
            border: "1px solid rgba(255,255,255,.09)",
            borderRadius: "var(--radius-2xl)",
            padding: "0.75rem 0.85rem 1rem",
            boxShadow: "0 -16px 48px rgba(0,0,0,.6)",
            display: "flex", flexDirection: "column", gap: "0.75rem",
          }}>
            <div style={{ width: "2rem", height: "3px", background: "rgba(255,255,255,.15)", borderRadius: "2px", margin: "0 auto 0.1rem" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 700, fontSize: "0.9375rem" }}>
              <Icon name={addForm === 'goalie' ? "shield-check" : "user-plus"} size={17}
                color="rgba(255,255,255,.6)" />
              {addForm === 'goalie' ? "Goalie hinzufügen" : "Spieler hinzufügen"}
            </div>

            {/* Name */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>Name</label>
              <input
                autoFocus
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Vorname Nachname"
                style={{
                  appearance: "none", outline: "none",
                  width: "100%", boxSizing: "border-box",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "var(--radius-lg)",
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.15)",
                  color: "#fff", fontFamily: "var(--font-sans)", fontSize: "0.9375rem",
                }}
              />
            </div>

            {/* Jersey number */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>Trikotnummer (optional)</label>
              <input
                type="number"
                value={addNr}
                onChange={(e) => setAddNr(e.target.value)}
                placeholder="–"
                style={{
                  appearance: "none", outline: "none",
                  width: "100%", boxSizing: "border-box",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "var(--radius-lg)",
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.15)",
                  color: "#fff", fontFamily: "var(--font-sans)", fontSize: "0.9375rem",
                }}
              />
            </div>

            {/* Role picker (players only) */}
            {addForm === 'player' && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "rgba(255,255,255,.35)" }}>Rolle</label>
                <div style={{ display: "flex", gap: "0.25rem", background: "rgba(255,255,255,.05)",
                  padding: "0.22rem", borderRadius: "var(--radius-lg)" }}>
                  {SE_ROLE_CYCLE.map((r) => (
                    <button key={r} onClick={() => setAddRole(r)} style={{
                      flex: 1, appearance: "none", cursor: "pointer", padding: "0.5rem", border: "none",
                      borderRadius: "var(--radius-md)",
                      background: addRole === r ? "#0033a0" : "transparent",
                      color: addRole === r ? "#fff" : "rgba(255,255,255,.4)",
                      fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.8125rem",
                      transition: "background 100ms ease, color 100ms ease", touchAction: "manipulation",
                    }}>{SE_ROLE_LABEL[r]}</button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="secondary" size="md" fullWidth onClick={() => setAddForm(null)}>
                Abbrechen
              </Button>
              <Button variant="primary" size="md" fullWidth icon={addSaving ? "loader" : "user-plus"}
                disabled={addSaving || !addName.trim()} onClick={confirmAdd}>
                {addSaving ? "…" : "Hinzufügen"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

window.SquadEditor = SquadEditor;
