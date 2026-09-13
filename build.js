import { mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','styles.css','logic.js'])await copyFile(file,`dist/${file}`);
const [dataset,app]=await Promise.all([readFile('data/weapons.json','utf8'),readFile('app.js','utf8')]);
JSON.parse(dataset);
await writeFile('dist/app.js',`globalThis.__WEAPONS_DATA__=${dataset};\n${app}`);
console.log('Static dashboard built in dist/ with embedded dataset');
