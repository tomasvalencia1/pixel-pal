# Pixel Pal

Un Pal en pixel art que flota **siempre en primer plano** sobre el escritorio y muestra el estado
y el progreso de tareas de todas tus sesiones de Claude Code: la pestaña Code de la app de escritorio,
la terminal y los IDE.

> Proyecto independiente y no oficial, sin relación con Anthropic. Claude y Claude Code son marcas de Anthropic.
> Todos los sprites están dibujados en código.

**⬇️ Descarga el instalador para Windows en [itch.io](https://tomas-dev.itch.io/pixel-pal)** · 💡 [Sugiere una función](https://docs.google.com/forms/d/e/1FAIpQLScwqisVD56xnv6LsIlkoeaWs3bIc9qfKq-j2yYxf0gDp31MJw/viewform)

| Plataforma | Estado |
|---|---|
| 🪟 Windows 10 / 11 | ✅ Disponible |
| 🐧 Linux | 🔜 Próximamente |
| 🍎 macOS | 🔜 Próximamente |

> ⚠️ El instalador no está firmado digitalmente (el certificado cuesta dinero), así que Windows puede mostrar
> «Windows protegió tu PC». Pulsa **Más información → Ejecutar de todas formas**. Análisis en VirusTotal: 0/65.

## Uso

| Acción | Resultado |
|---|---|
| Pasar el ratón por encima de Pal | Muestra el panel de sesiones |
| Clic en Pal | Fija o suelta el panel 📌 |
| Arrastrar a Pal | Lo mueve (recuerda la posición) |
| Clic derecho | Menú: demo de animaciones, quitar sesiones terminadas, notificaciones, ocultar, salir |
| Botón **🙈 Ocultar** del panel | Esconde a Pal. Vuelve con **Ctrl+Alt+C** o con el icono de la bandeja |
| **Ctrl+Alt+C** (en cualquier app) | Muestra u oculta a Pal |
| Icono en la bandeja | Mostrar/ocultar, volver a la esquina, salir |

Las zonas transparentes de la ventana dejan pasar los clics a lo que haya debajo.

### Animaciones
Cada acción tiene su propia animación, con entrada y salida de los accesorios:

| Acción de Claude | Animación |
|---|---|
| Sin sesiones activas (3 min) | 😴 Duerme con gorro y Z flotando. Al despertar se estira y bosteza. |
| Hay sesiones sin trabajo | 🙂 Respira, parpadea y de vez en cuando saluda, mira alrededor, salta o se estira |
| Acabas de enviar un mensaje | 💭 Pinza en la barbilla y nube de pensamiento |
| Editar o escribir archivos | 💻 **Saca su laptop** (vista lateral, en el suelo), abre la pantalla y teclea; de vez en cuando se echa atrás a revisar |
| Leer archivos | 📖 Lee un libro, pasa páginas, asiente y a veces se sorprende |
| Buscar (Grep/Glob) | 🔍 Pasa una lupa que le agranda el ojo |
| Comandos (Bash/PowerShell) | ⚡ Terminal flotante con texto verde escribiéndose |
| Web o navegador | 🌐 Sostiene un globo terráqueo que gira, con un satélite |
| Agentes u otras sesiones | 🤖 Mini Pals desfilando |
| Planear tareas | 📋 Portapapeles marcando casillas con un lápiz |
| Otras herramientas | ⚙️ Gira un engranaje |
| Necesita tu permiso o respuesta | ❗ Salta, agita las pinzas y suda (también envía una notificación de Windows) |
| La sesión terminó | 🎉 Gorro de fiesta y confeti |
| Una tarea se completó | ✅ Aparece un check verde sobre su cabeza |
| Empieza una sesión nueva | 👋 Saluda y sale un corazón |

Además:
- Al pensar, a veces se le enciende una 💡; al dormir le sale una burbujita que crece y explota.
- Cuando está tranquilo, **sigue el cursor con la mirada** y sonríe si te acercas.
- Si lo arrastras, patalea y se ríe; si le haces clic, rebota.

### Juegos con tu ratón (cuando Claude no tiene nada que hacer)
Cada 12–25 s (o cada 1–2 min si está dormido) Pal hace algo al azar con tu cursor:

| Juego | Qué hace |
|---|---|
| Perseguir | Corre hacia tu cursor; si lo alcanza: "¡Te atrapé!" |
| Huir | Si el cursor está cerca, sale corriendo |
| Pasear | Da un paseíto a un lado |
| Saludar | Te saluda con la pinza |
| Cucú | Se tapa los ojos y aparece: "¡Cucú! 🙈" |
| Choca esos cinco | Levanta la pinza; pasa el ratón por encima para chocarla |
| Pedir mimos | Ojitos de cachorro; pasa el ratón por encima y salen corazones |
| Vigilar | Te sigue con cara de sospecha |
| Saltitos | Va dando saltos hacia tu cursor |
| Bailar | Baila con notas musicales |
| Lanzar corazón | Te manda un corazón volando |
| Estirarse | Se estira y bosteza |

Para probar uno: `curl -H "x-clawd-token: $(cat ~/.clawd-flotante/token)" "http://127.0.0.1:7778/preview?a=play:chase"` (o `flee`, `stroll`, `wave`,
`peekaboo`, `highfive`, `beg`, `watch`, `hop`, `dance`, `kiss`, `stretch`).

### 🪑 Quédate sentado
Al pasar el ratón por encima de Pal aparece el panel con el botón **🪑 Quédate sentado**.
Con él activo, Pal no juega ni se mueve solo: se sienta en un cojín donde lo dejes.
Lo puedes seguir arrastrando y se vuelve a sentar donde lo sueltes. Pulsa **🦀 Puedes moverte**
para que vuelva a jugar. Se recuerda entre reinicios (también está en el menú del clic derecho).

### 💃 Baila con tu música
Pal lee el panel multimedia de Windows (lo que aparece al subir el volumen) con
el vigilante compilado (`scripts/system-watch.exe`). Solo lee qué suena; no envía nada a ningún sitio.

- **Si Claude está trabajando,** sigue con su animación, pero en versión bailando: cabecea al
  ritmo, se balancea, marca el compás con una pata y le salen notas ♪. Cada animación tiene su
  variación: teclea al compás y levanta la pinza cada 4 tiempos, el libro se balancea, los mini
  Pals saltan a la vez, el engranaje gira a golpes, sueña con notas…
- **Si Claude está libre,** baila de verdad: 6 pasos (pinzas arriba, robot, saltos, palmas,
  paso lateral y la ola) que cambian cada 4 tiempos. Si está en modo sentado, baila sentado.
- **Frases sobre la canción:** al empezar ("¡Uy, Don't Stop Me Now! Temazo"), al cambiar, de vez
  en cuando mientras suena ("Queen nunca falla") y al parar ("¿Eh? ¿Y la música? 🥺").
- La canción aparece en el panel y en la leyenda.
- Botón **🎵** en el panel para activar o desactivar el baile (se recuerda).

**Tus favoritas tienen baile propio** (elegidas por tu historial de YouTube en Brave):

| Canción | Acción especial |
|---|---|
| Uptown Funk (Mark Ronson ft. Bruno Mars) | 🕶️ Gafas de sol, paso lateral con estilo, hombros, señala al cielo y pose congelada cada 8 tiempos |
| Another One Bites the Dust (Queen) | 🎸 Toca el bajo, cabecea y levanta polvo con cada pisotón |
| 24K Magic (Bruno Mars) | 💰 Cadena de oro, "levanta el techo" con las pinzas y lluvia de monedas |
| two (bbno$) | ✌️ Saltito doble, pinzas en V, un "2" gigante de colores y su mini gemelo bailando |
| Cualquier canción de Angine de Poitrine | 🎭🔺 Traje de lunares con un triángulo en el pecho, máscara alta triangular y nariz larguísima, guitarra de doble mástil con sacudidas en acentos irregulares (3+3+2), triángulos girando, pulso triangular en cada acento, anillos de loop y un mini batería enmascarado |
| I Just Might (Bruno Mars) | 🕺 Inspirado en su videoclip: traje verde setentero, aura dorada que late, su propia banda de mini Pals (batería y guitarra), deslizamiento con la mano en la solapa, giro y un guiño con chispa ✨ cada 8 tiempos |
| Billie Jean (Michael Jackson) | ✨ Baldosas del suelo que se iluminan al ritmo, guante brillante, patada y giro de puntillas |
| Don't Stop Me Now (Queen) | 🎤 Modo Freddie: bigote, medio pie de micro, corre sin parar con líneas de velocidad, puño en alto cada 8 tiempos y estrellas fugaces |
| burger (bbno$) | 🍔 Sostiene una hamburguesa cuyo pan salta al ritmo, le da un mordisco cada 8 tiempos (con migas) y salen mini hamburguesas flotando |
| I'm Still Standing (Elton John) | ⭐ Gafas de estrella rosas, marcha alegre, se tambalea… y se levanta orgulloso |
| Chicago (Michael Jackson) | 🎩 Fedora y guante blanco, moonwalk de lado a lado, de puntillas y saludo con el sombrero |
| That's What I Like (Bruno Mars) | 🫰 Pasos suaves, chasquidos con las pinzas, vueltas y garabatos blancos al ritmo |

**Mientras Claude trabaja**, cada animación tiene una variante de la canción que suena. Solo mueve
las pinzas que la animación deja libres, para no romper la laptop, el libro o el globo:
- 🕶️ Uptown Funk: gafas de sol con destello, hombros funky y señalar al cielo con la pinza libre.
- 🎸 Another One Bites the Dust: bajo colgado a la espalda, cabeceo, nubes de polvo en cada pisotón y "bajo de aire".
- 🕺 I Just Might: traje verde, aura dorada, el mini guitarrista al lado y guiño con chispa cada 8 tiempos.
- 🎭 Angine de Poitrine: máscara, lunares, nariz larga, triángulos girando con pulso en cada acento y anillos de loop.
- ✨ Billie Jean: baldosas iluminadas bajo sus pies, guante brillante y patada.
- 💰 24K Magic: cadena de oro, lluvia de monedas y levantar el techo.
- ✌️ two: un "2" sobre la cabeza, pinza en V y el mini gemelo al lado.
- 🍔 burger: mini hamburguesa en la pinza libre, mini hamburguesas flotando y migas.
- ⭐ I'm Still Standing: gafas de estrella, destellos y tambaleo con "¡sigo de pie!".
- 🎩 Chicago: fedora, guante blanco, deslizamiento tipo moonwalk y saludo con el sombrero.
- 🫰 That's What I Like: chasquidos con la pinza libre y garabatos al ritmo.
- 🎤 Don't Stop Me Now: bigote, patitas corriendo, puño en alto cada 8 tiempos y estrellas fugaces.

Para ver una combinación sin poner la canción: `/preview?a=song:funk` (fuerza la canción 20 s)
y después `/preview?a=editing`. Cada una tiene sus propias frases. Para ver el baile completo:
`curl -H "x-clawd-token: $(cat ~/.clawd-flotante/token)" "http://127.0.0.1:7778/preview?a=funk"` (o `bass`, `gold`, `two`, `burger`, `standing`, `chicago`, `thatswhat`, `dontstop`, `imight`, `billie`, `angine`).
Se añaden más en `SPECIAL_SONGS` (`renderer/app.js`).

**¿Música o vídeo?** Windows no los distingue. Por defecto baila con apps de música (Spotify,
Apple Music, Reproductor multimedia, Deezer, Tidal…) y, en el navegador, solo si parece música:
el título dice "Official Video/Audio", "Lyrics", "Letra", "feat.", "remix"…, o hay álbum, como
en YouTube Music. Con clic derecho → **Bailar también con vídeos**, baila con todo lo que suene.

### 🪟 Pal y Windows
Un vigilante compilado (`scripts/system-watch.exe`, sin PowerShell ni lectura del teclado) lee en local la ventana activa, la inactividad, la
intensidad de tecleo, la batería, el portapapeles, si la app de Claude está abierta y la música.
**No lee qué teclas pulsas** (solo si hay actividad de teclado) y no envía nada a ningún sitio.

| Qué | Cómo funciona |
|---|---|
| 🧗 **Subirse a ventanas** | Al cambiar a una ventana normal (sin maximizar y con sitio encima), Pal **pregunta** "¿Me subo a tu ventana de…?" (Sí / No / Siempre / Nunca). Si dices que sí, salta encima, pasea por el borde, se va con la ventana si la mueves (si la mueves rápido: "¡Ey, despacio! 😵") y se cae al suelo si la minimizas o cambias de ventana. |
| 🎧 **Modo por app** | La primera vez que usas una app **pregunta** si se pone en modo: cascos (Spotify), gafas 3D (YouTube, Netflix), boina (Figma, Photoshop), corbata (Excel, Word, Docs), gafas de programador (VS Code, terminal, GitHub), cascos gamer (Steam) o charla (WhatsApp, Discord). Recuerda tu respuesta por app; con "Ahora no" vuelve a preguntar en 30 min. |
| 🙈 **Pantalla completa** | **Pregunta** "¿Me escondo?" y vuelve al salir ("¡Ya volví! 👋"). |
| 👋 **¡Volviste!** | Tras 5 min sin tocar el PC se duerme; al volver te saluda, dice cuánto estuviste fuera y cuántas tareas se completaron mientras tanto. |
| 🌙 **Modo noche** | De 18:30 a 6:00 lleva gorrito de noche. |
| ⌨️ **Tecleo** | Si escribes mientras Claude está libre, saca la laptop y teclea contigo. Si llevas más de 20 min seguidos, te propone estirar. |
| 🔋 **Batería** | Al 20% se pone cansado, al 10% avisa en rojo, y al enchufar: "¡Comida! ⚡". |
| 📸 **Capturas** | Al hacer una captura (imagen nueva en el portapapeles) saca una cámara: "¡Patata!". |
| 📦 **Commits, push y tests** | Celebra los `git commit`, lanza un cohete con `git push`, se alegra si los tests pasan y se asusta si fallan. |
| 😔 **Límite de uso** | Si Claude se detiene por el límite (hook `StopFailure`), se pone triste y, si lo sabe, dice a qué hora vuelve. |
| 📄 **Soltar un archivo** | Suelta un archivo sobre Pal y **pregunta** si abrir una sesión nueva. Se abre la **ventana flotante de sesiones**, con las sesiones que están trabajando y el botón para abrir Claude con el mensaje del archivo ya copiado (pegas con Ctrl+V). Si tienes la CLI `claude`, también ofrece abrirla en Windows Terminal. También se abre con el botón 🗂 del panel. |
| 📊 **Resumen del día** | Al cerrar la app de Claude: tareas, sesiones, tiempo trabajando, commits, tests y música del día. |
| 🎅 **Disfraces** | Gorro de Papá Noel (1–26 dic), gorro de fiesta (31 dic–1 ene), bruja (24–31 oct) y flores de cempasúchil (1–2 nov). |
| 🔊 **Sonidos** | Sonidos sintetizados al hablar, completar tareas, terminar, avisos, capturas… Se apagan con el botón 🔊 del panel. |

En el clic derecho puedes cambiar lo que pregunta: **Subirse a ventanas** y **Pantalla completa**
(Preguntarme / Siempre / Nunca), y **Olvidar los modos por app**.

Para probar cada cosa: `curl -H "x-clawd-token: $(cat ~/.clawd-flotante/token)" "http://127.0.0.1:7778/preview?a=x:summary"` (también `x:back`, `x:photo`,
`x:dev:push`, `x:dev:testFail`, `x:dev:limit`, `x:bat:15`, `x:charge`, `x:costume:santa`, `x:night`,
`x:wear:code`, `x:ride`, `x:go`, `x:fall`, `x:hide`, `x:mode`, `x:sess`).

### 📊 Uso restante al terminar
Cuando se completa una tarea o una sesión termina, la burbuja muestra durante 8 s cuánto te queda
de la **sesión (5 h)** y de la **semana**, con barras y la hora a la que se reinicia cada una.

De dónde sale el dato: Claude Code solo da el uso del plan a la **línea de estado** (`statusLine`,
campo `rate_limits`, planes Pro/Max). `install-hooks` instala `hooks/clawd-statusline.js` como línea
de estado, salvo que ya tengas una propia, que no se toca. El script guarda el dato en `~/.clawd/usage.json`
y en la terminal muestra algo como `🦀 · sesión 77% libre · semana 59% libre`.

⚠️ La línea de estado está documentada para la terminal (CLI). No está documentado si la pestaña Code
de la app de escritorio la ejecuta. Si nunca ves el uso en la burbuja, abre una sesión con `claude`
en la terminal y el dato llegará. Mientras no haya dato, Pal simplemente no muestra la parte del uso.
Para ver cómo queda: `curl -H "x-clawd-token: $(cat ~/.clawd-flotante/token)" "http://127.0.0.1:7778/preview?a=usage"` (con datos de ejemplo si aún no hay reales).

### Número de sesiones
Ya no hay círculo rojo encima de Pal. Cuando hay más de una sesión activa, la leyenda
lo indica, por ejemplo "✏️ Escribiendo main.js · 2 sesiones".

### Burbujas de diálogo
Pal reacciona con frases a lo que pasa: cuando empieza una sesión (saluda según la hora),
cuando lee, edita, busca o ejecuta algo, cuando completa una tarea o todo el plan, cuando termina
(y si tardó mucho, lo comenta), cuando necesita tu permiso (y te lo recuerda si tardas),
cuando se duerme o se despierta, y cuando lo arrastras. Las frases están en `renderer/phrases.js`:
puedes cambiarlas o añadir las tuyas.

Para no ser pesado, las frases normales tienen una pausa mínima entre una y otra, y las importantes
(permisos, tareas completadas, final) tienen prioridad. Cuando no está hablando, aparece una leyenda
con lo que hace, por ejemplo "✏️ Escribiendo main.js".

### Se adapta al lugar de la pantalla
Si Pal está cerca del borde superior, el panel, la leyenda y las burbujas salen **hacia abajo**.
Si está cerca del borde izquierdo, salen **hacia la derecha**. Pal no se mueve al cambiar.
Para ver todas las animaciones seguidas: clic derecho → **Ver animaciones (demo)**.

Para probar una en concreto con la app abierta:
`curl -H "x-clawd-token: $(cat ~/.clawd-flotante/token)" "http://127.0.0.1:7778/preview?a=editing"`. Valores posibles: `idle`, `thinking`, `editing`,
`reading`, `searching`, `terminal`, `web`, `agent`, `planning`, `tinkering`, `waiting`,
`celebrate`, `sleeping`, `check`, `hello`, `poke`.

## Instalación

```bash
npm install
npm run install-hooks
```

`install-hooks` añade los hooks a `~/.claude/settings.json`, después de guardar una copia
`settings.json.bak-clawd-…`. Se puede ejecutar varias veces sin duplicar nada.

Pal **se abre solo** al empezar una sesión de Claude Code. También puedes abrirlo a mano:

```bash
npm start
```

## Desinstalar

```bash
npm run uninstall-hooks
```

Solo quita los hooks de Pal y deja el resto de tu configuración intacta.

## Avisos al móvil

Pal puede avisarte en el teléfono cuando Claude **termina**, **necesita tu permiso** o **se detiene** (error o límite de uso),
usando la app gratis [ntfy](https://ntfy.sh) (Android e iPhone, sin cuenta):

1. Clic derecho sobre Pal → **📱 Avisos al móvil…** y activa el interruptor.
2. Instala ntfy en el móvil y escanea el código QR (o suscríbete al canal que aparece).
3. Pulsa **Enviar prueba**.

Por defecto solo avisa si **no estás delante del PC** (3 min sin tocarlo o pantalla bloqueada). Si Claude termina mientras
estás y luego te vas sin responder, avisa al cumplirse esos minutos. Solo se envía el nombre del proyecto, el estado y el
número de tareas; nunca lo que escribes ni tu código. El canal es un nombre secreto aleatorio.

## Ediciones

El mismo código sirve para dos ediciones, que se eligen con la variable `PAL_EDITION` (ver `edition.js`):

| | Compartida (por defecto) | Personal (`PAL_EDITION=personal`) |
|---|---|---|
| Aspecto | Verde azulado con antena (el naranja es un personaje más) | Naranja (el verde azulado es un personaje más) |
| Datos | `~/.clawd-flotante` | `~/.clawd` |
| Puerto | 7778 | 7777 |
| Conexión con Claude Code | curl (desde Ajustes) | hooks de Node (`hooks/clawd-hook.js`) o curl |
| Tutorial al abrir por primera vez | Sí | No |

Cada edición solo toca **sus** comandos en `~/.claude/settings.json` (los reconoce por su clave secreta o su puerto),
así que las dos pueden estar instaladas a la vez sin pisarse.

## Cómo funciona

```
Claude Code ──hooks──▶ hooks/clawd-hook.js ──POST──▶ 127.0.0.1:7777 (main.js) ──IPC──▶ renderer/ (Pal + panel)
```

- **`hooks/clawd-hook.js`**: recibe cada evento por stdin, lo reduce a lo necesario y lo envía.
  Si la app no está abierta, guarda el evento en `~/.clawd/pending.jsonl` y abre la app
  (con `SessionStart` y `UserPromptSubmit`). Nunca imprime nada y siempre termina sin error.
- **`main.js`**: ventana transparente con `alwaysOnTop` a nivel `screen-saver`, que se reafirma cada 1,5 s.
  Es `focusable: false`, así que nunca le quita el foco a tu ventana. También guarda el estado de las
  sesiones y lee las tareas de `TodoWrite`, `TaskCreate`/`TaskUpdate` y del plan de la app de escritorio
  (`update_plan`/`wrap_up`).
- **`renderer/`**: sprite (`clawd.js`), panel (`panel.js`) y controlador (`app.js`).

### Archivos en `~/.clawd/`
- `state.json`: sesiones (sobreviven a un reinicio de la app; se borran tras 30 min sin actividad)
- `config.json`: posición y preferencias
- `events.log`: registro para depurar, solo si `"debugLog": true` (rota a los 2 MB)
- `token`: clave secreta compartida con el hook
- `stats.json`, `usage.json`, `track.txt`: estadísticas del día, uso del plan y ventana en la que está subido

## Seguridad y privacidad
- **Clave secreta:** Pal y el hook comparten una clave en `~/.clawd/token`, creada sola la
  primera vez. El servidor local (`127.0.0.1:7777`) rechaza cualquier petición sin esa clave y
  cualquier petición que venga de una página web, así que una web no puede hacer hablar a Pal
  ni inventar eventos. Solo `/ping` está abierto. Por eso los ejemplos de `curl` llevan
  `-H "x-clawd-token: …"`.
- **Tus mensajes no salen de Claude:** el hook no envía a Pal lo que escribes.
- **Sin registro:** `~/.clawd/events.log` está desactivado. Para depurar, añade `"debugLog": true`
  a `~/.clawd/config.json`.
- **Claves tapadas:** en la leyenda y el panel, lo que parece una clave o un token dentro de un
  comando se muestra como `•••`.
- **El vigilante de Windows** solo sabe si se pulsó alguna tecla, nunca cuál.

## Limitaciones
- Las sesiones en la nube y los chats normales de claude.ai no ejecutan hooks locales, así que no aparecen.
- El progreso X/Y solo aparece si Claude creó una lista de tareas en esa sesión.
- Los juegos en pantalla completa exclusiva pueden tapar cualquier ventana, también a Pal.
