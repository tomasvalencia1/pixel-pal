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
  // El de permisos espera la respuesta de Pal (máx. 10 min, aunque Pal suele contestar en segundos) y la imprime.
  const max = route === 'permission' ? 600 : 2;
  return `curl.exe -s -m ${max} -H "content-type: application/json" -H "${MARK}: ${token}" --data-binary @- http://127.0.0.1:${port}/${route}`;
}
// ✋ Permisos: Claude Code pregunta a Pal antes de enseñar el diálogo; Pal responde permitir, denegar o nada
const PERMISSION = 'PermissionRequest';

// 🚀 La edición personal usa su hook de Node (hooks/clawd-hook.js), que además ABRE Pal si está cerrado.
// curl solo puede avisar a un Pal ya abierto. Si no hay Node instalado, se usa curl igualmente.
function findNode() {
  const dirs = [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'), ...String(process.env.PATH || '').split(path.delimiter)];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d.replace(/"/g, ''), process.platform === 'win32' ? 'node.exe' : 'node');
    try { if (fs.statSync(p).isFile() && !/electron/i.test(p)) return p; } catch { /* no está */ }
  }
  return null;
}
const nodeCommand = (node, script) => `"${node.replace(/\\/g, '/')}" "${script.replace(/\\/g, '/')}"`;

// opts: { settings: ruta de settings.json, legacy: reconocer los hooks de Node de la edición personal }
function create(opts = {}) {
  // Se puede cambiar para pruebas, para no tocar la configuración real
  const SETTINGS = opts.settings || process.env.CLAWD_CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
  const legacyOn = opts.legacy !== undefined ? !!opts.legacy : process.env.PAL_EDITION === 'personal';
  // Ruta del hook de Node de la edición personal (la pone su main.js); sin ella, siempre curl
  const legacyHook = opts.legacyHook !== undefined ? opts.legacyHook : process.env.PAL_LEGACY_HOOK;
  const legacyCommand = () => {
    if (!legacyOn || !legacyHook || !fs.existsSync(legacyHook)) return null;
    const node = opts.node !== undefined ? opts.node : findNode();
    return node ? nodeCommand(node, legacyHook) : null;
  };

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
    const command = legacyCommand() || curlCommand(port, token, 'event');
    for (const [event, matcher] of EVENTS) {
      const entry = { hooks: [{ type: 'command', command, timeout: 5 }] };
      if (matcher) entry.matcher = matcher;
      (settings.hooks[event] = settings.hooks[event] || []).push(entry);
    }
    addPermission(settings, port, token);
    // Línea de estado (uso de sesión y semana). No se toca una línea de estado ajena.
    if (!settings.statusLine) settings.statusLine = { type: 'command', command: curlCommand(port, token, 'statusline') };
    write(settings);
    return status(port, token);
  }

  function addPermission(settings, port, token) {
    settings.hooks = settings.hooks || {};
    const list = (settings.hooks[PERMISSION] = settings.hooks[PERMISSION] || []);
    list.push({ hooks: [{ type: 'command', command: curlCommand(port, token, 'permission'), timeout: 600 }] });
  }
  // Solo el de permisos (la edición personal conserva sus hooks de Node para todo lo demás)
  function installPermission(port, token) {
    const settings = read();
    if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.bak-clawd-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    removeWhere(settings, cmd => isOurCurl(cmd, port, token) && /\/permission$/.test(cmd));
    addPermission(settings, port, token);
    write(settings);
    return status(port, token);
  }
  function permissionInstalled(port, token) {
    try { return (read().hooks?.[PERMISSION] || []).flatMap(e => e.hooks || []).some(h => h.command === curlCommand(port, token, 'permission')); }
    catch { return false; }
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
      const events = ours.filter(h => !/\/permission$/.test(h.command));
      const want = curlCommand(port, token, 'event');
      return events.length >= EVENTS.length && events.every(h => h.command === want) && permissionInstalled(port, token);
    } catch { return true; } // si no se puede leer, no tocamos nada
  }

  return { install, installPermission, permissionInstalled, uninstall, status, upToDate, SETTINGS };
}

module.exports = { create, curlCommand, EVENTS, MARK, PERMISSION };
