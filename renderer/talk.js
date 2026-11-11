// 💬 Hablar con Clawd: por escrito o con el micrófono.
// Primero intenta entender la frase aquí mismo, sin internet (recordatorios, pomodoro, ropa, personaje, estado de Claude…).
// Si no la entiende y hay una clave de Anthropic puesta, se la pasa a Claude Haiku (brain.js en el proceso principal).
// Usa lo que definen app.js / boost.js / characters.js (Speech, ClawdSprite, Sound, Boost, Characters, state, media…).
const Talk = (() => {
  const $ = id => document.getElementById(id);
  const box = $('talk'), log = $('talkLog'), form = $('talkForm'), input = $('talkInput'), mic = $('talkMic'), brainEl = $('talkBrain');
  const MIN = 60000;
  let open = false, busy = false, listening = false;
  let pending = null;          // recordatorio a la espera de que digas cuándo
  let brain = { hasKey: false };

  // ---------- utilidades de texto ----------
  // minúsculas y sin tildes, con la MISMA longitud que el original (para poder recortar el texto original)
  const fold = s => [...s.toLowerCase()].map(c => (c === 'ñ' ? 'n' : c.normalize('NFD')[0])).join('');
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const dayWord = t => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? 'hoy' : 'mañana'; };
  const NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, noventa: 90 };
  const num = w => (/^\d+$/.test(w) ? Number(w) : NUM[w]);
  const NUMW = '\\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|veinticinco|treinta|cuarenta|cincuenta|noventa';

  // ---------- ¿cuándo? ("en 10 minutos", "en media hora", "a las 5 y media", "mañana a las 8") ----------
  function parseWhen(f) {
    const now = Date.now();
    let m = new RegExp(`\\b(?:en|dentro de)\\s+(${NUMW})\\s*(minutos?|mins?|m\\b|horas?|h\\b|segundos?)(?:\\s+y\\s+(media|cuarto|${NUMW})(?:\\s*minutos?)?)?`).exec(f);
    if (m) {
      const n = num(m[1]);
      if (n) {
        const unit = m[2];
        let mins = /^h/.test(unit) ? n * 60 : /^s/.test(unit) ? Math.max(1, Math.round(n / 60)) : n;
        if (m[3]) mins += m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : (num(m[3]) || 0);
        return { at: now + mins * MIN, start: m.index, end: m.index + m[0].length };
      }
    }
    m = /\b(?:en|dentro de)\s+(media hora|un cuarto de hora|un ratito|un rato|un momento|un minuto|una hora)\b/.exec(f);
    if (m) {
      const mins = { 'media hora': 30, 'un cuarto de hora': 15, 'un ratito': 10, 'un rato': 15, 'un momento': 5, 'un minuto': 1, 'una hora': 60 }[m[1]];
      return { at: now + mins * MIN, start: m.index, end: m.index + m[0].length };
    }
    m = new RegExp(`\\b(manana\\s+)?a\\s+las?\\s+(${NUMW})(?:\\s*(?::|\\.|h|y)\\s*(media|cuarto|\\d{1,2}))?(?:\\s*(de la manana|de la tarde|de la noche|del mediodia|am|pm|a\\.?\\s?m\\.?|p\\.?\\s?m\\.?))?`).exec(f);
    if (m) {
      let h = num(m[2]);
      if (h == null || h > 23) return null;
      let mi = !m[3] ? 0 : m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : Number(m[3]);
      if (mi > 59) return null;
      const mer = m[4] || '';
      if (/tarde|noche|pm|p\./.test(mer) && h < 12) h += 12;
      if (/manana|am|a\./.test(mer) && h === 12) h = 0;
      const d = new Date(); d.setSeconds(0, 0); d.setHours(h, mi);
      if (m[1]) d.setDate(d.getDate() + 1);
      else if (d.getTime() <= now) {
        if (!mer && h < 12 && new Date(d.getTime() + 12 * 3600000).getTime() > now) d.setHours(h + 12);   // "a las 5" a las 3 de la tarde = 17:00
        else d.setDate(d.getDate() + 1);
      }
      return { at: d.getTime(), start: m.index, end: m.index + m[0].length };
    }
    return null;
  }

  // Qué hay que recordar: la frase sin "recuérdame", sin el "cuándo" y sin conectores sueltos
  function reminderText(orig, f, when) {
    let o = orig, ff = f;
    if (when) { o = o.slice(0, when.start) + ' ' + o.slice(when.end); ff = ff.slice(0, when.start) + ' ' + ff.slice(when.end); }
    const trig = /\b(?:oye\s+|clawd\s*,?\s*)?(?:por favor\s+)?(?:recuerdame|recordame|recuerda(?:me)?|acuerdame|avisame|pon(?:me)?\s+un\s+recordatorio|crea\s+un\s+recordatorio|recordatorio|que me (?:recuerdes|avises))\b(?:\s+(?:para|de|que|a|sobre))*/;
    const t = trig.exec(ff);
    if (t) { o = o.slice(0, t.index) + ' ' + o.slice(t.index + t[0].length); ff = ff.slice(0, t.index) + ' ' + ff.slice(t.index + t[0].length); }
    o = o.replace(/\s+/g, ' ').replace(/^[\s,.;:¡!¿?-]+|[\s,.;:¡!¿?-]+$/g, '').replace(/^(que|de|a|para)\s+/i, '').replace(/\s+(por favor)$/i, '').trim();
    if (!o) return '';
    return o.charAt(0).toUpperCase() + o.slice(1);
  }

  // ---------- catálogo: cómo se llama cada cosa al hablar ----------
  const SKIN_WORDS = [['clawd', /\b(clawd|cangrejo)\b/], ['bolt', /\b(bolt|robot)\b/], ['miso', /\b(miso|gato|gatito|michi|minino)\b/], ['nube', /\b(nube|fantasma|fantasmita)\b/], ['rin', /\b(rin|rana|ranita|sapo)\b/], ['chispa', /\b(chispa|dragon|dragoncito)\b/]];
  const WEAR_WORDS = [   // las más largas primero ("corona de flores" antes que "corona")
    ['hat', 'flowers', /corona de flores|flores/], ['hat', 'nightcap', /gorrito de dormir|gorro de dormir|pijama|dormir/], ['hat', 'beanie', /gorro de lana|lana/],
    ['hat', 'party', /gorro de fiesta|fiesta|cumpleanos/], ['hat', 'tophat', /chistera|sombrero de copa/], ['hat', 'crown', /corona/],
    ['hat', 'cowboy', /vaquero|cowboy/], ['hat', 'chef', /chef|cocinero/], ['hat', 'viking', /vikingo|casco/], ['hat', 'santa', /navidad|navideno|santa|papa noel/],
    ['hat', 'witch', /bruja/], ['hat', 'lazo', /lazo|lacito|mono rosa/], ['hat', 'cap', /gorra/],
    ['glasses', 'sun', /gafas de sol|lentes de sol|gafas oscuras/], ['glasses', 'heart', /corazon/], ['glasses', 'monocle', /monoculo/], ['glasses', 'round', /gafas redondas|gafas|lentes|anteojos/],
    ['neck', 'scarf', /bufanda/], ['neck', 'bow', /pajarita|corbatin/], ['neck', 'bandana', /panuelo|bandana/], ['neck', 'necklace', /collar|perlas/],
  ];
  const itemOf = (slot, id) => (slot === 'hat' ? CATALOG.hats : CATALOG[slot]).find(x => x.id === id);
  const skinOf = id => CATALOG.skins.find(s => s.id === id) || CATALOG.skins[0];

  // ---------- frases ----------
  const JOKES = [
    '¿Por qué el programador confunde Halloween con Navidad? Porque OCT 31 = DEC 25 🎃🎄',
    'Le pregunté a mi código por qué no funcionaba… y me respondió con un silencio de 500 líneas 🫠',
    '¿Qué le dice un bit a otro? Nos vemos en el bus 🚌',
    'Hay 10 tipos de personas: las que entienden binario y las que no 🤓',
    'Mi relación con los bugs es como un pomodoro: 25 minutos peleando y 5 llorando 🍅',
    '¿Cuál es el colmo de un cangrejo programador? Que su código vaya hacia los lados 🦀',
  ];
  const who = () => skinOf(Characters.outfit().skin);

  // ---------- respuestas locales ----------
  function local(orig) {
    const f = fold(orig).replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!f) return null;

    // ¿Esperaba que dijeras cuándo?
    if (pending) {
      const w = parseWhen(f) || (/^\d+$/.test(f) ? { at: Date.now() + Number(f) * MIN } : null);
      if (w) { const p = pending; pending = null; return makeReminder(p.text, w.at); }
      if (/\b(no|nada|olvidalo|cancela|dejalo)\b/.test(f)) { pending = null; return { text: 'Vale, lo olvido 👍' }; }
      pending = null;
    }

    if (/\b(ayuda|que (puedes|sabes) hacer|que haces|comandos|instrucciones)\b/.test(f)) return { text: helpText() };

    // Recordatorios
    if (/\b(que|cuales|mis|tengo)\b.*\brecordatorios?\b|\brecordatorios pendientes\b/.test(f) && !/\b(recuerdame|avisame)\b/.test(f)) {
      if (/\b(borra|quita|cancela|elimina|limpia)\b/.test(f)) { const n = Boost.clearReminders(); return { text: n ? `Listo, borré ${n} recordatorio${n === 1 ? '' : 's'} 🧹` : 'No tenías ningún recordatorio 🙂' }; }
      const rs = Boost.info().reminders;
      return rs.length ? { text: `Tienes ${rs.length}:`, lines: rs.map(r => `⏰ ${hhmm(r.at)} ${dayWord(r.at) === 'hoy' ? '' : '(mañana) '}· ${r.text}`) } : { text: 'No tienes recordatorios pendientes 🙂' };
    }
    if (/\b(borra|quita|cancela|elimina)\b.*\brecordatorios?\b/.test(f)) { const n = Boost.clearReminders(); return { text: n ? `Listo, borré ${n} recordatorio${n === 1 ? '' : 's'} 🧹` : 'No tenías ningún recordatorio 🙂' }; }
    if (/\b(recuerdame|recordame|recuerda|acuerdame|avisame|recordatorio|que me (recuerdes|avises))\b/.test(f)) {
      const w = parseWhen(f);
      const text = reminderText(orig, fold(orig), w);
      if (!w) {
        pending = { text: text || 'Lo que me pediste' };
        return { text: `¿Cuándo te recuerdo${text ? ` «${text}»` : ''}?`, buttons: [['En 10 min', 'en 10 minutos'], ['En 30 min', 'en 30 minutos'], ['En 1 hora', 'en 1 hora']] };
      }
      return makeReminder(text || 'Lo que me pediste', w.at);
    }

    // Pomodoro
    if (/\b(pomodoro|modo enfoque|enfoque|concentrar(me|nos)?|concentracion|enfocar(me)?)\b/.test(f)) {
      if (/\b(para|parar|deten|detener|termina|terminar|quita|apaga|cancela|stop|basta|ya no)\b/.test(f)) {
        if (Boost.info().pomo === 'off') return { text: 'No había ningún pomodoro en marcha 🙂' };
        Boost.pomo('stop'); return { text: 'Pomodoro parado. ¡Buen trabajo! 👍' };
      }
      const i = Boost.info();
      if (i.pomo === 'focus') return { text: `Ya estamos concentrados: quedan ${Math.ceil(i.pomoLeft / MIN)} min 🍅` };
      Boost.pomo('start'); return { text: '🍅 ¡Vamos! 25 minutos de concentración. Yo vigilo.' };
    }

    // Personaje
    const skinHit = SKIN_WORDS.find(([, re]) => re.test(f));
    if (skinHit && /\b(conviertete|transformate|cambia(te)?|se un|se una|quiero|pon(te)?|modo|vuelve|vuelvete|disfrazate|personaje)\b/.test(f)) {
      const s = skinOf(skinHit[0]);
      if (Characters.outfit().skin === s.id) return { text: `¡Ya soy ${s.name}! ${s.emoji}` };
      window.clawd.setOutfit({ skin: s.id });
      return { text: `${s.emoji} ¡Tachán! Ahora soy ${s.name}.` };
    }

    // Quitarse cosas
    if (/\b(quitate|quita(le)?|sin|fuera|deshazte)\b/.test(f)) {
      if (/\b(todo|accesorios|ropa|disfraz)\b/.test(f)) { window.clawd.setOutfit({ hat: 'none', glasses: 'none', neck: 'none' }); return { text: 'Fuera todo. Al natural 😎' }; }
      if (/\b(sombrero|gorro|gorra|gorrito|casco|corona|chistera|lazo)\b/.test(f)) { window.clawd.setOutfit({ hat: 'none' }); return { text: 'Sombrero fuera 🎩➡️' }; }
      if (/\b(gafas|lentes|anteojos|monoculo)\b/.test(f)) { window.clawd.setOutfit({ glasses: 'none' }); return { text: 'Gafas guardadas 👓' }; }
      if (/\b(bufanda|pajarita|panuelo|collar|corbatin)\b/.test(f)) { window.clawd.setOutfit({ neck: 'none' }); return { text: 'Cuello libre ✨' }; }
    }
    // Ponerse cosas
    if (/\b(ponte|pon|usa|llevate|lleva|me gustaria verte con|quiero verte con)\b/.test(f)) {
      const hit = WEAR_WORDS.find(([, , re]) => re.test(f));
      if (hit) {
        const [slot, id] = hit, it = itemOf(slot, id);
        if (it.lvl && Boost.info().level < it.lvl) return { text: `🔒 ${it.name} se desbloquea en el nivel ${it.lvl}. ¡Sigue trabajando conmigo!` };
        window.clawd.setOutfit({ [slot]: id });
        return { text: `${it.emoji} ¡Me pongo ${it.name.toLowerCase()}! ¿Qué tal me queda?` };
      }
    }
    if (/\b(tienda|armario|vestuario)\b/.test(f)) { window.clawd.openShop(); return { text: '🛍️ ¡Abriendo la tienda!' }; }

    // Estado de Claude Code
    if (/\bclaude\b|\bsesion(es)?\b|\btareas?\b/.test(f) && /\b(como va|como van|que (hace|esta|estan)|estado|cuantas|progreso|terminado|termino|acabo)\b/.test(f)) return { text: claudeStatus(), lines: claudeLines() };

    // Nivel y logros
    if (/\b(nivel|experiencia|xp|logros|racha|puntos)\b/.test(f)) {
      const i = Boost.info();
      if (/\blogros\b/.test(f)) { Boost.showAchievements(); return { text: `Llevas ${i.ach} de ${i.achTotal} logros 🏅` }; }
      return { text: `⭐ Nivel ${i.level} (${i.xp}/${i.next} XP) · 🔥 racha de ${i.streak} día${i.streak === 1 ? '' : 's'} · ✅ ${i.tasks} tareas en total` };
    }

    // Música, hora, fecha
    if (/\bque (suena|cancion|musica|estoy escuchando|escucho)\b|\bque esta sonando\b/.test(f)) {
      const m = media();
      return m.playing && (m.song || m.title) ? { text: `🎵 Suena «${m.song || m.title}»${m.by ? ` de ${m.by}` : ''}` } : { text: 'Ahora mismo no suena nada 🔇' };
    }
    if (/\bque hora\b|\bhora es\b/.test(f)) return { text: `Son las ${hhmm(Date.now())} 🕒` };
    if (/\bque dia\b|\bque fecha\b|\bdia es hoy\b/.test(f)) return { text: `Hoy es ${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} 📅` };

    // Acciones
    const ACT = [[/\bbaila\b|\bbailar\b/, 'dance', '💃 ¡A bailar!'], [/\bsaluda\b|\bsaludame\b/, 'wave', '👋 ¡Holaaa!'], [/\bsalta\b/, 'hop', '🦘 ¡Hop, hop!'], [/\bestirate\b/, 'stretch', '🧘 Aaah, qué gusto'], [/\bcelebra\b|\bfiesta\b/, 'celebrate', '🎉 ¡Yuju!']];
    for (const [re, a, txt] of ACT) if (re.test(f)) { preview = a; previewUntil = Date.now() + 6000; return { text: txt }; }
    if (/\b(sientate|quedate quieto|quieto)\b/.test(f)) { setSitting(true); window.clawd.savePref({ sit: true }); return { text: '🪑 Vale, me quedo sentadito.' }; }
    if (/\b(levantate|muevete|ya puedes moverte)\b/.test(f)) { setSitting(false); window.clawd.savePref({ sit: false }); return { text: '¡Libre otra vez! 🎉' }; }
    if (/\b(escondete|ocultate|vete|desaparece)\b/.test(f)) { setTimeout(() => { hide(); window.clawd.hideByUser(); }, 900); return { text: '🙈 Me escondo. Vuelvo con Ctrl+Alt+C.' }; }

    // Charla sencilla
    if (/\b(chiste|algo gracioso|hazme reir)\b/.test(f)) return { text: pick(JOKES) };
    if (/\b(como te llamas|quien eres|tu nombre)\b/.test(f)) return { text: `Soy ${who().name} ${who().emoji}. ${who().desc}` };
    if (/\b(como estas|que tal estas|como te va)\b/.test(f)) return { text: pick(['¡Genial! Aquí, vigilando tus sesiones 😎', 'Muy bien, con ganas de trabajar contigo 💪', 'Feliz de que me hables 😊']) };
    if (/\b(te quiero|te amo|eres (lindo|bonito|genial|el mejor|adorable))\b/.test(f)) { ClawdSprite.trigger('love'); return { text: pick(['¡Ay! Yo también te quiero 💕', '¡Me sonrojo! 😊💕']) }; }
    if (/\b(gracias|muchas gracias|thank)\b/.test(f)) return { text: pick(['¡De nada! 😊', '¡Para eso estoy! 🦀', 'Un placer 💕']) };
    if (/^(hola|holi|hey|buenas|buenos dias|buenas tardes|buenas noches|que tal|ey)\b/.test(f)) return { text: pick(['¡Hola! ¿En qué te ayudo? 😊', '¡Hey! Aquí estoy 👋', '¡Buenas! ¿Qué necesitas?']) };
    if (/^(adios|chao|hasta luego|nos vemos|bye)\b/.test(f)) return { text: '¡Hasta luego! Sigo por aquí 👋' };
    return null;
  }

  function makeReminder(text, at) {
    if (!Boost.remindAt(at, text)) return { text: 'No pude guardarlo (¿tienes ya 20 recordatorios?) 😅' };
    ClawdSprite.trigger('check');
    const mins = Math.round((at - Date.now()) / MIN);
    const when = mins < 60 ? `en ${Math.max(1, mins)} min (a las ${hhmm(at)})` : `${dayWord(at)} a las ${hhmm(at)}`;
    return { text: `⏰ ¡Apuntado! Te recuerdo «${text}» ${when}.` };
  }

  const STATUS = { working: 'trabajando', thinking: 'pensando', waiting: 'esperando tu permiso', done: 'terminada', idle: 'en espera', limited: 'en el límite de uso' };
  function claudeStatus() {
    const ss = state.sessions || [];
    if (!ss.length) return 'No hay sesiones de Claude Code abiertas ahora mismo 😴';
    const waiting = ss.filter(s => s.status === 'waiting').length, active = ss.filter(s => ['working', 'thinking'].includes(s.status)).length;
    if (waiting) return `❗ Hay ${waiting} sesión${waiting === 1 ? '' : 'es'} esperando tu permiso.`;
    if (active) return `Claude está trabajando en ${active} sesión${active === 1 ? '' : 'es'} 💪`;
    return `Tienes ${ss.length} sesión${ss.length === 1 ? '' : 'es'}, ninguna trabajando ahora mismo.`;
  }
  function claudeLines() {
    return (state.sessions || []).slice(0, 4).map(s => {
      const t = s.tasks || [], d = t.filter(x => x.status === 'completed').length;
      return `• ${s.project || 'Sesión'}: ${STATUS[s.status] || s.status}${t.length ? ` (${d}/${t.length} tareas)` : ''}`;
    });
  }
  function helpText() {
    return 'Prueba a decirme: «recuérdame llamar a mamá en 10 minutos», «avísame a las 5 de la tarde», «empieza un pomodoro», «¿cómo va Claude?», «ponte la gorra», «conviértete en gato», «baila», «cuéntame un chiste».' +
      (brain.hasKey ? ' Y de lo demás también podemos charlar 🧠' : ' Con una clave de Anthropic (botón 🧠) también podemos charlar de cualquier cosa.');
  }

  // Contexto para Haiku (solo lo útil, sin rutas ni contenido de archivos)
  function context() {
    const i = Boost.info(), o = Characters.outfit(), m = media();
    const lines = [
      `Fecha y hora: ${new Date().toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`,
      `Personaje: ${skinOf(o.skin).name} (${skinOf(o.skin).desc}). Lleva: sombrero ${o.hat}, gafas ${o.glasses}, cuello ${o.neck}.`,
      `Sesiones de Claude Code: ${claudeStatus()} ${claudeLines().join(' ')}`,
      `Música: ${m.playing && (m.song || m.title) ? `${m.song || m.title}${m.by ? ' de ' + m.by : ''}` : 'nada'}`,
      `Nivel ${i.level}, racha ${i.streak} días, ${i.ach}/${i.achTotal} logros, pomodoro: ${i.pomo === 'off' ? 'parado' : i.pomo === 'focus' ? `concentrado (${Math.ceil(i.pomoLeft / MIN)} min)` : 'descanso'}.`,
      `Recordatorios: ${i.reminders.length ? i.reminders.map(r => `${hhmm(r.at)} ${r.text}`).join('; ') : 'ninguno'}`,
      `Sombreros desbloqueados por nivel: ${CATALOG.hats.filter(h => h.lvl && i.level >= h.lvl).map(h => h.id).join(', ') || 'ninguno exclusivo aún'}`,
    ];
    return lines.join('\n');
  }

  // ---------- conversación ----------
  function add(cls, text, extra = {}) {
    const d = document.createElement('div');
    d.className = `tmsg ${cls}`;
    d.textContent = text;
    if (extra.lines) for (const l of extra.lines) { const r = document.createElement('div'); r.className = 'tline'; r.textContent = l; d.appendChild(r); }
    if (extra.buttons) {
      const row = document.createElement('div'); row.className = 'trow';
      for (const [label, say] of extra.buttons) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn'; b.textContent = label;
        b.addEventListener('click', e => { e.stopPropagation(); row.remove(); send(say); });
        row.appendChild(b);
      }
      d.appendChild(row);
    }
    if (extra.key) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tbtn'; b.textContent = '🧠 Poner clave';
      b.addEventListener('click', e => { e.stopPropagation(); window.clawd.openBrain(); });
      d.appendChild(document.createElement('br')); d.appendChild(b);
    }
    log.appendChild(d);
    while (log.children.length > 60) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    return d;
  }

  async function send(text) {
    text = String(text || '').trim().slice(0, 300);
    if (!text || busy) return;
    add('me', text);
    const r = local(text);
    if (r) {
      add('bot', r.text, r);
      if (window.Sound) Sound.play('pop');
      return;
    }
    if (!brain.hasKey) {
      add('bot', 'Uy, eso no lo entiendo todavía 😅 ' + helpText(), {});
      return;
    }
    busy = true;
    const thinking = add('bot typing', '');
    try {
      const res = await window.clawd.talkAsk(text, context());
      thinking.remove();
      if (res && res.ok) {
        for (const a of res.actions || []) runAction(a);
        add('bot', res.text || '🦀');
        if (window.Sound) Sound.play('pop');
      } else add('bot err', (res && res.error) || 'Algo falló 😵', { key: !!(res && res.needKey) });
    } catch {
      thinking.remove();
      add('bot err', 'Algo falló al pensar la respuesta 😵');
    } finally {
      busy = false;
      refreshBrain();
    }
  }
  function runAction(a) {
    if (!a || typeof a !== 'object') return;
    if (a.type === 'reminder') Boost.remindAt(Date.now() + a.minutes * MIN, a.text);
    else if (a.type === 'pomodoro') Boost.pomo(a.action);
    else if (a.type === 'outfit' && a.patch) window.clawd.setOutfit(a.patch);
  }

  // ---------- micrófono ----------
  const MIC_ERR = {
    noSpanish: 'Tu Windows no tiene el reconocimiento de voz en español 🎤 Instálalo en Configuración → Hora e idioma → Voz, o escríbeme.',
    noMic: 'No encuentro el micrófono, o Windows no deja usarlo (Configuración → Privacidad → Micrófono) 🎤',
    silence: 'No te oí 👂 Pulsa 🎤 y habla cuando se ponga rojo.',
    busy: 'Ya estoy escuchando 👂',
    fail: 'No pude usar el micrófono 😵 Escríbeme mientras tanto.',
  };
  async function listen() {
    if (listening || busy) return;
    listening = true;
    mic.classList.add('on'); mic.textContent = '🔴';
    input.placeholder = 'Te escucho… habla ahora';
    try {
      const r = await window.clawd.listen();
      if (r && r.ok && r.text) send(r.text);
      else add('bot err', MIC_ERR[(r && r.error) || 'fail'] || MIC_ERR.fail);
    } catch { add('bot err', MIC_ERR.fail); }
    listening = false;
    mic.classList.remove('on'); mic.textContent = '🎤';
    input.placeholder = 'Escribe o pulsa 🎤…';
    if (open) input.focus();
  }

  // ---------- abrir / cerrar ----------
  async function refreshBrain() {
    try { brain = await window.clawd.talkStatus(); } catch { brain = { hasKey: false }; }
    brainEl.textContent = brain.hasKey ? `🧠 Haiku · ${brain.usd.toFixed(3)} $` : '';
    brainEl.title = brain.hasKey ? `Gasto de este mes: ${brain.usd.toFixed(3)} $ de ${brain.limit.toFixed(2)} $` : '';
  }
  function show() {
    $('talkTitle').textContent = `💬 Habla con ${who().name}`;
    if (!open) {
      open = true;
      box.classList.remove('hidden');
      document.body.classList.add('talk-open');
      pinned = false; updatePanel();
      if (!log.children.length) add('bot', `¡Hola! Soy ${who().name} ${who().emoji}. Pídeme un recordatorio, un pomodoro, que me cambie de ropa… o escribe «ayuda».`);
      refreshBrain();
    }
    window.clawd.inputFocus(true);
    setTimeout(() => input.focus(), 60);
  }
  function hide() {
    if (!open) return;
    open = false;
    box.classList.add('hidden');
    document.body.classList.remove('talk-open');
    input.blur();
    window.clawd.inputFocus(false);
  }

  form.addEventListener('submit', e => { e.preventDefault(); const t = input.value; input.value = ''; send(t); });
  input.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  mic.addEventListener('click', e => { e.stopPropagation(); listen(); });
  $('talkClose').addEventListener('click', e => { e.stopPropagation(); hide(); });
  $('talkKey').addEventListener('click', e => { e.stopPropagation(); window.clawd.openBrain(); });
  $('talkbtn').addEventListener('click', e => { e.stopPropagation(); show(); });
  window.clawd.onCommand(c => {
    if (c === 'talk-open') show();
    else if (c === 'brain-changed') refreshBrain();
    else if (c && typeof c.preview === 'string' && c.preview.startsWith('t:')) { show(); send(decodeURIComponent(c.preview.slice(2)).replace(/-/g, ' ')); }
  });
  refreshBrain();

  return { show, hide, isOpen: () => open, send, local, parseWhen };
})();
window.Talk = Talk;
