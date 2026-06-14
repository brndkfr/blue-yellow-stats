/* Jets Tracker UI kit — primitives (icon-based, Jets brand palette).
   Brand: #0033a0 (Pantone 286C navy) · #ffcd00 (Pantone 116C gold)
   Icons: Lucide UMD (replaces all emoji from the source app). */

/* ---- Icon ---- */
function _pascal(name) {
  return name.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
}
function Icon({ name, size = 22, color = "currentColor", strokeWidth = 1.75, style }) {
  const lib = window.lucide;
  const node = lib && (lib.icons?.[_pascal(name)] || lib[_pascal(name)]);
  if (!node) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0, ...style }} aria-hidden="true">
      {node.map((child, i) => React.createElement(child[0], { key: i, ...child[1] }))}
    </svg>
  );
}

/* ---- Button ---- */
function Button({ children, variant = "primary", size = "md", fullWidth = false,
                  disabled = false, icon, onClick, style, ...rest }) {
  const [pressed, setPressed] = React.useState(false);
  const palette = {
    primary:   { bg: "#0033a0",              press: "#002680",              fg: "#fff" },
    secondary: { bg: "rgba(255,255,255,.07)", press: "rgba(255,255,255,.12)", fg: "#e5e7eb",
                 border: "1px solid rgba(255,255,255,.12)" },
    danger:    { bg: "#b91c1c",              press: "#991b1b",              fg: "#fff" },
    success:   { bg: "#16a34a",              press: "#15803d",              fg: "#fff" },
    goal:      { bg: "#ffcd00",              press: "#e6ba00",              fg: "#020c1b" },
    ghost:     { bg: "transparent",          press: "rgba(255,255,255,.06)", fg: "var(--gray-400)" },
  }[variant] || {};
  const sz = {
    sm: { padding: "0.4rem 0.75rem",  font: "0.75rem",   minH: "2rem",    gap: "0.3rem", iconSz: 15 },
    md: { padding: "0.65rem 1rem",    font: "0.875rem",  minH: "2.75rem", gap: "0.4rem", iconSz: 16 },
    lg: { padding: "0.9rem 1.125rem", font: "1rem",      minH: "3.25rem", gap: "0.5rem", iconSz: 18 },
  }[size] || {};
  const bg = pressed && !disabled ? palette.press : palette.bg;
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        appearance: "none",
        border: palette.border || "none",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: sz.gap, fontFamily: "var(--font-sans)", fontWeight: 700,
        fontSize: sz.font, lineHeight: 1,
        color: palette.fg, background: bg,
        padding: sz.padding, minHeight: sz.minH,
        width: fullWidth ? "100%" : "auto",
        borderRadius: "var(--radius-lg)", opacity: disabled ? 0.28 : 1,
        transform: pressed && !disabled ? "scale(0.97)" : "scale(1)",
        transition: "transform 80ms ease, background 100ms ease",
        touchAction: "manipulation",
        letterSpacing: variant === "goal" ? "0.025em" : "normal",
        ...style,
      }} {...rest}>
      {icon && <Icon name={icon} size={sz.iconSz} color={palette.fg} />}
      {children}
    </button>
  );
}

/* ---- Badge ---- */
function Badge({ children, tone = "neutral", shape = "square", style, ...rest }) {
  const tones = {
    neutral: { bg: "rgba(255,255,255,.09)",  fg: "var(--gray-300)" },
    home:    { bg: "rgba(0,51,160,.32)",     fg: "#93c5fd" },
    away:    { bg: "rgba(255,255,255,.07)",  fg: "var(--gray-400)" },
    regular: { bg: "rgba(255,255,255,.08)",  fg: "var(--gray-300)" },
    cup:     { bg: "rgba(161,98,7,.32)",     fg: "#fef08a" },
    test:    { bg: "rgba(147,51,234,.22)",   fg: "#d8b4fe" },
    demo:    { bg: "rgba(17,94,89,.55)",     fg: "#5eead4" },
    live:    { bg: "#ffcd00",               fg: "#020c1b" },
    pending: { bg: "#dc2626",               fg: "#fff"    },
    success: { bg: "#166534",               fg: "#fff"    },
  }[tone] || { bg: "rgba(255,255,255,.08)", fg: "var(--gray-300)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.25rem",
      fontFamily: "var(--font-sans)", fontWeight: 700,
      fontSize: "0.6875rem", letterSpacing: "0.035em", lineHeight: 1,
      color: tones.fg, background: tones.bg,
      padding: shape === "pill" ? "0.3rem 0.65rem" : "0.22rem 0.5rem",
      borderRadius: shape === "pill" ? "var(--radius-pill)" : "var(--radius-md)",
      whiteSpace: "nowrap", textTransform: "uppercase",
      ...style,
    }} {...rest}>
      {children}
    </span>
  );
}

/* ---- SectionLabel ---- */
function SectionLabel({ children, count, style, ...rest }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", ...style }} {...rest}>
      <p style={{
        margin: 0, fontFamily: "var(--font-sans)", fontWeight: 600,
        fontSize: "0.6875rem", lineHeight: 1,
        textTransform: "uppercase", letterSpacing: "0.16em",
        color: "rgba(255,255,255,.35)",
      }}>{children}</p>
      {count != null && (
        <span style={{
          fontSize: "0.6875rem", color: "rgba(255,255,255,.22)",
          fontWeight: 600, letterSpacing: "0.05em",
        }}>{count}</span>
      )}
    </div>
  );
}

/* ---- RosterTile ---- */
const ROLE_ICON  = { defender: "shield", center: "circle-dot", winger: "zap" };
const ROLE_COLOR = { defender: "#60a5fa", center: "rgba(255,255,255,.5)", winger: "#4ade80" };

function RosterTile({ nr, name, role = "player", playerRole, state = "default", onClick, style, ...rest }) {
  const numColor = {
    goalie:  "#ffcd00",
    player:  "var(--blue-400)",
    reserve: "rgba(255,255,255,.25)",
  }[role] || "var(--blue-400)";

  const variants = {
    default:     { bg: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", ring: "none",                        opacity: 1,    cursor: "pointer" },
    selected:    { bg: "rgba(0,44,140,.3)",     border: "1px solid transparent",           ring: "0 0 0 2.5px #ffcd00",          opacity: 1,    cursor: "pointer" },
    assistTarget:{ bg: "rgba(0,44,140,.15)",    border: "1px solid transparent",           ring: "0 0 0 2px rgba(0,51,160,.65)", opacity: 1,    cursor: "pointer" },
    disabled:    { bg: "rgba(100,30,10,.28)",   border: "1px solid transparent",           ring: "0 0 0 2px rgba(180,50,20,.4)", opacity: 0.5,  cursor: "not-allowed" },
  }[state] || {};

  const roleIcon  = playerRole && ROLE_ICON[playerRole];
  const roleColor = playerRole && ROLE_COLOR[playerRole];

  return (
    <button onClick={state === "disabled" ? undefined : onClick}
      disabled={state === "disabled"}
      style={{
        appearance: "none", position: "relative",
        border: variants.border, cursor: variants.cursor, opacity: variants.opacity,
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "0.15rem", width: "100%", padding: "0.7rem 0.3rem",
        background: variants.bg, borderRadius: "var(--radius-xl)",
        boxShadow: variants.ring,
        transition: "background 100ms ease, box-shadow 100ms ease",
        touchAction: "manipulation", fontFamily: "var(--font-sans)",
        ...style,
      }} {...rest}>

      {/* Role indicator chip (field players only) */}
      {roleIcon && (
        <span style={{
          position: "absolute", top: "0.3rem", right: "0.3rem",
          display: "grid", placeItems: "center",
          width: "1.15rem", height: "1.15rem",
          borderRadius: "var(--radius-sm)",
          background: "rgba(0,0,0,.35)",
        }}>
          <Icon name={roleIcon} size={10} color={roleColor} strokeWidth={2.5} />
        </span>
      )}

      <span style={{
        display: "flex", alignItems: "baseline", gap: "1px",
        fontWeight: 900,
        fontSize: role === "goalie" ? "1.5rem" : "1.25rem",
        lineHeight: 1, color: numColor, fontVariantNumeric: "tabular-nums",
      }}>
        <span style={{ fontSize: "0.55em", opacity: 0.5, fontWeight: 700 }}>#</span>
        {nr}
      </span>
      <span style={{
        fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.2,
        color: role === "reserve" ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.8)",
        textAlign: "center", padding: "0 0.2rem",
      }}>{name}</span>
    </button>
  );
}

/* ---- ActionTile ---- */
function ActionTile({ icon, label, tint = "neutral", span = 1, onClick, style, ...rest }) {
  const [pressed, setPressed] = React.useState(false);
  const tints = {
    neutral: { chip: "rgba(255,255,255,.08)",   ic: "rgba(255,255,255,.7)" },
    blue:    { chip: "rgba(0,51,160,.28)",       ic: "#93c5fd" },
    yellow:  { chip: "rgba(255,205,0,.18)",      ic: "#ffcd00" },
    red:     { chip: "rgba(220,38,38,.22)",      ic: "#fca5a5" },
    green:   { chip: "rgba(34,197,94,.2)",       ic: "#4ade80" },
  }[tint] || {};
  return (
    <button onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        appearance: "none",
        border: "1px solid rgba(255,255,255,.07)",
        cursor: "pointer",
        gridColumn: span > 1 ? `span ${span}` : undefined,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: "0.5rem",
        minHeight: "5.5rem", padding: "0.85rem 0.5rem",
        background: pressed ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.025)",
        borderRadius: "var(--radius-xl)", fontFamily: "var(--font-sans)",
        transform: pressed ? "scale(0.94)" : "scale(1)",
        transition: "transform 70ms ease, background 90ms ease",
        touchAction: "manipulation",
        ...style,
      }} {...rest}>
      <span style={{
        display: "grid", placeItems: "center",
        width: "2.75rem", height: "2.75rem",
        borderRadius: "var(--radius-lg)", background: tints.chip,
        flexShrink: 0,
      }}>
        <Icon name={icon} size={22} color={tints.ic} strokeWidth={1.75} />
      </span>
      <span style={{
        fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.2,
        textAlign: "center", color: "rgba(255,255,255,.75)",
      }}>{label}</span>
    </button>
  );
}

/* ---- GameCard ---- */
function GameCard({ opponent, venue, date, time, home = true, type = "regular",
                    live = false, emphasis = "today", onClick, style, ...rest }) {
  const typeLabel = { regular: "Meisterschaft", cup: "Cup", test: "Testspiel", demo: "Demo" }[type] || type;
  const past = emphasis === "past";
  const bg = emphasis === "today"
    ? "rgba(0,44,140,.13)"
    : emphasis === "upcoming"
    ? "rgba(255,255,255,.03)"
    : "rgba(255,255,255,.015)";
  return (
    <button onClick={onClick} style={{
      appearance: "none", textAlign: "left", cursor: "pointer", width: "100%",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "0.5rem", background: bg,
      border: "1px solid rgba(255,255,255,.07)",
      borderLeft: emphasis === "today" ? "3px solid #0033a0" : "3px solid transparent",
      borderRadius: "var(--radius-xl)",
      padding: "0.85rem 1rem", opacity: past ? 0.45 : 1,
      fontFamily: "var(--font-sans)",
      touchAction: "manipulation",
      ...style,
    }} {...rest}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
          {date && <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,.4)" }}>{date}</span>}
          {time && <span style={{ fontSize: "0.75rem", fontWeight: 700, color: past ? "rgba(255,255,255,.3)" : "#ffcd00" }}>{time}</span>}
          {!past && <Badge tone={home ? "home" : "away"}>{home ? "Heim" : "Auswärts"}</Badge>}
          {!past && <Badge tone={type}>{typeLabel}</Badge>}
          {live && <Badge tone="live">Live</Badge>}
        </div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem", lineHeight: 1.2,
          color: past ? "rgba(255,255,255,.4)" : "#fff" }}>{opponent}</p>
        {venue && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem",
          color: past ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.38)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{venue}</p>}
      </div>
      <Icon name="chevron-right" size={18} color={past ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.35)"} />
    </button>
  );
}

/* ---- PeriodTabs ---- */
function PeriodTabs({ format = 2, active = 1, onChange, includeOvertime = true, style, ...rest }) {
  const periods = format === 3
    ? [{ n: 1, label: "1. Drittel" }, { n: 2, label: "2. Drittel" }, { n: 3, label: "3. Drittel" }]
    : [{ n: 1, label: "1. Hälfte" },  { n: 2, label: "2. Hälfte" }];
  const base = {
    appearance: "none", border: "none", cursor: "pointer",
    fontFamily: "var(--font-sans)", fontWeight: 600,
    fontSize: "0.75rem", padding: "0.45rem 0",
    borderRadius: "var(--radius-md)",
    transition: "background 100ms ease, color 100ms ease",
    touchAction: "manipulation",
  };
  return (
    <div style={{
      display: "flex", gap: "0.25rem",
      background: "rgba(255,255,255,.05)", padding: "0.22rem",
      borderRadius: "var(--radius-lg)", ...style,
    }} {...rest}>
      {periods.map((p) => {
        const on = active === p.n;
        return (
          <button key={p.n} onClick={() => onChange?.(p.n)}
            style={{ ...base, flex: 1,
              background: on ? "#0033a0" : "transparent",
              color: on ? "#fff" : "rgba(255,255,255,.38)" }}>
            {p.label}
          </button>
        );
      })}
      {includeOvertime && (
        <button onClick={() => onChange?.(99)}
          style={{ ...base, padding: "0.45rem 0.8rem",
            background: active === 99 ? "var(--purple-600)" : "transparent",
            color: active === 99 ? "#fff" : "rgba(255,255,255,.38)" }}>
          OT
        </button>
      )}
    </div>
  );
}

/* ---- Toast ---- */
function Toast({ show = true, tone = "success", icon, children, style, ...rest }) {
  const tones = {
    success: { bg: "rgba(20,83,45,.97)",   border: "rgba(74,222,128,.2)",  ic: "#4ade80" },
    info:    { bg: "rgba(10,20,50,.97)",   border: "rgba(255,255,255,.1)", ic: "rgba(255,255,255,.6)" },
    pending: { bg: "rgba(185,28,28,.97)",  border: "rgba(252,165,165,.2)", ic: "#fca5a5" },
  }[tone] || {};
  return (
    <div role="status" style={{
      display: show ? "flex" : "none", alignItems: "center", justifyContent: "center",
      gap: "0.5rem", background: tones.bg, color: "#fff",
      fontFamily: "var(--font-sans)", fontSize: "0.875rem", fontWeight: 500,
      textAlign: "center", padding: "0.65rem 1rem",
      borderRadius: "var(--radius-lg)",
      boxShadow: "0 8px 32px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.4)",
      border: `1px solid ${tones.border}`,
      ...style,
    }} {...rest}>
      {icon && <Icon name={icon} size={17} color={tones.ic} />}
      <span>{children}</span>
    </div>
  );
}

Object.assign(window, { Icon, Button, Badge, SectionLabel, RosterTile, ActionTile, GameCard, PeriodTabs, Toast, ROLE_ICON, ROLE_COLOR });
