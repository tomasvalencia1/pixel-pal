// Catálogo de personajes/accesorios y configuración de cada edición
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
// Carga un módulo en un proceso aparte con la edición indicada (los módulos leen la edición al cargarse)
function inEdition(edition, code) {
  const env = { ...process.env };
  if (edition) env.PAL_EDITION = edition; else delete env.PAL_EDITION;
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env, encoding: 'utf8' }));
}

test('el otro Pal depende de la edición: naranja en la compartida, turquesa en la personal', () => {
  const code = "console.log(JSON.stringify(require('./renderer/catalog.js').skins.map(s => s.id)))";
  const shared = inEdition(null, code);
  const personal = inEdition('personal', code);
  assert.ok(shared.includes('naranja') && !shared.includes('turquesa'));
  assert.ok(personal.includes('turquesa') && !personal.includes('naranja'));
  assert.equal(shared[0], 'clawd');
  assert.equal(personal.length, shared.length);
});

test('edition.js: carpeta, puerto y nombre de cada edición', () => {
  const code = "console.log(JSON.stringify(require('./edition.js')))";
  const shared = inEdition(null, code);
  const personal = inEdition('personal', code);
  const unknown = inEdition('loquesea', code);
  assert.equal(shared.name, 'shared');
  assert.equal(shared.port, 7778);
  assert.match(shared.dataDir, /\.clawd-flotante$/);
  assert.equal(personal.name, 'personal');
  assert.equal(personal.port, 7777);
  assert.match(personal.dataDir, /\.clawd$/);
  assert.equal(personal.legacyHooks, true);
  assert.equal(unknown.name, 'shared', 'cualquier valor raro = compartida');
  assert.notEqual(shared.appId, personal.appId);
});

test('CATALOG.clean quita lo que no existe o no está desbloqueado', () => {
  const CATALOG = require('../../renderer/catalog.js');
  assert.deepEqual(CATALOG.clean(null), { skin: 'clawd', hat: 'none', glasses: 'none', neck: 'none' });
  assert.equal(CATALOG.clean({ skin: 'noexiste' }).skin, 'clawd');
  assert.equal(CATALOG.clean({ skin: 'miso' }).skin, 'miso');
  const locked = CATALOG.hats.find(h => h.lvl);
  assert.equal(CATALOG.clean({ hat: locked.id }, 1).hat, 'none');
  assert.equal(CATALOG.clean({ hat: locked.id }, locked.lvl).hat, locked.id);
  const free = CATALOG.hats.find(h => !h.lvl && h.id !== 'none');
  assert.equal(CATALOG.clean({ hat: free.id }).hat, free.id);
});

test('CATALOG.levelOf empieza en 1 y nunca baja', () => {
  const { levelOf } = require('../../renderer/catalog.js');
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(-5), 1);
  assert.equal(levelOf('basura'), 1);
  let prev = 1;
  for (let xp = 0; xp <= 20000; xp += 50) { const l = levelOf(xp); assert.ok(l >= prev); prev = l; }
  assert.ok(prev > 5);
});

test('todos los ids del catálogo son únicos', () => {
  const CATALOG = require('../../renderer/catalog.js');
  for (const k of ['skins', 'hats', 'glasses', 'neck']) {
    const ids = CATALOG[k].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length, k);
  }
});
