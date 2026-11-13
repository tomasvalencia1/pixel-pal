// 📱 Avisos al móvil: cuándo se envían y qué se envía (sin red: fetch falso)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPhone } = require('../../phone');

function setup({ phone = {}, idle = 0, locked = false } = {}) {
  let config = { phone: { on: true, provider: 'ntfy', ...phone } };
  const sent = [];
  const sessions = new Map();
  const env = { idle, locked };
  const p = createPhone({
    getConfig: () => config,
    saveConfig: patch => { config = { ...config, ...patch }; },
    idleSeconds: () => env.idle,
    isLocked: () => env.locked,
    getSession: id => sessions.get(id),
    fetch: async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body) }); return { ok: true, status: 200 }; },
  });
  return { p, sent, sessions, env, config: () => config };
}
const flush = () => new Promise(r => setImmediate(r));
const session = (extra = {}) => ({ id: 's1', project: 'mi-app', status: 'done', doneAt: 1, tasks: [{ status: 'completed' }, { status: 'completed' }, { status: 'pending' }], ...extra });

test('genera un canal secreto la primera vez y lo conserva', () => {
  const { p, config } = setup();
  const t = p.config().topic;
  assert.match(t, /^pixelpal-[0-9a-f]{18}$/);
  assert.equal(config().phone.topic, t);
  assert.equal(p.config().topic, t);
  assert.notEqual(p.set({ newTopic: true }).topic, t);
});

test('apagado: no envía nada', async () => {
  const { p, sent } = setup({ phone: { on: false, mode: 'always' } });
  p.event('done', session());
  await flush();
  assert.equal(sent.length, 0);
});

test('"siempre": avisa al terminar con proyecto, tareas y tiempo (sin lo que escribiste)', async () => {
  const { p, sent } = setup({ phone: { mode: 'always' } });
  p.event('done', session({ prompt: 'mi secreto' }), { ms: 12 * 60000 });
  await flush();
  assert.equal(sent.length, 1);
  const b = sent[0].body;
  assert.equal(sent[0].url, 'https://ntfy.sh');
  assert.equal(b.topic, p.config().topic);
  assert.match(b.title, /mi-app: Claude terminó/);
  assert.match(b.message, /2\/3 tareas hechas · 12 min trabajando/);
  assert.doesNotMatch(JSON.stringify(b), /mi secreto/);
});

test('"solo si no estoy": delante del PC no avisa al momento; ausente o bloqueado, sí', async () => {
  const a = setup({ idle: 10 });
  a.p.event('done', session());
  await flush();
  assert.equal(a.sent.length, 0);
  assert.equal(a.p.pending(), 1, 'queda una comprobación por si te vas');
  a.p.cancelAll();

  const b = setup({ idle: 4 * 60 });
  b.p.event('done', session());
  await flush();
  assert.equal(b.sent.length, 1);

  const c = setup({ locked: true });
  c.p.event('waiting', session({ status: 'waiting', waitingSince: 5, message: 'Quiere usar Bash' }));
  await flush();
  assert.equal(c.sent.length, 1);
  assert.equal(c.sent[0].body.priority, 4);
  assert.match(c.sent[0].body.message, /Quiere usar Bash/);
});

test('terminó estando tú y luego te fuiste: avisa pasados los minutos si no respondiste', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { p, sent, sessions, env } = setup({ idle: 0, phone: { awayMin: 3 } });
  const s = session();
  sessions.set('s1', s);
  p.event('done', s);
  env.idle = 200;                       // te fuiste
  t.mock.timers.tick(3 * 60000);
  await flush();
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.message, /terminó hace 3 min/);
});

test('si respondes (o Claude sigue) antes, no avisa', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { p, sent, sessions, env } = setup({ idle: 0 });
  let s = session();
  sessions.set('s1', s);
  p.event('done', s);
  s.status = 'thinking';                // le escribiste otra cosa
  env.idle = 999;
  t.mock.timers.tick(10 * 60000);
  await flush();
  assert.equal(sent.length, 0);

  env.idle = 0;                         // vuelves al PC
  p.event('done', s = session());       // otro turno, y lo cancelas a mano (UserPromptSubmit)
  sessions.set('s1', s);
  p.cancel('s1');
  t.mock.timers.tick(10 * 60000);
  await flush();
  assert.equal(sent.length, 0);
});

test('un aviso de "sigo esperando" no anula el aviso diferido', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { p, sent, sessions, env } = setup({ idle: 0 });
  const s = session();
  sessions.set('s1', s);
  p.event('done', s);
  s.lastEvent = 999;                    // llegó otro evento sin cambiar de turno
  env.idle = 999;
  t.mock.timers.tick(3 * 60000);
  await flush();
  assert.equal(sent.length, 1);
});

test('respeta qué avisos quieres y el límite de uso tiene su texto', async () => {
  const { p, sent } = setup({ phone: { mode: 'always', done: false } });
  p.event('done', session());
  p.event('error', session(), { limit: true });
  await flush();
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.message, /límite de uso/);
});

test('ajustes: valida modo y minutos', () => {
  const { p } = setup();
  assert.equal(p.set({ mode: 'raro' }).mode, 'away');
  assert.equal(p.set({ mode: 'always' }).mode, 'always');
  assert.equal(p.set({ awayMin: 999 }).awayMin, 60);
  assert.equal(p.set({ awayMin: 0 }).awayMin, 3);
  assert.equal(p.set({ awayMin: -4 }).awayMin, 1);
});

test('la prueba se envía aunque esté apagado', async () => {
  const { p, sent } = setup({ phone: { on: false } });
  const r = await p.test();
  assert.equal(r.ok, true);
  assert.equal(sent.length, 1);
});

// ---------- 📲 app propia por Firebase (FCM v1), sin red ----------
const crypto = require('crypto');
const { checkKey } = require('../../phone');
function fcmSetup({ key = true } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { type: 'service_account', project_id: 'pixel-pal-test', client_email: 'pal@pixel-pal-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
  let config = { phone: { on: true, provider: 'app', mode: 'always' } };
  const calls = [];
  const p = createPhone({
    getConfig: () => config, saveConfig: patch => { config = { ...config, ...patch }; },
    idleSeconds: () => 0, isLocked: () => false, getSession: () => null,
    readKey: () => (key ? sa : null), pcName: 'MI-PC',
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      if (url.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 'tok-123', expires_in: 3600 }) };
      return { ok: true, status: 200 };
    },
  });
  return { p, calls, publicKey, sa };
}

test('app: el QR lleva el tema secreto y el nombre del PC; el código se puede escribir', () => {
  const { p } = fcmSetup();
  const st = p.status();
  assert.match(st.fcmTopic, /^pp_[0-9a-f]{24}$/);
  assert.equal(st.pairUrl, `pixelpal://pair?t=${st.fcmTopic}&n=MI-PC`);
  assert.equal(st.pairCode.replace(/ /g, ''), st.fcmTopic.slice(3));
  assert.equal(st.keyOk, true);
  assert.equal(st.keyProject, 'pixel-pal-test');
});

test('app: firma el JWT con la clave y envía al tema con el formato de FCM v1', async () => {
  const { p, calls, publicKey, sa } = fcmSetup();
  p.event('waiting', { id: 'ses-9', project: 'mi-app', status: 'waiting', message: 'Quiere usar Bash' });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(calls.length, 2);
  // 1) token: JWT RS256 válido para la cuenta de servicio
  const jwt = decodeURIComponent(calls[0].opts.body.match(/assertion=([^&]+)/)[1]);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.iss, sa.client_email);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')), 'firma válida');
  // 2) mensaje
  assert.equal(calls[1].url, 'https://fcm.googleapis.com/v1/projects/pixel-pal-test/messages:send');
  assert.equal(calls[1].opts.headers.authorization, 'Bearer tok-123');
  const m = JSON.parse(calls[1].opts.body).message;
  assert.equal(m.topic, p.status().fcmTopic);
  assert.match(m.notification.title, /mi-app: Claude necesita tu permiso/);
  assert.equal(m.data.kind, 'waiting');
  assert.equal(m.data.session, 'ses-9');
  assert.equal(m.android.priority, 'HIGH');
  assert.equal(m.android.notification.channel_id, 'pal_urgent');
  for (const v of Object.values(m.data)) assert.equal(typeof v, 'string', 'FCM solo admite textos en data');
});

test('app: reutiliza el token durante la hora', async () => {
  const { p, calls } = fcmSetup();
  await p.test();
  await p.test();
  assert.equal(calls.filter(x => x.url.includes('oauth2')).length, 1);
  assert.equal(calls.filter(x => x.url.includes('fcm.googleapis')).length, 2);
});

test('app: sin clave de Firebase no envía y lo dice', async () => {
  const { p, calls } = fcmSetup({ key: false });
  const r = await p.test();
  assert.equal(r.ok, false);
  assert.match(r.error, /clave de Firebase/);
  assert.equal(calls.length, 0);
  assert.equal(p.status().keyOk, false);
});

test('checkKey: acepta solo claves de cuenta de servicio válidas', () => {
  const { sa } = fcmSetup();
  assert.ok(checkKey(JSON.stringify(sa)));
  assert.equal(checkKey('{"type":"authorized_user"}'), null);
  assert.equal(checkKey({ ...sa, private_key: '-----BEGIN PRIVATE KEY-----\nbasura\n-----END PRIVATE KEY-----' }), null);
  assert.equal(checkKey('no es json'), null);
});
