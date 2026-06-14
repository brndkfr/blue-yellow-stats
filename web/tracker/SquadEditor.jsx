/* Squad editor — view and edit default roles for all squad members.
   Changes are saved back to the Squad sheet via saveSquadPlayer. */

const CHROME_BG_SQ = "rgba(1,9,35,.95)";
const GOLD_LINE_SQ = "1px solid rgba(255,205,0,.2)";
const SE_ROLE_CYCLE = ["center", "defender", "winger"];

function SquadEditor({ goalies, players, scriptUrl, onBack, onSave }) {
  const [roles,   setRoles]   = React.useState(() => {
    const r = {};
    players.forEach((p) => { r[p.id] = p.role || "center"; });
    return r;
  });
  const [changed, setChanged] = React.useState(new Set());
  const [saving,  setSaving]  = React.useState(false);

  function cycleRole(id) {
    setRoles((prev) => {
      const cur  = prev[id] || "center";
      const next = SE_ROLE_CYCLE[(SE_ROLE_CYCLE.indexOf(cur) + 1) % SE_ROLE_CYCLE.length];
      return { ...prev, [id]: next };
    });
    setChanged((prev) => new Set(prev).add(id));
  }

  async function handleSave() {
    setSaving(true);
    if (scriptUrl && changed.size > 0) {
      const toUpdate = players.filter((p) => changed.has(p.id));
      try {
        await Promise.all(toUpdate.map((p) =>
          fetch(scriptUrl, { method: "POST", body: new URLSearchParams({
            action_type: "saveSquadPlayer",
            id:     String(p.id),
            number: p.nr ? String(p.nr) : "",
            name:   p.name,
            type:   "player",
            role:   roles[p.id] || "center",
            active: "yes",
          })})
        ));
      } catch (_) {}
    }
    setSaving(false);
    const updatedPlayers = players.map((p) => ({ ...p, role: roles[p.id] || p.role }));
    onSave(updatedPlayers);
  }

  const roleIcon  = { center: "circle-dot", defender: "shield", winger: "zap" };
  const roleColor = { center: "rgba(255,255,255,.6)", defender: "#60a5fa", winger: "#4ade80" };
  const roleLabel = { center: "Center", defender: "Def", winger: "Wing" };

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
          <SectionLabel count={goalies.length}>Goalie</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "var(--tile-gap)" }}>
            {goalies.map((g) => (
              <div key={g.id} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                gap: "0.15rem", padding: "0.7rem 0.3rem",
                background: "rgba(255,255,255,.04)",
                borderRadius: "var(--radius-xl)",
                border: "1px solid rgba(255,255,255,.07)",
              }}>
                {g.nr ? (
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
                  fontSize: g.nr ? "0.875rem" : "1rem", fontWeight: g.nr ? 500 : 700,
                  color: "rgba(255,255,255,.55)", textAlign: "center", padding: "0 0.2rem",
                }}>{g.name}</span>
                <span style={{
                  marginTop: "0.25rem", fontSize: "0.625rem", fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  color: "rgba(255,205,0,.4)",
                }}>Goalie</span>
              </div>
            ))}
          </div>
        </section>

        {/* Field players */}
        <section style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          <SectionLabel count={players.length}>Feldspieler</SectionLabel>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "rgba(255,255,255,.28)" }}>
            Chip tippen zum Wechseln der Standardrolle
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "var(--tile-gap)" }}>
            {players.map((p) => {
              const role = roles[p.id] || "center";
              const isDirty = changed.has(p.id);
              return (
                <div key={p.id} style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: "0.15rem", padding: "0.7rem 0.3rem",
                  background: isDirty ? "rgba(0,51,160,.12)" : "rgba(255,255,255,.04)",
                  borderRadius: "var(--radius-xl)",
                  border: isDirty ? "1px solid rgba(0,51,160,.4)" : "1px solid rgba(255,255,255,.07)",
                  transition: "background 120ms ease, border-color 120ms ease",
                }}>
                  {/* Role chip */}
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
                    <Icon name={roleIcon[role]} size={10} color={roleColor[role]} strokeWidth={2.5} />
                  </button>

                  {p.nr ? (
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
                    fontSize: p.nr ? "0.875rem" : "1rem", fontWeight: p.nr ? 500 : 700,
                    color: "rgba(255,255,255,.7)", textAlign: "center", padding: "0 0.2rem",
                    lineHeight: 1.2,
                  }}>{p.name}</span>
                  <span style={{
                    marginTop: "0.2rem", fontSize: "0.625rem", fontWeight: 700,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    color: roleColor[role],
                  }}>{roleLabel[role]}</span>
                </div>
              );
            })}
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
          disabled={saving || changed.size === 0} onClick={handleSave}>
          {saving ? "Speichern…" : `Speichern${changed.size > 0 ? ` (${changed.size})` : ""}`}
        </Button>
      </div>

    </div>
  );
}

window.SquadEditor = SquadEditor;
