// Builds the single-file simulator (public/esp32c3-sim.html) from the files in this folder.
//   node sim/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8');
const js = ['transpiler.js', 'runtime.js', 'parts.js', 'world.js', 'projects.js', 'ui.js'].map(f => `// ---- ${f} ----\n${read(f)}`).join('\n');
const html = read('index.html')
    .replace('/*CSS*/', () => read('sim.css'))
    .replace('/*JS*/', () => js.replace(/<\/script/gi, '<\\/script'));
const out = join(here, '..', 'public', 'esp32c3-sim.html');
writeFileSync(out, html);
console.log(`Built ${out} (${(html.length / 1024).toFixed(0)} KB)`);
