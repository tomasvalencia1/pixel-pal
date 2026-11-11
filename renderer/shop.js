// Tienda: elegir personaje y accesorios (todo gratis; algunos sombreros se desbloquean subiendo de nivel)
const $ = id => document.getElementById(id);
const canvas = $('sprite');
ClawdSprite.setup(canvas);

let outfit = { skin: 'clawd', hat: 'none', glasses: 'none', neck: 'none' };
let level = 1;
let tab = 'skins';
let hover = null;              // { slot, id } que se está probando con el ratón
const SLOT = { skins: 'skin', hats: 'hat', glasses: 'glasses', neck: 'neck' };

// ---------- vista previa animada ----------
const SHOW = [['idle', 4], ['wave', 2.5], ['dance', 4], ['thinking', 3], ['editing', 3], ['celebrate', 3]];
let showIdx = 0, showAt = 0;
function current() {
  const o = { ...outfit };
  if (hover) o[hover.slot] = hover.id;
  return o;
}
function frame(ms) {
  const t = ms / 1000;
  if (t - showAt > SHOW[showIdx][1]) { showIdx = (showIdx + 1) % SHOW.length; showAt = t; }
  const o = current();
  const skin = Skins.get(o.skin);
  ClawdSprite.setSkin(skin);
  const action = SHOW[showIdx][0];
  ClawdSprite.draw(null, t, action, {
    groove: action === 'dance' ? { bpm: 112 } : null,
    wear: { hat: o.hat !== 'none' ? o.hat : null, glasses: o.glasses !== 'none' ? o.glasses : null, neckwear: o.neck !== 'none' ? o.neck : null },
  });
  requestAnimationFrame(frame);
}

function showInfo() {
  const o = current();
  const s = CATALOG.skins.find(x => x.id === o.skin) || CATALOG.skins[0];
  $('name').textContent = `${s.emoji} ${s.name}`;
  $('desc').textContent = s.desc;
}

// ---------- rejilla de artículos ----------
function render() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const grid = $('grid');
  grid.innerHTML = '';
  const slot = SLOT[tab];
  for (const it of CATALOG[tab]) {
    const locked = it.lvl && level < it.lvl;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item' + (outfit[slot] === it.id ? ' on' : '');
    b.disabled = !!locked;
    const em = document.createElement('span'); em.className = 'em'; em.textContent = locked ? '🔒' : it.emoji;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name;
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = outfit[slot] === it.id ? 'Puesto ✓' : locked ? `Nivel ${it.lvl}` : it.lvl ? `⭐ Exclusivo nivel ${it.lvl}` : 'Gratis';
    b.append(em, nm, tag);
    if (!locked) {
      b.addEventListener('mouseenter', () => { hover = { slot, id: it.id }; showInfo(); });
      b.addEventListener('mouseleave', () => { hover = null; showInfo(); });
      b.addEventListener('click', () => choose({ [slot]: it.id }));
    }
    grid.appendChild(b);
  }
  $('hint').textContent = tab === 'hats' ? `Tu nivel: ${level}. Los sombreros exclusivos se desbloquean subiendo de nivel.` : 'Pasa el ratón por encima para probártelo y haz clic para ponértelo.';
  showInfo();
}

async function choose(patch) {
  try {
    const r = await window.shop.set(patch);
    outfit = r.outfit; level = r.level;
  } catch { /* nada */ }
  hover = null;
  render();
}

// ---------- sorpresa del personaje (su easter egg, sin sonido) ----------
const ctx = {
  say: text => { $('said').textContent = text; clearTimeout(ctx.tm); ctx.tm = setTimeout(() => { $('said').textContent = ''; }, 4500); },
  sound: () => {},
  trigger: n => ClawdSprite.trigger(n),
  fade: ms => { canvas.style.opacity = '0.12'; setTimeout(() => { canvas.style.opacity = ''; }, ms); },
};
$('eggbtn').addEventListener('click', () => {
  const skin = Skins.get(current().skin);
  if (skin && skin.egg) skin.egg(ctx);
  else { ClawdSprite.trigger('love'); ctx.say('🦀 ¡Me haces cosquillas en las pinzas! 💕'); }
});

$('tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) { tab = t.dataset.tab; render(); } });
$('reset').addEventListener('click', () => choose({ hat: 'none', glasses: 'none', neck: 'none' }));
$('close').addEventListener('click', () => window.shop.close());
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.shop.close(); });
window.shop.onUpdate(d => { if (d && d.outfit) { outfit = d.outfit; level = d.level || level; render(); } });

(async () => {
  try { const r = await window.shop.get(); outfit = r.outfit; level = r.level; } catch { /* nada */ }
  render();
  requestAnimationFrame(frame);
})();
