// 📱 Avisos al móvil, por dos caminos:
//   app  → la app propia «Pixel Pal · Avisos» (Android) mediante Firebase Cloud Messaging: llega desde cualquier sitio,
//          aunque la app esté cerrada. Pal publica en un «tema» secreto al que el móvil se suscribe escaneando un QR.
//          Necesita la clave de cuenta de servicio de TU proyecto de Firebase (un .json guardado en la carpeta de Pal).
//   ntfy → la app gratis ntfy (https://ntfy.sh), sin cuenta: Pal publica en un canal con nombre secreto.
// Nunca se envía lo que escribes ni tu código: solo el nombre del proyecto, el estado y el número de tareas.
const crypto = require('crypto');

const DEFAULTS = {
  on: false,                   // apagado hasta que lo actives en Ajustes
  provider: 'app',             // 'app' (Firebase) o 'ntfy'
  fcmTopic: '',                // tema secreto de Firebase (se genera solo)
  server: 'https://ntfy.sh',
  topic: '',                   // canal secreto de ntfy (se genera solo)
  mode: 'away',                // 'away' = solo si no estás delante del PC · 'always' = siempre
  awayMin: 3,                  // minutos sin tocar el PC para considerar que no estás
  done: true, waiting: true, error: true,
};

const newTopic = () => `pixelpal-${crypto.randomBytes(9).toString('hex')}`;
const newFcmTopic = () => `pp_${crypto.randomBytes(12).toString('hex')}`;
const b64url = x => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const mins = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'menos de 1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

// deps: getConfig(), saveConfig(patch), idleSeconds(), isLocked(), getSession(id), readKey(), pcName, fetch, now()
function createPhone(deps) {
  const now = deps.now || Date.now;
  const fetchFn = deps.fetch || fetch;
  const timers = new Map();   // sesión → comprobación diferida ("terminó y luego te fuiste")
  let lastResult = null;
  let token = null;           // token de acceso de Google (dura 1 h)

  function config() {
    const c = { ...DEFAULTS, ...((deps.getConfig() || {}).phone || {}) };
    if (!c.topic || !c.fcmTopic) {
      c.topic = c.topic || newTopic();
      c.fcmTopic = c.fcmTopic || newFcmTopic();
      deps.saveConfig({ phone: c });
    }
    return c;
  }
  function set(patch = {}) {
    const c = config();
    const p = {};
    if ('on' in patch) p.on = !!patch.on;
    if (patch.provider === 'app' || patch.provider === 'ntfy') p.provider = patch.provider;
    if (patch.mode === 'away' || patch.mode === 'always') p.mode = patch.mode;
    if ('awayMin' in patch) p.awayMin = Math.max(1, Math.min(60, Math.round(Number(patch.awayMin) || DEFAULTS.awayMin)));
    for (const k of ['done', 'waiting', 'error']) if (k in patch) p[k] = !!patch[k];
    if (patch.newTopic) { p.topic = newTopic(); p.fcmTopic = newFcmTopic(); }
    deps.saveConfig({ phone: { ...c, ...p } });
    if (p.on === false) cancelAll();
    return config();
  }
  const away = c => !!deps.isLocked() || deps.idleSeconds() >= c.awayMin * 60;
  const url = c => `${c.server.replace(/\/+$/, '')}/${c.topic}`;
  // lo que lee la app al escanear el QR
  const pairUrl = c => `pixelpal://pair?t=${c.fcmTopic}&n=${encodeURIComponent(String(deps.pcName || 'tu PC').slice(0, 40))}`;
  const readKey = () => {
    try { const k = deps.readKey && deps.readKey(); return k && k.client_email && k.private_key && k.project_id ? k : null; }
    catch { return null; }
  };

  // ---------- Firebase Cloud Messaging (API v1) ----------
  // La cuenta de servicio firma un JWT que Google cambia por un token de acceso de 1 hora.
  async function accessToken(key) {
    if (token && token.email === key.client_email && token.exp > now() + 60000) return token.value;
    const tokenUri = key.token_uri || 'https://oauth2.googleapis.com/token';
    const iat = Math.floor(now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat, exp: iat + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(key.private_key);
    const jwt = `${head}.${claims}.${b64url(sig)}`;
    const r = await fetchFn(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Google no aceptó la clave de Firebase (${r.status})`);
    const j = await r.json();
    token = { value: j.access_token, exp: now() + (Number(j.expires_in) || 3600) * 1000, email: key.client_email };
    return token.value;
  }
  async function sendFcm(c, msg) {
    const key = readKey();
    if (!key) return { ok: false, error: 'falta la clave de Firebase' };
    const urgent = msg.kind === 'waiting' || msg.kind === 'error';
    const tag = String(msg.session || msg.kind || 'pal').slice(0, 60);
    const body = {
      message: {
        topic: c.fcmTopic,
        notification: { title: msg.title, body: msg.message },
        data: { kind: String(msg.kind || 'done'), session: tag, title: msg.title, body: msg.message },
        android: { priority: 'HIGH', notification: { channel_id: urgent ? 'pal_urgent' : 'pal', tag, color: urgent ? '#E5484D' : '#D97757', icon: 'ic_stat_pal' } },
      },
    };
    const r = await fetchFn(`https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await accessToken(key)}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401) token = null;
    return { ok: r.ok, status: r.status };
  }

  async function send(msg, force = false) {
    const c = config();
    if (!force && !c.on) return { ok: false, skipped: 'off' };
    try {
      if (c.provider === 'app') {
        lastResult = { ...(await sendFcm(c, msg)), at: now() };
      } else {
        const r = await fetchFn(c.server.replace(/\/+$/, ''), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ topic: c.topic, title: msg.title, message: msg.message, tags: msg.tags || [], priority: msg.priority || 3 }),
          signal: AbortSignal.timeout(8000),
        });
        lastResult = { ok: r.ok, status: r.status, at: now() };
      }
    } catch (e) {
      lastResult = { ok: false, error: e.message, at: now() };
    }
    return lastResult;
  }

  function build(kind, s, extra = {}) {
    return { kind, session: s.id, ...buildText(kind, s, extra) };
  }
  function buildText(kind, s, extra) {
    const p = s.project || 'Claude';
    if (kind === 'done') {
      const done = (s.tasks || []).filter(t => t.status === 'completed').length, total = (s.tasks || []).length;
      const parts = [];
      if (total) parts.push(`${done}/${total} tareas hechas`);
      if (extra.ms) parts.push(`${mins(extra.ms)} trabajando`);
      if (extra.late) parts.push(`terminó hace ${mins(extra.late)}`);
      return { title: `${p}: Claude terminó`, message: parts.join(' · ') || 'Listo para tu siguiente mensaje', tags: ['white_check_mark'], priority: 3 };
    }
    if (kind === 'waiting') {
      return { title: `${p}: Claude necesita tu permiso`, message: (s.message || 'Está esperando que apruebes algo') + (extra.late ? ` (desde hace ${mins(extra.late)})` : ''), tags: ['raising_hand'], priority: 4 };
    }
    return { title: `${p}: Claude se detuvo`, message: extra.limit ? 'Llegaste al límite de uso del plan' : 'La sesión terminó con un error', tags: ['warning'], priority: 4 };
  }

  // kind: 'done' | 'waiting' | 'error'
  function event(kind, s, extra = {}) {
    const c = config();
    if (!c.on || !c[kind] || !s) return false;
    cancel(s.id);
    if (c.mode === 'always' || away(c)) { send(build(kind, s, extra)); return true; }
    // Estás delante: Pal avisa en pantalla. Si te vas sin responder, el móvil avisa cuando pasen los minutos.
    if (kind === 'done' || kind === 'waiting') {
      const status = kind === 'done' ? 'done' : 'waiting';
      // marca del turno: si Claude vuelve a terminar o a pedir permiso, es otro aviso (los avisos de "sigo esperando" no cuentan)
      const markOf = x => (kind === 'done' ? x.doneAt : x.waitingSince);
      const mark = markOf(s);
      const since = now();
      const check = () => {
        timers.delete(s.id);
        const cur = deps.getSession(s.id);
        if (!cur || cur.status !== status || markOf(cur) !== mark) return;   // ya respondiste o siguió trabajando
        const cc = config();
        if (!cc.on || !cc[kind]) return;
        if (away(cc)) send(build(kind, cur, { ...extra, late: now() - since }));
        else if (now() - since < 60 * 60000) timers.set(s.id, setTimeout(check, 60000));   // sigue delante: mira otra vez en 1 min (máx. 1 h)
      };
      timers.set(s.id, setTimeout(check, c.awayMin * 60000));
    }
    return false;
  }
  function cancel(id) { const t = timers.get(id); if (t) { clearTimeout(t); timers.delete(id); } }
  function cancelAll() { for (const id of [...timers.keys()]) cancel(id); }

  function status() {
    const c = config(), k = readKey();
    return {
      ...c, url: url(c), pairUrl: pairUrl(c),
      pairCode: c.fcmTopic.slice(3).match(/.{1,4}/g).join(' '),   // el código para escribir a mano
      keyOk: !!k, keyProject: k ? k.project_id : '', last: lastResult,
    };
  }
  function test() {
    return send({ kind: 'done', session: 'prueba', title: 'Pixel Pal', message: '¡Funciona! Así te avisaré cuando termine Claude 🦀', tags: ['tada'], priority: 3 }, true);
  }

  return { config, set, send, event, cancel, cancelAll, status, test, build, pending: () => timers.size };
}

// ¿Es una clave de cuenta de servicio de Firebase/Google válida? (para la ventana de ajustes)
function checkKey(json) {
  try {
    const k = typeof json === 'string' ? JSON.parse(json) : json;
    if (!k || k.type !== 'service_account' || !k.project_id || !k.client_email || !/BEGIN PRIVATE KEY/.test(k.private_key || '')) return null;
    crypto.createPrivateKey(k.private_key);
    return k;
  } catch { return null; }
}

module.exports = { createPhone, checkKey, DEFAULTS };
