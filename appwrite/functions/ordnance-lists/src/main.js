import {Client, TablesDB} from 'node-appwrite';
import {createHash, timingSafeEqual} from 'node:crypto';

const DATABASE_ID = 'map_guide';
const TABLE_ID = '6ab271e400262b493b76';
const MAIN_ID = 'lists_main';
const CHUNK_SIZE = 14000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_PATTERN = /^(aircraft|ground):[^\s:]{1,120}$/;

const digest = value => createHash('sha256').update(String(value)).digest();
const keyMatches = (given, expected) => Boolean(given) && Boolean(expected) && timingSafeEqual(digest(given), digest(expected));
const cleanName = name => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Untitled list';
const unique = values => [...new Set(values)];
function normalizeDoc(raw){
  let data = raw;
  if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { data = null; } }
  if (!data || typeof data !== 'object') return {v:1, lists:[], owned:[], savedAt:null};
  const seen = new Set(), names = new Map(), lists = [];
  for (const list of Array.isArray(data.lists) ? data.lists : []) {
    if (!list || typeof list.id !== 'string' || !list.id || list.id.length > 64 || seen.has(list.id)) continue;
    seen.add(list.id);
    const item = {id:list.id, name:cleanName(list.name), items:unique((Array.isArray(list.items) ? list.items : []).filter(key => typeof key === 'string' && KEY_PATTERN.test(key))).slice(0, 300)};
    const nameKey = item.name.toLocaleLowerCase();
    const prior = names.get(nameKey);
    if (prior) prior.items = unique([...prior.items, ...item.items]).slice(0, 300);
    else { names.set(nameKey, item); lists.push(item); }
    if (lists.length === 100) break;
  }
  return {v:1, lists, owned:unique((Array.isArray(data.owned) ? data.owned : []).filter(key => typeof key === 'string' && KEY_PATTERN.test(key))), savedAt:typeof data.savedAt === 'string' ? data.savedAt : null};
}

const json = (res, body, status = 200) => res.json(body, status, {'Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, X-Lists-Key','Access-Control-Allow-Methods':'GET, PUT, OPTIONS'});
const isMissing = error => error?.code === 404 || error?.type === 'row_not_found';
const chunk = text => Array.from({length:Math.ceil(text.length / CHUNK_SIZE)}, (_, i) => text.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
const safeId = value => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 36);

function makeStore(tables){
  const get = async id => { try { return await tables.getRow({databaseId:DATABASE_ID, tableId:TABLE_ID, rowId:id}); } catch (error) { if (isMissing(error)) return null; throw error; } };
  const put = (id, payload, revision) => tables.upsertRow({databaseId:DATABASE_ID, tableId:TABLE_ID, rowId:id, data:{payload, revision}});
  async function readManifest(id){
    const row = await get(id);
    if (!row) return null;
    let manifest; try { manifest = JSON.parse(row.payload); } catch { return null; }
    if (manifest.format !== 'chunked-v1' || !Array.isArray(manifest.chunks)) return null;
    const rows = await Promise.all(manifest.chunks.map(get));
    if (rows.some(value => !value)) throw new Error('A stored list chunk is missing.');
    return {text:rows.map(value => value.payload).join(''), revision:Number(row.revision) || 0, manifest};
  }
  async function writeManifest(id, text, revision, backups = []){
    const pieces = chunk(text), token = `${id}_r${revision}`;
    const ids = pieces.map((_, index) => safeId(`${token}_c${index}`));
    await Promise.all(pieces.map((value, index) => put(ids[index], value, revision)));
    await put(id, JSON.stringify({format:'chunked-v1', chunks:ids, backups}), revision);
  }
  return {
    read: () => readManifest(MAIN_ID),
    async write(text, expected){
      const current = await readManifest(MAIN_ID);
      if ((current ? current.revision : null) !== expected) throw Object.assign(new Error('conflict'), {code:'conflict'});
      const revision = (current?.revision || 0) + 1;
      await writeManifest(MAIN_ID, text, revision, current?.manifest.backups || []);
      return {revision};
    },
    async writeBackup(date, text){
      const main = await readManifest(MAIN_ID);
      const id = safeId(`lists_daily_${date}`);
      await writeManifest(id, text, main?.revision || 1, []);
      const backups = unique([date, ...(main?.manifest.backups || [])]).sort().reverse().slice(0, 90);
      if (main) await put(MAIN_ID, JSON.stringify({...main.manifest, backups}), main.revision);
    },
    async listBackups(){ return (await readManifest(MAIN_ID))?.manifest.backups || []; },
    async readBackup(date){ return (await readManifest(safeId(`lists_daily_${date}`)))?.text ?? null; }
  };
}

export default async ({req, res, error}) => {
  if (req.method === 'OPTIONS') return json(res, {}, 204);
  const passphrase = process.env.LISTS_PASSPHRASE;
  if (!passphrase) return json(res, {error:'Sync is not set up: LISTS_PASSPHRASE is missing on the server.'}, 503);
  if (!keyMatches(req.headers['x-lists-key'], passphrase)) return json(res, {error:'Wrong passphrase.'}, 401);
  const client = new Client().setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT).setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID).setKey(req.headers['x-appwrite-key']);
  const store = makeStore(new TablesDB(client));
  const query = req.query || {};
  try {
    if (req.method === 'GET') {
      if (Object.prototype.hasOwnProperty.call(query, 'backups')) return json(res, {dates:await store.listBackups()});
      if (Object.prototype.hasOwnProperty.call(query, 'backup')) {
        const date = String(query.backup || '');
        if (!DATE.test(date)) return json(res, {error:'Bad backup date.'}, 400);
        const text = await store.readBackup(date);
        return text === null ? json(res, {error:'No backup for that date.'}, 404) : json(res, {doc:normalizeDoc(text)});
      }
      const current = await store.read();
      return json(res, current ? {doc:normalizeDoc(current.text), etag:String(current.revision)} : {doc:null, etag:null});
    }
    if (req.method !== 'PUT') return json(res, {error:'Use GET or PUT.'}, 405);
    const raw = req.bodyText || '';
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json(res, {error:'Lists are too large.'}, 413);
    let body; try { body = req.bodyJson; } catch { return json(res, {error:'Body must be JSON.'}, 400); }
    if (!body || typeof body.doc !== 'object' || !body.doc) return json(res, {error:'Missing doc.'}, 400);
    const current = await store.read();
    const expected = typeof body.etag === 'string' && /^\d+$/.test(body.etag) ? Number(body.etag) : null;
    if (current && current.revision !== expected) return json(res, {doc:normalizeDoc(current.text), etag:String(current.revision)}, 409);
    const now = new Date(), today = now.toISOString().slice(0, 10);
    if (current) {
      const previousDay = String(normalizeDoc(current.text).savedAt || '').slice(0, 10);
      if (DATE.test(previousDay) && previousDay < today) await store.writeBackup(previousDay, current.text);
    }
    const doc = {...normalizeDoc(body.doc), savedAt:now.toISOString()};
    try {
      const written = await store.write(JSON.stringify(doc), current ? current.revision : null);
      return json(res, {etag:String(written.revision), savedAt:doc.savedAt});
    } catch (cause) {
      if (cause.code !== 'conflict') throw cause;
      const latest = await store.read();
      return json(res, {doc:latest ? normalizeDoc(latest.text) : null, etag:latest ? String(latest.revision) : null}, 409);
    }
  } catch (cause) {
    error(cause.message || String(cause));
    return json(res, {error:'Storage is unavailable. Your lists are still saved on this device.'}, 502);
  }
};
