// 발표 모드 전체 소요 시간 실측(자동 진행 + MC 음성) — Chrome headless + DevTools Protocol
// 사용: node web/test/show_timing.js <상태 JSON(후반전 확정까지)> [웹 폴더(기본: 이 저장소 web)]
// 오프라인 모드(?local=1). 시작 → 시상 화면 · 회식 공지 화면까지 걸린 실제 시간을 잰다.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ST = fs.readFileSync(process.argv[2], 'utf8');
const webDir = process.argv[3] || path.join(__dirname, '..');
const PORT = 19000 + Math.floor(Math.random() * 900);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', ['-I', '-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', webDir], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uddt_timing_'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); };
  const send = (method, params, sessionId) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify(Object.assign({ id: i, method, params: params || {} }, sessionId ? { sessionId } : {}))); });
  const tid = (await send('Target.createTarget', { url: 'about:blank' })).result.targetId;
  const sid = (await send('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
  const d = (m, p) => send(m, p, sid);
  await d('Page.enable'); await d('Runtime.enable');
  await d('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const ev = async expr => { const r = await d('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await d('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?local=1#awards` }); await sleep(1500);
  await ev(`localStorage.setItem('uddt_draw_v1', ${JSON.stringify(ST)}); true`);
  await d('Page.reload', {}); await sleep(2500);
  await ev(`document.querySelector('nav.tabs button[data-tab="p-award"]').click(); true`); await sleep(500);
  await ev(`document.getElementById('btnShow').click(); true`);
  const t0 = Date.now();
  await sleep(300);
  await ev(`document.getElementById('showAuto').click(); true`);
  let tPrize = 0, tDinner = 0, tEnd = 0;
  while (Date.now() - t0 < 600000) {
    const s = await ev(`(()=>({p:!!document.querySelector('#showStage .prizebox'), d:!!document.querySelector('#showStage .dinner'), auto:document.getElementById('showAuto').textContent, mc:document.getElementById('showMc').textContent}))()`);
    if (s.p && !tPrize) tPrize = Date.now() - t0;
    if (s.d && !tDinner) tDinner = Date.now() - t0;
    if ((s.d || (s.p && !tDinner)) && /자동 진행/.test(s.auto) && !/말하는 중/.test(s.mc)) { tEnd = Date.now() - t0; break; }
    await sleep(200);
  }
  console.log(JSON.stringify({ webDir, prize_s: +(tPrize / 1000).toFixed(1), dinner_s: tDinner ? +(tDinner / 1000).toFixed(1) : null, end_s: +(tEnd / 1000).toFixed(1), errors: errs.length }));
  cleanup(); process.exit(0);
})().catch(e => { console.log('중단: ' + e.message); cleanup(); process.exit(2); });
