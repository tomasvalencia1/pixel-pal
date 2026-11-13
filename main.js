// Pixel Pal — proceso principal de Electron
// - Ventana transparente, sin bordes y SIEMPRE en primer plano
// - Servidor local (127.0.0.1, puerto 7777 en la edición personal y 7778 en la compartida) que recibe los eventos de los hooks de Claude Code
// - Estado de todas las sesiones y sus tareas
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, Notification, clipboard, globalShortcut, powerMonitor } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
// Edición (personal o compartida): carpeta de datos, puerto, colores… Va antes que hooks.js
const ED = require('./edition');
const hooks = require('./hooks').create();
// Las ventanas reciben la edición para dibujar a Pal con sus colores
const EDITION_ARG = [`--pal-edition=${ED.name}`];

// Carpeta de datos (CLAWD_HOME permite probar sin tocar una instalación real)
const DIR = process.env.CLAWD_HOME || ED.dataDir;
fs.mkdirSync(DIR, { recursive: true });
// Los datos internos de Electron van dentro de la misma carpeta (también aísla la "instancia única")
if (ED.ownUserData || process.env.CLAWD_HOME) app.setPath('userData', path.join(DIR, 'app-data'));
// Archivos que no pueden ir dentro del paquete .asar (PowerShell necesita leerlos del disco)
const UNPACKED = __dirname.replace(/app\.asar$/, 'app.asar.unpacked');
const STATE_FILE = path.join(DIR, 'state.json');
const CONFIG_FILE = path.join(DIR, 'config.json');
const PENDING_FILE = path.join(DIR, 'pending.jsonl');
const LOG_FILE = path.join(DIR, 'events.log');
const WIN_W = 340;
const WIN_H = 600;   // alto de la ventana (deja sitio al panel para ver varias sesiones)
const STALE_MS = 30 * 60 * 1000;

// ---------- clave secreta compartida con el hook ----------
// Sin ella, cualquier página web o programa podría hablar con Pal por 127.0.0.1 (puerto local).
const TOKEN_FILE = path.join(DIR, 'token');
function ensureToken() {
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { /* no existe */ }
  const t = require('crypto').randomBytes(24).toString('hex');
  try { fs.writeFileSync(TOKEN_FILE, t, { flag: 'wx' }); return t; }
  catch { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); }  // la creó el hook a la vez
}
const TOKEN = ensureToken();
// Las páginas web siempre mandan "Origin"; el hook y los scripts locales, no.
const authorized = req => !req.headers.origin && req.headers['x-clawd-token'] === TOKEN;

let win = null;
let lastCursorKey = '', lastCursorAt = 0;   // última posición del cursor enviada a la ventana
let tray = null;
let serverError = null;
const sessions = new Map();

// ---------- utilidades de archivos ----------
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return fallback; }
}
function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { console.error(e); }
}
let config = readJson(CONFIG_FILE, {});
function saveConfig(patch) { config = { ...config, ...patch }; writeJson(CONFIG_FILE, config); }
// ⚡ Pal es una ventanita transparente de pixel art: dibujada sin aceleración por hardware gasta menos CPU y RAM
// (medido: tranquilo 0,6 % frente a 0,8 %; trabajando 2,5 % frente a 3,1 %; ~55 MB menos). "gpu": true en config.json la reactiva.
if (!(config.gpu === true || process.env.PAL_GPU === '1')) app.disableHardwareAcceleration();

// 📱 Avisos al móvil (ntfy): cuando Claude termina, pide permiso o se detiene y tú no estás delante del PC
const { createPhone, checkKey } = require('./phone');
// clave de la cuenta de servicio de Firebase (para la app propia); solo se guarda aquí, nunca se envía
const FIREBASE_KEY_FILE = path.join(DIR, 'firebase-key.json');
// APK de la app para el móvil (se crea al compilar android/; ver README)
const APK_FILE = path.join(__dirname, 'dist', 'Pixel-Pal-Avisos.apk');
const phone = createPhone({
  readKey: () => readJson(FIREBASE_KEY_FILE, null),
  look: () => ({ outfit: getOutfit(), edition: ED.name }),   // así el móvil dibuja a Pal igual que en el PC
  pcName: os.hostname(),
  getConfig: () => config,
  saveConfig,
  idleSeconds: () => { try { return powerMonitor.getSystemIdleTime(); } catch { return 0; } },
  isLocked: () => { try { return powerMonitor.getSystemIdleState(1) === 'locked'; } catch { return false; } },
  getSession: id => sessions.get(id),
});
// Puerto del servidor local (CLAWD_PORT para pruebas)
const PORT = Number(process.env.CLAWD_PORT) || Number(config.port) || ED.port;

// Registro de eventos para depurar: desactivado salvo que config.json tenga "debugLog": true.
// Nunca guarda lo que el usuario escribe ni las salidas completas de las herramientas.
function logEvent(ev) {
  if (!config.debugLog) return;
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
    const safe = { ...ev, prompt: undefined, tool_response: undefined, last_assistant_message: undefined };
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${JSON.stringify(safe)}\n`);
  } catch { /* nada */ }
}

// ---------- estado de sesiones ----------
function projectName(cwd) {
  if (!cwd) return 'Sesión';
  if (/scratch-workspaces/i.test(cwd)) return 'Sin carpeta';
  return path.basename(cwd.replace(/[\\/]+$/, '')) || cwd;
}

function normStatus(s) {
  s = String(s || '').toLowerCase();
  if (['completed', 'complete', 'done'].includes(s)) return 'completed';
  if (['in_progress', 'in-progress', 'active', 'running'].includes(s)) return 'in_progress';
  return 'pending';
}

function parseMaybe(x) {
  if (typeof x === 'string') { try { return JSON.parse(x); } catch { return x; } }
  return x;
}

const TASK_TOOL = /TodoWrite|TaskCreate|TaskUpdate|update_plan|wrap_up/;

function applyTasks(s, tool, input, response) {
  input = parseMaybe(input) || {};
  response = parseMaybe(response) || {};
  if (/TodoWrite/.test(tool) && Array.isArray(input.todos)) {
    s.tasks = input.todos.map(t => ({ content: t.content || t.activeForm || '', status: normStatus(t.status) }));
  } else if (/update_plan/.test(tool)) {
    if (Array.isArray(input.items)) {
      s.tasks = input.items.map(t => ({ content: t.content || '', status: normStatus(t.status) }));
    } else {
      if (input.advance) {
        const i = s.tasks.findIndex(t => t.status === 'in_progress');
        if (i >= 0) s.tasks[i].status = 'completed';
        const n = s.tasks.findIndex(t => t.status === 'pending');
        if (n >= 0) s.tasks[n].status = 'in_progress';
      }
      if (Array.isArray(input.done)) input.done.forEach(k => { if (s.tasks[k - 1]) s.tasks[k - 1].status = 'completed'; });
      if (typeof input.start === 'number' && s.tasks[input.start - 1]) s.tasks[input.start - 1].status = 'in_progress';
    }
  } else if (/wrap_up/.test(tool)) {
    s.tasks.forEach(t => { t.status = 'completed'; });
  } else if (/TaskCreate/.test(tool)) {
    const r = response.task || response;
    const id = r.id ?? r.taskId ?? input.id ?? String(s.tasks.length + 1);
    s.tasks.push({ id: String(id), content: input.subject || input.title || input.content || input.description || 'Tarea', status: 'pending' });
  } else if (/TaskUpdate/.test(tool)) {
    const id = String(input.taskId ?? input.id ?? '');
    const idx = s.tasks.findIndex(t => String(t.id) === id);
    if (idx >= 0) {
      if (input.status === 'deleted') s.tasks.splice(idx, 1);
      else {
        if (input.status) s.tasks[idx].status = normStatus(input.status);
        if (input.subject) s.tasks[idx].content = input.subject;
      }
    }
  }
}

// Tapa cosas que parecen claves o tokens antes de mostrarlas en la leyenda o el panel
function maskSecrets(s) {
  return String(s)
    .replace(/\b(sk|pk|rk|ghp|gho|github_pat|xox[abprs]|AKIA|AIza)[-_A-Za-z0-9]{8,}/g, '•••')
    .replace(/(token|key|secret|password|passwd|pwd|auth)(\s*[=:]\s*|\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1$2•••')
    .replace(/[A-Za-z0-9_\-+/]{32,}={0,2}/g, '•••');
}

function toolDetail(input) {
  input = parseMaybe(input);
  if (!input || typeof input !== 'object') return '';
  if (input.file_path) return path.basename(String(input.file_path));
  if (input.command) return maskSecrets(String(input.command)).slice(0, 40);
  if (input.pattern) return String(input.pattern).slice(0, 30);
  if (input.url) return String(input.url).replace(/^https?:\/\//, '').slice(0, 30);
  if (input.description) return String(input.description).slice(0, 40);
  return '';
}

function translate(msg) {
  let m = msg.match(/needs your permission to use (.+)$/i);
  if (m) return `Necesita tu permiso para usar ${m[1]}`;
  if (/waiting for your input/i.test(msg)) return 'Esperando tu respuesta';
  if (/needs your attention|needs your approval/i.test(msg)) return 'Necesita tu atención';
  return msg || 'Necesita tu atención';
}

function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
  } catch { /* nada */ }
}

// ¿Hay que (re)averiguar en qué ventana está esta sesión? Al empezar, al escribirle, o si aún no se sabe (cada 2 min)
function needsWindow(ev) {
  if (!ev.session_id || !watchUsesExe) return false;
  const name = ev.hook_event_name;
  if (name === 'SessionEnd') return false;
  if (name === 'SessionStart' || name === 'UserPromptSubmit') return true;
  const s = sessions.get(ev.session_id);
  return !s || (!s.win && Date.now() - (s.winCheckedAt || 0) > 120000);
}

// ---------- 🛑 Parar sesiones por uso ----------
// Cuando el uso de la sesión de 5 h o de la semana llega al % que elijas, Pal responde al siguiente evento de esa
// sesión con «continue: false» (Claude se para y te dice por qué) o bloquea el mensaje nuevo. Todas o solo las marcadas.
const usageStopCfg = () => ({ on: false, five: 90, week: 95, scope: 'all', ...(config.usageStop || {}) });
function usageOver(now = Date.now()) {
  const c = usageStopCfg();
  const u = usage || {};
  const live = w => w && typeof w.used_percentage === 'number' && (!w.resets_at || w.resets_at * 1000 > now);
  if (c.five > 0 && live(u.five_hour) && u.five_hour.used_percentage >= c.five) return { kind: 'five', pct: Math.round(u.five_hour.used_percentage), limit: c.five, resets: u.five_hour.resets_at ? u.five_hour.resets_at * 1000 : now + 3600000 };
  if (c.week > 0 && live(u.seven_day) && u.seven_day.used_percentage >= c.week) return { kind: 'week', pct: Math.round(u.seven_day.used_percentage), limit: c.week, resets: u.seven_day.resets_at ? u.seven_day.resets_at * 1000 : now + 86400000 };
  return null;
}
function stopVerdict(s, now = Date.now()) {
  const c = usageStopCfg();
  if (!c.on || !s) return null;
  if (c.scope === 'marked' && !s.stopMark) return null;
  if ((s.stopAllowUntil || 0) > now) return null;          // le dijiste «déjala seguir»
  const o = usageOver(now);
  if (!o) return null;
  const what = o.kind === 'five' ? 'la sesión de 5 h' : 'la semana';
  return { ...o, msg: `🛑 Pixel Pal paró esta sesión: ${what} va por el ${o.pct}% de uso (tu límite: ${o.limit}%). Puedes dejarla seguir desde Pal.` };
}
// Respuesta para Claude Code según el evento
function stopReply(name, v) {
  if (name === 'UserPromptSubmit') return { decision: 'block', reason: v.msg };
  const out = { continue: false, stopReason: v.msg };
  if (name === 'PreToolUse') out.hookSpecificOutput = { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: v.msg };
  return out;
}
function announceStop(s, v) {
  if (s.stopSaidFor === v.resets) return;                  // una vez por sesión y periodo
  s.stopSaidFor = v.resets;
  sendCommand({ usageStop: { id: s.id, project: s.project, kind: v.kind, pct: v.pct, limit: v.limit } });
  phone.event('error', s, { limit: true });
}

// ---------- 🤫 No molestar ----------
// Pal se calla (sin burbujas salvo lo urgente, sin sonidos, sin juegos) si: lo activas a mano, estás en tus horas de
// silencio, o Windows está en No molestar / presentación / juego a pantalla completa (si lo respetas).
const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function quietHoursNow(d = new Date()) {
  const q = config.quietHours;
  if (!q || !q.on) return null;
  const now = d.getHours() * 60 + d.getMinutes(), a = hm(q.from), b = hm(q.to);
  const inside = a <= b ? now >= a && now < b : now >= a || now < b;
  if (!inside) return null;
  const end = new Date(d); end.setHours(Math.floor(b / 60), b % 60, 0, 0);
  if (end <= d) end.setDate(end.getDate() + 1);
  return end.getTime();
}
function computeQuiet(now = Date.now()) {
  const u = Number(config.dndUntil) || 0;
  if (u === -1) return { on: true, reason: 'manual', until: 0 };
  if (u > now) return { on: true, reason: 'manual', until: u };
  const h = quietHoursNow(new Date(now));
  if (h) return { on: true, reason: 'hours', until: h };
  if (config.respectFocus !== false && [3, 4, 6].includes(winNotif)) return { on: true, reason: 'windows', until: 0 };
  return { on: false, reason: '', until: 0 };
}
let quiet = { on: false, reason: '', until: 0 };
function updateQuiet() {
  const q = computeQuiet();
  if (q.on === quiet.on && q.reason === quiet.reason && q.until === quiet.until) return;
  quiet = q;
  sendCommand({ quiet });
  if (uiWin && !uiWin.isDestroyed()) uiWin.webContents.send('ui-refresh');
}
setInterval(updateQuiet, 20000);
// «Hasta mañana»: a las 8:00 (o al final de tus horas de silencio si terminan más tarde)
function untilTomorrow() {
  const d = new Date(); d.setDate(d.getDate() + (d.getHours() >= 8 ? 1 : 0)); d.setHours(8, 0, 0, 0);
  return d.getTime();
}
function setDnd(v) {
  saveConfig({ dndUntil: v === 'hour' ? Date.now() + 3600000 : v === 'tomorrow' ? untilTomorrow() : v === 'forever' ? -1 : 0 });
  updateQuiet();
}

// ---------- ✋ permisos desde Pal ----------
// Claude Code pregunta (hook PermissionRequest) y espera: Pal enseña Permitir / Denegar / Ver.
// Si ya estás mirando la ventana de esa sesión, Pal no se mete; si no contestas a tiempo, sale el diálogo de siempre.
const pendingPerms = new Map();   // id → { sessionId, res, timer }
let permSeq = 0;
const permWaitMs = () => Math.max(0, Math.min(120, Number(config.permWait ?? 20))) * 1000;
function permAnswer(id, decision) {
  const p = pendingPerms.get(id);
  if (!p) return false;
  pendingPerms.delete(id);
  clearTimeout(p.timer);
  let out = '';
  if (decision === 'allow') out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  else if (decision === 'deny') out = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'Denegado desde Pixel Pal' } } });
  try { p.res.writeHead(200, { 'content-type': 'application/json' }); p.res.end(out); } catch { /* conexión cerrada */ }
  sendCommand({ permDone: id });
  if (decision === 'allow' || decision === 'deny') bump(decision === 'allow' ? 'permAllow' : 'permDeny');
  return true;
}
// otro evento de la misma sesión = ya contestaste en la terminal o en la app
function releasePerms(sessionId) {
  for (const [id, p] of pendingPerms) if (p.sessionId === sessionId) permAnswer(id, 'pass');
}
function onPermission(ev, res) {
  const s = sessions.get(ev.session_id);
  const wait = permWaitMs();
  const looking = s && s.win && fgWindow && Number(s.win.hwnd) === fgWindow;
  if (config.permApprove === false || !wait || looking || !win || win.isDestroyed()) { res.writeHead(200); return res.end(''); }
  const id = `p${++permSeq}`;
  const detail = toolDetail(ev.tool_input);
  const p = { sessionId: ev.session_id, res, timer: setTimeout(() => permAnswer(id, 'pass'), wait) };
  pendingPerms.set(id, p);
  res.on('close', () => { if (pendingPerms.get(id) === p) { pendingPerms.delete(id); clearTimeout(p.timer); sendCommand({ permDone: id }); } });
  sendCommand({ perm: { id, project: s ? s.project : projectName(ev.cwd), tool: ev.tool_name || '', detail, canJump: !!(s && s.win), sessionId: ev.session_id, ms: wait } });
}

function handleEvent(ev) {
  if (!ev || !ev.session_id) return;
  logEvent(ev);
  const now = Date.now();
  const name = ev.hook_event_name;
  if (name === 'SessionEnd') { phone.cancel(ev.session_id); sessions.delete(ev.session_id); changed(); return; }

  let s = sessions.get(ev.session_id);
  if (!s) {
    s = { id: ev.session_id, cwd: ev.cwd || '', project: projectName(ev.cwd), status: 'idle', tool: '', detail: '', message: '', tasks: [], startedAt: now, lastEvent: now, prompt: '' };
    sessions.set(ev.session_id, s);
    bump('sessions');
  }
  if (ev.cwd) { s.cwd = ev.cwd; s.project = projectName(ev.cwd); }
  s.lastEvent = now;
  const prev = s.status;
  if (name !== 'PermissionRequest' && name !== 'Notification' && pendingPerms.size) releasePerms(ev.session_id);

  switch (name) {
    case 'SessionStart':
      if (ev.source === 'clear') s.tasks = [];
      s.status = 'idle';
      break;
    case 'UserPromptSubmit':
      s.status = 'thinking';
      s.message = '';
      s.turnAt = now;
      phone.cancel(s.id);   // ya estás respondiendo: nada que avisar
      break;
    case 'PreToolUse':
      s.status = 'working';
      s.tool = ev.tool_name || '';
      s.detail = toolDetail(ev.tool_input);
      s.message = '';
      break;
    case 'PostToolUse': {
      s.status = 'working';
      if (TASK_TOOL.test(ev.tool_name || '')) {
        const before = s.tasks.filter(t => t.status === 'completed').length;
        applyTasks(s, ev.tool_name, ev.tool_input, ev.tool_response);
        const after = s.tasks.filter(t => t.status === 'completed').length;
        if (after > before) bump('tasks', after - before);
      }
      if (/Bash|PowerShell/i.test(ev.tool_name || '')) analyzeTerminal(s, ev.tool_input, ev.tool_response);
      break;
    }
    case 'StopFailure':
      // Claude se detuvo por un error; si es por límite de uso, Pal lo cuenta
      if (ev.error === 'rate_limit') {
        s.status = 'limited';
        s.message = 'Límite de uso alcanzado';
        sendCommand({ dev: 'limit', project: s.project });
      } else {
        s.status = 'done';
      }
      phone.event('error', s, { limit: ev.error === 'rate_limit' });
      break;
    case 'PermissionRequest':
      s.status = 'waiting';
      s.message = `Quiere usar ${ev.tool_name || 'una herramienta'}${toolDetail(ev.tool_input) ? ': ' + toolDetail(ev.tool_input) : ''}`;
      break;
    case 'Notification':
      // El aviso de "esperando tu respuesta" tras terminar no cuenta como urgencia
      if (prev === 'done' || prev === 'idle') break;
      s.status = 'waiting';
      s.message = translate(String(ev.message || ''));
      break;
    case 'Stop':
      s.status = 'done';
      s.doneAt = now;
      phone.event('done', s, { ms: s.turnAt ? now - s.turnAt : 0 });
      if (s.turnAt) { bump('workMs', now - s.turnAt); s.turnAt = 0; }
      break;
    default:
      break;
  }

  if (s.status === 'waiting' && prev !== 'waiting') {
    s.waitingSince = now;
    if (config.notifications !== false && !quiet.on) notify(`Pal · ${s.project}`, s.message);
    phone.event('waiting', s);
  }
  changed();
}

// ---------- estadísticas del día (para el resumen al cerrar Claude) ----------
const STATS_FILE = path.join(DIR, 'stats.json');
const today = () => new Date().toLocaleDateString('sv');
let stats = readJson(STATS_FILE, null);
function st() {
  if (!stats || stats.date !== today()) stats = { date: today(), tasks: 0, sessions: 0, workMs: 0, commits: 0, pushes: 0, testsPass: 0, testsFail: 0, musicMin: 0, songs: [] };
  return stats;
}
let statsTimer = null;
function bump(key, n = 1) {
  st()[key] = (st()[key] || 0) + n;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(() => writeJson(STATS_FILE, stats), 1000);
}

function sendCommand(c) { if (win && !win.isDestroyed()) win.webContents.send('command', c); }

// Commits, push y tests a partir de los comandos de terminal que ejecuta Claude
const TEST_CMD = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bpytest\b|\bjest\b|\bvitest\b|\bgo\s+test\b|\bcargo\s+test\b|\bdotnet\s+test\b|\bmvn\b.*\btest\b|\bgradlew?\b.*\btest\b|\bphpunit\b|\brspec\b/i;
function analyzeTerminal(s, input, response) {
  input = parseMaybe(input) || {};
  response = parseMaybe(response) || {};
  const cmd = String(input.command || '');
  // los hooks envían el evento completo: se mira solo el final de la salida
  const raw = typeof response === 'string' ? response : `${response.stdout || ''}\n${response.stderr || ''}`;
  const out = String(response.tail || raw).slice(-600);
  if (/\bgit\s+commit\b/.test(cmd) && !/nothing to commit|nada para hacer commit|fatal|error:/i.test(out)) { bump('commits'); sendCommand({ dev: 'commit', project: s.project }); }
  if (/\bgit\s+push\b/.test(cmd) && !/rejected|rechazad|fatal|error:/i.test(out)) { bump('pushes'); sendCommand({ dev: 'push', project: s.project }); }
  if (TEST_CMD.test(cmd)) {
    const failed = /\b[1-9]\d*\s+(failed|failing)\b|\bFAIL(ED)?\b|AssertionError|✗|✕/i.test(out);
    const passed = /\b\d+\s+(passed|passing)\b|\bTests?:\s+\d+\s+passed|\bOK\s*\(\d+|✓|√/i.test(out);
    if (failed) { bump('testsFail'); sendCommand({ dev: 'testFail', project: s.project }); }
    else if (passed) { bump('testsPass'); sendCommand({ dev: 'testPass', project: s.project }); }
  }
}

let saveTimer = null;
function changed() {
  if (win && !win.isDestroyed()) win.webContents.send('state', snapshot());
  if (sessWin && !sessWin.isDestroyed()) sessWin.webContents.send('sess-data', sessData());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJson(STATE_FILE, [...sessions.values()]), 500);
}

// ---------- música que suena en el PC (panel multimedia de Windows) ----------
const { spawn } = require('child_process');
const MUSIC_APPS = /spotify|music|zune|deezer|tidal|amazon|itunes|foobar|aimp|musicbee|winamp|soundcloud|vlc/i;
const BROWSERS = /chrome|msedge|edge|firefox|brave|opera|vivaldi|arc|browser/i;
const MUSIC_HINTS = /official\s*(music\s*)?(video|audio|visualizer)|lyric|letra|audio oficial|video ?oficial|videoclip|\bft\.|feat\.|remix|\bmv\b|vevo|- topic|en vivo|live at|acoustic|ac[uú]stico|cover/i;
let media = null;
let mediaChild = null;

function cleanSong(raw) {
  let title = String(raw.title || '');
  let artist = String(raw.artist || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').replace(/\s+Official$/i, '').trim();
  title = title.replace(/[([][^)\]]*(official|video|audio|lyric|letra|4k|hd|remaster|visualizer|clip|oficial)[^)\]]*[)\]]/gi, '');
  title = title.replace(/\|.*$/, '').trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
  if (m && (!artist || m[1].toLowerCase().includes(artist.toLowerCase()) || artist.toLowerCase().includes(m[1].toLowerCase()))) {
    artist = m[1].trim(); title = m[2].trim();
  }
  return { song: title.slice(0, 48), by: artist.slice(0, 32) };
}

function isMusic(m) {
  if (!m.playing) return false;
  if (config.musicAll) return true;
  if (BROWSERS.test(m.app)) return !!m.album || MUSIC_HINTS.test(`${m.title} ${m.artist}`);
  return MUSIC_APPS.test(m.app);
}

function setMedia(raw) {
  const next = raw.playing ? { playing: true, app: raw.app, title: raw.title, artist: raw.artist, album: raw.album, ...cleanSong(raw) } : { playing: false };
  next.music = isMusic(raw);
  if (JSON.stringify(next) === JSON.stringify(media)) return;
  media = next;
  changed();
}
let lastMediaRaw = { playing: false };

// ---------- vigilante de Windows (scripts/system-watch.exe, o system-watch.ps1 si no se puede) ----------
let claudeOn = null;
function sendSys(o) { if (win && !win.isDestroyed()) win.webContents.send('sys', o); }
function toDip(r) { try { return screen.screenToDipRect(null, r); } catch { return r; } }

function onSys(m) {
  switch (m.t) {
    case 'notif':
      winNotif = Number(m.s) || 0;
      updateQuiet();
      break;
    case 'who':
    case 'focus': {
      const cb = watchWait.get(m.req);
      if (cb) { watchWait.delete(m.req); cb(m); }
      break;
    }
    case 'media':
      lastMediaRaw = m;
      setMedia(m);
      break;
    case 'fg': {
      fgWindow = Number(m.id) || 0;
      const rect = toDip({ x: m.x, y: m.y, width: m.w, height: m.h });
      const work = screen.getDisplayMatching(rect).workArea;
      sendSys({ fg: { id: m.id, app: String(m.app || '').toLowerCase(), title: String(m.title || ''), shell: !!m.shell, full: !!m.full, max: !!m.max, min: !!m.min, rect, work } });
      break;
    }
    case 'idle': sendSys({ idle: m.s }); break;
    case 'type': sendSys({ type: m.n }); break;
    case 'clip':
      // captura de pantalla = imagen nueva en el portapapeles + ImpPnt o herramienta de recortes
      if (m.shot && clipboard.availableFormats().some(f => /image/i.test(f))) sendSys({ photo: Date.now() });
      break;
    case 'track': {
      const rect = toDip({ x: m.x, y: m.y, width: m.w, height: m.h });
      const work = screen.getDisplayMatching(rect).workArea;
      sendSys({ track: { id: m.id, exists: !!m.exists, min: !!m.min, max: !!m.max, rect, work } });
      break;
    }
    case 'bat': sendSys({ bat: { has: !!m.has, pct: m.pct, ac: !!m.ac } }); break;
    case 'claude':
      if (claudeOn === true && m.on === false) sendCommand({ summary: { ...st() } }); // se cerró la app de Claude
      claudeOn = m.on;
      break;
    default: break;
  }
}

// ⚡ Se usa la versión compilada (system-watch.exe, ~10 MB) y, si falla o no está, la de PowerShell (~100 MB).
let watchExeFailed = false;
let watchUsesExe = false;
let fgWindow = 0;
let winNotif = 0;           // estado de avisos de Windows (3 juego, 4 presentación, 6 No molestar)           // ventana activa ahora mismo (la manda el vigilante)   // solo la versión compilada entiende órdenes (who / focus)
// 🪟 Preguntas al vigilante: "who" (qué ventana hay detrás de una conexión) y "focus" (traer una ventana al frente)
let watchReq = 0;
const watchWait = new Map();
function watchAsk(cmd, timeout = 600) {
  return new Promise(resolve => {
    if (!mediaChild || !watchUsesExe || !mediaChild.stdin || !mediaChild.stdin.writable) return resolve(null);
    const id = `q${++watchReq}`;
    const t = setTimeout(() => { watchWait.delete(id); resolve(null); }, timeout);
    watchWait.set(id, r => { clearTimeout(t); resolve(r); });
    try { mediaChild.stdin.write(`${cmd.replace('{id}', id)}\n`); } catch { clearTimeout(t); watchWait.delete(id); resolve(null); }
  });
}
// Nombre corto del programa de la ventana
function appLabel(exe) {
  const e = String(exe || '').toLowerCase();
  if (e === 'windowsterminal.exe') return 'Terminal';
  if (e === 'code.exe' || e === 'code - insiders.exe') return 'VS Code';
  if (e === 'cursor.exe') return 'Cursor';
  if (e === 'claude.exe') return 'Claude';
  if (/^(cmd|powershell|pwsh|conhost|openconsole|bash|wsl)\.exe$/.test(e)) return 'Consola';
  if (/^idea|^pycharm|^webstorm|^rider/.test(e)) return 'JetBrains';
  return e.replace(/\.exe$/, '') || 'Ventana';
}
function startSystemWatch() {
  try { fs.writeFileSync(path.join(DIR, 'track.txt'), '0'); } catch { /* nada */ }
  const env = { ...process.env, CLAWD_TRACK: path.join(DIR, 'track.txt') };
  const exe = path.join(UNPACKED, 'scripts', 'system-watch.exe');
  const useExe = !watchExeFailed && process.env.PAL_WATCH !== 'ps1' && fs.existsSync(exe);
  watchUsesExe = useExe;
  const startedAt = Date.now();
  let gotData = false;
  try {
    mediaChild = useExe
      ? spawn(exe, [], { windowsHide: true, env })
      : spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(UNPACKED, 'scripts', 'system-watch.ps1')], { windowsHide: true, env });
  } catch { if (useExe) { watchExeFailed = true; return startSystemWatch(); } return; }
  // si el .exe no arranca (bloqueado por un antivirus, sin .NET…), se pasa a PowerShell para siempre en esta sesión
  let ended = false;
  const child = mediaChild;
  const restart = wait => { if (ended) return; ended = true; if (mediaChild === child) mediaChild = null; if (!app.isQuitting) setTimeout(startSystemWatch, wait); };
  child.on('error', () => { if (useExe) watchExeFailed = true; restart(1000); });
  child.on('exit', () => { if (useExe && !gotData && Date.now() - startedAt < 15000) watchExeFailed = true; restart(watchExeFailed && useExe ? 1000 : 10000); });
  mediaChild.stdout.once('data', () => { gotData = true; });
  let buf = '';
  mediaChild.stdout.setEncoding('utf8');
  mediaChild.stdout.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const lineTxt = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      try { onSys(JSON.parse(lineTxt)); } catch { /* línea no JSON */ }
    }
  });
}
app.on('before-quit', () => { app.isQuitting = true; if (mediaChild) mediaChild.kill(); });
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* nada */ } });

// minutos de música y canciones del día
setInterval(() => {
  if (media && media.music) {
    bump('musicMin');
    const name = media.song ? `${media.song}${media.by ? ' — ' + media.by : ''}` : '';
    if (name && !st().songs.includes(name) && st().songs.length < 50) st().songs.push(name);
  }
}, 60000);

// ---------- uso del plan (sesión de 5 h y semana) ----------
const USAGE_FILE = path.join(DIR, 'usage.json');
let usage = readJson(USAGE_FILE, null);
function setUsage(u) {
  if (!u || (!u.five_hour && !u.seven_day)) return;
  usage = { five_hour: u.five_hour || null, seven_day: u.seven_day || null, at: u.at || Date.now() };
  changed();
}
// La línea de estado también escribe el archivo; por si la app estaba cerrada cuando llegó el dato
try { fs.watchFile(USAGE_FILE, { interval: 5000 }, () => { const u = readJson(USAGE_FILE, null); if (u && (!usage || u.at > usage.at)) setUsage(u); }); } catch { /* nada */ }

const ORDER = { waiting: 0, working: 1, thinking: 2, limited: 3, idle: 4, done: 5 };
function snapshot() {
  return {
    now: Date.now(),
    usage,
    media,
    sessions: [...sessions.values()].sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (b.lastEvent - a.lastEvent)),
  };
}

function pruneStale() {
  const now = Date.now();
  let dirty = false;
  for (const [id, s] of sessions) {
    const limit = ['done', 'idle', 'limited'].includes(s.status) ? STALE_MS : STALE_MS * 2;
    if (now - s.lastEvent > limit) { sessions.delete(id); dirty = true; }
  }
  if (dirty) changed();
}

function loadState() {
  const saved = readJson(STATE_FILE, []);
  const now = Date.now();
  for (const s of Array.isArray(saved) ? saved : []) {
    if (s && s.id && now - s.lastEvent < STALE_MS) sessions.set(s.id, s);
  }
  // Eventos que llegaron mientras la app arrancaba
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const lines = fs.readFileSync(PENDING_FILE, 'utf8').split('\n').filter(Boolean);
      fs.unlinkSync(PENDING_FILE);
      for (const l of lines) { try { handleEvent(JSON.parse(l)); } catch { /* línea rota */ } }
    }
  } catch { /* nada */ }
}

// ---------- servidor local ----------
function startServer() {
  const server = http.createServer((req, res) => {
    // /ping es lo único abierto (el hook lo usa para saber si Pal está despierto)
    if (req.method === 'GET' && req.url === '/ping') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, app: 'clawd', visible: !!(win && !win.isDestroyed() && win.isVisible()), bounds: win && !win.isDestroyed() ? win.getBounds() : null }));
    }
    // todo lo demás exige la clave secreta y no acepta peticiones de páginas web
    if (!authorized(req)) { res.writeHead(403); return res.end(); }
    if (req.method === 'GET' && req.url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(snapshot(), null, 2));
    }
    // Vista previa de una animación: /preview?a=editing  (también check, hello)
    if (req.method === 'GET' && req.url.startsWith('/preview')) {
      const a = new URL(req.url, 'http://x').searchParams.get('a') || '';
      const sayText = new URL(req.url, 'http://x').searchParams.get('say');
      if (win && !win.isDestroyed()) {
        if (sayText) win.webContents.send('command', { say: sayText });
        else if (a === 'pin') win.webContents.send('command', 'toggle-pin');
        else win.webContents.send('command', a === 'demo' ? 'demo' : { preview: a });
      }
      res.writeHead(204); return res.end();
    }
    // Mover a Pal (para pruebas): /move?x=100&y=50  (coordenadas del dibujo en pantalla)
    if (req.method === 'GET' && req.url.startsWith('/move')) {
      const q = new URL(req.url, 'http://x').searchParams;
      anchor = clampAnchor([Number(q.get('x')) || 0, Number(q.get('y')) || 0]);
      applyLayout();
      saveConfig({ anchor, pos: null });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ anchor, layout, bounds: win.getBounds() }));
    }
    // Línea de estado de Claude Code: recibe el JSON (con rate_limits) y devuelve el texto a mostrar
    if (req.method === 'POST' && req.url === '/statusline') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        const parts = ['🦀'];
        try {
          const rl = JSON.parse(body.replace(/^﻿/, '')).rate_limits || {};
          if (rl.five_hour || rl.seven_day) {
            setUsage({ five_hour: rl.five_hour || null, seven_day: rl.seven_day || null, at: Date.now() });
            writeJson(USAGE_FILE, usage);
          }
          if (rl.five_hour && typeof rl.five_hour.used_percentage === 'number') parts.push(`sesión ${Math.round(100 - rl.five_hour.used_percentage)}% libre`);
          if (rl.seven_day && typeof rl.seven_day.used_percentage === 'number') parts.push(`semana ${Math.round(100 - rl.seven_day.used_percentage)}% libre`);
        } catch { /* json roto */ }
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(parts.join(' · '));
      });
      return;
    }
    // Uso del plan ya resumido (lo envía hooks/clawd-statusline.js de la edición personal)
    if (req.method === 'POST' && req.url === '/usage') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
      req.on('end', () => {
        try { setUsage(JSON.parse(body.replace(/^\uFEFF/, ''))); } catch { /* json roto */ }
        res.writeHead(204); res.end();
      });
      return;
    }
    // ✋ Claude Code pide permiso: se responde cuando decidas (o al pasar el tiempo, vacío = diálogo de siempre)
    if (req.method === 'POST' && req.url === '/permission') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
      req.on('end', () => {
        let ev = null;
        try { ev = JSON.parse(body.replace(/^\uFEFF/, '')); } catch { /* json roto */ }
        if (!ev || !ev.session_id) { res.writeHead(200); return res.end(''); }
        ev.hook_event_name = 'PermissionRequest';
        try { handleEvent(ev); } catch { /* nada */ }
        onPermission(ev, res);
      });
      return;
    }
    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
      req.on('end', () => {
        let ev = null;
        try { ev = JSON.parse(body.replace(/^\uFEFF/, '')); } catch { /* json roto */ }
        const finish = () => {
          try { if (ev) handleEvent(ev); } catch { /* nada */ }
          // 🛑 ¿hay que parar esta sesión por uso?
          const name = ev && ev.hook_event_name;
          if (ev && ['PreToolUse', 'PostToolUse', 'UserPromptSubmit'].includes(name)) {
            const s = sessions.get(ev.session_id);
            const v = stopVerdict(s);
            if (v) {
              s.status = 'limited';
              s.message = `Parada por Pal: ${v.kind === 'five' ? '5 h' : 'semana'} al ${v.pct}%`;
              changed();
              announceStop(s, v);
              res.writeHead(200, { 'content-type': 'application/json' });
              return res.end(JSON.stringify(stopReply(name, v)));
            }
          }
          res.writeHead(204); res.end();
        };
        if (!ev || !needsWindow(ev)) return finish();
        const s0 = sessions.get(ev.session_id);
        if (s0) s0.winCheckedAt = Date.now();
        const hint = projectName(ev.cwd).replace(/[\r\n]/g, ' ').slice(0, 60);
        watchAsk(`who {id} ${req.socket.remotePort} ${PORT} ${hint}`).then(r => {
          finish();
          const s = sessions.get(ev.session_id);
          if (!s) return;
          s.winCheckedAt = Date.now();
          if (r && r.hwnd) { s.win = { hwnd: r.hwnd, app: appLabel(r.app), title: String(r.title || '').slice(0, 120) }; changed(); }
        });
      });
      return;
    }
    res.writeHead(404); res.end();
  });
  server.on('error', e => {
    console.error('Servidor Pal:', e.message);
    if (e.code === 'EADDRINUSE') serverError = `El puerto ${PORT} está ocupado por otro programa: Pal no recibirá los eventos de Claude Code.`;
  });
  server.listen(PORT, '127.0.0.1');
}

// ---------- icono de bandeja (pixel art 16x16 generado en código) ----------
function trayIcon() {
  const rows = [
    '.......Y........',
    '.......S........',
    '.......S........',
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '.OOOOKOOOOKOOOO.',
    '.OOOOKOOOOKOOOO.',
    '...OOOOOOOOOO...',
    '...OOOOOOOOOO...',
    '...SSSSSSSSSS...',
    '....S.S..S.S....',
    '....S.S..S.S....',
    '................',
    '................',
    '................',
    '................',
  ];
  // colores de la edición (orden BGR); la personal no lleva antena
  const colors = ED.tray.colors;
  if (!ED.tray.antenna) rows.splice(0, 3, '................', '................', '................');
  if (!ED.tray.antenna) rows[3] = '...OOOOOOOOOO...';
  const buf = Buffer.alloc(16 * 16 * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const c = colors[ch];
    const i = (y * 16 + x) * 4;
    if (c) { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; }
  }));
  return nativeImage.createFromBitmap(buf, { width: 16, height: 16 });
}

// ---------- siempre en primer plano ----------
function keepOnTop() {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
}

// ---------- posición adaptable ----------
// "anchor" = esquina superior izquierda del dibujo de Pal en pantalla.
// Según dónde esté, el panel y las burbujas salen hacia arriba o abajo, a la izquierda o la derecha,
// y la ventana se recoloca para que Pal no se mueva.
const SPRITE_W = 160;
const STAGE_H = 212;
const CAPTION_H = 28;
let anchor = null;
let layout = { down: false, left: false };

function defaultAnchor() {
  const a = screen.getPrimaryDisplay().workArea;
  return [a.x + a.width - 8 - SPRITE_W - 10, a.y + a.height - 4 - 184 - 10];
}

function clampAnchor([x, y]) {
  const d = screen.getDisplayNearestPoint({ x: Math.round(x + 80), y: Math.round(y + 100) }).workArea;
  return [Math.min(Math.max(x, d.x - 40), d.x + d.width - 120), Math.min(Math.max(y, d.y - 60), d.y + d.height - 150)];
}

function layoutFor([x, y], prev) {
  const d = screen.getDisplayNearestPoint({ x: Math.round(x + 80), y: Math.round(y + 100) }).workArea;
  return {
    down: y - d.y < 400 + (prev.down ? 20 : 0),   // poco espacio arriba -> todo sale hacia abajo
    left: x - d.x < 170 + (prev.left ? 20 : 0),   // poco espacio a la izquierda -> todo sale hacia la derecha
  };
}

// 📏 Pal grande: cuánto más alto es el dibujo (DIP), para dejarle sitio arriba cuando el panel sale hacia abajo
function palExtra(x = anchor ? anchor[0] : 0, y = anchor ? anchor[1] : 0) {
  if (config.size !== 'big') return 0;
  const dpr = screen.getDisplayNearestPoint({ x: Math.round(x + 80), y: Math.round(y + 100) }).scaleFactor || 1;
  const U = Math.round(4 * dpr * 1.2);
  return Math.max(0, Math.ceil((46 * U) / dpr - 184));
}

function boundsFor([x, y], L) {
  const offX = L.left ? 8 : WIN_W - 8 - SPRITE_W;
  const offY = L.down ? 4 + palExtra(x, y) : WIN_H - 4 - STAGE_H + CAPTION_H;
  return { x: Math.round(x - offX), y: Math.round(y - offY), width: WIN_W, height: WIN_H };
}

function applyLayout() {
  const L = layoutFor(anchor, layout);
  const changedLayout = L.down !== layout.down || L.left !== layout.left;
  layout = L;
  if (win && !win.isDestroyed()) {
    win.setBounds(boundsFor(anchor, layout));
    if (changedLayout) win.webContents.send('layout', layout);
    sendPos();
  }
}

// Posición de Pal y área de trabajo de su pantalla (para subirse a ventanas y caer al suelo)
function sendPos() {
  if (!win || win.isDestroyed() || !anchor) return;
  const work = screen.getDisplayNearestPoint({ x: Math.round(anchor[0] + 80), y: Math.round(anchor[1] + 100) }).workArea;
  // todas las pantallas (sin la barra de tareas): para volar de un monitor a otro y saber dónde está el suelo
  const displays = screen.getAllDisplays().map(d => d.workArea);
  win.webContents.send('pos', { anchor, work, displays });
}

function initialBounds() {
  if (Array.isArray(config.anchor)) anchor = config.anchor;
  else if (Array.isArray(config.pos)) anchor = [config.pos[0] + WIN_W - 8 - SPRITE_W, config.pos[1] + WIN_H - 4 - STAGE_H + CAPTION_H];
  else anchor = defaultAnchor();
  anchor = clampAnchor(anchor);
  layout = layoutFor(anchor, layout);
  return boundsFor(anchor, layout);
}

function createWindow() {
  win = new BrowserWindow({
    ...initialBounds(),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,          // nunca le roba el foco a tu ventana activa
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, additionalArguments: EDITION_ARG, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 🙈 que no salga en capturas ni al compartir pantalla (si lo pides)
  if (config.hideCapture) win.setContentProtection(true);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { win.showInactive(); keepOnTop(); });
  win.on('always-on-top-changed', (_e, onTop) => { if (!onTop) keepOnTop(); });
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('layout', layout);
    win.webContents.send('prefs', prefsPayload());
    win.webContents.send('state', snapshot());
    sendPos();
  });
  win.webContents.on('console-message', (_e, level, message, lineNo, source) => {
    if (level >= 2) { try { fs.appendFileSync(path.join(DIR, 'renderer.log'), `${new Date().toISOString()} ${message} (${path.basename(source)}:${lineNo})\n`); } catch { /* nada */ } }
  });

  // Reafirma el primer plano cada segundo y medio (otras ventanas "topmost" pueden taparlo)
  setInterval(keepOnTop, 1500);

  // Posición del cursor -> el renderer decide si deja pasar los clics, y Pal lo sigue con la mirada
  setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const key = `${p.x},${p.y},${b.x},${b.y}`;
    if (key === lastCursorKey) return;   // ratón quieto: nada que contar
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    // ⚡ lejos de Pal (a más de 200 px) basta con contarlo 2-3 veces por segundo
    const near = p.x >= b.x - 200 && p.x < b.x + b.width + 200 && p.y >= b.y - 200 && p.y < b.y + b.height + 200;
    const now = Date.now();
    if (!near && now - lastCursorAt < 400) return;
    lastCursorKey = key; lastCursorAt = now;
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y, inside });
  }, 80);
}

// 🔄 Reiniciar Pal (por si algo se queda raro): se cierra limpio y se vuelve a abrir con lo mismo
// Submenú «No molestar» (clic derecho y bandeja)
function dndMenu() {
  const q = computeQuiet();
  const label = q.on ? `🤫 No molestar (activo${q.until ? ' hasta las ' + new Date(q.until).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''})` : '🤫 No molestar';
  return { label, submenu: [
    { label: 'Durante 1 hora', click: () => setDnd('hour') },
    { label: 'Hasta mañana', click: () => setDnd('tomorrow') },
    { label: 'Hasta que lo quite', click: () => setDnd('forever') },
    { type: 'separator' },
    { label: 'Desactivar', enabled: Number(config.dndUntil) !== 0, click: () => setDnd('off') },
    { label: 'Ajustes de tranquilidad…', click: () => openUi('settings', 'calm') },
  ] };
}

function restartPal() {
  app.isQuitting = true;
  try { if (mediaChild) mediaChild.kill(); } catch { /* nada */ }
  for (const [id] of pendingPerms) permAnswer(id, 'pass');   // los permisos pendientes vuelven al diálogo normal
  app.relaunch();
  app.exit(0);
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else { win.showInactive(); keepOnTop(); sendCommand('shown'); }
}

// ---------- 🛍️ tienda: personaje y accesorios (todo gratis; algunos sombreros por nivel) ----------
const CATALOG = require('./renderer/catalog.js');

// ---------- 💬 hablar con Pal: micrófono (reconocimiento de voz de Windows) y cerebro de Haiku opcional ----------
const { createBrain } = require('./brain');
const brain = createBrain({ dir: DIR, catalog: CATALOG });
let brainWin = null;
function openTalk() {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) { win.showInactive(); keepOnTop(); }
  sendCommand('talk-open');
}
function openBrain() {
  if (brainWin && !brainWin.isDestroyed()) { brainWin.show(); brainWin.focus(); return; }
  brainWin = new BrowserWindow({
    width: 520, height: 600, minWidth: 440, minHeight: 420, center: true, frame: false, resizable: true,
    backgroundColor: '#1c1a18', title: 'Cerebro de Haiku', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-brain.js'), contextIsolation: true, nodeIntegration: false, additionalArguments: EDITION_ARG },
  });
  brainWin.loadFile(path.join(__dirname, 'renderer', 'brain.html'));
  brainWin.once('ready-to-show', () => { brainWin.show(); brainWin.focus(); });
  brainWin.on('closed', () => { brainWin = null; });
}
// Escucha una frase con scripts/listen.ps1 (solo mientras pulsas el micrófono; se cierra al terminar)
let listenProc = null;
function listenOnce() {
  if (listenProc) return Promise.resolve({ ok: false, error: 'busy' });
  const base = typeof UNPACKED !== 'undefined' ? UNPACKED : __dirname;
  return new Promise(resolve => {
    let out = '';
    let p;
    try {
      p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(base, 'scripts', 'listen.ps1')], { windowsHide: true });
    } catch { resolve({ ok: false, error: 'fail' }); return; }
    listenProc = p;
    const done = r => {
      if (listenProc !== p) return;
      listenProc = null;
      clearTimeout(tm);
      try { p.kill(); } catch { /* ya terminó */ }
      resolve({ ok: !!r.ok, text: r.ok ? String(r.text || '').slice(0, 300) : undefined, error: r.ok ? undefined : String(r.error || 'fail') });
    };
    const tm = setTimeout(() => done({ ok: false, error: 'silence' }), 25000);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', d => {
      out += d;
      for (const line of out.split(/\r?\n/)) { try { const j = JSON.parse(line); if (j && 'ok' in j) return done(j); } catch { /* línea a medias */ } }
    });
    p.on('error', () => done({ ok: false, error: 'fail' }));
    p.on('exit', () => setTimeout(() => done({ ok: false, error: 'fail' }), 100));
  });
}
let shopWin = null;
function currentLevel() { const p = readJson(path.join(DIR, 'progress.json'), null); return CATALOG.levelOf(p && p.xp); }
// 🎁 coleccionables que tienes (los guarda la ventana de Pal en progress.json)
function progressNow() { return readJson(path.join(DIR, 'progress.json'), null) || {}; }
function currentOwned() { const it = progressNow().items || {}; return Object.keys(it).filter(k => it[k] > 0); }
function shopData(outfit) {
  const p = progressNow();
  return { outfit: outfit || getOutfit(), level: CATALOG.levelOf(p.xp), items: p.items || {}, pending: (p.gifts && p.gifts.pending) || 0 };
}
function getOutfit() { return CATALOG.clean(config.outfit, currentLevel(), currentOwned()); }
function setOutfit(patch) {
  const next = CATALOG.clean({ ...getOutfit(), ...(patch && typeof patch === 'object' ? patch : {}) }, currentLevel(), currentOwned());
  saveConfig({ outfit: next });
  sendCommand({ outfit: next });
  if (shopWin && !shopWin.isDestroyed()) shopWin.webContents.send('shop-update', shopData(next));
  return next;
}
function openShop(tab) {
  tab = ['skins', 'hats', 'glasses', 'neck', 'dex'].includes(tab) ? tab : '';
  if (shopWin && !shopWin.isDestroyed()) { shopWin.show(); shopWin.focus(); if (tab) shopWin.webContents.send('shop-tab', tab); return; }
  shopWin = new BrowserWindow({
    width: 640, height: 520, minWidth: 560, minHeight: 440, center: true, frame: false, resizable: true,
    backgroundColor: '#1c1a18', title: 'Tienda de Pal', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-shop.js'), contextIsolation: true, nodeIntegration: false, additionalArguments: EDITION_ARG },
  });
  shopWin.loadFile(path.join(__dirname, 'renderer', 'shop.html'), tab ? { hash: tab } : undefined);
  shopWin.once('ready-to-show', () => { shopWin.show(); shopWin.focus(); });
  shopWin.on('closed', () => { shopWin = null; });
}

function setupIpc() {
  ipcMain.on('outfit-set', (_e, p) => setOutfit(p));
  ipcMain.on('shop-open', (_e, tab) => openShop(String(tab || '')));
  ipcMain.handle('shop-get', () => shopData());
  ipcMain.handle('shop-set', (_e, p) => shopData(setOutfit(p)));
  // 🎁 abrir un regalo desde la tienda (lo abre Pal en su ventana, con su animación)
  ipcMain.on('shop-open-gift', () => sendCommand({ openGift: true }));
  ipcMain.on('shop-close', () => { if (shopWin && !shopWin.isDestroyed()) shopWin.close(); });
  // 💬 hablar con Pal
  ipcMain.handle('talk-ask', (_e, text, ctx) => brain.ask(String(text || ''), String(ctx || '')));
  ipcMain.handle('talk-status', () => brain.status());
  ipcMain.handle('talk-listen', () => listenOnce());
  ipcMain.on('talk-open', () => openTalk());
  ipcMain.on('brain-open', () => openBrain());
  ipcMain.handle('brain-status', () => brain.status());
  ipcMain.handle('brain-set-key', (_e, k) => { const r = brain.setKey(k); sendCommand('brain-changed'); return { ...r, status: brain.status() }; });
  ipcMain.handle('brain-clear-key', () => { brain.clearKey(); sendCommand('brain-changed'); return brain.status(); });
  ipcMain.handle('brain-set-limit', (_e, n) => { const ok = brain.setLimit(n); sendCommand('brain-changed'); return { ok, status: brain.status() }; });
  ipcMain.on('brain-console', () => require('electron').shell.openExternal('https://platform.claude.com/'));
  ipcMain.on('brain-close', () => { if (brainWin && !brainWin.isDestroyed()) brainWin.close(); });
  ipcMain.on('set-ignore', (_e, ignore) => { if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true }); });

  let drag = null;
  ipcMain.on('drag-start', (_e, p) => { drag = { x: p.x, y: p.y, ax: anchor[0], ay: anchor[1] }; });
  ipcMain.on('drag-move', (_e, p) => {
    if (!drag) return;
    anchor = [drag.ax + p.x - drag.x, drag.ay + p.y - drag.y];
    applyLayout();
  });
  // Pal camina solo (juegos con el ratón)
  ipcMain.on('move-by', (_e, d) => {
    if (drag || !anchor) return;
    anchor = clampAnchor([anchor[0] + (Number(d.x) || 0), anchor[1] + (Number(d.y) || 0)]);
    applyLayout();
  });
  ipcMain.on('move-end', () => saveConfig({ anchor, pos: null }));
  // ⭐ Progreso (niveles, logros, recordatorios) guardado junto al resto de datos de Pal
  const PROGRESS_FILE = path.join(DIR, 'progress.json');
  ipcMain.handle('progress-load', () => readJson(PROGRESS_FILE, null));
  ipcMain.on('progress-save', (_e, d) => {
    if (!d || typeof d !== 'object') return;
    try { if (JSON.stringify(d).length < 200000) writeJson(PROGRESS_FILE, d); } catch { /* nada */ }
    // la tienda abierta se entera de regalos nuevos y de lo que tienes
    if (shopWin && !shopWin.isDestroyed()) shopWin.webContents.send('shop-update', shopData());
  });
  // 🔔 Aviso de Windows (pomodoro, recordatorios)
  ipcMain.on('notify', (_e, n) => {
    if (!n || config.notifications === false) return;
    notify(String(n.title || 'Pal').slice(0, 80), String(n.body || '').slice(0, 200));
  });
  // ⌨️ Para escribir un recordatorio, la ventana de Pal recibe el teclado solo mientras escribes
  ipcMain.on('input-focus', (_e, on) => {
    if (!win || win.isDestroyed()) return;
    win.setFocusable(!!on);
    if (on) win.focus();
  });
  ipcMain.on('save-pref', (_e, p) => {
    if (!p || typeof p !== 'object') return;
    const patch = {};
    if ('sit' in p) patch.sit = !!p.sit;
    if ('dance' in p) patch.dance = !!p.dance;
    if ('sound' in p) patch.sound = !!p.sound;
    if ('tts' in p) patch.tts = !!p.tts;
    if ('breaks' in p) patch.breaks = !!p.breaks;
    const num = (v, a, b) => Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b;
    if ('permApprove' in p) patch.permApprove = !!p.permApprove;
    if (num(p.permWait, 5, 120)) patch.permWait = Math.round(p.permWait);
    if (num(p.pomoFocus, 5, 120)) patch.pomoFocus = Math.round(p.pomoFocus);
    if (num(p.pomoBreak, 1, 60)) patch.pomoBreak = Math.round(p.pomoBreak);
    if (num(p.careEvery, 15, 240)) patch.careEvery = Math.round(p.careEvery);
    if (['ask', 'always', 'never'].includes(p.ride)) patch.ride = p.ride;
    if (['ask', 'always', 'never'].includes(p.fsHide)) patch.fsHide = p.fsHide;
    if (p.appMode && typeof p.appMode.app === 'string') patch.appModes = { ...(config.appModes || {}), [p.appMode.app]: !!p.appMode.on };
    saveConfig(patch);
  });
  // Ir a una posición exacta (subirse a una ventana, caer al suelo)
  ipcMain.on('move-to', (_e, p) => {
    if (drag || !p) return;
    anchor = clampAnchor([Number(p.x) || 0, Number(p.y) || 0]);
    applyLayout();
  });
  // Ventana en la que Pal está subido: el vigilante la sigue aunque deje de estar activa
  ipcMain.on('track', (_e, id) => {
    try { fs.writeFileSync(path.join(DIR, 'track.txt'), String(Number(id) || 0)); } catch { /* nada */ }
  });
  // Esconderse mientras hay una app a pantalla completa
  ipcMain.on('set-hidden', (_e, hidden) => {
    if (!win || win.isDestroyed()) return;
    if (hidden) win.hide(); else { win.showInactive(); keepOnTop(); }
  });
  // Botón "Ocultar" del panel
  ipcMain.on('hide-by-user', () => {
    if (!win || win.isDestroyed()) return;
    win.hide();
    if (!config.hideTipShown && tray) {
      saveConfig({ hideTipShown: true });
      try { tray.displayBalloon({ title: 'Pal se escondió', content: 'Vuelve con Ctrl+Alt+C o haciendo clic en este icono.' }); } catch { /* nada */ }
    }
  });
  // Le soltaste un archivo encima: abre la ventana de sesiones
  ipcMain.on('open-sessions', (_e, file) => openSessionsWindow(typeof file === 'string' ? file : null));
  ipcMain.on('sess-action', (_e, a) => sessAction(a));
  ipcMain.on('restart', () => restartPal());
  ipcMain.on('dnd', (_e, v) => setDnd(String(v || 'off')));
  ipcMain.handle('perm-answer', async (_e, a) => {
    if (!a || typeof a !== 'object') return false;
    const id = String(a.id || '');
    const decision = ['allow', 'deny', 'pass'].includes(a.decision) ? a.decision : 'pass';
    const p = pendingPerms.get(id);
    const ok = permAnswer(id, decision);
    // «Ver»: suelta el permiso (sale el diálogo) y te lleva a la ventana
    if (ok && decision === 'pass' && p) { const s = sessions.get(p.sessionId); if (s && s.win) watchAsk(`focus {id} ${Number(s.win.hwnd) || 0}`, 1500); }
    return ok;
  });
  ipcMain.handle('stop-mark', (_e, id) => {
    const s = sessions.get(String(id || ''));
    if (!s) return false;
    s.stopMark = !s.stopMark;
    changed();
    return s.stopMark;
  });
  ipcMain.handle('stop-allow', (_e, id) => {
    const s = sessions.get(String(id || ''));
    const o = usageOver();
    if (!s) return false;
    s.stopAllowUntil = o ? o.resets : Date.now() + 3600000;   // hasta que se reinicie ese límite
    if (s.status === 'limited') { s.status = 'idle'; s.message = ''; }
    changed();
    return true;
  });
  ipcMain.handle('focus-session', async (_e, id) => {
    const s = sessions.get(String(id || ''));
    if (!s || !s.win) return { ok: false, reason: 'unknown' };
    const r = await watchAsk(`focus {id} ${Number(s.win.hwnd) || 0}`, 1500);
    if (!r) return { ok: false, reason: 'nowatch' };
    if (!r.ok) { delete s.win; changed(); return { ok: false, reason: 'gone' }; }
    return { ok: true, app: s.win.app };
  });

  ipcMain.on('drag-end', () => {
    if (drag) { anchor = clampAnchor(anchor); applyLayout(); saveConfig({ anchor, pos: null }); }
    drag = null;
  });

  ipcMain.on('context-menu', () => {
    const send = c => win.webContents.send('command', c);
    const radio = (key, opts) => opts.map(([value, label]) => ({
      type: 'radio', label, checked: (config[key] || 'ask') === value,
      click: () => { saveConfig({ [key]: value }); send({ prefs: prefsPayload() }); },
    }));
    Menu.buildFromTemplate([
      dndMenu(),
      { label: '⚙️ Ajustes…', click: () => openUi('settings') },
      { label: '📱 Avisos al móvil…', click: () => openUi('settings', 'phone') },
      { label: '📖 Ver el tutorial', click: () => openUi('tutorial') },
      { type: 'separator' },
      { label: '💬 Hablar con Pal   (Ctrl+Alt+Espacio)', click: openTalk },
      { label: '🧠 Cerebro de Haiku (opcional)…', click: openBrain },
      { label: '🛍️ Tienda: personajes y accesorios', click: openShop },
      { label: 'Fijar / soltar panel', click: () => send('toggle-pin') },
      { label: 'Ver animaciones (demo)', click: () => send('demo') },
      { type: 'checkbox', label: 'Quédate sentado', checked: !!config.sit, click: m => { saveConfig({ sit: m.checked }); send({ sit: m.checked }); } },
      { type: 'checkbox', label: 'Bailar con música', checked: config.dance !== false, click: m => { saveConfig({ dance: m.checked }); send({ dance: m.checked }); } },
      { type: 'checkbox', label: 'Bailar también con vídeos', checked: !!config.musicAll, click: m => { saveConfig({ musicAll: m.checked }); setMedia(lastMediaRaw); } },
      { type: 'checkbox', label: 'Sonidos', checked: config.sound !== false, click: m => { saveConfig({ sound: m.checked }); send({ prefs: prefsPayload() }); } },
      { type: 'checkbox', label: '🗣️ Voz de Pal (lee en voz alta lo importante)', checked: !!config.tts, click: m => { saveConfig({ tts: m.checked }); send({ prefs: prefsPayload() }); if (m.checked) send({ say: '¡Hola! Ahora también te hablo en voz alta 🦀' }); } },
      { label: 'Subirse a ventanas', submenu: radio('ride', [['ask', 'Preguntarme'], ['always', 'Siempre'], ['never', 'Nunca']]) },
      { label: 'Pantalla completa', submenu: radio('fsHide', [['ask', 'Preguntarme'], ['always', 'Esconderse siempre'], ['never', 'No esconderse']]) },
      { label: 'Olvidar los modos por app', click: () => { saveConfig({ appModes: {} }); send({ prefs: prefsPayload() }); } },
      { label: 'Ventana de sesiones', click: () => openSessionsWindow(null) },
      { label: 'Quitar sesiones terminadas', click: () => { for (const [id, s] of sessions) if (s.status === 'done' || s.status === 'idle') sessions.delete(id); changed(); } },
      { type: 'checkbox', label: 'Notificaciones de Windows', checked: config.notifications !== false, click: m => saveConfig({ notifications: m.checked }) },
      {
        label: '⏱ Tiempos',
        submenu: [
          ...[15, 25, 45, 50].map(m => ({ type: 'radio', label: `Pomodoro de ${m} min`, checked: (config.pomoFocus || 25) === m, click: () => { saveConfig({ pomoFocus: m }); send({ prefs: prefsPayload() }); } })),
          { type: 'separator' },
          ...[5, 10, 15].map(m => ({ type: 'radio', label: `Descanso de ${m} min (largo: ${m * 3})`, checked: (config.pomoBreak || 5) === m, click: () => { saveConfig({ pomoBreak: m }); send({ prefs: prefsPayload() }); } })),
          { type: 'separator' },
          ...[30, 45, 60, 90].map(m => ({ type: 'radio', label: `Avisos de descanso cada ${m} min`, checked: (config.careEvery || 45) === m, click: () => { saveConfig({ careEvery: m }); send({ prefs: prefsPayload() }); } })),
        ],
      },
      { type: 'checkbox', label: 'Recordatorios de descanso y agua', checked: config.breaks !== false, click: m => { saveConfig({ breaks: m.checked }); send({ prefs: prefsPayload() }); } },
      { type: 'separator' },
      { label: 'Ocultar (vuelve con Ctrl+Alt+C o la bandeja)', click: () => win.hide() },
      { label: '🔄 Reiniciar Pal', click: restartPal },
      { label: 'Salir', click: () => app.quit() },
    ]).popup({ window: win });
  });
}

function prefsPayload() {
  return {
    sit: !!config.sit, dance: config.dance !== false, sound: config.sound !== false, tts: !!config.tts, breaks: config.breaks !== false, outfit: getOutfit(),
    pomoFocus: config.pomoFocus || 25, pomoBreak: config.pomoBreak || 5, careEvery: config.careEvery || 45,
    ride: config.ride || 'ask', fsHide: config.fsHide || 'ask', appModes: config.appModes || {},
    chatty: Number.isInteger(config.chatty) ? config.chatty : 2, motion: config.motion || 'auto', quiet, size: config.size || 'normal', usageStop: usageStopCfg(),
  };
}

// ---------- ventana flotante de sesiones (al soltar un archivo sobre Pal) ----------
const { spawnSync } = require('child_process');
let sessWin = null;
let pendingFile = null;
let hasCli = null;
function cliAvailable() {
  if (hasCli === null) { try { hasCli = spawnSync('where', ['claude'], { windowsHide: true }).status === 0; } catch { hasCli = false; } }
  return hasCli;
}

function sessData() {
  return {
    file: pendingFile,
    cli: cliAvailable(),
    claudeOpen: claudeOn !== false,
    sessions: [...sessions.values()].filter(s => ['working', 'thinking', 'waiting'].includes(s.status)),
  };
}

function openSessionsWindow(file) {
  if (file) pendingFile = file;
  if (sessWin && !sessWin.isDestroyed()) { sessWin.show(); sessWin.webContents.send('sess-data', sessData()); return; }
  const W = 380, H = 470;
  const work = screen.getDisplayNearestPoint({ x: Math.round(anchor[0] + 80), y: Math.round(anchor[1] + 100) }).workArea;
  let x = anchor[0] - W - 10;
  if (x < work.x) x = anchor[0] + 170;
  const y = Math.min(Math.max(work.y + 10, anchor[1] - 120), work.y + work.height - H - 10);
  sessWin = new BrowserWindow({
    width: W, height: H, x: Math.round(x), y: Math.round(y), frame: false, resizable: true, minWidth: 320, minHeight: 300,
    alwaysOnTop: true, backgroundColor: '#1c1a18', title: 'Pal · Sesiones', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-sessions.js'), contextIsolation: true, nodeIntegration: false, additionalArguments: EDITION_ARG },
  });
  sessWin.setAlwaysOnTop(true, 'floating');
  sessWin.loadFile(path.join(__dirname, 'renderer', 'sessions.html'));
  sessWin.once('ready-to-show', () => sessWin.show());
  sessWin.webContents.on('did-finish-load', () => sessWin.webContents.send('sess-data', sessData()));
  sessWin.on('closed', () => { sessWin = null; });
}

// Trae la ventana de la app de Claude al frente
function activateClaude() {
  const ps = "$p = Get-Process claude -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1; if ($p) { (New-Object -ComObject WScript.Shell).AppActivate($p.Id) | Out-Null }";
  try { spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, detached: true, stdio: 'ignore' }).unref(); } catch { /* nada */ }
}

function sessAction(a) {
  if (!a || typeof a !== 'object') return;
  const file = pendingFile;
  const msg = file ? `Echa un vistazo a este archivo: ${file}` : '';
  const reply = r => { if (sessWin && !sessWin.isDestroyed()) sessWin.webContents.send('sess-result', r); };
  switch (a.kind) {
    case 'claude':      // copia el mensaje y abre Claude para pegarlo en una sesión nueva
      if (msg) clipboard.writeText(msg);
      activateClaude();
      reply({ ok: true, text: msg ? 'Mensaje copiado. En Claude, abre una sesión nueva y pega con Ctrl+V.' : 'Abriendo Claude…' });
      sendCommand({ say: msg ? '¡Listo! Pega con Ctrl+V en una sesión nueva 📋' : '' });
      break;
    case 'terminal':    // solo si tienes la CLI de Claude Code instalada
      if (!cliAvailable() || !file) return reply({ ok: false, text: 'No encontré la CLI "claude" en este PC.' });
      try {
        spawn('wt.exe', ['-d', path.dirname(file), 'claude', msg], { detached: true, stdio: 'ignore' }).unref();
        reply({ ok: true, text: 'Abriendo una sesión nueva en Windows Terminal…' });
      } catch { reply({ ok: false, text: 'No pude abrir Windows Terminal.' }); }
      break;
    case 'copy':
      if (file) { clipboard.writeText(file); reply({ ok: true, text: 'Ruta copiada al portapapeles.' }); }
      break;
    case 'clear':
      pendingFile = null;
      if (sessWin && !sessWin.isDestroyed()) sessWin.webContents.send('sess-data', sessData());
      break;
    case 'close':
      if (sessWin && !sessWin.isDestroyed()) sessWin.close();
      break;
    default: break;
  }
}

// ---------- arranque con Windows ----------
function getAutostart() {
  if (!app.isPackaged) return !!config.autostart;
  try { return app.getLoginItemSettings().openAtLogin; } catch { return false; }
}
function setAutostart(on) {
  saveConfig({ autostart: !!on });
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!on });
}

// ---------- ventanas de ajustes y tutorial ----------
let uiWin = null;
function openUi(page, section) {
  const file = page === 'tutorial' ? 'tutorial.html' : 'settings.html';
  const hash = section ? { hash: section } : undefined;
  if (uiWin && !uiWin.isDestroyed()) {
    uiWin.loadFile(path.join(__dirname, 'renderer', file), hash);
    uiWin.show(); uiWin.focus();
    return;
  }
  const W = page === 'tutorial' ? 760 : 560, H = page === 'tutorial' ? 600 : 640;
  uiWin = new BrowserWindow({
    width: W, height: H, minWidth: 480, minHeight: 480, center: true, frame: false, resizable: true,
    backgroundColor: '#1c1a18', title: page === 'tutorial' ? 'Bienvenido a Pal' : 'Ajustes de Pal', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-ui.js'), contextIsolation: true, nodeIntegration: false, additionalArguments: EDITION_ARG },
  });
  uiWin.loadFile(path.join(__dirname, 'renderer', file), hash);
  uiWin.once('ready-to-show', () => { uiWin.show(); uiWin.focus(); });
  uiWin.on('closed', () => { uiWin = null; });
}

function uiStatus() {
  return {
    version: app.getVersion(),
    packaged: app.isPackaged,
    port: PORT,
    edition: ED.name,
    serverError,
    hooks: hooks.status(PORT, TOKEN),
    calm: { dndUntil: Number(config.dndUntil) || 0, quietHours: config.quietHours || { on: false, from: '22:00', to: '08:00' }, respectFocus: config.respectFocus !== false, chatty: Number.isInteger(config.chatty) ? config.chatty : 2, hideCapture: !!config.hideCapture, motion: config.motion || 'auto', size: config.size || 'normal', quiet },
    privacy: { dir: DIR, debugLog: !!config.debugLog, phone: !!(config.phone && config.phone.on), phoneProvider: (config.phone && config.phone.provider) || 'app', haiku: fs.existsSync(path.join(DIR, 'brain-key.bin')) },
    usageStop: usageStopCfg(),
    perm: { approve: config.permApprove !== false, wait: Number(config.permWait ?? 20), installed: hooks.permissionInstalled(PORT, TOKEN) },
    autostart: getAutostart(),
    onboarded: !!config.onboarded,
  };
}

function setupUiIpc() {
  ipcMain.handle('ui:status', () => uiStatus());
  ipcMain.handle('ui:install-hooks', () => {
    try { hooks.install(PORT, TOKEN); return { ok: true, status: uiStatus() }; }
    catch (e) { return { ok: false, error: `No pude escribir la configuración de Claude Code: ${e.message}` }; }
  });
  ipcMain.handle('ui:uninstall-hooks', () => {
    try { hooks.uninstall(PORT, TOKEN); return { ok: true, status: uiStatus() }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('ui:set-autostart', (_e, on) => { setAutostart(!!on); return uiStatus(); });
  // 🛑 parar sesiones por uso
  ipcMain.handle('ui:usage-stop-set', (_e, p) => {
    p = p && typeof p === 'object' ? p : {};
    const c = usageStopCfg();
    const pct = v => Math.max(0, Math.min(100, Math.round(Number(v)) || 0));
    if ('on' in p) c.on = !!p.on;
    if ('five' in p) c.five = pct(p.five);
    if ('week' in p) c.week = pct(p.week);
    if (p.scope === 'all' || p.scope === 'marked') c.scope = p.scope;
    saveConfig({ usageStop: c });
    if (win && !win.isDestroyed()) win.webContents.send('prefs', prefsPayload());
    return uiStatus();
  });
  // 🔒 privacidad
  ipcMain.handle('ui:open-data', () => { require('electron').shell.openPath(DIR); return true; });
  ipcMain.handle('ui:clear-history', () => {
    // estadísticas del día y registro de depuración (no toca tu nivel, logros, notas ni ajustes)
    for (const name of ['stats.json', 'events.log', 'events.log.old', 'renderer.log']) { try { fs.unlinkSync(path.join(DIR, name)); } catch { /* no existe */ } }
    stats = null;
    return true;
  });
  // 🤫 tranquilidad
  ipcMain.handle('ui:calm-set', (_e, p) => {
    p = p && typeof p === 'object' ? p : {};
    const patch = {};
    if (['hour', 'tomorrow', 'forever', 'off'].includes(p.dnd)) setDnd(p.dnd);
    if (p.quietHours && typeof p.quietHours === 'object') {
      const t = v => (/^\d{1,2}:\d{2}$/.test(String(v)) ? String(v) : null);
      const cur = config.quietHours || { on: false, from: '22:00', to: '08:00' };
      patch.quietHours = { on: 'on' in p.quietHours ? !!p.quietHours.on : cur.on, from: t(p.quietHours.from) || cur.from, to: t(p.quietHours.to) || cur.to };
    }
    if ('respectFocus' in p) patch.respectFocus = !!p.respectFocus;
    if ('chatty' in p) patch.chatty = Math.max(0, Math.min(3, Math.round(Number(p.chatty)) || 0));
    if ('hideCapture' in p) { patch.hideCapture = !!p.hideCapture; if (win && !win.isDestroyed()) win.setContentProtection(patch.hideCapture); }
    if (['auto', 'less', 'full'].includes(p.motion)) patch.motion = p.motion;
    if (['small', 'normal', 'big'].includes(p.size)) patch.size = p.size;
    saveConfig(patch);
    if (patch.size) applyLayout();
    updateQuiet();
    if (win && !win.isDestroyed()) win.webContents.send('prefs', prefsPayload());
    return uiStatus();
  });
  // ✋ aprobar permisos desde Pal
  ipcMain.handle('ui:perm-set', (_e, p) => {
    p = p && typeof p === 'object' ? p : {};
    const patch = {};
    if ('approve' in p) patch.permApprove = !!p.approve;
    if ('wait' in p) patch.permWait = Math.max(5, Math.min(120, Math.round(Number(p.wait) || 20)));
    saveConfig(patch);
    return uiStatus();
  });
  ipcMain.handle('ui:perm-install', () => {
    try { hooks.installPermission(PORT, TOKEN); return { ok: true, status: uiStatus() }; }
    catch (e) { return { ok: false, error: `No pude escribir la configuración de Claude Code: ${e.message}` }; }
  });
  // 📱 avisos al móvil
  const phoneView = async () => {
    const st = phone.status();
    let qr = '';
    try { qr = await require('qrcode').toDataURL(st.provider === 'app' ? st.pairUrl : st.url, { margin: 1, width: 220, color: { dark: '#1c1a18', light: '#ffffff' } }); } catch { /* sin QR */ }
    return { ...st, qr, apk: fs.existsSync(APK_FILE) };
  };
  ipcMain.handle('ui:phone', () => phoneView());
  ipcMain.handle('ui:phone-set', (_e, patch) => { phone.set(patch && typeof patch === 'object' ? patch : {}); return phoneView(); });
  ipcMain.handle('ui:phone-test', () => phone.test());
  // elegir el .json de la cuenta de servicio de Firebase: se comprueba y se copia a la carpeta de Pal
  ipcMain.handle('ui:phone-key', async () => {
    const { dialog } = require('electron');
    const r = await dialog.showOpenDialog(uiWin && !uiWin.isDestroyed() ? uiWin : undefined, {
      title: 'Clave de Firebase (cuenta de servicio)', properties: ['openFile'], filters: [{ name: 'Clave JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true, view: await phoneView() };
    let txt = '';
    try { txt = fs.readFileSync(r.filePaths[0], 'utf8'); } catch (e) { return { ok: false, error: e.message, view: await phoneView() }; }
    if (!checkKey(txt)) return { ok: false, error: 'Ese archivo no es una clave de cuenta de servicio de Firebase (Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada).', view: await phoneView() };
    try { fs.writeFileSync(FIREBASE_KEY_FILE, txt, { mode: 0o600 }); } catch (e) { return { ok: false, error: e.message, view: await phoneView() }; }
    return { ok: true, view: await phoneView() };
  });
  ipcMain.handle('ui:phone-apk', () => {
    if (!fs.existsSync(APK_FILE)) return false;
    require('electron').shell.showItemInFolder(APK_FILE);
    return true;
  });
  ipcMain.handle('ui:finish-tutorial', () => {
    saveConfig({ onboarded: true });
    if (uiWin && !uiWin.isDestroyed()) uiWin.close();
    sendCommand({ say: '¡Listo! Pasa el ratón por encima de mí para ver el panel 🦀' });
    return true;
  });
  // El tutorial le pide a Pal que enseñe una animación (solo nombres sencillos: "thinking", "song:funk", "x:summary"…)
  ipcMain.handle('ui:preview', (_e, a) => {
    a = String(a || '');
    if (!/^[a-z]{1,16}(:[a-z0-9-]{1,40})?$/.test(a) || !win || win.isDestroyed()) return false;
    if (!win.isVisible()) { win.showInactive(); keepOnTop(); }
    win.webContents.send('command', a === 'demo' ? 'demo' : { preview: a });
    return true;
  });
  ipcMain.handle('ui:open', (_e, page) => { openUi(page === 'tutorial' ? 'tutorial' : 'settings'); return true; });
  ipcMain.on('ui:close', () => { if (uiWin && !uiWin.isDestroyed()) uiWin.close(); });
  ipcMain.on('ui:restart', () => restartPal());

}

function setupTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Pixel Pal: Desktop Pet');
  tray.on('click', toggleVisible);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mostrar / ocultar a Pal   (Ctrl+Alt+C)', click: toggleVisible },
    dndMenu(),
    { label: 'Ajustes…', click: () => openUi('settings') },
    { label: 'Ver el tutorial', click: () => openUi('tutorial') },
    { label: 'Hablar con Pal   (Ctrl+Alt+Espacio)', click: openTalk },
    { label: 'Tienda: personajes y accesorios', click: openShop },
    { label: 'Volver a la esquina', click: () => { anchor = defaultAnchor(); applyLayout(); saveConfig({ anchor, pos: null }); } },
    { type: 'separator' },
    { label: '🔄 Reiniciar Pal', click: restartPal },
    { label: 'Salir', click: () => app.quit() },
  ]));
}

// ---------- arranque ----------
if (process.argv.includes('--cleanup')) {
  // Lo ejecuta el desinstalador: quita la conexión con Claude Code y el arranque con Windows
  app.setAppUserModelId(ED.appId); // mismo nombre que la entrada de arranque
  app.whenReady().then(() => {
    try { hooks.uninstall(PORT, TOKEN); } catch { /* nada */ }
    try { app.setLoginItemSettings({ openAtLogin: false }); } catch { /* nada */ }
    app.exit(0);
  });
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(ED.appId);
  // Si se abre otra vez (menú Inicio, acceso directo), se muestra la que ya está abierta
  app.on('second-instance', () => { if (win) { win.showInactive(); keepOnTop(); sendCommand('shown'); } });
  app.whenReady().then(() => {
    loadState();
    startServer();
    setupIpc();
    setupUiIpc();
    createWindow();
    setupTray();
    // Atajos globales
    try { globalShortcut.register('CommandOrControl+Alt+C', toggleVisible); } catch { /* atajo ocupado */ }
    try { globalShortcut.register('CommandOrControl+Alt+Space', openTalk); } catch { /* atajo ocupado */ }
    setInterval(pruneStale, 60 * 1000);
    startSystemWatch();
    // Si ya estaba conectado pero cambió el puerto o el token, se reconecta solo
    try { if (hooks.status(PORT, TOKEN).installed && !hooks.upToDate(PORT, TOKEN)) hooks.install(PORT, TOKEN); } catch { /* nada */ }
    // Primera vez: tutorial de bienvenida
    if (ED.autoTutorial && !config.onboarded) setTimeout(() => openUi('tutorial'), 1200);
  });
  // Cerrar el tutorial o los ajustes no cierra Pal
  app.on('window-all-closed', () => { if (!win || win.isDestroyed()) app.quit(); });
}
