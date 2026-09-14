import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class MockClassList {
  constructor(){this.values=new Set();}
  add(value){this.values.add(value);}
  remove(value){this.values.delete(value);}
  toggle(value,force){if(force===true){this.values.add(value);return true;}if(force===false){this.values.delete(value);return false;}if(this.values.has(value)){this.values.delete(value);return false;}this.values.add(value);return true;}
}

class MockElement {
  constructor(id){this.id=id;this.value='';this.innerHTML='';this.textContent='';this.hidden=false;this.dataset={};this.classList=new MockClassList();this.listeners={};this.open=false;}
  addEventListener(type,handler){this.listeners[type]=handler;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}

function loadJson(name){return JSON.parse(fs.readFileSync(new URL(`../data/${name}`,import.meta.url),'utf8'));}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function createContext(){
  const ids=['pickerInput','pickerList','pickerSuggestions','briefBody','briefHeadline','themeButton','noteDialog','noteTitle','noteBody','closeNote'];
  const elements=Object.fromEntries(ids.map(id=>[id,new MockElement(id)]));
  const files={'data/ground.json':'ground.json','data/armour.json':'armour.json','data/aircraft.json':'aircraft.json','data/sensors.json':'sensors.json'};
  const fetched=[];
  const storage=new Map();
  const document={documentElement:{dataset:{theme:'dark'}},getElementById:id=>elements[id],title:''};
  const context={
    console,document,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    location:{search:''},history:{replaceState(){}},
    window:{scrollTo(){}},
    URLSearchParams,encodeURIComponent,Promise,Map,Set,JSON,Math,Number,String,Object,Array,RegExp,Error,Intl,setTimeout,
    fetch:async url=>{fetched.push(url);const name=files[url];return{ok:true,json:async()=>name?loadJson(name):[]};}
  };
  context.globalThis=context;
  context.window.scrollTo=()=>{};
  return {context:vm.createContext(context),elements,fetched};
}

async function boot(){
  const created=createContext();
  vm.runInContext(fs.readFileSync(new URL('../brief.js',import.meta.url),'utf8'),created.context);
  for(let i=0;i<6;i++)await settle();
  return created;
}

test('Brief loads only the datasets it needs and opens on a real vehicle',async()=>{
  const {elements,fetched}=await boot();
  assert.deepEqual(fetched.sort(),['data/aircraft.json','data/armour.json','data/ground.json','data/sensors.json']);
  assert.ok(!fetched.includes('data/infantry.json'));
  assert.match(elements.briefBody.innerHTML,/Load this/);
  assert.match(elements.briefBody.innerHTML,/They shoot here/);
  assert.match(elements.briefBody.innerHTML,/Know this/);
});

test('A ground brief answers the loadout question with counts',async()=>{
  const {elements}=await boot();
  const guide=loadJson('ground.json').loadoutGuide.find(row=>row['Vehicle ID']==='ussr_t_80bvm');
  assert.ok(guide,'T-80BVM must have a loadout recommendation');
  assert.match(elements.briefBody.innerHTML,new RegExp(`Take <strong>${guide['Recommended Total']}</strong>`));
  const detail=loadJson('ground.json').loadoutDetail.filter(row=>row['Vehicle ID']==='ussr_t_80bvm');
  for(const row of detail)assert.ok(elements.briefBody.innerHTML.includes(row.Ammunition),`${row.Ammunition} must appear in the brief`);
});

test('Layered armour is refused on the brief, not faked',async()=>{
  const {elements}=await boot();
  assert.match(elements.briefBody.innerHTML,/layered armour|Composite, spaced or ERA/i);
  assert.match(elements.briefBody.innerHTML,/Impact angle is not in the game files/);
  assert.match(elements.briefBody.innerHTML,/gap-chip/);
});

test('Tapping a gap chip explains the gap instead of hiding it',async()=>{
  const {context,elements}=await boot();
  const match=elements.briefBody.innerHTML.match(/data-note="([^"]+)"/);
  assert.ok(match,'the brief must expose at least one explainable gap');
  const chip={dataset:{note:match[1]}};
  elements.briefBody.listeners.click({target:{closest:()=>chip}});
  assert.equal(elements.noteDialog.open,true);
  assert.ok(elements.noteBody.innerHTML.length>40,'the explanation must be a real sentence');
});

test('An aircraft with no performance data says so in words',async()=>{
  const {context,elements}=await boot();
  const missing=loadJson('aircraft.json').aircraft.find(row=>row['Performance Data']==='NOT IN THE FILES');
  elements.pickerInput.value=missing.Aircraft;
  elements.pickerInput.listeners.input({target:{value:missing.Aircraft}});
  assert.match(elements.briefBody.innerHTML,/Not in the files/);
  assert.match(elements.briefBody.innerHTML,/Bring this/);
});

test('A gun-only aircraft still produces a full brief',async()=>{
  const {elements}=await boot();
  const gunOnly=loadJson('aircraft.json').aircraft.find(row=>row['Gun Only']==='Yes'&&row['Gun Barrels']>0&&row['Performance Data']!=='NOT IN THE FILES');
  elements.pickerInput.listeners.input({target:{value:gunOnly.Aircraft}});
  assert.match(elements.briefBody.innerHTML,/Bring this/);
  assert.match(elements.briefBody.innerHTML,/How it flies/);
  assert.match(elements.briefBody.innerHTML,/Burst mass/);
});
