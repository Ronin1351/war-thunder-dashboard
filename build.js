import { mkdir, copyFile, cp, readFile, writeFile, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','styles.css','search.js'])await copyFile(file,`dist/${file}`);
await mkdir('dist/data',{recursive:true});
await cp('data/armour_plates','dist/data/armour_plates',{recursive:true});
const [air,ground,groundRoles,infantry,armour,sensors,app]=await Promise.all([
  readFile('data/weapons.json','utf8'),
  readFile('data/ground.json','utf8'),
  readFile('data/ground_roles.json','utf8'),
  readFile('data/infantry.json','utf8'),
  readFile('data/armour.json','utf8'),
  readFile('data/sensors.json','utf8'),
  readFile('app.js','utf8')
]);
for(const source of [air,ground,groundRoles,infantry,armour,sensors])JSON.parse(source);
await writeFile('dist/app.js',`globalThis.__ORDNANCE_DATA__={air:${air},ground:${ground},groundRoles:${groundRoles},infantry:${infantry},armour:${armour},sensors:${sensors}};\n${app}`);
console.log('Static dashboard built in dist/ with air, ground, infantry, armour and sensor datasets');
