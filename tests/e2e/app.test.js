// Prueba de extremo a extremo: abre cada edición de verdad (Electron), aislada en una carpeta temporal,
// con su propio puerto y un settings.json falso. Nunca toca tus datos ni tu configuración de Claude Code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');
const { curlCommand, EVENTS } = require('../../hooks');

const ROOT = path.join(__dirname, '..', '..');
const TOKEN = 'e2e-token-0123456789abcdef';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch { /* reintenta */ } await wait(step); }
  return last;
}

async function launch(edition) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `pal-e2e-${edition}-`));
  const port = 17000 + Math.floor(Math.random() * 2000);
  fs.writeFileSync(path.join(home, 'token'), TOKEN);
  // ntfy falso: recoge lo que Pal enviaría al móvil
  const ntfy = [];
  const ntfyServer = require('http').createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { ntfy.push(JSON.parse(b)); } catch { /* nada */ } res.end('{}'); }); });
  await new Promise(r => ntfyServer.listen(0, '127.0.0.1', r));
  // sin sonidos; avisos al móvil siempre, al servidor falso
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ sound: false, phone: { on: true, provider: 'ntfy', mode: 'always', server: `http://127.0.0.1:${ntfyServer.address().port}` } }));
  const settings = path.join(home, 'claude-settings.json');
  const legacy = '"C:/node.exe" "C:/x/hooks/clawd-hook.js"';
  const oldShared = curlCommand(7777, TOKEN, 'event');   // conexión antigua de la compartida (puerto viejo)
  // todos los eventos con la conexión vieja; SessionStart además con un hook de Node y uno del usuario
  const hooks = Object.fromEntries(EVENTS.map(([e]) => [e, [{ hooks: [{ type: 'command', command: oldShared }] }]]));
  hooks.SessionStart.unshift({ hooks: [{ type: 'command', command: legacy }] }, { hooks: [{ type: 'command', command: 'echo del-usuario' }] });
  fs.writeFileSync(settings, JSON.stringify({ hooks }, null, 2));

  const env = { ...process.env, CLAWD_HOME: home, CLAWD_PORT: String(port), CLAWD_CLAUDE_SETTINGS: settings };
  if (edition === 'personal') env.PAL_EDITION = 'personal'; else delete env.PAL_EDITION;
  const app = await electron.launch({ executablePath: require('electron'), args: [ROOT], env });
  const errors = [];
  const watch = p => {
    p.on('pageerror', e => errors.push(`${p.url().split('/').pop()}: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') errors.push(`${p.url().split('/').pop()}: ${m.text()}`); });
  };
  app.windows().forEach(watch);
  app.on('window', watch);
  const page = await until(() => app.windows().find(w => w.url().endsWith('index.html')), 15000);
  assert.ok(page, 'se abre la ventana de Pal');
  await page.waitForFunction(() => window.Characters && window.Talk && window.Boost, null, { timeout: 15000 });
  const http = (route, opts = {}) => fetch(`http://127.0.0.1:${port}${route}`, opts);
  const auth = (extra = {}) => ({ 'x-clawd-token': TOKEN, 'content-type': 'application/json', ...extra });
  return { app, page, home, port, settings, errors, http, auth, ntfy, ntfyServer };
}

for (const edition of ['shared', 'personal']) {
  test(`edición ${edition}`, { timeout: 90000 }, async t => {
    const P = await launch(edition);
    try {
      await t.test('se presenta con su edición, sus colores y su catálogo', async () => {
        const r = await P.page.evaluate(() => {
          const c = document.getElementById('clawd');
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let orange = 0, teal = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] === 0xD9 && d[i + 1] === 0x77 && d[i + 2] === 0x57) orange++;
            if (d[i] === 0x3F && d[i + 1] === 0xB8 && d[i + 2] === 0xA8) teal++;
          }
          return { ed: window.PAL_EDITION, orange, teal, skins: CATALOG.skins.map(s => s.id) };
        });
        assert.equal(r.ed, edition);
        if (edition === 'personal') { assert.ok(r.orange > 1000 && r.teal === 0); assert.ok(r.skins.includes('turquesa')); }
        else { assert.ok(r.teal > 1000 && r.orange === 0); assert.ok(r.skins.includes('naranja')); }
      });

      await t.test('el servidor local exige la clave y rechaza páginas web', async () => {
        assert.equal((await P.http('/ping')).status, 200);
        assert.equal((await P.http('/state')).status, 403);
        assert.equal((await P.http('/state', { headers: P.auth({ origin: 'https://malo.example' }) })).status, 403);
        assert.equal((await P.http('/state', { headers: P.auth() })).status, 200);
      });

      await t.test('los eventos de Claude Code crean y actualizan la sesión', async () => {
        const send = ev => P.http('/event', { method: 'POST', headers: P.auth(), body: JSON.stringify({ session_id: 'e2e-1', cwd: 'C:\\proyectos\\mi-app', ...ev }) });
        assert.equal((await send({ hook_event_name: 'SessionStart' })).status, 204);
        await send({ hook_event_name: 'UserPromptSubmit', prompt: 'hola' });
        await send({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\proyectos\\mi-app\\index.js' } });
        const s = await until(() => P.page.evaluate(() => state.sessions.find(x => x.id === 'e2e-1')));
        assert.ok(s, 'la sesión llega a la ventana');
        assert.equal(s.project, 'mi-app');
        await send({ hook_event_name: 'SessionEnd' });
        assert.ok(await until(() => P.page.evaluate(() => !state.sessions.some(x => x.id === 'e2e-1'))), 'y se va al cerrarla');
      });

      await t.test('📱 avisa al móvil cuando Claude termina', async () => {
        const send = ev => P.http('/event', { method: 'POST', headers: P.auth(), body: JSON.stringify({ session_id: 'e2e-phone', cwd: 'C:\proyectos\movil', ...ev }) });
        await send({ hook_event_name: 'UserPromptSubmit', prompt: 'texto privado' });
        await send({ hook_event_name: 'Stop' });
        const m = await until(() => P.ntfy.find(x => /movil: Claude terminó/.test(x.title)));
        assert.ok(m, 'llega el aviso');
        assert.match(m.topic, /^pixelpal-/);
        assert.doesNotMatch(JSON.stringify(m), /texto privado/);
      });

      await t.test('🪟 averigua la ventana de la sesión y el panel permite ir a ella', async () => {
        await P.http('/event', { method: 'POST', headers: P.auth(), body: JSON.stringify({ session_id: 'e2e-win', cwd: 'C:\proyectos\ventana', hook_event_name: 'SessionStart' }) });
        const s = await until(() => P.page.evaluate(() => state.sessions.find(x => x.id === 'e2e-win' && x.winCheckedAt)), 20000);   // con el PC muy cargado tarda más
        assert.ok(s, 'el vigilante respondió');
        // desde una terminal o desde la app de Claude hay ventana; en un entorno sin ventanas, no
        if (s.win) {
          assert.ok(Number(s.win.hwnd) > 0);
          assert.equal(typeof s.win.app, 'string');
          const html = await P.page.evaluate(() => document.querySelector('.card[data-id="e2e-win"]').outerHTML);
          assert.match(html, /class="card [^"]*jump/);
          assert.match(html, /app-chip/);
        }
        const r = await P.page.evaluate(() => window.clawd.focusSession('no-existe'));
        assert.deepEqual(r, { ok: false, reason: 'unknown' });
      });

      await t.test('✋ permiso: Pal pregunta, «Permitir» lo aprueba y si contestas en otra parte se retira', async () => {
        const body = JSON.stringify({ session_id: 'e2e-perm', cwd: 'C:\proyectos\permisos', tool_name: 'Bash', tool_input: { command: 'npm install' } });
        const ask = () => P.http('/permission', { method: 'POST', headers: P.auth(), body });
        const btn = () => P.page.waitForFunction(() => document.querySelector('#bubble .bubble-btn.primary'), null, { timeout: 6000 });
        // 1) Permitir desde Pal
        const r1 = ask();
        await btn();
        await new Promise(r => setTimeout(r, 1500));   // el bocadillo se escribe letra a letra
        assert.match(await P.page.evaluate(() => document.getElementById('bubble').textContent), /permisos quiere usar Bash: npm install/);
        await P.page.evaluate(() => document.querySelector('#bubble .bubble-btn.primary').click());
        const j = JSON.parse(await (await r1).text());
        assert.deepEqual(j, { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
        // 2) Denegar
        const r2 = ask();
        await btn();
        await P.page.evaluate(() => [...document.querySelectorAll('#bubble .bubble-btn')].find(b => /Denegar/.test(b.textContent)).click());
        assert.equal(JSON.parse(await (await r2).text()).hookSpecificOutput.decision.behavior, 'deny');
        // 3) contestaste en la terminal: llega otro evento de la sesión → Pal no decide y quita la pregunta
        const r3 = ask();
        await btn();
        await P.http('/event', { method: 'POST', headers: P.auth(), body: JSON.stringify({ session_id: 'e2e-perm', cwd: 'C:\proyectos\permisos', hook_event_name: 'PostToolUse', tool_name: 'Bash' }) });
        assert.equal(await (await r3).text(), '');
        assert.ok(await until(() => P.page.evaluate(() => document.getElementById('bubble').classList.contains('hidden'))), 'la pregunta desaparece');
      });

      await t.test('📋 al volver, cuenta qué pasó mientras no estabas', async () => {
        const ev = (id, cwd, b) => P.http('/event', { method: 'POST', headers: P.auth(), body: JSON.stringify({ session_id: id, cwd: 'C:/p/' + cwd, ...b }) });
        await ev('aw-1', 'informe', { hook_event_name: 'UserPromptSubmit' });
        await ev('aw-1', 'informe', { hook_event_name: 'Stop' });
        await ev('aw-2', 'servidor', { hook_event_name: 'UserPromptSubmit' });
        await ev('aw-2', 'servidor', { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
        await until(() => P.page.evaluate(() => state.sessions.some(s => s.id === 'aw-2' && s.status === 'waiting')));
        await until(() => P.page.evaluate(() => !Speech.speaking()), 15000, 200);   // que no haya otra burbuja
        await P.http('/preview?a=x:back', { headers: P.auth() });
        await new Promise(r => setTimeout(r, 2500));
        const txt = await P.page.evaluate(() => document.getElementById('bubble').textContent);
        assert.match(txt, /✋ servidor espera tu permiso/);
        assert.match(txt, /✅ informe terminó/);
        assert.ok(txt.indexOf('servidor') < txt.indexOf('informe'), 'lo urgente primero');
      });

      await t.test('🤾 lanzarlo: vuela, rebota y aterriza en el suelo de la pantalla', async () => {
        const before = (await (await P.http('/ping')).json()).bounds;
        assert.equal(await P.page.evaluate(() => Extras.throwPal(1800, -900)), true);
        assert.equal(await P.page.evaluate(() => Extras.flying()), true);
        assert.ok(await until(() => P.page.evaluate(() => !Extras.flying()), 12000, 100), 'aterriza');
        const after = (await (await P.http('/ping')).json()).bounds;
        assert.notDeepEqual(after, before, 'se movió');
        // en el suelo: los pies de Pal justo encima de la barra de tareas de su pantalla
        const floorOk = await P.app.evaluate(({ screen }, b) => {
          const d = screen.getDisplayMatching(b).workArea;
          return { bottom: d.y + d.height, winBottom: b.y + b.height };
        }, after);
        assert.ok(floorOk.winBottom >= floorOk.bottom - 40, JSON.stringify(floorOk));
      });

      await t.test('💕 acariciarlo con el ratón: corazones, beso y frase', async () => {
        await until(() => P.page.evaluate(() => !Speech.speaking()), 15000, 200);
        const r = await P.page.evaluate(() => {
          hoverClawd = true; awakeUntil = Date.now() + 60000;      // ratón encima y despierto
          for (const x of [100, 130, 100, 130, 100, 130, 100]) petTrack(x);
          return { kiss: pet.until > Date.now(), cool: pet.cool > Date.now() };
        });
        assert.deepEqual(r, { kiss: true, cool: true });
        await new Promise(r => setTimeout(r, 1500));
        assert.match(await P.page.evaluate(() => document.getElementById('bubble').textContent), /💕|🥰|💖|gustito|mimos/);
        // en el enfriamiento no se repite enseguida
        const again = await P.page.evaluate(() => { const c = pet.cool; for (const x of [100, 130, 100, 130, 100, 130]) petTrack(x); return pet.cool === c; });
        assert.equal(again, true);
        await P.page.evaluate(() => { hoverClawd = false; });
      });

      await t.test('uso del plan: /statusline (curl) y /usage (hooks de Node)', async () => {
        const r = await P.http('/statusline', { method: 'POST', headers: P.auth(), body: JSON.stringify({ rate_limits: { five_hour: { used_percentage: 40 }, seven_day: { used_percentage: 10 } } }) });
        assert.match(await r.text(), /sesión 60% libre · semana 90% libre/);
        const u = await P.http('/usage', { method: 'POST', headers: P.auth(), body: JSON.stringify({ five_hour: { used_percentage: 25 }, seven_day: { used_percentage: 5 }, at: Date.now() }) });
        assert.equal(u.status, 204);
        // espera a que llegue el 25 (antes estaba el 40 de /statusline)
        assert.equal(await until(() => P.page.evaluate(() => state.usage && state.usage.five_hour.used_percentage === 25 && 25)), 25);
      });

      await t.test('háblale: entiende un recordatorio sin internet', async () => {
        const n = await P.page.evaluate(() => {
          Boost.clearReminders();
          Talk.local('oye Pal, recuérdame en 10 minutos beber agua');
          return Boost.info().reminders;
        });
        assert.equal(n.length, 1);
        assert.match(n[0].text, /beber agua/i);
        assert.doesNotMatch(n[0].text, /oye/i);
        const mins = (n[0].at - Date.now()) / 60000;
        assert.ok(mins > 9 && mins <= 10.1, `en ~10 min (${mins.toFixed(2)})`);
      });

      await t.test('sacudirlo lo mantiene despierto 5 minutos', async () => {
        const r = await P.page.evaluate(() => { onShaken(); return { left: awakeUntil - Date.now(), action: desiredAction(Date.now()) }; });
        assert.ok(r.left > 4.9 * 60000 && r.left <= 5 * 60000);
        assert.notEqual(r.action, 'sleeping');
      });

      await t.test('cada edición solo toca sus hooks', async () => {
        const s = await until(() => {
          const j = JSON.parse(fs.readFileSync(P.settings, 'utf8'));
          const cmds = Object.values(j.hooks || {}).flat().flatMap(e => e.hooks).map(h => h.command);
          return edition === 'personal' || cmds.includes(curlCommand(P.port, TOKEN, 'event')) ? cmds : null;
        });
        assert.ok(s.includes('"C:/node.exe" "C:/x/hooks/clawd-hook.js"'), 'los hooks de Node siguen');
        assert.ok(s.includes('echo del-usuario'), 'los del usuario siguen');
        if (edition === 'shared') {
          assert.ok(!s.includes(curlCommand(7777, TOKEN, 'event')), 'la conexión vieja se reconectó al puerto nuevo');
          assert.equal(s.filter(c => c === curlCommand(P.port, TOKEN, 'event')).length, EVENTS.length);
        } else {
          assert.ok(s.includes(curlCommand(7777, TOKEN, 'event')), 'la personal (con hooks de Node) no reescribe nada');
        }
      });

      await t.test('tutorial automático solo en la compartida', async () => {
        const tut = await until(() => P.app.windows().find(w => w.url().endsWith('tutorial.html')), edition === 'shared' ? 8000 : 2500);
        if (edition === 'shared') {
          assert.ok(tut, 'se abre el tutorial');
          assert.equal(await tut.evaluate(() => window.PAL_EDITION), 'shared');
        } else assert.equal(tut, undefined);
      });

      await t.test('la tienda recibe la edición', async () => {
        await P.page.evaluate(() => window.clawd.openShop());
        const shop = await until(() => P.app.windows().find(w => w.url().endsWith('shop.html')));
        assert.ok(shop);
        await shop.waitForFunction(() => typeof CATALOG !== 'undefined', null, { timeout: 8000 });
        const r = await shop.evaluate(() => ({ ed: window.PAL_EDITION, skins: CATALOG.skins.map(s => s.id) }));
        assert.equal(r.ed, edition);
        assert.ok(r.skins.includes(edition === 'personal' ? 'turquesa' : 'naranja'));
      });

      await t.test('usa el vigilante compilado (no PowerShell)', async () => {
        const pid = P.app.process().pid;
        const kids = await until(() => {
          const out = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command',
            // descendientes del proceso lanzado (Playwright arranca Electron a través de otro proceso)
            `$all = Get-CimInstance Win32_Process; $ids = @(${pid}); do { $n = $ids.Count; $ids = @($ids + ($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId) | Select-Object -Unique) } while ($ids.Count -ne $n); ($all | Where-Object { $ids -contains $_.ProcessId }).Name -join ","`], { encoding: 'utf8' });
          return /system-watch.exe/i.test(out) ? out : null;
        }, 10000, 500);
        assert.ok(kids, 'system-watch.exe está en marcha');
        assert.doesNotMatch(kids, /powershell/i);
      });

      await t.test('ajustes: sección del móvil con QR y canal', async () => {
        await P.page.evaluate(() => window.clawd.openUi('settings'));
        const st = await until(() => P.app.windows().find(w => /settings.html/.test(w.url())));
        assert.ok(st);
        await st.waitForFunction(() => document.querySelector('#provNtfy img.qr').src.startsWith('data:image/png'), null, { timeout: 8000 });
        const r = await st.evaluate(() => ({ topic: document.getElementById('phoneTopic').textContent, on: document.getElementById('phoneOn').checked, hidden: document.getElementById('phoneBody').hidden }));
        assert.match(r.topic, /^pixelpal-/);
        assert.equal(r.on, true);
        assert.equal(r.hidden, false);
        // la app propia: código de emparejamiento y aviso de que falta la clave de Firebase
        await st.evaluate(() => document.querySelector('input[name=phoneProv][value=app]').click());
        await st.waitForFunction(() => !document.getElementById('provApp').hidden && /[0-9a-f]{4} /.test(document.getElementById('pairCode').textContent), null, { timeout: 8000 });
        const a = await st.evaluate(() => ({ code: document.getElementById('pairCode').textContent, key: document.getElementById('keyState').textContent, qr: document.querySelector('#provApp img.qr').src.slice(0, 15) }));
        assert.match(a.code, /^[0-9a-f]{4}( [0-9a-f]{4}){5}$/);
        assert.equal(a.key, 'falta');
        assert.equal(a.qr, 'data:image/png;');
      });

      await t.test('sin errores en ninguna ventana', async () => {
        await wait(500);
        assert.deepEqual(P.errors, []);
      });
    } finally {
      await P.app.close().catch(() => {});
      P.ntfyServer.close();
      try { fs.rmSync(P.home, { recursive: true, force: true }); } catch { /* algún archivo aún abierto */ }
    }
  });
}
