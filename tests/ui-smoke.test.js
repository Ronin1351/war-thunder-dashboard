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
  constructor(id){this.id=id;this.value='';this.innerHTML='';this.textContent='';this.hidden=false;this.disabled=false;this.dataset={};this.attributes={};this.childNodes=[{textContent:''}];this.selectedOptions=[{text:''}];this.classList=new MockClassList();this.listeners={};this.open=false;}
  addEventListener(type,handler){this.listeners[type]=handler;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  showModal(){this.open=true;}
  close(){this.open=false;}
  getBoundingClientRect(){return{left:0,right:1000,top:0,bottom:1000};}
}

function loadJson(name){return JSON.parse(fs.readFileSync(new URL(`../data/${name}`,import.meta.url),'utf8'));}

function createContext(){
  const ids=['markFilter','detailMarks','searchInput','nationFilter','secondaryFilter','categoryFilter','typeFilter','modeFilter','minBr','maxBr','fieldFilter','operatorFilter','valueFilter','valueLabel','sortFilter','stats','quickFilters','activeFilters','tableHead','tableBody','armourLegend','emptyState','resultCount','pageStatus','previousPage','nextPage','pageTitle','pageSubtitle','breadcrumb','directoryTitle','filterTitle','dataNote','nationLabel','secondaryLabel','categoryLabel','typeLabel','brFilters','detailTitle','detailEyebrow','detailBody','detailDialog','sourcesBody','sourcesDialog','settingsDialog','settingsButton','sourcesButton','themeButton','mobileFilters','closeDetail','closeSources','closeSettings','cancelSettings','settingsDomain','settingsTheme','settingsMessage','settingsFieldList','fieldCount','resetDirectoryFields','saveSettings','resetButton','emptyReset','armourPlatesContent','armourPlatesLabel','errorState'];
  const elements=Object.fromEntries(ids.map(id=>[id,new MockElement(id)]));
  elements.modeFilter.value='BR Realistic';
  elements.operatorFilter.value='contains';
  elements.sortFilter.value='Weapon|asc';
  const nav=new MockElement('nav');
  const domainButtons=['air','aircraft','ground','infantry'].map(name=>{const button=new MockElement(name);button.dataset.domain=name;return button;});
  const storage=new Map();
  const document={
    documentElement:{dataset:{theme:'dark'}},body:{classList:new MockClassList()},
    getElementById:id=>elements[id],
    querySelector:selector=>selector==='.domain-nav'?nav:null,
    querySelectorAll:selector=>selector==='[data-domain]'?domainButtons:[]
  };
  const files={'data/weapons.json':'weapons.json','data/aircraft.json':'aircraft.json','data/ground.json':'ground.json','data/ground_roles.json':'ground_roles.json','data/infantry.json':'infantry.json','data/armour.json':'armour.json','data/sensors.json':'sensors.json'};
  const fetched=[];
  const fetchMock=async url=>{fetched.push(url);const name=files[url];return{ok:true,json:async()=>name?loadJson(name):[]};};
  const context={console,document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Intl,Map,Set,Promise,JSON,Math,Number,String,Object,Array,RegExp,Error,encodeURIComponent,setTimeout,clearTimeout,fetch:fetchMock};
  context.globalThis=context;
  return{context:vm.createContext(context),elements,nav,domainButtons,fetched,loadJson};
}

const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('Only the datasets a directory needs are fetched',async()=>{
  const {context,elements,nav,domainButtons,fetched}=createContext();
  vm.runInContext(fs.readFileSync(new URL('../search.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../marks.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);
  await settle();await settle();
  assert.deepEqual(fetched.sort(),['data/sensors.json','data/weapons.json']);
  assert.ok(!fetched.includes('data/ground.json'),'ground data must not load for the air directory');
  const aircraftButton=domainButtons.find(button=>button.dataset.domain==='aircraft');
  nav.onclick({target:{closest:()=>aircraftButton}});
  await settle();await settle();
  assert.ok(fetched.includes('data/aircraft.json'));
  assert.ok(!fetched.includes('data/armour.json'),'armour data must not load for the aircraft directory');
});

test('Aircraft directory lists the full roster including gun-only aircraft',async()=>{
  const {context,elements,nav,domainButtons,loadJson}=createContext();
  vm.runInContext(fs.readFileSync(new URL('../search.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../marks.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);
  await settle();await settle();
  const aircraftButton=domainButtons.find(button=>button.dataset.domain==='aircraft');
  nav.onclick({target:{closest:()=>aircraftButton}});
  await settle();await settle();
  const roster=loadJson('aircraft.json').aircraft;
  assert.equal(elements.resultCount.textContent,roster.length);
  assert.match(elements.tableHead.innerHTML,/Gun barrels/);
  assert.match(elements.tableHead.innerHTML,/Top speed/);
  assert.match(elements.stats.innerHTML,/Gun-only aircraft/);
  const gunOnly=roster.find(row=>row['Gun Only']==='Yes'&&row['Gun Barrels']);
  assert.ok(gunOnly,'the roster must contain aircraft that carry no ordnance');
  elements.tableBody.onclick({target:{closest:()=>({dataset:{id:gunOnly['Aircraft ID']}})}});
  assert.equal(elements.detailDialog.open,true);
  assert.match(elements.detailBody.innerHTML,/Guns \u00b7/);
  assert.match(elements.detailBody.innerHTML,/Ammunition belts/);
  const missing=roster.find(row=>row['Performance Data']==='NOT IN THE FILES');
  elements.tableBody.onclick({target:{closest:()=>({dataset:{id:missing['Aircraft ID']}})}});
  assert.match(elements.detailBody.innerHTML,/not present in the game files/);
});

test('Built UI initializes, switches to ground, and exposes settings and armor data',async()=>{
  const {context,elements,nav,domainButtons,loadJson}=createContext();
  vm.runInContext(fs.readFileSync(new URL('../search.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../marks.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);
  await settle();await settle();
  assert.match(elements.tableHead.innerHTML,/Sensor-equipped carriers/);
  assert.match(elements.tableHead.innerHTML,/Best radar reach/);
  const groundButton=domainButtons.find(button=>button.dataset.domain==='ground');
  nav.onclick({target:{closest:()=>groundButton}});
  await settle();await settle();
  assert.match(elements.tableHead.innerHTML,/Front armor/);
  assert.match(elements.tableHead.innerHTML,/Side armor/);
  assert.match(elements.armourLegend.innerHTML,/rating-paper/);
  assert.equal(elements.resultCount.textContent,1237);
  elements.settingsButton.onclick();
  assert.equal(elements.settingsDialog.open,true);
  assert.equal(elements.settingsDomain.value,'ground');
  assert.equal(elements.fieldCount.textContent,'8 / 10');
  assert.match(elements.settingsFieldList.innerHTML,/Best radar reach/);
  const addField=id=>{const checkbox={checked:true,dataset:{settingField:id}};checkbox.closest=()=>checkbox;elements.settingsFieldList.listeners.change({target:checkbox});return checkbox;};
  addField('rearRating');
  addField('roofRating');
  assert.equal(elements.fieldCount.textContent,'10 / 10');
  const rejected=addField('floorRating');
  assert.equal(rejected.checked,false);
  assert.equal(elements.settingsMessage.textContent,'You can select up to 10 fields.');
  elements.saveSettings.onclick();
  assert.match(elements.tableHead.innerHTML,/Rear armor/);
  assert.match(elements.tableHead.innerHTML,/Roof armor/);
  const firstId=loadJson('ground.json').vehicles[0]['Vehicle ID'];
  elements.tableBody.onclick({target:{closest:()=>({dataset:{id:firstId}})}});
  assert.equal(elements.detailDialog.open,true);
  assert.match(elements.detailBody.innerHTML,/Armor overview/);
  assert.match(elements.detailBody.innerHTML,/Armor faces and weak spots/);
  assert.match(elements.detailBody.innerHTML,/Sensors/);
});

test('Heart and star marks toggle, persist, and filter the directory',async()=>{
  const {context,elements,nav,domainButtons,loadJson}=createContext();
  vm.runInContext(fs.readFileSync(new URL('../search.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../marks.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);
  await settle();await settle();
  const groundButton=domainButtons.find(button=>button.dataset.domain==='ground');
  nav.onclick({target:{closest:()=>groundButton}});
  await settle();await settle();
  const vehicles=loadJson('ground.json').vehicles,[a,b]=vehicles.map(row=>row['Vehicle ID']);
  assert.match(elements.tableBody.innerHTML,/data-mark="favorite"/,'every row must expose a heart toggle');
  assert.match(elements.tableBody.innerHTML,/data-mark="special"/,'every row must expose a star toggle');
  const click=(kind,id)=>{const target={dataset:{mark:kind,markId:id}};elements.tableBody.onclick({target:{closest:sel=>sel==='[data-mark]'?target:null}});};
  click('favorite',a);click('special',a);click('special',b);
  const stored=JSON.parse(context.localStorage.getItem('ordnance-marks-v1'));
  assert.deepEqual(stored.favorite,[`ground:${a}`]);
  assert.deepEqual(stored.special,[`ground:${a}`,`ground:${b}`].sort());
  // Toggling a row must not open the detail dialog.
  assert.equal(elements.detailDialog.open,false);
  const filterBy=value=>{elements.markFilter.value=value;elements.markFilter.listeners.change();return Number(elements.resultCount.textContent);};
  assert.equal(filterBy('favorite'),1);
  assert.equal(filterBy('special'),2);
  assert.equal(filterBy('either'),2);
  assert.equal(filterBy('both'),1);
  assert.equal(filterBy('none'),vehicles.length-2);
  filterBy('favorite');
  assert.match(elements.activeFilters.innerHTML,/data-clear="marked"/);
  assert.match(elements.markFilter.innerHTML,/Favorites \(1\)/);
  // Marks combine with text search.
  elements.searchInput.value='zzzz-no-match';elements.searchInput.listeners.input();
  assert.equal(Number(elements.resultCount.textContent),0);
  elements.resetButton.onclick();
  assert.equal(elements.markFilter.value,'');
  assert.equal(Number(elements.resultCount.textContent),vehicles.length);
  // Unmark removes it again.
  click('favorite',a);
  assert.equal(filterBy('favorite'),0);
});

test('Marks are scoped per directory and survive a reload',async()=>{
  const first=createContext();
  vm.runInContext(fs.readFileSync(new URL('../search.js',import.meta.url),'utf8'),first.context);
  vm.runInContext(fs.readFileSync(new URL('../marks.js',import.meta.url),'utf8'),first.context);
  first.context.localStorage.setItem('ordnance-marks-v1',JSON.stringify({v:1,favorite:['aircraft:'+first.loadJson('aircraft.json').aircraft[0]['Aircraft ID']],special:[]}));
  vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),first.context);
  await settle();await settle();
  const {elements,nav,domainButtons}=first;
  elements.markFilter.value='favorite';elements.markFilter.listeners.change();
  assert.equal(Number(elements.resultCount.textContent),0,'an aircraft mark must not match guided weapons');
  const aircraftButton=domainButtons.find(button=>button.dataset.domain==='aircraft');
  nav.onclick({target:{closest:()=>aircraftButton}});
  await settle();await settle();
  assert.equal(Number(elements.resultCount.textContent),1,'mark filter persists across directories and finds the saved aircraft');
});
