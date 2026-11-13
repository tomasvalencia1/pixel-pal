// Controlador: estado de las sesiones -> acción de Pal, burbujas, juegos con el ratón, panel, clics y arrastre
const canvas = document.getElementById('clawd');
const caption = document.getElementById('caption');
const panel = document.getElementById('panel');
const cards = document.getElementById('cards');
// 🛑 parar por uso: configuración (llega con las preferencias) y botón de cada sesión
window.UsageStop = { on: false, scope: 'all' };
cards.addEventListener('click', async e => {
  const b = e.target.closest('[data-stop]');
  if (!b) return;
  e.stopPropagation();
  const on = await window.clawd.stopMark(b.dataset.stop);
  b.classList.toggle('on', !!on);
  Speech.say(on ? '🛑 Vale: pararé esa sesión si llega al límite de uso' : 'Vale, esa sesión puede seguir aunque llegue al límite', 2, { dur: 2600 });
}, true);
// 🪟 clic en una sesión → su ventana
cards.addEventListener('click', async e => {
  if (e.target.closest('[data-stop]')) return;
  const c = e.target.closest('.card[data-id]');
  if (!c) return;
  e.stopPropagation();
  if (!c.classList.contains('jump')) { Speech.say('Aún no sé en qué ventana está esa sesión 🤔 Escríbele algo y lo apunto', 2, { dur: 3500 }); return; }
  const r = await window.clawd.focusSession(c.dataset.id);
  if (!r.ok) Speech.say(r.reason === 'gone' ? 'Esa ventana ya no existe 🫥' : 'No pude traer esa ventana 😅', 2, { dur: 3000 });
});
const pinIcon = document.getElementById('pin');
const sitBtn = document.getElementById('sit');
const ctx = ClawdSprite.setup(canvas);

// 📏 Tamaño de Pal: el lienzo se rehace a la nueva escala (píxeles enteros, nítido) y se alinea abajo y al centro
// de su caja de 160×184, así los pies quedan en el mismo sitio (aterrizar, subirse a ventanas…). Si es más alto,
// --pal-extra sube la burbuja, la leyenda y el panel.
const SIZES = { small: 0.75, normal: 1, big: 1.2 };
let palSize = 'normal';
function applySize(size) {
  size = SIZES[size] ? size : 'normal';
  if (size === palSize) return;   // sin cambios: no se rehace el lienzo (se quedaría en blanco un instante)
  palSize = size;
  const dpr = window.devicePixelRatio || 1;
  const U = Math.max(1, Math.round(4 * dpr * SIZES[size]));
  ClawdSprite.setup(canvas, SIZES[size]);
  const w = (40 * U) / dpr, h = (46 * U) / dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.style.marginLeft = `${(160 - w) / 2}px`;
  canvas.style.marginTop = `${184 - h}px`;
  document.body.style.setProperty('--pal-extra', `${Math.max(0, Math.ceil(h - 184))}px`);
}

let state = { sessions: [], now: Date.now() };
let clockOffset = 0;
const prevStatus = new Map();
const prevDone = new Map();
const prevTotal = new Map();
const turnStart = new Map();
let initialized = false;
let prevActiveCount = 0;
let celebrateUntil = 0;
let preview = null;
let previewUntil = 0;
let demoStart = 0;
let pinned = false;
let hoverClawd = false;
let hoverPanel = false;
let hideTimer = null;
let ignoring = true;
let down = null;
let awakeUntil = 0;          // 🫨 sacudido: no se duerme hasta esta hora
const shake = { dir: 0, turns: [], last: 0 };
let look = null;
let cursor = null;       // cursor en coordenadas de la ventana
let sitting = false;
let danceOn = true;      // bailar cuando suena música

// ---------- música ----------
// Para probar: /preview?a=song:funk fuerza una canción especial durante 20 s (song:off para quitarla)
let forcedSong = null;
let forcedUntil = 0;
const forcing = () => !!forcedSong && Date.now() < forcedUntil;
const media = () => state.media || { playing: false };
// Si suena una de tus canciones/artistas especiales cuenta como música aunque el filtro de vídeo diga que no
// (p. ej. un vídeo subido por otro canal con un título sin "Official Video")
const musicOn = () => danceOn && (!!media().music || forcing() || (!!media().playing && !!matchSpecial(media())));
function songVars() {
  const m = media();
  return { song: m.song || undefined, by: m.by || undefined };
}
// Algunas canciones tienen su propio baile (tempo aproximado de cada una)
const SPECIAL_SONGS = [
  { key: 'funk', bpm: 115, test: m => /uptown funk/i.test(`${m.song} ${m.title}`) },
  { key: 'bass', bpm: 110, test: m => /another one bites the dust/i.test(`${m.song} ${m.title}`) },
  { key: 'gold', bpm: 107, test: m => /24k magic/i.test(`${m.song} ${m.title}`) },
  { key: 'two', bpm: 100, test: m => /bbno/i.test(`${m.by} ${m.artist} ${m.title}`) && /^two\b/i.test(String(m.song || '').trim()) },
  // cualquier canción del grupo: basta con que "Angine de Poitrine" aparezca en el título, la canción, el artista o el canal
  { key: 'angine', bpm: 126, test: m => /angine\s*de\s*poitrine/i.test(norm(`${m.song} ${m.by} ${m.artist} ${m.title}`)) },
  { key: 'imight', bpm: 112, test: m => /i just might/i.test(`${m.song} ${m.title}`) && /bruno mars/i.test(`${m.by} ${m.artist} ${m.title}`) },
  { key: 'billie', bpm: 117, test: m => /billie jean/i.test(`${m.song} ${m.title}`) },
  { key: 'dontstop', bpm: 78, test: m => /don'?t stop me now/i.test(`${m.song} ${m.title}`) && /queen/i.test(`${m.by} ${m.artist} ${m.title}`) },
  { key: 'burger', bpm: 120, test: m => /bbno/i.test(`${m.by} ${m.artist} ${m.title}`) && /^burger\b/i.test(String(m.song || '').trim()) },
  { key: 'standing', bpm: 88, test: m => /i'?m still standing/i.test(`${m.song} ${m.title}`) },
  { key: 'chicago', bpm: 110, test: m => /\bchicago\b/i.test(`${m.song} ${m.title}`) && /michael jackson/i.test(`${m.by} ${m.artist} ${m.title}`) },
  { key: 'thatswhat', bpm: 134, test: m => /that'?s what i like/i.test(`${m.song} ${m.title}`) },
];
const SPECIAL_KEYS = SPECIAL_SONGS.map(s => s.key);
// quita tildes para comparar nombres ("Poitriné" = "Poitrine")
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function matchSpecial(m) {
  if (!m || !m.playing) return null;
  return SPECIAL_SONGS.find(s => { try { return s.test(m); } catch { return false; } }) || null;
}
function specialSong() {
  if (forcing()) return SPECIAL_SONGS.find(s => s.key === forcedSong) || null;
  if (!danceOn) return null;
  return matchSpecial(media());
}
// Accesorios/efectos especiales: los de la canción que suena, o los de la acción en vista previa
const specialKey = (special, action) => (special ? special.key : (SPECIAL_KEYS.includes(action) ? action : null));
function songBpm() {
  const sp = specialSong();
  if (sp) return sp.bpm;
  const key = `${media().song}|${media().by}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 100 + (h % 29);  // cada canción con su "tempo" (100–128)
}
let prevMusic = false;
let prevSongKey = '';

// ---------- burbuja de diálogo ----------
const Speech = (() => {
  const el = document.getElementById('bubble');
  let cur = null;
  let lastAt = 0;
  let hideTimer = null;
  let typer = null;

  // priority: 0 comentario, 1 reacción normal, 2 importante, 3 urgente
  // opts: dur, cooldown, usage (bloque de uso), lines (lista), buttons [{label, value}] + onAnswer(value)
  function say(text, priority = 1, opts = {}) {
    if (!text) return false;
    if (window.Calm && !Calm.allows(priority)) return false;   // 🤫
    const now = Date.now();
    if (cur && now < cur.until && cur.priority > priority) return false;
    if (cur && cur.ask && now < cur.until && !opts.buttons) return false;   // no tapar una pregunta abierta
    if (priority <= 1 && now - lastAt < (opts.cooldown ?? 7000) * (window.Calm && Calm.chatty === 3 ? 0.5 : 1)) return false;
    if (cur && cur.onAnswer && !cur.answered) { cur.answered = true; cur.onAnswer(null); }
    lastAt = now;
    const ask = !!(opts.buttons && opts.buttons.length);
    const dur = opts.dur || (ask ? 15000 : Math.min(7000, 2400 + text.length * 60));
    cur = { text, until: now + dur, priority, ask, onAnswer: opts.onAnswer || null, answered: false, tag: opts.tag || null };
    const mine = cur;
    el.className = '';
    void el.offsetWidth; // reinicia la animación de aparición
    el.className = (opts.alert ? 'urgent ' : '') + (ask ? 'ask ' : '') + 'pop';
    const chars = [...text];
    let i = 0;
    el.textContent = '';
    const txt = document.createElement('span');
    el.appendChild(txt);
    if (opts.usage) el.appendChild(usageBlock(opts.usage));
    if (opts.lines) {
      const ul = document.createElement('div');
      ul.className = 'lines';
      for (const l of opts.lines) { const d = document.createElement('div'); d.textContent = l; ul.appendChild(d); }
      el.appendChild(ul);
    }
    if (ask) {
      const row = document.createElement('div');
      row.className = 'bubble-btns';
      for (const b of opts.buttons) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bubble-btn' + (b.primary ? ' primary' : '');
        btn.textContent = b.label;
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          if (mine.answered) return;
          mine.answered = true;
          if (window.Sound) Sound.play('pop');
          hide();
          if (mine.onAnswer) mine.onAnswer(b.value);
        });
        row.appendChild(btn);
      }
      el.appendChild(row);
    }
    if (window.Voice && priority >= 2) Voice.say(text);   // 🗣️ voz real (si está activada)
    clearInterval(typer);
    typer = setInterval(() => {
      i += 1;
      txt.textContent = chars.slice(0, i).join('');
      if (window.Sound && !(window.Voice && Voice.speaking()) && i % 3 === 1 && chars[i - 1] !== ' ') Sound.blip(chars[i - 1]);
      if (i >= chars.length) clearInterval(typer);
    }, 22);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (mine.onAnswer && !mine.answered) { mine.answered = true; mine.onAnswer(null); }
      hide();
    }, dur);
    return true;
  }
  function hide() { cur = null; clearInterval(typer); el.className = 'hidden'; }
  // quita la burbuja si es la de esa etiqueta (p. ej. un permiso que ya se contestó en otra parte)
  function drop(tag) { if (cur && cur.tag === tag) { cur.answered = true; clearTimeout(hideTimer); hide(); } }
  const speaking = () => !!cur && Date.now() < cur.until;
  const asking = () => !!cur && cur.ask && !cur.answered && Date.now() < cur.until;
  const sinceLast = () => Date.now() - lastAt;
  return { say, speaking, asking, sinceLast, drop };
})();
const say = (key, priority = 2, opts = {}, vars = {}) => Speech.say(Phrases.pick(key, vars), priority, opts);

// 🤫 Tranquilidad: silencio (manual, horas o Windows), cuánto habla (0 callado … 3 mucho) y menos movimiento
const Calm = {
  quiet: { on: false, reason: '', until: 0 },
  chatty: 2,
  motion: 'auto',
  reduce() { return this.motion === 'less' || (this.motion === 'auto' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); },
  // ¿puede hablar con esta prioridad? (0 comentario, 1 reacción, 2 importante, 3 urgente)
  allows(priority) {
    if (this.quiet.on) return priority >= 3;
    if (this.chatty === 0) return priority >= 3;
    if (this.chatty === 1) return priority >= 2;
    return true;
  },
  set(p) {
    if (!p) return;
    if (p.quiet) this.quiet = p.quiet;
    if (Number.isInteger(p.chatty)) this.chatty = p.chatty;
    if (p.motion) this.motion = p.motion;
    document.body.classList.toggle('quiet', !!this.quiet.on);
    document.body.classList.toggle('reduce-motion', this.reduce());
  },
};
window.Calm = Calm;

// 🗣️ Voz real opcional: lee en voz alta las burbujas importantes con la voz de Windows (en español si la hay),
// con el tono de cada personaje. Apagada por defecto (menú del clic derecho → Voz de Pal).
const Voice = (() => {
  let on = false;
  const TONE = { clawd: [1, 1.05], bolt: [0.55, 0.92], miso: [1.7, 1.1], nube: [1.35, 0.85], rin: [0.6, 0.95], chispa: [1.25, 1.15] };
  let skinId = 'clawd';
  const synth = window.speechSynthesis;
  const pickVoice = () => {
    const vs = synth ? synth.getVoices() : [];
    return vs.find(v => /^es(-|_)/i.test(v.lang) && /helena|laura|sabina|elvira|dalia|paloma/i.test(v.name)) || vs.find(v => /^es/i.test(v.lang)) || null;
  };
  function say(text) {
    if (!on || !synth || !window.Sound || !Sound.isOn()) return;
    if (window.Calm && Calm.quiet.on) return;   // voz: en silencio, nada
    // sin emojis ni símbolos (los lee raro)
    const clean = String(text).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/[~*_#<>]/g, ' ').trim();
    if (!clean) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'es-ES';
    const [pitch, rate] = TONE[skinId] || TONE.clawd;
    u.pitch = Math.min(2, pitch); u.rate = rate; u.volume = 0.9;
    synth.speak(u);
  }
  return {
    say,
    set: v => { on = !!v; if (!on && synth) synth.cancel(); },
    isOn: () => on,
    speaking: () => !!(on && synth && synth.speaking),
    setSkin: id => { skinId = TONE[id] ? id : 'clawd'; },
  };
})();
window.Voice = Voice;

// ---------- uso restante del plan (sesión de 5 h y semana) ----------
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function resetText(epochSec, weekly) {
  if (!epochSec) return '';
  const d = new Date(epochSec * 1000);
  const ms = d - Date.now();
  if (ms <= 0) return 'ya se reinició';
  if (!weekly) {
    const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
    return `se reinicia en ${h ? h + ' h ' : ''}${m} min`;
  }
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return `se reinicia el ${DAYS[d.getDay()]} ${hh}:${mm}`;
}

function usageBlock(u) {
  const box = document.createElement('div');
  box.className = 'usage';
  const rows = [['Sesión', u.five_hour, false], ['Semana', u.seven_day, true]];
  for (const [label, w, weekly] of rows) {
    if (!w || typeof w.used_percentage !== 'number') continue;
    const left = Math.max(0, Math.min(100, Math.round(100 - w.used_percentage)));
    const row = document.createElement('div');
    row.className = 'u-row';
    const name = document.createElement('span'); name.className = 'u-name'; name.textContent = label;
    const bar = document.createElement('span'); bar.className = 'u-bar';
    const fill = document.createElement('i'); fill.style.width = left + '%';
    fill.className = left < 15 ? 'low' : left < 40 ? 'mid' : '';
    bar.appendChild(fill);
    const pct = document.createElement('span'); pct.className = 'u-pct'; pct.textContent = `${left}% libre`;
    const when = document.createElement('div'); when.className = 'u-when'; when.textContent = resetText(w.resets_at, weekly);
    row.append(name, bar, pct);
    box.append(row, when);
  }
  return box;
}

// Uso válido: tiene al menos una ventana y no ha caducado
function currentUsageFrom(u) {
  if (!u) return null;
  const now = Date.now() / 1000;
  const ok = w => w && typeof w.used_percentage === 'number' && (!w.resets_at || w.resets_at > now);
  if (!ok(u.five_hour) && !ok(u.seven_day)) return null;
  return { five_hour: ok(u.five_hour) ? u.five_hour : null, seven_day: ok(u.seven_day) ? u.seven_day : null };
}

// ---------- herramienta -> acción ----------
const CATEGORIES = [
  ['planning', /TodoWrite|Task(Create|Update|List|Get)|update_plan|wrap_up/i],
  ['agent', /^Agent$|^Task$|start_session|SendMessage|hand_off|send_message/i],
  ['web', /WebFetch|WebSearch|Browser|chrome|navigate|get_page_text|read_page|tabs_|web.?fetch/i],
  ['editing', /Edit|Write|Notebook|str_replace|create_file/i],
  ['terminal', /Bash|PowerShell|terminal|shell/i],
  ['searching', /Grep|Glob|search|find|list/i],
  ['reading', /Read|view|cat/i],
];
const LABELS = {
  editing: '✏️ Escribiendo', reading: '📖 Leyendo', searching: '🔍 Buscando', terminal: '⚡ Ejecutando',
  web: '🌐 Navegando', agent: '🤖 Coordinando', planning: '📋 Planeando', tinkering: '⚙️ Usando',
};
const TOOL_ACTIONS = Object.keys(LABELS);
const PLAY_ACTIONS = ['walk', 'wave', 'peekaboo', 'highfive', 'beg', 'watch', 'hop', 'dance', 'kiss', 'stretch', 'juggle', 'whistle', 'sit'];

function toolCategory(tool) {
  for (const [cat, re] of CATEGORIES) if (re.test(tool || '')) return cat;
  return 'tinkering';
}

const FILE_RE = /\.[a-z0-9]{1,6}$/i;
function varsFor(s) {
  if (!s) return {};
  const tasks = s.tasks || [];
  return {
    // "Sin carpeta" no es un nombre: se eligen frases que no lo mencionen
    project: s.project === 'Sin carpeta' ? undefined : s.project,
    file: s.detail && FILE_RE.test(s.detail) ? s.detail : undefined,
    tool: Panel.shortTool(s.tool) || undefined,
    done: tasks.filter(t => t.status === 'completed').length,
    total: tasks.length || undefined,
  };
}

function helloKey() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'helloMorning';
  if (h >= 12 && h < 19) return Math.random() < 0.5 ? 'helloAfternoon' : 'hello';
  return 'helloNight';
}

// ---------- estado y reacciones ----------
const isActive = s => ['waiting', 'working', 'thinking'].includes(s.status);

window.clawd.onState(s => {
  const now = Date.now();
  clockOffset = now - s.now;

  const activeCount = s.sessions.filter(isActive).length;
  if (initialized && activeCount >= 2 && activeCount > prevActiveCount) Speech.say(Phrases.pick('multi', { n: activeCount }), 1, { cooldown: 3000 });
  prevActiveCount = activeCount;

  for (const sess of s.sessions) {
    const vars = varsFor(sess);
    const before = prevStatus.get(sess.id);

    if (initialized && before === undefined) {
      ClawdSprite.trigger('hello');
      if (window.Sound) Sound.play('hello');
      Speech.say(Phrases.pick(helloKey(), vars) || Phrases.pick('hello', vars), 2);
    }

    if (before !== undefined && before !== sess.status) {
      if (sess.status === 'thinking') {
        turnStart.set(sess.id, now);
        if (Math.random() < 0.7) Speech.say(Phrases.pick('thinking', vars), 1, { cooldown: 4000 });
      } else if (sess.status === 'waiting') {
        const m = /usar (.+)$/.exec(sess.message || '');
        const text = m ? Phrases.pick('waiting', { ...vars, tool: m[1] }) : Phrases.pick('waitingGeneric', vars);
        Speech.say(text, 3, { dur: 9000, alert: true });
        if (window.Sound) Sound.play('alert');
      } else if (sess.status === 'done') {
        celebrateUntil = now + 3500;
        const long = now - (turnStart.get(sess.id) || now) > 120000;
        const u = currentUsageFrom(s.usage);
        Speech.say(Phrases.pick(long ? 'doneLong' : 'done', vars), u ? 3 : 2, u ? { usage: u, dur: 8000 } : {});
        if (window.Sound) Sound.play('done');
        if (window.Extras) Extras.onDone();
        if (window.Boost) Boost.award('turn');
      }
    }

    // tareas
    const done = vars.done || 0;
    const total = (sess.tasks || []).length;
    const pd = prevDone.get(sess.id);
    const pt = prevTotal.get(sess.id) || 0;
    if (initialized && pt === 0 && total > 0) Speech.say(Phrases.pick('planNew', vars), 2);
    else if (initialized && pd !== undefined && done > pd) {
      ClawdSprite.trigger('check');
      if (window.Sound) Sound.play('ding');
      if (window.Extras) Extras.onTaskDone(done - pd);
      if (window.Boost) Boost.award('task', done - pd);
      const u = currentUsageFrom(s.usage);
      Speech.say(Phrases.pick(done === total ? 'allDone' : 'taskDone', vars), done === total ? 3 : 2, u ? { usage: u, dur: 8000 } : { dur: 2600 });
    }
    prevDone.set(sess.id, done);
    prevTotal.set(sess.id, total);
  }

  prevStatus.clear();
  s.sessions.forEach(sess => prevStatus.set(sess.id, sess.status));
  initialized = true;
  state = s;
  reactToMusic();
  renderPanel();
});

// Frases cuando empieza, cambia o se para la música
function reactToMusic() {
  const on = musicOn();
  const key = on ? `${media().song}|${media().by}` : '';
  const v = songVars();
  const sp = specialSong();
  if (on && sp && key !== prevSongKey) {
    Speech.say(Phrases.pick(`song_${sp.key}`, v), 2);               // canción con baile propio
  } else if (on && !prevMusic) {
    Speech.say(Phrases.pick('songStart', v) || Phrases.pick('songStartAnon'), 2);
  } else if (on && prevMusic && key !== prevSongKey) {
    Speech.say(Phrases.pick('songChange', v) || Phrases.pick('songStartAnon'), 2);
  } else if (!on && prevMusic && danceOn) {
    Speech.say(Phrases.pick('songStop'), 1, { cooldown: 2000 });
  }
  prevMusic = on;
  prevSongKey = key;
}

// De vez en cuando, un comentario sobre la canción
setInterval(() => {
  if (!musicOn() || Speech.sinceLast() < 40000 || Math.random() > 0.4) return;
  const working = !!workingSession();
  const sp = specialSong();
  const key = sp && Math.random() < 0.7 ? `mid_${sp.key}` : (working && Math.random() < 0.5 ? 'songWork' : 'songMid');
  Speech.say(Phrases.pick(key, songVars()), 0, { cooldown: 40000 });
}, 10000);

// Comentarios espontáneos: trabajo largo, esperas largas y ratos libres
let lastLongAt = 0;
let lastWaitNag = 0;
setInterval(() => {
  const now = Date.now();
  const waiting = state.sessions.find(s => s.status === 'waiting');
  if (waiting && now - lastWaitNag > 30000 && Speech.sinceLast() > 25000) {
    lastWaitNag = now;
    Speech.say(Phrases.pick('waitingAgain', varsFor(waiting)), 3, { dur: 5000, alert: true });
    return;
  }
  const w = workingSession();
  if (w && now - (turnStart.get(w.id) || now) > 60000 && now - lastLongAt > 90000) {
    lastLongAt = now;
    Speech.say(Phrases.pick('longWork', varsFor(w)), 1);
    return;
  }
  if ((shown === 'idle' || shown === 'sit') && Speech.sinceLast() > 4 * 60 * 1000 && Math.random() < 0.3) {
    Speech.say(Phrases.pick('idle'), 0);
  }
}, 10000);

const nowPlaying = document.getElementById('nowplaying');
// ⭕ Anillos de uso del plan (sesión de 5 h y semana): % libre, color según lo que queda
const ringsEl = document.getElementById('rings');
let ringsKey = '';
function renderRings() {
  const u = currentUsageFrom(state.usage);
  const rows = u ? [['5 h', u.five_hour, false], ['sem', u.seven_day, true]].filter(r => r[1]) : [];
  const key = rows.map(([l, w]) => `${l}:${Math.round(w.used_percentage)}`).join('|');
  ringsEl.classList.toggle('hidden', !rows.length);
  if (key === ringsKey) return;
  ringsKey = key;
  const R = 13, L = 2 * Math.PI * R;
  ringsEl.innerHTML = rows.map(([label, w, weekly]) => {
    const left = Math.max(0, Math.min(100, Math.round(100 - w.used_percentage)));
    const cls = left < 15 ? 'low' : left < 40 ? 'mid' : 'ok';
    return `<div class="ring ${cls}" title="${weekly ? 'Semana' : 'Sesión de 5 h'}: ${left}% libre · ${resetText(w.resets_at, weekly)}">
      <svg viewBox="0 0 32 32"><circle class="bg" cx="16" cy="16" r="${R}"/><circle class="fg" cx="16" cy="16" r="${R}" stroke-dasharray="${(L * left / 100).toFixed(1)} ${L.toFixed(1)}"/></svg>
      <b>${left}</b><span>${label}</span></div>`;
  }).join('');
}
ringsEl.addEventListener('click', e => { e.stopPropagation(); const u = currentUsageFrom(state.usage); if (u) Speech.say('Así va tu plan:', 2, { usage: u, dur: 7000 }); });

function renderPanel() {
  Panel.render(cards, state.sessions, Date.now() - clockOffset);
  renderRings();
  const m = media();
  if (m.playing && (m.music || matchSpecial(m))) {
    nowPlaying.className = '';
    nowPlaying.innerHTML = '';
    const icon = document.createElement('span'); icon.className = 'np-icon'; icon.textContent = danceOn ? '💃' : '🎵';
    const txt = document.createElement('span'); txt.className = 'np-text';
    txt.textContent = m.song || 'Música';
    if (m.by) { const by = document.createElement('span'); by.className = 'np-by'; by.textContent = ` — ${m.by}`; txt.appendChild(by); }
    nowPlaying.append(icon, txt);
  } else nowPlaying.className = 'hidden';
}
setInterval(() => { if (!panel.classList.contains('hidden')) renderPanel(); }, 1000);

// ---------- qué acción toca ----------
function workingSession() {
  return state.sessions.filter(s => s.status === 'working').sort((a, b) => b.lastEvent - a.lastEvent)[0];
}

function desiredAction(now) {
  if (demoStart) {
    const list = ClawdSprite.ACTIONS;
    const i = Math.floor((now - demoStart) / 3500);
    if (i < list.length) return list[i];
    demoStart = 0;
  }
  if (preview && now < previewUntil) return preview;
  const ss = state.sessions;
  if (ss.some(s => s.status === 'waiting')) return 'waiting';
  if (now < celebrateUntil) return 'celebrate';
  const w = workingSession();
  if (w) return toolCategory(w.tool);
  if (ss.some(s => s.status === 'thinking')) return 'thinking';
  const last = Math.max(0, ...ss.map(s => s.lastEvent + clockOffset));
  if (ss.length && now - last < 3 * 60 * 1000) return 'idle';
  if (now < awakeUntil) return 'idle';     // 🫨 lo sacudiste: aguanta despierto
  return 'sleeping';
}

// ---------- juegos con el ratón (solo cuando Claude no tiene nada que hacer) ----------
const rand = (a, b) => a + Math.random() * (b - a);

function rel() {
  const r = canvas.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * (32 / 46);
  if (!cursor) return { dx: 0, dy: 0, dist: 9999 };
  const dx = cursor.x - cx, dy = cursor.y - cy;
  return { dx, dy, dist: Math.hypot(dx, dy) };
}

let moveAcc = { x: 0, y: 0 };
function moveBy(dx, dy, ev) {
  moveAcc.x += dx; moveAcc.y += dy;
  const ix = Math.trunc(moveAcc.x), iy = Math.trunc(moveAcc.y);
  if (ix || iy) {
    moveAcc.x -= ix; moveAcc.y -= iy;
    window.clawd.moveBy(ix, iy);
    if (ev) ev.moved = true;
  }
}
const dirTo = r => (r.dx < 0 ? -1 : 1);

// Cada juego: can(r) = si se puede ahora; start(ev, r); update(ev, dt, r) -> false para terminar
const GAMES = {
  // 1. Perseguir el cursor
  chase: {
    weight: 3,
    can: r => r.dist > 160 && r.dist < 1100,
    start(ev) { ev.action = 'walk'; say('chase'); },
    update(ev, dt, r) {
      ev.play = { dir: dirTo(r), fast: true };
      if (r.dist < 70) { ClawdSprite.trigger('poke'); say('chaseWin'); return false; }
      if (ev.t > 7) { say('chaseLose'); return false; }
      moveBy((r.dx / r.dist) * 150 * dt, (r.dy / r.dist) * 150 * dt, ev);
      return true;
    },
  },
  // 2. Huir del cursor
  flee: {
    weight: 2,
    can: r => r.dist < 320,
    start(ev, r) { ev.action = 'walk'; ev.dir = -dirTo(r); say('flee'); },
    update(ev, dt, r) {
      ev.play = { dir: ev.dir, fast: true };
      moveBy(ev.dir * 170 * dt, (r.dy > 0 ? -1 : 1) * 30 * dt, ev);
      if (ev.t > 1.7) { if (Math.random() < 0.6) say('fleeSafe', 1, { cooldown: 0 }); return false; }
      return true;
    },
  },
  // 3. Paseo tranquilo
  stroll: {
    weight: 2,
    start(ev) { ev.action = 'walk'; ev.dir = Math.random() < 0.5 ? -1 : 1; ev.dur = rand(2, 3.5); if (Math.random() < 0.5) say('stroll', 1); },
    update(ev, dt) { ev.play = { dir: ev.dir }; moveBy(ev.dir * 45 * dt, 0, ev); return ev.t < ev.dur; },
  },
  // 4. Saludar al cursor
  wave: {
    weight: 2,
    start(ev, r) { ev.action = 'wave'; ev.play = { dir: dirTo(r) }; say('wave'); },
    update(ev, dt, r) { ev.play.dir = dirTo(r); return ev.t < 2.6; },
  },
  // 5. Cucú
  peekaboo: {
    weight: 2,
    start(ev) { ev.action = 'peekaboo'; },
    update(ev) { if (ev.t >= 2 && !ev.said) { ev.said = true; say('peek'); } return ev.t < 3.2; },
  },
  // 6. Choca esos cinco (pasa el ratón por encima)
  highfive: {
    weight: 2,
    hover: true,
    start(ev, r) { ev.action = 'highfive'; ev.play = { dir: dirTo(r) }; say('highfive', 2, { dur: 5000 }); },
    update(ev, dt, r) {
      if (!ev.play.success) {
        ev.play.dir = dirTo(r);
        if (hoverClawd) { ev.play.success = true; ev.won = ev.t; ClawdSprite.trigger('check'); say('highfiveYes', 3); }
        else if (ev.t > 6) { say('highfiveNo'); return false; }
        return true;
      }
      return ev.t - ev.won < 1.8;
    },
  },
  // 7. Pedir mimos (pasa el ratón por encima)
  beg: {
    weight: 2,
    hover: true,
    start(ev) { ev.action = 'beg'; ev.play = {}; say('beg', 2, { dur: 5500 }); },
    update(ev) {
      if (!ev.play.success) {
        if (hoverClawd) { ev.play.success = true; ev.won = ev.t; ClawdSprite.trigger('love'); say('begYes', 3); }
        else if (ev.t > 7) { say('begNo'); return false; }
        return true;
      }
      return ev.t - ev.won < 2.2;
    },
  },
  // 8. Vigilar el cursor con cara de sospecha
  watch: {
    weight: 2,
    start(ev) { ev.action = 'watch'; say('watch'); },
    update(ev) { return ev.t < 4; },
  },
  // 9. Saltitos hacia el cursor
  hop: {
    weight: 2,
    can: r => r.dist > 120 && r.dist < 900,
    start(ev) { ev.action = 'hop'; say('hop', 1); },
    update(ev, dt, r) {
      const ph = (ev.t % 0.6) / 0.6;
      ev.play = { dir: dirTo(r), hop: ph };
      if (ph > 0.15 && ph < 0.85 && r.dist > 70) moveBy((r.dx / r.dist) * 120 * dt, (r.dy / r.dist) * 120 * dt, ev);
      return ev.t < 1.8 && r.dist > 60;
    },
  },
  // 10. Bailar
  dance: {
    weight: 2,
    start(ev) { ev.action = 'dance'; say('dance'); },
    update(ev) { return ev.t < 4.5; },
  },
  // 11. Lanzar un corazón hacia el cursor
  kiss: {
    weight: 2,
    start(ev, r) { ev.action = 'kiss'; ev.play = { dir: dirTo(r) }; say('kiss'); },
    update(ev) { return ev.t < 2.5; },
  },
  // 12. Estirarse
  stretch: {
    weight: 1,
    start(ev) { ev.action = 'stretch'; say('stretch', 1); },
    update(ev) { return ev.t < 2.2; },
  },
  // 13. Malabares
  juggle: {
    weight: 2,
    start(ev) { ev.action = 'juggle'; say('juggle', 1); },
    update(ev) { return ev.t < 5; },
  },
  // 14. Silbar una canción
  whistle: {
    weight: 2,
    start(ev) { ev.action = 'whistle'; say('whistle', 1); },
    update(ev) { return ev.t < 4.5; },
  },
};

const Play = { cur: null, nextAt: Date.now() + 15000, last: null };

function startGame(name) {
  const def = GAMES[name];
  if (!def) return;
  const ev = { name, def, t: 0, action: 'idle', play: {}, moved: false };
  Play.cur = ev;
  def.start(ev, rel());
}

function endGame() {
  if (Play.cur && Play.cur.moved) window.clawd.moveEnd();
  Play.last = Play.cur ? Play.cur.name : Play.last;
  Play.cur = null;
  Play.nextAt = Date.now() + (shownBase === 'sleeping' ? rand(60000, 120000) : rand(12000, 25000));
}

let shownBase = 'sleeping';
function playTick(now, dt, base) {
  shownBase = base;
  const free = base === 'idle' || base === 'sleeping';
  const blocked = sitting || down || demoStart || (preview && now < previewUntil) || (!Play.cur && (Calm.quiet.on || Calm.reduce()));
  if (Play.cur) {
    const panelBlocks = document.body.classList.contains('panel-open') && !Play.cur.def.hover && !Play.cur.forced;
    if ((!free && !Play.cur.forced) || blocked || panelBlocks) { endGame(); return null; }
    Play.cur.t += dt;
    if (!Play.cur.def.update(Play.cur, dt, rel())) { endGame(); return null; }
    return Play.cur;
  }
  // con música no empieza juegos nuevos: está ocupado bailando
  if (!free || blocked || !cursor || musicOn() || document.body.classList.contains('panel-open')) return null;
  if (now < Play.nextAt) return null;
  const r = rel();
  const options = Object.entries(GAMES).filter(([n, g]) => n !== Play.last && (!g.can || g.can(r)));
  const totalW = options.reduce((a, [, g]) => a + g.weight, 0);
  let pickW = Math.random() * totalW;
  for (const [n, g] of options) { pickW -= g.weight; if (pickW <= 0) { startGame(n); break; } }
  return Play.cur;
}

// ---------- elegir la acción que se ve ----------
// Cada acción se muestra al menos 1,3 s, para que no parpadee entre herramientas rápidas
let shown = 'sleeping';
let shownAt = 0;
function pickAction(now, d) {
  if (d === shown) return shown;
  const testing = demoStart || (preview && now < previewUntil);
  const urgent = d === 'waiting' || d === 'celebrate' || testing || PLAY_ACTIONS.includes(d) || PLAY_ACTIONS.includes(shown);
  const calm = ['sleeping', 'idle', 'waiting', 'celebrate'].includes(shown);
  if (urgent || calm || now - shownAt > 1300) {
    const before = shown;
    shown = d;
    shownAt = now;
    if (!testing && !PLAY_ACTIONS.includes(before) && !PLAY_ACTIONS.includes(d)) reactToAction(before, d);
  }
  return shown;
}

function reactToAction(before, now) {
  if (now === 'sleeping') { Speech.say(Phrases.pick('sleep'), 1); return; }
  if (before === 'sleeping') { Speech.say(Phrases.pick('wake'), 1, { cooldown: 2000 }); return; }
  if (TOOL_ACTIONS.includes(now) && Math.random() < 0.75) {
    Speech.say(Phrases.pick(now, varsFor(workingSession())), 1, { cooldown: 8000 });
  }
}

// Leyenda: qué hace y, si hay varias sesiones activas, cuántas (sustituye al antiguo círculo rojo)
let lastCaption = '';
function setCaption(action) {
  let text = '', cls = '';
  const active = state.sessions.filter(isActive).length;
  const more = active > 1 ? ` · ${active} sesiones` : '';
  if (Speech.speaking()) text = '';
  else if (action === 'waiting') {
    const s = state.sessions.find(x => x.status === 'waiting');
    text = s ? `❗ ${s.message}${more}` : '';
    cls = 'alert';
  } else if (LABELS[action]) {
    const w = workingSession();
    const detail = w ? (action === 'tinkering' ? Panel.shortTool(w.tool) : (w.detail || Panel.shortTool(w.tool))) : '';
    text = `${LABELS[action]}${detail ? ' ' + detail : ''}${more}`;
  } else if (action === 'thinking' && active > 1) {
    text = `💭 Pensando${more}`;
  } else if (musicOn() && ['dance', 'sit', 'idle', 'sleeping'].includes(action)) {
    const m = media();
    text = `🎵 ${m.song || 'Música'}${m.by ? ' — ' + m.by : ''}`;
  }
  // 🤫 en silencio, se nota en la leyenda
  if (!text && Calm.quiet.on && !Speech.speaking()) text = Calm.quiet.reason === 'windows' ? '🤫 Windows en No molestar' : Calm.quiet.reason === 'hours' ? '🌙 Horas de silencio' : '🤫 No molestar';
  // 🍅 tiempo del pomodoro (también por encima de la canción que suena)
  if (window.Boost && !Speech.speaking() && (!text || text.startsWith('🎵')) && Boost.caption()) { text = Boost.caption(); cls = ''; }
  // 🫨 sacudido: cuánto le queda despierto (solo si no hay nada más que contar)
  if (!text && !Speech.speaking() && Date.now() < awakeUntil && !state.sessions.some(isActive)) { const s = Math.ceil((awakeUntil - Date.now()) / 1000); text = `🫨 Despierto · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  const key = cls + text;
  if (key === lastCaption) return;
  lastCaption = key;
  caption.textContent = text;
  caption.className = text ? cls : 'hidden';
}

let lastFrame = performance.now();
let frameStart = 0;
function frame(ms) {
  frameRaf = 0;
  const t0 = performance.now();
  // a 20-30 fps se usa el refresco de la pantalla saltando los que sobran (los temporizadores de Windows van a saltos de 16 ms)
  if (fpsNow >= 20 && t0 - frameStart < 1000 / fpsNow - 6) { frameRaf = requestAnimationFrame(frame); return; }
  frameStart = t0;
  const now = Date.now();
  const dt = Math.min(0.1, (ms - lastFrame) / 1000);
  lastFrame = ms;
  const base = desiredAction(now);
  const game = playTick(now, dt, base);
  let want = base;
  const music = musicOn();
  const special = specialSong();
  if (game) want = game.action;
  else if (sitting && (base === 'idle' || (music && base === 'sleeping'))) want = 'sit'; // sentado (y con música, baila sentado)
  else if (music && (base === 'idle' || base === 'sleeping')) want = special ? special.key : 'dance'; // Claude libre + música = baile (el especial si es una favorita)
  // Extras de Windows: subirse a ventanas, ausencia, teclear contigo…
  const ex = window.Extras ? Extras.frame(now, dt, want, base, !!game) : null;
  if (ex && ex.want) want = ex.want;
  if (now < awakeUntil && want === 'sleeping') want = 'idle';   // 🫨 sacudido: sigue despierto
  if (now < pet.until && !game) want = 'kiss';                   // 💕 te lanza un beso
  // ⭐ desde el nivel 10, Pal tiene un aura de destellos dorados (más a más nivel)
  if (window.Boost && Boost.level && want !== 'sleeping') {
    const lv = Boost.level();
    if (lv >= 10 && Math.random() < dt * Math.min(1.2, 0.25 + (lv - 10) * 0.05)) ClawdSprite.api.spawn({ x: 6 + Math.random() * 28, y: 12 + Math.random() * 22, vx: (Math.random() - 0.5) * 6, vy: -18, c: Math.random() < 0.5 ? '#FFE680' : '#FFFFFF', life: 0.8 });
  }
  if (window.Boost && !game) want = Boost.want(want);   // 🍅 pomodoro: sentado y concentrado / estirándose
  const action = pickAction(now, want);
  ClawdSprite.draw(ctx, ms / 1000, action, {
    look, dragging: !!(down && down.moved), sitting, play: ex && ex.play ? ex.play : (game ? game.play : null),
    groove: music ? { bpm: songBpm() } : null,
    // con el fedora de Chicago o la máscara de Angine de Poitrine no cabe otro sombrero
    wear: ex ? (['chicago', 'angine'].includes(specialKey(special, action)) ? { ...ex.wear, hat: null } : ex.wear) : null,
    tired: ex ? ex.tired : false,
    special: specialKey(special, action),
  });
  setCaption(demoStart || (preview && now < previewUntil) ? '' : action);
  scheduleFrame(fpsFor(action, game, ex, music, now));
}
let frameTimer = 0, frameRaf = 0;
frameRaf = requestAnimationFrame(frame);

// ⚡ Ahorro: a 4 px por píxel, 30 fps se ven igual de suaves que 60. Trabajando, 20 (el pixel art clásico va a 8-12);
// tranquilo, 15; durmiendo, 5. Si lo tocas, lo arrastras, juegas, suena música o se mueve por la pantalla, 30 al momento.
const CALM_FPS = { sleeping: 5, idle: 15, sit: 15 };
const WORK_FPS = 20;
let fpsNow = 30;
function fpsFor(action, game, ex, music, now) {
  if (down || game || (ex && ex.play) || music || Play.cur || demoStart || (preview && now < previewUntil)) return 30;
  if (hoverClawd || hoverPanel || !panel.classList.contains('hidden')) return 30;
  return CALM_FPS[action] || WORK_FPS;
}
// Un único "siguiente fotograma" pendiente (temporizador o rAF): nunca hay dos bucles a la vez
function queueFrame(wait) {
  clearTimeout(frameTimer); cancelAnimationFrame(frameRaf);
  frameTimer = 0; frameRaf = 0;
  if (wait <= 4) frameRaf = requestAnimationFrame(frame);
  else frameTimer = setTimeout(() => { frameTimer = 0; frame(performance.now()); }, wait);
}
function scheduleFrame(fps) {
  fpsNow = fps;
  // ventana oculta: casi nada (1 fps) hasta que vuelva a verse
  if (document.hidden) fpsNow = fps = 1;
  if (fps >= 20) queueFrame(0);
  else queueFrame(1000 / fps - (performance.now() - frameStart));
}
// en cuanto pasa algo (ratón encima, un evento de Claude…), el siguiente fotograma no espera
function wakeFrames() { if (fpsNow < 30) { fpsNow = 30; queueFrame(0); } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeFrames(); });

// ---------- "Quédate sentado" ----------
function setSitting(v, speak = true) {
  sitting = !!v;
  Panel.tile(sitBtn, '🪑', sitting ? 'Sentado ✓' : 'Sentado');
  sitBtn.title = sitting ? 'Clic para que vuelva a moverse' : 'Quedarse quieto en su sitio';
  sitBtn.classList.toggle('on', sitting);
  if (sitting && Play.cur) endGame();
  if (speak) say(sitting ? 'sitOn' : 'sitOff', 2, { dur: 2200 });
}
sitBtn.addEventListener('click', e => {
  e.stopPropagation();
  setSitting(!sitting);
  window.clawd.savePref({ sit: sitting });
});
window.clawd.onPrefs(p => applyPrefs(p, false));
function applyPrefs(p, speak) {
  if (!p) return;
  Calm.set(p);
  if (p.usageStop) { window.UsageStop = p.usageStop; renderPanel(); }
  if ('size' in p) applySize(p.size);
  if ('sit' in p) setSitting(!!p.sit, speak && p.sit !== sitting);
  if ('dance' in p) setDance(p.dance !== false, false);
  if (window.Extras) Extras.setPrefs(p);
}

// ---------- 🎵 bailar con música ----------
const danceBtn = document.getElementById('dance');
function setDance(v, speak = true) {
  danceOn = !!v;
  danceBtn.classList.toggle('on', danceOn);
  danceBtn.title = danceOn ? 'Bailando con la música (clic para desactivar)' : 'No baila con la música (clic para activar)';
  if (speak) say(danceOn ? 'danceOn' : 'danceOff', 2, { dur: 2200 });
  prevMusic = musicOn();
  renderPanel();
}
danceBtn.addEventListener('click', e => {
  e.stopPropagation();
  setDance(!danceOn);
  window.clawd.savePref({ dance: danceOn });
});

// ---------- posición adaptable ----------
window.clawd.onLayout(l => {
  document.body.classList.toggle('flip-v', !!l.down);
  document.body.classList.toggle('flip-h', !!l.left);
});

// ---------- panel: hover / fijar ----------
function updatePanel() {
  // en "choca esos cinco", "mimos" o si Pal te está preguntando algo, el panel no estorba
  const hoverGame = (Play.cur && Play.cur.def.hover) || Speech.asking();
  // con la conversación abierta el panel no aparece
  const show = !(window.Talk && Talk.isOpen()) && (pinned || ((hoverClawd && !hoverGame || hoverPanel) && !(down && down.moved)));
  pinIcon.classList.toggle('on', pinned);
  clearTimeout(hideTimer);
  if (show) { if (panel.classList.contains('hidden')) renderPanel(); panel.classList.remove('hidden'); document.body.classList.add('panel-open'); wakeFrames(); }
  else {
    hideTimer = setTimeout(() => {
      panel.classList.add('hidden');
      document.body.classList.remove('panel-open');
    }, 350);
  }
}

// ---------- clics que atraviesan las zonas transparentes ----------
function onClawdPixel(x, y) {
  const r = canvas.getBoundingClientRect();
  return ClawdSprite.isOpaque(x - r.left, y - r.top, r.width, r.height);
}

function hitTest(x, y, inside = true) {
  const el = inside ? document.elementFromPoint(x, y) : null;
  const panelOpen = !panel.classList.contains('hidden');
  const onClawd = !!(el && el.closest('#clawd')) && onClawdPixel(x, y);
  const onPanel = !!(el && el.closest('#panel')) && panelOpen;
  const onBtn = !!(el && el.closest('.bubble-btn'));
  const onTalk = !!(el && el.closest('#talk')) && !!window.Talk && Talk.isOpen();
  const hit = onClawd || onPanel || onBtn || onTalk;
  if (!down && hit === ignoring) { ignoring = !hit; window.clawd.setIgnore(!hit); }
  if (onClawd !== hoverClawd || onPanel !== hoverPanel) {
    hoverClawd = onClawd;
    hoverPanel = onPanel;
    canvas.style.cursor = onClawd ? 'grab' : 'default';
    if (onClawd || onPanel) wakeFrames();
    updatePanel();
  }
}

document.addEventListener('mousemove', e => { if (!down) hitTest(e.clientX, e.clientY); petTrack(e.screenX); });

// 💕 Acariciar: con el ratón encima de Pal, muévelo de lado a lado (4 cambios de sentido en 2,5 s, sin hacer clic)
const pet = { dir: 0, last: null, turns: [], cool: 0, until: 0 };
function petTrack(x) {
  if (!hoverClawd || down || (Play.cur && Play.cur.def.hover) || (window.Extras && Extras.flying && Extras.flying())) { pet.last = null; pet.dir = 0; pet.turns = []; return; }
  if (pet.last === null) { pet.last = x; return; }
  const dx = x - pet.last;
  if (Math.abs(dx) < 3) return;
  pet.last = x;
  const dir = Math.sign(dx), now = Date.now();
  if (dir === pet.dir) return;
  if (pet.dir) pet.turns.push(now);
  pet.dir = dir;
  pet.turns = pet.turns.filter(t => now - t < 2500);
  if (pet.turns.length >= 4 && now > pet.cool) { pet.turns = []; onPetted(); }
}
function onPetted() {
  pet.cool = Date.now() + 12000;
  ClawdSprite.trigger('love');
  if (window.Sound) Sound.play('hello');
  const asleep = desiredAction(Date.now()) === 'sleeping';
  if (!asleep) pet.until = Date.now() + 2200;          // lanza un beso
  Speech.say(Phrases.pick(asleep ? 'petSleep' : 'petted'), 2, { dur: 2600 });
}
window.clawd.onCursor(p => {
  cursor = { x: p.x, y: p.y };
  // Pal sigue el cursor con la mirada (coordenadas en píxeles de la rejilla del sprite)
  const r = canvas.getBoundingClientRect();
  look = { x: ((p.x - r.left) / r.width) * 40, y: ((p.y - r.top) / r.height) * 46 };
  if (!down) hitTest(p.x, p.y, p.inside);
  petTrack(p.x);
});

// ---------- arrastrar, tocar y hacer clic en Pal ----------
canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !hoverClawd) return;
  if (Play.cur && Play.cur.def.hover) return; // en esos juegos basta con pasar por encima
  canvas.setPointerCapture(e.pointerId);
  down = { x: e.screenX, y: e.screenY, moved: false, samples: [] };
  window.clawd.dragStart(e.screenX, e.screenY);
});
canvas.addEventListener('pointermove', e => {
  if (!down) return;
  if (!down.moved && Math.abs(e.screenX - down.x) + Math.abs(e.screenY - down.y) > 4) {
    down.moved = true;
    updatePanel();
    Speech.say(Phrases.pick('drag'), 2, { dur: 1600 });
  }
  if (down.moved) {
    window.clawd.dragMove(e.screenX, e.screenY);
    // 🤾 últimas posiciones para saber con qué velocidad lo sueltas
    down.samples.push([e.screenX, e.screenY, performance.now()]);
    if (down.samples.length > 8) down.samples.shift();
    // 🫨 ¿lo estás sacudiendo? (4 cambios de sentido en 1,5 s)
    const dx = e.screenX - shake.last;
    shake.last = e.screenX;
    const dir = dx > 6 ? 1 : dx < -6 ? -1 : 0;
    const now = Date.now();
    if (dir && dir !== shake.dir) {
      if (shake.dir) shake.turns.push(now);
      shake.dir = dir;
      shake.turns = shake.turns.filter(t => now - t < 1500);
      if (shake.turns.length >= 4) { shake.turns = []; onShaken(); }
    }
  }
});
function onShaken() {
  const first = Date.now() > awakeUntil;
  awakeUntil = Date.now() + 5 * 60000;
  if (!first) return;
  ClawdSprite.trigger('poke');
  if (window.Sound) Sound.play('hello');
  Speech.say(Phrases.pick('shaken'), 3, { dur: 3500 });
}
// Velocidad al soltar (px/s) con las posiciones de los últimos ~100 ms; si te paraste antes de soltar, no hay lanzamiento
function releaseVelocity(samples) {
  if (!samples || samples.length < 2) return null;
  const last = samples[samples.length - 1];
  if (performance.now() - last[2] > 90) return null;
  let first = samples[0];
  for (const p of samples) if (last[2] - p[2] <= 100) { first = p; break; }
  const dt = (last[2] - first[2]) / 1000;
  if (dt < 0.015) return null;
  return [(last[0] - first[0]) / dt, (last[1] - first[1]) / dt];
}
function endDrag() {
  if (!down) return;
  window.clawd.dragEnd();
  const moved = down.moved;
  const v = releaseVelocity(down.samples);
  down = null;
  if (moved) {
    if (window.Extras) Extras.onDragged();
    // soltado con fuerza: ¡sale volando!
    if (v && !Calm.reduce() && Math.hypot(v[0], v[1]) > 750 && window.Extras && Extras.throwPal(v[0], v[1])) { updatePanel(); return; }
    if (Math.random() < 0.6) Speech.say(Phrases.pick('drop'), 2, { dur: 2000 });
  } else {
    ClawdSprite.trigger('poke');
    if (window.Sound) Sound.play('pop');
    pinned = !pinned;
    if (!pinned) Speech.say(Phrases.pick('poke'), 2, { dur: 1800 });
  }
  updatePanel();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', e => { e.preventDefault(); window.clawd.contextMenu(); });

// ---------- 🙈 Ocultar (vuelve con Ctrl+Alt+C o con el icono de la bandeja) ----------
document.getElementById('hidebtn').addEventListener('click', e => {
  e.stopPropagation();
  pinned = false;
  hoverClawd = hoverPanel = false;
  panel.classList.add('hidden');
  document.body.classList.remove('panel-open');
  window.clawd.hideByUser();
});

// ---------- ⚙️ ajustes y 📖 tutorial ----------
document.getElementById('settingsbtn').addEventListener('click', e => { e.stopPropagation(); window.clawd.openUi('settings'); });
document.getElementById('tutorialbtn').addEventListener('click', e => { e.stopPropagation(); window.clawd.openUi('tutorial'); });
document.getElementById('dndbtn').addEventListener('click', e => { e.stopPropagation(); window.clawd.dnd(Calm.quiet.on && Calm.quiet.reason === 'manual' ? 'off' : 'hour'); });
document.getElementById('restartbtn').addEventListener('click', e => { e.stopPropagation(); Speech.say('¡Vuelvo en un segundo! 🔄', 3, { dur: 1500 }); setTimeout(() => window.clawd.restart(), 600); });

// ✋ Claude pide permiso: Permitir / Denegar / Ver (si no contestas, sale el diálogo de siempre)
window.clawd.onCommand(c => {
  if (c && c.openGift && window.Boost) Boost.openGift();
  if (c && c.quiet) { Calm.set({ quiet: c.quiet }); if (c.quiet.on && c.quiet.reason === 'manual') Speech.say('🤫 Vale, me quedo calladito', 3, { dur: 2000 }); }
  if (c && c.perm) {
    const p = c.perm;
    const what = p.detail ? `${p.tool}: ${p.detail}` : p.tool || 'una herramienta';
    const buttons = [{ label: '✅ Permitir', value: 'allow', primary: true }, { label: '❌ Denegar', value: 'deny' }];
    if (p.canJump) buttons.push({ label: '↗ Ver', value: 'pass' });
    ClawdSprite.trigger('poke');
    if (window.Sound) Sound.play('alert');
    Speech.say(`✋ ${p.project} quiere usar ${what}`, 3, {
      alert: true, buttons, tag: p.id, dur: p.ms,
      onAnswer: v => { if (v) window.clawd.permAnswer(p.id, v); },
    });
  } else if (c && c.permDone) Speech.drop(c.permDone);
  if (c && c.usageStop) {
    const u = c.usageStop;
    ClawdSprite.trigger('oops');
    if (window.Sound) Sound.play('alert');
    Speech.say(`🛑 Paré ${u.project}: ${u.kind === 'five' ? 'la sesión de 5 h' : 'la semana'} va por el ${u.pct}% (tu límite: ${u.limit}%)`, 3, {
      alert: true, dur: 15000,
      buttons: [{ label: 'Dejarla seguir', value: 'go' }, { label: 'Vale 👍', value: 'ok', primary: true }],
      onAnswer: v => { if (v === 'go') window.clawd.stopAllow(u.id).then(() => Speech.say(`Vale, ${u.project} puede seguir hasta que se reinicie el límite`, 2, { dur: 3000 })); },
    });
  }
});
window.clawd.onCommand(c => {
  if (c === 'toggle-pin') { pinned = !pinned; updatePanel(); }
  else if (c === 'shown') {
    hoverClawd = hoverPanel = false;
    updatePanel();
    Speech.say('¡Aquí estoy de nuevo! 👋', 2, { dur: 2200 });
  }
  else if (c === 'demo') demoStart = Date.now();
  else if (c && typeof c.sit === 'boolean') setSitting(c.sit);
  else if (c && typeof c.dance === 'boolean') setDance(c.dance);
  else if (c && c.prefs) applyPrefs(c.prefs, false);
  else if (c && c.dev && window.Extras) Extras.onDev(c);
  else if (c && c.summary && window.Extras) Extras.onSummary(c.summary);
  else if (c && c.say) Speech.say(c.say, 2);
  else if (c && c.preview) {
    if (c.preview.startsWith('song:')) {             // forzar una canción especial: /preview?a=song:funk
      const k = c.preview.slice(5);
      forcedSong = k === 'off' ? null : k;
      forcedUntil = Date.now() + 20000;
    } else if (c.preview.startsWith('c:') || c.preview.startsWith('t:')) {   // personajes (characters.js) y hablar (talk.js)
    } else if (c.preview.startsWith('b:')) {         // pomodoro, niveles, recordatorios: /preview?a=b:pomo
      if (window.Boost) Boost.preview(c.preview.slice(2));
    } else if (c.preview.startsWith('x:')) {         // probar un extra de Windows: /preview?a=x:summary
      if (window.Extras) Extras.preview(c.preview.slice(2));
    } else if (c.preview.startsWith('play:')) {      // probar un juego: /preview?a=play:chase
      if (Play.cur) endGame();
      startGame(c.preview.slice(5));
      if (Play.cur) Play.cur.forced = true;
    } else if (c.preview === 'usage') {             // probar la burbuja de uso
      const now = Date.now() / 1000;
      const u = currentUsageFrom(state.usage) || { five_hour: { used_percentage: 23.5, resets_at: now + 7800 }, seven_day: { used_percentage: 41.2, resets_at: now + 3 * 86400 } };
      Speech.say(Phrases.pick('taskDone', { done: 3, total: 5 }), 3, { usage: u, dur: 8000 });
    } else if (c.preview === 'sit-on' || c.preview === 'sit-off') {
      setSitting(c.preview === 'sit-on');
      window.clawd.savePref({ sit: sitting });
    } else if (c.preview === 'shake') onShaken();
    else if (['check', 'hello', 'poke', 'love'].includes(c.preview)) ClawdSprite.trigger(c.preview);
    else { preview = c.preview; previewUntil = Date.now() + (c.ms || 8000); }
  }
});
