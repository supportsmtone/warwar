// 실명 28명 전 과정 리허설 — Chrome headless + DevTools Protocol(외부 패키지 없음)
// 사용: node web/test/rehearsal_real28.js <명단파일(이름 나이 한 줄씩)> [시드]
// 운영자처럼 화면만 누른다(앱 내부 함수 호출 없음): 세부 URL 로 들어가기 → 명단 붙여넣기 → 조편성 추첨·확정
//   → 전반전 조별 대진표 줄을 눌러 숫자패드로 전 경기 입력 → 확정 → 후반전 배치 공개·확정 → 후반전 입력 → 확정 → 시상·급수.
// 그 뒤 앱과 별개로 계산한 순위·배치·급수·상품·꼴찌를 화면과 대조한다.
// 명단 파일은 저장소 밖(planning/)에 둔다 — 실명은 저장소에 넣지 않는다.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const listFile = process.argv[2];
const SEED = +(process.argv[3] || 20261114);
if (!listFile) { console.error('명단 파일 경로가 필요합니다'); process.exit(2); }
const listText = fs.readFileSync(listFile, 'utf8').trim();
const N = listText.split('\n').length, SIZES = N === 28 ? [6, 6, 6, 5, 5] : [6, 6, 5, 5, 5], EXPM = N;
const GRADE_CNT = N === 28 ? '1,1,3,4,4,5,4,4,2' : '1,1,3,4,4,5,4,3,2';
const base = 'file://' + path.join(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'uddt_rh_'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required', '--window-size=1280,900', '--remote-debugging-port=0', '--user-data-dir=' + profile, base + '/players/index.html'], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});
const sleep = ms => new Promise(r => setTimeout(r, ms));

let rs = SEED >>> 0;
const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
function makeScore(){
  if (rnd() < 0.12) return rnd() < 0.5 ? [23, 21] : [21, 23];       // 듀스
  const lo = 5 + Math.floor(rnd() * 15);
  return rnd() < 0.5 ? [21, lo] : [lo, 21];
}
const S = `JSON.parse(localStorage.getItem('uddt_draw_v1'))`;
const SHOTS = process.env.SHOTS_DIR || '';
const PDF_DIR = process.env.PDF_DIR || '';   // 지정하면 출력 버튼으로 만든 인쇄 화면을 PDF 로 저장   // 지정하면 후반전 조별 대진표 화면을 PC·휴대폰 크기로 저장

(async () => {
  const f = path.join(profile, 'DevToolsActivePort'); let port;
  for (let i = 0; i < 100 && !port; i++) { if (fs.existsSync(f)) port = +fs.readFileSync(f, 'utf8').split('\n')[0]; else await sleep(100); }
  let t = [];
  for (let i = 0; i < 60 && !t.length; i++) { try { t = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(x => x.type === 'page' && x.url.startsWith('file://')); } catch (e) {} if (!t.length) await sleep(100); }
  const ws = new WebSocket(t[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errs = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || ''));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('CONSOLE ' + m.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Runtime.enable');
  async function shot(name){
    if (!SHOTS) return;
    for (const [w, h, tag] of [[1280, 900, 'pc'], [390, 844, 'mobile']]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
      await sleep(500);
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(6000, await ev('document.documentElement.scrollHeight')), scale: 1 } });
      fs.writeFileSync(path.join(SHOTS, `${name}_${tag}.png`), Buffer.from(r.result.data, 'base64'));
    }
    await send('Emulation.clearDeviceMetricsOverride');
  }
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error('eval: ' + expr.slice(0, 90) + ' → ' + ((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text));
    return r.result && r.result.result ? r.result.result.value : undefined; };
  const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) throw new Error('없음: '+${JSON.stringify(sel)}); e.click(); return true})()`);
  const until = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(150); } throw new Error('시간초과: ' + expr); };
  const tab = id => click(`nav.tabs button[data-tab="${id}"]`);
  const log = (...a) => console.log(...a);
  const fail = []; const check = (name, ok, detail) => { log((ok ? '  ✅ ' : '  ❌ ') + name + (detail ? ' — ' + detail : '')); if (!ok) fail.push(name); };

  // 0. 세부 URL: /players/ → /#players
  await until(`location.hash==='#players' && document.readyState==='complete' && !!document.querySelector('#p-part.active')`, 15000);
  check('세부 URL /players/ → 참가자 화면', true, await ev('location.pathname.slice(-11)+location.hash'));
  // 11/8: 리허설은 실제 공용 점수판(Firestore)에 닿지 않게 — 주소 차단 + 오프라인 모드(?local=1)로 다시 연다
  //       (세부 URL 이동은 ?local=1 을 떨어뜨려, 그대로 두면 공유 모드로 열려 실제 서버에 승인 요청을 남기고 점수 비밀번호 창이 뜬다)
  await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['*firestore.googleapis.com*'] });
  await send('Page.navigate', { url: base + '/index.html?local=1#players' });
  await until(`location.search==='?local=1' && document.readyState==='complete' && !!document.querySelector('#p-part.active')`, 15000);
  check('리허설은 오프라인 모드(공용 점수판 미접속)', await ev(`location.search==='?local=1' && !document.body.classList.contains('viewer') && document.getElementById('syncPill').hidden`));
  await ev('window.confirm = () => true; window.__plays=[]; const _p=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(){ window.__plays.push({src:(this.src||"").split("/audio/")[1]||this.src, t:Date.now(), rate:this.playbackRate, ov:(document.getElementById("overlay")||{}).textContent||""}); return _p.apply(this, arguments); }; true');   // 리허설 프로필 전용

  // 1. 참가자 붙여넣기
  await ev(`document.getElementById('pasteBox').value = ${JSON.stringify(listText)}; true`);
  await click('#btnPasteReplace');
  check('참가자 28명·나이 28명', await ev(`${S}.participants.length===${N} && ${S}.participants.filter(p=>p.age).length===${N}`));
  check('탭 이름 「2. 조편성」', await ev(`document.querySelector('nav.tabs button[data-tab="p-draw"]').textContent.trim()`) === '2. 조편성');

  // 2. 조편성
  await tab('p-draw');
  check('주소 #groups', await ev('location.hash') === '#groups');
  check('MC 음성 버튼(조편성)', /조 추첨/.test(await ev(`[...document.querySelectorAll('#mcbar button')].map(b=>b.textContent).join('|')`)));
  await ev(`window.__spoken=new Set(); window.__ob && window.__ob.disconnect(); window.__ob=new MutationObserver(ms=>ms.forEach(m=>{ const t=m.target; if(t.classList&&t.classList.contains('speaking')&&t.dataset.no) window.__spoken.add(t.dataset.no) })); window.__ob.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']}); true`);
  await ev(`window.__ovl=[]; new MutationObserver(()=>{const t=(document.getElementById('overlay')||{}).textContent||''; if(t) window.__ovl.push(t)}).observe(document.getElementById('overlay'),{childList:true,subtree:true,characterData:true}); true`);
  const tA = Date.now();
  await click('#btnDraw'); await sleep(500);
  // 건너뛰기 없이 끝까지(이름이 꽂힐 때마다 방송)
  await until(`!!${S}.draw && !!${S}.draw.groups`, 60000);
  await until(`!!document.querySelector('#mcbar .annbtn.on')`, 15000).catch(() => {});
  check('조편성 연출 시작과 함께 이름 방송 시작', await ev(`!!document.querySelector('#mcbar .annbtn.on')`));
  await until(`window.__spoken.size === ${N} && !document.querySelector('#mcbar .annbtn.on')`, 120000).catch(() => {});
  check(`조편성: 이름이 조에 꽂힐 때마다 방송 ${N}명(꽂힌 칩 강조)`, await ev('window.__spoken.size') === N, `${await ev('window.__spoken.size')}명 · ${Math.round((Date.now() - tA) / 1000)}초`);
  const ovl = await ev('window.__ovl.join(" / ")');
  check('마지막 한 명 드럼롤·두둥 연출 없음', !/마지막|두둥/.test(ovl), ovl.slice(0, 80));
  const plays1 = await ev('window.__plays.map(x=>x.src)');
  check('추첨 멘트가 먼저(카운트다운·이름 전)', plays1[0] === 'names/draw_pre.mp3' && plays1[1] === 'names/g1.mp3' && !plays1.includes('names/p_intro.mp3'), plays1.slice(0, 4).join(' → '));
  const gap1 = await ev('window.__plays[1].t - window.__plays[0].t');
  check('추첨 멘트(15.8초) 끝까지 재생 후 다음 소리', gap1 >= 15500, Math.round(gap1 / 100) / 10 + '초');
  const spokenOrder = await ev('[...window.__spoken]');
  const drawOrder = await ev(`${S}.draw.groups.flatMap(g=>g.members.map(m=>String(m.no)))`);
  check('방송 순서 = 1조→5조 꽂히는 순서', JSON.stringify(spokenOrder) === JSON.stringify(drawOrder));
  await click('#btnLock');
  await until(`${S}.draw.locked`);
  const sizes = await ev(`${S}.draw.groups.map(g=>g.members.length)`);
  check('조 편성 ' + SIZES.join('/'), JSON.stringify(sizes) === JSON.stringify(SIZES), JSON.stringify(sizes));
  const drawn = await ev(`${S}.draw.groups.flatMap(g=>g.members.map(m=>m.name))`);
  check('추첨 중복·누락 없음', new Set(drawn).size === N && drawn.length === N);

  async function printCheck(which, label, tag){
    await ev('window.__printed=0; window.print=()=>{window.__printed++}; true');
    const gcount = await ev(`document.querySelectorAll('#p-${which} .gbox').length`);
    const btns = await ev(`({one:document.querySelectorAll('#p-${which} .gbox [data-act="print"]').length, all:document.querySelectorAll('#p-${which} .rtools [data-act="print"][data-g="all"]').length})`);
    check(`${label} 조별 출력 버튼 ${gcount}개 + 전체 출력`, btns.one === gcount && btns.all === 1, JSON.stringify(btns));
    const want = await ev(`(()=>{const st=${S}, h=st.bracket.${which}, nm=new Map(st.participants.map(p=>[p.no,p.name])); return h.groups.map(g=>({no:g.no,n:g.members.length,names:g.members.map(m=>nm.get(m.no))}))})()`);
    for (const g of want) {
      await click(`#p-${which} .gbox [data-act="print"][data-g="${g.no}"]`); await sleep(150);
      const got = await ev(`(()=>{const sh=document.querySelectorAll('#printArea .psheet'); const s=sh[0]; return {sheets:sh.length, printing:document.body.classList.contains('printing'), printed:window.__printed, title:s?s.querySelector('h1').textContent:'', rows:s?s.querySelectorAll('table.pm tbody tr').length:0, names:s?[...s.querySelectorAll(".pmem .nm")].map(td=>td.textContent):[], mtxt:s?s.querySelector('table.pm').textContent:'', heads:s?[...s.querySelectorAll('th')].map(th=>th.textContent).join(','):'', fit:s?s.getBoundingClientRect().height:0}})()`);
      const nameOk = JSON.stringify(got.names) === JSON.stringify(g.names) && g.names.every(n => got.mtxt.includes(n)) && got.heads === '경기,A팀,점수,B팀,확인';
      const tplLen = (await ev(`BracketCore.TEMPLATES[${g.n}].length`));
      if (!(got.sheets === 1 && got.printing && got.printed >= 1 && got.title === `${label} ${g.no}조 대진표` && got.rows === tplLen && nameOk)) check(`${label} ${g.no}조 출력 내용`, false, JSON.stringify(got).slice(0, 200));
      await ev(`window.dispatchEvent(new Event('afterprint')); true`);
    }
    check(`${label} 조별 출력(${want.length}개 조): 한 장·제목·경기 수·명단 일치, 인쇄 창 호출`, !fail.some(f => f.startsWith(label + ' ') && f.endsWith('출력 내용')));
    check(`${label} 인쇄 끝나면 화면 원상 복귀`, !(await ev(`document.body.classList.contains('printing')`)) && /우당탕탕/.test(await ev('document.title')));
    await click(`#p-${which} .rtools [data-act="print"][data-g="all"]`); await sleep(150);
    const nAll = await ev(`document.querySelectorAll('#printArea .psheet').length`);
    check(`${label} 전체 조 출력 = ${want.length}장`, nAll === want.length, String(nAll));
    // 인쇄 미디어에서 출력 영역만 보이는지(앱 화면·MC 줄 숨김)
    await send('Emulation.setEmulatedMedia', { media: 'print' });
    const vis = await ev(`({area:document.getElementById('printArea').getClientRects().length>0, nav:document.querySelector('nav.tabs').getClientRects().length, panel:document.getElementById('p-${which}').getClientRects().length, mcbar:document.getElementById('mcbar').getClientRects().length, others:[...document.body.children].filter(e=>e.id!=='printArea'&&e.getClientRects().length).map(e=>e.tagName+'#'+e.id)})`);
    await send('Emulation.setEmulatedMedia', { media: '' });
    check(`${label} 인쇄 화면엔 대진표만(탭·화면 숨김)`, vis.area && !vis.nav && !vis.panel && !vis.mcbar && !vis.others.length, JSON.stringify(vis));
    if (PDF_DIR) { const r = await send('Page.printToPDF', { paperWidth: 8.27, paperHeight: 11.69, preferCSSPageSize: true, printBackground: true });
      if (r.result && r.result.data) fs.writeFileSync(path.join(PDF_DIR, `${tag}.pdf`), Buffer.from(r.result.data, 'base64')); else check(`${label} PDF 생성`, false, JSON.stringify(r.error || {})); }
    await ev(`window.dispatchEvent(new Event('afterprint')); true`);
  }
  async function playHalf(which, label, hash){
    await tab('p-' + which);
    check(`주소 #${hash}`, await ev('location.hash') === '#' + hash);
    await printCheck(which, label, which + '_blank');
    const tieBefore = async () => ev(`document.querySelectorAll('#p-${which} .badge.tie, #p-${which} .tiebar, #p-${which} tr.tied').length`);
    check(`${label} 점수 입력 전 동률 표시 없음(조별 대진표)`, await tieBefore() === 0);
    await click(`#p-${which} [data-act="sub"][data-sub="rank"]`); await sleep(150);
    check(`${label} 점수 입력 전 동률 표시 없음(순위)`, await tieBefore() === 0);
    await click(`#p-${which} [data-act="sub"][data-sub="match"]`); await sleep(150);
    const gb = await ev(`({boxes:document.querySelectorAll('#p-${which} .gbox').length, rows:document.querySelectorAll('#p-${which} tr[data-act="pad"]').length, heads:[...document.querySelectorAll('#p-${which} .gbox h3')].map(h=>h.textContent).join(',')})`);
    check(`${label} 기본 화면 = 조별 대진표 5개 표`, gb.boxes === 5 && gb.rows === EXPM, JSON.stringify(gb));
    const ids = await ev(`[...document.querySelectorAll('#p-${which} tr[data-act="pad"]')].map(r=>r.dataset.id)`);
    let cnt = 0;
    for (const mid of ids) {
      if (which === 'r2' && cnt++ === 14) await shot('r2_half');
      const [a, b] = makeScore();
      await click(`#p-${which} tr[data-act="pad"][data-id="${mid}"]`);
      await until(`!document.getElementById('pad').hidden`, 5000);
      await click('#pad .pside[data-side="a"]');
      for (const d of String(a)) await click(`#padKeys button[data-k="${d}"]`);
      await click('#pad .pside[data-side="b"]');
      for (const d of String(b)) await click(`#padKeys button[data-k="${d}"]`);
      await click('#padSave'); await sleep(40);
      if (!(await ev(`document.getElementById('pad').hidden`))) await click('#padSave');
      await until(`document.getElementById('pad').hidden`, 5000);
      const s = await ev(`${S}.bracket.${which}.scores['${mid}']||{}`);
      if (s.a !== a || s.b !== b) check(`${label} ${mid} 저장`, false, JSON.stringify(s) + ' 기대 ' + a + ':' + b);
      const row = await ev(`(document.querySelector('#p-${which} tr[data-id="${mid}"] td.sc')||{}).textContent||''`);
      if (row.replace(/\s/g, '') !== `${a}:${b}`) check(`${label} ${mid} 표 표시`, false, row);
    }
    if (which === 'r2') await shot('r2_full');
    await printCheck(which, label, which + '_scored');
    const nScored = await ev(`Object.keys(${S}.bracket.${which}.scores).length`);
    check(`${label} ${ids.length}경기 숫자패드 입력·표 표시`, nScored === ids.length && ids.length === EXPM, `${nScored}/${ids.length}`);
    // 완전 동률이면 조별 대진표 안의 동전 던지기
    let tieViaTable = false;
    for (let k = 0; k < 10 && await ev(`!!document.querySelector('#p-${which} .rtools .badge.tie')`); k++) {
      await click(`#p-${which} .gbox [data-act="coin"]`); await sleep(300);   // 조별 대진표 안의 동전 버튼
      tieViaTable = true;
      log('   (동률 → 동전 던지기)');
      await click('#coinFlip'); await sleep(4500);
      if (!(await ev(`document.getElementById('coin').hidden`))) await click('#coinClose');
      await sleep(400);
    }
    if (tieViaTable) check(`${label} 동률을 조별 대진표에서 바로 동전으로 결정`, !(await ev(`!!document.querySelector('#p-${which} .rtools .badge.tie')`)));
    await click(`#p-${which} [data-act="lock"]`);
    await until(`${S}.bracket.${which}.locked`, 8000).catch(() => {});
    check(`${label} 확정`, await ev(`!!${S}.bracket.${which}.locked`));
  }
  // 조편성을 바꾸는 상황: 점수 1개 입력 → 잠금 해제 → 다시 뽑기 → 전반전은 안내만 → 다시 확정하면 새 경기표
  await tab('p-r1');
  const firstId = await ev(`(document.querySelector('#p-r1 tr[data-act="pad"]')||{}).dataset.id`);
  await click(`#p-r1 tr[data-act="pad"][data-id="${firstId}"]`); await until(`!document.getElementById('pad').hidden`, 5000);
  await click('#padKeys button[data-k="T"]'); await click('#pad .pside[data-side="b"]'); await click('#padKeys button[data-k="9"]'); await click('#padSave'); await sleep(60);
  if (!(await ev(`document.getElementById('pad').hidden`))) await click('#padSave');
  await tab('p-draw'); await click('#btnUnlock'); await sleep(300);
  await click('#btnDraw'); await sleep(400); if (await ev(`getComputedStyle(document.getElementById('btnSkip')).display!=='none'`)) await click('#btnSkip');
  await until(`!document.querySelector('#mcbar .annbtn.on') && getComputedStyle(document.getElementById('btnSkip')).display==='none'`, 30000).catch(() => {});
  await tab('p-r1');
  const stale = await ev(`({notice:/조편성이 새로 바뀌었습니다/.test(document.getElementById('p-r1').textContent), tables:document.querySelectorAll('#p-r1 .gbox').length})`);
  check('조편성이 바뀌면 전반전은 이전 경기표 숨김·안내', stale.notice && stale.tables === 0, JSON.stringify(stale));
  await click('#p-r1 [data-act="lockdraw"]'); await until(`${S}.draw.locked`);   // 전반전 화면에서 바로 확정
  const fresh = await ev(`({tables:document.querySelectorAll('#p-r1 .gbox').length, scores:Object.keys(${S}.bracket.r1.scores).length, same:${S}.bracket.r1.key === (${S}.draw.seed + '|' + ${S}.draw.drawnAt)})`);
  check('전반전 화면 「이 조편성으로 확정하고 점수 입력 시작」 → 새 경기표(점수 0부터)', fresh.tables === 5 && fresh.scores === 0 && fresh.same, JSON.stringify(fresh));
  await playHalf('r1', '전반전', 'round1');

  await tab('p-place');
  check('주소 #placement', await ev('location.hash') === '#placement');
  check('배치 방식 = 전체 개인 성적순(6·6·6·5·5)', await ev(`${S}.settings.placeMode`) === 'overall');
  await ev(`window.__spoken=new Set(); window.__ob && window.__ob.disconnect(); window.__ob=new MutationObserver(ms=>ms.forEach(m=>{ const t=m.target; if(t.classList&&t.classList.contains('speaking')&&t.dataset.no) window.__spoken.add(t.dataset.no) })); window.__ob.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']}); true`);
  let pt = 0;
  while (await ev(`!!document.querySelector('#placeMsg [data-act="coin"]')`) && pt < 10) { pt++;
    log('   (배치 경계 동률 → 공개 전 동전 던지기)');
    const blocked = await (async () => { await click('#btnPlaceShow'); await sleep(300); return !(await ev(`!!document.querySelector('#mcbar .annbtn.on')`)); })();
    if (pt === 1) check('경계 동률이면 공개·방송 막힘', blocked);
    await click('#placeMsg [data-act="coin"]'); await sleep(300); await click('#coinFlip'); await sleep(4500);
    if (!(await ev(`document.getElementById('coin').hidden`))) await click('#coinClose');
    await sleep(500);
  }
  const tB = Date.now(); await ev('window.__plays=[]; true');
  await click('#btnPlaceShow'); await sleep(500);
  await until(`!!document.querySelector('#mcbar .annbtn.on')`, 20000).catch(() => {});
  await until(`window.__spoken.size === ${N} && !document.querySelector('#mcbar .annbtn.on')`, 120000).catch(() => {});
  check(`후반전 배치: 이름이 나올 때마다 방송 ${N}명`, await ev('window.__spoken.size') === N, `${await ev('window.__spoken.size')}명 · ${Math.round((Date.now() - tB) / 1000)}초`);
  const plays2 = await ev('window.__plays.map(x=>x.src)');
  check('후반전 배치 규칙 멘트가 먼저(공개 전)', plays2[0] === 'names/place_pre.mp3' && plays2[1] === 'names/g5.mp3', plays2.slice(0, 3).join(' → '));
  const gap2 = await ev('window.__plays[1].t - window.__plays[0].t');
  check('배치 규칙 멘트(24.1초) 끝까지 재생 후 다음 소리', gap2 >= 23800, Math.round(gap2 / 100) / 10 + '초');
  const placeMsg = await ev(`document.getElementById('placeMsg').textContent`);
  if (/동률/.test(placeMsg)) log('   배치 메시지:', placeMsg.slice(0, 120));
  await click('#btnPlaceLock');
  await until(`${S}.bracket.place && ${S}.bracket.place.locked`, 8000).catch(() => {});
  check('후반전 배치 확정', await ev(`!!(${S}.bracket.place && ${S}.bracket.place.locked)`), placeMsg.slice(0, 80));
  await playHalf('r2', '후반전', 'round2');

  await tab('p-award');
  check('주소 #awards', await ev('location.hash') === '#awards');
  check('급수 기준 = 포스터 구간', await ev(`${S}.settings.gradeMode`) === 'poster');
  const dom = await ev(`[...document.querySelectorAll('#awardBody table.final tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.trim()))`);
  const prizeList = await ev(`[...document.querySelectorAll('#awardBody ul li')].map(li=>li.textContent.trim())`);
  const st = await ev(S);

  // ===== 독립 계산(앱 코드 미사용, 엑셀 규칙) =====
  const P = new Map(st.participants.map(p => [p.no, p]));
  const TPL_SRC = await ev(`JSON.stringify(BracketCore.TEMPLATES)`);   // 엑셀 로테이션 표(431/431 검증된 상수)
  const TEMPLATES = JSON.parse(TPL_SRC);
  function matchesOf(groups){ const out = []; groups.forEach(g => (TEMPLATES[g.members.length]).forEach(([A, B], i) => out.push({ id: g.no + '-' + (i + 1), g: g.no, a: A.map(s => g.members[s - 1].no), b: B.map(s => g.members[s - 1].no) }))); return out; }
  // 완전 동률(승·패·득실·나이 같음)은 화면에서 동전으로 정한 순서를 따른다 — 그 외는 전부 독립 계산
  const appOrd = {};
  for (const w of ['r1', 'r2']) { await tab('p-' + w); appOrd[w] = await ev(`[...document.querySelectorAll('#p-${w} table.gr tbody tr td.nm')].map(td=>td.textContent.replace(/동률|꼴찌 5천원/g,'').trim())`); }
  await tab('p-award');
  let coinTies = 0;
  function standings(groups, scores, w){
    const x = new Map(); groups.forEach(g => g.members.forEach(m => x.set(m.no, { no: m.no, name: P.get(m.no).name, g: g.no, w: 0, l: 0, diff: 0 })));
    for (const m of matchesOf(groups)) { const s = scores[m.id]; if (!s) continue;
      m.a.forEach(n => { const p = x.get(n); p.diff += s.a - s.b; if (s.a > s.b) p.w++; else if (s.b > s.a) p.l++; });
      m.b.forEach(n => { const p = x.get(n); p.diff += s.b - s.a; if (s.b > s.a) p.w++; else if (s.a > s.b) p.l++; }); }
    for (const p of x.values()) p.score = (p.w / ((p.w + p.l) || 1)) * 1000 + p.diff + (+P.get(p.no).age || 0) * 0.03;
    return groups.map(g => [...x.values()].filter(p => p.g === g.no).sort((a, b) => { if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score; coinTies++; return appOrd[w].indexOf(a.name) - appOrd[w].indexOf(b.name); }));
  }
  const g1 = standings(st.bracket.r1.groups, st.bracket.r1.scores, 'r1');
  const dupe1 = g1.some(g => g.some((p, i) => i && Math.abs(p.score - g[i - 1].score) < 1e-9));
  // 전체 개인 성적순: 28명 전원 점수 내림차순 → 위에서부터 SIZES(6·6·6·5·5) 로 자름. 완전히 같은 점수만 화면(동전) 순서를 따른다
  const appFlat = st.bracket.r2.groups.flatMap(g => g.members.map(m => m.no));
  const allP = g1.flat().sort((a, b) => (Math.abs(b.score - a.score) > 1e-9 ? b.score - a.score : appFlat.indexOf(a.no) - appFlat.indexOf(b.no)));
  const samePlace = allP.some((p, i) => i && Math.abs(p.score - allP[i - 1].score) < 1e-9);
  let k0 = 0; const exp = SIZES.map(s => allP.slice(k0, k0 += s).map(p => p.no).sort((a, b) => a - b));
  const app = st.bracket.r2.groups.map(g => g.members.map(m => m.no).sort((a, b) => a - b));
  check(`후반전 배치 = 독립 계산(전체 개인 성적순, ${app.map(g => g.length).join('·')}명)`, JSON.stringify(exp) === JSON.stringify(app) && JSON.stringify(app.map(g => g.length)) === JSON.stringify(SIZES), samePlace ? '같은 점수는 화면 동전 순서 적용' : '');
  const seatOk = st.bracket.r2.groups.every(g => g.members.every((m, i) => i === 0 || allP.findIndex(p => p.no === g.members[i - 1].no) < allP.findIndex(p => p.no === m.no)));
  check('후반전 조 안 자리 순서 = 성적순', seatOk);
  const g2 = standings(st.bracket.r2.groups, st.bracket.r2.scores, 'r2');
  if (coinTies) log(`   (완전 동률 비교 ${coinTies}회 — 동전 결정 순서 적용)`);
  const fin = []; g2.forEach((g, gi) => g.forEach((p, i) => fin.push({ name: p.name, group: gi + 1, rank: i + 1, overall: fin.length + 1 })));
  const n = fin.length;
  const grade = r => r > n - 2 ? '일반인' : r === 1 ? '자강' : r === 2 ? '준자강' : r <= 5 ? 'S' : r <= 9 ? 'A' : r <= 13 ? 'B' : r <= 18 ? 'C' : r <= 22 ? 'D' : '초심';
  const prize = x => x.group === 1 && x.rank <= 3 ? ['20만원', '10만원', '5만원'][x.rank - 1] : (x.group >= 2 && x.rank === 1 ? '3만원' : '');
  let mism = 0;
  fin.forEach((x, i) => { const r = (dom[i] || []).join(' | ');
    const ok = r.includes(x.name) && (dom[i] || [])[4] === grade(x.overall) && (!prize(x) || r.includes(prize(x)));
    if (!ok) { mism++; if (mism <= 5) log('     불일치', i + 1, x.name, grade(x.overall), prize(x), '↔', r); } });
  check(`화면 최종 표 ${N}행: 순위·이름·급수·상품 = 독립 계산`, dom.length === N && mism === 0, `화면 ${dom.length}행, 불일치 ${mism}`);
  const cnt = gname => dom.filter(r => r[4] === gname).length;
  check('급수 인원(자강·준자강·S·A·B·C·D·초심·일반인) ' + GRADE_CNT, ['자강', '준자강', 'S', 'A', 'B', 'C', 'D', '초심', '일반인'].map(cnt).join(',') === GRADE_CNT, ['자강', '준자강', 'S', 'A', 'B', 'C', 'D', '초심', '일반인'].map(cnt).join(','));
  const expPrize = fin.filter(x => prize(x)).map(x => x.name + ' ' + prize(x));
  check('상품 7명 = 1조 1·2·3등 + 2~5조 1등', prizeList.length === 7 && expPrize.every(e => prizeList.some(li => li.includes(e.split(' ')[0]) && li.includes(e.split(' ')[1]))), prizeList.join(' / ').slice(0, 160));
  // 꼴찌 5천원: 각 조 대진표 아래 순위표의 배지 = 독립 계산
  const lastBadge = async w => { await tab('p-' + w); return ev(`[...document.querySelectorAll('#p-${w} table.gr tr.last td.nm')].map(td=>td.textContent.replace('꼴찌 5천원','').trim())`); };
  const L1 = await lastBadge('r1'), L2 = await lastBadge('r2');
  const r2rows = await ev(`[...document.querySelectorAll('#p-r2 table.gr tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent.replace(/동률|꼴찌 5천원/g,'').trim()))`);
  const gMis = fin.filter((x, i) => { const r = r2rows[i] || []; return r[1] !== x.name || r[5] !== grade(x.overall) || (r[6] || '') !== (prize(x) || ''); });
  check('후반전 조별 대진표 순위표의 급수·상품 = 독립 계산', r2rows.length === N && gMis.length === 0, gMis.slice(0, 2).map(x => x.name).join(','));
  check('후반전 1조 「상금 조」 표시', await ev(`/상금 조/.test((document.querySelector('#p-r2 .gbox header')||{}).textContent||'')`));
  const e1 = g1.map(g => g[g.length - 1].name), e2 = g2.map(g => g[g.length - 1].name);
  check('꼴찌 5천원 표시(전반 5·후반 5) = 독립 계산', JSON.stringify(L1) === JSON.stringify(e1) && JSON.stringify(L2) === JSON.stringify(e2), `전반 ${L1.join(',')} / 후반 ${L2.join(',')}`);
  // 개인 결과(전반·후반): 사람마다 승패·득실·후반전 조·급수 = 독립 계산, 이름 검색
  for (const [w, G, label] of [['r1', g1, '전반전'], ['r2', g2, '후반전']]) {
    await tab('p-' + w); await click(`#p-${w} [data-act="sub"][data-sub="person"]`); await sleep(200);
    await shot(`${w}_person`);
    const prow = await ev(`[...document.querySelectorAll('#p-${w} tr.prow')].map(tr=>({name:tr.dataset.name, cells:[...tr.children].map(td=>td.textContent.replace(/꼴찌 5천원|꼴찌/g,'').trim()), games:tr.querySelectorAll('.pg').length}))`);
    const flat = G.flat(); let bad = 0;
    for (const x of flat) { const r = prow.find(y => y.name === x.name); if (!r || r.cells[2] !== `${x.w}승 ${x.l}패` || r.cells[5] !== `${x.diff > 0 ? '+' : ''}${x.diff}` || r.games !== 4) { bad++; if (bad <= 3) log('     개인 불일치', x.name, JSON.stringify(r && r.cells.slice(0, 6))); } }
    check(`${label} 개인 결과 ${N}명: 승·패·득실·경기 4개 = 독립 계산`, prow.length === N && bad === 0, `불일치 ${bad}`);
    if (w === 'r1') {
      const nextOk = flat.every(x => { const r = prow.find(y => y.name === x.name); const gi = exp.findIndex(arr => arr.includes(x.no)); return r && r.cells[6] === `${gi + 1}조`; });
      check('전반전 개인 결과의 「후반전 조」 = 배치 독립 계산', nextOk);
    } else {
      const grOk = fin.every(x => { const r = prow.find(y => y.name === x.name); return r && r.cells[7] === grade(x.overall) && (r.cells[8] || '') === (prize(x) || ''); });
      check('후반전 개인 결과의 급수·상품 = 독립 계산', grOk);
    }
    const one = flat[3].name;
    await ev(`(()=>{const i=document.getElementById('psearch-${w}'); i.value=${JSON.stringify(one)}; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
    const vis = await ev(`[...document.querySelectorAll('#p-${w} tr.prow')].filter(r=>!r.hidden).map(r=>r.dataset.name)`);
    check(`${label} 개인 결과 이름 검색`, vis.length === 1 && vis[0] === one, vis.join(','));
    await ev(`(()=>{const i=document.getElementById('psearch-${w}'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return true})()`);
    await click(`#p-${w} [data-act="sub"][data-sub="match"]`);
  }
  await tab('p-award');
  const firstCol = await ev(`[...document.querySelectorAll('#awardBody table.final tbody tr')].map(tr=>tr.children[6] ? tr.children[6].textContent.trim() : '')`);
  check('시상 최종 표에 전반 결과(조·순위·승패·득실) 표시', firstCol.length === N && firstCol.every(t => /^\d조 \d위 · \d승\d패/.test(t)), firstCol[0]);
  // 발표 모드 MC 음성: 시작 멘트 → (자동 진행) 일반인 멘트 → 꼴찌부터 실명, 멘트가 끝난 뒤에 다음 단계(잘림 없음)
  await tab('p-award');
  const NAMES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'audio', 'names', 'names.json'), 'utf8'));
  await ev('window.__plays=[]; true');
  await click('#btnShow'); await sleep(600);
  check('발표 모드: 열면 시작 멘트(sh_intro) + MC 표시', (await ev('window.__plays.map(x=>x.src).join(",")')) === 'show/sh_intro.mp3' && /MC 말하는 중/.test(await ev(`document.getElementById('showMc').textContent`)));
  await click('#showAuto');
  await until('window.__plays.length >= 7', 90000).catch(() => {});
  const sp = await ev('window.__plays.map(x=>({s:x.src,t:x.t,r:x.rate}))');
  const lastTwo = dom.slice(-2).reverse().map(r => r[1]);   // 발표 순서: 28위 → 27위
  // 11/8: 일반인은 실명 뒤마다 「민턴인 아닙니다~ 일반인이에요!」(sh_ilban_card)
  const wantSeq = ['show/sh_intro.mp3', 'show/sh_ilban.mp3', `names/${NAMES[lastTwo[0]]}.mp3`, 'show/sh_ilban_card.mp3', `names/${NAMES[lastTwo[1]]}.mp3`, 'show/sh_ilban_card.mp3', 'show/sh_chosim.mp3'];
  check('발표 모드 자동 진행: 시작 → 일반인 멘트 → (실명 → 놀리는 멘트)×2 → 초심 멘트 순서', JSON.stringify(sp.slice(0, 7).map(x => x.s)) === JSON.stringify(wantSeq), sp.slice(0, 7).map(x => x.s).join(' → '));
  check('발표 음성 1.15배속(조금 더 빠르게)', sp.slice(0, 7).every(x => Math.abs((x.r || 0) - 1.15) < 0.01), sp.slice(0, 7).map(x => x.r).join(','));
  const g = i => sp[i + 1] && sp[i + 1].t - sp[i].t;
  // 무음 다듬은 길이 18.2초·14.8초를 1.15배속 → 15.9초·12.9초. 그보다 짧으면 잘린 것
  check('발표 멘트 안 잘림(시작·일반인 멘트 다 들은 뒤 다음)', g(0) >= 15500 && g(1) >= 12500, `${Math.round(g(0) / 100) / 10}초 · ${Math.round(g(1) / 100) / 10}초`);
  check('멘트 끝나고 다음까지 빨라짐(이름→다음 카드 간격 4.5초 안)', g(3) > 0 && g(3) < 4500, `${Math.round(g(3) / 100) / 10}초`);
  const strip = await ev(`[...document.querySelectorAll('#showStrip > span')].map(s=>s.textContent)`);
  check('공개된 카드 = 부른 이름(같은 순서)', strip.length >= 2 && strip[0].includes(lastTwo[0]) && strip[1].includes(lastTwo[1]) && /일반인/.test(strip[0]), strip.slice(0, 2).join(' / '));
  await click('#showAuto'); await click('#showMc'); await sleep(200);
  check('MC 음성 끄기 → 즉시 멈춤', /꺼짐/.test(await ev(`document.getElementById('showMc').textContent`)));
  await click('#showMc'); await click('#showClose'); await sleep(200);
  check('발표 모드 닫기', await ev(`document.getElementById('show').hidden`));
  // MC 음성(시상)
  const mcIds = await ev(`[...document.querySelectorAll('#mcbar button')].map(b=>b.dataset.mc).join(',')`);
  check('MC 음성 버튼(시상) 16·17·18·19·20·21', mcIds === '16,17,18,19,20,21', mcIds);
  await click('#mcbar button[data-mc="19"]'); await sleep(2000);
  check('MC 음성 재생 중 표시(급수 발표)', await ev(`!!document.querySelector('#mcbar button[data-mc="19"].on')`));
  await click('#mcbar button[data-mc="19"]');

  log('  ── 최종 상위 3:', fin.slice(0, 3).map(x => `${x.name}(${grade(x.overall)}${prize(x) ? ' ' + prize(x) : ''})`).join(', '), '/ 일반인:', fin.slice(-2).map(x => x.name).join(', '));
  check('페이지 오류·예외 0', errs.length === 0, errs.slice(0, 3).join(' | '));
  ws.close(); chrome.kill('SIGTERM');
  log(fail.length ? `결과: 실패 ${fail.length}건` : '결과: 전부 통과');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('리허설 오류:', e.message); chrome.kill('SIGTERM'); process.exit(2); });
