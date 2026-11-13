// Compila scripts/system-watch.cs → scripts/system-watch.exe con el compilador de C# que trae Windows (.NET Framework 4).
// No hace falta instalar nada. Uso: npm run build:watcher
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const NET = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const META = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WinMetadata');
const csc = path.join(NET, 'csc.exe');
const src = path.join(__dirname, '..', 'scripts', 'system-watch.cs');
const out = path.join(__dirname, '..', 'scripts', 'system-watch.exe');

// Ya compilado y más nuevo que el código: no hace falta (y si Pal está abierto, el .exe está en uso)
if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs && !process.argv.includes('--force')) {
  console.log('system-watch.exe ya está al día');
  process.exit(0);
}
if (!fs.existsSync(csc)) { console.error('No encuentro csc.exe de .NET Framework 4 en', NET); process.exit(1); }
const refs = [
  path.join(NET, 'System.Runtime.dll'),
  path.join(META, 'Windows.Foundation.winmd'),
  path.join(META, 'Windows.Media.winmd'),
];
const args = ['/nologo', '/optimize+', '/target:winexe', '/platform:anycpu', `/out:${out}`, ...refs.map(r => `/r:${r}`), src];
try {
  console.log(execFileSync(csc, args, { encoding: 'utf8' }).trim() || 'ok');
  console.log('Creado', out, `(${Math.round(fs.statSync(out).size / 1024)} KB)`);
} catch (e) {
  console.error(e.stdout || e.message);
  process.exit(1);
}
