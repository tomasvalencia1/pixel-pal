// Ventana flotante: sesiones que están trabajando + abrir una sesión nueva con el archivo que soltaste
const list = document.getElementById('list');
const newBox = document.getElementById('newBox');
const result = document.getElementById('result');

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const shortTool = t => String(t || '').replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '');
const STATUS = { working: s => `Trabajando · ${shortTool(s.tool)}${s.detail ? ' ' + s.detail : ''}`, thinking: () => 'Pensando…', waiting: s => s.message || 'Necesita tu atención' };

function render(d) {
  list.innerHTML = '';
  if (!d.sessions.length) list.appendChild(el('div', 'empty', 'Ninguna sesión trabajando ahora mismo.'));
  for (const s of d.sessions) {
    const card = el('div', 'card');
    const row = el('div', 'row');
    row.append(el('span', `dot ${s.status}`), el('span', 'name', s.project));
    card.append(row, el('div', 'status', (STATUS[s.status] || (() => ''))(s)));
    const tasks = s.tasks || [];
    if (tasks.length) {
      const done = tasks.filter(t => t.status === 'completed').length;
      const cur = tasks.find(t => t.status === 'in_progress') || tasks.find(t => t.status === 'pending');
      const bar = el('div', 'bar'); const i = el('i'); i.style.width = `${Math.round((done / tasks.length) * 100)}%`; bar.appendChild(i);
      card.append(bar, el('div', 'status', `${done}/${tasks.length} · ${cur ? cur.content : 'Todo listo'}`));
    }
    list.appendChild(card);
  }

  newBox.innerHTML = '';
  if (d.file) {
    const f = el('div', 'file');
    const name = d.file.split(/[\\/]/).pop();
    const fname = el('span', 'fname', `📄 ${name}`); fname.title = d.file;
    const x = el('button', null, '✕'); x.title = 'Quitar archivo'; x.onclick = () => window.sess.action('clear');
    f.append(fname, x);
    newBox.appendChild(f);
  } else {
    newBox.appendChild(el('div', 'empty', 'Suelta un archivo sobre Clawd para empezar una sesión con él.'));
  }

  const b1 = el('button', 'btn primary');
  b1.append(document.createTextNode(d.file ? '🦀 Abrir Claude con este archivo' : '🦀 Abrir Claude'));
  b1.appendChild(el('small', null, d.file ? 'Copio el mensaje y traigo Claude al frente: abre una sesión nueva y pega con Ctrl+V' : 'Trae la app de Claude al frente'));
  b1.onclick = () => window.sess.action('claude');
  newBox.appendChild(b1);

  if (d.file && d.cli) {
    const b2 = el('button', 'btn', '⌨️ Nueva sesión en Windows Terminal');
    b2.appendChild(el('small', null, 'Abre `claude` en la carpeta del archivo'));
    b2.onclick = () => window.sess.action('terminal');
    newBox.appendChild(b2);
  }
  if (d.file) {
    const b3 = el('button', 'btn', '📋 Copiar la ruta del archivo');
    b3.onclick = () => window.sess.action('copy');
    newBox.appendChild(b3);
  }
}

window.sess.onData(render);
window.sess.onResult(r => { result.textContent = r.text || ''; result.className = r.ok ? '' : 'err'; });
document.getElementById('close').onclick = () => window.sess.action('close');
