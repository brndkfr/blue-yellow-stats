/* App router — Schedule ⇄ RosterEditor ⇄ LiveTracker
   Data is loaded from Google Sheets via the Apps Script endpoint (scriptUrl).
   The URL is stored in localStorage under "jets_script_url". */

const LS_KEY_URL = 'jets_script_url';

// ---------------------------------------------------------------------------
// Config screen — shown when no script URL is stored
// ---------------------------------------------------------------------------

function ConfigScreen({ onSave }) {
  const [url, setUrl] = React.useState('');
  const [error, setError] = React.useState('');

  function handleSave() {
    const trimmed = url.trim();
    if (!trimmed.startsWith('https://')) {
      setError('Please enter a valid https:// URL.');
      return;
    }
    onSave(trimmed);
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg-app)', color: '#fff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '2rem 1.5rem', gap: '1.5rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '3.5rem', height: '3.5rem', borderRadius: '1rem',
          background: 'rgba(0,51,160,.3)', border: '1px solid rgba(0,51,160,.5)',
          display: 'grid', placeItems: 'center', margin: '0 auto 1rem',
        }}>
          <Icon name="link" size={22} color="#93c5fd" />
        </div>
        <h1 style={{ margin: '0 0 0.4rem', fontSize: '1.25rem', fontWeight: 800 }}>
          Connect Google Sheet
        </h1>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,.45)', lineHeight: 1.5 }}>
          Paste the Apps Script deployment URL to load squad and games data.
        </p>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(''); }}
          placeholder="https://script.google.com/macros/s/..."
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(255,255,255,.06)',
            border: error ? '1px solid #f87171' : '1px solid rgba(255,255,255,.15)',
            color: '#fff', fontFamily: 'var(--font-sans)', fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        {error && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#f87171' }}>{error}</p>
        )}
      </div>

      <Button variant="primary" size="lg" fullWidth icon="check" onClick={handleSave}>
        Save &amp; Connect
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------------------

function LoadingScreen({ message }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg-app)', color: '#fff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '1rem',
    }}>
      <Icon name="loader" size={28} color="rgba(255,255,255,.3)" />
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'rgba(255,255,255,.4)' }}>
        {message || 'Loading…'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function _parseGame(row) {
  // Normalize a row from the Games sheet into the shape the UI expects
  const rawDate = row.date || ''; // stored as DD.MM.YYYY or YYYY-MM-DD
  let isoDate = '';
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(rawDate)) {
    const [d, m, y] = rawDate.split('.');
    isoDate = `${y}-${m}-${d}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    isoDate = rawDate;
  }

  let group = 'upcoming';
  if (isoDate) {
    const gameDate  = new Date(isoDate);
    const todayD    = new Date(); todayD.setHours(0, 0, 0, 0);
    const tomorrowD = new Date(todayD); tomorrowD.setDate(todayD.getDate() + 1);
    group = gameDate < todayD ? 'past' : gameDate < tomorrowD ? 'today' : 'upcoming';
  }

  return {
    id:           row.game_id      || '',
    display_name: row.display_name || '',
    group,
    opponent:     row.opponent     || '',
    date:         rawDate,
    time:         row.time         || '',
    home:         String(row.home).toLowerCase() !== 'no',
    type:         row.type         || 'regular',
    venue:        row.venue        || '',
    format:       Number(row.format) || 2,
    _rawDate:     isoDate,
  };
}

function _splitSquad(squadRows) {
  const goalies = [];
  const players = [];
  squadRows.forEach((r) => {
    const obj = { id: Number(r.id), nr: Number(r.number), name: r.name, role: r.role };
    if (String(r.type).toLowerCase() === 'goalie') goalies.push(obj);
    else players.push(obj);
  });
  goalies.sort((a, b) => a.name.localeCompare(b.name));
  players.sort((a, b) => a.name.localeCompare(b.name));
  return { goalies, players };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [scriptUrl,    setScriptUrl]    = React.useState(() => {
    const fromConfig = window.JETS_CONFIG && window.JETS_CONFIG.scriptUrl;
    if (fromConfig) { localStorage.setItem(LS_KEY_URL, fromConfig); return fromConfig; }
    return localStorage.getItem(LS_KEY_URL) || '';
  });
  const [refreshKey,   setRefreshKey]   = React.useState(0);
  const [loading,      setLoading]      = React.useState(false);
  const [loadError,    setLoadError]    = React.useState('');
  const [games,        setGames]        = React.useState([]);
  const [goalies,      setGoalies]      = React.useState([]);
  const [players,      setPlayers]      = React.useState([]);

  const [screen,        setScreen]       = React.useState('schedule');
  const [game,          setGame]         = React.useState(null);
  const [activeGoalies, setActiveGoalies]= React.useState([]);
  const [activePlayers, setActivePlayers]= React.useState([]);
  const [initialRoles,  setInitialRoles] = React.useState({});
  const [editingGame,   setEditingGame]  = React.useState(null);
  const [editRoster,    setEditRoster]   = React.useState(null);
  const [showSettings,  setShowSettings] = React.useState(false);

  // Load squad + games from Sheets whenever scriptUrl is set
  React.useEffect(() => {
    if (!scriptUrl) return;
    // eslint-disable-next-line no-unused-expressions
    refreshKey; // tracked so retry increments trigger a re-fetch
    setLoading(true);
    setLoadError('');

    Promise.all([
      fetch(`${scriptUrl}?action=squad`).then((r) => r.json()),
      fetch(`${scriptUrl}?action=games`).then((r) => r.json()),
    ])
      .then(([squadRows, gameRows]) => {
        const { goalies: g, players: p } = _splitSquad(squadRows);
        setGoalies(g);
        setPlayers(p);
        setGames(gameRows.map(_parseGame));
      })
      .catch((err) => {
        setLoadError(`Could not load data: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, [scriptUrl, refreshKey]);

  function handleConfigSave(url) {
    localStorage.setItem(LS_KEY_URL, url);
    setScriptUrl(url);
  }

  async function openGame(g) {
    if (!g) {
      // "Quick track" with full squad, no saved roster
      setGame({ id: '', opponent: 'Vollkader', format: 2 });
      setActiveGoalies(goalies);
      setActivePlayers(players);
      setInitialRoles({});
      setScreen('tracker');
      return;
    }

    // Try to fetch the saved game roster
    let rGoalies = goalies;
    let rPlayers = players;
    let roles    = {};

    if (scriptUrl && g.id) {
      try {
        const rows = await fetch(`${scriptUrl}?action=gameRoster&game_id=${encodeURIComponent(g.id)}`).then((r) => r.json());
        if (rows.length > 0) {
          const selected = rows.filter((r) => String(r.selected).toLowerCase() !== 'no');
          const selIds   = new Set(selected.map((r) => Number(r.player_id)));
          rGoalies = goalies.filter((p) => selIds.has(p.id));
          rPlayers = players.filter((p) => selIds.has(p.id));
          selected.forEach((r) => {
            if (r.role) roles[Number(r.player_id)] = r.role;
          });
          // Fall back to squad default role if no per-game role set
          [...rGoalies, ...rPlayers].forEach((p) => {
            if (!roles[p.id] && p.role) roles[p.id] = p.role;
          });
        }
      } catch (_) {
        // Network error — fall back to full squad silently
      }
    }

    // Also carry over any in-memory roster set by the editor (_goalies/_players/_roles)
    if (g._goalies) rGoalies = g._goalies;
    if (g._players) rPlayers = g._players;
    if (g._roles)   roles    = g._roles;

    setGame(g);
    setActiveGoalies(rGoalies);
    setActivePlayers(rPlayers);
    setInitialRoles(roles);
    setScreen('tracker');
  }

  async function handleEditGame(g) {
    let rosterRows = [];
    if (scriptUrl && g.id) {
      try {
        rosterRows = await fetch(`${scriptUrl}?action=gameRoster&game_id=${encodeURIComponent(g.id)}`).then((r) => r.json());
      } catch (_) {}
    }
    setEditingGame(g);
    setEditRoster(rosterRows);
    setScreen('editor');
  }

  function saveFromEditor(g, gList, pList, roles) {
    const rawDate = g._rawDate || new Date().toISOString().split('T')[0];
    const [yr, mo, dy] = rawDate.split('-').map(Number);
    const gameDate  = new Date(yr, mo - 1, dy);
    const todayD    = new Date(); todayD.setHours(0, 0, 0, 0);
    const tomorrowD = new Date(todayD); tomorrowD.setDate(todayD.getDate() + 1);
    const group = gameDate < todayD ? 'past' : gameDate < tomorrowD ? 'today' : 'upcoming';
    const updated = { ...g, group, _goalies: gList, _players: pList, _roles: roles };
    setGames((prev) => {
      const idx = prev.findIndex((x) => x.id === g.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
      return [...prev, updated];
    });
    setEditingGame(null);
    setEditRoster(null);
    setScreen('schedule');
  }

  // Show config screen if no URL is stored
  if (!scriptUrl) {
    return <ConfigScreen onSave={handleConfigSave} />;
  }

  if (loading) {
    return <LoadingScreen message="Loading squad and games…" />;
  }

  if (loadError) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        background: 'var(--bg-app)', color: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '2rem', gap: '1rem', textAlign: 'center',
      }}>
        <Icon name="wifi-off" size={32} color="#f87171" />
        <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Connection failed</p>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'rgba(255,255,255,.4)' }}>{loadError}</p>
        <Button variant="secondary" size="md" icon="refresh-cw"
          onClick={() => setRefreshKey((k) => k + 1)}>
          Retry
        </Button>
        <button
          onClick={() => { localStorage.removeItem(LS_KEY_URL); setScriptUrl(''); }}
          style={{
            appearance: 'none', background: 'none', border: 'none',
            color: 'rgba(255,255,255,.3)', fontSize: '0.75rem', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>
          Change URL
        </button>
      </div>
    );
  }

  if (screen === 'editor') {
    return <RosterEditor
      goalies={goalies}
      players={players}
      scriptUrl={scriptUrl}
      initialGame={editingGame}
      initialRoster={editRoster}
      onSave={saveFromEditor}
      onBack={() => { setEditingGame(null); setEditRoster(null); setScreen('schedule'); }}
    />;
  }
  if (screen === 'tracker') {
    return <LiveTracker
      game={game}
      goalies={activeGoalies}
      players={activePlayers}
      initialRoles={initialRoles}
      scriptUrl={scriptUrl}
      onBack={() => setScreen('schedule')}
    />;
  }
  const shortUrl = scriptUrl.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').slice(0, 24) + '…';

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Schedule
        games={games}
        onOpen={openGame}
        onEdit={handleEditGame}
        onNewGame={() => { setEditingGame(null); setEditRoster(null); setScreen('editor'); }}
        onSettings={() => setShowSettings(true)}
      />

      {/* Settings sheet */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          padding: '0 0.75rem 0.75rem',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%',
            background: '#0b1120',
            border: '1px solid rgba(255,255,255,.09)',
            borderRadius: 'var(--radius-2xl)',
            padding: '0.75rem 0.85rem 1rem',
            boxShadow: '0 -16px 48px rgba(0,0,0,.6)',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
          }}>
            <div style={{ width: '2rem', height: '3px', background: 'rgba(255,255,255,.15)', borderRadius: '2px', margin: '0 auto 0.25rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="settings" size={16} color="rgba(255,255,255,.4)" strokeWidth={2} />
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#fff' }}>Einstellungen</span>
            </div>
            <div style={{
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 'var(--radius-lg)', padding: '0.6rem 0.85rem',
            }}>
              <p style={{ margin: '0 0 0.15rem', fontSize: '0.6875rem', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,.3)' }}>
                Script URL
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(255,255,255,.5)',
                fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {shortUrl}
              </p>
            </div>
            <button onClick={() => { setShowSettings(false); setRefreshKey((k) => k + 1); }} style={{
              appearance: 'none', cursor: 'pointer', width: '100%',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 'var(--radius-lg)', padding: '0.75rem 0.85rem',
              fontFamily: 'var(--font-sans)', touchAction: 'manipulation',
            }}>
              <Icon name="refresh-cw" size={16} color="#93c5fd" strokeWidth={2} />
              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>Daten neu laden</span>
            </button>
            <button onClick={() => { localStorage.removeItem(LS_KEY_URL); setScriptUrl(''); setShowSettings(false); }} style={{
              appearance: 'none', cursor: 'pointer', width: '100%',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              background: 'rgba(185,28,28,.1)', border: '1px solid rgba(239,68,68,.22)',
              borderRadius: 'var(--radius-lg)', padding: '0.75rem 0.85rem',
              fontFamily: 'var(--font-sans)', touchAction: 'manipulation',
            }}>
              <Icon name="link-2-off" size={16} color="#f87171" strokeWidth={2} />
              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#f87171' }}>URL ändern</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
