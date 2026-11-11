// Conexión con Claude Code (hooks y línea de estado), sin necesitar Node instalado.
// Cada evento de Claude Code se envía a Pal con curl.exe, que viene con Windows 10 y 11.
const fs = require('fs');
const path = require('path');
const os = require('os');

// Se puede cambiar para pruebas, para no tocar la configuración real
const SETTINGS = process.env.CLAWD_CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
// Marca de nuestros comandos: así solo quitamos lo nuestro y nunca lo del usuario
const MARK = 'x-clawd-token';

const EVENTS = [
  ['SessionStart'],
  ['UserPromptSubmit'],
  ['PreToolUse', '*'],
  ['PostToolUse', '*'],
  ['Notification'],
  ['Stop'],
  ['StopFailure'],
  ['SessionEnd'],
];

function curlCommand(port, token, route) {
  // Funciona igual en cmd, PowerShell y Git Bash. -s: sin mensajes; -m 2: nunca tarda más de 2 s.
  // Si Pal está cerrado, curl falla en silencio y Claude Code sigue sin problemas.
  return `curl.exe -s -m 2 -H "content-type: application/json" -H "${MARK}: ${token}" --data-binary @- http://127.0.0.1:${port}/${route}`;
}

function claudeCodeFound() {
  return fs.existsSync(path.dirname(SETTINGS));
}

function read() {
  if (!fs.existsSync(SETTINGS)) return {};
  const txt = fs.readFileSync(SETTINGS, 'utf8').replace(/^﻿/, '');
  if (!txt.trim()) return {};
  return JSON.parse(txt);  // si el archivo está roto, mejor fallar que sobrescribirlo
}

function write(settings) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

const isOurs = cmd => typeof cmd === 'string' && cmd.includes(MARK);

function removeOurs(settings) {
  let removed = 0;
  if (settings.hooks && typeof settings.hooks === 'object') {
    for (const event of Object.keys(settings.hooks)) {
      const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
      settings.hooks[event] = list
        .map(entry => {
          const hooks = (entry.hooks || []).filter(h => !isOurs(h.command));
          removed += (entry.hooks || []).length - hooks.length;
          return { ...entry, hooks };
        })
        .filter(entry => entry.hooks.length > 0);
      if (!settings.hooks[event].length) delete settings.hooks[event];
    }
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
  }
  if (settings.statusLine && isOurs(settings.statusLine.command)) { delete settings.statusLine; removed++; }
  return removed;
}

function status() {
  try {
    const s = read();
    const all = Object.values(s.hooks || {}).flat().flatMap(e => e.hooks || []);
    return { found: claudeCodeFound(), installed: all.some(h => isOurs(h.command)), settings: SETTINGS };
  } catch (e) {
    return { found: claudeCodeFound(), installed: false, settings: SETTINGS, error: 'No se pudo leer la configuración de Claude Code: ' + e.message };
  }
}

function install(port, token) {
  const settings = read();
  if (fs.existsSync(SETTINGS)) {
    fs.copyFileSync(SETTINGS, `${SETTINGS}.bak-clawd-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  }
  removeOurs(settings);
  settings.hooks = settings.hooks || {};
  const command = curlCommand(port, token, 'event');
  for (const [event, matcher] of EVENTS) {
    const entry = { hooks: [{ type: 'command', command, timeout: 5 }] };
    if (matcher) entry.matcher = matcher;
    (settings.hooks[event] = settings.hooks[event] || []).push(entry);
  }
  // Línea de estado (uso de sesión y semana). No se toca una línea de estado propia del usuario.
  if (!settings.statusLine) settings.statusLine = { type: 'command', command: curlCommand(port, token, 'statusline') };
  write(settings);
  return status();
}

function uninstall() {
  if (!fs.existsSync(SETTINGS)) return { removed: 0 };
  const settings = read();
  const removed = removeOurs(settings);
  if (removed) write(settings);
  return { removed };
}

// ¿Los comandos instalados usan el puerto y el token actuales? (si no, hay que reinstalarlos)
function upToDate(port, token) {
  try {
    const s = read();
    const ours = Object.values(s.hooks || {}).flat().flatMap(e => e.hooks || []).filter(h => isOurs(h.command));
    const want = curlCommand(port, token, 'event');
    return ours.length >= EVENTS.length && ours.every(h => h.command === want);
  } catch { return true; } // si no se puede leer, no tocamos nada
}

module.exports = { install, uninstall, status, upToDate, SETTINGS };
