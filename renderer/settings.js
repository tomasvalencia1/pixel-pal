// Ventana de ajustes
const $ = id => document.getElementById(id);
let status = null;

function setMsg(text, kind) {
  const m = $('hooksMsg');
  m.textContent = text || '';
  m.className = `msg ${kind || ''}`;
}

function render(s) {
  status = s;
  const h = s.hooks || {};
  const pill = $('hooksPill');
  const info = $('hooksInfo');
  const btn = $('hooksBtn');
  btn.disabled = false;
  if (h.error) {
    pill.className = 'pill err'; pill.textContent = 'Error';
    info.textContent = h.error;
    btn.textContent = 'Reintentar'; btn.className = 'btn';
  } else if (h.installed) {
    pill.className = 'pill ok'; pill.textContent = 'Conectado';
    info.textContent = 'Pal recibe lo que hacen tus sesiones de Claude Code.';
    btn.textContent = 'Desconectar'; btn.className = 'btn danger';
  } else {
    pill.className = h.found ? 'pill no' : 'pill warn';
    pill.textContent = h.found ? 'Sin conectar' : 'No encontrado';
    info.textContent = h.found
      ? 'Conéctalo para que Pal muestre el progreso de tus sesiones.'
      : 'No encontré Claude Code en este PC. Puedes conectarlo igualmente y funcionará cuando lo instales.';
    btn.textContent = 'Conectar'; btn.className = 'btn primary';
  }
  permRender(s);
  calmRender(s);
  $('autostart').checked = !!s.autostart;
  $('autostartNote').hidden = !!s.packaged;
  $('version').textContent = s.version || '—';
  $('server').textContent = s.serverError ? `⚠️ ${s.serverError}` : `127.0.0.1:${s.port} ✓`;
}

async function refresh() {
  try { render(await window.ui.status()); }
  catch (e) { setMsg(`No pude leer el estado: ${e.message}`, 'err'); }
}

$('hooksBtn').addEventListener('click', async () => {
  const btn = $('hooksBtn');
  btn.disabled = true;
  setMsg('');
  try {
    const connect = !(status && status.hooks && status.hooks.installed);
    const r = connect ? await window.ui.installHooks() : await window.ui.uninstallHooks();
    if (!r.ok) { setMsg(r.error || 'Algo salió mal.', 'err'); btn.disabled = false; return; }
    render(r.status);
    setMsg(connect
      ? '¡Conectado! Las sesiones de Claude Code que abras a partir de ahora aparecerán en Pal (reinicia las que ya estaban abiertas).'
      : 'Desconectado. Tu configuración de Claude Code queda como estaba antes.', 'ok');
  } catch (e) {
    setMsg(e.message, 'err');
    btn.disabled = false;
  }
});

// ---------- 🤫 tranquilidad ----------
function calmRender(s) {
  const c = s.calm || {};
  const q = c.quiet || {};
  const hhmm = t => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  $('quietPill').className = q.on ? 'pill ok' : 'pill no';
  $('quietPill').textContent = !q.on ? 'Apagado' : q.reason === 'windows' ? 'Activo (Windows)' : q.reason === 'hours' ? 'Horas de silencio' : q.until ? `Activo hasta las ${hhmm(q.until)}` : 'Activo';
  const u = Number(c.dndUntil) || 0;
  $('dnd').value = u === -1 ? 'forever' : u > Date.now() ? (u - Date.now() <= 3600000 ? 'hour' : 'tomorrow') : 'off';
  const qh = c.quietHours || {};
  $('qhOn').checked = !!qh.on; $('qhFrom').value = qh.from || '22:00'; $('qhTo').value = qh.to || '08:00';
  $('respectFocus').checked = c.respectFocus !== false;
  $('chatty').value = String(Number.isInteger(c.chatty) ? c.chatty : 2);
  $('motion').value = c.motion || 'auto';
  $('hideCapture').checked = !!c.hideCapture;
  $('palSize').value = c.size || 'normal';
}
$('palSize').addEventListener('change', e => calmSet({ size: e.target.value }));
const calmSet = async p => { try { render(await window.ui.calmSet(p)); } catch (e) { $('calmMsg').textContent = e.message; $('calmMsg').className = 'msg err'; } };
$('dnd').addEventListener('change', e => calmSet({ dnd: e.target.value }));
$('qhOn').addEventListener('change', e => calmSet({ quietHours: { on: e.target.checked } }));
$('qhFrom').addEventListener('change', e => calmSet({ quietHours: { from: e.target.value } }));
$('qhTo').addEventListener('change', e => calmSet({ quietHours: { to: e.target.value } }));
$('respectFocus').addEventListener('change', e => calmSet({ respectFocus: e.target.checked }));
$('chatty').addEventListener('change', e => calmSet({ chatty: Number(e.target.value) }));
$('motion').addEventListener('change', e => calmSet({ motion: e.target.value }));
$('hideCapture').addEventListener('change', e => calmSet({ hideCapture: e.target.checked }));
if (window.ui.onRefresh) window.ui.onRefresh(() => refresh());

// ---------- ✋ permisos desde Pal ----------
function permRender(s) {
  const p = s.perm || {};
  $('permOn').checked = !!p.approve;
  $('permWait').value = p.wait || 20;
  const ready = p.approve && p.installed;
  $('permPill').className = ready ? 'pill ok' : 'pill no';
  $('permPill').textContent = !p.approve ? 'Apagado' : p.installed ? 'Activado' : 'Sin conectar';
  $('permInstallRow').hidden = !(p.approve && !p.installed && s.hooks && s.hooks.installed);
}
$('permOn').addEventListener('change', async e => render(await window.ui.permSet({ approve: e.target.checked })));
$('permWait').addEventListener('change', async e => render(await window.ui.permSet({ wait: e.target.value })));
$('permInstall').addEventListener('click', async () => {
  const r = await window.ui.permInstall();
  const m = $('permMsg');
  if (r.ok) { render(r.status); m.textContent = '¡Conectado! Funciona en las sesiones que abras a partir de ahora.'; m.className = 'msg ok'; }
  else { m.textContent = r.error; m.className = 'msg err'; }
});

$('autostart').addEventListener('change', async e => {
  try { render(await window.ui.setAutostart(e.target.checked)); }
  catch (err) { e.target.checked = !e.target.checked; }
});

$('tutorial').addEventListener('click', () => window.ui.open('tutorial'));
$('restart').addEventListener('click', () => window.ui.restart());
$('close').addEventListener('click', () => window.ui.close());
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.ui.close(); });

refresh();

// ---------- 📱 avisos al móvil ----------
function phoneMsg(text, kind) { const m = $('phoneMsg'); m.textContent = text || ''; m.className = `msg ${kind || ''}`; }
function phoneRender(p) {
  $('phoneOn').checked = !!p.on;
  $('phonePill').className = p.on ? 'pill ok' : 'pill no';
  $('phonePill').textContent = p.on ? 'Activado' : 'Apagado';
  $('phoneBody').hidden = !p.on;
  $('phoneTopic').textContent = p.topic;
  if (p.qr) for (const img of document.querySelectorAll('img.qr')) img.src = p.qr;
  for (const r of document.querySelectorAll('input[name=phoneProv]')) r.checked = r.value === p.provider;
  $('provApp').hidden = p.provider !== 'app';
  $('provNtfy').hidden = p.provider === 'app';
  $('pairCode').textContent = p.pairCode || '…';
  $('keyState').className = p.keyOk ? 'pill ok' : 'pill no';
  $('keyState').textContent = p.keyOk ? `lista (${p.keyProject})` : 'falta';
  $('keyBtn').textContent = p.keyOk ? 'Cambiar…' : 'Cargar clave…';
  $('apkBtn').disabled = !p.apk;
  $('apkBtn').title = p.apk ? 'Abre la carpeta con el archivo .apk para pasarlo al móvil' : 'Aún no se ha compilado la app (carpeta android/)';
  for (const r of document.querySelectorAll('input[name=phoneMode]')) r.checked = r.value === p.mode;
  $('phoneAway').value = p.awayMin;
  $('phDone').checked = !!p.done; $('phWaiting').checked = !!p.waiting; $('phError').checked = !!p.error;
}
const phoneSet = async patch => { try { phoneRender(await window.ui.phoneSet(patch)); } catch (e) { phoneMsg(e.message, 'err'); } };
$('phoneOn').addEventListener('change', e => phoneSet({ on: e.target.checked }));
for (const r of document.querySelectorAll('input[name=phoneProv]')) r.addEventListener('change', () => phoneSet({ provider: r.value }));
$('keyBtn').addEventListener('click', async () => {
  const r = await window.ui.phoneKey();
  if (r.view) phoneRender(r.view);
  if (r.ok) phoneMsg('Clave de Firebase guardada en la carpeta de Pal 👍', 'ok');
  else if (!r.canceled) phoneMsg(r.error, 'err');
});
$('apkBtn').addEventListener('click', () => window.ui.phoneApk());
for (const r of document.querySelectorAll('input[name=phoneMode]')) r.addEventListener('change', () => phoneSet({ mode: r.value }));
$('phoneAway').addEventListener('change', e => phoneSet({ awayMin: e.target.value }));
$('phDone').addEventListener('change', e => phoneSet({ done: e.target.checked }));
$('phWaiting').addEventListener('change', e => phoneSet({ waiting: e.target.checked }));
$('phError').addEventListener('change', e => phoneSet({ error: e.target.checked }));
$('phoneCopy').addEventListener('click', () => { navigator.clipboard.writeText($('phoneTopic').textContent).then(() => phoneMsg('Canal copiado 👍', 'ok')); });
$('phoneNew').addEventListener('click', async () => { await phoneSet({ newTopic: true }); phoneMsg('Código nuevo: vuelve a emparejar el móvil.', 'ok'); });
$('phoneTest').addEventListener('click', async () => {
  const b = $('phoneTest'); b.disabled = true; phoneMsg('Enviando…');
  const r = await window.ui.phoneTest();
  b.disabled = false;
  phoneMsg(r.ok ? '¡Enviado! Si no te llega, revisa que estés suscrito a este canal en la app ntfy.' : `No se pudo enviar (${r.error || 'error ' + r.status}).`, r.ok ? 'ok' : 'err');
});
window.ui.phone().then(p => { phoneRender(p); if (location.hash === '#phone') $('phone').scrollIntoView(); if (location.hash === '#calm') $('calm').scrollIntoView(); });
