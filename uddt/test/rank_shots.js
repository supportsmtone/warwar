// 전·후반 순위 화면 캡처(벌금 5천원 도장 배치 확인) — 오프라인(?local=1), 화면만 누른다
// 사용: node web/test/rank_shots.js <상태 JSON> <출력 폴더>
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ST = fs.readFileSync(process.argv[2], 'utf8'); const OUT = process.argv[3]; fs.mkdirSync(OUT, { recursive: true });
const webDir = path.join(__dirname, '..'); const PORT = 19000 + Math.floor(Math.random() * 900);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', ['-I', '-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', webDir], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uddt_rank_'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (e) {} try { server.kill('SIGKILL'); } catch (e) {} };
(async () => {
  const f = path.join(profile, 'DevToolsActivePort'); let port;
  for (let i = 0; i < 100 && !port; i++) { if (fs.existsSync(f)) port = +fs.readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text); };
  const send = (method, params, sessionId) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify(Object.assign({ id: i, method, params: params || {} }, sessionId ? { sessionId } : {}))); });
  const tid = (await send('Target.createTarget', { url: 'about:blank' })).result.targetId;
  const sid = (await send('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
  const d = (m, p) => send(m, p, sid);
  await d('Page.enable'); await d('Runtime.enable');
  const ev = async expr => { const r = await d('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await d('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?local=1#round2` }); await sleep(1500);
  await ev(`localStorage.setItem('uddt_draw_v1', ${JSON.stringify(ST)}); true`);
  for (const [w, h, mob, tag] of [[390, 844, true, '390'], [1280, 900, false, '1280']]) {
    await d('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: mob });
    for (const which of ['r2', 'r1']) {
      await d('Page.reload', {}); await sleep(1800);
      await ev(`document.querySelector('nav.tabs button[data-tab="p-${which}"]').click(); true`); await sleep(400);
      await ev(`document.querySelector('#p-${which} [data-act="sub"][data-sub="rank"]').click(); true`); await sleep(1200);
      const m = await ev(`(()=>{ const out=[]; document.querySelectorAll('#p-${which} .rcard').forEach((c,i)=>{ const st=c.querySelector('.stamp:not(.gold)'); const cr=c.getBoundingClientRect(); if(!st) return; const r=st.getBoundingClientRect(); const td=st.closest('td'); out.push({g:i+1, inCard: r.left>=cr.left-1 && r.right<=cr.right+1 && r.top>=cr.top-1 && r.bottom<=cr.bottom+1, inCell: !!td, scrollX: c.scrollWidth>c.clientWidth+1, h:Math.round(td? td.getBoundingClientRect().height:0)}); }); return out; })()`);
      console.log(tag, which, JSON.stringify(m));
      const y = await ev(`window.scrollTo(0, document.querySelector('#p-${which} .rcard').getBoundingClientRect().top + scrollY - 10); true`); await sleep(400);
      const r = await d('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, `rank_${which}_${tag}.png`), Buffer.from(r.result.data, 'base64'));
    }
  }
  console.log('errors', errs.length);
  cleanup(); process.exit(0);
})().catch(e => { console.log('중단 ' + e.message); cleanup(); process.exit(2); });
