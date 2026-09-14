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
  const ids=['searchInput','nationFilter','secondaryFilter','categoryFilter','typeFilter','modeFilter','minBr','maxBr','fieldFilter','operatorFilter','valueFilter','valueLabel','sortFilter','stats','quickFilters','activeFilters','tableHead','tableBody','armourLegend','emptyState','resultCount','pageStatus','previousPage','nextPage','pageTitle','pageSubtitle','breadcrumb','directoryTitle','filterTitle','dataNote','nationLabel','secondaryLabel','categoryLabel','typeLabel','brFilters','detailTitle','detailEyebrow','detailBody','detailDialog','sourcesBody','sourcesDialog','settingsDialog','settingsButton','sourcesButton','themeButton','mobileFilters','closeDetail','closeSources','closeSettings','cancelSettings','settingsDomain','settingsTheme','settingsMessage','settingsFieldList','fieldCount','resetDirectoryFields','saveSettings','resetButton','emptyReset','armourPlatesContent','armourPlatesLabel','errorState'];
  const elements=Object.fromEntries(ids.map(id=>[id,new MockElement(id)]));
  elements.modeFilter.value='BR Realistic';
  elements.operatorFilter.value='contains';
  elements.sortFilter.value='Weapon|asc';
  const nav=new MockElement('nav');
  const domainButtons=['air','ground','infantry'].map(name=>{const button=new MockElement(name);button.dataset.domain=name;return button;});
  const storage=new Map();
  const document={
    documentElement:{dataset:{theme:'dark'}},body:{classList:new MockClassList()},
    getElementById:id=>elements[id],
    querySelector:selector=>selector==='.domain-nav'?nav:null,
    querySelectorAll:selector=>selector==='[data-domain]'?domainButtons:[]
  };
  const context={console,document,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},Intl,Map,Set,JSON,Math,Number,String,Object,Array,RegExp,Error,encodeURIComponent,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>[]})};
  context.globalThis=context;
  context.__ORDNANCE_DATA__={air:loadJson('weapons.json'),ground:loadJson('ground.json'),groundRoles:loadJson('ground_roles.json'),infantry:loadJson('infantry.json'),armour:loadJson('armour.json'),sensors:loadJson('sensors.json')};
  return{context:vm.createContext(context),elements,nav,domainButtons};
}

test('Built UI initializes, switches to ground, and exposes settings and armor data',async()=>{
  const {context,elements,nav,domainButtons}=createContext();
  vm.runInContext(fs.readFileSync(new URL('../search.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),context);
  assert.match(elements.tableHead.innerHTML,/Sensor-equipped carriers/);
  assert.match(elements.tableHead.innerHTML,/Best radar reach/);
  const groundButton=domainButtons.find(button=>button.dataset.domain==='ground');
  nav.onclick({target:{closest:()=>groundButton}});
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
  const firstId=context.__ORDNANCE_DATA__.ground.vehicles[0]['Vehicle ID'];
  elements.tableBody.onclick({target:{closest:()=>({dataset:{id:firstId}})}});
  assert.equal(elements.detailDialog.open,true);
  assert.match(elements.detailBody.innerHTML,/Armor overview/);
  assert.match(elements.detailBody.innerHTML,/Armor faces and weak spots/);
  assert.match(elements.detailBody.innerHTML,/Sensors/);
});
