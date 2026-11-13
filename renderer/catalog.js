// Catálogo de personajes y accesorios de la tienda (lo usan la ventana de Pal, la tienda y el proceso principal)
const CATALOG = {
  skins: [
    { id: 'clawd', name: 'Pal', emoji: '🦀', desc: 'El de siempre: pinzas, buen humor y mucho código.' },
    { id: 'naranja', name: 'Pal naranja', emoji: '🧡', desc: 'El Pal clásico, con sus colores naranjas de toda la vida.' },
    { id: 'bolt', name: 'Bolt', emoji: '🤖', desc: 'Robot con antena y tornillos. Habla en binario cuando se aburre.' },
    { id: 'miso', name: 'Miso', emoji: '🐱', desc: 'Gatito gris con cola juguetona. Ronronea si le haces caso.' },
    { id: 'nube', name: 'Nube', emoji: '👻', desc: 'Fantasmita flotante. A medianoche se pone travieso.' },
    { id: 'rin', name: 'Rin', emoji: '🐸', desc: 'Rana saltarina que caza moscas (y tareas) con la lengua.' },
    // 🎁 secretos: solo salen en regalos
    { id: 'retro', name: 'Pal retro', emoji: '🎮', desc: 'Verde de consola de los 90. Cuatro tonos y mucha nostalgia.', drop: 'raro' },
    { id: 'sombra', name: 'Pal sombra', emoji: '🌑', desc: 'Sale de noche y le brillan los ojos. Misterioso… pero majo.', drop: 'epico' },
    { id: 'dorado', name: 'Pal dorado', emoji: '👑', desc: 'De oro macizo y lleno de destellos. Muy, muy difícil de conseguir.', drop: 'legendario' },
    { id: 'arcoiris', name: 'Pal arcoíris', emoji: '🌈', desc: 'Cambia de color sin parar. El más raro de todos.', drop: 'legendario' },
    { id: 'chispa', name: 'Chispa', emoji: '🐉', desc: 'Dragoncito con alas y cola. Echa humo… y fuego.' },
  ],
  hats: [
    { id: 'none', name: 'Sin sombrero', emoji: '🚫' },
    { id: 'cap', name: 'Gorra', emoji: '🧢' },
    { id: 'cowboy', name: 'Sombrero vaquero', emoji: '🤠' },
    { id: 'chef', name: 'Gorro de chef', emoji: '👨‍🍳' },
    { id: 'lazo', name: 'Lazo', emoji: '🎀' },
    { id: 'viking', name: 'Casco vikingo', emoji: '🪖' },
    { id: 'santa', name: 'Gorro navideño', emoji: '🎅' },
    { id: 'witch', name: 'Sombrero de bruja', emoji: '🧙' },
    { id: 'nightcap', name: 'Gorrito de dormir', emoji: '😴' },
    // exclusivos: se desbloquean subiendo de nivel
    { id: 'beanie', name: 'Gorro de lana', emoji: '🧶', lvl: 2 },
    { id: 'party', name: 'Gorro de fiesta', emoji: '🥳', lvl: 3 },
    { id: 'tophat', name: 'Chistera', emoji: '🎩', lvl: 4 },
    { id: 'flowers', name: 'Corona de flores', emoji: '🌼', lvl: 5 },
    { id: 'crown', name: 'Corona de rey', emoji: '👑', lvl: 7 },
    // 🎁 coleccionables de regalo
    { id: 'propeller', name: 'Gorra con hélice', emoji: '🚁', drop: 'raro' },
    { id: 'halo', name: 'Aureola', emoji: '😇', drop: 'epico' },
    { id: 'pumpkin', name: 'Calabaza', emoji: '🎃', drop: 'raro', season: 'halloween' },
    { id: 'antlers', name: 'Cuernos de reno', emoji: '🦌', drop: 'raro', season: 'xmas' },
    { id: 'cupid', name: 'Diadema de Cupido', emoji: '💘', drop: 'raro', season: 'valentine' },
  ],
  glasses: [
    { id: 'none', name: 'Sin gafas', emoji: '🚫' },
    { id: 'round', name: 'Gafas redondas', emoji: '👓' },
    { id: 'sun', name: 'Gafas de sol', emoji: '🕶️' },
    { id: 'heart', name: 'Gafas de corazón', emoji: '😍' },
    { id: 'monocle', name: 'Monóculo', emoji: '🧐' },
    { id: 'star', name: 'Gafas de estrella', emoji: '⭐', drop: 'comun' },
    { id: 'pixel', name: 'Gafas 8 bits', emoji: '😎', drop: 'raro' },
    { id: 'visor', name: 'Visor cíber', emoji: '🥽', drop: 'epico' },
  ],
  neck: [
    { id: 'none', name: 'Nada', emoji: '🚫' },
    { id: 'scarf', name: 'Bufanda', emoji: '🧣' },
    { id: 'bow', name: 'Pajarita', emoji: '🎀' },
    { id: 'bandana', name: 'Pañuelo', emoji: '🤠' },
    { id: 'necklace', name: 'Collar de perlas', emoji: '📿' },
    { id: 'medal', name: 'Medalla', emoji: '🏅', drop: 'comun' },
    { id: 'bell', name: 'Cascabel', emoji: '🔔', drop: 'comun' },
    { id: 'cape', name: 'Capa de héroe', emoji: '🦸', drop: 'epico' },
  ],
};

// Nivel a partir de la experiencia (la misma fórmula que boost.js)
// Edición personal: el Pal base ya es naranja, así que el "otro Pal" es el verde azulado con antena
{
  const ed = typeof window !== 'undefined' ? window.PAL_EDITION : (typeof process !== 'undefined' && process.env ? process.env.PAL_EDITION : '');
  const i = CATALOG.skins.findIndex(x => x.id === 'naranja');
  if (ed === 'personal' && i >= 0) CATALOG.skins[i] = { id: 'turquesa', name: 'Pal turquesa', emoji: '🩵', desc: 'Verde azulado y con antena: el Pal de la versión para compartir.' };
}

// 🎁 Rarezas de los regalos (probabilidad en % y XP si te sale repetido)
CATALOG.RARITY = {
  comun: { name: 'Común', color: '#9AA3AD', p: 58, xp: 5 },
  raro: { name: 'Raro', color: '#4C8DE0', p: 28, xp: 15 },
  epico: { name: 'Épico', color: '#A779F2', p: 11, xp: 40 },
  legendario: { name: 'Legendario', color: '#F2C14E', p: 3, xp: 100 },
};
CATALOG.RARITY_ORDER = ['comun', 'raro', 'epico', 'legendario'];
// Temporadas: sus coleccionables solo salen esos días (mes-día, el de Navidad cruza el año)
CATALOG.SEASONS = {
  halloween: { name: 'Halloween', emoji: '🎃', from: '10-20', to: '11-05' },
  xmas: { name: 'Navidad', emoji: '🎄', from: '12-10', to: '01-06' },
  valentine: { name: 'San Valentín', emoji: '💘', from: '02-07', to: '02-16' },
};
CATALOG.inSeason = (season, date = new Date()) => {
  const S = CATALOG.SEASONS[season];
  if (!S) return true;
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return S.from <= S.to ? md >= S.from && md <= S.to : md >= S.from || md <= S.to;
};
CATALOG.SLOTS = { skins: 'skin', hats: 'hat', glasses: 'glasses', neck: 'neck' };
// Todos los coleccionables de regalo: { list, slot, ...artículo }
CATALOG.collectibles = () => Object.entries(CATALOG.SLOTS).flatMap(([list, slot]) => CATALOG[list].filter(it => it.drop).map(it => ({ list, slot, ...it })));

CATALOG.levelOf = xp => Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * (Number(xp) || 0))) / 2));

// Comprueba y completa un conjunto (personaje + accesorios); lo que no exista o no esté desbloqueado se quita
// owned: ids de coleccionables que tienes (los de regalo solo se pueden poner si te han salido)
CATALOG.clean = (outfit, level = 1, owned = []) => {
  const o = outfit && typeof outfit === 'object' ? outfit : {};
  const have = it => !it.drop || owned.includes(it.id);
  const ok = (list, id) => { const it = list.find(x => x.id === id); return it && (!it.lvl || level >= it.lvl) && have(it) ? id : 'none'; };
  const sk = CATALOG.skins.find(x => x.id === o.skin);
  return {
    skin: sk && have(sk) ? o.skin : 'clawd',
    hat: ok(CATALOG.hats, o.hat),
    glasses: ok(CATALOG.glasses, o.glasses),
    neck: ok(CATALOG.neck, o.neck),
  };
};

if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
