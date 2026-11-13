// Compila la app de Android «Pixel Pal · Avisos» y deja el APK en dist/Pixel-Pal-Avisos.apk
// Necesita: Android Studio (su JDK y el SDK) y android/app/google-services.json de tu proyecto de Firebase.
// Uso: npm run build:apk
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AND = path.join(ROOT, 'android');
if (!fs.existsSync(path.join(AND, 'app', 'google-services.json'))) {
  console.error('Falta android/app/google-services.json (consola de Firebase → tu proyecto → app Android com.pixelpal.avisos).');
  process.exit(1);
}
// El dibujo de Pal para la pantalla de alarma: el mismo código que en el PC
const ASSETS = path.join(AND, 'app', 'src', 'main', 'assets', 'pal');
fs.mkdirSync(ASSETS, { recursive: true });
for (const f of ['clawd.js', 'skins.js', 'catalog.js']) fs.copyFileSync(path.join(ROOT, 'renderer', f), path.join(ASSETS, f));
console.log('Pal copiado a la app (clawd.js, skins.js, catalog.js)');

// Gradle: el de la carpeta de Gradle del usuario (el que ya usa Android Studio)
const dists = path.join(os.homedir(), '.gradle', 'wrapper', 'dists');
const want = ['gradle-8.7-bin', 'gradle-8.14.3-all', 'gradle-8.14.3-bin'];
let gradle = null;
for (const d of want) {
  const base = path.join(dists, d);
  if (!fs.existsSync(base)) continue;
  for (const h of fs.readdirSync(base)) {
    const g = path.join(base, h, d.replace(/-(bin|all)$/, ''), 'bin', 'gradle.bat');
    if (fs.existsSync(g)) { gradle = g; break; }
  }
  if (gradle) break;
}
if (!gradle) { console.error('No encuentro Gradle en', dists, '(ábrelo una vez con Android Studio)'); process.exit(1); }
console.log('Gradle:', gradle);
const r = spawnSync('cmd.exe', ['/c', gradle, 'assembleRelease', '--console=plain'], { cwd: AND, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
const apk = path.join(AND, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'Pixel-Pal-Avisos.apk');
fs.copyFileSync(apk, out);
console.log(`\nAPK listo: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
