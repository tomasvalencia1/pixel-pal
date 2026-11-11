// Más funciones para Pal, inspiradas en otras mascotas de escritorio:
//   🍅 Pomodoro / modo enfoque (PomodoroPet, Mac Pet)
//   🧘 Recordatorios de descanso, agua y vista (PawPause, Mewtoo)
//   ⭐ Niveles, rachas, logros y sombreros exclusivos por nivel (Tamamon, Pomopet, Bongo Cat)
//   ⏰ Recordatorios rápidos ("avísame en 10 min")
// Usa lo que definen app.js y extras.js (Speech, ClawdSprite, Sound, celebrateUntil, pinned, updatePanel…).
const Boost = (() => {
  const MIN = 60000;
  const today = () => new Date().toLocaleDateString('sv');
  const yesterday = () => new Date(Date.now() - 86400000).toLocaleDateString('sv');
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const $ = id => document.getElementById(id);
  const notify = (title, body) => { try { window.clawd.notify(title, body); } catch { /* nada */ } };

  // ======================================================================
  // 💾 Progreso guardado (progress.json en la carpeta de datos de Pal)
  // ======================================================================
  const DEFAULTS = {
    xp: 0, totals: {}, streak: { last: null, count: 0, best: 0 }, todayPomos: { date: null, n: 0 }, ach: [], reminders: [],
    notes: [], day: { date: null, xp: 0 }, prevDay: null, mood: { v: 70, at: 0 }, agenda: { morning: null, evening: null },
  };
  let data = JSON.parse(JSON.stringify(DEFAULTS));
  let loaded = false;
  const early = [];            // puntos ganados antes de terminar de cargar
  let saveTimer = null;
  function save() {
    if (!loaded) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { window.clawd.progressSave(data); } catch { /* nada */ } }, 800);
  }

  // Avisos en cola, para no pisar la burbuja de "tarea terminada"
  const announces = [];
  const announce = fn => announces.push(fn);

  // ======================================================================
  // ⭐ Niveles, rachas y logros
  // ======================================================================
  const XP = { task: 10, turn: 5, pomo: 25, commit: 15, push: 20, testPass: 5, break: 2 };
  const levelOf = xp => Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2));
  const xpAt = lvl => 50 * lvl * (lvl - 1);            // XP total para llegar a ese nivel
  const tot = k => data.totals[k] || 0;
  const streakNow = () => (data.streak.last === today() || data.streak.last === yesterday() ? data.streak.count : 0);

  // Sombreros exclusivos por nivel (catalog.js); se eligen en la tienda
  const LEVEL_HATS = CATALOG.hats.filter(h => h.lvl);

  const ACH = [
    { id: 'task1', icon: '✅', name: 'Primera tarea', test: () => tot('task') >= 1 },
    { id: 'task50', icon: '🏗️', name: '50 tareas', test: () => tot('task') >= 50 },
    { id: 'task500', icon: '🏆', name: '500 tareas', test: () => tot('task') >= 500 },
    { id: 'pomo1', icon: '🍅', name: 'Primer pomodoro', test: () => tot('pomo') >= 1 },
    { id: 'pomo4', icon: '🍅', name: '4 pomodoros en un día', test: () => data.todayPomos.date === today() && data.todayPomos.n >= 4 },
    { id: 'pomo50', icon: '🧠', name: '50 pomodoros', test: () => tot('pomo') >= 50 },
    { id: 'streak3', icon: '🔥', name: 'Racha de 3 días', test: () => streakNow() >= 3 },
    { id: 'streak7', icon: '🔥', name: 'Racha de 7 días', test: () => streakNow() >= 7 },
    { id: 'streak30', icon: '🌟', name: 'Racha de 30 días', test: () => streakNow() >= 30 },
    { id: 'commit1', icon: '📦', name: 'Primer commit', test: () => tot('commit') >= 1 },
    { id: 'push1', icon: '🚀', name: 'Primer push', test: () => tot('push') >= 1 },
    { id: 'break10', icon: '🧘', name: '10 descansos', test: () => tot('break') >= 10 },
    { id: 'owl', icon: '🦉', name: 'Búho nocturno', test: (k, h) => k === 'task' && h < 5 },
    { id: 'early', icon: '🐓', name: 'Madrugador', test: (k, h) => k === 'task' && h >= 5 && h < 7 },
    { id: 'lvl5', icon: '⭐', name: 'Nivel 5', test: () => levelOf(data.xp) >= 5 },
    { id: 'lvl10', icon: '👑', name: 'Nivel 10', test: () => levelOf(data.xp) >= 10 },
  ];

  function touchStreak() {
    const d = today();
    if (data.streak.last === d) return;
    data.streak.count = data.streak.last === yesterday() ? data.streak.count + 1 : 1;
    data.streak.last = d;
    data.streak.best = Math.max(data.streak.best || 0, data.streak.count);
    if (data.streak.count >= 2) {
      const n = data.streak.count;
      announce(() => Speech.say(`🔥 ¡${n} días seguidos trabajando juntos!`, 2, { dur: 3500 }));
    }
  }

  function checkAch(kind) {
    const h = new Date().getHours();
    for (const a of ACH) {
      if (data.ach.includes(a.id) || !a.test(kind, h)) continue;
      data.ach.push(a.id);
      announce(() => {
        ClawdSprite.trigger('love');
        if (window.Sound) Sound.play('ding');
        Speech.say(`🏅 ¡Logro desbloqueado! ${a.icon} ${a.name}`, 2, { dur: 4500 });
      });
    }
  }

  // ---------- 📅 lo de hoy (para la agenda y el resumen de la tarde) ----------
  function dayStats() {
    if (!data.day || data.day.date !== today()) {
      if (data.day && data.day.date) data.prevDay = data.day;
      data.day = { date: today(), xp: 0 };
    }
    return data.day;
  }

  // ---------- 💛 ánimo: sube cuando le haces caso, trabajas y descansas; baja si lo ignoras mucho rato ----------
  const MOOD_UP = { task: 2, turn: 1, pomo: 8, break: 6, commit: 3, push: 3, testPass: 1 };
  const moodV = () => Math.round(Math.max(0, Math.min(100, Number(data.mood.v) || 0)));
  const moodFace = () => { const v = moodV(); return v >= 80 ? '😄' : v >= 55 ? '🙂' : v >= 30 ? '😐' : '🥺'; };
  function cheer(n) {
    if (!loaded || !n) return;
    data.mood.v = Math.max(0, Math.min(100, (Number(data.mood.v) || 0) + n));
    if (n > 0) data.mood.at = Date.now();
    save();
    renderBox();
  }

  function award(kind, n = 1) {
    if (!XP[kind] || n < 1) return;
    if (!loaded) { early.push([kind, n]); return; }
    const before = levelOf(data.xp);
    data.xp += XP[kind] * n;
    data.totals[kind] = tot(kind) + n;
    const day = dayStats();
    day[kind] = (day[kind] || 0) + n;
    day.xp += XP[kind] * n;
    if (MOOD_UP[kind]) cheer(MOOD_UP[kind] * n);
    if (kind === 'pomo') {
      if (data.todayPomos.date !== today()) data.todayPomos = { date: today(), n: 0 };
      data.todayPomos.n += n;
    }
    touchStreak();
    checkAch(kind);
    const after = levelOf(data.xp);
    if (after > before) levelUp(after);
    save();
    renderBox();
  }

  function levelUp(lvl) {
    const hat = LEVEL_HATS.find(x => x.lvl === lvl);
    announce(() => {
      celebrateUntil = Date.now() + 3500;
      if (window.Sound) Sound.play('done');
      const opts = { dur: hat ? 15000 : 5000, lines: hat ? [`🎩 Nuevo sombrero en la tienda: ${hat.name}`] : undefined };
      if (hat) {
        opts.buttons = [{ label: 'Ponérmelo', value: 'yes', primary: true }, { label: 'Luego', value: 'no' }];
        opts.onAnswer = v => { if (v === 'yes') window.clawd.setOutfit({ hat: hat.id }); };
      }
      Speech.say(`⭐ ¡Subí al nivel ${lvl}!`, 3, opts);
    });
  }

  function renderBox() {
    const box = $('boost');
    if (!box) return;
    const lvl = levelOf(data.xp);
    const from = xpAt(lvl), to = xpAt(lvl + 1);
    const pct = Math.round(((data.xp - from) / (to - from)) * 100);
    const pomos = data.todayPomos.date === today() ? data.todayPomos.n : 0;
    box.innerHTML = '';
    const row = document.createElement('div'); row.className = 'lv';
    const b = document.createElement('b'); b.textContent = `⭐ Nivel ${lvl}`;
    const bar = document.createElement('span'); bar.className = 'xpbar';
    const fill = document.createElement('i'); fill.style.width = `${pct}%`; bar.appendChild(fill);
    const xp = document.createElement('span'); xp.className = 'xp'; xp.textContent = `${data.xp - from}/${to - from} XP`;
    row.append(b, bar, xp);
    const stats = document.createElement('div'); stats.className = 'bstats';
    stats.textContent = `${moodFace()} ${moodV()}% · 🔥 ${streakNow()} ${streakNow() === 1 ? 'día' : 'días'} · 🍅 ${pomos} hoy · 🏅 ${data.ach.length}/${ACH.length}`;
    stats.title = `Ánimo de Pal: ${moodV()}% (sube si le haces caso, trabajas y descansas)`;
    box.append(row, stats);
  }

  function showAchievements() {
    const got = ACH.filter(a => data.ach.includes(a.id)).map(a => `${a.icon} ${a.name}`);
    const next = ACH.filter(a => !data.ach.includes(a.id)).slice(0, 3).map(a => `🔒 ${a.name}`);
    const lines = [...(got.length ? got : ['Aún ninguno: ¡a por el primero!']), ...next];
    lines.push(`🔥 Mejor racha: ${data.streak.best || 0} días · ✅ ${tot('task')} tareas`);
    Speech.say(`🏅 Tus logros (${got.length}/${ACH.length})`, 3, { dur: 15000, lines, buttons: [{ label: 'Cerrar', value: 'x' }] });
  }

  // ======================================================================
  // 🍅 Pomodoro
  // ======================================================================
  // Duraciones (se cambian en el clic derecho → Tiempos, o diciéndoselo: «pomodoros de 50 minutos»)
  let FOCUS = 25 * MIN, SHORT = 5 * MIN, LONG = 15 * MIN;
  const pomo = { mode: 'off', until: 0, cycle: 0 };

  function startFocus(ms = FOCUS) {
    pomo.mode = 'focus';
    pomo.until = Date.now() + ms;
    if (window.Sound) Sound.play('pop');
    const m = Math.round(ms / MIN);
    Speech.say(pick([`🍅 ¡A concentrarse! ${m} minutos, yo vigilo`, '🍅 Modo enfoque activado. Te aviso al terminar', `🍅 ${m} minutos de concentración. ¡Tú puedes!`]), 2, { dur: 3500 });
    renderPomo();
  }
  function startBreak(long) {
    pomo.mode = 'break';
    pomo.until = Date.now() + (long ? LONG : SHORT);
    renderPomo();
  }
  function stopPomo(speak = true) {
    pomo.mode = 'off';
    pomo.cycle = 0;
    if (speak) Speech.say('Modo enfoque apagado 👍', 2, { dur: 2500 });
    renderPomo();
  }
  function focusEnd() {
    award('pomo');
    pomo.cycle += 1;
    const long = pomo.cycle % 4 === 0;
    startBreak(long);
    ClawdSprite.trigger('check');
    if (window.Sound) Sound.play('done');
    const mins = Math.round((long ? LONG : SHORT) / MIN);
    notify('🍅 Pomodoro terminado', `¡Bien hecho! Descansa ${mins} minutos.`);
    Speech.say(`🍅 ¡Pomodoro completado! Descansa ${mins} min ☕`, 3, {
      dur: 15000,
      buttons: [{ label: 'Vale ☕', value: 'ok', primary: true }, { label: 'Seguir trabajando', value: 'more' }, { label: 'Parar', value: 'stop' }],
      onAnswer: v => { if (v === 'more') startFocus(); else if (v === 'stop') stopPomo(); },
    });
  }
  function breakEnd() {
    pomo.mode = 'off';
    renderPomo();
    ClawdSprite.trigger('hello');
    if (window.Sound) Sound.play('hello');
    notify('☕ Fin del descanso', '¿Empezamos otro pomodoro?');
    Speech.say('☕ Se acabó el descanso. ¿Otro pomodoro?', 3, {
      dur: 20000,
      buttons: [{ label: 'Sí 🍅', value: 'yes', primary: true }, { label: 'No', value: 'no' }],
      onAnswer: v => { if (v === 'yes') startFocus(); else pomo.cycle = 0; },
    });
  }
  function renderPomo() {
    const btn = $('pomobtn');
    if (!btn) return;
    const left = pomo.until - Date.now();
    btn.classList.toggle('on', pomo.mode !== 'off');
    Panel.tile(btn, pomo.mode === 'break' ? '☕' : '🍅', pomo.mode === 'off' ? 'Enfoque' : clock(left));
  }

  // ======================================================================
  // 🧘 Descansos, agua y vista
  // ======================================================================
  let CARE_EVERY = 45 * MIN;
  const CARE = [
    { key: 'water', text: ['💧 ¿Un vaso de agua? Llevas un buen rato', '💧 Hora de hidratarse. ¡Yo ya bebí!'], thanks: '💧 ¡Bien hidratado!' },
    { key: 'stretch', text: ['🧘 Llevas mucho sentado: ¿te estiras un momento?', '🧘 Levántate, estira la espalda y vuelve'], thanks: '🧘 ¡Qué bien sienta estirarse!' },
    { key: 'eyes', text: ['👀 Descansa la vista: mira algo lejano 20 segundos', '👀 Tus ojos piden un respiro: mira por la ventana un ratito'], thanks: '👀 ¡Ojos descansados!' },
  ];
  const care = { on: true, activeSince: null, snooze: 0, idx: 0, full: false };

  function onIdle(s) {
    const now = Date.now();
    if (s >= 300) care.activeSince = null;                  // 5 min sin tocar nada = ya descansaste
    else if (care.activeSince === null) care.activeSince = now - s * 1000;
  }
  function careTick(now) {
    if (!care.on || pomo.mode !== 'off' || care.activeSince === null || care.full) return;
    if (now - care.activeSince < CARE_EVERY || now < care.snooze || Speech.asking()) return;
    const c = CARE[care.idx % CARE.length];
    const ok = Speech.say(pick(c.text), 2, {
      dur: 20000,
      buttons: [{ label: 'Hecho ✓', value: 'done', primary: true }, { label: 'En 10 min', value: 'later' }],
      onAnswer: v => {
        if (v === 'done') {
          care.activeSince = Date.now();
          care.idx += 1;
          award('break');
          ClawdSprite.trigger('love');
          setTimeout(() => Speech.say(c.thanks, 2, { dur: 2200 }), 250);
        } else {
          care.snooze = Date.now() + (v === 'later' ? 10 : 15) * MIN;
          cheer(v === 'later' ? -1 : -4);              // ignorarlo le pone un poco triste
        }
      },
    });
    if (ok) { care.snooze = now + 30000; ClawdSprite.trigger('hello'); if (window.Sound) Sound.play('hello'); }
  }

  // ======================================================================
  // ⏰ Recordatorios rápidos
  // ======================================================================
  let pinnedByMe = false;
  let inputOn = false;
  function setInput(on) {
    if (on === inputOn) return;
    inputOn = on;
    try { window.clawd.inputFocus(on); } catch { /* nada */ }
  }
  function addReminder(minutes) {
    const input = $('remtext');
    const text = (input.value || '').trim().slice(0, 80) || 'Lo que me pediste';
    if (data.reminders.length >= 20) { Speech.say('Ya tengo 20 recordatorios pendientes 😅', 3, { dur: 3000, buttons: [{ label: 'Vale', value: 'x' }] }); return; }
    data.reminders.push({ id: `r${Date.now()}`, at: Date.now() + minutes * MIN, text });
    save();
    input.value = '';
    input.blur();
    closeForm();
    if (window.Sound) Sound.play('pop');
    ClawdSprite.trigger('check');
    Speech.say(`⏰ ¡Hecho! Te aviso a las ${hhmm(Date.now() + minutes * MIN)}`, 3, { dur: 3500, buttons: [{ label: 'Gracias', value: 'x' }] });
    renderReminders();
  }
  function renderReminders() {
    const list = $('remlist');
    if (!list) return;
    list.innerHTML = '';
    for (const r of [...data.reminders].sort((a, b) => a.at - b.at)) {
      const row = document.createElement('div'); row.className = 'rem-item';
      const when = document.createElement('b'); when.textContent = (r.repeat ? '🔁 ' : '') + hhmm(r.at);
      if (r.repeat) row.title = repeatText(r.repeat);
      const txt = document.createElement('span'); txt.textContent = r.text;
      const del = document.createElement('button'); del.type = 'button'; del.title = 'Quitar'; del.textContent = '✕';
      del.addEventListener('click', e => { e.stopPropagation(); data.reminders = data.reminders.filter(x => x.id !== r.id); save(); renderReminders(); });
      row.append(when, txt, del);
      list.appendChild(row);
    }
    const btn = $('rembtn');
    if (btn) Panel.tile(btn, '⏰', data.reminders.length ? `Recordar · ${data.reminders.length}` : 'Recordar');
  }
  function remindTick(now) {
    const due = data.reminders.filter(r => r.at <= now).sort((a, b) => a.at - b.at)[0];
    if (!due) return;
    if (!due.notified) { due.notified = true; notify('⏰ Recordatorio de Pal', due.text); save(); }
    const late = now - due.at > 2 * MIN ? [`(era para las ${hhmm(due.at)})`] : undefined;
    const ok = Speech.say(`⏰ ${due.text}`, 3, {
      alert: true, dur: 30000, lines: late,
      buttons: [{ label: 'Hecho ✓', value: 'ok', primary: true }, { label: '+10 min', value: 'snooze' }],
      onAnswer: v => {
        if (v === 'snooze') { data.reminders.push({ id: `r${Date.now()}`, at: Date.now() + 10 * MIN, text: due.text }); save(); renderReminders(); }
      },
    });
    if (!ok) return;                                   // hay otra pregunta abierta: se reintenta luego
    data.reminders = data.reminders.filter(r => r.id !== due.id);
    if (due.repeat) {                                  // 🔁 los que se repiten se programan para la próxima vez
      const next = nextAt(due.repeat, now);
      if (next) data.reminders.push({ id: `r${Date.now()}`, at: next, text: due.text, repeat: due.repeat });
    }
    save();
    renderReminders();
    ClawdSprite.trigger('hello');
    if (window.Sound) Sound.play('alert');
  }
  // 🔁 Repetición: { type: 'daily' | 'weekdays' | 'weekly', h, m, dow (0 = domingo) }
  const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  function validRepeat(rep) {
    return !!rep && ['daily', 'weekdays', 'weekly'].includes(rep.type) && rep.h >= 0 && rep.h <= 23 && rep.m >= 0 && rep.m <= 59 && (rep.type !== 'weekly' || (rep.dow >= 0 && rep.dow <= 6));
  }
  function nextAt(rep, from = Date.now()) {
    if (!validRepeat(rep)) return null;
    for (let i = 0; i <= 8; i++) {
      const d = new Date(from); d.setDate(d.getDate() + i); d.setHours(rep.h, rep.m, 0, 0);
      if (d.getTime() <= from) continue;
      const w = d.getDay();
      if (rep.type === 'daily' || (rep.type === 'weekdays' && w >= 1 && w <= 5) || (rep.type === 'weekly' && w === rep.dow)) return d.getTime();
    }
    return null;
  }
  function repeatText(rep) {
    const t = `${String(rep.h).padStart(2, '0')}:${String(rep.m).padStart(2, '0')}`;
    return rep.type === 'daily' ? `todos los días a las ${t}` : rep.type === 'weekdays' ? `de lunes a viernes a las ${t}` : `cada ${DOW[rep.dow]} a las ${t}`;
  }

  // ======================================================================
  // 📝 Notas rápidas
  // ======================================================================
  function addNote(text) {
    text = String(text || '').trim().slice(0, 120);
    if (!loaded || !text || data.notes.length >= 30) return false;
    data.notes.push({ id: `n${Date.now()}`, text, at: Date.now() });
    save(); renderNotes();
    return true;
  }
  function removeNote(i) { if (i < 0 || i >= data.notes.length) return null; const [n] = data.notes.splice(i, 1); save(); renderNotes(); return n; }
  function clearNotes() { const n = data.notes.length; data.notes = []; save(); renderNotes(); return n; }
  function renderNotes() {
    const list = $('notelist');
    if (list) {
      list.innerHTML = '';
      if (!data.notes.length) { const e = document.createElement('div'); e.className = 'rem-item'; e.textContent = 'Sin notas. Escribe una arriba o dime «apunta que…»'; list.appendChild(e); }
      data.notes.forEach((n, i) => {
        const row = document.createElement('div'); row.className = 'rem-item';
        const num = document.createElement('b'); num.textContent = `${i + 1}.`;
        const txt = document.createElement('span'); txt.textContent = n.text; txt.title = n.text;
        const del = document.createElement('button'); del.type = 'button'; del.title = 'Tachar'; del.textContent = '✓';
        del.addEventListener('click', e => { e.stopPropagation(); removeNote(data.notes.indexOf(n)); if (window.Sound) Sound.play('pop'); });
        row.append(num, txt, del);
        list.appendChild(row);
      });
    }
    const btn = $('notesbtn');
    if (btn) btn.textContent = data.notes.length ? `📝 Notas · ${data.notes.length}` : '📝 Notas';
  }

  // ======================================================================
  // 📅 Agenda: saludo de la mañana y resumen de la tarde
  // ======================================================================
  function agendaLines() {
    const now = Date.now(), end = new Date(); end.setHours(23, 59, 59, 999);
    const lines = [];
    const todays = data.reminders.filter(r => r.at <= end.getTime()).sort((a, b) => a.at - b.at);
    if (todays.length) for (const r of todays.slice(0, 5)) lines.push(`⏰ ${hhmm(r.at)}${r.at < now ? ' (pendiente)' : ''} · ${r.text}`);
    else lines.push('⏰ Sin recordatorios para hoy');
    if (data.notes.length) lines.push(`📝 ${data.notes.length} nota${data.notes.length === 1 ? '' : 's'}: ${data.notes.slice(0, 2).map(n => n.text).join(' · ')}${data.notes.length > 2 ? '…' : ''}`);
    const d = dayStats();
    if (d.xp) lines.push(`✅ Hoy: ${d.task || 0} tareas · 🍅 ${d.pomo || 0} pomodoros · ⭐ ${d.xp} XP`);
    const p = data.prevDay;
    if (p && p.date === yesterday() && p.xp) lines.push(`📊 Ayer: ${p.task || 0} tareas · 🍅 ${p.pomo || 0} pomodoros · ⭐ ${p.xp} XP`);
    if (streakNow() >= 2) lines.push(`🔥 Racha de ${streakNow()} días`);
    return lines;
  }
  function showAgenda(title) {
    return Speech.say(title || `📅 Tu día (${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })})`, 3, {
      dur: 20000, lines: agendaLines(), buttons: [{ label: 'Vale 👍', value: 'x' }],
    });
  }
  function eveningLines() {
    const d = dayStats();
    return [
      `✅ ${d.task || 0} tareas de Claude terminadas`,
      `🍅 ${d.pomo || 0} pomodoros · 🧘 ${d.break || 0} descansos`,
      `⭐ ${d.xp} XP ganados · ${moodFace()} ánimo ${moodV()}%`,
      ...(data.notes.length ? [`📝 Te quedan ${data.notes.length} nota${data.notes.length === 1 ? '' : 's'} pendiente${data.notes.length === 1 ? '' : 's'}`] : []),
    ];
  }
  function agendaTick(now) {
    if (!care.activeSince || care.full || Speech.asking() || Speech.speaking()) return;   // solo si estás en el PC y sin interrumpir
    const h = new Date(now).getHours();
    if (h >= 5 && h < 12 && data.agenda.morning !== today()) {
      data.agenda.morning = today(); save();
      ClawdSprite.trigger('hello');
      if (window.Sound) Sound.play('hello');
      showAgenda('☀️ ¡Buenos días! Esto es lo que tienes hoy:');
    } else if (h >= 19 && data.agenda.evening !== today() && dayStats().xp > 0) {
      data.agenda.evening = today(); save();
      ClawdSprite.trigger('love');
      Speech.say('🌙 ¡Buen trabajo hoy! Tu resumen:', 3, { dur: 20000, lines: eveningLines(), buttons: [{ label: 'Gracias 💕', value: 'x' }] });
    }
  }
  // El ánimo baja poco a poco si pasas mucho rato sin hacerle caso, y se nota
  function moodTick(now) {
    if (!care.activeSince) return;                    // si no estás, no se pone triste
    if (now - (data.mood.at || 0) > 20 * MIN) { data.mood.v = Math.max(0, moodV() - 2); data.mood.at = now - 15 * MIN; save(); renderBox(); }
    if (Speech.speaking() || Speech.asking() || Play.cur || pomo.mode === 'focus') return;
    const v = moodV();
    if (v < 30 && Math.random() < 0.25) { ClawdSprite.trigger('sad'); Speech.say(pick(['🥺 Me siento un poco solito… ¿me haces caso?', '🥺 Hace rato que no hablamos…', '🥺 ¿Un descanso juntos?']), 1); }
    else if (v >= 85 && Math.random() < 0.15) { ClawdSprite.trigger('love'); Speech.say(pick(['💕 ¡Qué bien lo estamos pasando!', '😄 Hoy estoy feliz contigo', '💛 Me encanta trabajar contigo']), 0); }
  }

  function openForm() {
    $('remform').classList.remove('hidden');
    if (!pinned) { pinned = true; pinnedByMe = true; updatePanel(); }
    renderReminders();
  }
  function closeForm() {
    $('remform').classList.add('hidden');
    setInput(false);
    if (pinnedByMe) { pinnedByMe = false; pinned = false; updatePanel(); }
  }

  // ======================================================================
  // Botones del panel
  // ======================================================================
  function wire() {
    $('pomobtn').addEventListener('click', e => {
      e.stopPropagation();
      if (pomo.mode === 'off') return startFocus();
      Speech.say(pomo.mode === 'focus' ? '🍅 ¿Paro el pomodoro?' : '☕ ¿Termino el descanso?', 3, {
        dur: 10000,
        buttons: pomo.mode === 'focus'
          ? [{ label: 'Parar', value: 'stop', primary: true }, { label: 'Seguir', value: 'x' }]
          : [{ label: 'Otro pomodoro 🍅', value: 'focus', primary: true }, { label: 'Parar', value: 'stop' }, { label: 'Seguir descansando', value: 'x' }],
        onAnswer: v => { if (v === 'stop') stopPomo(); else if (v === 'focus') startFocus(); },
      });
    });
    $('rembtn').addEventListener('click', e => {
      e.stopPropagation();
      if ($('remform').classList.contains('hidden')) openForm(); else closeForm();
    });
    $('hatbtn').addEventListener('click', e => { e.stopPropagation(); window.clawd.openShop(); });
    $('boost').addEventListener('click', e => { e.stopPropagation(); showAchievements(); });
    const input = $('remtext');
    input.addEventListener('mousedown', () => { setInput(true); setTimeout(() => input.focus(), 30); });
    input.addEventListener('blur', () => setInput(false));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { input.blur(); closeForm(); } });
    document.querySelectorAll('#remform [data-min]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      addReminder(Number(b.dataset.min));
    }));
    // 📝 notas y 📅 hoy (en "Más")
    const nb = $('notesbtn'), box = $('notesbox'), nt = $('notetext');
    if (nb && box && nt) {
      nb.addEventListener('click', e => {
        e.stopPropagation();
        const opening = box.classList.contains('hidden');
        box.classList.toggle('hidden', !opening);
        if (opening && !pinned) { pinned = true; pinnedByMe = true; updatePanel(); }
        if (!opening && pinnedByMe) { pinnedByMe = false; pinned = false; updatePanel(); }
        renderNotes();
        if (opening) setTimeout(() => box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
      });
      nt.addEventListener('mousedown', () => { setInput(true); setTimeout(() => nt.focus(), 30); });
      nt.addEventListener('blur', () => setInput(false));
      nt.addEventListener('keydown', e => {
        if (e.key === 'Enter' && nt.value.trim()) { if (addNote(nt.value)) { nt.value = ''; ClawdSprite.trigger('check'); if (window.Sound) Sound.play('pop'); } }
        else if (e.key === 'Escape') nt.blur();
      });
    }
    const ab = $('agendabtn');
    if (ab) ab.addEventListener('click', e => { e.stopPropagation(); showAgenda(); });
  }
  function setDurations(p, persist) {
    const ok = (v, a, b) => Number.isFinite(Number(v)) && Number(v) >= a && Number(v) <= b;
    const patch = {};
    if (ok(p.pomoFocus, 5, 120)) { FOCUS = Math.round(p.pomoFocus) * MIN; patch.pomoFocus = Math.round(p.pomoFocus); }
    if (ok(p.pomoBreak, 1, 60)) { SHORT = Math.round(p.pomoBreak) * MIN; LONG = SHORT * 3; patch.pomoBreak = Math.round(p.pomoBreak); }
    if (ok(p.careEvery, 15, 240)) { CARE_EVERY = Math.round(p.careEvery) * MIN; patch.careEvery = Math.round(p.careEvery); }
    if ('breaks' in p) { care.on = p.breaks !== false; patch.breaks = care.on; }
    if (persist && Object.keys(patch).length) window.clawd.savePref(patch);
    return patch;
  }

  // ======================================================================
  // Datos del sistema, ajustes y bucle
  // ======================================================================
  window.clawd.onSys(s => {
    if (typeof s.idle === 'number') onIdle(s.idle);
    if (s.fg) care.full = !!(s.fg.full && !s.fg.shell);
  });
  const applyPrefs = p => { if (p && typeof p === 'object') setDurations(p, false); };
  window.clawd.onPrefs(applyPrefs);
  window.clawd.onCommand(c => { if (c && c.prefs) applyPrefs(c.prefs); });

  setInterval(() => {
    const now = Date.now();
    if (pomo.mode !== 'off' && now >= pomo.until) { if (pomo.mode === 'focus') focusEnd(); else breakEnd(); }
    renderPomo();
    if (loaded) { remindTick(now); careTick(now); }
    if (announces.length && !Speech.speaking()) announces.shift()();
    // si el panel se cerró mientras escribías, se suelta el teclado
    if (inputOn && panel.classList.contains('hidden')) { $('remtext').blur(); if ($('notetext')) $('notetext').blur(); setInput(false); }
    if (!$('remform').classList.contains('hidden') && panel.classList.contains('hidden') && !pinned) closeForm();
    if ($('notesbox') && !$('notesbox').classList.contains('hidden') && panel.classList.contains('hidden') && !pinned) { $('notesbox').classList.add('hidden'); pinnedByMe = false; }
  }, 1000);
  setInterval(() => { renderBox(); if (loaded) { agendaTick(Date.now()); dayStats(); } }, 60000);   // la racha cambia a medianoche
  setInterval(() => { if (loaded) moodTick(Date.now()); }, 5 * 60000);

  (async () => {
    try {
      const d = await window.clawd.progressLoad();
      if (d && typeof d === 'object') {
        data = { ...data, ...d };
        data.totals = d.totals && typeof d.totals === 'object' ? d.totals : {};
        data.streak = { ...DEFAULTS.streak, ...(d.streak || {}) };
        data.todayPomos = { ...DEFAULTS.todayPomos, ...(d.todayPomos || {}) };
        data.ach = Array.isArray(d.ach) ? d.ach : [];
        data.reminders = Array.isArray(d.reminders) ? d.reminders.filter(r => r && typeof r.at === 'number' && typeof r.text === 'string' && (!r.repeat || validRepeat(r.repeat))) : [];
        data.xp = Number(d.xp) || 0;
        data.notes = Array.isArray(d.notes) ? d.notes.filter(n => n && typeof n.text === 'string').slice(0, 30) : [];
        data.day = d.day && typeof d.day === 'object' ? { xp: 0, ...d.day } : { ...DEFAULTS.day };
        data.prevDay = d.prevDay && typeof d.prevDay === 'object' ? d.prevDay : null;
        data.mood = { ...DEFAULTS.mood, ...(d.mood || {}) };
        data.agenda = { ...DEFAULTS.agenda, ...(d.agenda || {}) };
      }
    } catch { /* primera vez */ }
    loaded = true;
    if (!data.mood.at) data.mood.at = Date.now();
    for (const [k, n] of early.splice(0)) award(k, n);
    renderBox();
    renderReminders();
    renderNotes();
  })();
  wire();
  renderPomo();

  // ---------- lo que pregunta app.js / extras.js ----------
  // Acción de Pal: con el pomodoro se queda sentado y concentrado; en el descanso se estira
  function want(w) {
    if (pomo.mode === 'focus' && (w === 'idle' || w === 'sleeping')) return 'sit';
    if (pomo.mode === 'break' && ['idle', 'sleeping', 'sit'].includes(w)) return (Date.now() / 1000) % 30 < 8 ? 'stretch' : 'idle';
    return w;
  }
  function caption() {
    if (pomo.mode === 'focus') return `🍅 Enfoque · ${clock(pomo.until - Date.now())}`;
    if (pomo.mode === 'break') return `☕ Descanso · ${clock(pomo.until - Date.now())}`;
    return '';
  }

  // Pruebas: /preview?a=b:pomo | b:pomoend | b:breakend | b:level | b:care | b:rem | b:ach | b:hat (abre la tienda)
  function preview(cmd) {
    if (cmd === 'pomo') startFocus();
    else if (cmd === 'pomoend') { if (pomo.mode !== 'focus') startFocus(); pomo.until = Date.now(); }
    else if (cmd === 'breakend') { if (pomo.mode !== 'break') startBreak(false); pomo.until = Date.now(); }
    else if (cmd === 'level') { data.xp = Math.max(data.xp, xpAt(levelOf(data.xp) + 1) - 5); award('task'); }
    else if (cmd === 'care') { care.activeSince = Date.now() - CARE_EVERY - 1000; care.snooze = 0; care.on = true; }
    else if (cmd === 'rem') { data.reminders.push({ id: `r${Date.now()}`, at: Date.now() + 3000, text: 'Mirar si Claude terminó 👀' }); save(); renderReminders(); }
    else if (cmd === 'ach') showAchievements();
    else if (cmd === 'hat') window.clawd.openShop();
    else if (cmd === 'morning') { data.agenda.morning = null; care.activeSince = care.activeSince || Date.now(); ClawdSprite.trigger('hello'); showAgenda('☀️ ¡Buenos días! Esto es lo que tienes hoy:'); }
    else if (cmd === 'evening') Speech.say('🌙 ¡Buen trabajo hoy! Tu resumen:', 3, { dur: 20000, lines: eveningLines(), buttons: [{ label: 'Gracias 💕', value: 'x' }] });
  }

  // ---------- para hablar con Pal (talk.js) ----------
  function remindAt(at, text, repeat) {
    if (repeat && validRepeat(repeat)) at = nextAt(repeat);
    else repeat = undefined;
    if (!loaded || !(at > Date.now()) || data.reminders.length >= 20) return false;
    data.reminders.push({ id: `r${Date.now()}`, at, text: String(text || '').trim().slice(0, 80) || 'Lo que me pediste', ...(repeat ? { repeat } : {}) });
    save();
    renderReminders();
    return true;
  }
  function clearReminders() { const n = data.reminders.length; data.reminders = []; save(); renderReminders(); return n; }
  function info() {
    const lvl = levelOf(data.xp);
    return {
      level: lvl, xp: data.xp - xpAt(lvl), next: xpAt(lvl + 1) - xpAt(lvl), streak: streakNow(), best: data.streak.best || 0,
      ach: data.ach.length, achTotal: ACH.length, tasks: tot('task'), pomosToday: data.todayPomos.date === today() ? data.todayPomos.n : 0,
      pomo: pomo.mode, pomoLeft: Math.max(0, pomo.until - Date.now()),
      reminders: [...data.reminders].sort((a, b) => a.at - b.at).map(r => ({ at: r.at, text: r.text, repeat: r.repeat ? repeatText(r.repeat) : null })),
      notes: data.notes.map(n => n.text), mood: moodV(), moodFace: moodFace(),
      durations: { focus: FOCUS / MIN, break: SHORT / MIN, care: CARE_EVERY / MIN, careOn: care.on },
    };
  }

  return {
    award, want, caption, preview, remindAt, clearReminders, info, showAchievements,
    addNote, removeNote, clearNotes, agendaLines, showAgenda, eveningLines, cheer, nextAt, repeatText, setDurations: p => setDurations(p, true),
    pomo: action => { if (action === 'start') { if (pomo.mode !== 'focus') startFocus(); } else if (pomo.mode !== 'off') stopPomo(false); },
    focusing: () => pomo.mode === 'focus',
  };
})();
window.Boost = Boost;
