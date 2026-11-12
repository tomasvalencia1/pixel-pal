// Ediciones de Pixel Pal: el mismo código sirve para la copia personal y para la versión que se comparte.
//   PAL_EDITION=personal → el Pal naranja de siempre: datos en ~/.clawd, puerto 7777 y hooks de Node propios
//   cualquier otro valor  → la versión para compartir: verde azulado con antena, ~/.clawd-flotante, puerto 7778
// Cada edición tiene su carpeta, su puerto y su clave, así que pueden estar instaladas a la vez sin pisarse.
const os = require('os');
const path = require('path');

const name = process.env.PAL_EDITION === 'personal' ? 'personal' : 'shared';
process.env.PAL_EDITION = name; // lo leen hooks.js y catalog.js

// Colores del icono de la bandeja (orden BGR)
const K = [0x17, 0x1A, 0x1F];
const EDITIONS = {
  personal: {
    name,
    dataDir: path.join(os.homedir(), '.clawd'),
    port: 7777,
    appId: 'com.clawd.flotante',
    ownUserData: false,     // usa la carpeta de Electron de siempre (conserva la clave de Haiku cifrada, etc.)
    autoTutorial: false,
    legacyHooks: true,      // reconoce los hooks de Node (hooks/clawd-hook.js) como propios
    tray: { colors: { O: [0x57, 0x77, 0xD9], S: [0x3E, 0x5C, 0xB8], K }, antenna: false },
  },
  shared: {
    name,
    dataDir: path.join(os.homedir(), '.clawd-flotante'),
    port: 7778,
    appId: 'com.clawd.flotante.compartido',
    ownUserData: true,
    autoTutorial: true,
    legacyHooks: false,
    tray: { colors: { O: [0xA5, 0xB3, 0x4F], S: [0x80, 0x8C, 0x3A], K, Y: [0x4E, 0xC1, 0xF2] }, antenna: true },
  },
};

module.exports = EDITIONS[name];
