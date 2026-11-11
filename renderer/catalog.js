// Catálogo de personajes y accesorios de la tienda (lo usan la ventana de Clawd, la tienda y el proceso principal)
const CATALOG = {
  skins: [
    { id: 'clawd', name: 'Clawd', emoji: '🦀', desc: 'El de siempre: pinzas, buen humor y mucho código.' },
    { id: 'bolt', name: 'Bolt', emoji: '🤖', desc: 'Robot con antena y tornillos. Habla en binario cuando se aburre.' },
    { id: 'miso', name: 'Miso', emoji: '🐱', desc: 'Gatito gris con cola juguetona. Ronronea si le haces caso.' },
    { id: 'nube', name: 'Nube', emoji: '👻', desc: 'Fantasmita flotante. A medianoche se pone travieso.' },
    { id: 'rin', name: 'Rin', emoji: '🐸', desc: 'Rana saltarina que caza moscas (y tareas) con la lengua.' },
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
  ],
  glasses: [
    { id: 'none', name: 'Sin gafas', emoji: '🚫' },
    { id: 'round', name: 'Gafas redondas', emoji: '👓' },
    { id: 'sun', name: 'Gafas de sol', emoji: '🕶️' },
    { id: 'heart', name: 'Gafas de corazón', emoji: '😍' },
    { id: 'monocle', name: 'Monóculo', emoji: '🧐' },
  ],
  neck: [
    { id: 'none', name: 'Nada', emoji: '🚫' },
    { id: 'scarf', name: 'Bufanda', emoji: '🧣' },
    { id: 'bow', name: 'Pajarita', emoji: '🎀' },
    { id: 'bandana', name: 'Pañuelo', emoji: '🤠' },
    { id: 'necklace', name: 'Collar de perlas', emoji: '📿' },
  ],
};

// Nivel a partir de la experiencia (la misma fórmula que boost.js)
CATALOG.levelOf = xp => Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * (Number(xp) || 0))) / 2));

// Comprueba y completa un conjunto (personaje + accesorios); lo que no exista o no esté desbloqueado se quita
CATALOG.clean = (outfit, level = 1) => {
  const o = outfit && typeof outfit === 'object' ? outfit : {};
  const ok = (list, id) => { const it = list.find(x => x.id === id); return it && (!it.lvl || level >= it.lvl) ? id : 'none'; };
  return {
    skin: CATALOG.skins.some(s => s.id === o.skin) ? o.skin : 'clawd',
    hat: ok(CATALOG.hats, o.hat),
    glasses: ok(CATALOG.glasses, o.glasses),
    neck: ok(CATALOG.neck, o.neck),
  };
};

if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG;
