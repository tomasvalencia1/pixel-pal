// Personaje y accesorios elegidos en la tienda, personalidad de cada personaje y sus easter eggs.
// Usa lo que definen app.js / extras.js (Speech, Phrases, ClawdSprite, Sound, pinned, updatePanel) y skins.js.
const Characters = (() => {
  let outfit = { skin: 'clawd', hat: 'none', glasses: 'none', neck: 'none' };
  let skin = null;
  const canvasEl = document.getElementById('clawd');
  const emojiOf = id => (CATALOG.skins.find(s => s.id === id) || {}).emoji || '🦀';

  function apply(o) {
    if (!o || typeof o !== 'object') return;
    const prev = outfit.skin;
    outfit = { ...outfit, ...o };
    skin = Skins.get(outfit.skin);
    ClawdSprite.setSkin(skin);
    if (prev !== outfit.skin && initDone) {
      ClawdSprite.trigger('hello');
      if (window.Sound) Sound.play('hello');
      Speech.say(skin ? pickOwn('hello') : '¡Vuelvo a ser yo! 🦀', 3, { dur: 3500 });
    }
  }
  let initDone = false;
  setTimeout(() => { initDone = true; }, 1500);

  // ---------- personalidad: frases propias de cada personaje ----------
  const MAP = {
    hello: 'hello', helloMorning: 'hello', helloAfternoon: 'hello', helloNight: 'hello',
    done: 'done', doneLong: 'done', allDone: 'done',
    idle: 'idle', poke: 'poke', drag: 'drag', sleep: 'sleep', petted: 'pet',
  };
  // 💕 cómo agradece las caricias cada personaje
  const PET = {
    bolt: ['Bip… caricia detectada. Felicidad al 100% 💙', 'Mis circuitos ronronean 🤖💕', 'Error 404: enfado no encontrado 😊'],
    miso: ['Prrrr… prrrr… 😻', '¡Ahí, ahí! Detrás de la oreja 🐾', 'Miau 💕 (no pares)'],
    nube: ['¡Uuuh~ qué gustito! 👻💕', 'Me haces flotar más alto ☁️', 'Si me sigues mimando me voy a evaporar de felicidad 🥰'],
    rin: ['¡Croac! Eso me gusta 🐸💚', 'Me pongo verde… de felicidad', 'Un salto de alegría, ¡boing! 💚'],
    chispa: ['¡Se me escapa una llamita de alegría! 🔥💕', 'Los dragones también queremos mimos 🐉', 'Prometo no quemarte… mucho 😇'],
  };
  function pickOwn(group) {
    const list = (skin && skin.phrases && skin.phrases[group]) || (group === 'pet' && skin && PET[skin.id]);
    return list && list.length ? list[Math.floor(Math.random() * list.length)] : '';
  }
  const originalPick = Phrases.pick;
  Phrases.pick = (key, vars) => {
    if (skin && MAP[key] && Math.random() < 0.65) {
      const own = pickOwn(MAP[key]);
      if (own) return own;
    }
    const t = originalPick(key, vars);
    return skin && t ? t.replace(/🦀/g, emojiOf(skin.id)).replace(/Mini Pals/g, `Mini ${skin.id[0].toUpperCase()}${skin.id.slice(1)}s`) : t;
  };

  // ---------- easter eggs ----------
  const ctx = {
    say: text => Speech.say(text, 3, { dur: 4500 }),
    sound: n => { if (window.Sound) Sound.play(n); },
    trigger: n => ClawdSprite.trigger(n),
    fade: ms => {                                     // se vuelve casi invisible y reaparece
      canvasEl.style.transition = 'opacity 0.5s ease';
      canvasEl.style.opacity = '0.12';
      setTimeout(() => { canvasEl.style.opacity = ''; }, ms);
    },
  };

  // 5 toques rápidos sobre el personaje
  let downAt = null;
  let taps = [];
  canvasEl.addEventListener('pointerdown', e => { downAt = { x: e.screenX, y: e.screenY }; });
  canvasEl.addEventListener('pointerup', e => {
    if (!downAt || Math.abs(e.screenX - downAt.x) + Math.abs(e.screenY - downAt.y) > 4) { downAt = null; return; }
    downAt = null;
    if (window.Boost) Boost.cheer(1);   // 💛 un toque le sube el ánimo
    const now = Date.now();
    taps = taps.filter(x => now - x < 2500);
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      setTimeout(() => { pinned = false; updatePanel(); egg(); }, 60);   // los clics fijan el panel: se suelta
    }
  });
  function egg() {
    if (skin && skin.egg) return skin.egg(ctx);
    // Pal también tiene el suyo: lluvia de corazones y saltito
    ClawdSprite.trigger('love');
    ctx.sound('done');
    ctx.say('🦀 ¡Clic, clic, clic! Me haces cosquillas en las pinzas 💕');
  }

  // Horas secretas de cada personaje (una vez al día cada una)
  const said = {};
  setInterval(() => {
    if (!skin || !skin.timeEggs) return;
    const d = new Date();
    const day = d.toLocaleDateString('sv');
    for (const te of skin.timeEggs) {
      const k = `${skin.id}-${te.h}-${te.m}-${day}`;
      if (d.getHours() === te.h && d.getMinutes() === te.m && !said[k] && !Speech.asking()) { said[k] = true; te.run(ctx); }
    }
  }, 20000);

  // ---------- ajustes que llegan del proceso principal ----------
  window.clawd.onPrefs(p => { if (p && p.outfit) apply(p.outfit); });
  window.clawd.onCommand(c => {
    if (c && c.outfit) apply(c.outfit);
    else if (c && c.prefs && c.prefs.outfit) apply(c.prefs.outfit);
    else if (c && typeof c.preview === 'string' && c.preview.startsWith('c:')) preview(c.preview.slice(2));
  });

  // Pruebas: /preview?a=c:egg | c:time | c:skin-bolt
  function preview(cmd) {
    if (cmd === 'egg') egg();
    else if (cmd === 'time' && skin && skin.timeEggs) skin.timeEggs[0].run(ctx);
    else if (cmd.startsWith('skin-')) window.clawd.setOutfit({ skin: cmd.slice(5) });
  }

  return {
    // lo que lleva puesto (extras.js lo mezcla con el pijama, los disfraces por fecha y los modos por app)
    hat: () => (outfit.hat && outfit.hat !== 'none' ? outfit.hat : null),
    wear: () => ({ glasses: outfit.glasses !== 'none' ? outfit.glasses : null, neckwear: outfit.neck !== 'none' ? outfit.neck : null }),
    outfit: () => ({ ...outfit }),
  };
})();
window.Characters = Characters;
