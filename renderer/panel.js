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
      <div class="card ${s.status}">
        <div class="row">
          <span class="dot ${s.status}"></span>
          <span class="name" title="${esc(s.cwd)}">${esc(s.project)}</span>
          <span class="ago">${ago(now - s.lastEvent)}</span>
        </div>
        <div class="status ${s.status}">${esc(statusText(s))}</div>
        ${progress}
      </div>`;
  }

  function render(el, sessions, now) {
    if (!sessions.length) {
      el.innerHTML = '<div class="empty">No hay sesiones activas.<br>Clawd está durmiendo 😴</div>';
      return;
    }
    el.innerHTML = sessions.map(s => card(s, now)).join('');
  }

  return { render, shortTool };
})();
