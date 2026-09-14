const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const countryName = value => value === 'Usa' ? 'USA' : value === 'Ussr' ? 'USSR' : value;
const fmt = value => value == null || value === '' ? '—' : typeof value === 'number' ? value.toLocaleString('en-US',{maximumFractionDigits:3}) : String(countryName(value));
const pretty = value => String(countryName(value) ?? '').replace(/^exp_/,'').replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase()).replace('Spaa','SPAA');

const sources = {ground:'data/ground.json',armour:'data/armour.json',aircraft:'data/aircraft.json',sensors:'data/sensors.json'};
const data = {};
const index = new Map();          // lower-cased label -> entry
const entries = [];               // {kind,id,label,br,nation,klass}
const notes = new Map();          // note id -> [title, body]
let current = null;

const FACES = ['Front','Side','Rear','Roof','Floor'];

// ---------------------------------------------------------------- loading
async function load(name){
  if(data[name])return data[name];
  const response = await fetch(sources[name]);
  if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  data[name] = await response.json();
  return data[name];
}

function buildIndex(){
  // A handful of source rows carry no display name. They are unusable as brief
  // subjects, so they are dropped here rather than crashing the index.
  const add = entry => { if(typeof entry.id==='string'&&entry.id&&typeof entry.label==='string'&&entry.label.trim())entries.push(entry); };
  for(const row of data.ground.vehicles)add({kind:'ground',id:row['Vehicle ID'],label:row.Vehicle,br:row['BR Realistic'],nation:row.Nation,klass:pretty(row['Unit Class'])});
  for(const row of data.aircraft.aircraft)add({kind:'aircraft',id:row['Aircraft ID'],label:row.Aircraft,br:row['BR Realistic'],nation:row.Nation,klass:row.Class});
  for(const entry of entries){
    const key = entry.label.toLowerCase();
    if(!index.has(key))index.set(key,entry);
    index.set(`${key}|${entry.id.toLowerCase()}`,entry);
  }
  $('pickerList').innerHTML = entries.map(entry=>`<option value="${esc(entry.label)}">${esc(entry.klass)} · BR ${fmt(entry.br)}</option>`).join('');
}

// ------------------------------------------------------------- components
function ratingClass(value){
  const text = String(value||'').toLowerCase();
  if(text==='paper')return['rating-paper','P'];
  if(text==='weak')return['rating-weak','W'];
  if(text.startsWith('contested'))return['rating-contested','C'];
  if(text.includes('may be strong'))return['rating-may-strong','S?'];
  if(text.includes('layered'))return['rating-layered','L'];
  if(text.includes('variable'))return['rating-variable','V'];
  return['rating-unknown','?'];
}
function rating(value){
  if(value==null||value==='')return'<span class="armour-rating rating-unknown" data-code="?">No data</span>';
  const [className,code] = ratingClass(value);
  return `<span class="armour-rating ${className}" data-code="${esc(code)}">${esc(value)}</span>`;
}

/** A tappable grey chip that admits a gap instead of hiding it behind a blank. */
function gap(id,label,title,body){
  notes.set(id,[title,body]);
  return `<button class="gap-chip" data-note="${esc(id)}">${esc(label)}<span aria-hidden="true">?</span></button>`;
}
function card(title,body,tone=''){
  return `<section class="brief-card ${tone}"><h2>${esc(title)}</h2>${body}</section>`;
}
function answer(label,value,sub=''){
  return `<div class="brief-answer"><span>${esc(label)}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}</div>`;
}
function foldout(title,body){
  return `<details class="brief-foldout"><summary>${esc(title)}</summary><div>${body}</div></details>`;
}
function specGrid(record,dictionary){
  return `<dl class="spec-grid">${Object.entries(record).filter(([key])=>key!=='__searchScore').map(([key,value])=>
    `<div class="spec-item"><dt title="${esc(dictionary?.[key]||'')}">${esc(key)}</dt><dd>${esc(fmt(value))}</dd></div>`).join('')}</dl>`;
}
function table(rows,columns){
  if(!rows.length)return '<p class="loading-copy">Nothing recorded.</p>';
  return `<div class="table-scroll"><table><thead><tr>${columns.map(column=>`<th>${esc(column)}</th>`).join('')}</tr></thead><tbody>${
    rows.map(row=>`<tr>${columns.map(column=>`<td>${esc(fmt(row[column]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------------ brief
function header(entry,extra){
  return `<section class="brief-header">
    <div>
      <p class="eyebrow">${esc(entry.kind==='ground'?'GROUND FORCES':'AIR')}</p>
      <h2>${esc(entry.label)}</h2>
      <p class="brief-meta">${esc(pretty(entry.nation))} · ${esc(entry.klass)} · <span class="accent-value">BR ${fmt(entry.br)}</span> · <code>${esc(entry.id)}</code></p>
    </div>
    <div class="brief-header-stats">${extra}</div>
  </section>`;
}

function groundBrief(entry){
  const guide = data.ground.loadoutGuide.find(row=>row['Vehicle ID']===entry.id);
  const detail = data.ground.loadoutDetail.filter(row=>row['Vehicle ID']===entry.id);
  const armour = data.armour.vehicleSummary.find(row=>row['Vehicle ID']===entry.id);
  const faces = data.armour.weakspotGuide.filter(row=>row['Vehicle ID']===entry.id);
  const vehicle = data.ground.vehicles.find(row=>row['Vehicle ID']===entry.id);
  const sensors = data.sensors.platformSensors.filter(row=>row['Platform ID']===entry.id);

  // --- load this ------------------------------------------------------
  let loadBody;
  if(!detail.length){
    loadBody = `<p class="loading-copy">No ammunition recommendation for this vehicle. ${gap('no-loadout','Why',
      'No loadout recommendation','This vehicle has no anti-tank round on its main gun, or the gun has no shell data in the files. 96 vehicles are in that position.')}</p>`;
  }else{
    const total = guide?.['Recommended Total'];
    loadBody = `<p class="brief-lead">Take <strong>${fmt(total)}</strong> of ${fmt(guide?.['Full Ammo Capacity'])}.</p>
      <div class="load-stack">${detail.map(row=>{
        const share = row['Share of Load'] ? Math.round(row['Share of Load']*100) : 0;
        return `<div class="load-row">
          <div class="load-count">${fmt(row['Take This Many'])}</div>
          <div class="load-main">
            <strong>${esc(row.Ammunition)}</strong>
            <span class="badge">${esc(row['Ammo Family'])}</span>
            ${row['Stock Ammo']==='Yes'?'<span class="badge">Stock</span>':''}
            <small>${esc(row.Why||'')}</small>
          </div>
          <div class="load-bar"><i style="width:${share}%"></i><span>${share}%</span></div>
        </div>`;}).join('')}</div>
      ${guide?.['Ranking Confidence']&&!guide['Ranking Confidence'].startsWith('Ranked')
        ? `<p class="brief-caution">${esc(guide['Ranking Confidence'])}</p>` : ''}`;
  }

  // --- where they shoot you -------------------------------------------
  let armourBody;
  if(!faces.length){
    armourBody = `<p class="loading-copy">No armour record matched. ${gap('no-armour','Why','No armour record',
      'This vehicle has no damage model in the files, or its identifier did not match. Seven SAM fire-control vehicles are in this position because they carry no weapon of their own.')}</p>`;
  }else{
    const layered = armour?.['Layered Armour']?.startsWith('Yes');
    armourBody = `<div class="face-grid">${FACES.map(face=>{
      const row = faces.find(item=>item.Face===face);
      if(!row)return `<div class="face-card"><span>${face}</span>${rating(null)}</div>`;
      return `<div class="face-card">
        <span>${face}</span>
        ${rating(row['Main Armour Rating'])}
        <small>${fmt(row['Main Plate (mm)'])} mm main plate${Number.isFinite(row['Main Threats Penetrating (%)'])?` · ${fmt(row['Main Threats Penetrating (%)'])}% of rounds at this BR get through`:''}</small>
        ${row['Weakest Spot (mm)']!=null?`<small class="face-weak">Thinnest here: ${fmt(row['Weakest Spot (mm)'])} mm at <code>${esc(row['Weakest Spot Part']||'')}</code></small>`:''}
      </div>`;}).join('')}</div>
      ${layered?`<p class="brief-caution">Composite, spaced or ERA armour. No rating is issued for this vehicle. ${gap('layered','Why not',
        'Layered armour is not rated','Nominal plate thickness does not describe composite armour. T-80BVM lists its hull front as 80 mm; the real figure is several hundred millimetres once the stack and slope apply. Rating it from flat thickness would call a top-tier tank paper, which is the opposite of true. 233 vehicles are refused on this basis.')}</p>`:''}
      <p class="brief-caution">Impact angle is not in the game files. ${gap('angles','What that means',
        'Flat plate values only','Armour angle lives in the 3D mesh, not the data. Every thickness here is a flat plate figure. Sloped vehicles — T-34, Panther, IS-3 — are systematically under-rated. Flat-armour vehicles like the Tiger rate about right. The error runs one way, so treat these as a floor, never a ceiling.')}</p>`;
  }

  // --- know this -------------------------------------------------------
  const protectedRounds = guide?.['Protected Rack Rounds'];
  const knowBody = `<div class="answer-grid">
    ${answer('Ammo rack', protectedRounds ? `${fmt(protectedRounds)} protected` : 'None protected',
      protectedRounds ? 'Rounds above that sit in a rack that can detonate.' : 'Every round you carry can cook off.')}
    ${answer('Crew', fmt(armour?.['Crew Count'] ?? vehicle?.['Crew Count']), 'Losing them all is the usual death.')}
    ${answer('Largest gun', `${fmt(vehicle?.['Largest Caliber (mm)'])} mm`, esc(vehicle?.['Ground Role']||pretty(vehicle?.['Unit Class'])||''))}
    ${answer('Sensors', sensors.length ? `${sensors.length} fitted` : 'None', sensors.length ? esc(sensors.map(row=>row.Sensor).slice(0,2).join(', ')) : 'No radar or laser warning.')}
  </div>
  ${guide?.['Ammo Rack Risk']?`<p class="brief-caution">${esc(guide['Ammo Rack Risk'])}</p>`:''}`;

  return header(entry, `${answer('Take', guide?fmt(guide['Recommended Total']):'—','rounds')}${(()=>{
      const worst = faces.find(row=>String(row['Main Armour Rating']).toLowerCase()==='paper')
                 || faces.find(row=>String(row['Main Armour Rating']).toLowerCase()==='weak');
      if(worst)return answer('Weakest face',esc(worst.Face),`${fmt(worst['Main Plate (mm)'])} mm main plate`);
      if(!faces.length)return answer('Weakest face','—','no armour record');
      if(armour?.['Layered Armour']?.startsWith('Yes'))return answer('Weakest face','Not rated','composite armour');
      return answer('Weakest face','None weak','no face rates weak or paper');
    })()}`)
    + card('Load this', loadBody)
    + card('They shoot here', armourBody)
    + card('Know this', knowBody)
    + foldout('Full specifications', specGrid(vehicle||{}, data.ground.dictionary)
        + (armour?`<h3>Armour record</h3>${specGrid(armour,data.armour.dictionary)}`:'')
        + (detail.length?`<h3>Ammunition detail</h3>${table(detail,['Ammunition','Ammo Family','Take This Many','Best Pen (mm)','Pen Confidence','TNT Equivalent (kg)','Muzzle Velocity (m/s)'])}`:''));
}

function aircraftBrief(entry){
  const record = data.aircraft.aircraft.find(row=>row['Aircraft ID']===entry.id);
  const guns = data.aircraft.aircraftGuns.filter(row=>row['Aircraft ID']===entry.id);
  const perf = data.aircraft.performance.filter(row=>row['Aircraft ID']===entry.id);
  const ordnance = data.aircraft.aircraftOrdnance.filter(row=>row['Aircraft ID']===entry.id);
  const sensors = data.sensors.platformSensors.filter(row=>row['Platform ID']===entry.id);
  const belts = guns.flatMap(gun=>data.aircraft.gunBelts.filter(row=>row.Gun===gun.Gun));
  const missingPerf = record?.['Performance Data']==='NOT IN THE FILES';

  const gunBody = guns.length ? `<div class="load-stack">${guns.map(gun=>`
      <div class="load-row">
        <div class="load-count">${fmt(gun.Barrels)}×</div>
        <div class="load-main">
          <strong>${esc(gun.Gun)}</strong>
          <span class="badge">${fmt(gun['Caliber (mm)'])} mm</span>
          ${gun['Turret Mounted']==='Yes'?'<span class="badge">Turret</span>':''}
          <small>${fmt(gun['Rounds Per Barrel'])} rounds per barrel · ${fmt(gun['Rate of Fire (rpm)'])} rpm · ${fmt(gun['Seconds of Fire'])} s of continuous fire</small>
        </div>
      </div>`).join('')}</div>
      <p class="brief-caution">Burst mass ${fmt(record?.['Burst Mass (kg/s)'])} kg/s. ${gap('burst','What that is',
        'Burst mass is a proxy','Rate of fire times shell mass, summed across every barrel. It ignores explosive filler, shell type and whether you hit anything. Use it to compare armament fits, never as damage.')}</p>`
    : '<p class="loading-copy">No guns resolved for this aircraft.</p>';

  const perfBody = missingPerf
    ? `<p class="brief-lead">Not in the files.</p>
       <p class="brief-caution">${gap('perf','Why there is no speed figure','Flight performance is missing',
         'Performance files exist for propeller aircraft and early jets. Coverage falls away through the 6.0–9.0 range and is ZERO above BR 10.0 — no F-16, no MiG-29, no Su-27. The aero model exists in flightmodels/fm/ but turning it into a top speed means running the flight simulation, not reading a value. 751 of 1,440 aircraft are in this position. No number has been invented.')}</p>`
    : `<div class="answer-grid">
        ${answer('Top speed',`${fmt(record?.['Top Speed (km/h)'])} km/h`,`at ${fmt(record?.['Top Speed At (m)'])} m`)}
        ${answer('At sea level',`${fmt(record?.['Sea Level Speed (km/h)'])} km/h`,'')}
        ${answer('Best climb',`${fmt(record?.['Best Climb (m/s)'])} m/s`,'')}
        ${answer('Takeoff run',`${fmt(record?.['Takeoff Distance (m)'])} m`,'')}
      </div>`;

  const seenBody = sensors.length ? `<div class="answer-grid">
      ${answer('Sensors fitted', String(sensors.length), esc(sensors.map(row=>row.Sensor).slice(0,3).join(', ')))}
      ${answer('Ordnance options', ordnance.length?String(ordnance.length):'None', record?.['Gun Only']==='Yes'?'Guns only.':'')}
      ${answer('Repair (RB)', `${fmt(record?.['Repair Cost RB Upgraded (SL)'])} SL`, `avg award ${fmt(record?.['Avg Award RB (SL)'])} SL`)}
      ${answer('Crew', fmt(record?.Crew), '')}
    </div>`
    : `<div class="answer-grid">
      ${answer('Sensors fitted','None','No radar or warning receiver.')}
      ${answer('Ordnance options', ordnance.length?String(ordnance.length):'None', record?.['Gun Only']==='Yes'?'Guns only.':'')}
      ${answer('Repair (RB)', `${fmt(record?.['Repair Cost RB Upgraded (SL)'])} SL`, `avg award ${fmt(record?.['Avg Award RB (SL)'])} SL`)}
      ${answer('Crew', fmt(record?.Crew), '')}
    </div>`;

  return header(entry, `${answer('Barrels', fmt(record?.['Gun Barrels']), `${fmt(record?.['Largest Caliber (mm)'])} mm`)}${answer('Top speed', missingPerf?'—':`${fmt(record?.['Top Speed (km/h)'])}`, missingPerf?'not in files':'km/h')}`)
    + card('Bring this', gunBody)
    + card('How it flies', perfBody)
    + card('Know this', seenBody)
    + foldout('Full specifications', specGrid(record||{}, data.aircraft.dictionary)
        + (belts.length?`<h3>Ammunition belts</h3>${table(belts,['Gun','Belt Name','Shell','Shell Type','Projectile Mass (kg)','Muzzle Velocity (m/s)','Explosive Mass (kg)'])}`:'')
        + (perf.length?`<h3>Performance by altitude</h3>${table(perf,['Altitude (m)','Max Speed (km/h)','Optimal Speed (km/h)','Climb Rate (m/s)'])}`:''));
}

function show(entry){
  current = entry;
  notes.clear();
  $('briefBody').innerHTML = entry.kind==='ground'?groundBrief(entry):aircraftBrief(entry);
  $('briefHeadline').textContent = entry.label;
  document.title = `${entry.label} | Brief`;
  try{history.replaceState(null,'',`?v=${encodeURIComponent(entry.id)}`);}catch{}
  window.scrollTo({top:0,behavior:'smooth'});
}

function suggest(query){
  const phrase = query.trim().toLowerCase();
  if(!phrase){$('pickerSuggestions').innerHTML='';return;}
  const hits = entries.filter(entry=>entry.label.toLowerCase().includes(phrase)||entry.id.toLowerCase().includes(phrase)).slice(0,8);
  $('pickerSuggestions').innerHTML = hits.map(entry=>
    `<button data-pick="${esc(entry.id)}" data-kind="${esc(entry.kind)}"><strong>${esc(entry.label)}</strong><small>${esc(entry.klass)} · BR ${fmt(entry.br)}</small></button>`).join('');
}

$('pickerInput').addEventListener('input',event=>{
  suggest(event.target.value);
  const match = index.get(event.target.value.trim().toLowerCase());
  if(match)show(match);
});
$('pickerSuggestions').addEventListener('click',event=>{
  const button = event.target.closest('[data-pick]');
  if(!button)return;
  const entry = entries.find(item=>item.id===button.dataset.pick&&item.kind===button.dataset.kind);
  if(entry){$('pickerInput').value=entry.label;$('pickerSuggestions').innerHTML='';show(entry);}
});
$('briefBody').addEventListener('click',event=>{
  const chip = event.target.closest('[data-note]');
  if(!chip)return;
  const note = notes.get(chip.dataset.note);
  if(!note)return;
  $('noteTitle').textContent = note[0];
  $('noteBody').innerHTML = `<p>${esc(note[1])}</p>`;
  $('noteDialog').showModal();
});
$('closeNote').onclick = ()=>$('noteDialog').close();

function setTheme(theme){
  document.documentElement.dataset.theme = theme;
  $('themeButton').textContent = theme==='dark'?'☀':'☾';
  try{localStorage.setItem('ordnance-theme',theme);}catch{}
}
$('themeButton').onclick = ()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');

(async function start(){
  let saved='dark';try{saved=localStorage.getItem('ordnance-theme')||'dark';}catch{}
  setTheme(saved);
  try{
    await Promise.all(['ground','armour','aircraft','sensors'].map(load));
    buildIndex();
    const wanted = new URLSearchParams(location.search).get('v');
    const entry = wanted ? entries.find(item=>item.id===wanted) : entries.find(item=>item.id==='ussr_t_80bvm')||entries[0];
    if(entry){$('pickerInput').value=entry.label;show(entry);}
    else $('briefBody').innerHTML='<p class="loading-copy">Pick a vehicle to begin.</p>';
  }catch(error){
    console.error(error);
    $('briefBody').innerHTML='<p class="loading-copy">Data could not be loaded. Check your connection and reload.</p>';
  }
})();

if(typeof module!=='undefined')module.exports={ratingClass};
