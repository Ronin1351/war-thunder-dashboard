import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({globalThis:{}});
context.globalThis=context;
vm.runInContext(fs.readFileSync(new URL('../recommendation.js',import.meta.url),'utf8'),context);
const {baselineTotal,allocate}=context.OrdnanceRecommendations;

test('vehicle-specific and conservative baselines avoid full-rack recommendations',()=>{
  assert.equal(baselineTotal({'Vehicle ID':'us_m1a2_abrams','Full Ammo Capacity':42})?.total,19);
  assert.equal(baselineTotal({'Vehicle ID':'germ_leopard_2a4','Full Ammo Capacity':42})?.total,16);
  assert.equal(baselineTotal({'Vehicle ID':'generic_tank','Full Ammo Capacity':50,'Main Gun Caliber (mm)':120})?.total,20);
  assert.equal(baselineTotal({'Vehicle ID':'generic_derp','Full Ammo Capacity':50,'Main Gun Caliber (mm)':155})?.total,15);
});

test('allocation preserves the recommended total',()=>{
  const rows=[{'Ammunition':'AP','Share of Load':.75},{'Ammunition':'HE','Share of Load':.25}];
  const result=allocate(19,rows);
  assert.equal(result.reduce((sum,row)=>sum+row['Revised Quantity'],0),19);
  assert.deepEqual(result.map(row=>row['Revised Quantity']),[14,5]);
});

test('aircraft loadout dataset is internally consistent',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('../data/aircraft_loadouts.json',import.meta.url),'utf8'));
  assert.ok(data.aircraft.length>1500);
  assert.ok(data.loadoutDetail.length>14000);
  assert.ok(data.fireBombSearch.length>300);
  const aircraft=new Set(data.aircraft.map(row=>row['Aircraft ID']));
  assert.ok(data.loadoutDetail.every(row=>aircraft.has(row['Aircraft ID'])&&Number(row.Quantity)>0));
  assert.ok(data.fireBombSearch.every(row=>Number(row['Maximum Quantity'])>0));
});
