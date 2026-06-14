/* Schedule screen — Jets brand palette, Lucide icons.
   Matches the deep navy chrome of LiveTracker for visual consistency.
   Brand: #0033a0 navy · #ffcd00 gold */

const SCHED_CHROME_BG  = "rgba(1,9,35,.95)";
const SCHED_GOLD_LINE  = "1px solid rgba(255,205,0,.2)";

function ScheduleHeader({ onNewGame }) {
  return (
    <header style={{
      flexShrink: 0, zIndex: 10,
      background: SCHED_CHROME_BG,
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      borderBottom: SCHED_GOLD_LINE,
      padding: "0.9rem 1rem",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <span style={{
          display: "grid", placeItems: "center",
          width: "2rem", height: "2rem",
          borderRadius: "var(--radius-md)",
          background: "#0033a0",
          flexShrink: 0,
        }}>
          <Icon name="activity" size={16} color="#fff" strokeWidth={2.5} />
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
          <span style={{ fontWeight: 900, fontSize: "1.0625rem", lineHeight: 1, color: "#fff", letterSpacing: "-0.01em" }}>Jets</span>
          <span style={{ color: "rgba(255,255,255,.38)", fontSize: "0.875rem", fontWeight: 500 }}>Tracker</span>
        </div>
      </div>

      {/* Header actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {/* Calendar */}
        <button style={{
          appearance: "none", cursor: "pointer",
          width: "2.25rem", height: "2.25rem",
          borderRadius: "var(--radius-pill)",
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.1)",
          display: "grid", placeItems: "center",
          color: "rgba(255,255,255,.55)",
        }}>
          <Icon name="calendar-days" size={17} strokeWidth={2} />
        </button>

        {/* New game */}
        <button onClick={onNewGame} title="Neues Spiel" style={{
          appearance: "none", cursor: "pointer",
          width: "2.25rem", height: "2.25rem",
          borderRadius: "var(--radius-pill)",
          background: "rgba(0,51,160,.25)",
          border: "1px solid rgba(0,51,160,.5)",
          display: "grid", placeItems: "center",
          color: "#93c5fd",
        }}>
          <Icon name="plus" size={17} strokeWidth={2.5} />
        </button>
      </div>
    </header>
  );
}

function GameCardRow({ game, emphasis, onOpen, onEdit }) {
  return (
    <div style={{ position: "relative" }}>
      <GameCard {...game} emphasis={emphasis} onClick={() => onOpen(game)} />
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(game); }}
        aria-label="Spiel bearbeiten"
        style={{
          position: "absolute", top: "50%", right: "2.75rem",
          transform: "translateY(-50%)",
          appearance: "none", cursor: "pointer",
          width: "2rem", height: "2rem",
          borderRadius: "var(--radius-md)",
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.12)",
          display: "grid", placeItems: "center",
          touchAction: "manipulation",
        }}>
        <Icon name="pencil" size={13} color="rgba(255,255,255,.55)" strokeWidth={2} />
      </button>
    </div>
  );
}

function Schedule({ games, onOpen, onEdit, onNewGame }) {
  const today    = games.filter((g) => g.group === "today");
  const upcoming = games.filter((g) => g.group === "upcoming");
  const past     = games.filter((g) => g.group === "past");

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      background: "var(--bg-app)", color: "#fff",
    }}>
      <ScheduleHeader onNewGame={onNewGame} />

      <main style={{
        flex: 1, overflowY: "auto",
        padding: "1.25rem 1rem 2.5rem",
        display: "flex", flexDirection: "column", gap: "var(--section-gap)",
      }}>

        {/* Today */}
        {today.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            <SectionLabel>Heute</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--tile-gap)" }}>
              {today.map((g, i) => (
                <GameCardRow key={g.id || `today-${i}`} game={g}
                  emphasis="today" onOpen={onOpen} onEdit={onEdit} />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            <SectionLabel>Nächste Spiele</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--tile-gap)" }}>
              {upcoming.map((g, i) => (
                <GameCardRow key={g.id || `upcoming-${i}`} game={g}
                  emphasis="upcoming" onOpen={onOpen} onEdit={onEdit} />
              ))}
            </div>
          </section>
        )}

        {/* Past */}
        {past.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
            <SectionLabel>Vergangene Spiele</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--tile-gap)" }}>
              {past.map((g, i) => (
                <GameCardRow key={g.id || `past-${i}`} game={g}
                  emphasis="past" onOpen={onOpen} onEdit={onEdit} />
              ))}
            </div>
          </section>
        )}

        {/* Kader */}
        <div style={{
          borderTop: "1px solid rgba(255,255,255,.07)",
          paddingTop: "1.25rem",
          display: "flex", flexDirection: "column", gap: "0.65rem",
        }}>
          <SectionLabel>Kader</SectionLabel>
          <button onClick={() => onOpen(null)} style={{
            appearance: "none", cursor: "pointer", textAlign: "left", width: "100%",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(255,255,255,.025)",
            border: "1px solid rgba(255,255,255,.07)",
            borderRadius: "var(--radius-xl)",
            padding: "0.85rem 1rem",
            fontFamily: "var(--font-sans)",
            touchAction: "manipulation",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{
                display: "grid", placeItems: "center",
                width: "2.25rem", height: "2.25rem",
                borderRadius: "var(--radius-lg)",
                background: "rgba(255,255,255,.06)",
                flexShrink: 0,
              }}>
                <Icon name="users" size={17} color="rgba(255,255,255,.55)" />
              </span>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem", color: "rgba(255,255,255,.8)" }}>
                  Vollkader
                </p>
                <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "rgba(255,255,255,.28)" }}>
                  Alle Spieler — ohne Spielauswahl
                </p>
              </div>
            </div>
            <Icon name="arrow-right" size={16} color="rgba(255,255,255,.25)" />
          </button>
        </div>

      </main>
    </div>
  );
}

window.Schedule = Schedule;
