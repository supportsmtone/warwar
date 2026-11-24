// 발표 모드 연출 화면 캡처(11/8 회식 공지·일반인 놀림·속도) — Chrome headless + DevTools Protocol
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
  const url = `http://127.0.0.1:${PORT}/index.html?local=1#awards`;
  await size(1920, 1080);
  await d('Page.navigate', { url }); await sleep(1500);
  await ev(`localStorage.setItem('uddt_draw_v1', ${JSON.stringify(ST)}); true`);
  await d('Page.reload', {}); await sleep(2000);
  await ev(`(()=>{ const st=JSON.parse(localStorage.getItem('uddt_draw_v1')); st.settings.sound=false; localStorage.setItem('uddt_draw_v1', JSON.stringify(st)); return true })()`);
  await d('Page.reload', {}); await sleep(2000);
  await ev(`document.querySelector('nav.tabs button[data-tab="p-award"]').click(); true`); await sleep(800);
  await ev(`(()=>{ const b=document.querySelector('.dinnerbox'); if (b) b.scrollIntoView(); return !!b })()`); await sleep(500);
  await shot('award_dinnerbox_1920');
  await ev(`(document.getElementById('showMc')||{click(){}}).click(); document.getElementById('btnShow').click(); true`); await sleep(600);
  const steps = await ev(`(()=>{ const out=[]; let i=0; return out })()`);
  // 다음 ▶ 를 눌러 일반인 소개 → 일반인 카드 → … → 자강 → 시상 → 회식
  const next = async ms => { await ev(`document.getElementById('showNext').click(); true`); await sleep(ms); };
  await next(700); await shot('01_ilban_tier_1920');
  await next(1300); await shot('02_ilban_card_1920');
  const total = await ev(`document.getElementById('showProg').textContent`);
  console.log('prog', total);
  // 자강 카드까지 빠르게(스테이지 클릭 = 다음)
  for (let k = 0; k < 60; k++) { const t = await ev(`(document.querySelector('#showStage .tierintro')||{}).textContent||''`); if (/자강조!/.test(t)) break; await next(80); }
  await sleep(500); await shot('03_jagang_tier_1920');
  await next(3200); await shot('04_jagang_card_1920');
  await next(1200); await shot('05_prize_1920');
  await next(1600); await shot('06_dinner_1920');
  await size(390, 844, true); await sleep(900); await shot('07_dinner_390');
  await ev(`document.getElementById('showPrev').click(); true`); await sleep(300);
  await ev(`document.getElementById('showNext').click(); true`); await sleep(1600); await shot('08_dinner_390_again');
  await ev(`document.getElementById('showClose').click(); true`); await sleep(400);
  await ev(`(()=>{ const b=document.querySelector('.dinnerbox'); if (b) b.scrollIntoView(); return !!b })()`); await sleep(500);
  await shot('09_award_dinnerbox_390');
  await ev(`document.querySelector('nav.tabs button[data-tab="p-intro"]') ? document.querySelector('nav.tabs button[data-tab="p-intro"]').click() : location.hash='#intro'; true`); await sleep(800);
  await ev(`(()=>{ const h=[...document.querySelectorAll('#p-intro .info h3')].find(x=>/회식/.test(x.textContent)); if(h) h.scrollIntoView(); return !!h })()`); await sleep(400);
  await shot('10_intro_dinner_390');
  const broken = await ev(`[...document.querySelectorAll('img')].filter(i=>i.complete && i.src.includes('dinner') && !i.naturalWidth).map(i=>i.src)`);
  console.log('broken dinner images', JSON.stringify(broken));
  console.log('page errors', errs.length, errs.join(' | ').slice(0, 300));
  cleanup(); process.exit(0);
})().catch(e => { console.log('중단: ' + e.message); cleanup(); process.exit(2); });
