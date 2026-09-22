// Lists page: saved lists, owned flags, ranking, and cloud sync.
// Every change is written to this device first, then to the cloud (/api/lists).
const L = globalThis.OrdnanceLists;
const S = globalThis.OrdnanceSearch;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const countryName = value => value === 'Usa' ? 'USA' : value === 'Ussr' ? 'USSR' : value;
const NATION_FLAG = {Usa:'\u{1F1FA}\u{1F1F8}',Germany:'\u{1F1E9}\u{1F1EA}',Britain:'\u{1F1EC}\u{1F1E7}',Japan:'\u{1F1EF}\u{1F1F5}',China:'\u{1F1E8}\u{1F1F3}',Italy:'\u{1F1EE}\u{1F1F9}',France:'\u{1F1EB}\u{1F1F7}',Sweden:'\u{1F1F8}\u{1F1EA}',Israel:'\u{1F1EE}\u{1F1F1}'};
const flag = nation => !nation ? '' : NATION_FLAG[nation] ? `<span class="nation-flag" role="img" aria-label="${esc(countryName(nation))}">${NATION_FLAG[nation]}</span>` : `<span class="nation-flag nation-text" aria-label="${esc(countryName(nation))}">${esc(String(nation).slice(0,4).toUpperCase())}</span>`;
const fmtBr = value => typeof value === 'number' ? value.toFixed(1) : '—';

const LOCAL_KEY = 'ordnance-lists-v1', PASS_KEY = 'ordnance-lists-key';
const SAVE_DELAY = 2000, RETRY_DELAY = 30000;

// ---------------------------------------------------------------- state
const storage = {
  get(key){ try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value){ try { localStorage.setItem(key, value); return true; } catch { return false; } },
  remove(key){ try { localStorage.removeItem(key); } catch {} }
};
function loadLocal(){
  try {
    const raw = JSON.parse(storage.get(LOCAL_KEY) || 'null');
    if (raw && raw.doc) return {doc: L.normalizeDoc(raw.doc), base: raw.base ? L.normalizeDoc(raw.base) : null, etag: typeof raw.etag === 'string' ? raw.etag : null, dirty: Boolean(raw.dirty)};
  } catch {}
  return {doc: L.emptyDoc(), base: null, etag: null, dirty: false};
}
let state = loadLocal();
let passKey = storage.get(PASS_KEY);
let sync = {status: passKey ? 'saving' : 'local', savedAt: null, message: ''};
let catalog = new Map(), catalogRows = [];
let openAdd = null, addQuery = '';
const expandedLists = new Set();
let rankOwned = 'all', rankDomain = 'all';
let saveTimer = null, retryTimer = null, inFlight = false;

const persistLocal = () => storage.set(LOCAL_KEY, JSON.stringify(state));
const newId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const vehicle = key => catalog.get(key) || {k:key, n:key.split(':')[1] || key, c:null, t:null, b:null, missing:true};
const nameOf = key => vehicle(key).n;

function commit(next){
  if (L.sameDoc(next, state.doc)) return;
  state = {...state, doc: next, dirty: true};
  persistLocal();
  render();
  scheduleSave();
}

// ----------------------------------------------------------------- cloud
async function api(method, {query = '', body, keepalive = false} = {}){
  try {
    const response = await fetch(`/api/lists${query}`, {method, keepalive, headers: {'Content-Type':'application/json', 'X-Lists-Key': passKey || ''}, body: body === undefined ? undefined : JSON.stringify(body)});
    let data = null; try { data = await response.json(); } catch {}
    return {status: response.status, data: data || {}};
  } catch { return {status: 0, data: {}}; }
}

function setSync(status, message = ''){ sync = {...sync, status, message}; renderSync(); }

function handleFailure(result){
  if (result.status === 401) { passKey = null; storage.remove(PASS_KEY); return setSync('locked', 'Passphrase was rejected. Enter it again to resume cloud saving.'); }
  if (result.status === 503) return setSync('unconfigured', result.data.error || '');
  setSync('offline', result.data.error || 'Could not reach the cloud.');
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => state.dirty ? saveNow() : pull(), RETRY_DELAY);
}

// Bring in the cloud copy, merging with any unsaved edits made on this device.
function adoptRemote(remoteDoc, etag){
  if (!remoteDoc) { state = {...state, etag: null, base: null, dirty: state.doc.lists.length > 0 || state.doc.owned.length > 0}; }
  else if (!state.dirty) { state = {doc: L.normalizeDoc(remoteDoc), base: L.normalizeDoc(remoteDoc), etag, dirty: false}; }
  else {
    const merged = L.mergeDocs(state.base || L.emptyDoc(), state.doc, remoteDoc);
    state = {doc: merged, base: L.normalizeDoc(remoteDoc), etag, dirty: !L.sameDoc(merged, remoteDoc)};
  }
  persistLocal();
}

async function pull(){
  if (!passKey) return setSync('local');
  setSync('saving');
  const result = await api('GET');
  if (result.status !== 200) return handleFailure(result);
  adoptRemote(result.data.doc, result.data.etag);
  sync.savedAt = result.data.doc ? result.data.doc.savedAt : null;
  render();
  if (state.dirty) return saveNow();
  setSync('saved');
}

function scheduleSave(){
  if (!passKey) return setSync('local');
  clearTimeout(saveTimer);
  setSync('pending');
  saveTimer = setTimeout(saveNow, SAVE_DELAY);
}

async function saveNow({keepalive = false} = {}){
  clearTimeout(saveTimer);
  if (!passKey || !state.dirty || inFlight) return;
  inFlight = true;
  setSync('saving');
  try {
    for (let attempt = 0; attempt < 3 && state.dirty; attempt++) {
      const sent = state.doc;
      const result = await api('PUT', {body: {doc: sent, etag: state.etag}, keepalive});
      if (result.status === 200) {
        state = {...state, etag: result.data.etag, base: {...sent, savedAt: result.data.savedAt}, dirty: !L.sameDoc(state.doc, sent)};
        sync.savedAt = result.data.savedAt;
        persistLocal();
        continue;
      }
      if (result.status === 409) { adoptRemote(result.data.doc, result.data.etag); render(); continue; }
      return handleFailure(result);
    }
    setSync(state.dirty ? 'pending' : 'saved');
    if (state.dirty) scheduleSave();
  } finally { inFlight = false; }
}

async function connect(passphrase){
  passKey = passphrase;
  setSync('saving');
  const result = await api('GET');
  if (result.status === 401) { passKey = null; return setSync('locked', 'Wrong passphrase.'); }
  if (result.status !== 200) { const keep = result.status === 0; if (!keep) passKey = null; else storage.set(PASS_KEY, passphrase); return handleFailure(result); }
  storage.set(PASS_KEY, passphrase);
  // First connection on this device: combine local lists with the cloud copy.
  if (!state.base && result.data.doc) state = {...state, dirty: true};
  adoptRemote(result.data.doc, result.data.etag);
  render();
  if (state.dirty) return saveNow();
  setSync('saved');
}

// ------------------------------------------------------------- backups
function download(){
  const blob = new Blob([JSON.stringify(state.doc, null, 2)], {type:'application/json'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `ordnance-lists-${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
// Import and backup restore both ADD to what you have. Nothing current is removed.
const unionWith = doc => L.mergeDocs(L.emptyDoc(), state.doc, doc);

async function openBackups(){
  $('backupBody').innerHTML = '<p class="muted">Loading backups…</p>';
  $('backupDialog').showModal();
  const result = await api('GET', {query:'?backups=1'});
  if (result.status !== 200) { $('backupBody').innerHTML = `<p class="muted">${esc(result.data.error || 'Backups are unavailable right now.')}</p>`; return; }
  const dates = result.data.dates || [];
  $('backupBody').innerHTML = `<p class="muted">The cloud keeps each day's final version. Restoring adds the lists and vehicles from that day back in; nothing you have now is removed.</p>` +
    (dates.length ? dates.map(date => `<button class="lists-btn" data-action="restore" data-date="${esc(date)}">${esc(date)}</button>`).join('') : '<p class="muted">No daily backups yet. The first one is kept after your first save on a new day.</p>');
}

// ------------------------------------------------------------- rendering
function vehicleCard(key, {extra = '', aside = ''} = {}){
  const v = vehicle(key), owned = L.isOwned(state.doc, key);
  return `<article class="veh-card${owned ? ' owned' : ''}">
    <button class="owned-bar" data-action="own" data-key="${esc(key)}" aria-pressed="${owned}" aria-label="${owned ? 'Owned. Click to mark as not owned' : 'Not owned. Click to mark as owned'}: ${esc(v.n)}" title="${owned ? 'Owned' : 'Mark as owned'}"></button>
    <div class="veh-main"><div class="veh-name">${flag(v.c)}<strong>${esc(v.n)}</strong></div>
      <small>${v.missing ? 'Not in the current data' : `${esc(v.t || (key.startsWith('aircraft:') ? 'Aircraft' : 'Ground'))} · BR ${fmtBr(v.b)}`}${owned ? ' · <span class="owned-text">Owned</span>' : ''}</small>${extra}</div>
    ${aside}</article>`;
}

function searchResults(list){
  const query = addQuery.trim();
  if (!query) return '<p class="muted small">Type a name: <code>a7e</code>, <code>t80bvm</code>, <code>leopard</code>…</p>';
  const hits = catalogRows.map(row => [row, S.matchScore([row.n, row.k.split(':')[1]], query)]).filter(([, score]) => score >= 0)
    .sort((a, b) => b[1] - a[1] || a[0].n.localeCompare(b[0].n, undefined, {numeric:true})).slice(0, 12);
  if (!hits.length) return '<p class="muted small">No match.</p>';
  return hits.map(([row]) => {
    const inList = list.items.includes(row.k);
    return `<button class="add-hit" data-action="add" data-list="${esc(list.id)}" data-key="${esc(row.k)}" ${inList ? 'disabled' : ''}>${flag(row.c)}<span class="hit-text"><strong>${esc(row.n)}</strong><small>${esc(row.t || '')} · BR ${fmtBr(row.b)} · ${esc(row.k.split(':')[1])}</small></span><em>${inList ? '✓ In list' : '+ Add'}</em></button>`;
  }).join('');
}

function renderLists(){
  const {lists} = state.doc;
  $('listCount').textContent = lists.length;
  if (!lists.length) { $('listsBody').innerHTML = '<div class="lists-empty"><p>No lists yet.</p><p class="muted">Create one above, then add vehicles to it.</p></div>'; return; }
  $('listsBody').innerHTML = lists.map(list => { const expanded = expandedLists.has(list.id); return `<section class="list-card${expanded ? ' expanded' : ' collapsed'}" data-list-id="${esc(list.id)}">
    <header><button class="list-toggle" data-action="toggle-list" data-list="${esc(list.id)}" aria-expanded="${expanded}" aria-controls="list-content-${esc(list.id)}"><span class="list-chevron" aria-hidden="true">›</span><span>${esc(list.name)}</span> <span class="count-pill">${list.items.length}</span></button>
      <div class="list-actions"><button class="lists-btn" data-action="rename" data-list="${esc(list.id)}">Rename</button><button class="lists-btn danger" data-action="delete" data-list="${esc(list.id)}">Delete</button></div></header>
    <div class="list-content" id="list-content-${esc(list.id)}" ${expanded ? '' : 'hidden'}><div class="list-items">${list.items.length ? list.items.map(key => vehicleCard(key, {aside: `<button class="remove-item" data-action="remove" data-list="${esc(list.id)}" data-key="${esc(key)}" aria-label="Remove ${esc(nameOf(key))} from ${esc(list.name)}">✕</button>`})).join('') : '<p class="muted small">Empty. Add your first vehicle.</p>'}</div>
    ${openAdd === list.id
      ? `<div class="add-panel"><div class="add-row"><input class="add-input" data-list="${esc(list.id)}" type="search" autocomplete="off" placeholder="Search all aircraft and ground vehicles" value="${esc(addQuery)}" aria-label="Search vehicles to add to ${esc(list.name)}"><button class="lists-btn" data-action="close-add">Done</button></div><div class="add-results">${catalogRows.length ? searchResults(list) : '<p class="muted small">Loading vehicles…</p>'}</div></div>`
      : `<button class="lists-btn add-button" data-action="open-add" data-list="${esc(list.id)}">+ Add vehicle</button>`}
    </div></section>`; }).join('');
}

function renderRanking(){
  const names = new Map(state.doc.lists.map(list => [list.id, list.name]));
  const ranked = L.rankVehicles(state.doc, nameOf)
    .filter(entry => rankOwned === 'all' || (rankOwned === 'owned') === entry.owned)
    .filter(entry => rankDomain === 'all' || entry.key.startsWith(`${rankDomain}:`));
  $('rankCount').textContent = ranked.length;
  document.querySelectorAll('[data-rank-owned]').forEach(button => button.classList.toggle('active', button.dataset.rankOwned === rankOwned));
  document.querySelectorAll('[data-rank-domain]').forEach(button => button.classList.toggle('active', button.dataset.rankDomain === rankDomain));
  if (!ranked.length) { $('rankBody').innerHTML = `<div class="lists-empty"><p class="muted">${state.doc.lists.some(list => list.items.length) ? 'Nothing matches this filter.' : 'Vehicles appear here once they are in a list. The more lists a vehicle is in, the higher it ranks.'}</p></div>`; return; }
  $('rankBody').innerHTML = ranked.map((entry, index) => vehicleCard(entry.key, {
    extra: `<div class="list-chips">${entry.listIds.map(id => `<span>${esc(names.get(id))}</span>`).join('')}</div>`,
    aside: `<div class="rank-side"><span class="rank-number">#${index + 1}</span><span class="rank-count">${entry.count} ${entry.count === 1 ? 'list' : 'lists'}</span></div>`
  })).join('');
}

function renderSync(){
  const time = sync.savedAt ? new Date(sync.savedAt).toLocaleString([], {dateStyle:'medium', timeStyle:'short'}) : '';
  const text = {
    local: ['warn', 'Saved on this device only. Connect cloud sync so a cleared browser or new device cannot lose your lists.'],
    locked: ['warn', sync.message || 'Enter your passphrase to sync.'],
    pending: ['busy', 'Unsaved changes…'],
    saving: ['busy', 'Saving to cloud…'],
    saved: ['ok', `✓ Saved to cloud${time ? ` · ${time}` : ''}`],
    offline: ['bad', `⚠ Cloud save failed, kept on this device. Retrying in 30 s. ${sync.message}`],
    unconfigured: ['bad', 'Cloud sync is not set up on the server yet (see README, "Saved lists"). Your lists are kept on this device.']
  }[sync.status] || ['warn', ''];
  const needsKey = sync.status === 'local' || sync.status === 'locked';
  $('syncBar').innerHTML = `<p class="sync-status ${text[0]}">${esc(text[1])}</p>
    ${needsKey ? `<form id="connectForm" class="connect-form"><input id="passInput" type="password" autocomplete="current-password" placeholder="Lists passphrase" aria-label="Lists passphrase" required><button class="lists-btn primary" type="submit">Connect sync</button></form>` : ''}
    <div class="sync-actions">${passKey ? '<button class="lists-btn" data-action="sync-now">Sync now</button><button class="lists-btn" data-action="backups">Backups</button>' : ''}<button class="lists-btn" data-action="export">Export file</button><button class="lists-btn" data-action="import">Import file</button>${passKey ? '<button class="lists-btn" data-action="disconnect">Disconnect</button>' : ''}</div>`;
}

function render(){ renderLists(); renderRanking(); renderSync(); }

function focusAddInput(){
  const input = document.querySelector('.add-input');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

// ---------------------------------------------------------------- events
$('newListForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('newListName').value.trim();
  if (!name) return $('newListName').focus();
  const existing = L.findListByName(state.doc, name);
  if (existing) {
    expandedLists.add(existing.id);
    openAdd = null; addQuery = '';
    $('newListName').value = '';
    renderLists();
    document.querySelector(`[data-list-id="${CSS.escape(existing.id)}"]`)?.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  if (state.doc.lists.length >= L.LIMITS.lists) return alert(`You can keep up to ${L.LIMITS.lists} lists.`);
  const id = newId();
  expandedLists.add(id);
  openAdd = id; addQuery = '';
  $('newListName').value = '';
  commit(L.createList(state.doc, id, name));
  focusAddInput();
});

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action],[data-rank-owned],[data-rank-domain]');
  if (!target) return;
  if (target.dataset.rankOwned) { rankOwned = target.dataset.rankOwned; return renderRanking(); }
  if (target.dataset.rankDomain) { rankDomain = target.dataset.rankDomain; return renderRanking(); }
  const {action, list: listId, key} = target.dataset;
  const list = state.doc.lists.find(item => item.id === listId);
  if (action === 'own') return commit(L.toggleOwned(state.doc, key));
  if (action === 'toggle-list' && list) { expandedLists.has(listId) ? expandedLists.delete(listId) : expandedLists.add(listId); if (!expandedLists.has(listId) && openAdd === listId) { openAdd = null; addQuery = ''; } return renderLists(); }
  if (action === 'open-add') { expandedLists.add(listId); openAdd = listId; addQuery = ''; renderLists(); return focusAddInput(); }
  if (action === 'close-add') { openAdd = null; addQuery = ''; return renderLists(); }
  if (action === 'add') { commit(L.addItem(state.doc, listId, key)); return focusAddInput(); }
  if (action === 'remove') return commit(L.removeItem(state.doc, listId, key));
  if (action === 'rename' && list) { const name = prompt('Rename list', list.name); if (name !== null && name.trim()) { const existing = L.findListByName(state.doc, name); if (existing && existing.id !== listId) { expandedLists.add(existing.id); renderLists(); document.querySelector(`[data-list-id="${CSS.escape(existing.id)}"]`)?.scrollIntoView({behavior:'smooth', block:'center'}); return alert(`A list named "${existing.name}" already exists. That list has been opened.`); } commit(L.renameList(state.doc, listId, name)); } return; }
  if (action === 'delete' && list) { if (confirm(`Delete "${list.name}" and its ${list.items.length} vehicle(s)?`)) { expandedLists.delete(listId); if (openAdd === listId) openAdd = null; commit(L.deleteList(state.doc, listId)); } return; }
  if (action === 'sync-now') return state.dirty ? saveNow() : pull();
  if (action === 'export') return download();
  if (action === 'import') return $('importFile').click();
  if (action === 'backups') return openBackups();
  if (action === 'disconnect') { if (confirm('Stop syncing on this device? Your lists stay here and in the cloud.')) { passKey = null; storage.remove(PASS_KEY); setSync('local'); } return; }
  if (action === 'restore') {
    const result = await api('GET', {query:`?backup=${encodeURIComponent(target.dataset.date)}`});
    if (result.status !== 200) return alert(result.data.error || 'Could not load that backup.');
    $('backupDialog').close();
    return commit(unionWith(result.data.doc));
  }
});

document.addEventListener('input', event => {
  if (!event.target.classList.contains('add-input')) return;
  addQuery = event.target.value;
  const list = state.doc.lists.find(item => item.id === event.target.dataset.list);
  const results = event.target.closest('.add-panel').querySelector('.add-results');
  if (list && results) results.innerHTML = searchResults(list);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openAdd && event.target.classList.contains('add-input')) { openAdd = null; addQuery = ''; renderLists(); }
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'connectForm') return;
  event.preventDefault();
  const value = $('passInput').value.trim();
  if (value) connect(value);
});
$('importFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const doc = L.normalizeDoc(await file.text());
  if (!doc.lists.length && !doc.owned.length) return alert('That file has no lists in it.');
  commit(unionWith(doc));
});
$('closeBackups').onclick = () => $('backupDialog').close();

// Leaving the page: push unsaved edits so they are not stuck on this device.
addEventListener('pagehide', () => { if (state.dirty && passKey) saveNow({keepalive: true}); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && state.dirty && passKey) saveNow({keepalive: true}); });

function setTheme(theme){
  document.documentElement.dataset.theme = theme;
  $('themeButton').textContent = theme === 'dark' ? '☀' : '☾';
  storage.set('ordnance-theme', theme);
}
$('themeButton').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

// ------------------------------------------------------------------ boot
(async () => {
  setTheme(storage.get('ordnance-theme') || 'dark');
  render();
  pull();
  try {
    const response = await fetch('data/vehicle-index.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    catalogRows = await response.json();
    catalog = new Map(catalogRows.map(row => [row.k, row]));
  } catch (error) {
    console.error(error);
    catalogRows = [];
  }
  render();
})();
