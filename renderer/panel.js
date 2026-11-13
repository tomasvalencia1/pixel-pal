// Panel con todas las sesiones y el progreso de sus tareas
const Panel = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `hace ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    return `hace ${Math.round(m / 60)} h`;
  }

  function shortTool(tool) {
    return String(tool || '').replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '').replace(/^mcp__/, '');
  }

  function statusText(s) {
    switch (s.status) {
      case 'waiting': return s.message || 'Necesita tu atención';
      case 'working': return `Trabajando · ${shortTool(s.tool)}${s.detail ? ' ' + s.detail : ''}`;
      case 'thinking': return 'Pensando…';
      case 'done': return 'Terminado ✓';
      case 'limited': return `⏳ ${s.message || 'Límite de uso alcanzado'}`;
      default: return 'En espera';
    }
  }

  // 🦀 mini-Pal de pixel art para cada sesión, con los colores del personaje actual y la cara según el estado.
  // Dos fotogramas: el panel se repinta cada segundo y se alternan (trabajando da saltitos, durmiendo cambian las z).
  const BODY = ['...OOOOOOOOOO...', '...OOOOOOOOOO...', '.OOOOEOOOOEOOOO.', '.OOOOEOOOOEOOOO.', '...OOOOOOOOOO...', '...OOOOOOOOOO...', '...SSSSSSSSSS...', '....S.S..S.S....', '....S.S..S.S....'];
  const MINI_W = 16, MINI_H = 14;
  let miniCache = { key: '', icons: {} };
  function miniPal(status, frame) {
    const C = (window.ClawdSprite && ClawdSprite.api && ClawdSprite.api.C) || { body: '#D97757', shade: '#B85C3E', eye: '#1F1A17', white: '#FFFFFF' };
    const key = `${C.body}|${C.shade}|${C.eye}`;
    if (miniCache.key !== key) miniCache = { key, icons: {} };
    const id = `${status}-${frame}`;
    if (miniCache.icons[id]) return miniCache.icons[id];
    const cv = document.createElement('canvas');
    cv.width = MINI_W; cv.height = MINI_H;
    const g = cv.getContext('2d');
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
    const bob = status === 'working' && frame ? -1 : 0;
    const oy = 5 + bob;
    BODY.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === 'O' || ch === 'E') px(x, oy + y, C.body);
      else if (ch === 'S') px(x, oy + y, C.shade);
    }));
    // ojos
    const eye = (x, y) => px(x, oy + y, C.eye);
    if (status === 'done') { eye(4, 2); eye(5, 1); eye(6, 2); eye(9, 2); eye(10, 1); eye(11, 2); }          // ^ ^
    else if (status === 'idle' || status === 'limited') { eye(4, 3); eye(5, 3); eye(10, 3); eye(11, 3); }       // dormido
    else if (status === 'working') { eye(5, 3); eye(10, 3); eye(5, 2); eye(10, 2); }                           // concentrado
    else { eye(5, 2); eye(5, 3); eye(10, 2); eye(10, 3); px(5, oy + 2, C.white || '#fff'); px(10, oy + 2, C.white || '#fff'); }
    // lo de encima
    if (status === 'waiting') { for (const y of [0, 1, 2]) px(14, y, '#E5484D'); px(14, 4, '#E5484D'); }
    else if (status === 'done') { px(11, 2, '#5BE37D'); px(12, 3, '#5BE37D'); px(13, 2, '#5BE37D'); px(14, 1, '#5BE37D'); px(15, 0, '#5BE37D'); }
    else if (status === 'thinking') { const c = '#C9BFAE'; px(frame ? 11 : 10, 2, c); px(12, 2, c); px(frame ? 15 : 14, 2, c); }
    else if (status === 'working') { const c = '#F2C14E'; if (frame) { px(14, 1, c); px(13, 2, c); px(15, 2, c); px(14, 3, c); } else px(14, 2, c); }
    else if (status === 'limited') { const c = '#F2C14E'; px(13, 0, c); px(14, 0, c); px(15, 0, c); px(14, 1, c); px(14, 2, c); px(13, 3, c); px(14, 3, c); px(15, 3, c); }
    else { const c = '#A39A92'; const dx = frame ? 1 : 0; px(12 + dx, 0, c); px(13 + dx, 0, c); px(13 + dx, 1, c); px(12 + dx, 2, c); px(13 + dx, 2, c); }   // z
    return (miniCache.icons[id] = cv.toDataURL());
  }

  function card(s, now) {
    const tasks = s.tasks || [];
    const done = tasks.filter(t => t.status === 'completed').length;
    const current = tasks.find(t => t.status === 'in_progress') || tasks.find(t => t.status === 'pending');
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const progress = tasks.length ? `
      <div class="progress">
        <div class="bar ${done === tasks.length ? 'full' : ''}"><i style="width:${pct}%"></i></div>
        <div class="progress-row">
          <span class="current">${current ? esc(current.content) : 'Todas las tareas listas'}</span>
          <span>${done}/${tasks.length}</span>
        </div>
      </div>` : '';
    return `
      <div class="card ${s.status}${s.win ? ' jump' : ''}" data-id="${esc(s.id)}" title="${s.win ? 'Clic: ir a su ventana (' + esc(s.win.app) + ')' : esc(s.cwd)}">
        <div class="row">
          <img class="mini" alt="" src="${miniPal(s.status, Math.floor(now / 1000) % 2)}">
          <span class="name">${esc(s.project)}</span>
          ${s.win ? `<span class="app-chip">↗ ${esc(s.win.app)}</span>` : ''}
          <span class="ago">${ago(now - s.lastEvent)}</span>
        </div>
        <div class="status ${s.status}">${esc(statusText(s))}</div>
        ${progress}
      </div>`;
  }

  function render(el, sessions, now) {
    if (!sessions.length) {
      el.innerHTML = '<div class="empty">No hay sesiones de Claude Code abiertas.<br>Abre una y aquí verás cómo va 👀</div>';
      return;
    }
    el.innerHTML = sessions.map(s => card(s, now)).join('');
  }

  // Botón de la rejilla: icono arriba, texto abajo (sin rehacer el botón si no cambia nada)
  function tile(btn, icon, label) {
    if (!btn) return;
    let i = btn.querySelector('.t-i'), l = btn.querySelector('.t-l');
    if (!i || !l) {
      btn.textContent = '';
      i = document.createElement('span'); i.className = 't-i';
      l = document.createElement('span'); l.className = 't-l';
      btn.append(i, l);
    }
    if (i.textContent !== icon) i.textContent = icon;
    if (l.textContent !== label) l.textContent = label;
  }

  return { render, shortTool, tile, miniPal };
})();
