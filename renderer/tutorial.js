// Tutorial de bienvenida: se abre solo la primera vez y se puede repetir desde Ajustes.
const $ = id => document.getElementById(id);
const canvas = $('sprite');
ClawdSprite.setup(canvas);

// Cada paso: título, contenido, animaciones que enseña Clawd a la izquierda y botones "probar" (Clawd las hace en tu escritorio)
const STEPS = [
  {
    title: '¡Hola! Soy Clawd 👋',
    anim: [['hello', 'Encantado'], ['idle', '']],
    html: `
      <p>Soy una mascota que vive en una esquina de tu pantalla, siempre por encima de las ventanas.</p>
      <p>Mi trabajo es enseñarte <b>qué está haciendo Claude Code</b> mientras tú haces otras cosas: si piensa, si escribe código, si necesita tu permiso o si ya terminó.</p>
      <p>Y cuando no hay trabajo… bailo, juego contigo y te hago compañía 🦀</p>
      <div class="tip">Este tutorial tarda un minuto. Puedes volver a verlo cuando quieras desde ⚙️ Ajustes.</div>`,
  },
  {
    title: 'Te enseño cómo va Claude Code',
    anim: [['thinking', 'Pensando'], ['editing', 'Editando código'], ['terminal', 'Usando la terminal'], ['searching', 'Buscando en el proyecto'], ['web', 'Mirando la web'], ['waiting', 'Necesita tu permiso'], ['celebrate', '¡Tarea terminada!']],
    html: `
      <p>Cada cosa que hace Claude tiene su animación (mira a la izquierda). Además:</p>
      <ul class="list">
        <li>Te aviso con un globo y un sonido cuando <b>Claude necesita tu permiso</b> o cuando <b>termina</b>.</li>
        <li>Si tienes las notificaciones activadas, también te llega un aviso de Windows.</li>
        <li>Con varias sesiones a la vez, te digo cuántas hay y en qué va cada una.</li>
        <li>Si Claude Code lo permite, te enseño cuánto te queda de <b>uso de la sesión y de la semana</b>.</li>
      </ul>
      <div class="tries">
        <button class="btn sm" data-try="thinking" type="button">Probar: pensar</button>
        <button class="btn sm" data-try="waiting" type="button">Probar: pedir permiso</button>
        <button class="btn sm" data-try="celebrate" type="button">Probar: celebrar</button>
      </div>`,
  },
  {
    title: 'Conéctame con Claude Code',
    anim: [['tinkering', 'Conectando cables…']],
    connect: true,
    html: `
      <p>Para saber lo que hace Claude Code necesito añadir unos pequeños avisos (<i>hooks</i>) a su configuración. No necesitas instalar nada más.</p>
      <div class="card">
        <div class="row">
          <div class="grow">
            <div><b>Claude Code</b> <span id="hooksPill" class="pill no">…</span></div>
            <div class="muted small" id="hooksInfo">Comprobando…</div>
          </div>
          <button class="btn primary" id="hooksBtn" type="button" disabled>Conectar</button>
        </div>
        <div class="msg" id="hooksMsg"></div>
      </div>
      <div class="tip">Es seguro: antes de cambiar nada guardo una copia de tu configuración, y solo toco lo mío. Puedes desconectarlo en Ajustes, y al desinstalar Clawd se quita solo.</div>`,
  },
  {
    title: 'Cómo usarme',
    anim: [['wave', 'Pasa el ratón por encima'], ['poke', 'Haz clic'], ['walk', 'Arrástrame']],
    html: `
      <div class="grid2">
        <div class="card"><b>🖱️ Pasa el ratón</b>Aparece el panel con tus sesiones, su progreso y los botones.</div>
        <div class="card"><b>👆 Haz clic</b>Fija el panel para que no se cierre. Otro clic lo suelta.</div>
        <div class="card"><b>✋ Arrástrame</b>Ponme donde quieras: me quedo ahí y me giro para que el panel quepa.</div>
        <div class="card"><b>📋 Clic derecho</b>Menú con todas las opciones: baile, sonidos, notificaciones…</div>
        <div class="card"><b>🙈 Ocultar</b><kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> me esconde y me vuelve a mostrar.</div>
        <div class="card"><b>🦀 Bandeja</b>Junto al reloj tienes mi icono: mostrar, ajustes, salir…</div>
      </div>
      <div class="tip">En el panel: 🪑 <b>Quédate sentado</b> para que me esté quieto, 🎵 baile, 🔊 sonido y 🗂 sesiones.</div>`,
  },
  {
    title: 'Bailo con tu música 🎵',
    anim: [['dance', 'Bailando'], ['funk', 'Baile especial'], ['dontstop', 'Baile especial'], ['billie', 'Baile especial']],
    groove: true,
    html: `
      <p>Cuando suena música en tu PC (Spotify, YouTube, el navegador…) y Claude no me necesita, <b>me pongo a bailar</b> al ritmo.</p>
      <p>Algunas canciones tienen <b>su propio baile</b> con disfraz, por ejemplo: <i>Uptown Funk</i>, <i>Billie Jean</i>, <i>Don't Stop Me Now</i>, <i>24K Magic</i>, <i>Another One Bites the Dust</i> o <i>I'm Still Standing</i>. ¡Y siguen notándose mientras trabajo!</p>
      <div class="tries">
        <button class="btn sm" data-try="song:funk" type="button">Probar un baile especial</button>
        <button class="btn sm" data-try="song:billie" type="button">Probar otro</button>
      </div>
      <div class="tip">Si no quieres que baile, desactiva 🎵 Baile en el panel. Con "Bailar también con vídeos" (clic derecho) bailo con cualquier vídeo.</div>`,
  },
  {
    title: 'Vivo en tu escritorio',
    anim: [['sit', 'Sentado en una ventana'], ['photo', '¡Foto!'], ['stretch', 'Estirándome'], ['sleeping', 'Durmiendo']],
    html: `
      <div class="grid2">
        <div class="card"><b>🪟 Me subo a ventanas</b>A veces me siento encima de la ventana que usas (te pregunto antes).</div>
        <div class="card"><b>🎬 Pantalla completa</b>Si ves una película o juegas, me escondo para no molestar.</div>
        <div class="card"><b>⌨️ Escribo contigo</b>Cuando tecleas rápido, yo también tecleo.</div>
        <div class="card"><b>📸 Capturas</b>Si haces una captura de pantalla, poso para la foto.</div>
        <div class="card"><b>🔋 Batería</b>En portátiles te aviso si queda poca batería.</div>
        <div class="card"><b>👕 Disfraces</b>Me visto según la app que uses (te pregunto la primera vez).</div>
        <div class="card"><b>😴 Ausencia</b>Si te vas, me duermo; al volver te cuento qué terminó Claude.</div>
        <div class="card"><b>📊 Resumen del día</b>Tareas, sesiones, commits y música de la jornada.</div>
      </div>
      <div class="tries">
        <button class="btn sm" data-try="x:summary" type="button">Probar: resumen del día</button>
        <button class="btn sm" data-try="x:photo" type="button">Probar: foto</button>
        <button class="btn sm" data-try="play:chase" type="button">Probar: jugar</button>
      </div>`,
  },
  {
    title: 'Suéltame archivos encima 📁',
    anim: [['reading', 'Leyendo tu archivo'], ['check', '¡Hecho!']],
    html: `
      <p>Arrastra un archivo y suéltalo sobre mí: se abre una ventanita con tus sesiones activas de Claude y opciones para <b>mandarle el archivo a Claude</b> o copiar su ruta.</p>
      <p>Cuando estoy libre también <b>juego contigo</b>: a veces te persigo el cursor, huyo de él o te saludo. Si me haces caso, me pongo contento 💕</p>
      <div class="tries">
        <button class="btn sm" data-try="x:sess" type="button">Abrir la ventana de sesiones</button>
        <button class="btn sm" data-try="play:wave" type="button">Probar: saludar</button>
      </div>`,
  },
  {
    title: 'Te ayudo a concentrarte 🍅',
    anim: [['sit', 'Modo enfoque'], ['stretch', 'Descanso'], ['celebrate', '¡Subí de nivel!']],
    html: `
      <div class="grid2">
        <div class="card"><b>🍅 Modo enfoque</b>Botón «Enfoque» del panel: 25 min de trabajo y 5 de descanso. Me pongo la cinta y me concentro contigo.</div>
        <div class="card"><b>🧘 Descansos y agua</b>Si llevas mucho rato seguido, te recuerdo beber agua, estirarte o descansar la vista.</div>
        <div class="card"><b>⭐ Niveles y rachas</b>Gano experiencia con cada tarea de Claude, cada pomodoro y cada descanso. Llevo tu racha de días.</div>
        <div class="card"><b>🏅 Logros</b>16 logros por desbloquear. Pulsa la barra de nivel del panel para verlos.</div>
        <div class="card"><b>⏰ Recordatorios</b>Botón «Recordar»: escribe una nota y elige 10 min, 30 min o 1 hora.</div>
        <div class="card"><b>⏱ A tu gusto</b>Cambia la duración del pomodoro y de los avisos en el clic derecho → Tiempos, o dímelo: «pomodoros de 50 minutos».</div>
        <div class="card"><b>💛 Mi ánimo</b>Me pongo contento si me haces caso, trabajas y descansas. Si me ignoras mucho rato… me pongo tristón 🥺</div>
      </div>
      <div class="tries">
        <button class="btn sm" data-try="b:pomo" type="button">Probar: modo enfoque</button>
        <button class="btn sm" data-try="b:ach" type="button">Ver logros</button>
      </div>`,
  },
  {
    title: 'Háblame 💬',
    anim: [['wave', 'Te escucho'], ['thinking', 'Pensando…'], ['check', '¡Apuntado!']],
    html: `
      <p>Pulsa <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Espacio</kbd> (o «💬 Hablar» en el panel) y escríbeme, o pulsa 🎤 y dímelo en voz alta.</p>
      <div class="grid2">
        <div class="card"><b>⏰ Recordatorios</b>«Recuérdame llamar a mamá en 10 minutos», «avísame a las 5 de la tarde», «todos los días a las 9 recuérdame la pastilla».</div>
        <div class="card"><b>📝 Notas y 📅 tu día</b>«Apunta que hay que comprar leche», «mis notas», «¿qué tengo hoy?». Por la mañana te saludo con tu agenda y por la tarde te hago un resumen.</div>
        <div class="card"><b>🍅 Enfoque</b>«Empieza un pomodoro», «para el pomodoro».</div>
        <div class="card"><b>🛍️ Ropa y personaje</b>«Ponte la gorra», «quítate todo», «conviértete en dragón».</div>
        <div class="card"><b>👀 Claude Code</b>«¿Cómo va Claude?», «¿qué nivel tengo?», «¿qué suena?»</div>
      </div>
      <div class="tip">Todo eso funciona sin internet y gratis. Si además pones una clave de Anthropic en «🧠 Cerebro de Haiku» (clic derecho), puedo charlar de cualquier cosa.</div>
      <div class="tries">
        <button class="btn sm" data-try="t:recuerdame-estirarme-en-1-minuto" type="button">Probar: recordatorio en 1 min</button>
      </div>`,
  },
  {
    title: 'Elige tu personaje 🛍️',
    anim: [['wave', 'Clawd', 'clawd'], ['wave', 'Bolt, el robot', 'bolt'], ['wave', 'Miso, el gatito', 'miso'], ['wave', 'Nube, el fantasma', 'nube'], ['wave', 'Rin, la rana', 'rin'], ['wave', 'Chispa, el dragón', 'chispa']],
    html: `
      <p>En la <b>🛍️ Tienda</b> (panel, clic derecho o bandeja) puedes cambiar de personaje: <b>Clawd</b>, <b>Bolt</b> 🤖, <b>Miso</b> 🐱, <b>Nube</b> 👻, <b>Rin</b> 🐸 y <b>Chispa</b> 🐉. Todos hacen todas las animaciones y tienen su propia personalidad.</p>
      <p>También hay <b>sombreros, gafas y cosas para el cuello</b>, todo gratis. Algunos sombreros especiales se desbloquean subiendo de nivel.</p>
      <div class="tip">🥚 Pista: cada personaje esconde sorpresas. Prueba a tocarlo <b>5 veces seguidas</b>… y atento a ciertas horas del día.</div>
      <div class="tries">
        <button class="btn sm" data-try="b:hat" type="button">Abrir la tienda</button>
      </div>`,
  },
  {
    title: '¡Todo listo! 🎉',
    anim: [['celebrate', '¡Bienvenido!'], ['love', '']],
    finish: true,
    html: `
      <div class="card">
        <div class="row">
          <div class="grow">
            <div><b>Arrancar con Windows</b></div>
            <div class="muted small">Así siempre estoy contigo al encender el PC.</div>
          </div>
          <label class="switch"><input type="checkbox" id="autostart"><span></span></label>
        </div>
      </div>
      <div class="card small" id="summary"></div>
      <p class="muted small">Puedes cambiar todo esto cuando quieras desde ⚙️ Ajustes (en el panel, en el clic derecho o en el icono de la bandeja).</p>`,
  },
];

let step = 0;
let status = null;
let animIdx = 0;
let animAt = 0;

// ---------- Clawd de la izquierda ----------
function frame(ms) {
  const t = ms / 1000;
  const s = STEPS[step];
  if (t - animAt > (s.anim[0][2] ? 2.2 : 3.2) && s.anim.length > 1) { animIdx = (animIdx + 1) % s.anim.length; animAt = t; }
  const [action, label, skinId] = s.anim[animIdx % s.anim.length];
  ClawdSprite.setSkin(window.Skins && skinId ? Skins.get(skinId) : null);
  ClawdSprite.draw(null, t, action, { groove: s.groove ? { bpm: 112 } : null });
  $('label').textContent = label;
  requestAnimationFrame(frame);
}

// ---------- pasos ----------
function render() {
  const s = STEPS[step];
  $('content').innerHTML = `<h2>${s.title}</h2>${s.html}`;
  animIdx = 0;
  animAt = performance.now() / 1000;
  $('prev').style.visibility = step === 0 ? 'hidden' : 'visible';
  $('next').textContent = s.finish ? '¡Empezar! 🦀' : 'Siguiente →';
  $('dots').innerHTML = STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}" data-i="${i}" title="Paso ${i + 1}"></i>`).join('');
  document.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => {
    window.ui.preview(b.dataset.try);
  }));
  if (s.connect) renderHooks();
  if (s.finish) renderFinish();
  document.querySelector('main').scrollTop = 0;
}

function go(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  render();
}

function renderHooks(msg, kind) {
  const pill = $('hooksPill'), info = $('hooksInfo'), btn = $('hooksBtn');
  if (!pill || !status) return;
  const h = status.hooks || {};
  btn.disabled = false;
  if (h.error) {
    pill.className = 'pill err'; pill.textContent = 'Error';
    info.textContent = h.error;
    btn.textContent = 'Reintentar';
  } else if (h.installed) {
    pill.className = 'pill ok'; pill.textContent = 'Conectado ✓';
    info.textContent = 'Listo. Las sesiones nuevas de Claude Code aparecerán en Clawd.';
    btn.textContent = 'Conectado'; btn.disabled = true;
  } else {
    pill.className = h.found ? 'pill no' : 'pill warn';
    pill.textContent = h.found ? 'Sin conectar' : 'No encontrado';
    info.textContent = h.found
      ? 'He encontrado Claude Code en este PC.'
      : 'No encontré Claude Code. Puedes conectarlo igualmente y funcionará cuando lo instales.';
    btn.textContent = 'Conectar';
  }
  if (msg !== undefined) { const m = $('hooksMsg'); m.textContent = msg; m.className = `msg ${kind || ''}`; }
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await window.ui.installHooks();
      if (!r.ok) { renderHooks(r.error || 'Algo salió mal.', 'err'); return; }
      status = r.status;
      renderHooks('¡Conectado! Si ya tenías Claude Code abierto, ciérralo y ábrelo otra vez para que me vea.', 'ok');
      window.ui.preview('celebrate');
    } catch (e) { renderHooks(e.message, 'err'); }
  };
}

function renderFinish() {
  const sw = $('autostart');
  sw.checked = status ? !!status.autostart : true;
  sw.onchange = async () => {
    try { status = await window.ui.setAutostart(sw.checked); } catch { sw.checked = !sw.checked; }
  };
  const h = (status && status.hooks) || {};
  $('summary').innerHTML = h.installed
    ? '✅ Conectado con Claude Code. ¡Abre una sesión y mírame trabajar!'
    : '⚠️ Aún no estoy conectado con Claude Code. Puedes hacerlo luego en ⚙️ Ajustes → Conectar.';
}

$('prev').addEventListener('click', () => go(step - 1));
$('next').addEventListener('click', async () => {
  if (!STEPS[step].finish) return go(step + 1);
  $('next').disabled = true;
  try { await window.ui.finishTutorial(); } catch { $('next').disabled = false; }
});
$('dots').addEventListener('click', e => { const i = e.target.dataset && e.target.dataset.i; if (i != null) go(Number(i)); });
$('close').addEventListener('click', () => window.ui.finishTutorial());
document.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('button, input')) return;
  if (e.key === 'ArrowRight') go(step + 1);
  else if (e.key === 'ArrowLeft') go(step - 1);
});

(async () => {
  try { status = await window.ui.status(); } catch { status = null; }
  // La primera vez, el arranque con Windows viene activado
  if (status && !status.onboarded && !status.autostart) {
    try { status = await window.ui.setAutostart(true); } catch { /* nada */ }
  }
  render();
  requestAnimationFrame(frame);
})();
