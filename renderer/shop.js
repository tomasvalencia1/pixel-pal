// Tienda: elegir personaje y accesorios (todo gratis; algunos sombreros se desbloquean subiendo de nivel)
const $ = id => document.getElementById(id);
const canvas = $('sprite');
ClawdSprite.setup(canvas);

let outfit = { skin: 'clawd', hat: 'none', glasses: 'none', neck: 'none' };
let level = 1;
let items = {};          // 🎁 coleccionables que tienes { id: cuántos }
let pending = 0;         // regalos por abrir
let tab = 'skins';
let hover = null;              // { slot, id } que se está probando con el ratón
const SLOT = { skins: 'skin', hats: 'hat', glasses: 'glasses', neck: 'neck' };
const R = CATALOG.RARITY;
const owns = it => !it.drop || (items[it.id] || 0) > 0;
function apply(r) { if (!r) return; if (r.outfit) outfit = r.outfit; if (r.level) level = r.level; if (r.items) items = r.items; if (typeof r.pending === 'number') pending = r.pending; }

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
  $('giftbtn').hidden = !(pending > 0);
  $('giftbtn').textContent = `🎁 Abrir regalo${pending > 1 ? ` (${pending})` : ''}`;
  if (tab === 'dex') return renderDex(grid);
  const slot = SLOT[tab];
  for (const it of CATALOG[tab]) {
    if (!owns(it)) continue;
    const locked = it.lvl && level < it.lvl;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item' + (outfit[slot] === it.id ? ' on' : '');
    b.disabled = !!locked;
    const em = document.createElement('span'); em.className = 'em'; em.textContent = locked ? '🔒' : it.emoji;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name;
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = outfit[slot] === it.id ? 'Puesto ✓' : locked ? `Nivel ${it.lvl}` : it.lvl ? `⭐ Exclusivo nivel ${it.lvl}` : it.drop ? `🎁 ${R[it.drop].name}` : 'Gratis';
    if (it.drop && outfit[slot] !== it.id) tag.style.color = R[it.drop].color;
    b.append(em, nm, tag);
    if (!locked) {
      b.addEventListener('mouseenter', () => { hover = { slot, id: it.id }; showInfo(); });
      b.addEventListener('mouseleave', () => { hover = null; showInfo(); });
      b.addEventListener('click', () => choose({ [slot]: it.id }));
    }
    grid.appendChild(b);
  }
  $('hint').textContent = tab === 'dex' ? 'Los coleccionables salen en los regalos: uno al día, a veces al terminar tareas o pomodoros, y cada 5 niveles.' : tab === 'hats' ? `Tu nivel: ${level}. Los sombreros exclusivos se desbloquean subiendo de nivel.` : 'Pasa el ratón por encima para probártelo y haz clic para ponértelo.';
  showInfo();
}

// 📖 Pal-dex: todos los coleccionables por rareza; los que faltan, en gris y con «???»
function renderDex(grid) {
  const all = CATALOG.collectibles();
  const got = all.filter(it => (items[it.id] || 0) > 0).length;
  const head = document.createElement('div'); head.className = 'dexhead';
  head.innerHTML = `<b>Colección ${got}/${all.length}</b><span class="dexbar"><i style="width:${Math.round((got / all.length) * 100)}%"></i></span><span>${pending > 0 ? `🎁 ${pending} por abrir` : ''}</span>`;
  grid.appendChild(head);
  for (const rk of CATALOG.RARITY_ORDER.slice().reverse()) {
    const list = all.filter(it => it.drop === rk);
    if (!list.length) continue;
    const sec = document.createElement('div'); sec.className = 'dexsec'; sec.style.color = R[rk].color;
    sec.textContent = `${R[rk].name} · ${list.filter(it => items[it.id] > 0).length}/${list.length}`;
    grid.appendChild(sec);
    for (const it of list) {
      const n = items[it.id] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item' + (n ? '' : ' missing') + (n && outfit[it.slot] === it.id ? ' on' : '');
      const em = document.createElement('span'); em.className = 'em'; em.textContent = n ? it.emoji : '❔';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = n ? it.name : '???';
      const rr = document.createElement('span'); rr.className = 'rar'; rr.style.color = R[rk].color;
      const S = it.season && CATALOG.SEASONS[it.season];
      rr.textContent = S && !n ? `${S.emoji} Solo en ${S.name}` : R[rk].name;
      b.append(em, nm, rr);
      if (n > 1) { const c = document.createElement('span'); c.className = 'cnt'; c.textContent = `×${n}`; b.appendChild(c); }
      if (n) {
        b.title = it.desc || `${it.name} (${R[rk].name})`;
        b.addEventListener('mouseenter', () => { hover = { slot: it.slot, id: it.id }; showInfo(); });
        b.addEventListener('mouseleave', () => { hover = null; showInfo(); });
        b.addEventListener('click', () => choose({ [it.slot]: it.id }));
      } else b.disabled = true;
      grid.appendChild(b);
    }
  }
  showInfo();
}

async function choose(patch) {
  try {
    apply(await window.shop.set(patch));
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
window.shop.onUpdate(d => { if (d) { apply(d); render(); } });
if (window.shop.onTab) window.shop.onTab(t => { tab = t; render(); });
$('giftbtn').addEventListener('click', () => window.shop.openGift());

(async () => {
  try { apply(await window.shop.get()); } catch { /* nada */ }
  if (['skins', 'hats', 'glasses', 'neck', 'dex'].includes(location.hash.slice(1))) tab = location.hash.slice(1);
  render();
  requestAnimationFrame(frame);
})();
