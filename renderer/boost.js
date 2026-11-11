// Más funciones para Clawd, inspiradas en otras mascotas de escritorio:
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
  // 💾 Progreso guardado (progress.json en la carpeta de datos de Clawd)
  // ======================================================================
  const DEFAULTS = { xp: 0, totals: {}, streak: { last: null, count: 0, best: 0 }, todayPomos: { date: null, n: 0 }, ach: [], reminders: [] };
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

  function award(kind, n = 1) {
    if (!XP[kind] || n < 1) return;
    if (!loaded) { early.push([kind, n]); return; }
    const before = levelOf(data.xp);
    data.xp += XP[kind] * n;
    data.totals[kind] = tot(kind) + n;
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
    stats.textContent = `🔥 ${streakNow()} ${streakNow() === 1 ? 'día' : 'días'} · 🍅 ${pomos} hoy · 🏅 ${data.ach.length}/${ACH.length} logros`;
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
  const FOCUS = 25 * MIN, SHORT = 5 * MIN, LONG = 15 * MIN;
  const pomo = { mode: 'off', until: 0, cycle: 0 };

  function startFocus(ms = FOCUS) {
    pomo.mode = 'focus';
    pomo.until = Date.now() + ms;
    if (window.Sound) Sound.play('pop');
    Speech.say(pick(['🍅 ¡A concentrarse! 25 minutos, yo vigilo', '🍅 Modo enfoque activado. Te aviso al terminar', '🍅 25 minutos de concentración. ¡Tú puedes!']), 2, { dur: 3500 });
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
    const mins = long ? 15 : 5;
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
    btn.textContent = pomo.mode === 'focus' ? `🍅 ${clock(left)}` : pomo.mode === 'break' ? `☕ ${clock(left)}` : '🍅 Enfoque';
  }

  // ======================================================================
  // 🧘 Descansos, agua y vista
  // ======================================================================
  const CARE_EVERY = 45 * MIN;
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
        } else care.snooze = Date.now() + (v === 'later' ? 10 : 15) * MIN;
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
      const when = document.createElement('b'); when.textContent = hhmm(r.at);
      const txt = document.createElement('span'); txt.textContent = r.text;
      const del = document.createElement('button'); del.type = 'button'; del.title = 'Quitar'; del.textContent = '✕';
      del.addEventListener('click', e => { e.stopPropagation(); data.reminders = data.reminders.filter(x => x.id !== r.id); save(); renderReminders(); });
      row.append(when, txt, del);
      list.appendChild(row);
    }
    const btn = $('rembtn');
    if (btn) btn.textContent = data.reminders.length ? `⏰ Recordar (${data.reminders.length})` : '⏰ Recordar';
  }
  function remindTick(now) {
    const due = data.reminders.filter(r => r.at <= now).sort((a, b) => a.at - b.at)[0];
    if (!due) return;
    if (!due.notified) { due.notified = true; notify('⏰ Recordatorio de Clawd', due.text); save(); }
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
    save();
    renderReminders();
    ClawdSprite.trigger('hello');
    if (window.Sound) Sound.play('alert');
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
  }

  // ======================================================================
  // Datos del sistema, ajustes y bucle
  // ======================================================================
  window.clawd.onSys(s => {
    if (typeof s.idle === 'number') onIdle(s.idle);
    if (s.fg) care.full = !!(s.fg.full && !s.fg.shell);
  });
  const applyPrefs = p => { if (p && 'breaks' in p) care.on = p.breaks !== false; };
  window.clawd.onPrefs(applyPrefs);
  window.clawd.onCommand(c => { if (c && c.prefs) applyPrefs(c.prefs); });

  setInterval(() => {
    const now = Date.now();
    if (pomo.mode !== 'off' && now >= pomo.until) { if (pomo.mode === 'focus') focusEnd(); else breakEnd(); }
    renderPomo();
    if (loaded) { remindTick(now); careTick(now); }
    if (announces.length && !Speech.speaking()) announces.shift()();
    // si el panel se cerró mientras escribías, se suelta el teclado
    if (inputOn && panel.classList.contains('hidden')) { $('remtext').blur(); setInput(false); }
    if (!$('remform').classList.contains('hidden') && panel.classList.contains('hidden') && !pinned) closeForm();
  }, 1000);
  setInterval(renderBox, 60000);       // la racha cambia a medianoche

  (async () => {
    try {
      const d = await window.clawd.progressLoad();
      if (d && typeof d === 'object') {
        data = { ...data, ...d };
        data.totals = d.totals && typeof d.totals === 'object' ? d.totals : {};
        data.streak = { ...DEFAULTS.streak, ...(d.streak || {}) };
        data.todayPomos = { ...DEFAULTS.todayPomos, ...(d.todayPomos || {}) };
        data.ach = Array.isArray(d.ach) ? d.ach : [];
        data.reminders = Array.isArray(d.reminders) ? d.reminders.filter(r => r && typeof r.at === 'number' && typeof r.text === 'string') : [];
        data.xp = Number(d.xp) || 0;
      }
    } catch { /* primera vez */ }
    loaded = true;
    for (const [k, n] of early.splice(0)) award(k, n);
    renderBox();
    renderReminders();
  })();
  wire();
  renderPomo();

  // ---------- lo que pregunta app.js / extras.js ----------
  // Acción de Clawd: con el pomodoro se queda sentado y concentrado; en el descanso se estira
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
  }

  return {
    award, want, caption, preview,
    focusing: () => pomo.mode === 'focus',
  };
})();
window.Boost = Boost;
