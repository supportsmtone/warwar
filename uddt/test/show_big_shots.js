// 11/13 대표 「시상급수 이름 카드·회식 공지 크게(빔)」 — 발표 화면 해상도별 캡처 + 크기·잘림 측정
// 사용: node web/test/show_big_shots.js <상태 JSON(후반전 확정까지)> <출력 폴더> [웹 폴더(기본 web/)]
// 오프라인 모드(?local=1)로 열어 공용 점수판을 건드리지 않는다.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ST = fs.readFileSync(process.argv[2], 'utf8');
const OUT = process.argv[3]; fs.mkdirSync(OUT, { recursive: true });
const webDir = process.argv[4] || path.join(__dirname, '..');
const PORT = 19000 + Math.floor(Math.random() * 900);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', ['-I', '-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', webDir], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uddt_big_'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (e) {} try { server.kill('SIGKILL'); } catch (e) {} };
process.on('exit', cleanup);
const SIZES = [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [390, 844, true]];
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
  const ev = async expr => { const r = await d('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) throw new Error(expr.slice(0, 60) + ' → ' + r.result.exceptionDetails.text + ' ' + ((r.result.exceptionDetails.exception||{}).description||'').slice(0,200)); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async name => { const r = await d('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); };
  const size = async (w, h, mobile) => d('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
  const url = `http://127.0.0.1:${PORT}/index.html?local=1#awards`;
  await size(1920, 1080);
  await d('Page.navigate', { url }); await sleep(1500);
  await ev(`(()=>{ const st=${ST}; st.settings.sound=false; localStorage.setItem('uddt_draw_v1', JSON.stringify(st)); return true })()`);
  await d('Page.reload', {}); await sleep(2200);
  await ev(`document.querySelector('nav.tabs button[data-tab="p-award"]').click(); true`); await sleep(600);
  await ev(`document.getElementById('btnShow').click(); true`); await sleep(600);
  console.log('show open', await ev(`!document.getElementById('show').hidden + ' btnDisabled=' + document.getElementById('btnShow').disabled + ' hash=' + location.hash`));
  // 측정: 화면 안에 들어오는지(잘림), 글자 크기
  const MEASURE = `(()=>{ const vw=innerWidth, vh=innerHeight; const R=e=>{ if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),r:Math.round(r.right),b:Math.round(r.bottom)} };
    const fs=e=>e?Math.round(parseFloat(getComputedStyle(e).fontSize)):null; const q=s=>document.querySelector(s);
    const stage=R(q('#showStage')); const out={vw,vh,stage};
    const nm=q('#showStage .pcard .nm'); if(nm){ out.card=R(q('#pcard')); out.nameFont=fs(nm); out.nameBox=R(nm); out.rkFont=fs(q('#pcard .rk')); out.badgeFont=fs(q('#pcard .pf .gbadge')); out.subFont=fs(q('#pcSub'));
      out.nameOverflow = nm.scrollWidth>nm.clientWidth+1; out.nameLines = Math.round(nm.getBoundingClientRect().height/parseFloat(getComputedStyle(nm).lineHeight||1)); }
    const extras={crown:'#showStage .crown',lips:'#showStage .lips',ilst1:'#showStage .ilst',ilst2:'#showStage .ilst.s2'}; for(const k in extras){ const r=R(q(extras[k])); if(r) out[k]=r; }
    const strip=R(q('#showStrip')); if(strip && strip.h) { out.strip=strip; out.stripFont=fs(q('#showStrip > span')); }
    const din=q('#showStage .dinner'); if(din){ out.dinner=R(din); out.dnameFont=fs(q('.dinner .dname')); out.dtimeFont=fs(q('.dinner .dtime')); out.daddrFont=fs(q('.dinner .daddr')); out.kickFont=fs(q('.dinner .kick')); out.map=R(q('.dinner .dmap')); out.qr=R(q('.dinner .dqr img')); out.photo=R(q('.dinner .dphoto')); out.dinnerScroll = din.scrollHeight>din.clientHeight+2; out.dnameBox=R(q('.dinner .dname')); out.daddrBox=R(q('.dinner .daddr')); }
    const pz=q('#showStage .prizebox'); if(pz){ out.prize=R(pz); out.prizeFont=fs(pz.querySelector('li b')); out.prizeH2=fs(pz.querySelector('h2')); out.prizeScroll = pz.scrollHeight>pz.clientHeight+2; }
    const within=(r,box)=>!r||(r.x>=box.x-1&&r.y>=box.y-1&&r.r<=box.r+1&&r.b<=box.b+1);
    const vp={x:0,y:0,r:vw,b:vh}; out.clip=[]; for(const k of ['card','crown','lips','ilst1','ilst2','dinner','prize','nameBox','dnameBox','daddrBox','map','qr','photo']) if(out[k] && !within(out[k], stage)) out.clip.push(k);
    if(out.card && out.strip && out.card.b>out.strip.y+1) out.clip.push('card_over_strip'); if(out.prizeScroll) out.clip.push('prize_scroll'); if(out.dinnerScroll) out.clip.push('dinner_scroll'); if(out.nameOverflow) out.clip.push('name_overflow');
    return out })()`;
  // 발표 상태(IIFE 안이라 직접 못 부름) → 화면 버튼만 눌러 원하는 단계까지 이동
  const SIG = `(()=>{ const c=document.querySelector('#showStage #pcard'); const p=document.getElementById('showProg').textContent;
    if (document.querySelector('#showStage .dinner')) return 'DIN'; if (document.querySelector('#showStage .prizebox')) return 'PRIZE';
    if (!c) return 'TIER'; const g=c.dataset.g; const m=p.match(/발표 (\\d+)\\/(\\d+)/); const last = m && m[1]===m[2];
    return g==='일반인' ? (last ? 'IL' : 'IL_') : g==='준자강' ? 'JUN' : g==='자강' ? 'JA' : g==='D' ? 'D' : 'X' })()`;
  const reopen = async () => { await ev(`document.getElementById('showClose').click(); true`); await sleep(300); await ev(`document.getElementById('btnShow').click(); true`); await sleep(500); };
  const reach = async target => { for (let k = 0; k < 120; k++) { if ((await ev(SIG)) === target) return true; await ev(`document.getElementById('showNext').click(); true`); await sleep(110); } return false; };
  const res = {};
  for (const [w, h, mob] of SIZES) {
    await size(w, h, mob); await sleep(400); await reopen();
    const tag = `${w}x${h}`;
    for (const [k, wait] of [['D', 1600], ['JUN', 1600], ['JA', 3800], ['IL', 2000], ['PRIZE', 1000], ['DIN', 1800]]) {
      if (!(await reach(k))) { console.log('못 찾음', k, tag); continue; }
      await sleep(wait);
      res[`${k}_${tag}`] = await ev(MEASURE);
      await shot(`${k}_${tag}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(res, null, 1));
  for (const [k, v] of Object.entries(res)) {
    const s = [k.padEnd(18)];
    if (v.nameFont) s.push(`name ${v.nameFont}px card ${v.card.w}x${v.card.h} rk ${v.rkFont} badge ${v.badgeFont} sub ${v.subFont} lines ${v.nameLines}${v.nameOverflow ? ' OVERFLOW' : ''}`);
    if (v.stripFont) s.push(`strip ${v.stripFont}px h${v.strip.h}`);
    if (v.dnameFont) s.push(`dinner ${v.dinner.w}x${v.dinner.h} name ${v.dnameFont} time ${v.dtimeFont} addr ${v.daddrFont} kick ${v.kickFont} map ${v.map.w}x${v.map.h} qr ${v.qr.w}${v.dinnerScroll ? ' SCROLL' : ''}`);
    if (v.prizeFont) s.push(`prize ${v.prize.w}x${v.prize.h} name ${v.prizeFont} h2 ${v.prizeH2}`);
    s.push('clip[' + v.clip.join(',') + ']');
    console.log(s.join(' | '));
  }
  console.log('page errors', errs.length, errs.join(' | ').slice(0, 300));
  cleanup(); process.exit(0);
})().catch(e => { console.log('중단: ' + e.message); cleanup(); process.exit(2); });
