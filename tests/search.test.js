import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
await import('../search.js');
const {searchScore,matchScore,normalize} = globalThis.OrdnanceSearch;
const aircraft = JSON.parse(fs.readFileSync(new URL('../data/aircraft.json',import.meta.url))).aircraft;
const ground = JSON.parse(fs.readFileSync(new URL('../data/ground.json',import.meta.url))).vehicles;
const find = (rows,domain,q) => rows.filter(r=>searchScore(domain,r,q)>=0);
const rank = (rows,domain,q) => rows.map(r=>[r,searchScore(domain,r,q)]).filter(([,s])=>s>=0).sort((a,b)=>b[1]-a[1]).map(([r])=>r);

test('Separators and case are ignored: a7e, A7E, a-7e, A 7E, a.7.e all find A-7E',()=>{
  const row = {Aircraft:'A-7E','Aircraft ID':'a_7e'};
  for (const q of ['a7e','A7E','a-7e','A 7E','a.7.e','A/7E']) assert.ok(searchScore('aircraft',row,q)>=0, q);
});

test('Real data: separator-free queries find the dashed names',()=>{
  const names = rows => rows.map(r=>r.Aircraft||r.Vehicle);
  const a7 = aircraft.filter(r=>/^A-7E/i.test(r.Aircraft));
  if (a7.length) assert.ok(names(find(aircraft,'aircraft','a7e')).includes(a7[0].Aircraft));
  const t80 = ground.filter(r=>/^T-80/.test(r.Vehicle||''));
  assert.ok(t80.length>0);
  const hits = names(find(ground,'ground','t80'));
  for (const r of t80) assert.ok(hits.includes(r.Vehicle), `t80 must find ${r.Vehicle}`);
});

test('Exact dashed name still ranks above looser matches',()=>{
  const exact = {Vehicle:'T-80B','Vehicle ID':'ussr_t_80b'}, longer = {Vehicle:'T-80BVM','Vehicle ID':'ussr_t_80bvm'};
  assert.ok(searchScore('ground',exact,'t80b') > searchScore('ground',longer,'t80b'));
});

test('Separator-blind matching does not glue across the middle of words',()=>{
  assert.equal(searchScore('ground',{Vehicle:'Type 1 Ho-Ni','Vehicle ID':'x'},'e1'),-1);
  assert.equal(searchScore('ground',{Vehicle:'Abrams','Vehicle ID':'us_m1a1'},'m24'),-1);
});

test('Accents and symbols never block a match',()=>{
  assert.equal(normalize('Sturmmörser'),'sturmmorser');
  assert.ok(searchScore('ground',{Vehicle:'38 cm Sturmmörser','Vehicle ID':'x'},'sturmmorser')>=0);
  assert.ok(searchScore('ground',{Vehicle:'Pz.Kpfw. IV Ausf. H','Vehicle ID':'x'},'pzkpfw iv')>=0);
  assert.equal(searchScore('ground',{Vehicle:'X','Vehicle ID':'y'},'-.-'),0,'symbols-only query means no search');
});

test('Brief picker scorer is separator-blind too',()=>{
  assert.ok(matchScore(['A-7E','a_7e'],'a7e')>=0);
  assert.equal(matchScore(['Abrams','us_m1a1'],'m24'),-1);
});
