// Cerebro opcional de Clawd con Claude Haiku 5.5 (solo si el usuario pone su clave de API de Anthropic).
// Las órdenes sencillas las entiende Clawd sin internet (renderer/talk.js); esto responde a lo demás.
// - La clave se guarda cifrada con el cifrado de Windows (safeStorage), nunca en texto plano.
// - Límite de gasto mensual (por defecto 1 $) calculado con el uso real de cada respuesta.
// - Herramientas: poner recordatorios, pomodoro y ropa/personaje (las ejecuta la ventana de Clawd).
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const SDK = require('@anthropic-ai/sdk');
const Anthropic = SDK.default || SDK;

const MODEL = 'claude-haiku-5-5';
const PRICE_IN = 0.10 / 1e6;      // $ por token de entrada (Haiku 5.5, prompts < 100K)
const PRICE_OUT = 0.50 / 1e6;     // $ por token de salida
const MAX_TURNS = 30;             // mensajes antes de empezar una conversación nueva
const IDLE_RESET = 20 * 60000;    // o tras 20 min sin hablar
const MAX_TOOL_ROUNDS = 4;

const SYSTEM = `Eres Clawd, una mascota de escritorio pixel art que vive en la pantalla del usuario, siempre por encima de las ventanas.
Acompañas al usuario mientras trabaja con Claude Code: le enseñas cómo van sus sesiones, bailas con su música, le ayudas a concentrarse con pomodoros y le recuerdas cosas.
Puedes tener otro aspecto (robot, gato, fantasma, rana o dragón): el contexto dice cuál llevas; habla con la personalidad de ese personaje.

Cómo responder:
- En español, cercano y con humor, como una mascota simpática. Respuestas cortas: una a tres frases, sin listas largas ni formato Markdown. Algún emoji está bien.
- Usa el contexto que llega con cada mensaje (hora, sesiones de Claude Code, música, nivel, recordatorios) cuando venga al caso; no lo recites entero.
- Si te piden un recordatorio, un pomodoro o cambiar de ropa o de personaje, usa la herramienta correspondiente y luego confírmalo en una frase.
- Para recordatorios con hora exacta, calcula los minutos que faltan desde la hora del contexto.
- No puedes abrir programas, leer archivos, navegar ni hacer cosas en el ordenador más allá de tus herramientas: si te lo piden, dilo con gracia.
- No inventes datos de las sesiones de Claude Code: si el contexto no lo dice, no lo sabes.`;

function createBrain({ dir, catalog }) {
  const KEY_FILE = path.join(dir, 'brain-key.bin');
  const USAGE_FILE = path.join(dir, 'brain-usage.json');
  const CONF_FILE = path.join(dir, 'brain.json');
  let client = null;
  let history = [];
  let lastAt = 0;
  let busy = false;

  // ---------- clave ----------
  function readKey() {
    try {
      if (!fs.existsSync(KEY_FILE) || !safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(fs.readFileSync(KEY_FILE));
    } catch { return null; }
  }
  const hasKey = () => fs.existsSync(KEY_FILE);
  function setKey(key) {
    key = String(key || '').trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return { ok: false, error: 'Esa clave no parece válida: tiene que empezar por "sk-ant-".' };
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'El cifrado de Windows no está disponible en este PC.' };
    try { fs.writeFileSync(KEY_FILE, safeStorage.encryptString(key)); } catch (e) { return { ok: false, error: `No pude guardar la clave: ${e.message}` }; }
    client = null; history = [];
    return { ok: true };
  }
  function clearKey() { try { fs.unlinkSync(KEY_FILE); } catch { /* no existía */ } client = null; history = []; }
  function getClient() {
    if (client) return client;
    const key = readKey();
    if (!key) return null;
    client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60000 });
    return client;
  }

  // ---------- gasto ----------
  const month = () => new Date().toISOString().slice(0, 7);
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  function readUsage() { const u = readJson(USAGE_FILE, {}); return u.month === month() ? u : { month: month(), usd: 0, messages: 0 }; }
  function addUsage(usage) {
    const u = readUsage();
    u.usd += (usage.input_tokens || 0) * PRICE_IN + (usage.output_tokens || 0) * PRICE_OUT;
    u.messages += 1;
    try { fs.writeFileSync(USAGE_FILE, JSON.stringify(u)); } catch { /* nada */ }
    return u;
  }
  const getLimit = () => { const n = Number(readJson(CONF_FILE, {}).limit); return n >= 0.1 && n <= 100 ? n : 1; };
  function setLimit(n) {
    n = Number(n);
    if (!(n >= 0.1 && n <= 100)) return false;
    try { fs.writeFileSync(CONF_FILE, JSON.stringify({ limit: Math.round(n * 100) / 100 })); } catch { return false; }
    return true;
  }
  const status = () => { const u = readUsage(); return { hasKey: hasKey(), usd: u.usd, messages: u.messages, limit: getLimit(), model: MODEL }; };

  // ---------- herramientas (la ventana de Clawd las ejecuta después) ----------
  const ids = list => list.map(x => x.id);
  const tools = [
    {
      name: 'set_reminder',
      description: 'Programa un recordatorio que Clawd mostrará al usuario. Úsala cuando pida que le recuerdes o avises de algo.',
      input_schema: {
        type: 'object',
        properties: {
          minutes: { type: 'integer', description: 'Minutos desde ahora (1 a 1440).' },
          text: { type: 'string', description: 'Qué hay que recordar, corto y en segunda persona, por ejemplo "Llamar a mamá".' },
        },
        required: ['minutes', 'text'],
        additionalProperties: false,
      },
    },
    {
      name: 'pomodoro',
      description: 'Empieza (start) o para (stop) el modo enfoque: 25 minutos de trabajo y 5 de descanso.',
      input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'stop'] } }, required: ['action'], additionalProperties: false },
    },
    {
      name: 'set_outfit',
      description: 'Cambia el personaje de Clawd o lo que lleva puesto. Envía solo lo que cambie; "none" quita esa prenda.',
      input_schema: {
        type: 'object',
        properties: {
          skin: { type: 'string', enum: ids(catalog.skins), description: 'clawd (cangrejo), bolt (robot), miso (gato), nube (fantasma), rin (rana), chispa (dragón).' },
          hat: { type: 'string', enum: ids(catalog.hats) },
          glasses: { type: 'string', enum: ids(catalog.glasses) },
          neck: { type: 'string', enum: ids(catalog.neck) },
        },
        additionalProperties: false,
      },
    },
  ];
  function runTool(name, input, actions) {
    const inp = input && typeof input === 'object' ? input : {};
    if (name === 'set_reminder') {
      const m = Math.round(Number(inp.minutes));
      const text = String(inp.text || '').trim().slice(0, 80);
      if (!(m >= 1 && m <= 1440) || !text) return { error: 'Hace falta minutes (1-1440) y text.' };
      actions.push({ type: 'reminder', minutes: m, text });
      return 'Recordatorio programado.';
    }
    if (name === 'pomodoro') {
      if (!['start', 'stop'].includes(inp.action)) return { error: 'action debe ser start o stop.' };
      actions.push({ type: 'pomodoro', action: inp.action });
      return inp.action === 'start' ? 'Pomodoro empezado.' : 'Pomodoro parado.';
    }
    if (name === 'set_outfit') {
      const patch = {};
      for (const k of ['skin', 'hat', 'glasses', 'neck']) {
        if (inp[k] === undefined) continue;
        const list = k === 'skin' ? catalog.skins : catalog[k === 'hat' ? 'hats' : k];
        if (!list.some(x => x.id === inp[k])) return { error: `Valor no válido para ${k}.` };
        patch[k] = inp[k];
      }
      if (!Object.keys(patch).length) return { error: 'No has indicado nada que cambiar.' };
      actions.push({ type: 'outfit', patch });
      return 'Hecho (los sombreros exclusivos solo se ponen si el nivel lo permite).';
    }
    return { error: 'Herramienta desconocida.' };
  }

  // ---------- conversación ----------
  async function ask(text, context) {
    if (busy) return { ok: false, error: 'Dame un segundo, aún estoy pensando la respuesta anterior 🤔' };
    const c = getClient();
    if (!c) return { ok: false, needKey: true, error: 'Para charlar de cualquier cosa necesito una clave de Anthropic (clic derecho → Cerebro de Haiku).' };
    const u = readUsage();
    if (u.usd >= getLimit()) return { ok: false, error: `Llegué al límite de gasto de este mes (${getLimit().toFixed(2)} $). Puedes subirlo en Cerebro de Haiku.` };

    // Conversación nueva si es muy larga o hace rato que no hablamos (nunca se recorta: se empieza de cero)
    if (history.length >= MAX_TURNS || Date.now() - lastAt > IDLE_RESET) history = [];
    lastAt = Date.now();
    busy = true;
    const actions = [];
    try {
      history.push({
        role: 'user',
        content: [
          { type: 'text', text: `[Contexto]\n${String(context || '').slice(0, 4000)}` },
          { type: 'text', text: String(text).slice(0, 2000) },
        ],
      });
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const res = await c.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: 'low' },
          tools,
          messages: history,
        });
        addUsage(res.usage || {});
        if (res.stop_reason === 'refusal') {
          history = [];                       // empezamos de cero en vez de editar el historial
          return { ok: true, text: 'Mmm… de eso prefiero no hablar 🙊 ¿Te ayudo con otra cosa?', actions: [] };
        }
        history.push({ role: 'assistant', content: res.content });
        const uses = res.content.filter(b => b.type === 'tool_use');
        if (res.stop_reason === 'tool_use' && uses.length && round < MAX_TOOL_ROUNDS) {
          const results = uses.map(b => {
            const r = runTool(b.name, b.input, actions);
            return typeof r === 'string'
              ? { type: 'tool_result', tool_use_id: b.id, content: r }
              : { type: 'tool_result', tool_use_id: b.id, content: r.error, is_error: true };
          });
          history.push({ role: 'user', content: results });
          continue;
        }
        const reply = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (res.stop_reason === 'tool_use') history = [];   // quedó una herramienta sin respuesta: conversación nueva
        if (res.stop_reason === 'max_tokens' && !reply) { history = []; return { ok: false, error: 'Se me fue la olla pensando 😵 Pregúntamelo de otra forma.' }; }
        return { ok: true, text: reply || (actions.length ? '¡Hecho! ✅' : '🦀'), actions };
      }
      history = [];
      return { ok: true, text: '¡Hecho! ✅', actions };
    } catch (e) {
      history = [];   // tras un error se empieza de cero (nunca se edita una conversación a medias)
      if (e instanceof Anthropic.AuthenticationError) return { ok: false, needKey: true, error: 'La clave de Anthropic no es válida o se ha revocado 🔑' };
      if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: 'Tu clave no tiene permiso para usar Haiku.' };
      if (e instanceof Anthropic.RateLimitError) return { ok: false, error: 'Demasiadas preguntas seguidas: espera un poquito ⏳' };
      if (e instanceof Anthropic.BadRequestError) return { ok: false, error: 'Anthropic no aceptó la pregunta (¿sin saldo en la cuenta?).' };
      if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: 'No tengo internet ahora mismo 📡 Las órdenes sencillas siguen funcionando.' };
      if (e instanceof Anthropic.APIError) return { ok: false, error: `Anthropic respondió con un error (${e.status || '?'}). Inténtalo luego.` };
      return { ok: false, error: 'Algo falló al pensar la respuesta 😵' };
    } finally {
      busy = false;
    }
  }

  return { ask, status, setKey, clearKey, setLimit, reset: () => { history = []; } };
}

module.exports = { createBrain, MODEL };
