// Personajes originales. Cada uno tiene su PROPIO cuerpo (silueta, cabeza, brazos y pies), pero recibe las mismas
// poses que Clawd (ojos, boca, brazos, saltos, estirarse/aplastarse), así que hace TODAS sus animaciones,
// bailes, canciones especiales y juegos. Además cada uno tiene manías propias, frases con su personalidad
// y easter eggs: 5 toques rápidos y horas secretas.
// Necesita clawd.js (ClawdSprite.api) cargado antes.
const Skins = (() => {
  const { rect, px, line, circle, alpha, C, R, spawn, drawEyes, drawMouth } = ClawdSprite.api;
  const now = () => performance.now() / 1000;
  const fx = { kind: null, start: -99, dur: 0 };
  const fxOn = (k, t) => fx.kind === k && t - fx.start >= 0 && t - fx.start < fx.dur;
  const fxQ = t => (t - fx.start) / fx.dur;
  const startFx = (kind, dur) => { fx.kind = kind; fx.start = now(); fx.dur = dur; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const calm = a => ['idle', 'sit', 'sleeping', 'dance', 'watch'].includes(a);
  const moving = P => P.legs.some(v => v);
  // elipse rellena
  function ell(cx, cy, rx, ry, c) {
    for (let dy = -ry; dy <= ry; dy++) {
      const h = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));
      rect(cx - h, cy + dy, 2 * h + 1, 1, c);
    }
  }
  // punto donde estaría la mano según la pose (el mismo que usa Clawd, para que los objetos de las animaciones encajen)
  const hand = (side, off, g) => ({ x: (side < 0 ? 6 : 30) + off.x, y: g.bottom - 8 + off.y });
  // dibuja una forma de "1" y "." (las filas se invierten para el lado derecho)
  function shape(rows, x, y, c, side) {
    rows.forEach((row, j) => [...(side > 0 ? [...row].reverse().join('') : row)].forEach((v, i) => { if (v === '1') px(x + i, y + j, c); }));
  }

  const SK = {
    // 🦀 Clawd naranja: el Clawd original (mismo cuerpo, colores clásicos y sin antena)
    naranja: {
      palette: { body: '#D97757', shade: '#B85C3E', light: '#EC9C80', dark: '#7A3A28', blush: '#F6A592' },
    },

    // ==================================================================
    // 🤖 Bolt: robot de cabeza cuadrada con pantalla, cuello, torso y orugas
    // ==================================================================
    bolt: {
      palette: { body: '#9AA7B8', shade: '#6E7A8C', light: '#D3DCE8', dark: '#3E4756', eye: '#7FE8FF', shine: '#FFFFFF', blush: '#FF8FB1' },
      geom(g, P) {
        const hw = 18 + P.sx;
        g.top = g.bottom - 20 - P.sy;
        g.x0 = 20 - Math.round(hw / 2); g.W = hw;
        g.ey = g.top + 3;
        g.neckTop = g.top + 1;
        g.mouthY = g.top + 6;
      },
      body(P, g, t) {
        const L = g.x0, W = g.W, T = g.top, tt = T + 11;
        // orugas (las ruedas giran cuando se mueve)
        rect(12, g.bottom, 16, 3, '#3E4756'); rect(13, g.bottom + 1, 14, 1, '#59637A');
        const k = moving(P) ? Math.floor(t * 8) % 2 : 0;
        for (let x = 14 + k; x < 27; x += 3) px(x, g.bottom + 1, '#A9B4C4');
        // torso
        rect(14, tt, 12, g.bottom - tt, C.body); rect(14, g.bottom - 1, 12, 1, C.shade); rect(15, tt + 1, 1, 3, C.light);
        rect(17, tt + 2, 6, 3, C.dark);
        const b = Math.floor(t * 3);
        px(18, tt + 3, b % 3 === 0 ? '#5BE37D' : '#2E8F48'); px(20, tt + 3, b % 3 === 1 ? '#F2C14E' : '#8E7A2E'); px(21, tt + 3, b % 3 === 2 ? '#E5484D' : '#7A2E30');
        // cuello
        rect(18, T + 10, 4, 1, C.dark);
        // cabeza con pantalla
        rect(L, T, W, 10, C.body); rect(L, T + 9, W, 1, C.shade); rect(L + 1, T + 1, 3, 1, C.light);
        rect(L - 1, T + 3, 1, 3, '#C9CED6'); rect(L + W, T + 3, 1, 3, '#C9CED6');
        rect(L + 2, T + 2, W - 4, 7, '#18212B');
        if (P.glow > 0) alpha(P.glow, () => rect(L + 2, T + 2, W - 4, 7, '#7FE8FF'));
        drawEyes(P, [14 + P.lookX, 24 + P.lookX], g.ey + P.lookY);
        if (P.mouth) drawMouth(P, 20, g.mouthY); else rect(18, T + 7, 4, 1, '#3A7E8A');
        if (P.blush) { rect(L + 3, T + 6, 2, 1, C.blush); rect(L + W - 5, T + 6, 2, 1, C.blush); }
      },
      arm(side, off, open, g) {                        // brazo articulado con pinza metálica
        const sx = side < 0 ? 13 : 26, sy = g.top + 13;
        const h = hand(side, off, g);
        const ex = R((sx + h.x + 1) / 2), ey = R((sy + h.y) / 2) + 1;
        line(sx, sy, ex, ey, C.shade); line(ex, ey, h.x + 1, h.y, C.shade);
        px(ex, ey, C.dark);
        shape(open ? ['1.1', '1.1', '111'] : ['111', '1.1', '111'], h.x, h.y, '#C9CED6', side);
      },
      pose(P, active, t) {
        if (fxOn('reboot', t)) {
          const q = fxQ(t);
          P.eyes = q < 0.7 ? 'closed' : 'wide';
          P.glow = q < 0.7 ? 0.25 + 0.25 * Math.sin(t * 20) : 0;
          P.armL = { x: 0, y: 3 }; P.armR = { x: 0, y: 3 };
          P.mouth = q < 0.7 ? 'flat' : 'grin';
        }
      },
      top(g, P, active, t, blocked) {
        if (blocked) return;                           // antena con luz que parpadea
        rect(20, g.top - 3, 1, 3, C.dark);
        const col = fxOn('reboot', t) ? '#F2C14E' : active === 'dance' ? ['#E5484D', '#F2C14E', '#5BE37D', '#4C8DE0'][Math.floor(t * 4) % 4] : (t % 1.6 < 0.8 ? '#E5484D' : '#5BE37D');
        rect(19, g.top - 5, 3, 2, col); px(19, g.top - 5, '#FFFFFF');
      },
      front(g, P, active, t) {
        if (fxOn('reboot', t) && Math.random() < 0.5) spawn({ x: rnd(12, 28), y: g.top + rnd(0, 6), vx: rnd(-25, 25), vy: rnd(-30, -10), c: Math.random() < 0.5 ? '#F2C14E' : '#FFFFFF', life: 0.5 });
      },
      phrases: {
        hello: ['Bip bop. Unidad Bolt en línea 🤖', 'Sistemas cargados. ¡Hola, humano!', 'Conexión establecida 📡'],
        done: ['Tarea procesada. Eficiencia: 100% ✅', 'Bip. Trabajo completado sin errores', 'Misión cumplida. Recargando baterías 🔋'],
        idle: ['01100010 01101111 01110010 01100101 01100100… (aburrido en binario)', 'Contando tornillos: 4. Todo en orden 🔩', 'Modo ahorro de energía activado…'],
        poke: ['¡Cosquillas en los circuitos!', 'Bip! Eso fue un toque no autorizado 😄', 'Sensor táctil activado'],
        drag: ['¡Alerta! Unidad en movimiento 🚨', 'Desplazamiento manual detectado'],
        sleep: ['Entrando en modo reposo… 💤', 'Desfragmentando sueños…'],
      },
      egg(ctx) { startFx('reboot', 2.6); ctx.sound('charge'); ctx.say('🤖 Reiniciando sistemas… 3, 2, 1… ¡Bip! Todo al 100%'); },
      timeEggs: [
        { h: 3, m: 14, run: ctx => ctx.say('🥧 ¡Son las 3:14! π = 3,14159265… podría seguir para siempre') },
        { h: 15, m: 14, run: ctx => ctx.say('🥧 15:14… casi π. Mis circuitos lo celebran') },
      ],
    },

    // ==================================================================
    // 🐱 Miso: gatito de cabeza grande y redonda, cuerpo pequeño, patitas y cola
    // ==================================================================
    miso: {
      palette: { body: '#9C9590', shade: '#76706B', light: '#D8D2CC', dark: '#4A4542', blush: '#F6A5B5' },
      geom(g, P) {
        const ry = 6 + Math.round(P.sy / 2);
        g.headCy = g.bottom - 9 - Math.max(0, P.sy);
        g.headRy = ry;
        g.top = g.headCy - ry;
        g.x0 = 11 - Math.round(P.sx / 2); g.W = 18 + P.sx;
        g.ey = g.headCy - 2;
        g.neckTop = g.headCy + ry - 10;
        g.mouthY = g.headCy + 2;
      },
      body(P, g, t) {
        const hc = g.headCy;
        // cuerpo y patitas
        ell(20, g.bottom - 2, 8, 4, C.body);
        ell(20, g.bottom - 1, 4, 2, C.light);
        [14, 17, 22, 25].forEach((x, i) => rect(x, g.bottom + 1, 2, P.tuck ? 1 : Math.max(1, 3 - P.legs[i]), C.shade));
        // cabeza
        ell(20, hc, 9 + Math.round(P.sx / 2), g.headRy, C.body);
        rect(10, hc + 1, 2, 2, C.body); rect(29, hc + 1, 2, 2, C.body);          // mofletes
        px(17, g.top + 1, C.shade); px(19, g.top + 1, C.shade); px(19, g.top + 2, C.shade); px(21, g.top + 1, C.shade);
        drawEyes(P, [14 + P.lookX, 24 + P.lookX], g.ey + P.lookY);
        rect(19, hc + 1, 2, 1, '#F28FB1');                                       // nariz
        if (P.mouth) drawMouth(P, 20, g.mouthY + 1);
        else { px(18, hc + 2, C.dark); px(19, hc + 3, C.dark); px(20, hc + 3, C.dark); px(21, hc + 2, C.dark); }   // boquita "ω"
        if (P.blush) { rect(12, hc + 2, 2, 1, C.blush); rect(26, hc + 2, 2, 1, C.blush); }
        // bigotes
        rect(7, hc + 1, 4, 1, C.dark); rect(7, hc + 3, 4, 1, C.dark); rect(29, hc + 1, 4, 1, C.dark); rect(29, hc + 3, 4, 1, C.dark);
      },
      arm(side, off, open, g) {                        // patitas con almohadillas
        const sx = side < 0 ? 14 : 25, sy = g.bottom - 4;
        const h = hand(side, off, g);
        line(sx, sy, h.x + 1, h.y + 1, C.body, 2);
        rect(h.x, h.y, 3, 2, C.body); rect(h.x, h.y + 2, 3, 1, C.light);
        if (open) { px(h.x, h.y + 2, '#F6A5B5'); px(h.x + 2, h.y + 2, '#F6A5B5'); }
      },
      pose(P, active, t) {
        if (fxOn('zoom', t)) {
          const k = Math.floor(t * 14) % 2;
          P.legs = k ? [0, 2, 0, 2] : [2, 0, 2, 0];
          P.bob = k ? -2 : 0;
          P.eyes = 'wide';
          P.dx = R(Math.sin(fxQ(t) * Math.PI * 4) * 4);
        }
        if (fxOn('purr', t)) { P.eyes = 'happy'; P.blush = true; P.mouth = null; }
      },
      back(g, P, active, t) {                          // cola que se balancea
        const sw = R(Math.sin(t * (active === 'dance' ? 6 : 2.5)) * 2);
        const b = g.bottom;
        line(26, b - 2, 30, b - 3, C.body, 2);
        line(30, b - 3, 32, b - 7, C.body, 2);
        line(32, b - 7, 31 + sw, b - 11, C.body, 2);
        rect(31 + sw, b - 12, 2, 2, C.dark);
      },
      top(g, P, active, t, blocked) {
        if (blocked) return;                           // orejas (la derecha se mueve a veces)
        const T = g.top + 1, tw = (t % 6) < 0.25 ? 1 : 0;
        rect(12, T, 5, 1, C.body); rect(12, T - 1, 4, 1, C.body); rect(12, T - 2, 3, 1, C.body); rect(12, T - 3, 2, 1, C.body);
        px(13, T - 1, '#F6A5B5'); px(13, T, '#F6A5B5');
        rect(23, T, 5, 1, C.body); rect(24, T - 1 + tw, 4, 1, C.body); rect(25, T - 2 + tw, 3, 1, C.body); rect(26, T - 3 + tw, 2, 1, C.body);
        px(26, T - 1 + tw, '#F6A5B5'); px(26, T, '#F6A5B5');
      },
      front(g, P, active, t) {
        if (fxOn('purr', t) && Math.random() < 0.06) spawn({ x: rnd(14, 26), y: g.top - 2, vx: rnd(-8, 8), vy: -22, c: '#F28FB1', life: 1 });
      },
      phrases: {
        hello: ['Miau 🐱 ¿Me traes atún?', '¡Miau! Ya estoy aquí, puedes acariciarme', 'Prrr… hola, humano 😺'],
        done: ['¡Listo! Lo tiré de la mesa… digo, lo terminé 😼', 'Tarea cazada 🐾', 'Miau: terminado. ¿Mi premio?'],
        idle: ['Me voy a sentar en tu teclado…', 'Hay un punto rojo en algún sitio, lo noto 🔴', 'Siesta número 14 del día 😸'],
        poke: ['Prrrr… otra vez 😽', '¡Miau! Detrás de las orejas, porfa', 'Ronroneo activado'],
        drag: ['¡Bájame, humano! 🙀', '¡Miaaau! Que tengo nueve vidas pero no tantas'],
        sleep: ['Ovillito mode 🐈💤', 'Buenas noches… prrr'],
      },
      egg(ctx) { startFx('purr', 3); ctx.trigger('love'); ctx.sound('pop'); ctx.say('😻 Prrrrrrrr… ¡me encantan los mimos!'); },
      timeEggs: [
        { h: 22, m: 0, run: ctx => { startFx('zoom', 2.5); ctx.say('🐈💨 ¡Hora de las locuras felinas! ¡Corre, corre!'); } },
        { h: 7, m: 0, run: ctx => ctx.say('😾 Son las 7. Tengo hambre. Desde hace 3 horas.') },
      ],
    },

    // ==================================================================
    // 👻 Nube: fantasma alto en forma de cúpula, sin patas, con bracitos y ojos grandes
    // ==================================================================
    nube: {
      palette: { body: '#EEF0F8', shade: '#C9CDE0', light: '#FFFFFF', dark: '#8E93AD', eye: '#2A2A40', shine: '#FFFFFF', blush: '#F6B3C8' },
      geom(g, P) {
        const hw = 18 + P.sx;
        g.domeCy = g.top + 3;
        g.top = g.domeCy - 8;
        g.x0 = 20 - Math.round(hw / 2); g.W = hw;
        g.ey = g.domeCy - 1;
        g.neckTop = g.domeCy - 1;
        g.mouthY = g.domeCy + 5;
      },
      body(P, g, t) {
        const L = g.x0, W = g.W, dc = g.domeCy, rx = Math.round(W / 2) - 1;
        // cúpula + cuerpo + bajo ondulado
        for (let dy = -8; dy <= 0; dy++) { const h = Math.round(rx * Math.sqrt(1 - (dy * dy) / 64)); rect(20 - h - 1, dc + dy, 2 * h + 2, 1, C.body); }
        rect(L, dc, W, g.bottom - dc, C.body);
        const ph = Math.floor(t * 6);
        for (let x = L; x < L + W; x++) rect(x, g.bottom, 1, ((x + ph) % 4) < 2 ? 3 : 1, C.body);
        rect(L + W - 2, dc, 2, g.bottom - dc, C.shade);
        rect(L + 3, dc - 5, 2, 2, C.light); px(L + 3, dc - 3, C.light);
        // ojazos
        const ey = g.ey + P.lookY;
        if (!P.eyes || P.eyes === 'open') for (const e of [14 + P.lookX, 24 + P.lookX]) { rect(e, ey - 1, 2, 5, C.eye); px(e, ey - 1, C.shine); px(e + 1, ey, C.shine); }
        else drawEyes(P, [14 + P.lookX, 24 + P.lookX], ey);
        if (P.mouth) drawMouth(P, 20, g.mouthY); else ell(20, g.mouthY + 1, 1, 1, C.eye);
        rect(11, g.ey + 4, 2, 1, C.blush); rect(27, g.ey + 4, 2, 1, C.blush);
      },
      arm(side, off, open, g) {                        // bracitos de sábana
        const sx = side < 0 ? g.x0 : g.x0 + g.W - 1, sy = g.bottom - 7;
        const h = hand(side, off, g);
        const nx = R(sx + (h.x + 1 - sx) * 0.6), ny = R(sy + (h.y + 1 - sy) * 0.6);
        line(sx, sy, nx, ny, C.body, 2);
        rect(nx - 1, ny, 3, 2, C.body); rect(nx, ny - 1, 2, 1, C.body);
        if (open) px(nx + (side < 0 ? -1 : 1), ny - 1, C.body);
      },
      pose(P, active, t) {
        if (!['sleeping', 'sit'].includes(active)) P.bob -= Math.sin(t * 2.4) > 0 ? 2 : 1;   // flota
        if (fxOn('boo', t)) { P.eyes = 'wide'; P.mouth = 'o'; P.armL = { x: -1, y: -8 }; P.armR = { x: 1, y: -8 }; }
      },
      top(g, P, active, t, blocked) {
        if (blocked) return;                           // rizo en la coronilla
        px(20, g.top - 1, C.body); px(21, g.top - 2, C.body); px(22, g.top - 2, C.shade);
      },
      phrases: {
        hello: ['Buuu… ¡hola! No te asustes 👻', '¡Aparecí! ¿Me echabas de menos?', 'Flotando hacia ti… 👻'],
        done: ['Terminado… ¡ni un fantasma lo haría más rápido!', 'Tarea desaparecida… porque está hecha ✨', '¡Bu! Ya está listo'],
        idle: ['Atravesando paredes por aburrimiento…', 'Uuuuh… uuuuh… (practico mis sustos)', '¿Has visto mi sábana? Ah, la llevo puesta'],
        poke: ['¡Me atraviesas! Jiji', '¡Bu! Je, te asusté', 'Hace cosquillas el ectoplasma'],
        drag: ['¡Wiii! Floto contigo', '¡Soy ligero como una pluma!'],
        sleep: ['Los fantasmas también duermen… 💤', 'Uuuh… zzz'],
      },
      egg(ctx) {
        startFx('boo', 3.4);
        ctx.fade(2800);
        ctx.sound('fall');
        setTimeout(() => { ctx.trigger('poke'); ctx.sound('pop'); ctx.say('👻 ¡BU! ¿Dónde estaba? ¡Era invisible!'); }, 2900);
      },
      timeEggs: [
        { h: 0, m: 0, run: ctx => { startFx('boo', 3); ctx.fade(2500); ctx.say('🌙 Medianoche… mi hora favorita 👻'); } },
        { h: 13, m: 13, run: ctx => ctx.say('👻 13:13… qué número tan misterioso') },
      ],
    },

    // ==================================================================
    // 🐸 Rin: rana ancha y achatada, ojos saltones arriba, boca enorme y ancas
    // ==================================================================
    rin: {
      palette: { body: '#6CC04A', shade: '#4E9636', light: '#A6E28A', dark: '#2E5E20', blush: '#F6A592' },
      geom(g, P) {
        g.ry = 6 + Math.round(P.sy / 2);
        g.rx = 12 + Math.round(P.sx / 2);
        g.bodyCy = g.bottom - 4;
        g.bulbY = g.bodyCy - g.ry - 1;
        g.top = g.bulbY - 3;
        g.x0 = 10; g.W = 20;
        g.ey = g.bulbY - 1;
        g.neckTop = g.bodyCy - 9;
        g.mouthY = g.bodyCy - 1;
      },
      body(P, g, t, active) {
        const bc = g.bodyCy;
        // ancas traseras
        ell(9, bc + 2, 3, 2, C.shade); ell(31, bc + 2, 3, 2, C.shade);
        rect(5, g.bottom + 3 - Math.min(2, P.legs[0]), 5, 1, C.shade); rect(30, g.bottom + 3 - Math.min(2, P.legs[3]), 5, 1, C.shade);
        // cuerpo y barriga
        ell(20, bc, g.rx, g.ry, C.body);
        ell(20, bc + 2, Math.max(3, g.rx - 5), Math.max(1, g.ry - 3), '#C8EFA8');
        rect(11, bc - 4, 3, 1, C.light);
        // ojos saltones con el blanco
        circle(14, g.bulbY, 3, C.body); circle(26, g.bulbY, 3, C.body);
        circle(14, g.bulbY, 2, '#F4FFF0'); circle(26, g.bulbY, 2, '#F4FFF0');
        drawEyes(P, [13 + P.lookX, 25 + P.lookX], g.ey + P.lookY);
        px(18, bc - 4, C.dark); px(21, bc - 4, C.dark);                           // nariz
        if (P.mouth) drawMouth(P, 20, g.mouthY - 1);
        else {
          rect(13, g.mouthY, 14, 1, C.dark); px(12, g.mouthY - 1, C.dark); px(27, g.mouthY - 1, C.dark);
          if (calm(active) && (t % 7) < 0.5) ell(20, g.mouthY + 3, 3, 2, '#E2F8D2');   // papada que se infla
        }
        if (P.blush) { rect(10, g.mouthY - 1, 2, 1, C.blush); rect(28, g.mouthY - 1, 2, 1, C.blush); }
      },
      arm(side, off, open, g) {                        // manitas con dedos
        const sx = side < 0 ? 12 : 27, sy = g.bodyCy + 1;
        const h = hand(side, off, g);
        line(sx, sy, h.x + 1, h.y + 1, C.body, 2);
        rect(h.x, h.y, 3, 2, C.body);
        const fy = h.y + 2;
        px(h.x - 1, fy, C.light); px(h.x + 1, fy, C.light); px(h.x + 3, fy, C.light);
        if (open) { px(h.x - 1, h.y - 1, C.light); px(h.x + 3, h.y - 1, C.light); }
      },
      pose(P, active, t) {
        if (fxOn('tongue', t)) {
          const q = fxQ(t);
          P.lookX = q < 0.55 ? 1 : 0; P.lookY = -1;
          P.mouth = q > 0.5 && q < 0.75 ? 'o' : q >= 0.75 ? 'smile' : null;
          if (q >= 0.75) { P.blush = true; P.eyes = 'happy'; }
        }
        if (fxOn('hop', t)) { const q = fxQ(t); P.bob = -R(Math.abs(Math.sin(q * Math.PI * 3)) * 5); P.legs = [2, 2, 2, 2]; }
      },
      front(g, P, active, t) {
        if (!fxOn('tongue', t)) return;
        const q = fxQ(t);
        const fx0 = 36 - q * 14, fy = g.top - 3 + Math.sin(t * 20) * 1.5;
        if (q < 0.65) {
          px(R(fx0), R(fy), '#1F1A17');
          px(R(fx0) - 1, R(fy) - 1, (Math.floor(t * 20) % 2) ? '#DDEEFF' : '#FFFFFF');
          px(R(fx0) + 1, R(fy) - 1, (Math.floor(t * 20) % 2) ? '#FFFFFF' : '#DDEEFF');
        }
        if (q > 0.5 && q < 0.7) line(21, g.mouthY, R(fx0), R(fy), '#F28FB1');
      },
      phrases: {
        hello: ['¡Croac! 🐸 Salto a la acción', '¡Croac, croac! Ya estoy aquí', 'Rin al teclado 🐸'],
        done: ['¡Tarea atrapada de un lengüetazo! 👅', '¡Croac! Terminado', 'Saltito de alegría: ¡hecho! 🐸'],
        idle: ['Esperando una mosca… o una tarea', 'Croac… croac… (canto bajito)', 'Esta hoja de nenúfar es muy cómoda'],
        poke: ['¡Croac!', '¡Qué resbaloso soy, eh!', 'Ribbit 🐸'],
        drag: ['¡Salto asistido! 🐸', '¡Wiii, un salto larguísimo!'],
        sleep: ['Croac… zzz… croac…', 'A dormir en mi nenúfar 💤'],
      },
      egg(ctx) { startFx('tongue', 1.8); setTimeout(() => { ctx.sound('pop'); ctx.say('👅 ¡Ñam! Mosca atrapada 🪰'); }, 1100); },
      timeEggs: [
        { h: 6, m: 0, run: ctx => { startFx('hop', 1.5); ctx.say('🐸 ¡CROAC! Buenos días, que sale el sol'); } },
        { h: 18, m: 0, run: ctx => ctx.say('🐸 Hora del concierto de ranas: croac, croac, croaaac 🎶') },
      ],
    },

    // ==================================================================
    // 🐉 Chispa: dragoncito con cabeza y hocico, barriga de escamas, alas, cola y patas con garras
    // ==================================================================
    chispa: {
      palette: { body: '#8E6BD8', shade: '#6A4BB0', light: '#B9A0F0', dark: '#3E2A70', blush: '#F6A5C0' },
      geom(g, P) {
        g.headCy = g.top + 1 - Math.max(0, P.sy);
        g.top = g.headCy - 6;
        g.x0 = 13; g.W = 14;
        g.ey = g.headCy - 2;
        g.neckTop = g.headCy - 2;
        g.mouthY = g.headCy + 4;
      },
      body(P, g, t) {
        const hc = g.headCy, b = g.bottom;
        // patas con garras
        const lf = Math.min(2, P.legs[0]), rf = Math.min(2, P.legs[3]);
        rect(13, b + 1 - lf, 4, 2, C.shade); px(13, b + 2 - lf, '#F2E2B8'); px(15, b + 2 - lf, '#F2E2B8');
        rect(23, b + 1 - rf, 4, 2, C.shade); px(24, b + 2 - rf, '#F2E2B8'); px(26, b + 2 - rf, '#F2E2B8');
        // cuerpo en forma de pera con barriga de escamas
        ell(20, b - 5, 9 + Math.round(P.sx / 2), 6 + Math.round(P.sy / 2), C.body);
        ell(20, b - 4, 5, 4, '#D9C8F5');
        for (let y = b - 7; y <= b - 2; y += 2) rect(17, y, 6, 1, '#C3ADEE');
        // cabeza con hocico
        ell(20, hc, 7, 6, C.body);
        rect(14, hc - 4, 2, 1, C.light);
        ell(20, hc + 3, 4, 2, C.light);
        px(18, hc + 2, C.dark); px(21, hc + 2, C.dark);
        drawEyes(P, [15 + P.lookX, 23 + P.lookX], g.ey + P.lookY);
        if (P.mouth) drawMouth(P, 20, g.mouthY);
        else { rect(18, g.mouthY + 1, 4, 1, C.dark); px(21, g.mouthY + 2, '#FFFFFF'); }    // sonrisa con colmillito
        if (P.blush) { rect(13, hc + 2, 2, 1, C.blush); rect(25, hc + 2, 2, 1, C.blush); }
      },
      arm(side, off, open, g) {                        // bracitos con tres garras
        const sx = side < 0 ? 13 : 26, sy = g.bottom - 8;
        const h = hand(side, off, g);
        line(sx, sy, h.x + 1, h.y + 1, C.body, 2);
        rect(h.x, h.y, 3, 2, C.body);
        const cy = open ? h.y - 1 : h.y + 2;
        px(h.x, cy, '#F2E2B8'); px(h.x + 1, cy, '#F2E2B8'); px(h.x + 2, cy, '#F2E2B8');
      },
      pose(P, active, t) {
        if (fxOn('fire', t)) { P.mouth = 'yawn'; P.eyes = 'squint'; P.lookX = -1; P.armL = { x: 1, y: -2 }; }
      },
      back(g, P, active, t) {
        const k = Math.sin(t * (active === 'dance' ? 9 : 4)) > 0 ? 1 : 0;   // alas que aletean
        const wy = g.headCy + 6;
        rect(8, wy - 1 - k, 5, 1, C.shade); rect(5, wy - k, 7, 2, C.shade); rect(6, wy + 2, 5, 1, C.shade); px(6, wy - k, C.light);
        rect(27, wy - 1 - k, 5, 1, C.shade); rect(28, wy - k, 7, 2, C.shade); rect(29, wy + 2, 5, 1, C.shade); px(33, wy - k, C.light);
        // cola con punta de flecha
        const sw = R(Math.sin(t * 2));
        line(13, g.bottom - 2, 8, g.bottom, C.body, 2);
        line(8, g.bottom, 5, g.bottom - 3 + sw, C.body, 2);
        rect(2, g.bottom - 5 + sw, 3, 2, C.dark); px(3, g.bottom - 6 + sw, C.dark);
      },
      top(g, P, active, t, blocked) {
        if (blocked) return;                           // cuernos y cresta
        rect(15, g.top, 1, 2, '#F2E2B8'); px(14, g.top - 1, '#F2E2B8');
        rect(24, g.top, 1, 2, '#F2E2B8'); px(25, g.top - 1, '#F2E2B8');
        px(19, g.top, C.shade); px(20, g.top - 1, C.shade); px(21, g.top, C.shade);
      },
      front(g, P, active, t) {
        const mx = 18, my = g.mouthY;
        if (fxOn('fire', t)) {
          for (let i = 0; i < 2; i++) spawn({ x: mx, y: my + rnd(-1, 1), vx: rnd(-75, -40), vy: rnd(-12, 6), c: ['#F2C14E', '#F28C28', '#E5484D', '#FFF1A8'][(Math.random() * 4) | 0], life: rnd(0.35, 0.6) });
        } else if (calm(active) && (t % 9) < 0.05) {    // humito por la nariz
          spawn({ x: 18, y: g.headCy + 1, vx: rnd(-6, 2), vy: -30, c: '#B8B2C8', life: 0.6 });
          spawn({ x: 21, y: g.headCy + 1, vx: rnd(-2, 6), vy: -30, c: '#B8B2C8', life: 0.6 });
        }
      },
      phrases: {
        hello: ['¡Rawr! Chispa ha llegado 🐉', '¡Hola! Vengo con las alas calentitas 🔥', 'Un dragón a tu servicio 🐉'],
        done: ['¡Tarea calcinada! 🔥', '¡Rawr! Terminado y bien tostado', 'Otro tesoro para mi colección 💎'],
        idle: ['Vigilando mi tesoro… tus archivos 💎', 'Practicando aleteos 🐉', '¿Alguien tiene malvaviscos? Yo pongo el fuego'],
        poke: ['¡Cuidado, que quemo! 🔥', '¡Rawr! (es un rawr cariñoso)', 'Mis escamas son delicadas, ¿eh?'],
        drag: ['¡Puedo volar solo! …bueno, casi', '¡Wiii, vuelo asistido! 🐉'],
        sleep: ['Durmiendo sobre mi montaña de oro… 💤', 'Zzz… (sale un humito)'],
      },
      egg(ctx) { startFx('fire', 1.6); ctx.sound('rocket'); ctx.say('🔥 ¡FUSHHHH! Perdón… se me escapó'); },
      timeEggs: [
        { h: 20, m: 0, run: ctx => { startFx('fire', 1.2); ctx.say('🍕 Hora de cenar: yo caliento la pizza con mi aliento 🔥'); } },
        { h: 12, m: 0, run: ctx => ctx.say('🐉 Mediodía: el sol calienta casi tanto como yo') },
      ],
    },
  };

  return {
    get: id => (SK[id] ? { id, ...SK[id] } : null),
    ids: Object.keys(SK),
    startFx,
  };
})();
window.Skins = Skins;
