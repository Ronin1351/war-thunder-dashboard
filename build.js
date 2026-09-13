import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','styles.css'])await copyFile(file,`dist/${file}`);
const [air,ground,infantry,app]=await Promise.all([
  readFile('data/weapons.json','utf8'),
  readFile('data/ground.json','utf8'),
  readFile('data/infantry.json','utf8'),
  readFile('app.js','utf8')
]);
for(const source of [air,ground,infantry])JSON.parse(source);
await writeFile('dist/app.js',`globalThis.__ORDNANCE_DATA__={air:${air},ground:${ground},infantry:${infantry}};\n${app}`);
console.log('Static dashboard built in dist/ with air, ground and infantry datasets');
