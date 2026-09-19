import { mkdir, copyFile, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { buildVehicleIndex } from './vehicle-index.js';

// Datasets are served as separate files and fetched on demand, so a visitor
// downloads only the directories they open. Inlining them into app.js meant a
// 25 MB bundle that had to be parsed on the main thread before first paint.
const datasets = ['weapons.json','aircraft.json','ground.json','ground_roles.json','infantry.json','armour.json','sensors.json'];

await rm('dist',{recursive:true,force:true});
await mkdir('dist');
for(const file of ['index.html','brief.html','styles.css','search.js','marks.js','app.js','brief.js','lists.html','lists-core.js','lists-page.js','ordnance-app-icon.png','favicon.png'])await copyFile(file,`dist/${file}`);
await mkdir('dist/data',{recursive:true});
await cp('data/armour_plates','dist/data/armour_plates',{recursive:true});

let total = 0;
for(const name of datasets){
  const source = await readFile(`data/${name}`,'utf8');
  JSON.parse(source);                       // fail the build on malformed data
  await writeFile(`dist/data/${name}`,source);
  total += source.length;
}
const vehicleIndex = buildVehicleIndex(JSON.parse(await readFile('data/aircraft.json','utf8')),JSON.parse(await readFile('data/ground.json','utf8')),JSON.parse(await readFile('data/ground_roles.json','utf8')).roles);
await writeFile('dist/data/vehicle-index.json',JSON.stringify(vehicleIndex));
const plates = await readdir('dist/data/armour_plates');
console.log(`Static dashboard built in dist/: ${datasets.length} datasets (${(total/1e6).toFixed(1)} MB) and ${plates.length} armour plate files, all fetched on demand.`);
