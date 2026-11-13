// (11/13) 조편성·후반전 배치 화면 캡처(1920·빔 모드·390) — show_shots.js 의 틀을 그대로 씀 — Chrome headless + DevTools Protocol
// 사용: node web/test/show_shots.js <상태 JSON(후반전 확정까지)> <출력 폴더>
// 오프라인 모드(?local=1)로 열어 공용 점수판을 건드리지 않는다. 화면만 누른다.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ST = fs.readFileSync(process.argv[2], 'utf8');
const OUT = process.argv[3]; fs.mkdirSync(OUT, { recursive: true });
const webDir = path.join(__dirname, '..');
const PORT = 19000 + Math.floor(Math.random() * 900);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', ['-I', '-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', webDir], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uddt_shots_'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (e) {} try { server.kill('SIGKILL'); } catch (e) {} };
process.on('exit', cleanup);
(async () => {
  const f = path.join(profile, 'DevToolsActivePort'); let port;
  for (let i = 0; i < 100 && !port; i++) { if (fs.existsSync(f)) port = +fs.readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || '').slice(0, 200)); };
  const send = (method, params, sessionId) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify(Object.assign({ id: i, method, params: params || {} }, sessionId ? { sessionId } : {}))); });
  const tid = (await send('Target.createTarget', { url: 'about:blank' })).result.targetId;
  const sid = (await send('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
  const d = (m, p) => send(m, p, sid);
  await d('Page.enable'); await d('Runtime.enable');
  const ev = async expr => { const r = await d('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) throw new Error(expr.slice(0, 60) + ' → ' + r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async name => { const r = await d('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
  const size = async (w, h, mobile) => d('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
  const url = `http://127.0.0.1:${PORT}/index.html?local=1#groups`;
  await size(1920, 1080);
  await d('Page.navigate', { url }); await sleep(1500);
  await ev(`localStorage.setItem('uddt_draw_v1', ${JSON.stringify(ST)}); true`);
  await d('Page.reload', {}); await sleep(2000);
  await ev(`(()=>{ const st=JSON.parse(localStorage.getItem('uddt_draw_v1')); st.settings.sound=false; localStorage.setItem('uddt_draw_v1', JSON.stringify(st)); return true })()`);
  await d('Page.reload', {}); await sleep(2000);
  const full = async name => { const h = await ev('Math.min(5000, document.documentElement.scrollHeight)'); const r = await d('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: await ev('innerWidth'), height: h, scale: 1 } }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('shot', name, h); };
  const metrics = async sel => ev(`(()=>{ const out={}; const q=s=>[...document.querySelectorAll(s)]; const fs=e=>parseFloat(getComputedStyle(e).fontSize);
    const nm=q('${sel}'); out.n=nm.length; out.minFont=nm.length?Math.min(...nm.map(fs)):0; out.maxRight=Math.max(0,...q('section.panel.active *').map(e=>e.getBoundingClientRect().right)); out.vw=innerWidth; out.sw=document.documentElement.scrollWidth; return out })()`);
  for (const [tab, sel, tag] of [['p-draw', '#groups .chip', 'draw'], ['p-place', '#placeGroups .pchip', 'place']]) {
    for (const [w, h, mob, proj] of [[1920, 1080, false, false], [1920, 1080, false, true], [390, 844, true, false]]) {
      await size(w, h, mob); await ev(`document.body.classList.toggle('projector', ${proj}); true`);
      await ev(`document.querySelector('nav.tabs button[data-tab="${tab}"]') ? document.querySelector('nav.tabs button[data-tab="${tab}"]').click() : 0; true`); await sleep(900);
      if (tab === 'p-place') { await ev(`(()=>{ const b=document.getElementById('btnPlaceSkip'); if (b && getComputedStyle(b).display!=='none') b.click(); return true })()`); await sleep(500); }
      const nm = `${tag}_${w}${proj ? '_proj' : ''}`; await shot(nm); if (w === 390) await full(nm + '_full');
      console.log('metrics', nm, JSON.stringify(await metrics(sel)));
    }
    await ev(`document.body.classList.remove('projector'); true`);
  }
  console.log('page errors', errs.length, errs.slice(0, 2).join(' | '));
  process.exit(0);
})().catch(e => { console.error('오류', e.message); process.exit(2); });
