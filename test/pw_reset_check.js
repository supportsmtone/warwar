// 점수 비밀번호(최초 1회)·전반전/후반전 점수 초기화 검증 — 로컬 Firestore 에뮬레이터 + Chrome headless 여러 기기
// 준비: 에뮬레이터(규칙 = firestore.rules.tpl, 코드 test-op-code-0001, 비밀번호 = UDDT_PW) 127.0.0.1:8085
// 사용: UDDT_PW=<점수 비밀번호> node web/test/pw_reset_check.js <상태 JSON 파일(전반전 확정·후반전 배치까지 된 데이터)>

'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ST = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const N = ST.participants.length;
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


  const PW = process.env.UDDT_PW || '';   // 비밀번호는 저장소에 두지 않는다(실행 시 환경변수로)
  if (!PW) { console.log('UDDT_PW 환경변수가 필요합니다'); cleanup(); process.exit(2); }
  const openRow = (d, which, mid) => d.ev(`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); const q=s=>document.querySelector(s);
      if(!q('#p-${which}.active')){ q('nav.tabs button[data-tab="p-${which}"]').click(); await sl(250); }
      const r=q('#p-${which} [data-act="pad"][data-id="${mid}"]'); if(!r) return 'norow'; r.click(); await sl(200);
      return !q('#pwm').hidden ? 'pw' : !q('#pad').hidden ? 'pad' : 'none'; })()`);
  const typePw = (d, v) => d.ev(`(async()=>{const q=s=>document.querySelector(s); q('#pwInput').value=${JSON.stringify(v)}; q('#pwOk').click();
      for(let i=0;i<80;i++){ await new Promise(r=>setTimeout(r,150)); if(q('#pwm').hidden) return 'closed'; if(!q('#pwWarn').hidden && !q('#pwOk').disabled) return 'warn:'+q('#pwWarn').textContent; } return 'timeout'; })()`);
  const padEnter = (d, a, b) => d.ev(`(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); const q=s=>document.querySelector(s); if(q('#pad').hidden) return 'nopad';
      q('#pad .pside[data-side="a"]').click(); for(const c of '${a}') q('#padKeys button[data-k="'+c+'"]').click();
      q('#pad .pside[data-side="b"]').click(); for(const c of '${b}') q('#padKeys button[data-k="'+c+'"]').click();
      q('#padSave').click(); await sl(100); if(!q('#pad').hidden){ q('#padSave').click(); await sl(100);} return q('#pad').hidden?'ok':'stuck'; })()`);
  const prog = (d, which) => d.ev(`(async()=>{ const q=s=>document.querySelector(s); if(!q('#p-${which}.active')){ q('nav.tabs button[data-tab="p-${which}"]').click(); await new Promise(r=>setTimeout(r,250)); } const p=q('#p-${which} .prog b'); return p? p.textContent : (q('#p-${which}')||{}).textContent.slice(0,60); })()`);
  const typeReset = (d, v) => d.ev(`(()=>{const i=document.querySelector('#rsInput'); i.value=${JSON.stringify(v)}; i.dispatchEvent(new Event('input',{bubbles:true})); return document.querySelector('#rsOk').disabled; })()`);
  const DOC = n => `projects/${PROJ}/databases/(default)/documents/${n}`;
  const commit = async writes => (await fetch(`${DB}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }) })).status;
  const H = k => require('node:crypto').createHash('sha256').update(k).digest('hex');
  const ts = () => ({ timestampValue: new Date().toISOString() });

  log('0. 사이트 코드에 비밀번호 없음');
  const html = await (await fetch(`http://127.0.0.1:${PORT}/index.html`)).text();
  check('index.html 에 비밀번호 문자열 없음', !html.includes(PW));

  const pill = d => d.ev(`(async()=>{ document.getElementById('syncPill').click(); await new Promise(r=>setTimeout(r,250)); return !document.querySelector('#pwm').hidden })()`);
  const isViewer = d => d.ev(`document.body.classList.contains('viewer') && !document.body.classList.contains('opdev')`);

  log('1. 운영 PC(전반전 확정·후반전 배치까지 된 데이터, 비밀번호 전) → 보기 전용');
  const pc = await device('운영PC', base('#round2'));
  await pc.ev(`localStorage.setItem('uddt_draw_v1', ${JSON.stringify(JSON.stringify(Object.assign({ history: [] }, ST)))}); true`);
  await pc.send('Page.reload', { ignoreCache: true }); await sleep(500); await pc.until(`document.readyState==='complete' && !!document.querySelector('nav.tabs')`); await sleep(800);
  check('비밀번호 전: 보기 전용(관리자 아님)', await isViewer(pc), await pc.pill());
  const r2ids = await pc.ev(`(async()=>{ document.querySelector('nav.tabs button[data-tab="p-r2"]').click(); await new Promise(r=>setTimeout(r,300)); return [...document.querySelectorAll('#p-r2 [data-act="pad"]')].map(r=>r.dataset.id) })()`);
  check('후반전 경기 줄 있음', r2ids.length === 28, r2ids.length);
  check('보기 전용: 경기 줄 → 비밀번호 창(패드 아님)', (await openRow(pc, 'r2', r2ids[0])) === 'pw');
  await pc.click('#pwCancel'); await sleep(200);
  check('취소하면 그대로 보기 전용', await isViewer(pc) && await pc.ev(`document.querySelector('#pad').hidden`));
  check('보기 전용: 참가자 탭 숨김', await pc.ev(`getComputedStyle(document.querySelector('nav.tabs button[data-tab="p-part"]')).display==='none'`));
  check('승인 요청 자동 생성 안 함', (await (await fetch(`${DB}/req`)).json()).documents === undefined);
  check('화면 위 표시줄 → 관리자 비밀번호 창', await pill(pc) && /관리자 모드/.test(await pc.ev(`document.querySelector('#pwm h2').textContent`)));
  const w1 = await typePw(pc, '0000');
  check('틀린 비밀번호 → 거절', /맞지 않습니다/.test(w1), w1);
  check('틀린 비밀번호 뒤에도 보기 전용·공용판 없음', await isViewer(pc) && (await remote()) === null);
  check('맞는 비밀번호 → 창 닫힘', (await typePw(pc, PW)) === 'closed');
  const tOp = await settle(async () => /관리자 · 공유됨/.test(await pc.pill()), 20000);
  check('관리자 모드 전환·공유(표시줄 「🔑 관리자 · 공유됨」)', tOp >= 0, await pc.pill());
  check('관리자: 참가자 탭 보임', await pc.ev(`getComputedStyle(document.querySelector('nav.tabs button[data-tab="p-part"]')).display!=='none'`));
  check('관리자: 경기 줄 → 바로 숫자 패드(비밀번호 없음)', (await openRow(pc, 'r2', r2ids[0])) === 'pad');
  check('후반전 점수 입력', (await padEnter(pc, '21', '17')) === 'ok');
  let rem; await settle(async () => { rem = await remote(); return rem && rem.bracket.r2 && rem.bracket.r2.scores[r2ids[0]] && rem.bracket.r2.scores[r2ids[0]].a === 21; }, 15000);
  check('공용판: 전반전 28경기·후반전 1경기', rem && Object.values(rem.bracket.r1.scores).filter(s => s.a != null).length === 28 && rem.bracket.r2.scores[r2ids[0]].a === 21);
  check('비밀번호는 이 기기에 저장 안 함(확인 여부만)', !(await pc.ev(`JSON.stringify(Object.entries(localStorage)).includes('${PW}')`)));

  log('2. 보기 휴대폰');
  const ph = await device('휴대폰', base('#round2'), true);
  await ph.until(`document.body.classList.contains('viewer')`);
  const pv = await settle(async () => (await prog(ph, 'r2')) === '1/28', 15000);
  check('휴대폰: 보기 전용·후반전 1/28', pv >= 0, await prog(ph, 'r2'));
  check('휴대폰: 초기화 버튼 안 보임', await ph.ev(`(()=>{const b=document.querySelector('#p-r2 [data-act="reset"]'); return !b || getComputedStyle(b).display==='none'})()`));
  check('휴대폰: 경기 줄 → 비밀번호 창(패드 아님)', (await openRow(ph, 'r2', r2ids[1])) === 'pw');
  await ph.click('#pwCancel'); await sleep(200);
  check('휴대폰: 표시줄 → 비밀번호 창', await pill(ph));
  await ph.click('#pwCancel'); await sleep(300);
  check('취소하면 그대로 보기 전용', await isViewer(ph) && await ph.ev(`document.querySelector('#pad').hidden && document.querySelector('#pwm').hidden`));

  log('2b. 예전에 기기 승인만 받은 기기(비밀번호 안 넣음) → 보기 전용');
  const old = await device('예전승인기기', base('#round2'));
  await old.ev(`localStorage.setItem('uddt_dev_key','${'ab'.repeat(32)}'); localStorage.setItem('uddt_dev_ok','1'); true`);
  await old.send('Page.reload', { ignoreCache: true }); await sleep(500); await old.until(`document.readyState==='complete' && !!document.querySelector('nav.tabs')`); await sleep(1500);
  check('승인만 받은 기기도 비밀번호 전엔 보기 전용', await isViewer(old), await old.pill());

  log('3. 두 번째 휴대폰: 표시줄 → 비밀번호 → 관리자');
  const ph2 = await device('휴대폰2', base('#round2'), true);
  await ph2.until(`document.body.classList.contains('viewer')`);
  check('휴대폰2: 경기 줄 → 비밀번호 창', (await openRow(ph2, 'r2', r2ids[2])) === 'pw');
  check('휴대폰2: 맞는 비밀번호', (await typePw(ph2, PW)) === 'closed');
  await ph2.until(`document.body.classList.contains('opdev') && !document.querySelector('#pad').hidden`, 20000);
  check('휴대폰2: 비밀번호 뒤 그 경기 숫자 패드가 바로 열림 → 입력', (await padEnter(ph2, '15', '21')) === 'ok');
  check('휴대폰2: 다음 경기는 비밀번호 없이 바로 패드', (await openRow(ph2, 'r2', r2ids[4])) === 'pad'); await ph2.click('#padCancel');
  const t2 = await settle(async () => (await prog(pc, 'r2')) === '2/28', 20000);
  check('운영 PC에 휴대폰2 입력 반영(합치기)', t2 >= 0, t2 + 'ms');
  const t3 = await settle(async () => (await prog(ph, 'r2')) === '2/28', 20000);
  check('보기 휴대폰 2/28', t3 >= 0, t3 + 'ms');

  log('4. 한 번만: 새로고침 뒤에도 관리자');
  await pc.send('Page.reload', { ignoreCache: true }); await sleep(500); await pc.until(`document.readyState==='complete' && !!document.querySelector('nav.tabs')`); await sleep(500);
  await settle(async () => /관리자 · 공유됨/.test(await pc.pill()), 15000);
  check('새로고침 뒤에도 관리자·경기 줄 → 바로 숫자 패드', /관리자/.test(await pc.pill()) && (await openRow(pc, 'r2', r2ids[3])) === 'pad');
  await pc.click('#padCancel');

  log('5. 후반전 점수 초기화');
  await pc.click('#p-r2 [data-act="reset"]'); await sleep(200);
  check('초기화 창 열림', await pc.ev(`!document.querySelector('#rsm').hidden`), await pc.ev(`document.querySelector('#rsMsg').textContent`));
  check('빈칸: 버튼 잠김', await typeReset(pc, ''));
  check('「리셋」: 버튼 잠김', await typeReset(pc, '리셋'));
  check('「초기」: 버튼 잠김', await typeReset(pc, '초기'));
  check('「reset」: 버튼 잠김', await typeReset(pc, 'reset'));
  check('「초기화」: 버튼 풀림', !(await typeReset(pc, '초기화')));
  await pc.click('#rsCancel'); await sleep(200);
  check('취소하면 점수 그대로', (await prog(pc, 'r2')) === '2/28');
  await pc.click('#p-r2 [data-act="reset"]'); await sleep(200);
  await typeReset(pc, '초기화'); await pc.click('#rsOk'); await sleep(300);
  check('후반전 0/28', (await prog(pc, 'r2')) === '0/28' && await pc.ev(`document.querySelector('#rsm').hidden`));
  const t5 = await settle(async () => (await prog(ph, 'r2')) === '0/28', 20000);
  check('보기 휴대폰 후반전 0/28', t5 >= 0, t5 + 'ms');
  rem = await remote();
  check('공용판: 후반전 점수 0·전반전 28 그대로', rem && Object.keys(rem.bracket.r2.scores).length === 0 && Object.values(rem.bracket.r1.scores).filter(s => s.a != null).length === 28 && rem.bracket.r1.locked && rem.bracket.place.locked);
  const t5b = await settle(async () => (await prog(ph2, 'r2')) === '0/28', 20000);
  check('다른 운영 기기(휴대폰2)도 0/28 — 초기화가 되살아나지 않음', t5b >= 0, t5b + 'ms');

  log('6. 전반전 점수 초기화(확정·후반전 배치까지 함께)');
  await pc.click('nav.tabs button[data-tab="p-r1"]'); await sleep(300);
  await pc.click('#p-r1 [data-act="reset"]'); await sleep(200);
  const msg = await pc.ev(`document.querySelector('#rsMsg').textContent`);
  check('안내에 확정 해제·후반전 배치 삭제 명시', /28경기/.test(msg) && /확정/.test(msg) && /후반전 배치/.test(msg), msg);
  await typeReset(pc, '초기화'); await pc.click('#rsOk'); await sleep(300);
  check('전반전 0/28', (await prog(pc, 'r1')) === '0/28');
  const t6 = await settle(async () => (await prog(ph, 'r1')) === '0/28', 20000);
  check('보기 휴대폰 전반전 0/28', t6 >= 0, t6 + 'ms');
  rem = await remote();
  check('공용판: 전반전 비움·확정 해제·후반전 배치/경기표 없음, 명단·추첨 그대로', rem && Object.keys(rem.bracket.r1.scores).length === 0 && !rem.bracket.r1.locked && !rem.bracket.place && !rem.bracket.r2 && rem.participants.length === N && rem.draw.locked);
  check('되돌리기 목록에 「전반전 점수 초기화 전」', await pc.ev(`JSON.parse(localStorage.getItem('uddt_undo_v1')||'[]').some(x=>x.label==='전반전 점수 초기화 전')`));
  check('초기화 직후 다시 입력 가능', (await openRow(pc, 'r1', await pc.ev(`document.querySelector('#p-r1 [data-act="pad"]').dataset.id`))) === 'pad' && (await padEnter(pc, '21', '10')) === 'ok');

  log('6b. 조편성 초기화(대회 시작 전 빈 화면)');
  await pc.click('nav.tabs button[data-tab="p-draw"]'); await sleep(300);
  check('휴대폰: 조편성 초기화 버튼 안 보임', await ph.ev(`(async()=>{ document.querySelector('nav.tabs button[data-tab="p-draw"]').click(); await new Promise(r=>setTimeout(r,300)); const b=document.getElementById('btnDrawReset'); return !!b && getComputedStyle(b).display==='none' })()`));
  await pc.click('#btnDrawReset'); await sleep(200);
  const dmsg = await pc.ev(`document.querySelector('#rsMsg').textContent`);
  check('조편성 초기화 안내(명단 유지 명시)', /조편성\(추첨\) 결과를 지웁니다/.test(dmsg) && new RegExp(`참가자 명단 ${N}명은 그대로`).test(dmsg), dmsg);
  check('「조편성」 입력: 버튼 잠김', await typeReset(pc, '조편성'));
  await typeReset(pc, '초기화'); await pc.click('#rsOk'); await sleep(400);
  check('운영 PC: 조 칸 비고 「추첨 시작」', await pc.ev(`/아직 추첨하지 않았습니다/.test(document.getElementById('meta').textContent) && document.getElementById('btnDraw').textContent==='추첨 시작' && document.getElementById('groups').children.length===0`));
  rem = null; await settle(async () => { rem = await remote(); return rem && rem.draw === null; }, 15000);
  check('공용판: 조편성·전반전·후반전 비움, 명단 그대로', rem && rem.draw === null && !rem.bracket.r1 && !rem.bracket.place && !rem.bracket.r2 && rem.participants.length === N);
  const t6b = await settle(async () => await ph.ev(`/아직 추첨하지 않았습니다/.test(document.getElementById('meta').textContent) && document.getElementById('groups').children.length===0`), 20000);
  check('보기 휴대폰: 조편성 빈 화면', t6b >= 0, t6b + 'ms');
  const t6c = await settle(async () => (await ph2.ev(`(()=>{ const s=JSON.parse(localStorage.getItem('uddt_draw_v1')||'null'); return s && s.draw===null && !s.bracket.r1 })()`)), 20000);
  check('다른 운영 기기(휴대폰2)도 비움 — 되살아나지 않음', t6c >= 0, t6c + 'ms');
  await sleep(6000); rem = await remote();
  check('6초 뒤에도 공용판 비어 있음', rem && rem.draw === null && rem.participants.length === N);

  log('7. 규칙(서버) 직접 확인');
  const k = require('node:crypto').randomBytes(32).toString('hex'), h = H(k);
  check('틀린 비밀번호로 gate 차단', await commit([{ update: { name: DOC('gate/' + h), fields: { p: { stringValue: '0000' }, at: ts() } } }]) === 403);
  check('gate 없이 dev(via=pw) 차단', await commit([{ update: { name: DOC('dev/' + h), fields: { at: ts(), via: { stringValue: 'pw' } } } }]) === 403);
  check('틀린 비밀번호 gate + dev 같이 차단', await commit([{ update: { name: DOC('gate/' + h), fields: { p: { stringValue: '1213' }, at: ts() } } }, { update: { name: DOC('dev/' + h), fields: { at: ts(), via: { stringValue: 'pw' } } } }]) === 403);
  check('gate 허용 외 필드 차단', await commit([{ update: { name: DOC('gate/' + h), fields: { p: { stringValue: PW }, at: ts(), x: { stringValue: '1' } } } }]) === 403);
  check('맞는 비밀번호 gate + dev 허용', await commit([{ update: { name: DOC('gate/' + h), fields: { p: { stringValue: PW }, at: ts() } } }, { update: { name: DOC('dev/' + h), fields: { at: ts(), via: { stringValue: 'pw' } } }, currentDocument: { exists: false } }]) === 200);
  check('gate 읽기 차단(비밀번호 비공개)', (await fetch(`${DB}/gate/${h}`)).status === 403);
  check('gate 목록 읽기 차단', (await fetch(`${DB}/gate`)).status === 403);

  check('페이지 오류 0', errs.length === 0, errs.join(' | ').slice(0, 300));
  console.log(fail.length ? `\n❌ 실패 ${fail.length}건: ${fail.join(' / ')}` : '\n✅ 점수 비밀번호·초기화 전부 통과');
  cleanup(); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.log('중단: ' + e.message); cleanup(); process.exit(2); });
