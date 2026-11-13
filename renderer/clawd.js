// Sprite pixel art de Pal, dibujado en código.
// Se dibuja en un lienzo real de 40 x 46 píxeles y luego se escala (cada píxel = 4 px en pantalla),
// con un contorno oscuro automático para que se lea bien sobre fondos claros u oscuros.
//
// Cada acción tiene: pose() que mueve el cuerpo, y back/front/over() que dibujan accesorios
// (detrás del cuerpo, delante del cuerpo antes de los brazos, y encima de todo).
// Los accesorios entran con una animación de entrada (k: 0 → 1) y salen con otra (k: 1 → 0).
const ClawdSprite = (() => {
  const GW = 40;
  const GH = 46;
  const GROUND = 43;
  const BASE_BOTTOM = 39; // fila donde termina el cuerpo (empiezan las patas)
  const OUTLINE = 'rgba(30, 20, 16, 0.85)';
  const INTRO = 0.4;
  const OUTRO = 0.35;

  // Edición personal: el Pal naranja de siempre. Compartida: verde azulado con antena.
  const PERSONAL = typeof window !== 'undefined' && window.PAL_EDITION === 'personal';
  const C = {
    ...(PERSONAL
      ? { body: '#D97757', shade: '#B85C3E', light: '#EC9C80', dark: '#7A3A28' }
      : { body: '#3FB8A8', shade: '#2C8F83', light: '#86DDD1', dark: '#1D5E56' }),
    eye: '#1F1A17', shine: '#FFFFFF', blush: '#F6A592',
    metal: '#C9CED6', metalDk: '#8E959F', metalLt: '#EEF1F5',
    screen: '#18212B', green: '#5BE37D', greenDk: '#2E8F48',
    paper: '#FBF6EC', paperLn: '#C9BFAE', wood: '#A87447', woodDk: '#6E4A2D',
    blue: '#4C8DE0', blueDk: '#2F5FA8', sky: '#9FD3F5', land: '#5CB85C', landDk: '#3E8E3E',
    red: '#E5484D', yellow: '#F2C14E', white: '#FFFFFF', pink: '#F28FB1',
    cloud: '#FFFAF5', cloudSh: '#D9D2CB', ink: '#2A2522', cap: '#5B6BD6', capDk: '#4352B5', glass: '#BFE3F2',
  };

  const GLYPH = {
    Z: ['111', '001', '010', '100', '111'],
    '<': ['001', '010', '100', '010', '001'],
    '>': ['100', '010', '001', '010', '100'],
    '/': ['001', '001', '010', '100', '100'],
    '{': ['011', '010', '110', '010', '011'],
    '}': ['110', '010', '011', '010', '110'],
    '=': ['000', '111', '000', '111', '000'],
    '♪': ['011', '011', '010', '110', '110'],
    '2': ['111', '001', '111', '100', '111'],
    '?': ['111', '001', '011', '000', '010'],
  };
  const HEART = ['11.11', '11111', '.111.', '..1..'];

  // Mapa de continentes del globo (24 columnas que giran)
  const LAND = [
    '......##.........###....',
    '....#####......######...',
    '...######.....########..',
    '..#######.....#######...',
    '...####........#####....',
    '....###.........###.##..',
    '.....##..........#.###..',
    '......#...##.......##...',
    '..........###...........',
    '.........####...........',
    '..........##............',
  ];

  // ---------- lienzos ----------
  const off = document.createElement('canvas');
  off.width = GW; off.height = GH;
  const o = off.getContext('2d', { willReadFrequently: true });
  const sil = document.createElement('canvas');
  sil.width = GW; sil.height = GH;
  const s = sil.getContext('2d');
  let fctx = null;
  let U = 4;

  // ---------- utilidades ----------
  const R = Math.round;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = x => 1 - Math.pow(1 - clamp(x), 3);
  const easeBack = x => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const blink = (t, every = 4.3) => (t % every) < 0.13;
  let O = {}; // opciones del fotograma actual (mirada, arrastre, juego, sentado)

  // ---------- personajes (skins.js): cambian colores y añaden detalles, pero usan este mismo esqueleto ----------
  const BASE_PAL = { body: C.body, shade: C.shade, light: C.light, dark: C.dark, blush: C.blush, eye: C.eye };
  let SKIN = null;
  function setSkin(sk) {
    if ((sk && sk.id) === (SKIN && SKIN.id)) return;
    SKIN = sk && sk.id !== 'clawd' ? sk : null;
    Object.assign(C, BASE_PAL, SKIN ? SKIN.palette : {});
  }
  // con sombrero, cascos o disfraz de canción no se dibujan orejas, cuernos ni antena
  function topBlocked(opts, active) {
    const w = opts.wear || {};
    return !!((w.hat && !['sleeping', 'celebrate'].includes(active)) || w.ears || w.head || ['angine', 'chicago'].includes(opts.special));
  }

  // Mira hacia el cursor (si está razonablemente cerca); sonríe si lo tienes encima
  function lookAt(P, smile = false) {
    if (!O.look) return;
    const dx = O.look.x - (20 + P.dx), dy = O.look.y - (BASE_BOTTOM - 10);
    if (Math.abs(dx) > 140 || Math.abs(dy) > 140) return;
    P.lookX = dx > 5 ? 1 : dx < -5 ? -1 : 0;
    P.lookY = dy < -10 ? -1 : dy > 12 ? 1 : 0;
    if (smile && Math.abs(dx) < 14 && Math.abs(dy) < 14 && P.eyes === 'open') P.mouth = 'smile';
  }

  // ---------- modo ritmo (suena música) ----------
  // Devuelve el compás actual a partir de los BPM de la canción
  function beatInfo(t) {
    const bpm = (O.groove && O.groove.bpm) || 116;
    const bt = t * bpm / 60;
    return { beat: Math.floor(bt), ph: bt % 1, bt };
  }

  // Variación bailando de cada animación: se aplica encima de la pose normal
  const NO_GROOVE = ['waiting', 'dance', 'wake', 'funk', 'bass', 'gold', 'two', 'standing', 'chicago', 'thatswhat', 'burger', 'dontstop', 'imight', 'billie', 'angine'];
  function applyGroove(P, active, t) {
    if (NO_GROOVE.includes(active)) return;
    const { beat, ph } = beatInfo(t);
    const down = ph < 0.35;                 // golpe del compás
    const side = beat % 2 ? 1 : -1;
    const jumps = ['celebrate', 'hop', 'walk'].includes(active);

    // cabeceo al ritmo, balanceo y pata que marca el compás
    if (!jumps && !P.tuck) P.bob = (P.bob > 1 ? P.bob : 0) + (down ? 1 : 0);
    if (!jumps) P.dx += down ? side : 0;
    if (!P.tuck && P.legs.every(l => l === 0)) P.legs[side < 0 ? 0 : 3] = down ? 1 : 0;
    if (P.eyes === 'open' && beat % 4 === 0 && down) P.eyes = 'happy';
    P.blush = true;

    switch (active) {
      case 'idle':
      case 'sit': {                          // baile sentado: pinzas arriba alternando
        const up = { x: 0, y: -8 };
        if (side < 0) { P.armL = up; P.openL = down; } else { P.armR = up; P.openR = down; }
        P.mouth = 'grin';
        break;
      }
      case 'thinking': P.armL = { ...P.armL, y: P.armL.y + (down ? 1 : 0) }; break;
      case 'editing':                        // teclea al ritmo y cada 4 tiempos levanta la pinza
        P.armL = { x: -3, y: down ? 7 : 5 };
        P.armR = beat % 4 === 3 ? { x: 1, y: -7 } : { x: -2, y: down ? 5 : 4 };
        P.openR = beat % 4 === 3;
        break;
      case 'terminal': P.armL = { ...P.armL, y: -7 - (down ? 1 : 0) }; break;
      case 'planning': P.armR = { ...P.armR, x: P.armR.x + (down ? 1 : 0) }; break;
      case 'searching': P.mouth = 'smile'; break;
      case 'sleeping': P.sy = down ? -2 : -3; break; // respira al ritmo
      default: break;
    }
  }

  // ---------- variante de cada animación según la canción especial que suena ----------
  // Solo se mueven las pinzas que la animación deja libres (para no romper la laptop, el libro, el globo…)
  const FREE_ARMS = {
    idle: ['L', 'R'], sit: ['L', 'R'], walk: ['L', 'R'], thinking: ['R'], searching: ['L'], terminal: ['R'],
    agent: ['L'], tinkering: ['L'], celebrate: [], editing: [], reading: [], web: [], planning: [], sleeping: [], hop: [],
  };
  const NO_FLAVOR = ['waiting', 'wake', 'dance', 'funk', 'bass', 'gold', 'two', 'burger', 'standing', 'chicago', 'thatswhat', 'dontstop', 'imight', 'billie', 'angine'];
  const isFree = (active, side) => (FREE_ARMS[active] || []).includes(side);
  function setFree(P, active, side, arm, open) {
    if (!isFree(active, side)) return;
    if (side === 'L') { P.armL = arm; if (open !== undefined) P.openL = open; }
    else { P.armR = arm; if (open !== undefined) P.openR = open; }
  }

  function songFlavor(P, active, t, key) {
    if (NO_FLAVOR.includes(active)) return;
    const { beat, ph } = beatInfo(t);
    const down = ph < 0.35;
    const side = beat % 2 ? 1 : -1;
    const canLegs = !P.tuck && P.legs.every(l => l === 0);
    switch (key) {
      case 'funk':                                   // 🕶️ hombros funky y señalar al cielo
        if (!P.tuck && !down) P.sy = Math.max(P.sy, 1);
        if (beat % 8 >= 4) { setFree(P, active, 'R', { x: 1, y: down ? -10 : -8 }); setFree(P, active, 'L', { x: 2, y: 2 }); }
        else { setFree(P, active, 'L', { x: 0, y: side < 0 && down ? -4 : 1 }); setFree(P, active, 'R', { x: 0, y: side > 0 && down ? -4 : 1 }); }
        if (beat % 8 === 7 && P.mouth) P.mouth = 'grin';
        break;
      case 'bass':                                   // 🎸 cabeceo, pisotón y "bajo de aire"
        if (down && beat % 2 === 0 && (P.eyes === 'open' || P.eyes === 'down')) P.eyes = 'closed';
        if (canLegs) P.legs = down && beat % 2 === 0 ? [0, 0, 0, 2] : [0, 0, 0, 0];
        setFree(P, active, 'L', { x: 1, y: -4 });
        setFree(P, active, 'R', { x: -5, y: down ? 4 : 3 }, down);
        break;
      case 'gold':                                   // 💰 levantar el techo
        setFree(P, active, 'L', { x: -1, y: down ? -11 : -8 }, true);
        setFree(P, active, 'R', { x: 1, y: down ? -8 : -11 }, true);
        if (P.eyes === 'open' && beat % 2 === 0) P.eyes = 'happy';
        break;
      case 'two':                                    // ✌️ pinza en V alternando y saltito doble
        if (beat % 2) setFree(P, active, 'L', { x: -1, y: -9 }, true); else setFree(P, active, 'R', { x: 1, y: -9 }, true);
        if (!P.tuck && ph < 0.2) P.bob = Math.min(P.bob, beat % 2 === 0 ? -1 : 0);
        break;
      case 'burger':                                 // 🍔 sostiene una mini hamburguesa y mastica feliz
        setFree(P, active, 'L', { x: 2, y: -2 });
        setFree(P, active, 'R', { x: -2, y: -2 });
        if (beat % 8 === 7) { P.blush = true; if (P.eyes === 'open') P.eyes = 'happy'; }
        break;
      case 'standing': {                             // ⭐ tambaleo y "¡sigo de pie!"
        const cyc = beat % 8;
        if (cyc === 6) { P.dx += ph < 0.5 ? -2 : 2; if (P.eyes === 'open' || P.eyes === 'down') P.eyes = 'wide'; }
        if (cyc === 7) { if (!P.tuck) P.sy += 1; setFree(P, active, 'L', { x: -1, y: -11 }, true); setFree(P, active, 'R', { x: 1, y: -11 }, true); }
        break;
      }
      case 'chicago': {                              // 🎩 deslizamiento tipo moonwalk y saludo con el sombrero
        P.dx += R(Math.sin(((beat + ph) * Math.PI) / 8) * 2);
        if (canLegs) P.legs = Math.floor((beat + ph) * 2) % 2 ? [2, 0, 2, 0] : [0, 2, 0, 2];
        if (beat % 16 >= 14) { setFree(P, active, 'R', { x: -4, y: -11 }, false); if (!P.tuck) P.bob = Math.min(P.bob, -1); }
        break;
      }
      case 'angine': {                               // 🎭 sacudidas en los acentos irregulares y punteo con la pinza libre
        const hitA = ANGINE_ACC[beat % 8] && ph < 0.3;
        if (hitA) { P.dx += beat % 2 ? 1 : -1; if (P.eyes === 'open' || P.eyes === 'down') P.eyes = 'wide'; }
        setFree(P, active, 'R', { x: -3, y: hitA ? 1 : 0 }, hitA);
        setFree(P, active, 'L', { x: 2, y: hitA ? -5 : -3 });
        break;
      }
      case 'imight':                                 // 🕺 mano en la solapa, chasquidos y guiño señalándote cada 8 tiempos
        if (beat % 8 === 7) {
          if (P.eyes === 'open' || P.eyes === 'down') P.eyes = 'wink';
          setFree(P, active, 'R', { x: -3, y: -6 }, false);
        } else {
          setFree(P, active, 'L', { x: 4, y: 1 });
          setFree(P, active, 'R', { x: -1, y: -5 }, !down);
        }
        break;
      case 'billie':                                 // ✨ patada cada 8 tiempos y guante arriba con la pinza libre
        if (canLegs && beat % 8 === 3) P.legs = [0, 0, 0, 3];
        else if (canLegs) P.legs = down ? (side < 0 ? [2, 0, 0, 0] : [0, 0, 0, 2]) : [0, 0, 0, 0];
        setFree(P, active, 'R', { x: -1, y: down ? -7 : -6 });
        break;
      case 'dontstop': {                             // 🎤 corre sin parar y puño en alto cada 8 tiempos
        const f = Math.floor((beat + ph) * 2) % 2;
        if (canLegs) P.legs = f ? [2, 0, 2, 0] : [0, 2, 0, 2];
        if (beat % 8 >= 6) {
          setFree(P, active, 'R', { x: 1, y: -12 }, false);
          if (!isFree(active, 'R')) setFree(P, active, 'L', { x: -1, y: -12 }, false);
          if (P.mouth !== null) P.mouth = 'o';
        } else {
          setFree(P, active, 'R', { x: 0, y: f ? -3 : 1 });
          setFree(P, active, 'L', { x: 0, y: f ? 1 : -3 });
        }
        break;
      }
      case 'thatswhat':                              // 🫰 chasquidos con la pinza libre
        setFree(P, active, 'L', { x: 2, y: -5 }, side < 0 ? !down : true);
        setFree(P, active, 'R', { x: -2, y: -5 }, side > 0 ? !down : true);
        break;
      default: break;
    }
  }

  // 🥁🎸 La banda de mini Pals de I Just Might: batería a la izquierda (si cabe) y guitarra a la derecha
  function miniBand(g, both) {
    const { beat, ph } = beatInfo(g.t);
    const hit = ph < 0.3;
    alpha(g.k, () => {
      if (both) {
        mini(1, 36 - (hit ? 1 : 0), g.t);
        rect(1, 40, 7, 3, '#B23A2E'); rect(1, 40, 7, 1, '#F3E9DC'); px(4, 41, C.yellow);
        line(0, 36, hit ? 2 : 1, hit ? 40 : 38, C.woodDk);
        line(8, 36, hit ? 6 : 7, hit ? 40 : 38, C.woodDk);
      }
      mini(33, 39 - (hit ? 1 : 0), g.t);
      rect(32, 40, 4, 2, '#E0A24A');
      line(35, 40, 39, 37, C.woodDk);
      px(33 + (beat % 2), 41, C.white);
    });
  }

  // 🎭 Angine de Poitrine: acentos irregulares 3+3+2 (golpes en los tiempos 0, 3 y 6 de cada 8)
  const ANGINE_ACC = [1, 0, 0, 1, 0, 0, 1, 0];

  // 🔺 Triángulo (contorno) con centro, radio y giro: el símbolo de Angine de Poitrine
  function tri(cx, cy, r, ang, c) {
    const v = [0, 1, 2].map(i => [cx + Math.cos(ang + (i * 2 * Math.PI) / 3) * r, cy + Math.sin(ang + (i * 2 * Math.PI) / 3) * r]);
    for (let i = 0; i < 3; i++) line(v[i][0], v[i][1], v[(i + 1) % 3][0], v[(i + 1) % 3][1], c);
  }
  // 🔺 Triángulos girando alrededor y pulso triangular en cada acento
  function angineTris(g) {
    const { beat, ph } = beatInfo(g.t);
    const cx = 20 + g.P.dx, cy = g.top + 5;
    const cols = [C.white, C.yellow, '#F28FB1'];
    for (let i = 0; i < 3; i++) {
      const a = g.t * 0.9 + (i * 2 * Math.PI) / 3;
      tri(cx + Math.cos(a) * 17, cy + Math.sin(a) * 7, 2 + (i % 2), -g.t * 2 + i, cols[i]);
    }
    if (ANGINE_ACC[beat % 8] && ph < 0.5) {
      alpha(1 - ph * 2, () => tri(cx, cy + 2, 6 + ph * 16, -Math.PI / 2, C.white));
    }
  }

  // 🔁 Anillos de loop girando (Angine de Poitrine)
  function loopRings(g) {
    const pts = [[5, g.top - 6], [34, g.top - 2]];
    pts.forEach(([x, y], i) => {
      ring(x, y, 2, C.white);
      const a = g.t * (i ? -4 : 4);
      px(x + Math.cos(a) * 2, y + Math.sin(a) * 2, C.yellow);
    });
  }

  // 🥁 Mini batería con máscara alta (Angine de Poitrine)
  function miniMaskedDrummer(g) {
    const { beat, ph } = beatInfo(g.t);
    const hit = ANGINE_ACC[beat % 8] && ph < 0.3;
    const y = 36 - (hit ? 1 : 0);
    mini(1, y, g.t);
    rect(2, y - 1, 4, 1, '#F4F1EC'); rect(3, y - 3, 2, 2, '#F4F1EC'); px(3, y - 2, '#1F1A17');  // máscara
    rect(6, y + 1, 3, 1, '#E9D8B8');                                                           // nariz
    rect(1, 40, 7, 3, '#1F1A17'); rect(1, 40, 7, 1, '#F4F1EC'); px(3, 41, '#F4F1EC'); px(6, 42, '#F4F1EC');
    line(0, 36, hit ? 2 : 1, hit ? 40 : 38, C.woodDk);
  }

  // ✨ Chispa del guiño (tiempo 7 de cada 8)
  function winkSpark(g) {
    const { beat, ph } = beatInfo(g.t);
    if (beat % 8 !== 7) return;
    const s = ph < 0.5 ? 1 : 2;
    const x = 29 + g.P.dx, y = g.top + 1;
    px(x, y, C.white);
    for (let i = 1; i <= s; i++) { px(x - i, y, C.yellow); px(x + i, y, C.yellow); px(x, y - i, C.yellow); px(x, y + i, C.yellow); }
  }

  // 💡 Baldosas del suelo que se iluminan al ritmo (Billie Jean)
  function lightTiles(g) {
    const { beat, ph } = beatInfo(g.t);
    const cols = ['#FFFFFF', '#F2C14E', '#F28FB1', '#6CB4EE'];
    for (let i = 0; i < 4; i++) {
      const x = 3 + i * 9;
      const lit = i === beat % 4 || (ph < 0.3 && i === (beat + 2) % 4);
      if (lit) {
        rect(x, 44, 8, 2, cols[(beat + i) % cols.length]);
        alpha(0.35, () => rect(x, 42, 8, 2, cols[(beat + i) % cols.length]));   // brillo hacia arriba
      } else alpha(0.55, () => rect(x, 44, 8, 2, '#3A3330'));
    }
  }

  // 🌠 Estrella fugaz que cruza la escena cada 3 segundos (Don't Stop Me Now)
  function shootingStar(g) {
    const p = (g.t % 3) / 1.2;
    if (p >= 1) return;
    const x = -2 + p * 44, y = 3 + p * 9;
    for (let i = 1; i <= 6; i++) alpha(1 - i / 7, () => px(x - i * 1.5, y - i * 0.3, C.yellow));
    rect(x, y, 2, 2, C.yellow);
    px(x + 1, y, C.white);
  }

  // Icono con el que sueña al dormir mientras suena una de tus canciones
  function dreamIcon(key, x, y) {
    switch (key) {
      case 'funk': rect(x, y + 1, 2, 2, '#1F1A17'); rect(x + 3, y + 1, 2, 2, '#1F1A17'); px(x + 2, y + 1, '#1F1A17'); break;
      case 'bass': rect(x + 2, y + 1, 3, 3, '#B23A2E'); line(x + 2, y + 2, x - 1, y, C.woodDk); break;
      case 'gold': rect(x, y, 3, 3, C.yellow); px(x, y, C.white); break;
      case 'two': glyph('2', x, y, '#F28FB1'); break;
      case 'burger': rect(x, y, 4, 1, '#E0A24A'); rect(x, y + 1, 4, 1, '#5CB85C'); rect(x, y + 2, 4, 1, '#6B3A1F'); rect(x, y + 3, 4, 1, '#D9963F'); break;
      case 'standing': px(x + 1, y, '#F28FB1'); rect(x, y + 1, 3, 1, '#F28FB1'); px(x + 1, y + 2, '#F28FB1'); break;
      case 'chicago': rect(x, y + 2, 5, 1, '#3A3330'); rect(x + 1, y, 3, 2, '#4A403B'); break;
      case 'thatswhat': bitmap(HEART, x, y, C.white); break;
      case 'imight': px(x + 1, y, C.yellow); rect(x, y + 1, 3, 1, C.yellow); px(x + 1, y + 2, C.yellow); px(x + 1, y + 1, C.white); break;
      case 'angine': tri(x + 2, y + 2.5, 2.5, -Math.PI / 2, C.white); break;
      case 'billie': rect(x, y + 2, 3, 1, C.white); rect(x + 4, y + 2, 3, 1, '#F2C14E'); break;
      case 'dontstop': rect(x + 3, y, 2, 2, C.yellow); px(x + 2, y + 1, C.yellow); px(x, y + 2, C.yellow); px(x + 1, y + 2, C.yellow); break;
      default: glyph('♪', x, y, C.yellow);
    }
  }

  // Baile completo con música: 6 pasos que cambian cada 4 tiempos
  function grooveDance(P, t) {
    const { beat, ph } = beatInfo(t);
    const down = ph < 0.35;
    const side = beat % 2 ? 1 : -1;
    const move = Math.floor(beat / 4) % 6;
    P.eyes = 'happy'; P.mouth = 'grin'; P.blush = true;
    switch (move) {
      case 0: // pinzas arriba alternando
        if (side < 0) { P.armL = { x: -1, y: -9 }; P.armR = { x: 0, y: 2 }; } else { P.armR = { x: 1, y: -9 }; P.armL = { x: 0, y: 2 }; }
        P.bob = down ? 1 : 0; P.legs = side < 0 ? [0, 2, 0, 0] : [0, 0, 2, 0];
        break;
      case 1: // robot: brazos rectos, pasos secos de lado
        P.armL = { x: -2, y: side < 0 ? -2 : 0 }; P.armR = { x: 2, y: side < 0 ? 0 : -2 };
        P.dx = down ? side * 2 : 0; P.eyes = 'open'; P.mouth = 'flat';
        break;
      case 2: // salto en cada golpe
        P.bob = down ? -4 : 0; P.armL = { x: -1, y: -7 }; P.armR = { x: 1, y: -7 };
        P.openL = P.openR = down; if (down) P.legs = [1, 0, 0, 1];
        break;
      case 3: // palmas sobre la cabeza
        P.armL = down ? { x: 6, y: -13 } : { x: 2, y: -11 };
        P.armR = down ? { x: -6, y: -13 } : { x: -2, y: -11 };
        P.bob = down ? 1 : 0;
        break;
      case 4: // paso lateral
        P.dx = side * 3; P.legs = down ? [2, 0, 2, 0] : [0, 2, 0, 2];
        P.armL = { x: 0, y: side < 0 ? -5 : 1 }; P.armR = { x: 0, y: side < 0 ? 1 : -5 };
        P.lookX = side;
        break;
      default: // la ola: pinzas suben y bajan desfasadas
        P.armL = { x: -1, y: -R((Math.sin(t * 6) + 1) * 5) };
        P.armR = { x: 1, y: -R((Math.sin(t * 6 + 1.6) + 1) * 5) };
        P.bob = down ? 1 : 0; P.sy = down ? 0 : 1;
        break;
    }
  }

  // Notas musicales flotando alrededor (en todas las animaciones con ritmo, menos el baile, que trae las suyas)
  function grooveNotes(g, active) {
    if (!O.groove || active === 'dance' || active === 'waiting' || active === 'sleeping') return;
    for (let i = 0; i < 2; i++) {
      const p = (g.t * 0.45 + i / 2) % 1;
      const x = (i ? 33 : 3) + Math.sin(p * 6 + i) * 1.5;
      alpha((1 - p) * 0.9, () => glyph('♪', x, g.top + 4 - p * 16, i ? C.yellow : '#A79BF5'));
    }
  }

  // ---------- accesorios: modo por app, pijama y disfraces ----------
  // w = { ears: 'headphones'|'gamer', face: 'nerd'|'3d', head: 'beret', neck: 'tie', hat: 'santa'|'witch'|'party'|'flowers'|'nightcap' }
  function drawWear(P, g, w, active) {
    if (!w) return;
    const ey = (g.ey != null ? g.ey : g.top + 4) + P.lookY;
    const ink = '#2A2522';
    if (w.neck === 'tie') {
      rect(19, g.top + 11, 2, 1, '#2F5FA8');
      rect(19, g.top + 12, 2, 2, '#4C8DE0');
    }
    if (w.face === 'nerd' && !w.glasses) {
      for (const e of [14 + P.lookX, 24 + P.lookX]) {
        rect(e - 1, ey - 1, 4, 1, ink); rect(e - 1, ey + 3, 4, 1, ink);
        rect(e - 2, ey - 1, 1, 5, ink); rect(e + 2, ey - 1, 1, 5, ink);
      }
      rect(17 + P.lookX, ey, 5, 1, ink);
    } else if (w.face === '3d' && !w.glasses) {
      rect(11, ey - 2, 18, 1, C.white);
      alpha(0.75, () => { rect(12, ey - 1, 6, 4, '#E5484D'); rect(22, ey - 1, 6, 4, '#4C8DE0'); });
    }
    if (w.glasses) {                           // 🛍️ gafas de la tienda
      const lx = P.lookX, gold = '#C9A227';
      const frame = e => { rect(e - 1, ey - 1, 4, 1, gold); rect(e - 1, ey + 3, 4, 1, gold); rect(e - 2, ey, 1, 3, gold); rect(e + 2, ey, 1, 3, gold); };
      if (w.glasses === 'round') { frame(14 + lx); frame(24 + lx); rect(17 + lx, ey, 5, 1, gold); }
      else if (w.glasses === 'sun') {
        rect(12 + lx, ey, 6, 3, '#1F1A17'); rect(22 + lx, ey, 6, 3, '#1F1A17'); rect(18 + lx, ey, 4, 1, '#1F1A17');
        px(13 + lx, ey, C.white); px(23 + lx, ey, C.white);
      } else if (w.glasses === 'heart') {
        bitmap(HEART, 12 + lx, ey - 1, '#F28FB1'); bitmap(HEART, 22 + lx, ey - 1, '#F28FB1'); rect(17 + lx, ey, 5, 1, '#D9668F');
      } else if (w.glasses === 'monocle') { frame(24 + lx); line(26 + lx, ey + 3, 27 + lx, ey + 8, gold); }
    }
    if (w.neckwear) {                          // 🛍️ cuello de la tienda
      const t = g.neckTop != null ? g.neckTop : g.top;
      if (w.neckwear === 'scarf') {
        rect(g.x0 + 1, t + 10, g.W - 2, 2, '#4C8DE0');
        for (let x = g.x0 + 2; x < g.x0 + g.W - 1; x += 3) px(x, t + 10, '#9FD3F5');
        rect(g.x0 + g.W - 6, t + 12, 2, 3, '#4C8DE0'); rect(g.x0 + g.W - 6, t + 14, 2, 1, '#2F5FA8');
      } else if (w.neckwear === 'bow') {
        rect(16, t + 10, 2, 3, '#E5484D'); rect(22, t + 10, 2, 3, '#E5484D'); rect(18, t + 11, 4, 1, '#B83238');
        px(16, t + 10, '#F07075'); px(23, t + 10, '#F07075');
      } else if (w.neckwear === 'bandana') {
        rect(13, t + 10, 14, 1, '#E5484D'); rect(14, t + 11, 12, 1, '#E5484D'); rect(16, t + 12, 8, 1, '#E5484D'); rect(18, t + 13, 4, 1, '#E5484D');
        px(15, t + 10, C.white); px(19, t + 11, C.white); px(23, t + 10, C.white); px(20, t + 12, C.white);
      } else if (w.neckwear === 'necklace') {
        for (let x = 13; x <= 26; x += 2) px(x, t + 10 + (x > 15 && x < 24 ? 1 : 0), C.white);
        rect(19, t + 12, 2, 2, '#F28FB1');
      }
    }
    const hatFree = !['sleeping', 'celebrate'].includes(active);
    if (w.head === 'beret' && hatFree) {
      rect(g.x0 + 2, g.top - 2, 11, 2, ink);
      rect(g.x0 + 4, g.top - 3, 7, 1, ink);
      px(g.x0 + 8, g.top - 4, ink);
    }
    if (w.ears) {
      const accent = w.ears === 'gamer' ? '#3FB950' : '#A79BF5';
      rect(g.x0 + 1, g.top - 3, g.W - 2, 1, ink);
      rect(g.x0, g.top - 2, 1, 3, ink); rect(g.x0 + g.W - 1, g.top - 2, 1, 3, ink);
      rect(g.x0 - 2, g.top + 1, 3, 5, ink); rect(g.x0 + g.W - 1, g.top + 1, 3, 5, ink);
      rect(g.x0 - 1, g.top + 2, 1, 3, accent); rect(g.x0 + g.W, g.top + 2, 1, 3, accent);
      if (w.ears === 'gamer') line(g.x0 - 1, g.top + 6, 15, g.top + 9, ink);
    }
    if (w.band) {                              // 🍅 cinta de concentración (pomodoro)
      rect(g.x0, g.top + 1, g.W, 1, '#E5484D');
      px(g.x0 + g.W, g.top + 1, '#E5484D'); px(g.x0 + g.W + 1, g.top + 2, '#B83238'); px(g.x0 + g.W, g.top + 3, '#B83238');
    }
    if (w.hat && hatFree && !w.ears && !w.head) {
      const x = g.x0, t = g.top;
      if (w.hat === 'cap') {                   // 🛍️ gorra
        rect(x + 3, t - 3, 14, 3, '#4C8DE0'); rect(x + 5, t - 4, 10, 1, '#4C8DE0');
        rect(x + 14, t - 1, 7, 1, '#2F5FA8'); px(x + 10, t - 4, '#9FD3F5');
      } else if (w.hat === 'cowboy') {         // 🛍️ sombrero vaquero
        rect(x - 1, t - 2, 22, 1, '#8B5A2B'); rect(x - 1, t - 3, 2, 1, '#8B5A2B'); rect(x + 19, t - 3, 2, 1, '#8B5A2B');
        rect(x + 4, t - 6, 12, 4, '#A0693A'); rect(x + 4, t - 3, 12, 1, '#5C3A1E'); rect(x + 9, t - 6, 2, 1, '#8B5A2B');
      } else if (w.hat === 'chef') {           // 🛍️ gorro de chef
        rect(x + 4, t - 3, 12, 2, '#F4F1EC'); rect(x + 3, t - 7, 14, 4, C.white);
        rect(x + 4, t - 8, 4, 1, C.white); rect(x + 9, t - 8, 3, 1, C.white); rect(x + 13, t - 8, 3, 1, C.white);
        rect(x + 4, t - 3, 12, 1, '#D9D2CB');
      } else if (w.hat === 'lazo') {           // 🛍️ lazo
        rect(x + 12, t - 3, 3, 3, '#F28FB1'); rect(x + 17, t - 3, 3, 3, '#F28FB1'); rect(x + 15, t - 2, 2, 2, '#D9668F');
        px(x + 12, t - 3, '#FBC3D6'); px(x + 19, t - 3, '#FBC3D6');
      } else if (w.hat === 'viking') {         // 🛍️ casco vikingo
        rect(x + 3, t - 3, 14, 3, C.metal); rect(x + 5, t - 5, 10, 2, C.metal); rect(x + 3, t - 1, 14, 1, C.metalDk); px(x + 7, t - 4, C.metalLt);
        rect(x + 1, t - 4, 2, 2, '#F4F1EC'); rect(x, t - 6, 2, 2, '#F4F1EC'); px(x, t - 7, '#F4F1EC');
        rect(x + 17, t - 4, 2, 2, '#F4F1EC'); rect(x + 18, t - 6, 2, 2, '#F4F1EC'); px(x + 19, t - 7, '#F4F1EC');
      } else if (w.hat === 'beanie') {                // gorro de lana (nivel 2)
        rect(x + 3, t - 2, 14, 2, '#E5484D'); rect(x + 4, t - 4, 12, 2, '#E5484D');
        rect(x + 3, t - 1, 14, 1, '#B83238'); rect(x + 5, t - 3, 2, 1, '#F07075');
        rect(x + 9, t - 6, 2, 2, C.white);
      } else if (w.hat === 'tophat') {         // chistera (nivel 4)
        rect(x + 2, t - 2, 16, 1, '#1F1A17');
        rect(x + 5, t - 9, 10, 7, '#2A2522');
        rect(x + 5, t - 4, 10, 1, '#D63B3B');
        rect(x + 6, t - 8, 1, 3, '#4A403B');
      } else if (w.hat === 'crown') {          // corona de rey (nivel 7)
        rect(x + 4, t - 3, 12, 2, C.yellow);
        rect(x + 4, t - 5, 2, 2, C.yellow); rect(x + 9, t - 6, 2, 3, C.yellow); rect(x + 14, t - 5, 2, 2, C.yellow);
        px(x + 9, t - 3, C.red); px(x + 6, t - 2, C.blue); px(x + 13, t - 2, C.blue); px(x + 10, t - 6, C.white);
      } else if (w.hat === 'santa') {
        rect(x + 3, t - 2, 14, 2, C.white);
        rect(x + 5, t - 4, 10, 2, '#D63B3B'); rect(x + 8, t - 6, 7, 2, '#D63B3B'); rect(x + 13, t - 7, 4, 1, '#D63B3B');
        rect(x + 17, t - 8, 2, 2, C.white);
      } else if (w.hat === 'witch') {
        rect(x + 1, t - 2, 18, 1, '#3B2A55');
        rect(x + 6, t - 4, 8, 2, '#4A3470'); rect(x + 8, t - 6, 5, 2, '#4A3470'); rect(x + 10, t - 8, 3, 2, '#4A3470'); px(x + 12, t - 9, '#4A3470');
        rect(x + 6, t - 3, 8, 1, '#E8A33D');
      } else if (w.hat === 'party') {
        rect(x + 2, t - 2, 8, 1, C.yellow); rect(x + 3, t - 3, 6, 1, C.red); rect(x + 3, t - 4, 6, 1, C.yellow);
        rect(x + 4, t - 5, 4, 1, C.red); rect(x + 5, t - 6, 2, 1, C.yellow); rect(x + 5, t - 8, 2, 2, C.white);
      } else if (w.hat === 'nightcap') {       // gorrito de noche (desde las 18:30)
        rect(x + 6, t - 2, 13, 2, C.cap);
        rect(x + 6, t - 1, 13, 1, '#E8E6F5');
        rect(x + 8, t - 4, 10, 2, C.cap);
        rect(x + 11, t - 6, 7, 2, C.capDk);
        rect(x + 14, t - 7, 5, 1, C.cap);
        rect(x + 17, t - 8, 3, 1, C.cap);
        rect(x + 19, t - 10, 2, 2, C.white);
      } else if (w.hat === 'flowers') {
        for (let i = 0; i < 5; i++) {
          const fx = x + 1 + i * 4;
          rect(fx, t - 2, 3, 2, i % 2 ? '#F2C14E' : '#F28C28');
          px(fx + 1, t - 2, i % 2 ? '#F28C28' : '#F2C14E');
        }
      }
    }
  }

  // Accesorios de las canciones especiales (también mientras Claude trabaja)
  // Antena: la bombilla cambia de color según lo que pasa (amarillo normal, violeta pensando, rojo parpadeando si espera permiso)
  const NO_ANTENNA = ['sleeping', 'celebrate', 'web', 'angine', 'chicago'];
  function drawAntenna(P, g, w, special, active) {
    if (SKIN ? !SKIN.antenna : PERSONAL) return;   // solo el Pal compartido (o el personaje turquesa)
    if (NO_ANTENNA.includes(active) || ['angine', 'chicago'].includes(special)) return;
    if (w && (w.hat || w.ears || w.head)) return;
    const sway = R(Math.sin(g.t * 2.2 + (P.bob || 0)) * 0.6);
    const x = 20 + sway;
    rect(19, g.top - 2, 2, 1, C.dark);                        // base
    rect(x - (sway > 0 ? 1 : 0), g.top - 4, 1, 2, C.dark);    // varilla
    let bulb = C.yellow;
    if (active === 'thinking' || active === 'planning') bulb = '#A79BF5';
    else if (active === 'waiting') bulb = Math.floor(g.t * 3) % 2 ? C.red : '#FF8A8E';
    else if (['terminal', 'editing', 'agent', 'tinkering'].includes(active)) bulb = C.green;
    rect(x - 1, g.top - 6, 3, 2, bulb);
    px(x - 1, g.top - 6, C.white);                             // brillo
  }

  function drawSpecialWear(P, g, key, active) {
    if (key === 'funk') {                          // gafas de sol
      const ey = (g.ey != null ? g.ey : g.top + 4) + P.lookY;
      rect(12 + P.lookX, ey, 6, 3, '#1F1A17'); rect(22 + P.lookX, ey, 6, 3, '#1F1A17');
      rect(18 + P.lookX, ey, 4, 1, '#1F1A17');
      px(13 + P.lookX, ey, C.white); px(23 + P.lookX, ey, C.white);
    } else if (key === 'gold') {                   // cadena de oro
      for (let x = 13; x <= 26; x += 2) px(x, g.top + 11 + (x > 16 && x < 23 ? 1 : 0), C.yellow);
      rect(19, g.top + 12, 2, 2, C.yellow); px(19, g.top + 12, C.white);
    } else if (key === 'standing') {               // gafas de estrella rosas (estilo Elton)
      const ey = (g.ey != null ? g.ey : g.top + 4) + P.lookY;
      for (const e of [14 + P.lookX, 24 + P.lookX]) {
        alpha(0.9, () => {
          rect(e - 1, ey - 1, 4, 4, '#F28FB1');
          px(e, ey - 2, '#F28FB1'); px(e + 1, ey - 2, '#F28FB1');
          px(e - 2, ey, '#F28FB1'); px(e + 3, ey, '#F28FB1');
          px(e - 1, ey + 3, '#F28FB1'); px(e + 2, ey + 3, '#F28FB1');
        });
        rect(e, ey + 1, 2, 1, '#1F1A17');
      }
      rect(18 + P.lookX, ey, 4, 1, '#F28FB1');
    } else if (key === 'angine') {                 // traje de lunares + máscara alta con lunares + nariz larga
      const W = '#F4F1EC', K = '#1F1A17';
      rect(g.x0, g.top + 7, g.W, g.H - 9, W);
      for (let y = g.top + 8, row = 0; y < g.bottom - 2; y += 3, row++) {
        for (let x = g.x0 + 1 + (row % 2) * 2; x < g.x0 + g.W - 1; x += 4) px(x, y, K);
      }
      if (active !== 'sleeping') {
        for (let i = 0; i < 10; i++) {               // máscara alta que sube desde la cabeza
          const w = Math.max(2, 16 - i * 1.5);
          rect(20 - w / 2, g.top - 1 - i, w, 1, W);
          if (i % 3 === 1) px(20 - w / 4, g.top - 1 - i, K);
          if (i % 3 === 2 && w > 6) px(20 + w / 4, g.top - 1 - i, K);
        }
      }
      tri(20, g.top + 11.5, 2.5, -Math.PI / 2, K);   // triángulo en el pecho
      const dir = P.lookX < 0 ? -1 : 1;              // nariz larguísima hacia donde mira (más oscura para que destaque)
      const nx = dir > 0 ? 20 : 12;
      rect(nx, g.top + 6, 9, 2, '#C89A62');
      rect(nx, g.top + 7, 9, 1, '#A97C4A');
      px(dir > 0 ? nx + 8 : nx, g.top + 6, '#8C6238');
    } else if (key === 'imight') {                 // traje verde setentero con solapas (deja la cara libre)
      const gr = '#2E7D4F', lp = '#43A86A';
      rect(g.x0, g.top + 7, 5, g.H - 9, gr);
      rect(g.x0 + g.W - 5, g.top + 7, 5, g.H - 9, gr);
      line(g.x0 + 5, g.top + 7, 18, g.top + 11, lp);
      line(g.x0 + g.W - 6, g.top + 7, 21, g.top + 11, lp);
    } else if (key === 'bass' && active !== 'bass') {  // bajo colgado a la espalda (en su baile ya lo lleva delante)
      line(g.x0 + g.W, g.top + 3, g.x0 + g.W + 5, g.top - 4, C.woodDk, 2);            // mástil asomando por el hombro
      rect(g.x0 + g.W + 4, g.top - 6, 3, 2, C.woodDk);                                 // pala
      px(g.x0 + g.W + 5, g.top - 6, C.metalLt);
      rect(g.x0 - 2, g.top + 8, 3, 5, '#B23A2E');                                      // cuerpo del bajo asomando por el otro lado
      px(g.x0 - 1, g.top + 10, '#F3E9DC');
    } else if (key === 'dontstop') {               // bigote estilo Freddie: grueso y recto, encima de la boca
      rect(16, g.top + 7, 8, 2, '#2A2522');
      px(17, g.top + 7, '#4A403B');
    } else if (key === 'chicago') {                // fedora negro con cinta blanca
      const tip = (P.armR && P.armR.y <= -11) ? 1 : 0;   // al tocarlo se levanta un poco
      rect(g.x0 + 1, g.top - 2 - tip, 18, 1, '#3A3330');
      rect(g.x0 + 4, g.top - 6 - tip, 12, 4, '#4A403B');
      rect(g.x0 + 5, g.top - 7 - tip, 10, 1, '#4A403B');
      rect(g.x0 + 5, g.top - 6 - tip, 3, 1, '#6B5F58');   // brillo
      rect(g.x0 + 4, g.top - 3 - tip, 12, 1, '#F4F1EC');
    }
  }
  function specialOver(g, key, active) {
    if (key === 'standing') {                      // destellos de estrellas alrededor
      for (let i = 0; i < 4; i++) {
        const p = (g.t * 0.8 + i / 4) % 1;
        const a = i * 1.6 + g.t * 0.7;
        const x = 20 + Math.cos(a) * 15, y = g.top + 2 + Math.sin(a) * 6;
        alpha(Math.sin(p * Math.PI), () => { px(x, y, C.yellow); px(x - 1, y, '#F28FB1'); px(x + 1, y, '#F28FB1'); px(x, y - 1, '#F28FB1'); px(x, y + 1, '#F28FB1'); });
      }
    }
    if (!key || active === 'waiting') return;
    const dx = g.P.dx;
    const { beat: bt, ph: bph } = beatInfo(g.t);
    // 🌠 Don't Stop Me Now: estrellas fugaces también mientras trabaja
    if (key === 'dontstop' && active !== 'dontstop' && active !== 'sleeping') shootingStar(g);
    // 🕶️ funk: destello que cruza las gafas de sol cada 4 tiempos
    if (key === 'funk' && active !== 'sleeping' && bt % 4 === 0) {
      const gx = 12 + R(bph * 16) + dx;
      alpha(1 - bph, () => { px(gx, g.top + 4, C.white); px(gx + 1, g.top + 5, C.white); });
    }
    // 🎸 bass: nubes de polvo grandes en cada pisotón (en el baile del bajo ya lo pone la propia animación)
    if (key === 'bass' && active !== 'bass' && active !== 'sleeping' && bt % 2 === 0 && bph < 0.7) {
      const q = bph / 0.7;
      alpha(1 - q, () => {
        for (let i = 0; i < 4; i++) rect(26 + dx + i * 2 + q * 6, 40 - q * 3 - (i % 2), 3, 3, C.cloudSh);
        for (let i = 0; i < 3; i++) rect(11 + dx - i * 2 - q * 6, 40 - q * 3 - (i % 2), 3, 3, C.cloudSh);
      });
    }
    // 💡 Billie Jean: baldosas iluminadas bajo sus pies en todas las animaciones
    if (key === 'billie' && active !== 'sleeping') {
      lightTiles(g);
      if (bt % 2 === 0 && bph < 0.3) px(31 + g.P.armR.x + dx, g.bottom - 9 + g.P.armR.y, C.white);  // destello del guante
    }
    // 🎭 Angine de Poitrine: triángulos y anillos de loop también mientras trabaja
    if (key === 'angine' && active !== 'angine' && active !== 'sleeping') { angineTris(g); loopRings(g); }
    // 🕺 I Just Might: aura dorada que late (siempre); y al trabajar, el mini guitarrista y la chispa del guiño
    if (key === 'imight' && active !== 'sleeping') {
      alpha(bph < 0.35 ? 0.6 : 0.25, () => {
        for (let x = g.x0 - 2 + dx; x <= g.x0 + g.W + 1 + dx; x += 2) px(x, g.top - 3, '#FFD86B');
        for (let y = g.top - 1; y <= g.bottom - 2; y += 2) { px(g.x0 - 3 + dx, y, '#FFD86B'); px(g.x0 + g.W + 2 + dx, y, '#FFD86B'); }
      });
      if (active !== 'imight') {
        winkSpark(g);
        if (!['agent', 'billie', 'two', 'walk', 'hop'].includes(active)) miniBand(g, false);
      }
    }
    // ✌️ two: un "2" pequeño sobre la cabeza y el mini gemelo al lado
    if (key === 'two' && active !== 'two' && active !== 'sleeping') {
      glyph('2', 19 + dx, g.top - 8 - (bph < 0.25 ? 1 : 0), bt % 2 ? '#F28FB1' : '#6CB4EE');
      if (active !== 'agent') mini(33, 39 - (bph < 0.25 ? 1 : 0), g.t);
    }
    // 🍔 burger: mini hamburguesa en la pinza libre, mini hamburguesas flotando y migas
    if (key === 'burger' && active !== 'burger' && active !== 'sleeping') {
      const mb = (x, y) => { rect(x, y, 4, 1, '#E0A24A'); rect(x, y + 1, 4, 1, '#5CB85C'); rect(x, y + 2, 4, 1, '#6B3A1F'); rect(x, y + 3, 4, 1, '#D9963F'); };
      if (isFree(active, 'L')) mb(6 + g.P.armL.x + dx, g.bottom - 11 + g.P.armL.y);
      else if (isFree(active, 'R')) mb(30 + g.P.armR.x + dx, g.bottom - 11 + g.P.armR.y);
      for (let i = 0; i < 2; i++) {
        const p = (g.t * 0.35 + i / 2) % 1;
        alpha(1 - p, () => mb(i ? 34 : 1, g.top + 6 - p * 18));
      }
      if (bt % 8 === 7) for (let i = 0; i < 3; i++) px(18 + i * 2 + dx, g.top + 12 + bph * 5, '#E0A24A');
    }
    if (key === 'thatswhat' && active !== 'sleeping') {   // garabatos blancos que aparecen con cada golpe
      const { beat, ph } = beatInfo(g.t);
      const kind = beat % 4;
      const left = beat % 2 === 0;
      const x = left ? 4 : 31, y = g.top - 6 + (beat % 3) * 3;
      alpha(1 - ph, () => {
        const w = '#FFFFFF';
        if (kind === 0) { line(x, y + 2, x + 4, y + 2, w); line(x + 2, y, x + 2, y + 4, w); px(x, y, w); px(x + 4, y, w); px(x, y + 4, w); px(x + 4, y + 4, w); }
        else if (kind === 1) bitmap(HEART, x, y, w);
        else if (kind === 2) { line(x, y + 3, x + 1, y, w); line(x + 1, y, x + 3, y + 3, w); line(x + 3, y + 3, x + 5, y, w); }
        else ring(x + 2, y + 2, 2, w);
      });
    }
    if (key === 'gold') {                          // lluvia de monedas de oro
      for (let i = 0; i < 5; i++) {
        const p = (g.t * 0.5 + i / 5) % 1;
        const x = 3 + ((i * 7.3) % 34);
        alpha(1 - p * 0.6, () => { rect(x, p * 40, 2, 2, C.yellow); px(x, p * 40, C.white); });
      }
    }
  }

  function cushion() {
    rect(8, 40, 24, 3, '#7B68C9');
    rect(9, 39, 22, 1, '#9584E0');
    rect(8, 42, 24, 1, '#5B4BA6');
    px(7, 40, C.yellow); px(32, 40, C.yellow);
  }

  function rect(x, y, w, h, c) { o.fillStyle = c; o.fillRect(R(x), R(y), R(w), R(h)); }
  function px(x, y, c) { rect(x, y, 1, 1, c); }
  function alpha(a, fn) { o.save(); o.globalAlpha *= clamp(a); fn(); o.restore(); }
  function bitmap(rows, x, y, c, sc = 1) {
    rows.forEach((row, j) => [...row].forEach((v, i) => { if (v === '1') rect(x + i * sc, y + j * sc, sc, sc, c); }));
  }
  function glyph(ch, x, y, c, sc = 1) { if (GLYPH[ch]) bitmap(GLYPH[ch], x, y, c, sc); }
  function circle(cx, cy, r, c) {
    for (let dy = -r; dy <= r; dy++) {
      const h = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
      rect(cx - h, cy + dy, 2 * h + 1, 1, c);
    }
  }
  function ring(cx, cy, r, c) {
    for (let a = 0; a < 72; a++) {
      const ang = (a / 72) * Math.PI * 2;
      px(R(cx + Math.cos(ang) * r), R(cy + Math.sin(ang) * r), c);
    }
  }
  function line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) rect(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, w, w, c);
  }

  // ---------- cuerpo ----------
  function pose() {
    return {
      bob: 0, sx: 0, sy: 0, eyes: 'open', lookX: 0, lookY: 0, mouth: null, blush: false,
      armL: { x: 0, y: 0 }, armR: { x: 0, y: 0 }, openL: false, openR: false,
      legs: [0, 0, 0, 0], tuck: false, glow: 0, extra: null, dx: 0,
    };
  }

  function geom(P) {
    const bottom = BASE_BOTTOM + P.bob;
    const H = 14 + P.sy;
    const W = 20 + P.sx;
    return { cx: 20, bottom, top: bottom - H, H, W, x0: 20 - W / 2, P };
  }

  // Ojos y boca con todos sus gestos (los usan Pal y los personajes de skins.js)
  function drawEyes(P, xs, ey) {
    xs.forEach((e, idx) => {
      const style = P.eyes === 'wink' ? (idx === 0 ? 'closed' : 'open') : P.eyes;
      switch (style) {
        case 'closed': rect(e - 1, ey + 2, 4, 1, C.eye); break;
        case 'happy': px(e - 1, ey + 2, C.eye); rect(e, ey + 1, 2, 1, C.eye); px(e + 2, ey + 2, C.eye); break;
        case 'wide': rect(e, ey - 1, 2, 4, C.eye); px(e, ey - 1, C.shine); break;
        case 'down': rect(e, ey, 2, 2, C.eye); break;
        case 'squint': rect(e - 1, ey, 4, 1, C.shade); rect(e, ey + 1, 2, 1, C.eye); break;
        case 'puppy': rect(e, ey - 1, 2, 4, C.eye); px(e, ey - 1, C.shine); px(e + 1, ey + 1, C.shine); break;
        default: rect(e, ey, 2, 3, C.eye); px(e, ey, C.shine);
      }
    });
  }
  function drawMouth(P, cx, my) {
    switch (P.mouth) {
      case 'o': rect(cx - 1, my, 2, 2, C.eye); break;
      case 'smile': px(cx - 2, my, C.eye); rect(cx - 1, my + 1, 2, 1, C.eye); px(cx + 1, my, C.eye); break;
      case 'grin': rect(cx - 2, my, 4, 1, C.eye); rect(cx - 1, my + 1, 2, 1, C.dark); break;
      case 'flat': rect(cx - 1, my + 1, 2, 1, C.eye); break;
      case 'yawn': rect(cx - 2, my - 1, 4, 3, C.eye); rect(cx - 1, my, 2, 1, C.dark); break;
      default: break;
    }
  }

  function drawBody(P, g) {
    // patas
    if (SKIN && SKIN.legs) SKIN.legs(g, P, g.t || 0);
    else [12, 16, 22, 26].forEach((x, i) => rect(x, g.bottom, 2, P.tuck ? 1 : 4 - P.legs[i], C.shade));
    // cuerpo
    rect(g.x0, g.top, g.W, g.H, C.body);
    rect(g.x0 + 1, g.top - 1, g.W - 2, 1, C.body);
    rect(g.x0, g.bottom - 2, g.W, 2, C.shade);
    rect(g.x0 + 2, g.top + 1, 3, 1, C.light);
    rect(g.x0 + 1, g.top + 2, 1, 2, C.light);
    if (P.glow > 0) alpha(P.glow, () => rect(g.x0 + 1, g.top + 1, Math.floor(g.W / 2), 9, '#BFE0FF'));

    // ojos
    const ey = (g.ey != null ? g.ey : g.top + 4) + P.lookY;
    [14 + P.lookX, 24 + P.lookX].forEach((e, idx) => {
      // guiño: ojo izquierdo cerrado, derecho abierto
      const style = P.eyes === 'wink' ? (idx === 0 ? 'closed' : 'open') : P.eyes;
      switch (style) {
        case 'closed': rect(e - 1, ey + 2, 4, 1, C.eye); break;
        case 'happy': px(e - 1, ey + 2, C.eye); rect(e, ey + 1, 2, 1, C.eye); px(e + 2, ey + 2, C.eye); break;
        case 'wide': rect(e, ey - 1, 2, 4, C.eye); px(e, ey - 1, C.shine); break;
        case 'down': rect(e, ey, 2, 2, C.eye); break;
        case 'squint': rect(e - 1, ey, 4, 1, C.shade); rect(e, ey + 1, 2, 1, C.eye); break;
        case 'puppy': rect(e, ey - 1, 2, 4, C.eye); px(e, ey - 1, C.shine); px(e + 1, ey + 1, C.shine); break;
        default: rect(e, ey, 2, 3, C.eye); px(e, ey, C.shine);
      }
    });
    if (P.blush) { rect(11, g.top + 8, 2, 1, C.blush); rect(27, g.top + 8, 2, 1, C.blush); }

    // boca
    const my = g.top + 9;
    switch (P.mouth) {
      case 'o': rect(19, my, 2, 2, C.eye); break;
      case 'smile': px(18, my, C.eye); rect(19, my + 1, 2, 1, C.eye); px(21, my, C.eye); break;
      case 'grin': rect(18, my, 4, 1, C.eye); rect(19, my + 1, 2, 1, C.dark); break;
      case 'flat': rect(19, my + 1, 2, 1, C.eye); break;
      case 'yawn': rect(18, my - 1, 4, 3, C.eye); rect(19, my, 2, 1, C.dark); break;
      default: break;
    }
  }

  // Brazo + pinza. off = desplazamiento de la pinza desde su posición de reposo.
  function drawArm(side, off, open, g, glove = false) {
    const sx = side < 0 ? g.x0 : g.x0 + g.W - 2;
    const sy = g.bottom - 7;
    const cx = (side < 0 ? 6 : 30) + off.x;
    const cy = g.bottom - 8 + off.y;
    const pix = new Map();
    const add = (x, y, c) => pix.set(`${R(x)},${R(y)}`, c);
    const n = Math.max(Math.abs(cx + 1 - sx), Math.abs(cy + 1 - sy), 1);
    for (let i = 0; i <= n; i++) {
      const x = R(sx + ((cx + 1 - sx) * i) / n), y = R(sy + ((cy + 1 - sy) * i) / n);
      add(x, y, C.body); add(x + 1, y, C.body); add(x, y + 1, C.body); add(x + 1, y + 1, C.body);
    }
    let shape = open ? ['1..1', '1..1', '1111'] : ['1.11', '1111', '1111'];
    if (side > 0) shape = shape.map(r => [...r].reverse().join(''));
    // guante blanco (Chicago) o pinza normal
    const cMain = glove ? '#F4F1EC' : C.body, cShade = glove ? '#CFCAC2' : C.shade;
    shape.forEach((row, j) => [...row].forEach((v, i) => { if (v === '1') add(cx + i, cy + j, j === 2 ? cShade : cMain); }));
    // contorno oscuro solo donde el brazo pasa por delante del cuerpo (lejos del hombro)
    const inBody = (x, y) => x >= g.x0 && x < g.x0 + g.W && y >= g.top && y < g.bottom;
    for (const key of pix.keys()) {
      const [x, y] = key.split(',').map(Number);
      if (Math.abs(x - sx) + Math.abs(y - sy) <= 3) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inBody(nx, ny) && !pix.has(`${nx},${ny}`)) px(nx, ny, C.dark);
      }
    }
    pix.forEach((c, key) => { const [x, y] = key.split(',').map(Number); px(x, y, c); });
  }

  // ---------- acciones ----------
  const A = {
    idle: {
      pose(P, t) {
        P.bob = Math.sin(t * 2.2) > 0.25 ? 0 : 1;
        if (blink(t)) P.eyes = 'closed';
        const cyc = t % 10;
        const f = Math.floor(t / 10) % 4;
        if (cyc > 6 && cyc < 7.8) {
          const q = cyc - 6;
          if (f === 0) { const w = Math.floor(q * 6) % 2; P.armR = { x: 0, y: -8 + w }; P.openR = w === 0; P.mouth = 'smile'; }
          else if (f === 1) { P.lookX = q < 0.9 ? -1 : 1; }
          else if (f === 2) { if (q < 1.2) P.bob = -R(Math.abs(Math.sin((q * Math.PI) / 0.6)) * 3); P.mouth = 'smile'; }
          else { P.sy = q < 1 ? 1 : 0; P.armL = { x: 0, y: -6 }; P.armR = { x: 0, y: -6 }; P.eyes = 'closed'; P.mouth = 'yawn'; }
        }
      },
    },

    sleeping: {
      pose(P, t) {
        P.bob = 3;
        P.sy = Math.sin(t * 1.4) > 0 ? -2 : -3;
        P.sx = 2;
        P.tuck = true;
        P.eyes = 'closed';
        P.armL = { x: 2, y: 4 };
        P.armR = { x: -2, y: 4 };
      },
      over(g) {
        // gorro de dormir
        alpha(g.k, () => {
          const tx = 16, ty = g.top;
          rect(tx, ty - 2, 13, 2, C.cap);
          rect(tx, ty - 1, 13, 1, '#E8E6F5');
          rect(tx + 2, ty - 4, 10, 2, C.cap);
          rect(tx + 5, ty - 6, 7, 2, C.capDk);
          rect(tx + 8, ty - 7, 5, 1, C.cap);
          rect(tx + 11, ty - 8, 3, 1, C.cap);
          rect(tx + 13, ty - 10, 2, 2, C.white);
        });
        // burbujita de la siesta que crece y explota
        const bp = (g.t % 4.5) / 4.5;
        if (bp < 0.8) {
          const r = R((bp / 0.8) * 2.5);
          alpha(0.75 * g.k, () => circle(23, g.top + 9 - r, r, '#BFE3F2'));
          if (r >= 1) px(22, g.top + 8 - r * 2 + 1, C.white);
        } else if (bp < 0.86) {
          alpha(g.k, () => { px(21, g.top + 5, '#BFE3F2'); px(25, g.top + 5, '#BFE3F2'); px(23, g.top + 3, '#BFE3F2'); });
        }
        // Z Z Z
        for (let i = 0; i < 3; i++) {
          const p = (g.t * 0.35 + i / 3) % 1;
          const x = 24 + p * 8 + Math.sin(p * 6 + i) * 1.5;
          const y = g.top - 8 - p * 16;
          const a = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
          // con música sueña con notas; con una de tus canciones, con su icono
          if (O.groove && i === 1) alpha(g.k * a, () => (O.special ? dreamIcon(O.special, x, y) : glyph('♪', x, y, C.yellow)));
          else alpha(g.k * a, () => glyph('Z', x, y, C.white, p > 0.55 ? 2 : 1));
        }
      },
    },

    // Transición al despertar: se estira y bosteza
    wake: {
      pose(P, t, lt) {
        if (lt < 0.55) {
          const q = lt / 0.55;
          P.sy = R(q * 2);
          P.armL = { x: -1, y: -R(q * 8) };
          P.armR = { x: 1, y: -R(q * 8) };
          P.eyes = 'closed';
          P.mouth = 'yawn';
        } else {
          P.eyes = lt > 0.75 && lt < 0.85 ? 'closed' : 'wide';
          P.bob = lt < 0.7 ? -1 : 0;
          P.mouth = 'smile';
        }
      },
    },

    thinking: {
      pose(P, t, lt) {
        P.armL = { x: 7, y: 3 + (Math.floor(t * 2.5) % 2) };
        P.lookX = 1;
        P.lookY = -1;
        P.mouth = 'flat';
        if (lt > 2.5 && (t % 5) > 3.9) { P.eyes = 'wide'; P.mouth = 'o'; P.armL = { x: 0, y: -7 }; P.openL = true; } // ¡idea!
        P.bob = Math.sin(t * 1.5) > 0.6 ? 1 : 0;
        if (blink(t, 3.7)) P.eyes = 'closed';
      },
      over(g) {
        const k = g.k;
        const bx = 24, by = g.top - 17;
        if (k > 0.2) rect(29, g.top - 2, 1, 1, C.cloud);
        if (k > 0.45) rect(30, g.top - 5, 2, 2, C.cloud);
        if (k > 0.7) {
          rect(bx + 1, by, 13, 9, C.cloud);
          rect(bx, by + 1, 15, 7, C.cloud);
          rect(bx + 3, by - 1, 4, 1, C.cloud);
          rect(bx + 9, by - 1, 3, 1, C.cloud);
          rect(bx + 1, by + 8, 13, 1, C.cloudSh);
          const idea = (g.lt || 0) > 2.5 && (g.t % 5) > 3.9;
          if (idea) {
            // 💡 ¡se le ocurre algo!
            const lx = bx + 7, ly = by + 3;
            circle(lx, ly, 2, C.yellow);
            px(lx - 1, ly - 1, C.white);
            rect(lx - 1, ly + 3, 3, 1, C.metalDk);
            rect(lx - 1, ly + 4, 3, 1, C.metal);
            if (Math.floor(g.t * 6) % 2) { px(lx - 4, ly - 2, C.yellow); px(lx + 4, ly - 2, C.yellow); px(lx, ly - 4, C.yellow); }
          } else {
            for (let i = 0; i < 3; i++) {
              const on = Math.floor(g.t * 3) % 4 > i;
              rect(bx + 3 + i * 4, by + 4 - (on ? 1 : 0), 2, 2, on ? C.ink : C.cloudSh);
            }
          }
        }
      },
    },

    // ✏️ Editar / escribir archivos: saca su laptop (vista lateral) y teclea
    // La laptop queda en el suelo a la izquierda, con la pantalla inclinada hacia Pal.
    editing: {
      pose(P, t, lt) {
        const cyc = t % 4;
        const pause = cyc > 3.3;               // pausa: se echa atrás y revisa lo escrito
        const a = Math.floor(t * 11) % 2;
        P.dx = 5;
        P.lookX = -1;
        P.lookY = pause ? 0 : 1;
        P.eyes = pause ? (cyc > 3.6 && cyc < 3.7 ? 'closed' : 'open') : 'down';
        // la pinza izquierda teclea; la derecha también llega al teclado por detrás
        P.armL = lt < 0.35 ? { x: -1, y: 3 } : { x: -3, y: pause ? 5 : 6 + a };
        P.armR = pause ? { x: 0, y: 1 } : { x: -2, y: 4 + (1 - a) };
        P.bob = pause ? 0 : (Math.floor(t * 5.5) % 2);
        if (pause) P.mouth = 'smile';
      },
      front(g) {
        const k = easeOut(g.k);
        const slide = R((1 - k) * -14);
        const hx = 2 + slide, hy = 40;                       // bisagra
        const ang = 1.75 * clamp((g.k - 0.3) / 0.7);         // 0 = cerrada, 1.75 rad = abierta
        const len = 11;
        // base / teclado en el suelo
        rect(hx, hy, 13, 1, C.metalLt);
        rect(hx, hy + 1, 13, 1, C.metalDk);
        for (let i = 0; i < 5; i++) px(hx + 3 + i * 2, hy, C.metalDk); // teclas
        // pantalla: tapa gruesa desde la bisagra
        const ex = hx + Math.cos(ang) * len, ey = hy - Math.sin(ang) * len;
        line(hx, hy - 1, ex, ey, C.metal, 2);
        if (ang > 1.2) {
          // cara de la pantalla que mira a Pal: brilla y parpadea con el código
          const n = Math.max(Math.abs(ex - hx), Math.abs(ey - hy));
          for (let i = 1; i < n; i++) {
            const x = R(hx + ((ex - hx) * i) / n) + 2, y = R(hy - 1 + ((ey - hy) * i) / n);
            const lit = (Math.floor(g.t * 9) + i) % 4 !== 0;
            px(x, y, lit ? '#BFE6FF' : '#6CB4EE');
          }
          // reflejo de la pantalla en el suelo
          alpha(0.35 + 0.15 * Math.sin(g.t * 6), () => rect(hx + 3, hy - 1, 8, 1, '#BFE6FF'));
        }
      },
      over(g) {
        if (g.k < 1) return;
        // símbolos de código que salen de la pantalla
        const toks = ['<', '/', '>', '{', '}', '='];
        const cols = [C.green, C.yellow, '#6CB4EE', C.pink, C.white];
        for (let i = 0; i < 3; i++) {
          const ph = g.t * 0.7 + i / 3;
          const p = ph % 1;
          const n = Math.floor(ph);
          const x = 1 + ((n * 5 + i * 3) % 7) + p * 2;
          const y = 28 - p * 18;
          alpha(1 - p, () => glyph(toks[(n + i) % toks.length], x, y, cols[(n + i * 2) % cols.length]));
        }
      },
    },

    // 📖 Leer archivos: lee un libro y pasa páginas
    reading: {
      pose(P, t) {
        P.lookY = 1;
        P.lookX = R(Math.sin(t * 2.2));
        P.eyes = blink(t, 5) ? 'closed' : 'down';
        P.armL = { x: 3, y: 6 };
        P.armR = { x: -3, y: 6 };
        const fp = t % 2.6;
        if (fp > 0.5 && fp < 0.8) P.bob = 1;           // asiente al pasar la página
        if ((t % 13) > 11.5) { P.lookY = 0; P.eyes = 'open'; P.mouth = 'o'; } // "¡oh, interesante!"
      },
      front(g) {
        const off = R((1 - easeOut(g.k)) * 10);
        let sway = 0;
        if (O.groove) { const b = beatInfo(g.t); sway = b.ph < 0.5 ? (b.beat % 2 ? 1 : -1) : 0; }
        const bx = g.cx - 9 + sway + g.P.dx, y = g.bottom - 6 + off;
        rect(bx, y, 18, 8, C.blueDk);
        rect(bx + 1, y - 1, 7, 8, C.paper);
        rect(bx + 10, y - 1, 7, 8, C.paper);
        const cx = bx + 9;
        rect(cx - 1, y - 1, 2, 8, C.cloudSh);
        [1, 3, 5].forEach(r => { rect(bx + 2, y + r, 5, 1, C.paperLn); rect(bx + 11, y + r, 5, 1, C.paperLn); });
        const fp = g.t % 2.6;
        if (fp < 0.45 && g.k >= 1) {
          const q = fp / 0.45;
          const w = R(Math.abs(Math.cos(q * Math.PI)) * 7);
          if (q < 0.5) rect(cx + 1, y - 2, w, 8, C.white);
          else rect(cx - 1 - w, y - 2, w, 8, C.white);
        }
      },
    },

    // 🔍 Buscar (Grep/Glob): lupa que agranda sus ojos
    searching: {
      pose(P, t) {
        const sw = Math.sin(t * 1.6);
        const lx = 20 + R(sw * 7);
        const ly = BASE_BOTTOM - 10 + R(Math.cos(t * 3.2) * 1.5);
        P.extra = { kind: 'searching', lx, ly };
        P.armR = { x: lx + 5 - 30, y: ly + 5 - (BASE_BOTTOM - 8) };
        P.lookX = sw > 0.3 ? 1 : sw < -0.3 ? -1 : 0;
        P.mouth = Math.abs(sw) < 0.25 ? 'o' : 'flat';
        P.armL = { x: 1, y: 2 };
      },
      front(g) {
        const e = g.P.extra;
        if (!e || e.kind !== 'searching') return;
        const { lx, ly } = e;
        alpha(g.k, () => {
          line(lx + 3, ly + 3, lx + 6, ly + 6, C.woodDk, 2);
          alpha(0.5, () => circle(lx, ly, 3, C.glass));
          for (const ex of [14 + g.P.lookX, 24 + g.P.lookX]) {
            if (Math.abs(lx - (ex + 1)) <= 2) { rect(lx - 1, ly - 2, 3, 4, C.eye); px(lx - 1, ly - 2, C.shine); }
          }
          ring(lx, ly, 4, C.metalDk);
          px(lx - 2, ly - 2, C.white);
        });
      },
    },

    // ⚡ Comandos (Bash/PowerShell): terminal flotante con texto verde
    terminal: {
      pose(P, t) {
        const tap = Math.floor(t * 4) % 2;
        P.lookX = -1;
        P.lookY = -1;
        P.armL = { x: 2, y: -7 - tap };
        P.openL = tap === 1;
        P.armR = { x: -1, y: 2 };
        P.mouth = 'flat';
        P.bob = (t % 2.2) < 0.15 ? 1 : 0;
      },
      over(g) {
        const LL = [9, 6, 11, 7, 10, 5, 8, 11];
        const w = 17, h = 12;
        const x = 1, y = g.top - 17 + R((1 - clamp(g.k)) * 4);
        alpha(clamp(g.k * 1.6), () => {
          rect(x, y, w, h, C.metalDk);
          rect(x, y, w, 2, C.metal);
          px(x + 1, y, C.red); px(x + 3, y, C.yellow); px(x + 5, y, C.green);
          rect(x + 1, y + 2, w - 2, h - 3, C.screen);
          let n = Math.floor(g.t * 14) % 600;
          let L = 0;
          while (n > LL[L % LL.length] + 4) { n -= LL[L % LL.length] + 4; L++; }
          const partial = Math.min(n, LL[L % LL.length]);
          const first = Math.max(0, L - 3);
          for (let r = 0; r <= L - first; r++) {
            const li = first + r;
            const len = li < L ? LL[li % LL.length] : partial;
            const yy = y + 3 + r * 2;
            px(x + 2, yy, C.greenDk);
            rect(x + 4, yy, len, 1, C.green);
            if (li === L && Math.floor(g.t * 3) % 2) px(x + 4 + len, yy, C.white);
          }
        });
      },
    },

    // 🌐 Web / navegador: sostiene un globo terráqueo que gira
    web: {
      pose(P, t) {
        P.armL = { x: 6, y: -13 };
        P.armR = { x: -6, y: -13 };
        P.lookY = -1;
        P.mouth = 'smile';
        P.bob = Math.sin(t * 3) > 0 ? 0 : 1;
        if (blink(t)) P.eyes = 'closed';
      },
      front(g) {
        const gx = 20, gy = g.top - 7;
        const r = Math.max(1, R(5 * easeBack(g.k)));
        const offset = Math.floor(g.t * 5);
        for (let dy = -r; dy <= r; dy++) {
          const half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
          const row = clamp(R((dy / r) * 5) + 5, 0, 10);
          for (let dx = -half; dx <= half; dx++) {
            const col = ((dx + 5 + offset) % 24 + 24) % 24;
            const isLand = LAND[row][col] === '#';
            let c = isLand ? C.land : C.blue;
            if (dx === half) c = isLand ? C.landDk : C.blueDk;
            px(gx + dx, gy + dy, c);
          }
        }
        if (r >= 4) px(gx - 2, gy - 3, C.sky);
        // satélite en órbita
        if (g.k >= 1) {
          const a = g.t * 2.2;
          const sx = gx + Math.cos(a) * 8, sy = gy + Math.sin(a) * 3;
          if (Math.sin(a) > -0.2 || Math.abs(Math.cos(a)) > 0.7) {
            px(sx, sy, C.white); px(sx - 1, sy, C.sky); px(sx + 1, sy, C.sky);
          }
        }
      },
    },

    // 🤖 Agentes / otras sesiones: mini Pals que desfilan
    agent: {
      pose(P, t) {
        const w = Math.floor(t * 5) % 2;
        P.armR = { x: 0, y: -8 + w };
        P.openR = w === 0;
        P.mouth = 'grin';
        P.lookY = 1;
        P.lookX = R(Math.sin(t * 1.5));
        P.bob = Math.sin(t * 2) > 0.5 ? 1 : 0;
      },
      front(g) {
        for (let i = 0; i < 3; i++) {
          const p = (g.t * 0.18 + i / 3) % 1;
          const mx = -7 + p * 54;
          const hop = O.groove ? (beatInfo(g.t).ph < 0.35 ? 1 : 0) : Math.floor(g.t * 6 + i) % 2;
          alpha(g.k, () => mini(mx, 39 - hop, g.t + i));
        }
      },
    },

    // 📋 Planear tareas: portapapeles marcando casillas
    planning: {
      pose(P, t, lt) {
        const n = Math.floor(lt * 1.1) % 5;
        const row = Math.min(n, 2);
        const wig = Math.floor(t * 8) % 2;
        P.extra = { kind: 'planning', checked: Math.min(n, 3), row, wig };
        P.armL = { x: 4, y: 5 };
        P.armR = { x: -10 + wig, y: 2 * row - 1 };
        P.lookX = -1;
        P.lookY = 1;
        P.eyes = 'down';
      },
      front(g) {
        const off = R((1 - easeOut(g.k)) * 10);
        const x = g.cx - 9, y = g.bottom - 7 + off;
        rect(x, y, 10, 9, C.wood);
        rect(x, y + 8, 10, 1, C.woodDk);
        rect(x + 1, y + 1, 8, 7, C.paper);
        rect(x + 3, y - 1, 4, 2, C.metalDk);
        const e = g.P.extra && g.P.extra.kind === 'planning' ? g.P.extra : { checked: 3 };
        for (let r = 0; r < 3; r++) {
          const ry = y + 2 + r * 2;
          rect(x + 5, ry, 3, 1, C.paperLn);
          if (r < e.checked) { px(x + 1, ry, C.greenDk); px(x + 2, ry + 1, C.greenDk); px(x + 3, ry, C.greenDk); px(x + 4, ry - 1, C.greenDk); }
          else px(x + 2, ry, C.paperLn);
        }
        // lápiz en la pinza derecha
        if (g.P.extra && g.P.extra.kind === 'planning' && g.k >= 1) {
          const cx = 30 + g.P.armR.x, cy = g.bottom - 8 + g.P.armR.y;
          const tx = x + 8, ty = y + 2 + e.row * 2;
          line(cx + 1, cy + 1, tx, ty, C.yellow);
          px(tx, ty, C.ink);
          px(cx + 2, cy, C.pink);
        }
      },
    },

    // ⚙️ Otras herramientas: gira un engranaje
    tinkering: {
      pose(P, t) {
        P.armR = { x: -1, y: -9 + (Math.floor(t * 4) % 2) };
        P.lookX = 1;
        P.lookY = -1;
        P.mouth = 'flat';
        if (blink(t)) P.eyes = 'closed';
      },
      over(g) {
        const gx = 33, gy = g.top - 7;
        const ang = O.groove ? (beatInfo(g.t).beat * Math.PI) / 8 : g.t * 2.5; // con música gira a golpes
        alpha(g.k, () => {
          circle(gx, gy, 3, C.metal);
          for (let i = 0; i < 8; i++) {
            const a = ang + (i * Math.PI) / 4;
            rect(gx + Math.cos(a) * 4.2 - 0.5, gy + Math.sin(a) * 4.2 - 0.5, 2, 2, C.metalDk);
          }
          circle(gx, gy, 1, C.metalDk);
          if (Math.floor(g.t * 6) % 3 === 0) { px(gx - 5, gy + 3, C.yellow); px(gx - 6, gy + 1, C.yellow); }
        });
      },
    },

    // ---------- juegos con el ratón (cuando Claude no tiene nada que hacer) ----------
    // O.play trae: dir (-1 izquierda / 1 derecha), fast, hop (0..1), success

    walk: {
      pose(P, t) {
        const d = (O.play && O.play.dir) || 1;
        const fast = O.play && O.play.fast;
        const f = Math.floor(t * (fast ? 16 : 9)) % 2;
        P.legs = f ? [2, 0, 2, 0] : [0, 2, 0, 2];
        P.bob = f ? -1 : 0;
        P.lookX = d;
        P.armL = { x: 0, y: f ? -1 : 1 };
        P.armR = { x: 0, y: f ? 1 : -1 };
        if (fast) { P.eyes = 'wide'; P.mouth = 'grin'; }
        else if (blink(t)) P.eyes = 'closed';
      },
      over(g) {
        if (!(O.play && O.play.fast)) return;
        const d = O.play.dir || 1;
        for (let i = 0; i < 3; i++) {
          const p = (g.t * 3 + i / 3) % 1;
          alpha(1 - p, () => rect(20 - d * (12 + p * 6), 41 - p * 3, 2, 2, C.cloudSh));
        }
      },
    },

    wave: {
      pose(P, t) {
        const d = (O.play && O.play.dir) || 1;
        const w = Math.floor(t * 6) % 2;
        const arm = { x: 0, y: -8 + w };
        if (d < 0) { P.armL = arm; P.openL = !w; } else { P.armR = arm; P.openR = !w; }
        P.lookX = d;
        P.mouth = 'smile';
        P.bob = Math.sin(t * 4) > 0.7 ? -1 : 0;
      },
    },

    peekaboo: {
      pose(P, t, lt) {
        if (lt < 2) {
          P.armL = { x: 7, y: -2 };
          P.armR = { x: -7, y: -2 };
          P.eyes = 'closed';
          P.mouth = 'smile';
          P.bob = Math.floor(t * 3) % 2;
        } else {
          P.armL = { x: -1, y: -7 };
          P.armR = { x: 1, y: -7 };
          P.openL = P.openR = true;
          P.eyes = 'wide';
          P.mouth = 'grin';
          P.blush = true;
          P.bob = lt < 2.4 ? -3 : 0;
        }
      },
    },

    highfive: {
      pose(P, t) {
        const d = (O.play && O.play.dir) || 1;
        if (O.play && O.play.success) {
          P.bob = -R(Math.abs(Math.sin(t * 7)) * 4);
          P.eyes = 'happy'; P.mouth = 'grin'; P.blush = true;
          P.armL = { x: -1, y: -10 }; P.armR = { x: 1, y: -10 };
          return;
        }
        const arm = { x: d, y: -11 };
        if (d < 0) { P.armL = arm; P.openL = true; } else { P.armR = arm; P.openR = true; }
        P.lookX = d; P.lookY = -1; P.mouth = 'smile';
        P.bob = Math.sin(t * 3) > 0.8 ? -1 : 0;
      },
      over(g) {
        if (!(O.play && O.play.success)) return;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + g.t * 3;
          px(20 + Math.cos(a) * 14, g.top - 4 + Math.sin(a) * 5, C.yellow);
        }
      },
    },

    beg: {
      pose(P, t) {
        if (O.play && O.play.success) {
          P.eyes = 'happy'; P.mouth = 'grin'; P.blush = true;
          P.bob = Math.sin(t * 8) > 0 ? 0 : -1;
          P.armL = { x: 6, y: 1 }; P.armR = { x: -6, y: 1 };
          return;
        }
        P.eyes = 'puppy';
        P.blush = true;
        P.mouth = 'smile';
        P.armL = { x: 6, y: 1 };
        P.armR = { x: -6, y: 1 };
        P.lookY = -1;
        P.bob = Math.sin(t * 3) > 0 ? 0 : 1;
      },
    },

    watch: {
      pose(P) {
        P.eyes = 'squint';
        P.mouth = 'flat';
        P.armL = { x: 8, y: 3 };
        P.armR = { x: -8, y: 4 };
        lookAt(P);
      },
    },

    hop: {
      pose(P) {
        const ph = (O.play && O.play.hop) || 0;
        const h = Math.sin(ph * Math.PI);
        P.lookX = (O.play && O.play.dir) || 1;
        if (h > 0.15) {
          P.bob = -R(h * 7);
          P.legs = [2, 1, 1, 2];
          P.armL = { x: -1, y: -5 }; P.armR = { x: 1, y: -5 };
          P.mouth = 'grin';
        } else {
          P.sy = -1; P.sx = 1;          // se agacha para tomar impulso
          P.mouth = 'smile';
        }
      },
    },

    dance: {
      pose(P, t) {
        if (O.groove) return grooveDance(P, t);
        const s = Math.floor(t * 2.8) % 4;
        P.eyes = 'happy'; P.mouth = 'grin'; P.blush = true;
        if (s === 0) { P.armL = { x: -1, y: -9 }; P.armR = { x: 0, y: 2 }; P.legs = [0, 2, 0, 0]; }
        else if (s === 1) { P.bob = -2; }
        else if (s === 2) { P.armR = { x: 1, y: -9 }; P.armL = { x: 0, y: 2 }; P.legs = [0, 0, 2, 0]; }
        else { P.armL = { x: -1, y: -7 }; P.armR = { x: 1, y: -7 }; P.bob = -2; }
        P.lookX = s < 2 ? -1 : 1;
      },
      over(g) {
        for (let i = 0; i < 2; i++) {
          const p = (g.t * 0.6 + i / 2) % 1;
          const x = (i ? 31 : 6) + Math.sin(p * 6) * 2;
          alpha((1 - p) * g.k, () => glyph('♪', x, g.top - 1 - p * 14, i ? C.yellow : '#A79BF5'));
        }
      },
    },

    kiss: {
      pose(P, t, lt) {
        const d = (O.play && O.play.dir) || 1;
        if (lt < 0.7) {
          const arm = { x: d < 0 ? 7 : -7, y: 1 };
          if (d < 0) P.armL = arm; else P.armR = arm;
          P.eyes = 'closed'; P.mouth = 'o';
        } else {
          const arm = { x: d, y: -5 };
          if (d < 0) { P.armL = arm; P.openL = true; } else { P.armR = arm; P.openR = true; }
          P.eyes = 'happy'; P.mouth = 'smile'; P.blush = true;
        }
        P.lookX = d;
      },
      over(g) {
        if ((g.lt || 0) < 0.7) return;
        const q = clamp((g.lt - 0.7) / 1.6);
        const d = (O.play && O.play.dir) || 1;
        const x = 18 + d * (4 + q * 16);
        const y = g.top + 6 - q * 14 - Math.sin(q * Math.PI) * 3;
        alpha(1 - Math.max(0, (q - 0.7) / 0.3), () => bitmap(HEART, x, y, C.red));
      },
    },

    stretch: {
      pose(P, t, lt) {
        if (lt < 1.4) {
          const q = clamp(lt / 0.5);
          P.sy = R(q * 2);
          P.armL = { x: -1, y: -R(q * 9) };
          P.armR = { x: 1, y: -R(q * 9) };
          P.eyes = 'closed';
          P.mouth = 'yawn';
          if (lt > 0.5) P.legs = [1, 0, 0, 1];
        } else {
          P.eyes = 'happy';
          P.mouth = 'smile';
        }
      },
    },

    // ---------- canciones especiales (tus más escuchadas) ----------

    // 🕶️ Uptown Funk: paso lateral con estilo, hombros, señalar y pose congelada
    funk: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const down = ph < 0.35;
        const side = beat % 2 ? 1 : -1;
        P.mouth = 'smile';
        if (beat % 8 === 7) {                       // pose congelada con brazos cruzados
          P.armL = { x: 8, y: 3 }; P.armR = { x: -8, y: 4 }; P.dx = 2; P.mouth = 'grin';
          return;
        }
        if (Math.floor(beat / 8) % 2 === 0) {       // paso lateral
          P.dx = side * 3;
          P.legs = down ? (side < 0 ? [2, 0, 0, 0] : [0, 0, 0, 2]) : [0, 0, 0, 0];
          P.armL = { x: 0, y: side < 0 ? -4 : 1 };
          P.armR = { x: 0, y: side < 0 ? 1 : -4 };
          P.bob = down ? 1 : 0;
        } else {                                    // hombros arriba y abajo, señalando al cielo
          P.bob = down ? 1 : 0; P.sy = down ? 0 : 1;
          P.armR = { x: 1, y: down ? -10 : -8 };
          P.armL = { x: 2, y: 2 };
          P.lookX = 1;
        }
      },
    },

    // 🎸 Another One Bites the Dust: toca el bajo, cabecea y levanta polvo con cada pisotón
    bass: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const down = ph < 0.3;
        P.armL = { x: 1, y: -4 };
        P.armR = { x: -6, y: down ? 5 : 4 };
        P.openR = down;
        P.bob = down ? 1 : 0;
        P.eyes = down && beat % 2 === 0 ? 'closed' : 'open';
        P.mouth = beat % 4 === 0 ? 'grin' : 'flat';
        P.legs = down && beat % 2 === 0 ? [0, 0, 0, 2] : [0, 0, 0, 0];
      },
      front(g) {
        // el bajo: cuerpo rojo abajo a la derecha, mástil en diagonal hacia arriba a la izquierda
        const k = easeOut(g.k);
        const off = R((1 - k) * 8);
        const bx = 21 + g.P.dx, by = g.bottom - 7 + off;
        // mástil a la altura del pecho, casi horizontal (sin tapar la cara)
        line(bx, by + 2, 2 + g.P.dx, by, C.woodDk, 2);
        rect(0 + g.P.dx, by - 2, 3, 4, C.woodDk);
        px(1 + g.P.dx, by - 2, C.metalLt); px(1 + g.P.dx, by + 1, C.metalLt);
        line(bx, by + 2, 3 + g.P.dx, by + 1, '#E6E9EE', 1);
        // cuerpo del bajo
        rect(bx, by, 9, 6, '#B23A2E'); rect(bx + 1, by - 1, 7, 8, '#B23A2E');
        rect(bx + 3, by + 2, 3, 2, '#F3E9DC');
        rect(bx + 2, by + 5, 5, 1, '#7A2219');
      },
      over(g) {
        const { beat, ph } = beatInfo(g.t);
        if (beat % 2 !== 0 || ph > 0.6) return;     // polvo en cada pisotón
        const q = ph / 0.6;
        alpha(1 - q, () => {
          for (let i = 0; i < 3; i++) rect(27 + g.P.dx + i * 2 + q * 4, 41 - q * 2 - i % 2, 2, 2, C.cloudSh);
          rect(9 + g.P.dx - q * 4, 41 - q * 2, 2, 2, C.cloudSh);
        });
      },
    },

    // 💰 24K Magic: cadena de oro, levanta el techo con las pinzas y lluvia de monedas
    gold: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const down = ph < 0.35;
        P.armL = { x: -1, y: down ? -11 : -8 };
        P.armR = { x: 1, y: down ? -8 : -11 };
        P.openL = P.openR = true;
        P.bob = down ? 1 : 0;
        P.eyes = 'happy'; P.mouth = 'grin'; P.blush = true;
        if (beat % 4 === 3) P.lookX = beat % 8 === 3 ? -1 : 1;
      },
    },

    // ✌️ two (bbno$): saltito doble, pinzas en "V", un "2" gigante y su mini gemelo
    two: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        P.bob = ph < 0.25 ? (beat % 2 === 0 ? -3 : -2) : 0;
        P.armL = beat % 2 ? { x: -1, y: -9 } : { x: 0, y: 1 };
        P.armR = beat % 2 ? { x: 0, y: 1 } : { x: 1, y: -9 };
        P.openL = P.openR = true;
        P.eyes = 'happy'; P.mouth = 'grin'; P.blush = true;
      },
      over(g) {
        const { beat, ph } = beatInfo(g.t);
        alpha(g.k, () => glyph('2', 17 + g.P.dx, g.top - 14 - (ph < 0.25 ? 1 : 0), beat % 2 ? '#F28FB1' : '#6CB4EE', 2));
        alpha(g.k, () => mini(33, 39 - (ph < 0.25 ? 1 : 0), g.t));
      },
    },

    // 🕺 I Just Might (Bruno Mars), inspirado en su vídeo: traje verde, "aura" dorada,
    // su propia banda de mini Pals (batería y guitarra) y, cada 8 tiempos, un guiño con chispa
    imight: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const down = ph < 0.35;
        const side = beat % 2 ? 1 : -1;
        const cyc = beat % 8;
        if (cyc === 6) {                            // giro con brazos abiertos
          P.lookX = ph < 0.5 ? -1 : 1;
          P.armL = { x: -2, y: -4 }; P.armR = { x: 2, y: -4 };
          P.openL = P.openR = true; P.mouth = 'grin';
        } else if (cyc === 7) {                     // guiño y te señala ✨
          P.eyes = 'wink'; P.mouth = 'smile'; P.blush = true;
          P.armR = { x: -3, y: -6 }; P.openR = false;
          P.armL = { x: 4, y: 1 };                  // la otra pinza en la solapa
        } else {                                    // deslizamiento suave, mano en la solapa y chasquidos
          P.dx = side * 3;
          P.bob = down ? 1 : 0;
          P.armL = { x: 4, y: 1 };
          P.armR = { x: -1, y: -5 }; P.openR = !down;
          P.legs = down ? (side < 0 ? [2, 0, 0, 0] : [0, 0, 0, 2]) : [0, 0, 0, 0];
          P.mouth = 'smile';
        }
      },
      front(g) { miniBand(g, true); },
      over(g) { winkSpark(g); },
    },

    // 🎭 Angine de Poitrine: traje de lunares, máscara alta con nariz larga, guitarra de doble mástil
    // tocada con acentos irregulares (3+3+2), anillos de loop y un mini batería enmascarado
    angine: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const hit = ANGINE_ACC[beat % 8] && ph < 0.3;
        P.armL = { x: 3, y: -4 };                  // mano en los mástiles
        P.armR = { x: -5, y: hit ? 4 : 3 };        // mano que puntea
        P.openR = hit;
        P.mouth = null;
        if (beat % 16 === 15) {                     // pose rara: brazos arriba, quieto
          P.armL = { x: -1, y: -10 }; P.armR = { x: 1, y: -10 };
          P.eyes = 'closed';
          return;
        }
        if (hit) { P.dx = beat % 2 ? 2 : -2; P.sy = -1; P.eyes = 'wide'; P.legs = [0, 2, 0, 0]; }
        else P.bob = ph < 0.5 ? 0 : 1;
      },
      front(g) {
        // guitarra de doble mástil
        const k = easeOut(g.k);
        const off = R((1 - k) * 8);
        const bx = 18 + g.P.dx, by = g.bottom - 7 + off;
        line(bx, by + 1, 2 + g.P.dx, by - 5, C.woodDk, 1);
        line(bx, by + 4, 2 + g.P.dx, by, C.woodDk, 1);
        rect(1 + g.P.dx, by - 7, 2, 2, C.woodDk); rect(1 + g.P.dx, by - 2, 2, 2, C.woodDk);
        rect(bx, by, 9, 6, '#7A2219'); rect(bx + 1, by - 1, 7, 8, '#7A2219');
        rect(bx + 3, by + 1, 2, 1, C.metalLt); rect(bx + 3, by + 4, 2, 1, C.metalLt);
      },
      over(g) {
        angineTris(g);
        loopRings(g);
        miniMaskedDrummer(g);
      },
    },

    // ✨ Billie Jean (Michael Jackson): baldosas que se iluminan, guante brillante, patada y giro de puntillas
    billie: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const down = ph < 0.35;
        const cyc = beat % 8;
        if (cyc === 7) {                            // giro y de puntillas
          P.lookX = ph < 0.33 ? -1 : ph < 0.66 ? 1 : 0;
          P.bob = -1; P.legs = [1, 1, 1, 1];
          P.armR = { x: 1, y: -10 }; P.openR = false;
          P.mouth = 'o';
          return;
        }
        if (cyc === 3) {                            // ¡patada!
          P.legs = [0, 0, 0, 3]; P.dx = -1;
          P.armL = { x: -1, y: -6 }; P.armR = { x: 0, y: -3 };
          P.mouth = 'grin';
          return;
        }
        const side = beat % 2 ? 1 : -1;             // paso y toque, guante arriba
        P.dx = side * 2;
        P.legs = down ? (side < 0 ? [2, 0, 0, 0] : [0, 0, 0, 2]) : [0, 0, 0, 0];
        P.armR = { x: -1, y: down ? -7 : -6 };
        P.armL = { x: 1, y: 2 };
        P.bob = down ? 1 : 0;
        P.mouth = 'flat';
      },
    },

    // 🎤 Don't Stop Me Now (Queen): modo Freddie: medio pie de micro, corre sin parar y puño en alto
    dontstop: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const cyc = beat % 8;
        P.armL = { x: 3, y: -3 };                   // sostiene el micro
        if (cyc >= 6) {                             // ¡puño en alto!
          P.armR = { x: 1, y: -12 }; P.openR = false;
          P.sy = 1; P.mouth = 'o'; P.eyes = 'closed';
          P.bob = cyc === 6 && ph < 0.3 ? -2 : 0;
          return;
        }
        // corre en el sitio, sin parar
        const f = Math.floor((beat + ph) * 2) % 2;
        P.legs = f ? [2, 0, 2, 0] : [0, 2, 0, 2];
        P.bob = f ? -1 : 0;
        P.armR = { x: 0, y: f ? -3 : 1 };
        P.mouth = beat % 2 ? 'o' : 'grin';
        P.eyes = 'open';
        P.blush = true;
      },
      front(g) {
        // medio pie de micro en la pinza izquierda
        const cx = 6 + g.P.armL.x + g.P.dx, cy = g.bottom - 8 + g.P.armL.y;
        line(cx + 1, cy + 2, cx - 3, cy + 9, C.metal, 1);
        rect(cx + 1, cy - 2, 2, 2, '#2A2522');
        px(cx + 1, cy - 2, C.metalLt);
      },
      over(g) {
        shootingStar(g);
        // líneas de velocidad detrás mientras corre
        const { beat } = beatInfo(g.t);
        if (beat % 8 < 6) {
          for (let i = 0; i < 3; i++) {
            const y = g.top + 3 + i * 4;
            const len = 3 + ((Math.floor(g.t * 10) + i) % 3);
            alpha(0.6, () => rect(32 + g.P.dx, y, len, 1, C.white));
          }
        }
      },
    },

    // 🍔 burger (bbno$): sostiene una hamburguesa que rebota al ritmo y le da mordiscos
    burger: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const cyc = beat % 8;
        P.armL = { x: 4, y: 6 }; P.armR = { x: -4, y: 6 };
        P.bob = ph < 0.35 ? 1 : 0;
        P.legs = ph < 0.35 ? (beat % 2 ? [0, 0, 0, 1] : [1, 0, 0, 0]) : [0, 0, 0, 0];
        if (cyc === 6) {                            // ¡mordisco!
          P.armL = { x: 4, y: 5 }; P.armR = { x: -4, y: 5 };
          P.eyes = 'closed';
        } else if (cyc === 7) {                     // masticando, feliz
          P.eyes = 'happy'; P.blush = true;
        } else {
          // mirando la hamburguesa; ojos de 2 filas para que el pan nunca los tape
          P.lookY = 1;
          P.eyes = blink(t, 3.1) ? 'closed' : 'down';
        }
      },
      front(g) {
        const { beat, ph } = beatInfo(g.t);
        const cyc = beat % 8;
        const bites = Math.floor(beat / 8) % 4 + (cyc === 7 ? 1 : 0);   // 0-4 mordiscos, luego una nueva
        const k = easeOut(g.k);
        const x = 13 + g.P.dx;
        // más baja que antes: el pan de arriba queda siempre por debajo de los ojos
        const y = g.bottom - 4 + R((1 - k) * 8) - (cyc === 6 ? 1 : 0);
        const lift = ph < 0.25 && cyc !== 6 ? 1 : 0; // el pan salta con el ritmo (no durante el mordisco)
        rect(x, y + 6, 14, 2, '#D9963F');                         // pan de abajo
        rect(x, y + 4, 14, 2, '#6B3A1F');                         // carne
        rect(x, y + 3, 14, 1, '#F2C14E'); px(x + 3, y + 4, '#F2C14E'); px(x + 10, y + 4, '#F2C14E'); // queso
        for (let i = 0; i < 16; i++) px(x - 1 + i, y + 2 + (i % 2), '#5CB85C');                       // lechuga
        rect(x + 1, y - 2 - lift, 12, 1, '#E0A24A');               // pan de arriba
        rect(x, y - 1 - lift, 14, 3, '#E0A24A');
        [[3, -1], [7, -2], [10, 0], [5, 1]].forEach(([sx, sy]) => px(x + sx, y + sy - lift, '#FFF6E0')); // sésamo
        // mordiscos: huecos en la esquina de arriba a la derecha (se ve el cuerpo de Pal detrás)
        for (let b = 0; b < Math.min(bites, 4); b++) {
          const bx = x + 13 - b * 2, by = y - 1 - lift + (b % 2);
          rect(bx, by, 2, 2, C.body);
        }
      },
      over(g) {
        const { beat, ph } = beatInfo(g.t);
        if (beat % 8 === 7) {                       // migas al masticar
          for (let i = 0; i < 4; i++) px(18 + i * 2 + g.P.dx, g.top + 13 + ph * 6 + (i % 2), '#E0A24A');
        }
        // mini hamburguesas que suben a los lados
        for (let i = 0; i < 2; i++) {
          const p = (g.t * 0.35 + i / 2) % 1;
          const mx = i ? 33 : 2, my = g.top + 6 - p * 18;
          alpha((1 - p) * g.k, () => {
            rect(mx, my, 4, 1, '#E0A24A'); rect(mx, my + 1, 4, 1, '#5CB85C'); rect(mx, my + 2, 4, 1, '#6B3A1F'); rect(mx, my + 3, 4, 1, '#D9963F');
          });
        }
      },
    },

    // ⭐ I'm Still Standing (Elton John): gafas de estrella, se tambalea… ¡y sigue de pie!
    standing: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const down = ph < 0.35;
        const cyc = beat % 8;
        if (cyc === 6) {                            // casi se cae
          P.dx = ph < 0.5 ? -2 : 2;
          P.eyes = 'wide'; P.mouth = 'o';
          P.armL = { x: -2, y: -3 }; P.armR = { x: 2, y: -3 };
          P.legs = [0, 2, 2, 0];
        } else if (cyc === 7) {                     // ¡sigue de pie! se estira orgulloso
          P.sy = 2;
          P.armL = { x: -1, y: -11 }; P.armR = { x: 1, y: -11 };
          P.openL = P.openR = true;
          P.eyes = 'happy'; P.mouth = 'grin'; P.blush = true;
        } else {                                    // marcha alegre, pinzas alternando
          const side = beat % 2 ? 1 : -1;
          P.bob = down ? 1 : 0;
          P.armL = { x: 0, y: side < 0 && down ? -6 : -2 };
          P.armR = { x: 0, y: side > 0 && down ? -6 : -2 };
          P.legs = down ? (side < 0 ? [1, 0, 0, 0] : [0, 0, 0, 1]) : [0, 0, 0, 0];
          P.mouth = 'smile';
        }
      },
    },

    // 🎩 Chicago (Michael Jackson): sombrero, guante blanco, moonwalk y saludo con el sombrero
    chicago: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const cyc = beat % 16;
        if (cyc >= 14) {                            // de puntillas y toca el sombrero
          P.bob = -1; P.legs = [1, 1, 1, 1];
          P.armR = { x: -4, y: -11 }; P.openR = false;
          P.armL = { x: 1, y: 2 };
          P.mouth = 'o'; P.eyes = cyc === 15 ? 'closed' : 'open';
          return;
        }
        // moonwalk: se desliza hacia atrás (mira hacia un lado, avanza hacia el otro)
        const dir = Math.floor(beat / 16) % 2 ? 1 : -1;
        const q = (cyc + ph) / 14;
        P.dx = R(-dir * (q * 10 - 5));
        P.lookX = dir;
        P.legs = Math.floor((cyc + ph) * 2) % 2 ? [2, 0, 2, 0] : [0, 2, 0, 2];
        P.armL = { x: 0, y: 1 }; P.armR = { x: 0, y: 1 };
        P.mouth = 'flat';
      },
    },

    // 🫰 That's What I Like (Bruno Mars): pasos suaves, chasquidos y garabatos al ritmo
    thatswhat: {
      pose(P, t) {
        const { beat, ph } = beatInfo(t);
        const down = ph < 0.3;
        const side = beat % 2 ? 1 : -1;
        if (beat % 8 === 7) {                       // vuelta con brazos abiertos
          P.lookX = ph < 0.5 ? -1 : 1;
          P.armL = { x: -2, y: -4 }; P.armR = { x: 2, y: -4 };
          P.openL = P.openR = true; P.mouth = 'grin'; P.eyes = 'happy';
          return;
        }
        P.dx = side * 2;
        P.bob = down ? 1 : 0;
        P.armL = { x: 2, y: -5 }; P.armR = { x: -2, y: -5 };
        P.openL = side < 0 ? !down : true;          // chasquido: la pinza se cierra en el golpe
        P.openR = side > 0 ? !down : true;
        P.legs = down ? (side < 0 ? [2, 0, 0, 0] : [0, 0, 0, 2]) : [0, 0, 0, 0];
        P.eyes = beat % 4 === 0 && down ? 'happy' : 'open';
        P.mouth = 'smile';
      },
    },

    // 🪑 "Quédate sentado": sentado en su cojín, tranquilo
    sit: {
      pose(P, t) {
        P.bob = 2;
        P.legs = [3, 3, 3, 3];
        P.armL = { x: 1, y: 2 };
        P.armR = { x: -1, y: 2 };
        if (blink(t, 5)) P.eyes = 'closed';
        lookAt(P);
        if ((t % 16) > 14.5) { const w = Math.floor(t * 6) % 2; P.armR = { x: 0, y: -7 + w }; P.openR = !w; P.mouth = 'smile'; }
      },
    },

    // ❗ Necesita tu permiso o tu respuesta
    waiting: {
      pose(P, t) {
        const a = Math.floor(t * 5) % 2;
        P.bob = -R(Math.abs(Math.sin(t * 5)) * 4);
        P.armL = { x: -1, y: -9 + a * 2 };
        P.armR = { x: 1, y: -9 + (1 - a) * 2 };
        P.openL = a === 0;
        P.openR = a === 1;
        P.eyes = 'wide';
        P.mouth = 'o';
      },
      over(g) {
        const big = Math.floor(g.t * 2.5) % 2;
        const w = 7 + big * 2, h = 9 + big * 2;
        const x = 20 - Math.floor(w / 2) - 1;
        const y = g.top - 14 - big + R((1 - easeBack(g.k)) * 4);
        alpha(g.k, () => {
          rect(x + 1, y, w - 2, h, C.red);
          rect(x, y + 1, w, h - 2, C.red);
          rect(19, y + 2, 2, h - 6, C.white);
          rect(19, y + h - 3, 2, 2, C.white);
          const dp = (g.t * 1.3) % 1;
          alpha(1 - dp, () => { px(31, g.top + 1 + R(dp * 4), '#7CC4F2'); rect(30, g.top + 2 + R(dp * 4), 3, 2, '#7CC4F2'); });
        });
      },
    },

    // 🎉 Terminó
    celebrate: {
      pose(P, t) {
        P.bob = -R(Math.abs(Math.sin(t * 6)) * 6);
        P.armL = { x: -1, y: -10 };
        P.armR = { x: 1, y: -10 };
        P.openL = P.openR = Math.floor(t * 6) % 2 === 0;
        P.eyes = 'happy';
        P.mouth = 'grin';
        P.blush = true;
        if (P.bob < -2) P.legs = [1, 0, 0, 1];
      },
      over(g) {
        alpha(g.k, () => {
          const hx = 12, hy = g.top - 1;
          rect(hx, hy - 1, 8, 1, C.yellow);
          rect(hx + 1, hy - 2, 6, 1, C.red);
          rect(hx + 1, hy - 3, 6, 1, C.yellow);
          rect(hx + 2, hy - 4, 4, 1, C.red);
          rect(hx + 3, hy - 5, 2, 1, C.yellow);
          rect(hx + 3, hy - 7, 2, 2, C.white);
        });
        if (particles.length < 70) {
          for (let i = 0; i < 2; i++) {
            particles.push({ x: 20, y: g.top, vx: (Math.random() - 0.5) * 34, vy: -20 - Math.random() * 14, c: CONFETTI[(Math.random() * CONFETTI.length) | 0], life: 1.8 });
          }
        }
      },
    },
  };

  function mini(x, y, t) {
    const a = Math.floor(t * 8) % 2;
    rect(x, y, 6, 3, C.light);
    rect(x, y + 2, 6, 1, C.body);
    px(x + 1, y + 1, C.eye);
    px(x + 4, y + 1, C.eye);
    px(x - 1, y + 1 - a, C.light);
    px(x + 6, y + a, C.light);
    px(x + 1 + a, y + 3, C.shade);
    px(x + 4 - a, y + 3, C.shade);
  }

  // ---------- efectos puntuales ----------
  const CONFETTI = ['#D97757', '#F2C14E', '#3FB950', '#6CB4EE', '#E5484D', '#A79BF5'];
  let particles = [];
  let effects = [];
  const HOLDING = ['editing', 'reading', 'planning', 'searching', 'web', 'terminal'];

  const EFFECTS = {
    // ✅ Tarea completada
    check: {
      dur: 1.5,
      pose(P, e, active) {
        if (active === 'waiting' || e > 0.8) return;
        P.eyes = 'happy';
        P.mouth = 'smile';
        if (!HOLDING.includes(active)) P.armL = { x: -1, y: -9 };
      },
      over(g, e) {
        const q = easeBack(e / 0.35);
        const y = g.top - 9 - e * 4;
        const a = e > 1.1 ? 1 - (e - 1.1) / 0.4 : 1;
        alpha(a, () => {
          circle(20, y, Math.max(1, R(3 * q)), '#3FB950');
          if (q > 0.8) { px(18, y, C.white); px(19, y + 1, C.white); px(20, y, C.white); px(21, y - 1, C.white); }
          for (let i = 0; i < 4; i++) {
            const ang = (i * Math.PI) / 2 + 0.7;
            const d = 5 + e * 6;
            px(20 + Math.cos(ang) * d, y + Math.sin(ang) * d, C.yellow);
          }
        });
      },
    },
    // 👆 Le haces clic: se encoge, rebota y se ríe
    poke: {
      dur: 0.7,
      pose(P, e) {
        const q = e / 0.7;
        if (q < 0.2) { P.sy = -2; P.sx = 2; }
        else if (q < 0.55) { P.bob = -3; P.sy = 1; P.legs = [1, 0, 0, 1]; }
        P.eyes = 'happy';
        P.mouth = 'grin';
        P.blush = true;
      },
    },
    // 📸 Captura de pantalla: saca una cámara y hace "¡patata!"
    photo: {
      dur: 1.7,
      pose(P, e) {
        if (e > 1.3) return;
        P.armL = { x: 6, y: -2 }; P.armR = { x: -6, y: -2 };
        P.eyes = 'happy'; P.mouth = 'grin';
      },
      over(g, e) {
        if (e > 1.3) return;
        const y = g.top + 3, x = 14 + g.P.dx;
        rect(x, y, 12, 7, '#2A2522');
        rect(x + 1, y - 1, 3, 1, '#2A2522');
        circle(x + 6, y + 3, 2, '#6CB4EE');
        px(x + 5, y + 2, C.white);
        px(x + 9, y + 1, e < 0.3 ? C.white : '#8E959F');
        if (e < 0.3) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            line(x + 9 + Math.cos(a) * 2, y + 1 + Math.sin(a) * 2, x + 9 + Math.cos(a) * 6, y + 1 + Math.sin(a) * 6, C.white);
          }
        }
      },
    },
    // 🚀 git push
    rocket: {
      dur: 2,
      pose(P, e) { if (e < 1.6) { P.armR = { x: 1, y: -10 }; P.openR = true; P.mouth = 'grin'; P.eyes = 'wide'; P.lookY = -1; } },
      over(g, e) {
        const y = g.top - 4 - e * 22;
        const x = 30;
        rect(x, y, 3, 5, C.white);
        px(x + 1, y - 1, C.red);
        px(x - 1, y + 4, C.red); px(x + 3, y + 4, C.red);
        px(x + 1, y + 2, '#6CB4EE');
        rect(x, y + 5, 3, 1, Math.floor(g.t * 12) % 2 ? C.yellow : '#F28C28');
        px(x + 1, y + 6, '#F28C28');
      },
    },
    // 😬 Fallaron los tests
    oops: {
      dur: 1.8,
      pose(P, e) {
        P.eyes = 'wide'; P.mouth = 'o';
        if (e < 0.8) P.dx += Math.floor(e * 20) % 2 ? 1 : -1;
      },
      over(g, e) {
        const dp = (e * 1.5) % 1;
        alpha(1 - dp, () => { rect(31 + g.P.dx, g.top + 1 + R(dp * 4), 2, 2, '#7CC4F2'); px(31 + g.P.dx, g.top + R(dp * 4), '#7CC4F2'); });
      },
    },
    // 😔 Límite de uso alcanzado
    sad: {
      dur: 4.5,
      pose(P) {
        P.eyes = 'down'; P.mouth = 'flat';
        P.armL = { x: 1, y: 3 }; P.armR = { x: -1, y: 3 };
        P.bob = Math.max(P.bob, 1);
      },
      over(g, e) {
        const p = (e * 0.8) % 1;
        alpha(1 - p, () => px(14 + g.P.dx, g.top + 7 + R(p * 6), '#7CC4F2'));
      },
    },
    // 💕 Le hiciste mimos
    love: {
      dur: 1.8,
      over(g, e) {
        for (let i = 0; i < 3; i++) {
          const p = clamp((e - i * 0.25) / 1.2);
          if (p <= 0) continue;
          const x = 12 + i * 7 + Math.sin(p * 7 + i) * 1.5;
          alpha(1 - p, () => bitmap(HEART, x, g.top - 2 - p * 14, i === 1 ? C.pink : C.red));
        }
      },
    },
    // 👋 Sesión nueva
    hello: {
      dur: 1.8,
      pose(P, e, active) {
        if (active === 'waiting' || active === 'celebrate' || HOLDING.includes(active)) return;
        const w = Math.floor(e * 6) % 2;
        P.armR = { x: 0, y: -8 + w };
        P.openR = w === 0;
        P.mouth = 'smile';
        if (P.eyes === 'closed') P.eyes = 'open';
      },
      over(g, e) {
        const a = e > 1.3 ? 1 - (e - 1.3) / 0.5 : 1;
        alpha(a, () => bitmap(HEART, 30, g.top - 10 - e * 4, C.red));
      },
    },
  };

  // ---------- director ----------
  let cur = 'sleeping', curSince = 0, prev = null, changeAt = -10, wakeUntil = -1;
  let lastT = 0;
  let shadowW = 18;
  let shadowDx = 0;

  function trigger(type) {
    if (!EFFECTS[type]) return;
    effects = effects.filter(e => e.type !== type);
    effects.push({ type, start: lastT });
  }

  function setup(canvas) {
    lastPx = null;   // lienzo nuevo: hay que pintarlo sí o sí
    U = Math.max(1, Math.round(4 * (window.devicePixelRatio || 1)));
    canvas.width = GW * U;
    canvas.height = GH * U;
    fctx = canvas.getContext('2d');
    return fctx;
  }

  // ⚡ Pal es pixel art: muchos fotogramas salen idénticos. Si el dibujo (40×46) y la sombra no cambiaron,
  // no se toca el lienzo visible y la GPU no tiene nada que volver a componer.
  let lastPx = null, lastShadow = '';
  let presented = 0, skipped = 0;
  function sameAsLast() {
    const px = new Uint32Array(o.getImageData(0, 0, GW, GH).data.buffer);
    const sh = `${R(shadowW)},${R(shadowDx)}`;
    let same = !!lastPx && sh === lastShadow;
    if (same) for (let i = 0; i < px.length; i++) if (px[i] !== lastPx[i]) { same = false; break; }
    lastPx = px; lastShadow = sh;
    return same;
  }
  function present() {
    if (sameAsLast()) { skipped++; return; }
    presented++;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, fctx.canvas.width, fctx.canvas.height);
    fctx.imageSmoothingEnabled = false;
    if (shadowW > 0) {
      fctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      fctx.fillRect(R(20 + shadowDx - shadowW / 2) * U, GROUND * U, R(shadowW) * U, U);
    }
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, GW, GH);
    s.drawImage(off, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = OUTLINE;
    s.fillRect(0, 0, GW, GH);
    s.globalCompositeOperation = 'source-over';
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) fctx.drawImage(sil, dx * U, dy * U, GW * U, GH * U);
    fctx.drawImage(off, 0, 0, GW * U, GH * U);
  }

  let dxState = 0;

  // 🎬 Capa de «muelle» para todas las animaciones y personajes (principios de animación):
  // aplastar al aterrizar y estirar al despegar, con un rebote amortiguado. En pixel art basta con 1-2 píxeles.
  const spring = { x: 0, v: 0, lastBob: 0 };
  function springStep(P, dt, changed) {
    const rising = P.bob < spring.lastBob - 0.5;                 // subiendo (bob negativo = arriba)
    if (spring.lastBob <= -3 && P.bob >= 0) spring.v -= 26;      // aterriza: aplastar
    else if (rising && spring.lastBob >= -1) spring.v += 14;      // despega: estirar
    if (changed) spring.v -= 9;                                    // cambio de acción: botecito
    spring.lastBob = P.bob;
    if (dt > 0) {                                                  // muelle amortiguado
      const k = 220, c = 15;
      spring.v += (-k * spring.x - c * spring.v) * dt;
      spring.x += spring.v * dt;
    }
    spring.x = clamp(spring.x, -2.5, 2.5);
    const s = R(spring.x);
    if (s) { P.sy += s; P.sx -= s; }
  }

  function draw(_ctx, t, action, opts = {}) {
    O = opts;
    const dt = Math.min(0.15, Math.max(0, t - lastT));   // a pocos fps las partículas no van a cámara lenta
    lastT = t;
    if (!A[action]) action = 'idle';
    if (action !== cur) {
      if (cur === 'sleeping' && action !== 'sleeping') wakeUntil = t + 1.1;
      prev = cur;
      changeAt = t;
      cur = action;
      curSince = t;
    }
    const waking = t < wakeUntil;
    const active = waking ? 'wake' : cur;
    const since = waking ? changeAt : Math.max(curSince, wakeUntil);
    const lt = t - since;

    const P = pose();
    A[active].pose && A[active].pose(P, t, lt);
    effects = effects.filter(e => t - e.start < EFFECTS[e.type].dur);
    for (const e of effects) EFFECTS[e.type].pose && EFFECTS[e.type].pose(P, t - e.start, active);

    // Sigue el cursor con la mirada cuando está tranquilo
    if (active === 'idle' || active === 'wake') lookAt(P, true);
    // Suena música: versión bailando de la animación actual
    if (opts.groove && !opts.dragging) applyGroove(P, active, t);
    // Y si es una de tus canciones especiales, la variante de esa canción
    if (opts.groove && opts.special && !opts.dragging) songFlavor(P, active, t, opts.special);
    // Batería baja: cansado (ojos entornados, pinzas caídas)
    if (opts.tired && !['waiting', 'celebrate', 'walk', 'hop'].includes(active)) {
      if (P.eyes === 'open') P.eyes = 'squint';
      if (['idle', 'sit', 'thinking', 'dance'].includes(active)) { P.armL = { ...P.armL, y: P.armL.y + 2 }; P.armR = { ...P.armR, y: P.armR.y + 2 }; }
    }
    // Lo estás arrastrando: patalea y se ríe
    if (opts.dragging) {
      const k = Math.floor(t * 9) % 2;
      P.eyes = 'wide';
      P.mouth = 'grin';
      P.blush = true;
      P.armL = { x: -1, y: -7 + k };
      P.armR = { x: 1, y: -6 - k };
      P.legs = k ? [0, 2, 0, 2] : [2, 0, 2, 0];
      P.bob = 0; P.sy = 0; P.sx = 0; P.tuck = false;
    }

    // manías y easter eggs del personaje
    if (SKIN && SKIN.pose && !opts.dragging) SKIN.pose(P, active, t, opts);
    // 🎬 muelle: estira al despegar, se aplasta al aterrizar y rebota un poco al cambiar de acción
    if (!opts.dragging) springStep(P, dt, t === changeAt);

    // desplazamiento lateral suave (por ejemplo, se corre a un lado para usar la laptop)
    const target = P.dx;
    dxState += Math.sign(target - dxState) * Math.min(Math.abs(target - dxState), dt * 30);
    P.dx = R(dxState);

    const g = geom(P);
    g.t = t;
    if (SKIN && SKIN.geom) SKIN.geom(g, P);   // cabeza y cuerpo propios del personaje
    const gk = { ...g, k: clamp(lt / INTRO), lt };
    const outK = 1 - (t - changeAt) / OUTRO;
    const pa = outK > 0 && prev && prev !== active && A[prev] ? A[prev] : null;
    const gp = { ...g, k: clamp(outK) };
    const act = A[active];

    o.clearRect(0, 0, GW, GH);
    const onCushion = opts.sitting && !opts.dragging && (active === 'sit' || active === 'sleeping');
    if (onCushion) cushion();
    if (pa && pa.back) pa.back(gp);
    if (act.back) act.back(gk);
    o.save();
    o.translate(P.dx, 0);
    if (SKIN && SKIN.back) SKIN.back(g, P, active, t);
    if (SKIN && SKIN.body) SKIN.body(P, g, t, active); else drawBody(P, g);
    if (SKIN && SKIN.top) SKIN.top(g, P, active, t, topBlocked(opts, active));
    drawWear(P, g, opts.wear, active);
    drawAntenna(P, g, opts.wear, opts.special, active);
    drawSpecialWear(P, g, opts.special, active);
    o.restore();
    if (pa && pa.front) pa.front(gp);
    if (act.front) act.front(gk);
    o.save();
    o.translate(P.dx, 0);
    const armFn = SKIN && SKIN.arm ? SKIN.arm : drawArm;
    armFn(-1, P.armL, P.openL, g);
    armFn(1, P.armR, P.openR, g, opts.special === 'chicago' || opts.special === 'billie');
    if (SKIN && SKIN.front) SKIN.front(g, P, active, t);
    o.restore();
    if (pa && pa.over) pa.over(gp);
    if (act.over) act.over(gk);
    for (const e of effects) EFFECTS[e.type].over && EFFECTS[e.type].over(g, t - e.start);
    grooveNotes(g, active);
    specialOver(g, opts.special, active);

    particles = particles.filter(p => (p.life -= dt) > 0 && p.y < GH);
    particles.forEach(p => {
      p.vy += 40 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      px(R(p.x), R(p.y), p.c);
    });

    const jump = Math.max(0, -P.bob);
    shadowW = opts.dragging ? 0 : onCushion ? 26 : P.tuck ? 22 : Math.max(10, 18 - jump * 1.3);
    shadowDx = P.dx;
    present();
  }

  // ¿Hay un píxel de Pal en este punto? (para dejar pasar los clics en lo transparente)
  function isOpaque(xCss, yCss, cssW, cssH) {
    const gx = Math.floor((xCss / cssW) * GW);
    const gy = Math.floor((yCss / cssH) * GH);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = gx + dx, y = gy + dy;
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        if (o.getImageData(x, y, 1, 1).data[3] > 0) return true;
      }
    }
    return false;
  }

  const frameStats = () => ({ presented, skipped });
  return {
    frameStats, setup, draw, trigger, isOpaque, setSkin, ACTIONS: Object.keys(A).filter(a => a !== 'wake'),
    // herramientas de dibujo para los personajes de skins.js
    api: { rect, px, line, circle, alpha, bitmap, C, R, clamp, drawEyes, drawMouth, spawn: p => { if (particles.length < 90) particles.push(p); } },
  };
})();
