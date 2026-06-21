/* App router — Schedule ⇄ RosterEditor ⇄ LiveTracker
   Data is loaded from Google Sheets via the Apps Script endpoint (scriptUrl).
   The URL is stored in localStorage under "jets_script_url". */

const LS_KEY_URL      = 'jets_script_url';
const LS_CACHE_SQUAD  = 'jets_cache_squad';
const LS_CACHE_GAMES  = 'jets_cache_games';
const LS_CACHE_ROSTER = 'jets_cache_roster_';
const LS_QUEUE_KEY    = 'jets_event_queue';

function _readCache(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; }
}
function _writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
}
function _clearAllCaches() {
  [LS_CACHE_SQUAD, LS_CACHE_GAMES].forEach((k) => localStorage.removeItem(k));
  Object.keys(localStorage).filter((k) => k.startsWith(LS_CACHE_ROSTER)).forEach((k) => localStorage.removeItem(k));
}

// ---------------------------------------------------------------------------
// Event queue — lives at App level so it survives screen transitions
// ---------------------------------------------------------------------------

function _readQueue() {
  try { return JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '[]'); }
  catch (_) { return []; }
}
function _writeQueue(q) {
  try { localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(q)); return true; }
  catch (_) { return false; } // quota exceeded
}

function useEventQueue(scriptUrl) {
  const [queueSize,    setQueueSize]    = React.useState(() => _readQueue().length);
  const [swQueueSize,  setSwQueueSize]  = React.useState(0);
  const [storageError, setStorageError] = React.useState(false);
  const isFlushingRef  = React.useRef(false);
  const flushRef       = React.useRef(null);

  async function flush() {
    if (!scriptUrl || isFlushingRef.current) return;
    const q = _readQueue();
    if (q.length === 0) return;
    isFlushingRef.current = true;
    const remaining = [];
    for (const params of q) {
      try {
        const r = await fetch(scriptUrl, { method: 'POST', body: new URLSearchParams(params) });
        if (!r.ok) throw new Error('http ' + r.status);
        const body = await r.json();
        if (body && body.status === 'error') throw new Error('server error');
      } catch (_) {
        remaining.push(params);
      }
    }
    _writeQueue(remaining);
    setQueueSize(remaining.length);
    isFlushingRef.current = false;
  }

  // Keep flushRef current so callbacks always call the latest closure
  flushRef.current = flush;

  function enqueueOrSend(params) {
    if (!scriptUrl) return;
    fetch(scriptUrl, { method: 'POST', body: new URLSearchParams(params) })
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then((body) => {
        if (body && body.status === 'error') throw new Error(body.message || 'server error');
        // Success — drain any leftover queued items
        flushRef.current();
      })
      .catch(() => {
        const q = _readQueue();
        q.push({ ...params, was_queued: 'yes' });
        const ok = _writeQueue(q);
        if (!ok) {
          // localStorage quota exceeded — show persistent banner and attempt direct re-POST
          setStorageError(true);
          fetch(scriptUrl, {
            method: 'POST',
            body: new URLSearchParams({ ...params, was_queued: 'yes' }),
          }).catch(() => {});
        } else {
          setQueueSize(q.length);
        }
      });
  }

  // App-level listeners — survive all screen changes
  React.useEffect(() => {
    if (!scriptUrl) return;
    flushRef.current();
    const onFocus   = () => flushRef.current();
    const onVisible = () => { if (document.visibilityState === 'visible') flushRef.current(); };
    const onSwQueue = (e) => setSwQueueSize(e.detail || 0);
    const onSwError = (e) => {
      // SW could not save to IndexedDB — absorb into localStorage queue
      const params = e.detail;
      if (!params) return;
      const q = _readQueue();
      q.push({ ...params, was_queued: 'yes' });
      if (_writeQueue(q)) setQueueSize(q.length);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('jets-sw-queue', onSwQueue);
    window.addEventListener('jets-sw-error', onSwError);
    const interval = setInterval(() => flushRef.current(), 30_000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('jets-sw-queue', onSwQueue);
      window.removeEventListener('jets-sw-error', onSwError);
    };
  }, [scriptUrl]);

  // Warn before closing tab if events are still pending
  React.useEffect(() => {
    function onBeforeUnload(e) {
      if (queueSize + swQueueSize > 0) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [queueSize, swQueueSize]);

  // Stuck-queue: oldest event > 2 min old means drain is failing permanently
  const stuckQueue = React.useMemo(() => {
    if (queueSize === 0) return false;
    const q = _readQueue();
    const oldest = q.find((item) => item.timestamp);
    if (!oldest) return false;
    return Date.now() - new Date(oldest.timestamp).getTime() > 2 * 60 * 1000;
  }, [queueSize]);

  return {
    queueSize, swQueueSize, enqueueOrSend,
    onFlush: () => flushRef.current(),
    storageError, setStorageError, stuckQueue,
  };
}

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
    type:               row.type               || 'regular',
    venue:              row.venue              || '',
    format:             Number(row.format)     || 2,
    minutes_per_period: Number(row.minutes_per_period) || 20,
    result:             row.result             || '',
    _rawDate:           isoDate,
  };
}

function _applyRoster(rows, goalies, players) {
  const selected = rows.filter((r) => String(r.selected).toLowerCase() !== 'no');
  const selIds   = new Set(selected.map((r) => Number(r.player_id)));
  const rGoalies = goalies.filter((p) => selIds.has(p.id));
  const rPlayers = players.filter((p) => selIds.has(p.id));
  const roles    = {};
  selected.forEach((r) => { if (r.role) roles[Number(r.player_id)] = r.role; });
  [...rGoalies, ...rPlayers].forEach((p) => { if (!roles[p.id] && p.role) roles[p.id] = p.role; });
  return { rGoalies, rPlayers, roles };
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

  const {
    queueSize, swQueueSize, enqueueOrSend, onFlush,
    storageError, setStorageError, stuckQueue,
  } = useEventQueue(scriptUrl);

  // Load squad + games — stale-while-revalidate: serve cache instantly, refresh in background
  React.useEffect(() => {
    if (!scriptUrl) return;
    // eslint-disable-next-line no-unused-expressions
    refreshKey; // tracked so retry increments trigger a re-fetch
    setLoadError('');

    const cachedSquad = _readCache(LS_CACHE_SQUAD);
    const cachedGames = _readCache(LS_CACHE_GAMES);
    const hasCache    = cachedSquad && cachedGames;

    if (hasCache) {
      const { goalies: g, players: p } = _splitSquad(cachedSquad);
      setGoalies(g); setPlayers(p);
      setGames(cachedGames.map(_parseGame));
      setLoading(false);
    } else {
      setLoading(true);
    }

    Promise.all([
      fetch(`${scriptUrl}?action=squad`).then((r) => r.json()),
      fetch(`${scriptUrl}?action=games`).then((r) => r.json()),
    ])
      .then(([squadRows, gameRows]) => {
        _writeCache(LS_CACHE_SQUAD, squadRows);
        _writeCache(LS_CACHE_GAMES, gameRows);
        const { goalies: g, players: p } = _splitSquad(squadRows);
        setGoalies(g); setPlayers(p);
        setGames(gameRows.map(_parseGame));
      })
      .catch((err) => {
        if (!hasCache) setLoadError(`Could not load data: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, [scriptUrl, refreshKey]);

  function handleConfigSave(url) {
    localStorage.setItem(LS_KEY_URL, url);
    _clearAllCaches();
    setScriptUrl(url);
  }

  function openGame(g) {
    if (!g) return; // Vollkader now routes to squad editor, not tracker

    let rGoalies = goalies;
    let rPlayers = players;
    let roles    = {};

    // In-memory override from RosterEditor takes priority
    if (g._goalies) rGoalies = g._goalies;
    if (g._players) rPlayers = g._players;
    if (g._roles)   roles    = g._roles;

    if (!g._goalies && scriptUrl && g.id) {
      // Try cached roster for instant navigation
      const cached = _readCache(LS_CACHE_ROSTER + g.id);
      if (cached && cached.length > 0) {
        ({ rGoalies, rPlayers, roles } = _applyRoster(cached, goalies, players));
      }
      // Always refresh in background
      fetch(`${scriptUrl}?action=gameRoster&game_id=${encodeURIComponent(g.id)}`)
        .then((r) => r.json())
        .then((rows) => {
          if (rows.length > 0) {
            _writeCache(LS_CACHE_ROSTER + g.id, rows);
            const applied = _applyRoster(rows, goalies, players);
            setActiveGoalies(applied.rGoalies);
            setActivePlayers(applied.rPlayers);
          }
        })
        .catch(() => {});
    }

    setGame(g);
    setActiveGoalies(rGoalies);
    setActivePlayers(rPlayers);
    setInitialRoles(roles);
    setScreen('tracker');
  }

  function handleEditGame(g) {
    // Navigate immediately with cached roster (or empty → RosterEditor defaults all selected)
    const cached = scriptUrl && g.id ? (_readCache(LS_CACHE_ROSTER + g.id) || []) : [];
    setEditingGame(g);
    setEditRoster(cached);
    setScreen('editor');
    // Refresh cache in background; RosterEditor is already mounted so this helps next open
    if (scriptUrl && g.id) {
      fetch(`${scriptUrl}?action=gameRoster&game_id=${encodeURIComponent(g.id)}`)
        .then((r) => r.json())
        .then((rows) => _writeCache(LS_CACHE_ROSTER + g.id, rows))
        .catch(() => {});
    }
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
    // Cache the roster so next open is instant
    if (g.id) {
      const rosterForCache = [
        ...gList.map((p) => ({ player_id: p.id, number: p.nr, name: p.name, selected: 'yes', role: '' })),
        ...pList.map((p) => ({ player_id: p.id, number: p.nr, name: p.name, selected: 'yes', role: roles[p.id] || '' })),
      ];
      _writeCache(LS_CACHE_ROSTER + g.id, rosterForCache);
    }
    setEditingGame(null);
    setEditRoster(null);
    setScreen('schedule');
  }

  // Config + loading: no events can be queued yet, early return is safe
  if (!scriptUrl) return <ConfigScreen onSave={handleConfigSave} />;
  if (loading)    return <LoadingScreen message="Loading squad and games…" />;

  // Compute active screen content — always wrapped in root div so banner is visible everywhere
  let screenContent;
  if (loadError) {
    screenContent = (
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
          onClick={() => { _clearAllCaches(); localStorage.removeItem(LS_KEY_URL); setScriptUrl(''); }}
          style={{
            appearance: 'none', background: 'none', border: 'none',
            color: 'rgba(255,255,255,.3)', fontSize: '0.75rem', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}>
          Change URL
        </button>
      </div>
    );
  } else if (screen === 'editor') {
    screenContent = <RosterEditor
      goalies={goalies}
      players={players}
      scriptUrl={scriptUrl}
      enqueue={enqueueOrSend}
      initialGame={editingGame}
      initialRoster={editRoster}
      onSave={saveFromEditor}
      onBack={() => { setEditingGame(null); setEditRoster(null); setScreen('schedule'); }}
    />;
  } else if (screen === 'tracker') {
    screenContent = <LiveTracker
      game={game}
      goalies={activeGoalies}
      players={activePlayers}
      allGoalies={goalies}
      allPlayers={players}
      initialRoles={initialRoles}
      scriptUrl={scriptUrl}
      enqueueOrSend={enqueueOrSend}
      queueSize={queueSize}
      swQueueSize={swQueueSize}
      stuckQueue={stuckQueue}
      onFlush={onFlush}
      onBack={() => setScreen('schedule')}
      onRosterChange={(newGoalies, newPlayers) => {
        setActiveGoalies(newGoalies);
        setActivePlayers(newPlayers);
        if (game.id) {
          const rosterForCache = [
            ...newGoalies.map((g) => ({ player_id: g.id, number: g.nr, name: g.name, selected: 'yes', role: '' })),
            ...newPlayers.map((p) => ({ player_id: p.id, number: p.nr, name: p.name, selected: 'yes', role: initialRoles[p.id] || '' })),
          ];
          _writeCache(LS_CACHE_ROSTER + game.id, rosterForCache);
        }
      }}
      onEndGame={({ us, them }) => {
        const result = `${us}:${them}`;
        // Clear persisted score now that the game is officially over
        try { localStorage.removeItem('jets_score_' + game.id); } catch (_) {}
        if (game.id) {
          enqueueOrSend({
            action_type:        'saveGame',
            game_id:            game.id,
            display_name:       game.display_name || '',
            game_date:          game.date         || '',
            game_start:         game.time         || '',
            opponent:           game.opponent     || '',
            type:               game.type         || '',
            venue:              game.venue        || '',
            home:               game.home ? 'yes' : 'no',
            format:             String(game.format || 2),
            minutes_per_period: String(game.minutes_per_period || 20),
            team:               'Jets U14B Blau',
            result,
          });
        }
        setGames((prev) => {
          const updated = prev.map((g) => g.id === game.id ? { ...g, result } : g);
          _writeCache(LS_CACHE_GAMES, updated.map((g) => ({
            game_id: g.id, display_name: g.display_name || '', date: g.date, time: g.time || '',
            opponent: g.opponent, type: g.type, venue: g.venue, home: g.home ? 'yes' : 'no',
            format: String(g.format || 2), minutes_per_period: String(g.minutes_per_period || 20),
            team: 'Jets U14B Blau', result: g.id === game.id ? result : (g.result || ''),
          })));
          return updated;
        });
        setScreen('schedule');
      }}
    />;
  } else if (screen === 'squad') {
    screenContent = <SquadEditor
      goalies={goalies}
      players={players}
      scriptUrl={scriptUrl}
      onBack={() => setScreen('schedule')}
      onSave={(updatedGoalies, updatedPlayers) => {
        setGoalies(updatedGoalies);
        setPlayers(updatedPlayers);
        const squadForCache = [
          ...updatedGoalies.map((g) => ({ id: g.id, number: g.nr, name: g.name, type: 'goalie', role: g.role || '', active: 'yes' })),
          ...updatedPlayers.map((p) => ({ id: p.id, number: p.nr, name: p.name, type: 'player', role: p.role || '', active: 'yes' })),
        ];
        _writeCache(LS_CACHE_SQUAD, squadForCache);
        setScreen('schedule');
      }}
    />;
  } else {
    const shortUrl = scriptUrl.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').slice(0, 24) + '…';
    screenContent = (
      <>
        <Schedule
          games={games}
          onOpen={openGame}
          onEdit={handleEditGame}
          onNewGame={() => { setEditingGame(null); setEditRoster(null); setScreen('editor'); }}
          onSettings={() => setShowSettings(true)}
          onEditSquad={() => setScreen('squad')}
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
            <button onClick={() => { _clearAllCaches(); setShowSettings(false); setRefreshKey((k) => k + 1); }} style={{
              appearance: 'none', cursor: 'pointer', width: '100%',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 'var(--radius-lg)', padding: '0.75rem 0.85rem',
              fontFamily: 'var(--font-sans)', touchAction: 'manipulation',
            }}>
              <Icon name="refresh-cw" size={16} color="#93c5fd" strokeWidth={2} />
              <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#fff' }}>Daten neu laden</span>
            </button>
            <button onClick={() => { _clearAllCaches(); localStorage.removeItem(LS_KEY_URL); setScriptUrl(''); setShowSettings(false); }} style={{
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
      </>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Storage-full error banner — persistent until dismissed, visible on every screen */}
      {storageError && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
          background: '#7f1d1d', borderBottom: '1px solid #dc2626',
          padding: '0.5rem 0.75rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem',
          fontFamily: 'var(--font-sans)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icon name="alert-triangle" size={15} color="#fca5a5" />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fca5a5' }}>
              Speicher voll — Eintrag möglicherweise nicht gesichert
            </span>
          </div>
          <button onClick={() => setStorageError(false)} style={{
            appearance: 'none', background: 'none', border: 'none',
            cursor: 'pointer', color: '#fca5a5', padding: '0.25rem', flexShrink: 0,
          }}>
            <Icon name="x" size={14} color="#fca5a5" />
          </button>
        </div>
      )}
      {screenContent}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
