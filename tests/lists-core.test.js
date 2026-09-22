import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildVehicleIndex} from '../vehicle-index.js';
await import('../lists-core.js');
const L = globalThis.OrdnanceLists;
const A = 'aircraft:a_7e', B = 'ground:ussr_t_80bvm', C = 'ground:us_m1a2_abrams', D = 'aircraft:f_16a';

const build = (...lists) => lists.reduce((doc, [id, name, items]) => items.reduce((d, key) => L.addItem(d, id, key), L.createList(doc, id, name)), L.emptyDoc());

test('normalizeDoc never throws and drops junk',()=>{
  for (const raw of [null, undefined, '', 'nope', 42, '[]', {lists:'x'}]) assert.deepEqual(L.normalizeDoc(raw), L.emptyDoc());
  const doc = L.normalizeDoc({lists:[{id:'a',name:'  Top   tier ',items:[A,A,'bad key','weapons:x',7]},{id:'a',name:'dup id'},{name:'no id'}],owned:[A,'junk',A]});
  assert.deepEqual(doc.lists, [{id:'a',name:'Top tier',items:[A]}]);
  assert.deepEqual(doc.owned, [A]);
  assert.equal(L.normalizeDoc({lists:[{id:'x',name:''}]}).lists[0].name, 'Untitled list');
});

test('Edits are immutable and idempotent',()=>{
  const empty = L.emptyDoc();
  const one = L.createList(empty, 'l1', 'CAS');
  assert.equal(empty.lists.length, 0, 'input not mutated');
  const two = L.addItem(L.addItem(one, 'l1', A), 'l1', A);
  assert.deepEqual(two.lists[0].items, [A], 'no duplicates inside one list');
  assert.equal(L.addItem(two, 'l1', 'not a key'), two);
  assert.deepEqual(L.removeItem(two, 'l1', A).lists[0].items, []);
  assert.equal(L.renameList(two, 'l1', 'Air').lists[0].name, 'Air');
  assert.equal(L.deleteList(two, 'l1').lists.length, 0);
  assert.ok(L.isOwned(L.toggleOwned(two, A), A));
  assert.ok(!L.isOwned(L.toggleOwned(L.toggleOwned(two, A), A), A));
  assert.equal(L.createList(two, 'l1', 'dup'), two, 'duplicate list id refused');
});

test('List names are unique regardless of case or repeated spaces',()=>{
  let doc = L.createList(L.emptyDoc(), 'l1', '  ABC  ');
  assert.equal(L.findListByName(doc, 'abc').id, 'l1');
  assert.equal(L.findListByName(doc, ' A B C '), undefined);
  assert.equal(L.createList(doc, 'l2', 'abc'), doc, 'duplicate name opens the existing list in the UI instead of creating one');
  doc = L.createList(doc, 'l2', 'Second list');
  assert.equal(L.renameList(doc, 'l2', 'AbC'), doc, 'rename cannot create a duplicate name');
});

test('Import merges legacy duplicate names without losing vehicles',()=>{
  const doc = L.normalizeDoc({lists:[
    {id:'one', name:'CAS', items:[A,B]},
    {id:'two', name:'  cas ', items:[B,C]}
  ]});
  assert.equal(doc.lists.length, 1);
  assert.deepEqual(doc.lists[0], {id:'one', name:'CAS', items:[A,B,C]});
});

test('Ranking: most lists first, then not-owned, then name',()=>{
  let doc = build(['l1','One',[A,B,C]], ['l2','Two',[B,C]], ['l3','Three',[B,D]]);
  doc = L.toggleOwned(doc, C);
  const names = {[A]:'A-7E',[B]:'T-80BVM',[C]:'M1A2 Abrams',[D]:'F-16A'};
  const ranked = L.rankVehicles(doc, key => names[key]);
  assert.deepEqual(ranked.map(entry => [entry.key, entry.count]), [[B,3],[C,2],[A,1],[D,1]]);
  assert.deepEqual(ranked[0].listIds, ['l1','l2','l3']);
  assert.equal(ranked[1].owned, true);
  doc = L.addItem(doc, 'l3', A);
  assert.deepEqual(L.rankVehicles(doc, key => names[key]).slice(1,3).map(entry => entry.key), [A, C], 'tie at 2: not-owned A-7E before owned Abrams');
});

test('Merge keeps edits from both devices',()=>{
  const base = build(['l1','One',[A]]);
  const phone = L.addItem(base, 'l1', B);
  const pc = L.toggleOwned(L.createList(L.addItem(base, 'l1', C), 'l2', 'PC list'), A);
  const merged = L.mergeDocs(base, phone, pc);
  assert.deepEqual(merged.lists.find(list => list.id === 'l1').items.sort(), [A, B, C].sort());
  assert.ok(merged.lists.some(list => list.id === 'l2'));
  assert.deepEqual(merged.owned, [A]);
});

test('Merge honours removals, and never drops an edited list',()=>{
  const base = build(['l1','One',[A,B]], ['l2','Two',[C]]);
  const local = L.removeItem(base, 'l1', A);                 // removed on this device
  const remote = L.renameList(base, 'l1', 'Renamed');        // renamed on the other
  let merged = L.mergeDocs(base, local, remote);
  assert.deepEqual(merged.lists.find(list => list.id === 'l1'), {id:'l1', name:'Renamed', items:[B]});
  merged = L.mergeDocs(base, L.deleteList(base, 'l2'), base);
  assert.ok(!merged.lists.some(list => list.id === 'l2'), 'deleted and untouched elsewhere: stays deleted');
  merged = L.mergeDocs(base, L.deleteList(base, 'l2'), L.addItem(base, 'l2', D));
  assert.deepEqual(merged.lists.find(list => list.id === 'l2').items, [C, D], 'deleted here but edited there: kept');
  merged = L.mergeDocs(base, L.renameList(base, 'l1', 'Mine'), L.renameList(base, 'l1', 'Theirs'));
  assert.equal(merged.lists.find(list => list.id === 'l1').name, 'Mine', 'both renamed: this device wins');
});

test('Import / restore is a union: nothing current is removed',()=>{
  const current = build(['l1','One',[A]]);
  const backup = build(['l1','One',[A,B]], ['old','Deleted list',[C]]);
  const merged = L.mergeDocs(L.emptyDoc(), current, backup);
  assert.deepEqual(merged.lists.find(list => list.id === 'l1').items.sort(), [A, B].sort());
  assert.ok(merged.lists.some(list => list.id === 'old'));
});

test('Vehicle index covers every named aircraft and ground vehicle with valid keys',()=>{
  const read = name => JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
  const aircraft = read('aircraft.json'), ground = read('ground.json'), roles = read('ground_roles.json').roles;
  const index = buildVehicleIndex(aircraft, ground, roles);
  const named = rows => rows.filter(row => typeof row === 'object').length;
  assert.ok(index.length > 2000 && index.length <= named(aircraft.aircraft) + named(ground.vehicles));
  assert.ok(index.every(row => L.isKey(row.k) && row.n.trim()));
  assert.equal(new Set(index.map(row => row.k)).size, index.length);
  assert.ok(JSON.stringify(index).length < 600_000, 'index stays small');
  assert.ok(index.some(row => row.n === 'A-7E'));
});
