// 📱 Avisos al móvil con ntfy (https://ntfy.sh): app gratis para Android e iPhone, sin cuenta.
// Pal publica en un "canal" con nombre secreto y aleatorio; tu móvil, suscrito a ese canal, recibe el aviso.
// Nunca se envía lo que escribes ni tu código: solo el nombre del proyecto, el estado y el número de tareas.
const crypto = require('crypto');

const DEFAULTS = {
  on: false,                   // apagado hasta que lo actives en Ajustes
  server: 'https://ntfy.sh',
  topic: '',                   // se genera solo la primera vez
  mode: 'away',                // 'away' = solo si no estás delante del PC · 'always' = siempre
  awayMin: 3,                  // minutos sin tocar el PC para considerar que no estás
  done: true, waiting: true, error: true,
};

const newTopic = () => `pixelpal-${crypto.randomBytes(9).toString('hex')}`;
const mins = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'menos de 1 min' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

// deps: getConfig(), saveConfig(patch), idleSeconds(), isLocked(), getSession(id), fetch, now()
function createPhone(deps) {
  const now = deps.now || Date.now;
  const fetchFn = deps.fetch || fetch;
  const timers = new Map();   // sesión → comprobación diferida ("terminó y luego te fuiste")
  let lastResult = null;

  function config() {
    const c = { ...DEFAULTS, ...((deps.getConfig() || {}).phone || {}) };
    if (!c.topic) { c.topic = newTopic(); deps.saveConfig({ phone: c }); }
    return c;
  }
  function set(patch = {}) {
    const c = config();
    const p = {};
    if ('on' in patch) p.on = !!patch.on;
    if (patch.mode === 'away' || patch.mode === 'always') p.mode = patch.mode;
    if ('awayMin' in patch) p.awayMin = Math.max(1, Math.min(60, Math.round(Number(patch.awayMin) || DEFAULTS.awayMin)));
    for (const k of ['done', 'waiting', 'error']) if (k in patch) p[k] = !!patch[k];
    if (patch.newTopic) p.topic = newTopic();
    deps.saveConfig({ phone: { ...c, ...p } });
    if (p.on === false) cancelAll();
    return config();
  }
  const away = c => !!deps.isLocked() || deps.idleSeconds() >= c.awayMin * 60;
  const url = c => `${c.server.replace(/\/+$/, '')}/${c.topic}`;

  async function send(msg, force = false) {
    const c = config();
    if (!force && !c.on) return { ok: false, skipped: 'off' };
    try {
      const r = await fetchFn(c.server.replace(/\/+$/, ''), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic: c.topic, title: msg.title, message: msg.message, tags: msg.tags || [], priority: msg.priority || 3 }),
        signal: AbortSignal.timeout(8000),
      });
      lastResult = { ok: r.ok, status: r.status, at: now() };
    } catch (e) {
      lastResult = { ok: false, error: e.message, at: now() };
    }
    return lastResult;
  }

  function build(kind, s, extra = {}) {
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

  function status() { const c = config(); return { ...c, url: url(c), last: lastResult }; }
  function test() { return send({ title: 'Pixel Pal', message: '¡Funciona! Así te avisaré cuando termine Claude 🦀', tags: ['tada'], priority: 3 }, true); }

  return { config, set, send, event, cancel, cancelAll, status, test, build, pending: () => timers.size };
}

module.exports = { createPhone, DEFAULTS };
