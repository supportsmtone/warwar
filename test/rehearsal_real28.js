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
  await ev('window.confirm = () => true; window.__plays=[]; const _p=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(){ window.__plays.push({src:(this.src||"").split("/audio/")[1]||this.src, t:Date.now(), ov:(document.getElementById("overlay")||{}).textContent||""}); return _p.apply(this, arguments); }; true');   // 리허설 프로필 전용

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
  const tA = Date.now();
  await click('#btnDraw'); await sleep(500);
  // 건너뛰기 없이 끝까지(이름이 꽂힐 때마다 방송)
  await until(`!!${S}.draw && !!${S}.draw.groups`, 60000);
  await until(`!!document.querySelector('#mcbar .annbtn.on')`, 15000).catch(() => {});
  check('조편성 연출 시작과 함께 이름 방송 시작', await ev(`!!document.querySelector('#mcbar .annbtn.on')`));
  await until(`window.__spoken.size === ${N} && !document.querySelector('#mcbar .annbtn.on')`, 120000).catch(() => {});
  check(`조편성: 이름이 조에 꽂힐 때마다 방송 ${N}명(꽂힌 칩 강조)`, await ev('window.__spoken.size') === N, `${await ev('window.__spoken.size')}명 · ${Math.round((Date.now() - tA) / 1000)}초`);
  const plays1 = await ev('window.__plays.map(x=>x.src)');
  check('추첨 멘트가 먼저(카운트다운·이름 전)', plays1[0] === 'names/draw_pre.mp3' && plays1[1] === 'names/g1.mp3' && !plays1.includes('names/p_intro.mp3'), plays1.slice(0, 4).join(' → '));
  const spokenOrder = await ev('[...window.__spoken]');
  const drawOrder = await ev(`${S}.draw.groups.flatMap(g=>g.members.map(m=>String(m.no)))`);
  check('방송 순서 = 1조→5조 꽂히는 순서', JSON.stringify(spokenOrder) === JSON.stringify(drawOrder));
  await click('#btnLock');
  await until(`${S}.draw.locked`);
  const sizes = await ev(`${S}.draw.groups.map(g=>g.members.length)`);
  check('조 편성 ' + SIZES.join('/'), JSON.stringify(sizes) === JSON.stringify(SIZES), JSON.stringify(sizes));
  const drawn = await ev(`${S}.draw.groups.flatMap(g=>g.members.map(m=>m.name))`);
  check('추첨 중복·누락 없음', new Set(drawn).size === N && drawn.length === N);

  async function playHalf(which, label, hash){
    await tab('p-' + which);
    check(`주소 #${hash}`, await ev('location.hash') === '#' + hash);
    const gb = await ev(`({boxes:document.querySelectorAll('#p-${which} .gbox').length, rows:document.querySelectorAll('#p-${which} tr[data-act="pad"]').length, heads:[...document.querySelectorAll('#p-${which} .gbox h3')].map(h=>h.textContent).join(',')})`);
    check(`${label} 기본 화면 = 조별 대진표 5개 표`, gb.boxes === 5 && gb.rows === EXPM, JSON.stringify(gb));
    const ids = await ev(`[...document.querySelectorAll('#p-${which} tr[data-act="pad"]')].map(r=>r.dataset.id)`);
    for (const mid of ids) {
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
    const nScored = await ev(`Object.keys(${S}.bracket.${which}.scores).length`);
    check(`${label} ${ids.length}경기 숫자패드 입력·표 표시`, nScored === ids.length && ids.length === EXPM, `${nScored}/${ids.length}`);
    // 완전 동률이면 순위 탭의 동전 던지기
    for (let k = 0; k < 10 && await ev(`!!document.querySelector('#p-${which} .rtools .badge.tie')`); k++) {
      await click(`#p-${which} [data-act="sub"][data-sub="rank"]`); await sleep(200);
      await click(`#p-${which} [data-act="coin"]`); await sleep(300);
      log('   (동률 → 동전 던지기)');
      await click('#coinFlip'); await sleep(4500);
      if (!(await ev(`document.getElementById('coin').hidden`))) await click('#coinClose');
      await sleep(400);
      await click(`#p-${which} [data-act="sub"][data-sub="match"]`);
    }
    await click(`#p-${which} [data-act="lock"]`);
    await until(`${S}.bracket.${which}.locked`, 8000).catch(() => {});
    check(`${label} 확정`, await ev(`!!${S}.bracket.${which}.locked`));
  }
  await playHalf('r1', '전반전', 'round1');

  await tab('p-place');
  check('주소 #placement', await ev('location.hash') === '#placement');
  check('배치 방식 = 엑셀(각 조 1위→1조)', await ev(`${S}.settings.placeMode`) === 'excel');
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
  function standings(groups, scores){
    const x = new Map(); groups.forEach(g => g.members.forEach(m => x.set(m.no, { no: m.no, name: P.get(m.no).name, g: g.no, w: 0, l: 0, diff: 0 })));
    for (const m of matchesOf(groups)) { const s = scores[m.id]; if (!s) continue;
      m.a.forEach(n => { const p = x.get(n); p.diff += s.a - s.b; if (s.a > s.b) p.w++; else if (s.b > s.a) p.l++; });
      m.b.forEach(n => { const p = x.get(n); p.diff += s.b - s.a; if (s.b > s.a) p.w++; else if (s.a > s.b) p.l++; }); }
    for (const p of x.values()) p.score = (p.w / ((p.w + p.l) || 1)) * 1000 + p.diff + (+P.get(p.no).age || 0) * 0.03;
    return groups.map(g => [...x.values()].filter(p => p.g === g.no).sort((a, b) => b.score - a.score));
  }
  const g1 = standings(st.bracket.r1.groups, st.bracket.r1.scores);
  const dupe1 = g1.some(g => g.some((p, i) => i && Math.abs(p.score - g[i - 1].score) < 1e-9));
  const winners = g1.map(g => g[0]).sort((a, b) => b.score - a.score);
  const rest = g1.flatMap(g => g.slice(1)).sort((a, b) => b.score - a.score);
  const order = winners.concat(rest).map(p => p.no); let k = 0;
  const exp = SIZES.map(s => order.slice(k, k += s).sort((a, b) => a - b));
  const app = st.bracket.r2.groups.map(g => g.members.map(m => m.no).sort((a, b) => a - b));
  check('후반전 배치 = 독립 계산(엑셀 방식)', JSON.stringify(exp) === JSON.stringify(app) || dupe1, dupe1 ? '전반 완전 동률 있음(동전 결정) — 참고' : '');
  const g2 = standings(st.bracket.r2.groups, st.bracket.r2.scores);
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
  const e1 = g1.map(g => g[g.length - 1].name), e2 = g2.map(g => g[g.length - 1].name);
  check('꼴찌 5천원 표시(전반 5·후반 5) = 독립 계산', JSON.stringify(L1) === JSON.stringify(e1) && JSON.stringify(L2) === JSON.stringify(e2), `전반 ${L1.join(',')} / 후반 ${L2.join(',')}`);
  // MC 음성(시상)
  await tab('p-award');
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
