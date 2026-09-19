import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHandler, keyMatches} from '../api/_lists-handler.js';

const KEY = 'correct horse battery staple';
function memoryStore(){
  const files = new Map(); let version = 0; const log = [];
  return {
    files, log,
    async read(){ const file = files.get('main'); return file ? {...file} : null; },
    async write(text, etag){ const file = files.get('main'); if ((file ? file.etag : null) !== etag) throw Object.assign(new Error('conflict'), {code:'conflict'}); const next = {text, etag:`e${++version}`}; files.set('main', next); log.push('write'); return {etag: next.etag}; },
    async writeBackup(date, text){ files.set(`daily/${date}`, {text}); log.push(`backup ${date}`); },
    async listBackups(){ return [...files.keys()].filter(key => key.startsWith('daily/')).map(key => key.slice(6)).sort().reverse(); },
    async readBackup(date){ return files.get(`daily/${date}`)?.text ?? null; }
  };
}
async function call(handler, {method = 'GET', url = '/api/lists', key = KEY, body} = {}){
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  Object.assign(req, {method, url, headers: key === null ? {} : {'x-lists-key': key}});
  const res = {statusCode: 0, headers: {}, body: '', setHeader(name, value){ this.headers[name.toLowerCase()] = value; }, end(text){ this.body = text; }};
  await handler(req, res);
  return {status: res.statusCode, data: JSON.parse(res.body), headers: res.headers};
}
const doc = items => ({lists:[{id:'l1', name:'One', items}], owned:[]});

test('Refuses everything without a configured passphrase or with the wrong one',async()=>{
  const store = memoryStore();
  assert.equal((await call(createHandler({store, passphrase: undefined}))).status, 503);
  const handler = createHandler({store, passphrase: KEY});
  assert.equal((await call(handler, {key: null})).status, 401);
  assert.equal((await call(handler, {key: 'wrong'})).status, 401);
  assert.equal((await call(handler, {method: 'PUT', key: 'wrong', body: {doc: doc([]), etag: null}})).status, 401);
  assert.equal(store.log.length, 0, 'nothing written');
  assert.equal(keyMatches('', ''), false);
});

test('Save then load round-trips, validated and timestamped',async()=>{
  const store = memoryStore(), handler = createHandler({store, passphrase: KEY});
  assert.deepEqual((await call(handler)).data, {doc: null, etag: null});
  const saved = await call(handler, {method: 'PUT', body: {doc: {...doc(['ground:t_80', 'junk']), owned:['ground:t_80']}, etag: null}});
  assert.equal(saved.status, 200);
  assert.equal(saved.headers['cache-control'], 'no-store');
  const loaded = await call(handler);
  assert.deepEqual(loaded.data.doc.lists[0].items, ['ground:t_80'], 'junk key stripped by the server');
  assert.equal(loaded.data.etag, saved.data.etag);
  assert.equal(loaded.data.doc.savedAt, saved.data.savedAt);
});

test('A stale save is rejected with the latest copy so the device can merge',async()=>{
  const store = memoryStore(), handler = createHandler({store, passphrase: KEY});
  const first = await call(handler, {method: 'PUT', body: {doc: doc(['ground:a']), etag: null}});
  await call(handler, {method: 'PUT', body: {doc: doc(['ground:a', 'ground:b']), etag: first.data.etag}});
  const stale = await call(handler, {method: 'PUT', body: {doc: doc(['ground:c']), etag: first.data.etag}});
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data.doc.lists[0].items, ['ground:a', 'ground:b']);
  const fresh = await call(handler, {method: 'PUT', body: {doc: doc([]), etag: null}});
  assert.equal(fresh.status, 409, 'a device that never loaded cannot overwrite existing lists');
  assert.deepEqual((await call(handler)).data.doc.lists[0].items, ['ground:a', 'ground:b']);
});

test('First save of a new day keeps the previous day as a backup',async()=>{
  const store = memoryStore(); let now = new Date('2026-09-18T10:00:00Z');
  const handler = createHandler({store, passphrase: KEY, now: () => now});
  let result = await call(handler, {method: 'PUT', body: {doc: doc(['ground:a']), etag: null}});
  result = await call(handler, {method: 'PUT', body: {doc: doc(['ground:a', 'ground:b']), etag: result.data.etag}});
  assert.deepEqual(store.log, ['write', 'write'], 'no backup within the same day');
  now = new Date('2026-09-19T08:00:00Z');
  await call(handler, {method: 'PUT', body: {doc: doc([]), etag: result.data.etag}});
  assert.deepEqual(store.log, ['write', 'write', 'backup 2026-09-18', 'write']);
  assert.deepEqual((await call(handler, {url: '/api/lists?backups=1'})).data.dates, ['2026-09-18']);
  const backup = await call(handler, {url: '/api/lists?backup=2026-09-18'});
  assert.deepEqual(backup.data.doc.lists[0].items, ['ground:a', 'ground:b'], 'backup holds the final state of that day');
  assert.equal((await call(handler, {url: '/api/lists?backup=../../etc'})).status, 400);
  assert.equal((await call(handler, {url: '/api/lists?backup=2020-01-01'})).status, 404);
});

test('Bad input is refused without touching storage',async()=>{
  const store = memoryStore(), handler = createHandler({store, passphrase: KEY});
  assert.equal((await call(handler, {method: 'PUT', body: 'not json'})).status, 400);
  assert.equal((await call(handler, {method: 'PUT', body: {etag: null}})).status, 400);
  assert.equal((await call(handler, {method: 'PUT', body: 'x'.repeat(3 * 1024 * 1024)})).status, 413);
  assert.equal((await call(handler, {method: 'DELETE'})).status, 405);
  assert.equal(store.log.length, 0);
});

test('Storage outage returns 502, not a crash',async()=>{
  const store = {...memoryStore(), read: async () => { throw new Error('blob down'); }};
  const original = console.error; console.error = () => {};
  try { assert.equal((await call(createHandler({store, passphrase: KEY}))).status, 502); }
  finally { console.error = original; }
});
