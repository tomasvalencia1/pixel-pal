// Panel que aparece al pasar el ratón por Clawd: cabecera con el personaje y el nivel,
// rejilla de botones grandes y la sección "Más". Los botones de siempre (sit, dance, sound, pomobtn…)
// siguen funcionando igual: aquí solo se añade lo nuevo del diseño.
const Menu = (() => {
  const $ = id => document.getElementById(id);
  const more = $('more'), moreBtn = $('morebtn');

  function setMore(open) {
    more.classList.toggle('hidden', !open);
    moreBtn.classList.toggle('on', open);
    Panel.tile(moreBtn, open ? '✕' : '⋯', open ? 'Menos' : 'Más');
  }
  moreBtn.addEventListener('click', e => { e.stopPropagation(); setMore(more.classList.contains('hidden')); });
  $('optbtn').addEventListener('click', e => { e.stopPropagation(); window.clawd.contextMenu(); });
  $('brainbtn').addEventListener('click', e => { e.stopPropagation(); window.clawd.openBrain(); });

  // Cabecera: quién es y cómo va
  function refresh() {
    const o = window.Characters ? Characters.outfit() : { skin: 'clawd' };
    const s = CATALOG.skins.find(x => x.id === o.skin) || CATALOG.skins[0];
    if ($('pAvatar').textContent !== s.emoji) $('pAvatar').textContent = s.emoji;
    if ($('pName').textContent !== s.name) $('pName').textContent = s.name;
    const n = (state.sessions || []).length;
    const active = (state.sessions || []).filter(x => ['working', 'thinking', 'waiting'].includes(x.status)).length;
    $('pCount').textContent = n ? (active ? `${active} activa${active === 1 ? '' : 's'} de ${n}` : `${n}`) : '';
    // al cerrarse el panel, "Más" vuelve a plegarse
    if (panel.classList.contains('hidden') && !more.classList.contains('hidden')) setMore(false);
  }
  setInterval(refresh, 1000);
  refresh();
  Panel.tile(moreBtn, '⋯', 'Más');
  return { refresh };
})();
window.Menu = Menu;
