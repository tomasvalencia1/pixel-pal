// Frases de Pal. {project}, {file}, {tool}, {n}, {done}, {total} se rellenan solas.
// Si a una frase le falta un dato (por ejemplo, no hay {file}), se elige otra que no lo necesite.
const PHRASES = {
  hello: ['¡Hola! ¿En qué trabajamos hoy?', '¡Nueva sesión en {project}! 👋', 'Aquí estoy, listo para {project}', '¡Ey! Otra aventura: {project}', '¿Qué construimos hoy?'],
  helloMorning: ['¡Buenos días! ☀️ ¿Empezamos con {project}?', 'Buenos días. Café y {project} ☕', '¡Buen día! Hoy toca {project}'],
  helloAfternoon: ['¡Buenas tardes! Vamos con {project}', 'Tarde productiva en {project} 💪'],
  helloNight: ['Trabajando de noche, ¿eh? 🌙', 'Noche de código en {project} 🌙', 'A estas horas… ¡vamos con todo! 🦉'],

  thinking: ['Mmm, déjame pensarlo…', 'Vale, entendido 👍', 'Interesante… 🤔', 'Dame un segundo', 'Ok, a ver cómo lo hago', 'Me pongo con eso', 'Buena pregunta…'],

  editing: ['Manos a la obra ✍️', 'Retocando {file}…', 'Escribiendo en {file}', 'Esto va a quedar bonito ✨', 'Un par de cambios en {file}', 'Tecleando a toda velocidad ⌨️'],
  reading: ['A ver qué tenemos aquí… 📖', 'Leyendo {file}', 'Déjame echar un ojo a {file}', 'Mmm, {file}… interesante', 'Primero entender, luego tocar'],
  searching: ['¿Dónde estará…? 🔍', 'Buscando pistas', 'Rastreando el código', 'Sé que está por aquí…', 'Modo detective 🕵️'],
  terminal: ['Hora de la terminal ⚡', 'Ejecutando… crucemos las pinzas 🤞', 'A ver qué dice la consola', 'Lanzando el comando', 'Que no salga rojo, que no salga rojo…'],
  web: ['Voy a buscarlo en internet 🌐', 'Investigando un poco', 'Consultando la web', 'Dando una vuelta por internet'],
  agent: ['Llamando refuerzos 🤖', 'Le paso esto al equipo', '¡Mini Pals, a trabajar!', 'Divide y vencerás'],
  planning: ['Primero, un buen plan 📋', 'Organizándome…', 'Paso a paso', 'Apuntando pendientes'],
  tinkering: ['Usando {tool} ⚙️', 'Probemos {tool}', 'Una herramienta especial: {tool}'],

  planNew: ['Plan de {total} pasos. ¡Vamos! 💪', 'Tengo {total} tareas por delante', 'Hoja de ruta: {total} pasos'],
  taskDone: ['¡Una menos! ✅', 'Tachado ✔️', '{done}/{total} listo', 'Eso ya está 👌', 'Siguiente…', '¡Bien! {done} de {total}'],
  allDone: ['¡Todas las tareas listas! 🎉', '¡{total}/{total}! Plan completo', 'Plan terminado, ¡qué gusto!'],

  waiting: ['¿Me das permiso para usar {tool}? 🙏', 'Psst… necesito tu OK para {tool}', '¿Puedo usar {tool}? 👀'],
  waitingGeneric: ['Psst… te necesito 👀', 'Esperando tu visto bueno', 'Necesito tu respuesta un momento 🙏'],
  waitingAgain: ['¿Sigues ahí? 🙂', 'Sigo esperando tu OK…', '*toc toc* 👀', 'Cuando puedas, ¿eh?'],

  done: ['¡Listo! ✨', 'Terminado en {project} 🎉', 'Hecho. ¿Qué sigue?', '¡Ya está!', 'Misión cumplida 🦀', 'Todo tuyo 👌'],
  doneLong: ['Uf, eso fue largo. ¡Pero listo! 😮‍💨', 'Me costó, pero ya está 💪', 'Trabajo duro terminado 🎉', '¡Por fin! Listo en {project}'],
  longWork: ['Esto lleva su tiempo, sigo en ello 💪', 'Sigo aquí, trabajando', 'Va bien encaminado', 'Casi… creo 😅', 'Paciencia, que está quedando bien'],

  multi: ['¡Malabares con {n} sesiones! 🤹', '{n} sesiones a la vez, ¡vamos!', 'Modo multitarea: {n} sesiones'],
  sleep: ['Me echo una siestita… 💤', 'Zzz… avísame si me necesitas', 'Voy a cerrar los ojos un rato'],
  shaken: ['🫨 ¡Vale, vale, ya estoy despierto! Aguanto 5 minutos', '¡Uy! Me has despertado del todo 👀 Cinco minutos sin dormir', '🫨 ¡Qué meneo! Prometo no dormirme en 5 minutos'],
  wake: ['¡Ah! Ya estoy despierto 👀', '¡Estoy aquí! ¿Qué pasó?', '*bostezo* ¡Vamos!'],
  idle: ['¿Algo más en lo que te ayude?', 'Estiro las pinzas un rato 🦀', 'Aquí sigo, por si acaso', 'Qué buen día para programar', '¿Un descanso? Te lo has ganado ☕'],
  drag: ['¡Wiii! 🎢', '¡Ey, que me mareo!', '¡Allá vamos!', '¡Uooo!'],
  juggle: ['¡Mira, sé hacer malabares! 🤹', 'Tres pelotas… ¿y si pruebo con cuatro?', 'Concentración máxima 🤹'],
  whistle: ['🎶 Fiu, fiu…', 'Silbando bajito para no molestar 🎵', '¿Adivinas qué canción es? 🎶'],
  petted: ['¡Ay, qué gustito! 💕', 'Más, más 🥰', 'Me encantan tus mimos', 'Prrr… 🦀💕', '¡Hoy es el mejor día! 💖'],
  petSleep: ['zzz… 💕', '(sonríe en sueños) 😊', 'mmm… cinco minutitos más… 💤💕'],
  thrown: ['¡Wiiiii! 🚀', '¡Que vuelooo!', '¡Aaaaah! 🌀', '¡Soy un avión! ✈️'],
  thrownLand: ['¡Diez de diez! 🤸', 'Aterrizaje perfecto 😎', '¡Otra, otra!', 'Y… ¡clavado!'],
  thrownDizzy: ['😵‍💫 Todo da vueltas…', 'Me mareé un poquito 🌀', '¿Dónde estoy? 😵', 'Creo que veo dos ratones 🐭🐭'],
  drop: ['Aquí se está bien', 'Bonita vista 😌', 'Me quedo aquí', 'Perfecto 👌'],
  poke: ['¡Jaja, cosquillas! 😄', '¿Me llamabas?', '¡Ey! 👋', 'Sigo aquí 🦀'],

  // juegos con el ratón
  chase: ['¡Voy por ti! 🏃', '¡Ese ratón es mío!', '¡Quieto ahí, cursor!', '¡Te voy a atrapar!'],
  chaseWin: ['¡Te atrapé! 😄', '¡Ja! ¡Pillado!', '¡Mío! 🦀'],
  chaseLose: ['Uf… eres muy rápido 😮‍💨', 'Me rindo… por ahora', 'Necesito más cardio'],
  flee: ['¡No me atrapas! 😆', '¡Huyan!', '¡Aaah, el cursor! 🏃'],
  fleeSafe: ['Uf, a salvo', 'Aquí no me encuentra 😏'],
  stroll: ['Voy a estirar las patas', 'Un paseíto…', 'A ver qué hay por aquí'],
  wave: ['¡Hola, ratoncito! 👋', '¡Ey, tú! 👋', '¡Te veo! 👋'],
  peek: ['¡Cucú! 🙈', '¡Aquí estoy!', '¡Bu! 😄'],
  highfive: ['¡Choca esos cinco! ✋ (pasa el ratón por encima)', '¿Chocamos? ✋'],
  highfiveYes: ['¡Eso! 🙌', '¡Buena esa!', '¡Somos un equipo! 🦀✋'],
  highfiveNo: ['Bueno… otro día 😔', 'Me quedé con la pinza arriba…'],
  beg: ['¿Me haces mimos? 🥺', 'Pasa el ratón por encima… porfa 🥺', 'Un mimito, ¿sí? 🥺'],
  begYes: ['¡Ronroneo de cangrejo! 💕', 'Aaaw, gracias 💕', '¡Qué gusto! 💕'],
  begNo: ['Vale… estaré aquí 😔', 'Será la próxima 🥲'],
  watch: ['Te estoy vigilando… 👀', 'Mmm… sospechoso 🤨', 'No te quito el ojo de encima'],
  hop: ['¡Boing! 🐸', '¡Saltito, saltito!', '¡Allá voy!'],
  dance: ['♪ ¡Hora de bailar! ♪', '¡Pasos prohibidos! 💃', '♪ Pinza a la izquierda, pinza a la derecha ♪'],
  kiss: ['Para ti 💌', '¡Te mando un corazón! 💕', 'Un besito 😘'],
  stretch: ['Mmmh… 🙆', 'Qué bien sienta estirarse', '*crac crac* ¡Mejor!'],
  // música
  songStart: ['🎵 ¡Uy, {song}! Temazo', '¿{by}? Buen gusto 😎', 'Esta me la sé: {song} 🎶', '¡Subiendo el volumen mentalmente! 🔊', '¡{song}! Mis pinzas ya se mueven solas 🦀', '{by}… esto pinta bien 🎧', 'Ok, {song} — modo baile activado 💃'],
  songStartAnon: ['🎵 ¡Música! Por fin', '¡Eso suena bien! 🎶', 'Mis pinzas ya se mueven solas 🦀', '🎧 Modo baile activado'],
  songChange: ['¡Siguiente! {song} 🎶', 'Cambio de canción: {song}', 'Ahora {by}, ¡me encanta!', '¡Esta también! 🎵'],
  songMid: ['♪ la la la ♪', 'Esta parte es la mejor 🎶', '{by} nunca falla', 'Mis pinzas no pueden parar 🦀💃', '¿Ponemos {song} en bucle?', 'Tarareando {song}…', 'Si me ves moverme raro, es culpa de {by}', '¡Qué ritmo! 🥁', '10/10 para {song} 🏆', 'Esto pide subir el volumen 🔊'],
  songWork: ['Programando al ritmo de {by} ⌨️🎶', 'Con {song} de fondo, el código sale solo', 'Tecleo al compás 🎹', 'Trabajar con música es otra cosa 🎧'],
  songStop: ['¿Eh? ¿Y la música? 🥺', 'Pausa musical… vale', 'Oye, ¡estaba bailando! 😅', 'Silencio… vuelvo a lo mío'],
  // canciones con baile propio (frases propias, sin citar letras)
  song_funk: ['🕶️ ¡Uptown Funk! Gafas de sol puestas', 'Este bajo es ilegal de bueno 🕺', 'Bruno Mars + Mark Ronson = peligro en la pista 😎'],
  mid_funk: ['Modo funk: imposible quedarse quieto 🕺', 'Pasito a la izquierda, pasito a la derecha 😎', 'Mis pinzas están demasiado calientes 🔥', 'Pose congelada… ¡y seguimos!'],
  song_bass: ['🎸 ¡Ese bajo! Queen en la casa', 'Saco el bajo para esta 🎸', 'Freddie estaría orgulloso de mis pinzas'],
  mid_bass: ['Pum, pum, pum… 🎸', 'Ese riff es historia de la música', 'Levantando polvo con cada pisotón 💨', 'Bajista oficial de Pal Records 🎸'],
  song_gold: ['✨ ¡24K Magic! Saco las joyas', 'Modo oro activado 💰', 'Bruno Mars… tienes buen gusto 😎'],
  mid_gold: ['Brillando más que el oro ✨', 'Lluvia de monedas para todos 💰', 'Fiesta de lujo en tu escritorio 🥂', 'Bruno Mars sabe brillar 👑'],
  song_two: ['✌️ ¡two de bbno$! Bailo por dos', '¡bbno$! Traje a mi gemelo para esta ✌️', '¿two? Entonces somos dos 🦀🦀'],
  mid_two: ['Uno, dos… ¡dos! ✌️', 'Mi mini yo también se la sabe', 'bbno$ siempre sube el ánimo 🎉', 'Doble saltito, doble diversión'],
  song_angine: ['🎭 ¡Angine de Poitrine! Máscara y lunares puestos', 'Rock alienígena de Quebec… mis pinzas no entienden el compás 👽', 'Doble mástil activado 🎸🎸'],
  mid_angine: ['¿En qué compás vamos? 🤯', 'Lunares, máscara y nariz larga: listo', 'Loop… loop… loop… 🔁', 'Esto suena a otro planeta 👽', 'Tres, tres, dos… ¡otra vez! 🥁'],
  song_imight: ['🕺 ¡I Just Might! Traje verde y aura al máximo', 'Bruno tiene su banda de clones… ¡y yo la mía!', 'Modo aura dorada activado ✨'],
  mid_imight: ['Mi banda de mini yo está que arde 🥁🎸', 'Guiño y chispa ✨😉', 'Retro, setentero y con estilo', 'Bruno Mars en modo leyenda 👑', '¿Ves esa chispa? ✨'],
  song_billie: ['✨ ¡Billie Jean! El suelo se ilumina', 'Michael Jackson… guante brillante listo 🧤', 'Cada paso enciende una baldosa 💡'],
  mid_billie: ['Las baldosas brillan a mi paso ✨', '¡Patada y vuelta! 🕺', 'El rey del pop, otra vez 👑', 'De puntillas… 😄'],
  song_dontstop: ['🎤 ¡Don\'t Stop Me Now! Bigote puesto', '¡Queen otra vez! Que nadie me pare 🏃💨', 'Modo Freddie activado 🎤✊'],
  mid_dontstop: ['¡No pienso parar! 🏃💨', 'Puño arriba ✊', 'Freddie estaría orgulloso de este bigote', 'Estrella fugaz a la vista 🌠', 'Queen sabe dar energía ⚡'],
  song_burger: ['🍔 ¡burger de bbno$! Ya me dio hambre', '¿bbno$ y una hamburguesa? Plan perfecto 🍔', 'Esta canción huele a papas fritas 🍟'],
  mid_burger: ['Ñam, ñam 🍔', 'Otra mordida… al ritmo', 'Esta ya es mi cuarta hamburguesa 😅', 'Con queso extra, por favor 🧀', 'bbno$ entiende de comida buena'],
  song_standing: ['⭐ ¡I\'m Still Standing! Gafas de estrella puestas', 'Elton John en la casa 🎹', 'Me tambaleo… ¡pero sigo de pie! 💪'],
  mid_standing: ['Casi me caigo… ¡pero no! 😎', 'Un clásico que no envejece', 'De pie y con estilo ⭐', 'Elton sabe de levantarse 💪'],
  song_chicago: ['🎩 ¡Chicago de Michael! Sombrero listo', 'Michael Jackson… hora del moonwalk 🕺', 'Un guante blanco y a deslizarse 🧤'],
  mid_chicago: ['Moonwalk activado 🌙🕺', 'Saludo con el sombrero para ti 🎩', '¡De puntillas! 👑', 'El rey del pop aprobaría esto 👑'],
  song_thatswhat: ['😎 ¡That\'s What I Like! Bruno otra vez', '¡Bruno Mars al mando, vamos!', 'Chasquidos listos 🫰'],
  mid_thatswhat: ['Chas, chas 🫰', 'Pasos suaves, muy suaves 😎', 'Garabatos por todos lados ✨', 'Bruno Mars nunca falla 👑'],
  danceOn: ['¡Bailaré con tu música! 💃', '¡A mover las pinzas! 🎶'],
  danceOff: ['Vale, nada de bailar 😔', 'Me quedo quieto aunque suene música'],
  // ventanas (1, 2, 3)
  askRide: ['¿Me subo a tu ventana de {app}? 🧗', '¿Puedo subirme encima de {app}? 🧗', '¿Te acompaño desde arriba de {app}? 🧗'],
  rideOn: ['¡Arriba! 🧗', '¡Qué vistas desde aquí!', 'Me quedo aquí arriba 😎', 'Cómodo, muy cómodo'],
  rideWobble: ['¡Ey, despacio! 😵', '¡Que me caigo!', '¡Uoo, terremoto!', '¡Cuidado con el conductor!'],
  rideFall: ['¡Aaaah! 😱', '¡Me caigo!', '¡Socorro!', '¡Me quitaron el suelo!'],
  rideLand: ['¡Uf! Aterrizaje forzoso', 'Estoy bien… creo 😵‍💫', '¡Ay! Nada roto', '¡Diez de diez en el aterrizaje!'],
  askMode: ['¿Me pongo en modo {mode} mientras usas {app}? {emoji}'],
  mode_music: ['🎧 ¡Cascos puestos!', 'Modo música activado 🎧'],
  mode_video: ['¿Qué vemos? 🍿', 'Gafas 3D listas 🍿'],
  mode_design: ['Modo artista 🎨', '¡A crear cosas bonitas! 🎨'],
  mode_office: ['Modo oficina 👔', 'Corbata puesta, ¡a trabajar! 👔'],
  mode_code: ['¡A programar! 👨‍💻', 'Gafas de programador activadas 🤓'],
  mode_game: ['¡Suerte en la partida! 🎮', 'Modo gamer activado 🎮'],
  mode_chat: ['Saluda de mi parte 👋', '¿Chismecito? 👀'],
  askHide: ['Pantalla completa en {app}. ¿Me escondo? 🙈', 'Veo pantalla completa. ¿Desaparezco un rato? 🙈'],
  fsBack: ['¡Ya volví! 👋', '¡Hola de nuevo!', '¿Qué tal estuvo? 🍿'],
  // tú (6, 8, 10)
  back: ['¡Volviste! Estuviste fuera {min} min 👋', '¡Hola otra vez! {min} min sin verte', '¡Ya estás aquí! Te eché de menos 🥺'],
  backWork: ['Mientras no estabas se completaron {n} tareas ✅'],
  backNews: ['¡Volviste! En estos {min} min pasó esto:', '¡Hola otra vez! Mientras no estabas ({min} min):', '¡Ya estás aquí! Te cuento lo que pasó:'],
  night: ['Ya son las 6:30… ¡gorrito de noche puesto! 🌙', 'Modo noche activado 🌙', 'Se hace de noche, ¿eh? 🌙'],
  typeAlong: ['¡Tecleamos juntos! ⌨️', 'Yo también escribo 🦀⌨️', '¡Qué rápido escribes!'],
  typeLong: ['Llevas un buen rato tecleando, ¿estiramos? 🙆', 'Tus dedos necesitan un descanso 😅'],
  // sistema (11, 13)
  batLow: ['Me quedo sin energía… 🔋 {pct}%', 'Batería al {pct}%, ¿me enchufas? 🥺'],
  batCrit: ['¡{pct}%! ¡Cargador, ya! 🪫', '¡Me apago! {pct}% 🪫'],
  batCharge: ['¡Comida! ⚡ Gracias', 'Ahh, energía ⚡', '¡Cargando pilas! 🔌'],
  photo: ['¡Patata! 📸', '¡Sonríe! 📸', '¡Salgo en la foto! 📸'],
  // Claude (15, 16, 17, 18)
  commit: ['¡Commit hecho! 📦', 'Guardado en la historia ✍️', '¡Otro commit al saco!'],
  push: ['¡Subido! 🚀', '¡Push enviado! 🚀', 'Al repositorio y más allá 🚀'],
  testPass: ['¡Tests en verde! ✅', 'Todo pasa, ¡qué gusto! 🟢', '¡Cero fallos! 🎯'],
  testFail: ['Uy… fallaron tests 😬', 'Algo se rompió 🔴', 'Tests en rojo, a arreglarlo 🛠️'],
  limit: ['Llegamos al límite de uso 😔', 'Me quedé sin fuerzas por ahora… 😔'],
  askDrop: ['¿Abro una sesión nueva con {file}? 📄', '¡Ñam, {file}! ¿Empiezo una sesión con él? 📄'],
  summary: ['¡Hasta luego! Así fue tu día:', 'Claude se cerró. Resumen de hoy:'],
  // disfraces (19)
  costume_santa: ['¡Feliz Navidad! 🎄', '¡Jo, jo, jo! 🎅'],
  costume_witch: ['¡Feliz Halloween! 🎃', '¿Truco o trato? 🎃'],
  costume_flowers: ['¡Feliz Día de Muertos! 🌼', 'Cempasúchil para todos 🌼'],
  costume_party: ['¡Feliz año nuevo! 🎉', '¡Que este año salga todo a la primera! 🎉'],
  sitOn: ['Vale, me quedo aquí 🪑', 'Sentadito y quieto 😇', 'Aquí me quedo'],
  sitOff: ['¡Libre otra vez! 🦀', '¡A jugar!', '¡Por fin puedo moverme!'],
};

// Edición personal: frases sobre tus canciones más escuchadas
if (typeof window !== 'undefined' && window.PAL_EDITION === 'personal') Object.assign(PHRASES, {
  song_gold: ['✨ ¡24K Magic! Saco las joyas', 'Modo oro activado 💰', 'Bruno Mars otra vez… tienes buen gusto 😎'],
  mid_gold: ['Brillando más que el oro ✨', 'Lluvia de monedas para todos 💰', 'Fiesta de lujo en tu escritorio 🥂', 'Tu artista más escuchado, por algo será 👑'],
  mid_imight: ['Mi banda de mini yo está que arde 🥁🎸', 'Guiño y chispa ✨😉', 'Retro, setentero y con estilo', 'Bruno Mars, tu artista número uno 👑', '¿Ves esa chispa? ✨'],
  song_thatswhat: ['😎 ¡That\'s What I Like! Bruno otra vez', 'Bruno Mars, tu artista favorito, ¡vamos!', 'Chasquidos listos 🫰'],
});

const Phrases = (() => {
  const last = {};
  function pick(key, vars = {}) {
    const list = (PHRASES[key] || []).filter(t => {
      const needed = t.match(/\{(\w+)\}/g) || [];
      return needed.every(m => vars[m.slice(1, -1)] !== undefined && vars[m.slice(1, -1)] !== '');
    });
    if (!list.length) return '';
    let options = list.filter(t => t !== last[key]);
    if (!options.length) options = list;
    const t = options[Math.floor(Math.random() * options.length)];
    last[key] = t;
    return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
  }
  return { pick };
})();
