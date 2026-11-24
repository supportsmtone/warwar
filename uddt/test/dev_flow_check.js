// 운영자 기기 승인 흐름 검증 — 로컬 Firestore 에뮬레이터 + Chrome headless 여러 기기
// 준비: 에뮬레이터(규칙 = server/firebase/firestore.rules.tpl, 코드 test-op-code-0001) 127.0.0.1:8085
// 사용: node web/test/dev_flow_check.js <명단파일>
// 기기: 대표 PC(코드 없음, 추첨 데이터 있음) · 보기 휴대폰 · 빈 휴대폰 2대째

'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const listText = fs.readFileSync(process.argv[2], 'utf8').trim();
const N = listText.split('\n').length;
const EMU = 'http://127.0.0.1:8085', PROJ = 'uddt-warwar-1114';
const DB = `${EMU}/v1/projects/${PROJ}/databases/(default)/documents`;
const OPC = 'test-op-code-0001';
const webDir = path.join(__dirname, '..');
const PORT = 19000 + Math.floor(Math.random() * 900);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', ['-I', '-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', webDir], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uddt_sync_'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (e) {} try { server.kill('SIGKILL'); } catch (e) {} };
process.on('exit', cleanup);
const base = q => `http://127.0.0.1:${PORT}/index.html?syncbase=${encodeURIComponent(DB)}${q || ''}`;
const remote = async () => { const r = await fetch(`${DB}/pub/state`); if (r.status !== 200) return null; const d = await r.json(); try { return JSON.parse(d.fields.json.stringValue).state; } catch (e) { return null; } };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1';

(async () => {
  const f = path.join(profile, 'DevToolsActivePort'); let port;
  for (let i = 0; i < 100 && !port; i++) { if (fs.existsSync(f)) port = +fs.readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100); }
  const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push((m.sessionId || '') + ' ' + m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || '').slice(0, 200));
  };
  const send = (method, params, sessionId) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify(Object.assign({ id: i, method, params: params || {} }, sessionId ? { sessionId } : {}))); });
  await fetch(`${EMU}/emulator/v1/projects/${PROJ}/databases/(default)/documents`, { method: 'DELETE' });

  async function device(name, url, mobile){
    const ctx = (await send('Target.createBrowserContext')).result.browserContextId;
    const tid = (await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx })).result.targetId;
    const sid = (await send('Target.attachToTarget', { targetId: tid, flatten: true })).result.sessionId;
    const d = { name, sid, ctx };
    d.send = (m, p) => send(m, p, sid);
    await d.send('Page.enable'); await d.send('Runtime.enable'); await d.send('Network.enable');
    if (mobile) { await d.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }); await d.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await d.send('Network.setUserAgentOverride', { userAgent: IPHONE }); }
    else await d.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await d.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.confirm=()=>true; window.prompt=()=>null; window.__commits=0; const _f=window.fetch; window.fetch=function(u,o){ if(String(u).includes(':commit')) window.__commits++; return _f.apply(this,arguments); };` });
    d.ev = async expr => { const r = await d.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) throw new Error(name + ' eval: ' + expr.slice(0, 80) + ' → ' + ((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text));
      return r.result && r.result.result ? r.result.result.value : undefined; };
    d.click = sel => d.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('없음 ${sel.replace(/'/g, '')}'); e.click(); return true})()`);
    d.until = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await d.ev(expr)) return Date.now() - t0; } catch (e) {} await sleep(200); } throw new Error(name + ' 시간초과: ' + expr.slice(0, 120)); };
    d.go = async u => { await d.send('Page.navigate', { url: u }); await d.until(`document.readyState==='complete' && !!document.querySelector('nav.tabs')`); await sleep(300); };
    d.ls = () => d.ev(`JSON.parse(localStorage.getItem('uddt_draw_v1')||'null')`);
    d.pill = () => d.ev(`(document.getElementById('syncPill')||{}).textContent||''`);
    d.score = async (which, mid, a, b) => d.ev(`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); const q=s=>document.querySelector(s);
      if(!q('#p-${which}.active')){ q('nav.tabs button[data-tab="p-${which}"]').click(); await sl(250); }
      const r=q('#p-${which} tr[data-act="pad"][data-id="${mid}"]'); if(!r) return 'norow'; r.click(); await sl(150); if(q('#pad').hidden) return 'nopad';
      q('#pad .pside[data-side="a"]').click(); for(const c of '${a}') q('#padKeys button[data-k="'+c+'"]').click();
      q('#pad .pside[data-side="b"]').click(); for(const c of '${b}') q('#padKeys button[data-k="'+c+'"]').click();
      q('#padSave').click(); await sl(100); if(!q('#pad').hidden){ q('#padSave').click(); await sl(100);} return q('#pad').hidden?'ok':'stuck'; })()`);
    d.rowText = (which, mid) => d.ev(`(()=>{const r=document.querySelector('#p-${which} [data-act="pad"][data-id="${mid}"]'); return r? r.textContent.replace(/\\s+/g,' ') : ''})()`);
    await d.go(url);
    return d;
  }
  const fail = []; const log = (...a) => console.log(...a);
  const check = (n, ok, det) => { log((ok ? '  ✅ ' : '  ❌ ') + n + (det !== undefined && det !== '' ? ' — ' + det : '')); if (!ok) fail.push(n); };
  const settle = async (pred, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return Date.now() - t0; await sleep(300); } return -1; };
  const { execFileSync } = require('node:child_process');
  const approve = no => execFileSync('node', [path.join(__dirname, '../../server/firebase/approve_device.js'), no], { env: Object.assign({}, process.env, { UDDT_BASE: DB, UDDT_CODE: OPC }) }).toString().trim();

  log('1. 대표 PC: 코드 없이 명단·추첨·확정(지금 대표 PC 상태와 같음)');
  const pc = await device('대표PC', base('#players'));
  check('처음: 이 기기에만 저장', /이 기기에만 저장/.test(await pc.pill()), await pc.pill());
  await pc.ev(`document.getElementById('pasteBox').value = ${JSON.stringify(listText)}; true`);
  await pc.click('#btnPasteReplace');
  await pc.click('nav.tabs button[data-tab="p-draw"]');
  await pc.click('#btnDraw'); await sleep(800);
  for (let i = 0; i < 40; i++) { const st = await pc.ev(`(()=>{const s=document.getElementById('btnSkip'); return s && s.style.display!=='none'})()`); if (!st) break; await pc.click('#btnSkip'); await sleep(400); }
  await pc.until(`(()=>{const s=JSON.parse(localStorage.getItem('uddt_draw_v1')); return s.draw && s.draw.groups && document.getElementById('btnSkip').style.display==='none'})()`, 60000);
  await sleep(500); await pc.click('#btnLock');
  await pc.until(`JSON.parse(localStorage.getItem('uddt_draw_v1')).draw.locked`);
  const ids = await pc.ev(`(async()=>{ document.querySelector('nav.tabs button[data-tab="p-r1"]').click(); await new Promise(r=>setTimeout(r,300)); return [...document.querySelectorAll('#p-r1 tr[data-act="pad"]')].map(r=>r.dataset.id) })()`);
  check('코드 없이 점수 2개 입력', (await pc.score('r1', ids[0], '21', '13')) === 'ok' && (await pc.score('r1', ids[1], '18', '21')) === 'ok');
  check('대표 PC: 추첨하면 자동 승인 요청(코드 입력 없음)', (await settle(async () => /승인 대기 · 기기번호 [0-9A-F]{6}/.test(await pc.pill()), 8000)) >= 0, await pc.pill());
  check('대표 PC 기기 키는 이 기기에만(64자), 요청 문서엔 해시만', await pc.ev(`/^[0-9a-f]{64}$/.test(localStorage.getItem('uddt_dev_key')||'')`)
    && (await (await fetch(`${DB}/req`)).json()).documents.every(d => !JSON.stringify(d).includes('KEYPLACEHOLDER')));
  const key = await pc.ev(`localStorage.getItem('uddt_dev_key')`);
  const reqDump = JSON.stringify(await (await fetch(`${DB}/req`)).json());
  check('공개되는 요청 목록에 기기 키 없음', !reqDump.includes(key));
  check('승인 전: 공용 점수판 비어 있음', (await remote()) === null);

  log('2. 승인 전 휴대폰');
  const ph = await device('휴대폰', base('#round1'), true);
  await sleep(1500);
  check('승인 전 휴대폰: 보기 전용 아님(공용본 없음)', !(await ph.ev(`document.body.classList.contains('viewer')`)));
  check('빈 휴대폰은 승인 요청 안 함', !(await ph.ev(`localStorage.getItem('uddt_dev_key')`)) && !/승인 대기/.test(await ph.pill()), await ph.pill());

  log('3. 총괄이사 승인 → 대표 PC 자동 운영자 → 휴대폰 공개');
  const no = (await pc.pill()).match(/기기번호 ([0-9A-F]{6})/)[1];
  const list = execFileSync('node', [path.join(__dirname, '../../server/firebase/approve_device.js')], { env: Object.assign({}, process.env, { UDDT_BASE: DB, UDDT_CODE: OPC }) }).toString();
  check('승인 목록에 대표 PC 표시', list.includes('⏳ 대기') && list.includes(no), list.trim().split('\n')[0]);
  const ap = approve(no); check('승인 스크립트', /승인 완료/.test(ap), ap);
  const tA = Date.now();
  const tOp = await settle(async () => /운영자 · 공유됨/.test(await pc.pill()), 30000);
  check('대표 PC: 새로고침 없이 운영자 기기로 전환·공유', tOp >= 0, (tOp >= 0 ? (Date.now() - tA) + 'ms · ' : '') + await pc.pill());
  const rem = await remote();
  check('공용본 = 대표 PC 데이터(명단·확정·점수 2개)', rem && rem.participants.length === N && rem.draw.locked && rem.bracket.r1.scores[ids[0]] && rem.bracket.r1.scores[ids[1]].b === 21);
  check('공용본에 벌금·추첨 기록 없음', rem && !('history' in rem) && !('fines' in rem.bracket));
  const tv = await settle(async () => await ph.ev(`document.body.classList.contains('viewer')`) && /21.{0,6}13/.test(await ph.rowText('r1', ids[0])), 25000);
  check('휴대폰: 자동으로 보기 전용 + 점수 표시', tv >= 0, tv + 'ms');

  log('4. 대표 PC 입력 → 휴대폰');
  check('대표 PC 점수 입력', (await pc.score('r1', ids[2], '21', '9')) === 'ok');
  const t3 = await settle(async () => /21.{0,6}9/.test(await ph.rowText('r1', ids[2])), 20000);
  check('휴대폰 반영(목표 10초 안)', t3 >= 0 && t3 <= 10000, t3 + 'ms');

  log('5. 대표 PC 새로고침·다음 날 다시 열어도 운영자 유지');
  await pc.go(base('#round1'));
  const tRe = await settle(async () => /운영자 · 공유됨/.test(await pc.pill()), 15000);
  check('새로고침 뒤에도 운영자 기기', tRe >= 0, await pc.pill());
  check('새로고침 뒤 데이터 그대로(점수 3개)', Object.keys((await pc.ls()).bracket.r1.scores).length === 3);
  check('대표 PC 점수 입력(새로고침 뒤)', (await pc.score('r1', ids[3], '15', '21')) === 'ok');
  const t4 = await settle(async () => /15.{0,6}21/.test(await ph.rowText('r1', ids[3])), 20000);
  check('휴대폰 반영', t4 >= 0, t4 + 'ms');

  log('6. 다른 휴대폰(새 기기)·사칭');
  const ph2 = await device('휴대폰2', base('#round1'), true);
  await ph2.until(`document.body.classList.contains('viewer')`);
  check('새 휴대폰: 바로 보기 전용, 점수 4개 보임', (await ph2.ev(`[...document.querySelectorAll('#p-r1 tr[data-act="pad"]')].filter(r=>/\\d+\\s*:\\s*\\d+/.test(r.textContent)).length`)) >= 4);
  check('새 휴대폰: 승인 요청 안 함', !(await ph2.ev(`localStorage.getItem('uddt_dev_key')`)));
  // 사칭: 승인된 해시를 알아도 키 없이 쓰기 불가
  const h = require('node:crypto').createHash('sha256').update(key).digest('hex');
  const v = String(Date.now() * 1000);
  const forge = await fetch(`${DB}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [
    { update: { name: `projects/${PROJ}/databases/(default)/documents/op/${h}`, fields: { v: { integerValue: v }, k: { stringValue: 'f'.repeat(64) } } } },
    { update: { name: `projects/${PROJ}/databases/(default)/documents/pub/state`, fields: { v: { integerValue: v }, json: { stringValue: '{}' }, by: { stringValue: h } } } } ] }) });
  check('기기번호(해시)를 알아도 키 없으면 쓰기 차단', forge.status === 403, String(forge.status));

  log('7. 운영자 연결 끄기');
  await pc.ev(`window.confirm=()=>true; document.getElementById('syncPill').click(); true`);
  await sleep(1500);
  check('연결 끄면 이 기기 키 삭제·보기 전용', !(await pc.ev(`localStorage.getItem('uddt_dev_key')`)) && await pc.ev(`document.body.classList.contains('viewer')`), await pc.pill());

  check('페이지 오류 0', errs.length === 0, errs.join(' | ').slice(0, 300));
  console.log(fail.length ? `\n❌ 실패 ${fail.length}건: ${fail.join(' / ')}` : '\n✅ 운영자 기기 승인 흐름 전부 통과');
  cleanup(); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.log('중단: ' + e.message); cleanup(); process.exit(2); });
