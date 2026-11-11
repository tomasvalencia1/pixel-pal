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
