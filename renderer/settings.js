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

$('autostart').addEventListener('change', async e => {
  try { render(await window.ui.setAutostart(e.target.checked)); }
  catch (err) { e.target.checked = !e.target.checked; }
});

$('tutorial').addEventListener('click', () => window.ui.open('tutorial'));
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
window.ui.phone().then(p => { phoneRender(p); if (location.hash === '#phone') $('phone').scrollIntoView(); });
