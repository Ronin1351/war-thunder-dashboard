// Request handling for /api/lists, with storage injected so it can be tested
// without Vercel. Files starting with "_" in /api are not deployed as endpoints.
import {createHash, timingSafeEqual} from 'node:crypto';
import '../lists-core.js';

const {normalizeDoc} = globalThis.OrdnanceLists;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const digest = value => createHash('sha256').update(String(value)).digest();
// Constant-time comparison so response timing does not leak the passphrase.
export const keyMatches = (given, expected) => Boolean(given) && Boolean(expected) && timingSafeEqual(digest(given), digest(expected));

function send(res, status, body){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req){
  if (req.body !== undefined) return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY_BYTES) throw Object.assign(new Error('too large'), {status:413}); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * store: {
 *   read(): Promise<{text, etag} | null>                  current lists file
 *   write(text, etag|null): Promise<{etag}>               throws {code:'conflict'} if etag is stale
 *   writeBackup(date, text): Promise<void>
 *   listBackups(): Promise<string[]>                      YYYY-MM-DD, newest first
 *   readBackup(date): Promise<string | null>
 * }
 */
export function createHandler({store, passphrase, now = () => new Date()}){
  return async function handler(req, res){
    if (!passphrase) return send(res, 503, {error:'Sync is not set up: LISTS_PASSPHRASE is missing on the server.'});
    if (!keyMatches(req.headers['x-lists-key'], passphrase)) return send(res, 401, {error:'Wrong passphrase.'});
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET') {
        if (url.searchParams.has('backups')) return send(res, 200, {dates: await store.listBackups()});
        const date = url.searchParams.get('backup');
        if (date !== null) {
          if (!DATE.test(date)) return send(res, 400, {error:'Bad backup date.'});
          const text = await store.readBackup(date);
          return text === null ? send(res, 404, {error:'No backup for that date.'}) : send(res, 200, {doc: normalizeDoc(text)});
        }
        const current = await store.read();
        return send(res, 200, current ? {doc: normalizeDoc(current.text), etag: current.etag} : {doc: null, etag: null});
      }
      if (req.method === 'PUT') {
        const raw = await readBody(req);
        if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return send(res, 413, {error:'Lists are too large.'});
        let body; try { body = JSON.parse(raw); } catch { return send(res, 400, {error:'Body must be JSON.'}); }
        if (!body || typeof body.doc !== 'object' || !body.doc) return send(res, 400, {error:'Missing doc.'});
        const current = await store.read();
        const etag = typeof body.etag === 'string' ? body.etag : null;
        // Client saved against an older version: hand back the latest so it can merge.
        if (current && current.etag !== etag) return send(res, 409, {doc: normalizeDoc(current.text), etag: current.etag});
        // First save of a new day keeps yesterday's final state as a dated backup.
        const today = now().toISOString().slice(0, 10);
        if (current) {
          const previousDay = String(normalizeDoc(current.text).savedAt || '').slice(0, 10);
          if (DATE.test(previousDay) && previousDay < today) await store.writeBackup(previousDay, current.text);
        }
        const doc = {...normalizeDoc(body.doc), savedAt: now().toISOString()};
        try {
          const written = await store.write(JSON.stringify(doc), current ? current.etag : null);
          return send(res, 200, {etag: written.etag, savedAt: doc.savedAt});
        } catch (error) {
          if (error.code !== 'conflict') throw error;
          const latest = await store.read();
          return send(res, 409, {doc: latest ? normalizeDoc(latest.text) : null, etag: latest ? latest.etag : null});
        }
      }
      res.setHeader('Allow', 'GET, PUT');
      return send(res, 405, {error:'Use GET or PUT.'});
    } catch (error) {
      if (error.status === 413) return send(res, 413, {error:'Lists are too large.'});
      console.error('lists api', error);
      return send(res, 502, {error:'Storage is unavailable. Your lists are still saved on this device.'});
    }
  };
}
