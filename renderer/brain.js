// Ventana "Cerebro de Haiku": guardar o quitar la clave y fijar el límite de gasto mensual
const $ = id => document.getElementById(id);
function msg(text, kind) { $('msg').textContent = text || ''; $('msg').className = `msg ${kind || ''}`; }
function render(s) {
  $('pill').className = s.hasKey ? 'pill ok' : 'pill no';
  $('pill').textContent = s.hasKey ? 'Conectado' : 'Sin clave';
  $('clear').disabled = !s.hasKey;
  $('limit').value = s.limit;
  $('usage').textContent = `Este mes: ${s.usd.toFixed(3)} $ de ${s.limit.toFixed(2)} $ · ${s.messages} respuesta${s.messages === 1 ? '' : 's'}`;
}
async function refresh() { try { render(await window.brain.status()); } catch (e) { msg(e.message, 'err'); } }

$('save').addEventListener('click', async () => {
  const r = await window.brain.setKey($('key').value);
  $('key').value = '';
  if (r.ok) msg('¡Listo! Ya puedo charlar contigo de cualquier cosa 🧠', 'ok'); else msg(r.error, 'err');
  render(r.status);
});
$('key').addEventListener('keydown', e => { if (e.key === 'Enter') $('save').click(); });
$('clear').addEventListener('click', async () => { render(await window.brain.clearKey()); msg('Clave quitada. Sigo entendiendo las órdenes sencillas.', 'ok'); });
$('saveLimit').addEventListener('click', async () => {
  const r = await window.brain.setLimit($('limit').value);
  if (r.ok) msg('Límite guardado ✓', 'ok'); else msg('El límite tiene que estar entre 0,1 y 100 $.', 'err');
  render(r.status);
});
$('console').addEventListener('click', () => window.brain.openConsole());
$('close').addEventListener('click', () => window.brain.close());
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.brain.close(); });
refresh();
