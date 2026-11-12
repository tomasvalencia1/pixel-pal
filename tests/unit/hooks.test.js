// Conexión con Claude Code: cada edición solo toca lo suyo y nunca lo del usuario
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { create, curlCommand, EVENTS } = require('../../hooks');

const LEGACY_HOOK = '"C:/node.exe" "C:/x/hooks/clawd-hook.js"';
const LEGACY_SL = '"C:/node.exe" "C:/x/hooks/clawd-statusline.js"';
const USER_HOOK = 'echo mio';

function tmpSettings(obj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-hooks-'));
  const file = path.join(dir, 'settings.json');
  if (obj !== undefined) fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  return file;
}
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const commands = s => Object.values(s.hooks || {}).flat().flatMap(e => e.hooks).map(h => h.command);
const entry = command => ({ hooks: [{ type: 'command', command }] });

test('instala los 8 eventos y la línea de estado en un settings vacío', () => {
  const file = tmpSettings();
  const h = create({ settings: file, legacy: false });
  const st = h.install(7778, 'tok');
  assert.equal(st.installed, true);
  const s = read(file);
  assert.equal(Object.keys(s.hooks).length, EVENTS.length);
  assert.ok(commands(s).every(c => c === curlCommand(7778, 'tok', 'event')));
  assert.equal(s.statusLine.command, curlCommand(7778, 'tok', 'statusline'));
  assert.equal(h.upToDate(7778, 'tok'), true);
  assert.equal(h.upToDate(7779, 'tok'), false, 'otro puerto = hay que reinstalar');
});

test('reinstalar no duplica y respeta los hooks y la línea de estado del usuario', () => {
  const file = tmpSettings({ hooks: { Stop: [entry(USER_HOOK)] }, statusLine: { type: 'command', command: 'mi-linea' } });
  const h = create({ settings: file, legacy: false });
  h.install(7778, 'tok');
  h.install(7778, 'tok');
  const s = read(file);
  assert.equal(commands(s).filter(c => c.includes('x-clawd-token')).length, EVENTS.length);
  assert.ok(commands(s).includes(USER_HOOK));
  assert.equal(s.statusLine.command, 'mi-linea');
  // y se hizo copia de seguridad
  assert.ok(fs.readdirSync(path.dirname(file)).some(n => n.startsWith('settings.json.bak-clawd-')));
});

test('la compartida no borra los hooks de otra edición (otra clave y otro puerto)', () => {
  const other = curlCommand(7777, 'personal-token', 'event');
  const file = tmpSettings({ hooks: { SessionStart: [entry(other), entry(LEGACY_HOOK)] } });
  const h = create({ settings: file, legacy: false });
  assert.equal(h.status(7778, 'tok').installed, false);
  h.install(7778, 'tok');
  h.uninstall(7778, 'tok');
  const cmds = commands(read(file));
  assert.ok(cmds.includes(other), 'los curl de la otra edición siguen');
  assert.ok(cmds.includes(LEGACY_HOOK), 'los hooks de Node siguen');
  assert.ok(!cmds.some(c => c.includes('tok"')) && !cmds.includes(curlCommand(7778, 'tok', 'event')));
});

test('con la misma clave y otro puerto se reconecta (cambio de puerto)', () => {
  const old = curlCommand(7777, 'tok', 'event');
  const file = tmpSettings({ hooks: Object.fromEntries(EVENTS.map(([e]) => [e, [entry(old)]])) });
  const h = create({ settings: file, legacy: false });
  assert.equal(h.status(7778, 'tok').installed, true);
  assert.equal(h.upToDate(7778, 'tok'), false);
  h.install(7778, 'tok');
  const cmds = commands(read(file));
  assert.ok(!cmds.includes(old));
  assert.equal(cmds.filter(c => c === curlCommand(7778, 'tok', 'event')).length, EVENTS.length);
});

test('restos de una clave antigua en el mismo puerto se limpian', () => {
  const stale = curlCommand(7778, 'clave-vieja', 'event');
  const file = tmpSettings({ hooks: { Stop: [entry(stale)] } });
  create({ settings: file, legacy: false }).install(7778, 'tok');
  assert.ok(!commands(read(file)).includes(stale));
});

test('la personal reconoce sus hooks de Node: conectada, al día y sin reescribir nada', () => {
  const file = tmpSettings({ hooks: { Stop: [entry(LEGACY_HOOK)] }, statusLine: { type: 'command', command: LEGACY_SL } });
  const before = fs.readFileSync(file, 'utf8');
  const h = create({ settings: file, legacy: true });
  const st = h.status(7777, 'tok');
  assert.equal(st.installed, true);
  assert.equal(st.legacy, true);
  assert.equal(h.upToDate(7777, 'tok'), true);
  h.install(7777, 'tok');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'install no toca nada si ya están los de Node');
  // desconectar desde Ajustes sí los quita (es lo que pide el usuario)
  h.uninstall(7777, 'tok');
  const s = read(file);
  assert.equal(commands(s).length, 0);
  assert.equal(s.statusLine, undefined);
});

test('la compartida ignora los hooks de Node de la personal', () => {
  const file = tmpSettings({ hooks: { Stop: [entry(LEGACY_HOOK)] } });
  const h = create({ settings: file, legacy: false });
  assert.equal(h.status(7778, 'tok').installed, false);
  h.uninstall(7778, 'tok');
  assert.ok(commands(read(file)).includes(LEGACY_HOOK));
});

test('un settings.json roto nunca se sobrescribe', () => {
  const file = tmpSettings('{ esto no es json');
  const h = create({ settings: file, legacy: false });
  assert.throws(() => h.install(7778, 'tok'));
  assert.equal(fs.readFileSync(file, 'utf8'), '{ esto no es json');
  assert.ok(h.status(7778, 'tok').error);
  assert.equal(h.upToDate(7778, 'tok'), true, 'si no se puede leer, no se toca');
});
