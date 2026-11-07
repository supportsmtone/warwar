// 실시간 공유(공용 점수판) 검증 — 로컬 Firestore 에뮬레이터 + Chrome headless 여러 기기(브라우저 컨텍스트 분리)
// 준비: 에뮬레이터(규칙 = server/firebase/firestore.rules.tpl, 코드 test-op-code-0001) 127.0.0.1:8085
// 사용: node web/test/sync_check.js <명단파일>
// 기기: 운영자1(PC) · 운영자2(PC) · 보기(휴대폰 390×844 터치) · 틀린 코드 기기(휴대폰)
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

  // 1. 운영자1: 코드 링크로 연결 → 명단 → 추첨 → 확정
  log('1. 운영자1(PC) 연결·추첨');
  const op1 = await device('운영자1', base(`&op=${OPC}#players`));
  await op1.until(`(document.getElementById('syncPill').textContent||'').includes('운영자')`);
  check('?op= 코드 링크 → 운영자 연결, 주소창에서 코드 제거', !(await op1.ev('location.href')).includes(OPC) && await op1.ev(`localStorage.getItem('uddt_op_code')`) === OPC);
  await op1.ev(`document.getElementById('pasteBox').value = ${JSON.stringify(listText)}; true`);
  await op1.click('#btnPasteReplace');
  await op1.click('nav.tabs button[data-tab="p-draw"]');
  await op1.click('#btnDraw'); await sleep(800);
  for (let i = 0; i < 40; i++) { const st = await op1.ev(`(()=>{const s=document.getElementById('btnSkip'); return s && s.style.display!=='none'})()`); if (!st) break; await op1.click('#btnSkip'); await sleep(400); }
  await op1.until(`(()=>{const s=JSON.parse(localStorage.getItem('uddt_draw_v1')); return s.draw && s.draw.groups && document.getElementById('btnSkip').style.display==='none'})()`, 60000);
  await sleep(500); await op1.click('#btnLock');
  await op1.until(`JSON.parse(localStorage.getItem('uddt_draw_v1')).draw.locked`);
  const t1 = await settle(async () => { const r = await remote(); return r && r.participants.length === N && r.draw && r.draw.locked; });
  check('공용 점수판에 명단·확정 추첨 올라감', t1 >= 0, t1 + 'ms');
  const rem1 = await remote(); const loc1 = await op1.ls();
  check('공용본에 벌금·추첨 기록 없음', !('history' in rem1) && !('fines' in rem1.bracket));
  const pa = rem1.participants.map(p => p.age), real = loc1.participants.map(p => p.age);
  check('공용본 나이 = 순서값(1~), 운영자 기기에는 실제 나이 유지', pa.every(a => a >= 1 && a <= N) && Math.max(...pa) < 40 && real.some(a => a >= 30), `공용 최대 ${Math.max(...pa)} · 실제 최소 ${Math.min(...real)}`);
  // 나이 순서 보존(동점 처리 동일)
  const ordOk = loc1.participants.every((p, i) => loc1.participants.every((q, j) => Math.sign(p.age - q.age) === Math.sign(rem1.participants[i].age - rem1.participants[j].age)));
  check('나이 순서(동점 처리용) 공용본과 동일', ordOk);
  const ids = await op1.ev(`(async()=>{ document.querySelector('nav.tabs button[data-tab="p-r1"]').click(); await new Promise(r=>setTimeout(r,300)); return [...document.querySelectorAll('#p-r1 tr[data-act="pad"]')].map(r=>r.dataset.id) })()`);
  check('전반전 경기 28개', ids.length === N, String(ids.length));

  // 2. 휴대폰 보기
  log('2. 휴대폰(보기 전용)');
  const view = await device('휴대폰', base('#round1'), true);
  await view.until(`document.body.classList.contains('viewer')`);
  check('휴대폰: 보기 전용으로 공용 점수판 표시', (await view.ev(`document.querySelectorAll('#p-r1 tr[data-act="pad"]').length`)) === N);
  check('휴대폰: 이 기기 저장소에 쓰지 않음', (await view.ev(`localStorage.getItem('uddt_draw_v1')`)) === null);
  const hidden = await view.ev(`['p-part','p-fine','p-data'].map(t=>getComputedStyle(document.querySelector('nav.tabs button[data-tab="'+t+'"]')).display)`);
  check('휴대폰: 참가자·벌금·설정 탭, MC 줄 숨김', hidden.every(x => x === 'none') && (await view.ev(`getComputedStyle(document.getElementById('mcbar')).display`)) === 'none', hidden.join(','));
  await view.click(`#p-r1 tr[data-act="pad"][data-id="${ids[0]}"]`); await sleep(300);
  const padH = await view.ev(`document.getElementById('pad').hidden`), tst = await view.ev(`document.getElementById('toast').textContent`);
  check('휴대폰: 경기 줄을 눌러도 점수 입력창 안 열림', padH && /보기 전용/.test(tst), `pad.hidden=${padH} · 안내 「${tst}」`);
  const editBtns = await view.ev(`[...document.querySelectorAll('#p-r1 [data-act="lock"],#p-r1 [data-act="unlock"],#p-r1 [data-act="demofill"],#p-draw #btnDraw,#p-draw #btnLock')].filter(e=>e.getClientRects().length).length`);
  check('휴대폰: 확정·추첨·데모 버튼 안 보임', editBtns === 0, String(editBtns));
  check('휴대폰: 표시줄 「실시간」', /실시간/.test(await view.pill()), await view.pill());

  // 3. 점수 입력 → 휴대폰 반영
  log('3. 점수 입력 → 모든 화면');
  check('운영자1 점수 입력', (await op1.score('r1', ids[0], '21', '15')) === 'ok');
  const tv = await settle(async () => /21\s*:\s*15|21.{0,6}15/.test(await view.rowText('r1', ids[0])), 20000);
  check('휴대폰에 점수 반영(목표 10초 안)', tv >= 0 && tv <= 10000, tv + 'ms · ' + (await view.rowText('r1', ids[0])).slice(0, 60));

  // 4. 운영자2 + 동시 입력
  log('4. 운영자 2대 동시 입력');
  const op2 = await device('운영자2', base(`&op=${OPC}#round1`));
  await op2.until(`(document.getElementById('syncPill').textContent||'').includes('운영자') && document.querySelectorAll('#p-r1 tr[data-act="pad"]').length===${N}`);
  check('운영자2(빈 기기): 공용본으로 시작', (await op2.ls()).participants.length === N);
  const [r2a, r2b] = await Promise.all([op1.score('r1', ids[1], '21', '10'), op2.score('r1', ids[2], '12', '21')]);
  check('두 기기 같은 순간 다른 경기 입력', r2a === 'ok' && r2b === 'ok');
  const tm = await settle(async () => { const r = await remote(); const s = r && r.bracket.r1.scores; return s && s[ids[0]] && s[ids[1]] && s[ids[2]] && s[ids[1]].a === 21 && s[ids[2]].b === 21; }, 25000);
  check('공용본에 두 입력 모두 남음(덮어쓰기 없음)', tm >= 0, tm + 'ms');
  const both = await settle(async () => { const a = (await op1.ls()).bracket.r1.scores, b = (await op2.ls()).bracket.r1.scores; return a[ids[2]] && b[ids[1]] && a[ids[0]] && b[ids[0]]; }, 20000);
  check('운영자1·2 서로의 입력을 받아 옴', both >= 0);
  const vboth = await settle(async () => /21.{0,6}10/.test(await view.rowText('r1', ids[1])) && /12.{0,6}21/.test(await view.rowText('r1', ids[2])), 20000);
  check('휴대폰에 두 입력 모두 표시', vboth >= 0);
  // 같은 경기 충돌
  await Promise.all([op1.score('r1', ids[3], '21', '5'), op2.score('r1', ids[3], '21', '7')]);
  const conv = await settle(async () => { const r = await remote(); const s = r && r.bracket.r1.scores[ids[3]]; if (!s) return false; const a = (await op1.ls()).bracket.r1.scores[ids[3]], b = (await op2.ls()).bracket.r1.scores[ids[3]];
    const vt = await view.rowText('r1', ids[3]); return a && b && a.b === s.b && b.b === s.b && new RegExp('21.{0,6}' + s.b).test(vt); }, 25000);
  const fin = (await remote()).bracket.r1.scores[ids[3]];
  check('같은 경기를 동시에 다르게 입력 → 모든 화면이 한 값으로 통일', conv >= 0, fin ? `${fin.a}:${fin.b}` : '');
  // 4-2. 휴대폰 운영자(코트 옆에서 입력)
  const opm = await device('운영자휴대폰', base(`&op=${OPC}#round1`), true);
  await opm.until(`(document.getElementById('syncPill').textContent||'').includes('운영자') && document.querySelectorAll('#p-r1 tr[data-act="pad"]').length===${N}`);
  check('휴대폰 운영자: 숫자 패드로 입력', (await opm.score('r1', ids[5], '22', '20')) === 'ok');
  const tmv = await settle(async () => /22.{0,6}20/.test(await view.rowText('r1', ids[5])) && /22.{0,6}20/.test(await op1.rowText('r1', ids[5])), 20000);
  check('휴대폰 운영자 입력 → 다른 휴대폰·PC 반영', tmv >= 0, tmv + 'ms');
  const padFit = await opm.ev(`(async()=>{ document.querySelector('#p-r1 tr[data-act="pad"]').click(); await new Promise(r=>setTimeout(r,200)); const b=document.querySelector('#pad .modal-box, #pad > div')||document.getElementById('pad'); const r=[...document.querySelectorAll('#pad button')].filter(x=>x.getClientRects().length).map(x=>x.getBoundingClientRect()); const fit=r.every(x=>x.left>=-1&&x.right<=innerWidth+1&&x.bottom<=innerHeight+1&&x.top>=-1); document.getElementById('padCancel').click(); return {fit, n:r.length, minH:Math.min(...r.map(x=>x.height))} })()`);
  check('휴대폰 숫자 패드: 버튼 전부 화면 안·누르기 쉬운 크기(≥40px)', padFit.fit && padFit.minH >= 40, JSON.stringify(padFit));

  // 5. 운영자 기기 오프라인 → 복구
  log('5. 인터넷 끊김');
  await op1.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check('끊긴 상태 점수 입력(이 기기 저장)', (await op1.score('r1', ids[4], '21', '9')) === 'ok' && !!(await op1.ls()).bracket.r1.scores[ids[4]]);
  await sleep(2500);
  check('끊긴 동안 표시줄 경고', /실패|끊김|공유 중/.test(await op1.pill()), await op1.pill());
  check('끊긴 동안 공용본엔 아직 없음', !(await remote()).bracket.r1.scores[ids[4]]);
  await op1.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const tback = await settle(async () => /21.{0,6}9/.test(await view.rowText('r1', ids[4])), 25000);
  check('다시 연결되면 자동 전송 → 휴대폰 반영', tback >= 0, tback + 'ms');
  await sleep(1500);
  check('복구 뒤 표시줄 정상', /공유됨/.test(await op1.pill()), await op1.pill());

  // 6. 틀린 코드
  log('6. 틀린 운영자 코드');
  const bad = await device('틀린코드', base('&op=wrong-code-9999#round1'), true);
  await bad.until(`document.body.classList.contains('viewer')`);
  check('틀린 코드 → 운영자 안 됨, 보기 전용 유지', !(await bad.ev(`localStorage.getItem('uddt_op_code')`)));

  // 7. 반복 전송 없음(유휴 10초 동안 쓰기 0)
  const c0 = [await op1.ev('window.__commits'), await op2.ev('window.__commits')];
  await sleep(10000);
  const c1 = [await op1.ev('window.__commits'), await op2.ev('window.__commits')];
  check('입력 없을 때 쓰기 반복 없음(10초)', c0[0] === c1[0] && c0[1] === c1[1], `운영자1 ${c0[0]}→${c1[0]} · 운영자2 ${c0[1]}→${c1[1]}`);
  check('휴대폰 쓰기 시도 0', (await view.ev('window.__commits')) === 0);

  // 8. 휴대폰 화면 가로 넘침 없음(탭별)
  log('8. 휴대폰 화면 배치');
  for (const t of ['p-intro', 'p-draw', 'p-r1', 'p-place', 'p-r2', 'p-award']) {
    await view.click(`nav.tabs button[data-tab="${t}"]`); await sleep(400);
    const o = await view.ev(`(()=>{const W=innerWidth; const bad=[...document.querySelectorAll('section.panel.active *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0 && (r.right>W+1 || r.left<-1) && getComputedStyle(e).position!=='fixed' && !(()=>{ for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){ const ox=getComputedStyle(a).overflowX; if(ox==='auto'||ox==='scroll'||ox==='hidden') return true; } return false; })()}).slice(0,4).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right)); return {sw:document.documentElement.scrollWidth, W, bad}})()`);
    check(`휴대폰 ${t}: 가로 넘침 없음`, o.sw <= o.W + 1 && !o.bad.length, `scrollWidth ${o.sw}/${o.W} ${o.bad.join(' | ')}`);
  }

  // 9. 운영자1 전반전 확정 → 휴대폰
  log('9. 확정·초기화');
  const rest = []; for (const [i, m] of ids.slice(5).entries()) rest.push(await op1.score('r1', m, '21', String(5 + (i % 15))));
  check('운영자1 남은 점수 입력', rest.every(x => x === 'ok'), rest.filter(x => x !== 'ok').join(','));
  let coins = 0;   // 완전 동률이면 실제 운영처럼 조별 대진표의 동전으로 결정(동률 미결정이면 확정이 막히는 것이 정상)
  for (let k = 0; k < 10 && await op1.ev(`!!document.querySelector('#p-r1 .rtools .badge.tie')`); k++) {
    coins++; await op1.click('#p-r1 .gbox [data-act="coin"]'); await sleep(300); await op1.click('#coinFlip'); await sleep(4500);
    if (!(await op1.ev(`document.getElementById('coin').hidden`))) await op1.click('#coinClose');
    await sleep(500);
  }
  if (coins) check(`동률 ${coins}건 동전 결정 → 공용본에 결정 기록`, await settle(async () => { const r = await remote(); return r && Object.keys(r.bracket.r1.ties || {}).length >= 1; }, 15000) >= 0);
  await op1.ev(`(()=>{const b=document.querySelector('#p-r1 [data-act="lock"]'); if(b){b.click(); return true} return false})()`);
  const tl = await settle(async () => { const r = await remote(); return r && r.bracket.r1.locked && Object.keys(r.bracket.r1.scores).length === N; }, 25000);
  check('전반전 확정·28경기 공용본 반영', tl >= 0, tl + 'ms');
  const vl = await settle(async () => await view.ev(`!!document.querySelector('#p-r1 .badge.lock') && !document.querySelector('#p-r1 tr[data-act="pad"]')`), 20000);
  check('휴대폰에 확정 상태 표시', vl >= 0, JSON.stringify(await view.ev(`({rows:document.querySelectorAll('#p-r1 tr[data-act="pad"]').length, badge:!!document.querySelector('#p-r1 .badge.lock'), tools:(document.querySelector('#p-r1 .rtools')||{}).textContent, pill:document.getElementById('syncPill').textContent, busy:document.querySelector('.modal:not([hidden])')&&document.querySelector('.modal:not([hidden])').id, show:!document.getElementById('show').hidden})`)));
  // 초기화(공용도 비움)
  await op1.click('nav.tabs button[data-tab="p-data"]'); await sleep(300); await op1.click('#btnReset');
  const tr = await settle(async () => { const r = await remote(); return r && r.participants.length === 0; }, 20000);
  check('운영자 초기화 + 「공용도 비움」 → 공용본 비움', tr >= 0, tr + 'ms');
  const vr = await settle(async () => (await view.ev(`document.querySelectorAll('#p-r1 tr[data-act="pad"]').length`)) === 0, 20000);
  check('휴대폰도 빈 화면으로', vr >= 0);

  check('페이지 오류 0', !errs.length, errs.slice(0, 3).join(' | '));
  log(fail.length ? `\n❌ 실패 ${fail.length}건: ${fail.join(' / ')}` : '\n✅ 실시간 공유 검증 전부 통과');
  cleanup(); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('중단:', e.message); cleanup(); process.exit(2); });
