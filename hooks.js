// Conexión con Claude Code (hooks y línea de estado), sin necesitar Node instalado.
// Cada evento de Claude Code se envía a Pal con curl.exe, que viene con Windows 10 y 11.
//
// Cada edición solo toca SUS comandos: los reconoce por su clave secreta (o por su puerto, para limpiar
// restos de una clave antigua). Así la edición personal y la compartida nunca se borran entre sí.
// La edición personal además reconoce sus hooks de Node de siempre (hooks/clawd-hook.js).
const fs = require('fs');
const path = require('path');
const os = require('os');

// Marca de nuestros comandos: así solo quitamos lo nuestro y nunca lo del usuario
const MARK = 'x-clawd-token';
const LEGACY = /clawd-(hook|statusline)\.js/;

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

// opts: { settings: ruta de settings.json, legacy: reconocer los hooks de Node de la edición personal }
function create(opts = {}) {
  // Se puede cambiar para pruebas, para no tocar la configuración real
  const SETTINGS = opts.settings || process.env.CLAWD_CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
  const legacyOn = opts.legacy !== undefined ? !!opts.legacy : process.env.PAL_EDITION === 'personal';

  const claudeCodeFound = () => fs.existsSync(path.dirname(SETTINGS));

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

  // ¿Este comando curl es de esta edición? (misma clave, o mismo puerto: restos de una clave anterior)
  const isOurCurl = (cmd, port, token) => typeof cmd === 'string' && cmd.includes(MARK)
    && ((token && cmd.includes(`${MARK}: ${token}`)) || (port && cmd.includes(`127.0.0.1:${port}/`)));
  const isLegacy = cmd => legacyOn && typeof cmd === 'string' && LEGACY.test(cmd);
  const allHooks = s => Object.values(s.hooks || {}).flat().flatMap(e => (e && e.hooks) || []);

  function removeWhere(settings, test) {
    let removed = 0;
    if (settings.hooks && typeof settings.hooks === 'object') {
      for (const event of Object.keys(settings.hooks)) {
        const list = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
        settings.hooks[event] = list
          .map(entry => {
            const hooks = (entry.hooks || []).filter(h => !test(h.command));
            removed += (entry.hooks || []).length - hooks.length;
            return { ...entry, hooks };
          })
          .filter(entry => entry.hooks.length > 0);
        if (!settings.hooks[event].length) delete settings.hooks[event];
      }
      if (!Object.keys(settings.hooks).length) delete settings.hooks;
    }
    if (settings.statusLine && test(settings.statusLine.command)) { delete settings.statusLine; removed++; }
    return removed;
  }

  function status(port, token) {
    try {
      const all = allHooks(read());
      const curl = all.some(h => isOurCurl(h.command, port, token));
      const legacy = all.some(h => isLegacy(h.command));
      return { found: claudeCodeFound(), installed: curl || legacy, legacy, settings: SETTINGS };
    } catch (e) {
      return { found: claudeCodeFound(), installed: false, settings: SETTINGS, error: 'No se pudo leer la configuración de Claude Code: ' + e.message };
    }
  }

  function install(port, token) {
    const settings = read();
    // La edición personal con sus hooks de Node ya está conectada (y además esos hooks abren Pal solos)
    if (allHooks(settings).some(h => isLegacy(h.command))) return status(port, token);
    if (fs.existsSync(SETTINGS)) {
      fs.copyFileSync(SETTINGS, `${SETTINGS}.bak-clawd-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    }
    removeWhere(settings, cmd => isOurCurl(cmd, port, token));
    settings.hooks = settings.hooks || {};
    const command = curlCommand(port, token, 'event');
    for (const [event, matcher] of EVENTS) {
      const entry = { hooks: [{ type: 'command', command, timeout: 5 }] };
      if (matcher) entry.matcher = matcher;
      (settings.hooks[event] = settings.hooks[event] || []).push(entry);
    }
    // Línea de estado (uso de sesión y semana). No se toca una línea de estado ajena.
    if (!settings.statusLine) settings.statusLine = { type: 'command', command: curlCommand(port, token, 'statusline') };
    write(settings);
    return status(port, token);
  }

  function uninstall(port, token) {
    if (!fs.existsSync(SETTINGS)) return { removed: 0 };
    const settings = read();
    const removed = removeWhere(settings, cmd => isOurCurl(cmd, port, token) || isLegacy(cmd));
    if (removed) write(settings);
    return { removed };
  }

  // ¿Los comandos instalados usan el puerto y la clave actuales? (si no, hay que reinstalarlos)
  function upToDate(port, token) {
    try {
      const all = allHooks(read());
      if (all.some(h => isLegacy(h.command))) return true;
      const ours = all.filter(h => isOurCurl(h.command, port, token));
      const want = curlCommand(port, token, 'event');
      return ours.length >= EVENTS.length && ours.every(h => h.command === want);
    } catch { return true; } // si no se puede leer, no tocamos nada
  }

  return { install, uninstall, status, upToDate, SETTINGS };
}

module.exports = { create, curlCommand, EVENTS, MARK };
