/**
 * Jets Tracker Service Worker
 *
 * Two responsibilities:
 *  1. Intercept POST requests to Apps Script — on failure, persist to
 *     IndexedDB and register a Background Sync tag so the browser
 *     retries delivery even after the tab is closed.
 *  2. Return a synthetic { status: "queued" } response so the app
 *     never sees a failure (the localStorage queue stays empty when
 *     the SW is active — no double-queueing).
 */

const SYNC_TAG = 'jets-events';
const DB_NAME  = 'jets-sync';
const DB_STORE = 'queue';

self.addEventListener('install',  ()  => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ---------------------------------------------------------------------------
// Fetch interception — POST to Apps Script only
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'POST') return;
  if (!e.request.url.includes('script.google.com')) return;
  e.respondWith(handlePost(e.request));
});

async function handlePost(request) {
  const clone = request.clone(); // clone before fetch consumes the body stream
  try {
    const r    = await fetch(request);
    if (!r.ok) throw new Error('http ' + r.status);
    const body = await r.clone().json().catch(() => ({}));
    if (body && body.status === 'error') throw new Error(body.message || 'server error');
    notifyClients(0); // success — let the page know SW queue is clear
    return r;
  } catch (_) {
    // Persist params to IndexedDB and schedule a background retry
    try {
      const formData = await clone.formData();
      const params   = { _url: clone.url };
      for (const [k, v] of formData.entries()) params[k] = v;
      await dbPush(params);
      await self.registration.sync.register(SYNC_TAG);
      const all = await dbGetAll();
      notifyClients(all.length);
    } catch (_) {}
    // Synthetic success so the app doesn't activate its own localStorage queue
    return new Response(JSON.stringify({ status: 'queued' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------------------------------------------------------------------------
// Background Sync — drain IndexedDB queue when connectivity returns
// ---------------------------------------------------------------------------

self.addEventListener('sync', (e) => {
  if (e.tag === SYNC_TAG) e.waitUntil(drainQueue());
});

async function drainQueue() {
  const all = await dbGetAll();
  for (const { id, data } of all) {
    const url    = data._url;
    const params = { ...data };
    delete params._url;
    try {
      const r    = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
      if (!r.ok) throw new Error('http ' + r.status);
      const body = await r.json().catch(() => ({}));
      if (body && body.status === 'error') throw new Error('server error');
      await dbDelete(id);
    } catch (_) {
      break; // stop on first failure — sync will be retried by the browser
    }
  }
  const remaining = await dbGetAll();
  notifyClients(remaining.length);
}

// ---------------------------------------------------------------------------
// Tell open tabs how many events are in the SW queue
// ---------------------------------------------------------------------------

async function notifyClients(size) {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((c) => c.postMessage({ type: 'SW_QUEUE_SIZE', size }));
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbPush(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).add({ data });
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}
