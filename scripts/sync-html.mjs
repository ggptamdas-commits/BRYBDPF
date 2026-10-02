import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pairs = [
  ['index.html', 'src/public_html.js', 'publicHtml'],
  ['admin.html', 'src/admin_html.js', 'adminHtml'],
];

let changed = false;
for (const [sourceName, targetName, exportName] of pairs) {
  const source = await readFile(path.join(root, sourceName), 'utf8');
  const generated = `// Generated from ${sourceName}; edit the canonical HTML file instead.\nconst ${exportName} = ${JSON.stringify(source)};\nexport default ${exportName};\n`;
  const targetPath = path.join(root, targetName);
  let current = '';
  try { current = await readFile(targetPath, 'utf8'); } catch (_) {}
  if (current !== generated) {
    changed = true;
    if (process.argv.includes('--check')) {
      console.error(`HTML source drift detected: ${targetName} is not generated from ${sourceName}.`);
    } else {
      await writeFile(targetPath, generated);
      console.log(`Synchronized ${targetName} from ${sourceName}.`);
    }
  }
}

if (process.argv.includes('--check') && changed) process.exit(1);
if (process.argv.includes('--check')) console.log('HTML source sync check passed.');
