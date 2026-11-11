// Extras de Windows para Pal: sonidos, subirse a ventanas, modo por app, pantalla completa,
// "¡volviste!", modo noche, teclear contigo, batería, capturas, commits/tests/límite,
// soltar archivos, resumen del día y disfraces.
// Usa lo que define app.js (Speech, Phrases, ClawdSprite, state, sitting, down, Play...).

// ---------- 🔊 Sonidos (sintetizados, sin archivos) ----------
const Sound = (() => {
  let ac = null;
  let on = true;
  const ctx = () => ac || (ac = new AudioContext());
  function tone(freq, dur, type = 'square', vol = 0.04, when = 0, slideTo = null) {
    if (!on) return;
    try {
      const c = ctx();
      const t0 = c.currentTime + when;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch { /* sin audio */ }
  }
  function noise(dur, vol = 0.05) {
    if (!on) return;
    try {
      const c = ctx();
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = c.createBufferSource();
      const g = c.createGain();
      g.gain.value = vol;
      src.buffer = buf;
      src.connect(g).connect(c.destination);
      src.start();
    } catch { /* sin audio */ }
  }
  let lastBlip = 0;
  function blip() {
    const n = performance.now();
    if (n - lastBlip < 45) return;
    lastBlip = n;
    tone(520 + Math.random() * 260, 0.035, 'square', 0.015);
  }
  const SFX = {
    pop: () => tone(660, 0.08, 'sine', 0.06, 0, 990),
    ding: () => { tone(1046, 0.25, 'sine', 0.05); tone(1568, 0.3, 'sine', 0.035, 0.08); },
    done: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.05, i * 0.09)),
    alert: () => { tone(880, 0.12, 'square', 0.03); tone(660, 0.16, 'square', 0.03, 0.15); },
    hello: () => { tone(784, 0.1, 'sine', 0.05); tone(1175, 0.16, 'sine', 0.05, 0.1); },
    shutter: () => { noise(0.06, 0.08); tone(2000, 0.04, 'square', 0.02, 0.06); },
    rocket: () => tone(200, 0.8, 'sawtooth', 0.025, 0, 1600),
    oops: () => tone(440, 0.5, 'triangle', 0.05, 0, 150),
    sad: () => [392, 370, 349, 330].forEach((f, i) => tone(f, 0.3, 'triangle', 0.04, i * 0.28)),
    fall: () => tone(900, 0.6, 'sine', 0.04, 0, 180),
    land: () => { noise(0.08, 0.07); tone(120, 0.12, 'sine', 0.07); },
    charge: () => [523, 784, 1046].forEach((f, i) => tone(f, 0.12, 'sine', 0.05, i * 0.07)),
  };
  return { blip, play: n => { if (SFX[n]) SFX[n](); }, set: v => { on = !!v; }, isOn: () => on };
})();

const Extras = (() => {
  let prefs = { ride: 'ask', fsHide: 'ask', appModes: {}, sound: true };
  let pos = null;                // { anchor: [x, y], work }
  let fg = null;                 // ventana activa
  let lastBase = 'idle';
  const FEET = 171;              // distancia del borde superior del dibujo a los pies de Pal (px)

  const APP_NAMES = {
    code: 'VS Code', cursor: 'Cursor', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', outlook: 'Outlook',
    brave: 'Brave', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', opera: 'Opera', spotify: 'Spotify',
    figma: 'Figma', photoshop: 'Photoshop', whatsapp: 'WhatsApp', discord: 'Discord', telegram: 'Telegram',
    windowsterminal: 'la Terminal', explorer: 'el Explorador', notepad: 'el Bloc de notas', claude: 'Claude',
    steam: 'Steam', teams: 'Teams', 'ms-teams': 'Teams', slack: 'Slack', vlc: 'VLC', blender: 'Blender',
  };
  const appName = a => APP_NAMES[a] || (a ? a.charAt(0).toUpperCase() + a.slice(1) : 'esa app');

  const isFree = () => (lastBase === 'idle' || lastBase === 'sleeping') && !sitting && !Play.cur && !down;
  const canAsk = () => !Speech.asking() && !full.hidden;
  const ask = (key, vars, buttons, onAnswer, priority = 3) =>
    Speech.say(Phrases.pick(key, vars), priority, { buttons, onAnswer, dur: 15000 });

  // ======================================================================
  // 1. 🧗 Subirse a ventanas
  // ======================================================================
  const ride = { mode: 'off', key: null, offX: 60, dir: 1, walkUntil: 0, nextWalk: 0, from: null, t: 0, x: 0, y: 0, vy: 0, lastAsk: 0, asked: new Set(), lastRect: null, wobbleAt: 0 };

  function rideable(f) {
    if (!f || f.shell || f.full || f.min || f.max) return false;
    const r = f.rect;
    if (r.width < 320 || r.height < 200) return false;
    if (r.y < f.work.y + 190) return false;       // no hay sitio encima
    return true;
  }
  function rideTarget(f) {
    const r = f.rect;
    ride.offX = Math.min(Math.max(ride.offX, -40), r.width - 120);
    return [r.x + ride.offX, r.y - FEET];
  }
  function maybeAskRide(f) {
    if (prefs.ride === 'never' || ride.mode !== 'off' || !rideable(f) || !isFree() || !canAsk()) return;
    if (ride.asked.has(f.id) || Date.now() - ride.lastAsk < 120000) return;
    ride.asked.add(f.id);
    ride.lastAsk = Date.now();
    if (prefs.ride === 'always') return startGoing(f);
    ask('askRide', { app: appName(f.app) }, [
      { label: 'Sí 🧗', value: 'yes', primary: true }, { label: 'No', value: 'no' },
      { label: 'Siempre', value: 'always' }, { label: 'Nunca', value: 'never' },
    ], v => {
      if (v === 'always' || v === 'never') { prefs.ride = v; window.clawd.savePref({ ride: v }); }
      if ((v === 'yes' || v === 'always') && fg && fg.id === f.id && rideable(fg)) startGoing(fg);
    });
  }
  // La ventana en la que está subido se sigue aparte (aunque cambies a otra ventana)
  // y solo se cae si la minimizas, maximizas, cierras o no queda sitio encima.
  function trackOk(tr) {
    return !!tr && tr.exists && !tr.min && !tr.max && tr.rect.width >= 200 && tr.rect.y >= tr.work.y + 150;
  }
  function startGoing(f) {
    if (!pos) return;
    ride.mode = 'going';
    ride.key = f.id;
    ride.track = { id: f.id, exists: true, min: false, max: false, rect: { ...f.rect }, work: f.work };
    window.clawd.track(f.id);
    ride.from = [...pos.anchor];
    ride.offX = Math.max(20, Math.min(f.rect.width - 160, f.rect.width * (0.3 + Math.random() * 0.4) - 80));
    ride.t = 0;
    ride.lastRect = { ...f.rect };
  }
  function stopRide() {
    ride.mode = 'off';
    ride.track = null;
    window.clawd.track(0);
  }
  function startFall() {
    if (!pos) return;
    window.clawd.track(0);
    ride.track = null;
    ride.mode = 'falling';
    ride.x = pos.anchor[0];
    ride.y = pos.anchor[1];
    ride.vy = -120;
    Speech.say(Phrases.pick('rideFall'), 2, { dur: 1500 });
    Sound.play('fall');
  }
  function rideFrame(now, dt) {
    if (ride.mode === 'off' || !pos) return null;
    if (ride.mode === 'going') {
      if (!trackOk(ride.track)) { stopRide(); return null; }
      ride.t += dt;
      const q = Math.min(1, ride.t / 1.1);
      const to = rideTarget(ride.track);
      const x = ride.from[0] + (to[0] - ride.from[0]) * q;
      const y = ride.from[1] + (to[1] - ride.from[1]) * q - Math.sin(q * Math.PI) * 120;
      window.clawd.moveTo(x, y);
      if (q >= 1) {
        ride.mode = 'riding';
        ClawdSprite.trigger('poke');
        Sound.play('land');
        Speech.say(Phrases.pick('rideOn'), 2, { dur: 2200 });
      }
      return { want: 'hop', play: { dir: to[0] >= ride.from[0] ? 1 : -1, hop: 0.2 + q * 0.6 } };
    }
    if (ride.mode === 'riding') {
      const tr = ride.track;
      if (!trackOk(tr)) { startFall(); return { want: 'hop', play: { hop: 0.5 } }; }
      // la ventana se movió rápido: se tambalea
      const lr = ride.lastRect;
      if (lr && Math.abs(tr.rect.x - lr.x) + Math.abs(tr.rect.y - lr.y) > 60 && now - ride.wobbleAt > 5000) {
        ride.wobbleAt = now;
        ClawdSprite.trigger('oops');
        Speech.say(Phrases.pick('rideWobble'), 2, { dur: 1800 });
      }
      ride.lastRect = { ...tr.rect };
      // paseo por el borde de la ventana cuando Claude no trabaja
      let out = null;
      if (isFree() && !musicOn()) {
        if (now > ride.nextWalk && now > ride.walkUntil) {
          ride.walkUntil = now + 1500 + Math.random() * 2500;
          ride.nextWalk = ride.walkUntil + 3000 + Math.random() * 6000;
          ride.dir = Math.random() < 0.5 ? -1 : 1;
        }
        if (now < ride.walkUntil) {
          ride.offX += ride.dir * 35 * dt;
          if (ride.offX < -40 || ride.offX > tr.rect.width - 120) ride.dir *= -1;
          out = { want: 'walk', play: { dir: ride.dir } };
        }
      }
      const to = rideTarget(tr);
      if (Math.abs(to[0] - pos.anchor[0]) >= 1 || Math.abs(to[1] - pos.anchor[1]) >= 1) window.clawd.moveTo(to[0], to[1]);
      return out;
    }
    if (ride.mode === 'falling') {
      ride.vy += 2200 * dt;
      ride.y += ride.vy * dt;
      const floor = pos.work.y + pos.work.height - FEET - 4;
      if (ride.y >= floor) {
        ride.y = floor;
        ride.mode = 'off';
        ClawdSprite.trigger('poke');
        Sound.play('land');
        Speech.say(Phrases.pick('rideLand'), 2, { dur: 2200 });
        window.clawd.moveTo(ride.x, ride.y);
        window.clawd.moveEnd();
        return null;
      }
      window.clawd.moveTo(ride.x, ride.y);
      return { want: 'hop', play: { hop: 0.5 } };
    }
    return null;
  }

  // ======================================================================
  // 2. 🎧 Modo por app (accesorios)
  // ======================================================================
  const BROWSER = /chrome|msedge|firefox|brave|opera|vivaldi|arc/;
  const CATS = [
    ['music', /spotify|applemusic|zunemusic|deezer|tidal|foobar|aimp|musicbee|itunes/, /youtube music|spotify|soundcloud/i],
    ['video', /vlc|netflix|primevideo|disney|potplayer|mpc-hc|plex/, /youtube|netflix|twitch|prime video|disney\+|crunchyroll|max\b/i],
    ['design', /figma|photoshop|illustrator|afterfx|blender|canva|krita|gimp|inkscape/, /figma|canva|photopea/i],
    ['office', /excel|winword|powerpnt|outlook|onenote|teams/, /google sheets|hojas de cálculo|google docs|documentos de google|presentaciones|google slides|notion|outlook/i],
    ['code', /^code$|^cursor$|devenv|idea64|pycharm64|webstorm64|studio64|sublime_text|windowsterminal|^cmd$|powershell|pwsh/, /github|gitlab|stack overflow|codepen|replit|localhost/i],
    ['game', /steam|epicgameslauncher|riotclient|minecraft|javaw|robloxplayerbeta|valorant|leagueclient|battle\.net/, null],
    ['chat', /whatsapp|discord|telegram|slack|signal/, /whatsapp|discord|telegram|slack|messenger/i],
  ];
  const MODES = {
    music: { label: 'música', emoji: '🎧', wear: { ears: 'headphones' } },
    video: { label: 'cine', emoji: '🍿', wear: { face: '3d' } },
    design: { label: 'artista', emoji: '🎨', wear: { head: 'beret' } },
    office: { label: 'oficina', emoji: '👔', wear: { neck: 'tie' } },
    code: { label: 'programador', emoji: '🤓', wear: { face: 'nerd' } },
    game: { label: 'gamer', emoji: '🎮', wear: { ears: 'gamer' } },
    chat: { label: 'charla', emoji: '💬', wear: null },
  };
  const appMode = { cur: null, lastAsk: 0, later: {}, greeted: {} };

  function categorize(f) {
    if (!f || f.shell) return null;
    const isB = BROWSER.test(f.app);
    for (const [cat, appRe, titleRe] of CATS) {
      if (!isB && appRe.test(f.app)) return cat;
      if (isB && titleRe && titleRe.test(f.title)) return cat;
    }
    return null;
  }
  function onAppChange(f) {
    const cat = categorize(f);
    if (!cat) { appMode.cur = null; return; }
    const key = BROWSER.test(f.app) ? `${f.app}:${cat}` : f.app;
    appMode.cur = { cat, key };
    const pref = prefs.appModes[key];
    const now = Date.now();
    if (pref === true) {
      if (now - (appMode.greeted[key] || 0) > 10 * 60000) {
        appMode.greeted[key] = now;
        Speech.say(Phrases.pick(`mode_${cat}`), 1, { cooldown: 3000 });
      }
      return;
    }
    if (pref === false || !canAsk() || now - appMode.lastAsk < 90000 || (appMode.later[key] || 0) > now) return;
    appMode.lastAsk = now;
    const m = MODES[cat];
    ask('askMode', { mode: m.label, app: appName(f.app), emoji: m.emoji }, [
      { label: 'Sí, siempre', value: 'yes', primary: true }, { label: 'Ahora no', value: 'later' }, { label: 'Nunca', value: 'no' },
    ], v => {
      if (v === 'yes' || v === 'no') {
        prefs.appModes = { ...prefs.appModes, [key]: v === 'yes' };
        window.clawd.savePref({ appMode: { app: key, on: v === 'yes' } });
        if (v === 'yes') { appMode.greeted[key] = Date.now(); Speech.say(Phrases.pick(`mode_${cat}`), 2); }
      } else appMode.later[key] = Date.now() + 30 * 60000;
    }, 2);
  }
  function modeWear() {
    if (!appMode.cur || prefs.appModes[appMode.cur.key] !== true) return null;
    // un videoclip en YouTube es música (baila), así que lleva cascos y no gafas de cine
    if (appMode.cur.cat === 'video' && state.media && state.media.music) return MODES.music.wear;
    return MODES[appMode.cur.cat].wear;
  }

  // ======================================================================
  // 3. 🙈 Pantalla completa
  // ======================================================================
  const full = { hidden: false, askedFor: null, noUntil: {} };
  function hideNow() { full.hidden = true; window.clawd.setHidden(true); }
  function onFullscreen(f) {
    if (f.full && !f.shell) {
      if (full.hidden || prefs.fsHide === 'never' || full.askedFor === f.id) return;
      if (prefs.fsHide === 'always') return hideNow();
      if ((full.noUntil[f.app] || 0) > Date.now()) return;
      full.askedFor = f.id;
      Speech.say(Phrases.pick('askHide', { app: appName(f.app) }), 3, {
        dur: 12000,
        buttons: [{ label: 'Sí 🙈', value: 'yes', primary: true }, { label: 'No', value: 'no' }, { label: 'Siempre', value: 'always' }, { label: 'Nunca', value: 'never' }],
        onAnswer: v => {
          if (v === 'always' || v === 'never') { prefs.fsHide = v; window.clawd.savePref({ fsHide: v }); }
          if (v === 'no') full.noUntil[f.app] = Date.now() + 3600000;
          if ((v === 'yes' || v === 'always') && fg && fg.full) hideNow();
        },
      });
    } else {
      full.askedFor = null;
      if (full.hidden) {
        full.hidden = false;
        window.clawd.setHidden(false);
        setTimeout(() => Speech.say(Phrases.pick('fsBack'), 2, { dur: 2200 }), 300);
      }
    }
  }

  // ======================================================================
  // 6. 👋 ¡Volviste!
  // ======================================================================
  const away = { on: false, since: 0, tasks: 0 };
  function backNow() {
    if (!away.on) return;
    away.on = false;
    const min = Math.max(5, Math.round((Date.now() - away.since) / 60000));
    ClawdSprite.trigger('hello');
    Sound.play('hello');
    const lines = away.tasks > 0 ? [Phrases.pick('backWork', { n: away.tasks })] : undefined;
    Speech.say(Phrases.pick('back', { min }), 3, { dur: 5000, lines });
  }
  function onIdle(s) {
    // viendo un vídeo o escuchando música sin tocar nada no cuenta como "te fuiste"
    const watching = !!(state.media && state.media.playing);
    if (s >= 300 && !away.on && !watching) { away.on = true; away.since = Date.now() - s * 1000; away.tasks = 0; }
    else if (s < 5 && away.on) backNow();
  }
  let lastCur = null;
  window.clawd.onCursor(p => {
    if (lastCur && away.on && (Math.abs(p.x - lastCur.x) + Math.abs(p.y - lastCur.y) > 30)) backNow();
    lastCur = p;
  });

  // ======================================================================
  // 8. 🌙 Modo noche (desde las 18:30 hasta las 6:00)
  // ======================================================================
  let nightOverride = null;
  const isNight = () => { if (nightOverride !== null) return nightOverride; const d = new Date(); const m = d.getHours() * 60 + d.getMinutes(); return m >= 18 * 60 + 30 || m < 6 * 60; };
  const safeGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } };
  setInterval(() => {
    const day = new Date().toLocaleDateString('sv');
    if (isNight() && safeGet('clawd-night') !== day && !Speech.asking()) {
      safeSet('clawd-night', day);
      Speech.say(Phrases.pick('night'), 2, { dur: 3000 });
    }
  }, 30000);

  // ======================================================================
  // 10. ⌨️ Teclear contigo
  // ======================================================================
  const typing = { streak: 0, start: 0, last: 0, longSaid: false, saidAt: 0 };
  function onType(n) {
    const now = Date.now();
    if (n >= 3) {
      if (now - typing.last > 60000) { typing.start = now; typing.longSaid = false; }
      typing.last = now;
      typing.streak++;
      if (away.on) backNow();
    } else typing.streak = 0;
    if (!typing.longSaid && typing.start && now - typing.start > 20 * 60000 && now - typing.last < 5000) {
      typing.longSaid = true;
      Speech.say(Phrases.pick('typeLong'), 2);
    }
  }

  // ======================================================================
  // 11. 🔋 Batería
  // ======================================================================
  const bat = { tired: false, lastAc: null, said20: false, said10: false };
  function onBat(b) {
    if (!b.has) return;
    bat.tired = !b.ac && b.pct <= 20;
    if (!b.ac && b.pct <= 10 && !bat.said10) { bat.said10 = true; Speech.say(Phrases.pick('batCrit', { pct: b.pct }), 3, { alert: true }); Sound.play('alert'); }
    else if (!b.ac && b.pct <= 20 && !bat.said20) { bat.said20 = true; Speech.say(Phrases.pick('batLow', { pct: b.pct }), 2); }
    if (b.ac && bat.lastAc === false) {
      bat.said20 = bat.said10 = false;
      ClawdSprite.trigger('love');
      Sound.play('charge');
      Speech.say(Phrases.pick('batCharge'), 2);
    }
    bat.lastAc = b.ac;
  }

  // ======================================================================
  // 13. 📸 Capturas de pantalla
  // ======================================================================
  let lastPhoto = 0;
  function onPhoto() {
    if (Date.now() - lastPhoto < 3000 || full.hidden) return;
    lastPhoto = Date.now();
    ClawdSprite.trigger('photo');
    Sound.play('shutter');
    Speech.say(Phrases.pick('photo'), 2, { dur: 1800 });
  }

  // ======================================================================
  // 15/16. 📦 Commits, push, tests y límite de uso
  // ======================================================================
  function onDev(c) {
    if (window.Boost) Boost.award(c.dev);   // ⭐ puntos por commits, push y tests
    switch (c.dev) {
      case 'commit': ClawdSprite.trigger('check'); Sound.play('ding'); Speech.say(Phrases.pick('commit'), 2); break;
      case 'push': ClawdSprite.trigger('rocket'); Sound.play('rocket'); Speech.say(Phrases.pick('push'), 2); break;
      case 'testPass': ClawdSprite.trigger('love'); Sound.play('ding'); Speech.say(Phrases.pick('testPass'), 2); break;
      case 'testFail': ClawdSprite.trigger('oops'); Sound.play('oops'); Speech.say(Phrases.pick('testFail'), 2); break;
      case 'limit': {
        ClawdSprite.trigger('sad');
        Sound.play('sad');
        const u = state.usage && state.usage.five_hour;
        const lines = [];
        if (u && u.resets_at && u.resets_at * 1000 > Date.now()) {
          const d = new Date(u.resets_at * 1000);
          lines.push(`⏳ Vuelvo a las ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }
        Speech.say(Phrases.pick('limit'), 3, { dur: 7000, lines: lines.length ? lines : undefined });
        break;
      }
      default: break;
    }
  }

  // ======================================================================
  // 17. 📄 Soltar un archivo sobre Pal
  // ======================================================================
  document.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const path = window.clawd.pathForFile(f);
    if (!path) return;
    ClawdSprite.trigger('love');
    Sound.play('pop');
    Speech.say(Phrases.pick('askDrop', { file: f.name }), 3, {
      buttons: [{ label: 'Sí, ábrela', value: 'yes', primary: true }, { label: 'No', value: 'no' }],
      onAnswer: v => { if (v === 'yes') window.clawd.openSessions(path); },
    });
  });
  document.getElementById('sessbtn').addEventListener('click', e => { e.stopPropagation(); window.clawd.openSessions(null); });

  // ======================================================================
  // 18. 📊 Resumen del día al cerrar la app de Claude
  // ======================================================================
  function fmtMs(ms) {
    const m = Math.round((ms || 0) / 60000);
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  }
  function onSummary(s) {
    const lines = [
      `✅ ${s.tasks || 0} tareas completadas`,
      `🧠 ${s.sessions || 0} sesiones`,
      `⏱ ${fmtMs(s.workMs)} con Claude trabajando`,
    ];
    if (s.commits) lines.push(`📦 ${s.commits} commits${s.pushes ? ` · 🚀 ${s.pushes} push` : ''}`);
    if (s.testsPass || s.testsFail) lines.push(`🧪 Tests: ${s.testsPass || 0} ✅ · ${s.testsFail || 0} ❌`);
    if (s.musicMin) lines.push(`🎵 ${s.musicMin} min de música${s.songs && s.songs.length ? ` (${s.songs.length} canciones)` : ''}`);
    ClawdSprite.trigger('hello');
    Sound.play('done');
    Speech.say(Phrases.pick('summary'), 3, { dur: 14000, lines });
  }

  // ======================================================================
  // 19. 🎅 Disfraces por fecha
  // ======================================================================
  let costumeOverride = null;
  function costume() {
    if (costumeOverride) return costumeOverride === 'none' ? null : costumeOverride;
    const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    if (m === 12 && day <= 26) return 'santa';
    if ((m === 12 && day >= 31) || (m === 1 && day <= 1)) return 'party';
    if (m === 10 && day >= 24) return 'witch';
    if (m === 11 && day <= 2) return 'flowers';
    return null;
  }
  setTimeout(() => {
    const c = costume();
    const day = new Date().toLocaleDateString('sv');
    if (c && safeGet('clawd-costume') !== day) { safeSet('clawd-costume', day); Speech.say(Phrases.pick(`costume_${c}`), 2); }
  }, 6000);

  // ---------- 🔊 interruptor de sonido ----------
  const soundBtn = document.getElementById('sound');
  function setSound(v) {
    Sound.set(v);
    soundBtn.classList.toggle('on', !!v);
    Panel.tile(soundBtn, v ? '🔊' : '🔇', 'Sonido');
  }
  soundBtn.addEventListener('click', e => {
    e.stopPropagation();
    prefs.sound = !Sound.isOn();
    setSound(prefs.sound);
    window.clawd.savePref({ sound: prefs.sound });
    if (prefs.sound) Sound.play('pop');
  });

  // ---------- datos del sistema ----------
  window.clawd.onPos(p => { pos = p; });
  window.clawd.onSys(s => {
    if (s.fg) {
      const prevId = fg && fg.id;
      const prevApp = fg && `${fg.app}|${categorize(fg)}`;
      fg = s.fg;
      onFullscreen(fg);
      if (fg.id !== prevId) maybeAskRide(fg);
      if (`${fg.app}|${categorize(fg)}` !== prevApp) onAppChange(fg);
    }
    if (s.track && ride.track && s.track.id === ride.key) ride.track = s.track;
    if (typeof s.idle === 'number') onIdle(s.idle);
    if (typeof s.type === 'number') onType(s.type);
    if (s.bat) onBat(s.bat);
    if (s.photo) onPhoto();
  });

  // ---------- se llama en cada fotograma desde app.js ----------
  function frame(now, dt, want, base, gameActive) {
    lastBase = base;
    let out = { want: null, play: null };
    const r = rideFrame(now, dt);
    const urgent = want === 'waiting' || want === 'celebrate';
    if (r && (!urgent || ride.mode === 'falling' || ride.mode === 'going')) out = r;
    else if (!gameActive && !sitting && (base === 'idle' || base === 'sleeping') && typing.streak >= 2 && Date.now() - typing.last < 2500) {
      out.want = 'editing';                               // teclea contigo
      if (Date.now() - typing.saidAt > 10 * 60000) { typing.saidAt = Date.now(); Speech.say(Phrases.pick('typeAlong'), 1, { cooldown: 3000 }); }
    } else if (away.on && (want === 'idle' || want === 'sit')) out.want = 'sleeping';
    // de noche, gorrito (salvo que toque disfraz por fecha)
    const wear = { ...(modeWear() || {}), ...(window.Characters ? Characters.wear() : {}), hat: costume() || (window.Characters && Characters.hat()) || (isNight() ? 'nightcap' : null), band: !!(window.Boost && Boost.focusing()) };
    return { ...out, wear, tired: bat.tired };
  }

  function setPrefs(p) {
    prefs = { ...prefs, ...p, appModes: p.appModes || prefs.appModes };
    if ('sound' in p) setSound(p.sound !== false);
  }

  // Pruebas: /preview?a=x:ride | x:hide | x:summary | x:back | x:photo | x:costume:santa | x:dev:push | x:bat:15 | x:mode
  function preview(cmd) {
    const [a, ...rest] = cmd.split(':');
    const b = rest.join(':');
    if (a === 'ride' && fg) { ride.asked.delete(fg.id); ride.lastAsk = 0; maybeAskRideForced(fg); }
    else if (a === 'fall') startFall();
    else if (a === 'go' && fg && rideable(fg)) startGoing(fg);
    else if (a === 'hide' && fg) { full.askedFor = null; onFullscreen({ ...fg, full: true, shell: false }); }
    else if (a === 'summary') onSummary({ tasks: 14, sessions: 4, workMs: 7800000, commits: 3, pushes: 1, testsPass: 5, testsFail: 1, musicMin: 45, songs: ['a', 'b'] });
    else if (a === 'back') { away.on = true; away.since = Date.now() - 23 * 60000; away.tasks = 2; backNow(); }
    else if (a === 'photo') { lastPhoto = 0; onPhoto(); }
    else if (a === 'costume') costumeOverride = b || null;
    else if (a === 'dev') onDev({ dev: b });
    else if (a === 'bat') { bat.said20 = bat.said10 = false; onBat({ has: true, ac: false, pct: Number(b) || 15 }); }
    else if (a === 'charge') onBat({ has: true, ac: true, pct: 50 });
    else if (a === 'mode' && fg) { appMode.lastAsk = 0; appMode.later = {}; const k = categorize(fg); if (k) { delete prefs.appModes[BROWSER.test(fg.app) ? `${fg.app}:${k}` : fg.app]; } onAppChange(fg); }
    else if (a === 'wear') appMode.cur = { cat: b, key: '__test' }, prefs.appModes.__test = true;
    else if (a === 'type') { typing.streak = 3; typing.last = Date.now(); }
    else if (a === 'sess') window.clawd.openSessions(b ? decodeURIComponent(b) : null);
    else if (a === 'night') nightOverride = b === 'off' ? false : b === 'auto' ? null : true;
  }
  function maybeAskRideForced(f) {
    if (!rideable(f)) { Speech.say(`No me puedo subir a ${appName(f.app)}: necesito una ventana sin maximizar y con sitio encima`, 2); return; }
    const saveFree = lastBase; lastBase = 'idle';
    maybeAskRide(f);
    lastBase = saveFree;
  }

  return {
    frame, setPrefs, onDev, onSummary, preview,
    onDragged: () => { if (ride.mode !== 'off') stopRide(); },
    onTaskDone: n => { if (away.on) away.tasks += n || 1; },
    onDone: () => {},
  };
})();

// app.js los busca en window
window.Sound = Sound;
window.Extras = Extras;
