// 우당탕탕 2단계(전반전→후반전→급수·시상) 순수 로직 단위 테스트 + 전체 흐름 시뮬레이션
// 실행: node --test web/test/bracket_core.test.js   (외부 패키지 없음)
// 엑셀 캐시 값 대조는 excel_crosscheck.js(비공개 엑셀을 실행 시점에만 읽음) 참고.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DrawCore, BracketCore: B } = require('./load_cores.js');

const SIM_RUNS = +(process.env.UDDT_SIM_RUNS || 1000);   // 인원별 반복 횟수
const ANALYSIS = path.join(__dirname, '..', '..', 'analysis');   // 비공개 작업 폴더(공개 저장소에는 없음 → 해당 테스트 skip)

// 가명 명단(2글자 영문, 엑셀 샘플과 같은 방식)
function roster(n){ const a = 'abcdefghijklmnopqrstuvwxyz'; return Array.from({ length: n }, (_, i) => ({ no: i + 1, name: a[i % 26] + a[(i * 7 + Math.floor(i / 26)) % 26] + (i >= 26 ? String(i) : '') })); }

// 독립 참조 구현(analysis/reimplement_check.py compute_group 의 JS 이식) — 엔진과 다른 코드로 같은 답이 나오는지 확인
function refGroup(members, ages, scores, tpl){
  const st = {}; members.forEach(m => st[m] = { w: 0, l: 0, gf: 0, ga: 0 });
  tpl.forEach(([[a1, a2], [b1, b2]], i) => {
    const A = [members[a1 - 1], members[a2 - 1]], Bt = [members[b1 - 1], members[b2 - 1]];
    const s = scores[i]; if (!s) return; const [sa, sb] = s;
    A.forEach(p => { st[p].gf += sa; st[p].ga += sb; }); Bt.forEach(p => { st[p].gf += sb; st[p].ga += sa; });
    if (sa > sb) { A.forEach(p => st[p].w++); Bt.forEach(p => st[p].l++); } else if (sb > sa) { Bt.forEach(p => st[p].w++); A.forEach(p => st[p].l++); }
  });
  const pts = members.map(m => { const s = st[m]; return s.w + s.l ? s.w / (s.w + s.l) * 1000 + (s.gf - s.ga) + (ages[m] || 0) * 0.03 : null; });
  const rank = pts.map(v => pts.filter(w => w > v).length + 1);
  return { st, pts, rank };
}

test('템플릿 = rules_spec 명세(5인 5경기·6인 6경기, 좌석)', () => {
  assert.deepEqual(B.TEMPLATES[5], [[[1,5],[3,4]], [[1,4],[2,3]], [[2,4],[3,5]], [[1,2],[4,5]], [[1,3],[2,5]]]);
  assert.deepEqual(B.TEMPLATES[6], [[[1,4],[2,6]], [[1,6],[3,5]], [[2,5],[4,6]], [[1,5],[2,3]], [[2,4],[3,6]], [[1,3],[4,5]]]);
  const spec = path.join(ANALYSIS, 'rules_spec.json');
  if (fs.existsSync(spec)) {
    const j = JSON.parse(fs.readFileSync(spec, 'utf8'));
    for (const n of ['5', '6']) assert.deepEqual(B.TEMPLATES[n], j.preliminary_round.templates[n].matches.map(m => [m.A, m.B]));
  }
});

test('템플릿 성질: 5인=각자 4경기·파트너 4명 1회씩, 6인=각자 4경기·1-2/3-4/5-6 은 파트너 아님', () => {
  for (const n of [5, 6]) {
    const games = Array(n + 1).fill(0), partner = {};
    for (const [A, Bt] of B.TEMPLATES[n]) {
      [...A, ...Bt].forEach(s => games[s]++);
      for (const [x, y] of [A, Bt]) { const k = Math.min(x, y) + '-' + Math.max(x, y); partner[k] = (partner[k] || 0) + 1; }
      assert.equal(new Set([...A, ...Bt]).size, 4);
    }
    for (let s = 1; s <= n; s++) assert.equal(games[s], 4, `${n}인 좌석 ${s}`);
    if (n === 5) { assert.equal(Object.keys(partner).length, 10); assert.ok(Object.values(partner).every(v => v === 1)); }
    if (n === 6) ['1-2', '3-4', '5-6'].forEach(k => assert.ok(!partner[k], k));
  }
});

test('템플릿 = 엑셀 수식 덤프(예선·본선 AK/AL/AO/AP 캐시 이름)', (t) => {
  const dumpDir = path.join(ANALYSIS, 'formula_dump');
  if (!fs.existsSync(dumpDir)) { t.skip('비공개 analysis/formula_dump 없음(공개 저장소)'); return; }
  const parseCsv = txt => { const rows = []; let i = 0, f = '', row = [], q = false; for (; i < txt.length; i++) { const c = txt[i]; if (q) { if (c === '"' && txt[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; } if (f || row.length) { row.push(f); rows.push(row); } return rows; };
  let compared = 0;
  for (const sheetName of ['대진표_예선 대진표 생성 및 경기결과 입력.csv', '대진표_본선 대진표 생성 및 경기결과 입력.csv']) {
    const cell = new Map(parseCsv(fs.readFileSync(path.join(dumpDir, sheetName), 'utf8')).slice(1).map(r => [r[0], r[2]]));
    // 좌석표 AC6:AH11 → 조별 좌석 이름(조 g = 열 AC+g-1), 경기 AK/AL/AO/AP
    const cols = ['AC', 'AD', 'AE', 'AF', 'AG'];
    const blocks = [10, 21, 32, 43, 54];
    for (let g = 1; g <= 5; g++) {
      const seats = []; for (let r = 6; r <= 11; r++) { const v = cell.get(cols[g - 1] + r); if (v) seats.push(v); }
      const tpl = B.TEMPLATES[seats.length]; assert.ok(tpl, `${sheetName} ${g}조 ${seats.length}명`);
      tpl.forEach(([A, Bt], i) => {
        const r = blocks[g - 1] + i;
        assert.deepEqual([cell.get('AK' + r), cell.get('AL' + r), cell.get('AO' + r), cell.get('AP' + r)], [seats[A[0] - 1], seats[A[1] - 1], seats[Bt[0] - 1], seats[Bt[1] - 1]], `${sheetName} ${g}조 ${i + 1}경기`);
        compared++;
      });
    }
  }
  assert.equal(compared, 56);   // 28명: 28경기 × 2(예선·본선)
});

test('buildMatches: 코트=조 번호(설정 변경 가능), 시각=시작+(라운드-1)×13분', () => {
  const groups = DrawCore.assignGroups(roster(28), '1').groups;
  const ms = B.buildMatches(groups, { start: '07:00', roundMinutes: 13 });
  assert.equal(ms.length, 28);
  assert.deepEqual([...new Set(ms.map(m => m.time))], ['07:00', '07:13', '07:26', '07:39', '07:52', '08:05']);
  assert.ok(ms.every(m => m.court === m.g));
  const ms2 = B.buildMatches(groups, { start: '08:25', roundMinutes: 15, courtOfGroup: [5, 4, 3, 2, 1] });
  assert.equal(ms2.find(m => m.id === '1-3').court, 5); assert.equal(ms2.find(m => m.id === '1-3').time, '08:55');
  assert.throws(() => B.buildMatches([{ no: 1, members: roster(4) }], {}), /5·6인/);
  assert.equal(B.addMinutes('23:50', 20), '00:10');
});

test('집계·순위: 독립 참조 구현과 무작위 10,000조 일치(동점 경기·나이 결측 포함)', () => {
  const rng = DrawCore.makeRng('ref');
  for (let it = 0; it < 10000; it++) {
    const n = 5 + rng.int(2);
    const members = roster(n);
    const ages = {}; members.forEach(m => { if (rng.int(3)) ages[m.name] = 20 + rng.int(40); });
    const scores = B.TEMPLATES[n].map(() => { const r = rng.int(10); if (r === 0) return null; if (r === 1) { const x = rng.int(22); return [x, x]; } const lo = rng.int(20); return rng.int(2) ? [21, lo] : [lo, 21]; });
    const ref = refGroup(members.map(m => m.name), ages, scores, B.TEMPLATES[n]);
    const g = { no: 1, members };
    const ms = B.buildMatches([g], {});
    const sc = {}; ms.forEach((m, i) => { if (scores[i]) sc[m.id] = { a: scores[i][0], b: scores[i][1] }; });
    const st = B.groupStats(g, ms, sc, no => ages[members[no - 1].name]);
    st.forEach((s, i) => {
      const r = ref.st[s.name];
      assert.deepEqual([s.w, s.l, s.gf, s.ga], [r.w, r.l, r.gf, r.ga]);
      if (ref.pts[i] !== null) assert.equal(s.score, ref.pts[i]);
    });
    if (ref.pts.every(v => v !== null)) assert.deepEqual(B.excelRank(st.map(s => s.score)), ref.rank);
  }
});

test('rankGroup: 완전 동률은 ties 로 남고, 결정(order) 이 있으면 그 순서', () => {
  const stats = [{ no: 1, seat: 1, score: 500 }, { no: 2, seat: 2, score: 750 }, { no: 3, seat: 3, score: 500 }, { no: 4, seat: 4, score: 250 }];
  const r = B.rankGroup(stats, {}, 'H1');
  assert.deepEqual(r.order, [2, 1, 3, 4]);
  assert.equal(r.ties.length, 1); assert.deepEqual(r.ties[0].nos, [1, 3]);
  assert.equal(r.excelRank.get(1), 2); assert.equal(r.excelRank.get(3), 2);
  const dec = { [r.ties[0].key]: { order: [3, 1], method: 'coin' } };
  const r2 = B.rankGroup(stats, dec, 'H1');
  assert.deepEqual(r2.order, [2, 3, 1, 4]); assert.equal(r2.ties.length, 0); assert.equal(r2.blocks[0].method, 'coin');
  // 점수가 바뀌어 동률이 깨지면 예전 결정은 무시
  const r3 = B.rankGroup([{ no: 1, seat: 1, score: 501 }, stats[1], stats[2], stats[3]], dec, 'H1');
  assert.deepEqual(r3.order, [2, 1, 3, 4]); assert.equal(r3.ties.length, 0);
});

test('validateScore: 음수·빈칸 오류, 동점·듀스 2점 차 아님·21 미달 경고', () => {
  assert.equal(B.validateScore(21, 15).errors.length + B.validateScore(21, 15).warnings.length, 0);
  assert.equal(B.validateScore(22, 20).warnings.length, 0);
  assert.equal(B.validateScore(30, 29).warnings.length, 0);
  assert.ok(B.validateScore(-1, 21).errors.length);
  assert.ok(B.validateScore('', 21).errors.length);
  assert.ok(B.validateScore(1.5, 21).errors.length);
  assert.match(B.validateScore(21, 21).warnings[0], /동점/);
  assert.match(B.validateScore(21, 20).warnings[0], /듀스/);
  assert.match(B.validateScore(25, 21).warnings[0], /2점 차/);
  assert.match(B.validateScore(18, 15).warnings[0], /도달/);
  assert.equal(B.validateScore(15, 9, 15).warnings.length, 0);
});

test('급수: 포스터 구간(1 자강·2 준자강·3~5 S·6~9 A·10~13 B·14~18 C·19~22 D·23~ 초심·하위 2명 일반인) / 엑셀 고정표', () => {
  const G = (r, n) => B.gradeOf({ overall: r }, n, 'poster');
  assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 13, 14, 18, 19, 22, 23, 26, 27, 28].map(r => G(r, 28)), ['자강','준자강','S','S','A','A','B','B','C','C','D','D','초심','초심','일반인','일반인']);
  assert.equal(G(25, 27), '초심'); assert.equal(G(26, 27), '일반인');
  assert.equal(G(23, 25), '초심'); assert.equal(G(24, 25), '일반인');
  const E = (g, k) => B.gradeOf({ group: g, rankInGroup: k }, 28, 'excel');
  assert.deepEqual([E(1, 1), E(1, 2), E(1, 6), E(2, 5), E(3, 4), E(4, 3), E(5, 1), E(5, 2), E(5, 5)], ['자강','준자강','A','B','C','D','D','초심','일반인']);
  assert.equal(E(5, 6), '일반인'); assert.equal(E(4, 6), 'D');   // 30명(6/6/6/6/6) 확장: 표 밖 순위는 그 조 마지막 급수
});

test('상품: 1조 1·2·3등 20/10/5만원(1·2등 준자강 출전 안내), 2~5조 1등 3만원', () => {
  assert.equal(B.prizeOf({ group: 1, rankInGroup: 1 }).amount, 200000);
  assert.match(B.prizeOf({ group: 1, rankInGroup: 2 }).note, /2027년 1월/);
  assert.equal(B.prizeOf({ group: 1, rankInGroup: 3 }).note, '');
  assert.equal(B.prizeOf({ group: 4, rankInGroup: 1 }).amount, 30000);
  assert.equal(B.prizeOf({ group: 2, rankInGroup: 2 }), null);
});

test('벌금·출석판: 지각 3만·무단결석 5만·복장 3만·꼴찌 5천(횟수), 차감권 2만 1회, 벌금왕·출석왕 1~3등', () => {
  const people = roster(5).map(p => Object.assign(p, { absent: p.no === 5 }));
  const fb = B.fineBoard(people, { 1: { late: true, dress: true, coupon: true }, 2: { noshow: true, prevFine: 10000 }, 3: { prevAttend: 9 }, 4: { coupon: true } }, { 1: 1, 4: 2 });
  const r = Object.fromEntries(fb.rows.map(x => [x.no, x]));
  assert.equal(r[1].gross, 65000); assert.equal(r[1].deduct, 20000); assert.equal(r[1].pay, 45000);
  assert.equal(r[2].gross, 50000); assert.equal(r[2].seasonFine, 60000); assert.equal(r[2].attendToday, 0);
  assert.equal(r[4].gross, 10000); assert.equal(r[4].deduct, 10000); assert.equal(r[4].pay, 0);   // 차감은 부과액까지만
  assert.equal(r[5].attendToday, 0); assert.equal(r[3].seasonAttend, 10);
  assert.equal(fb.totalGross, 125000); assert.equal(fb.totalPay, 95000);
  assert.deepEqual(fb.fineKing.map(k => [k.no, k.rank, k.prize]), [[1, 1, 50000], [2, 2, 30000], [4, 3, 20000]]);
  assert.equal(fb.attendKing[0].no, 3);
});

/* ===== 전체 흐름 시뮬레이션: 추첨 → 전반전 무작위 점수 → 동률 동전 → 확정 → 후반전 배치 → 후반전 → 결과 ===== */
function randomScore(rng, target){
  const r = rng.int(40);
  if (r === 0) { const x = rng.int(target + 1); return { a: x, b: x }; }          // 드문 동점 입력
  let hi = target, lo = rng.int(target - 1);
  if (r < 5) { hi = target + 1 + rng.int(8); lo = hi - 2; }                         // 듀스
  return rng.int(2) ? { a: hi, b: lo } : { a: lo, b: hi };
}
function resolveTies(half, ev, rng, prefix){
  for (const g of ev.groups) for (const t of g.rank.ties) half.ties[t.key] = { order: B.coinOrder(t.nos, rng), method: 'coin' };
}
function runFlow(n, seed, placeMode, gradeMode){
  const rng = DrawCore.makeRng('sim-' + seed);
  const people = roster(n);
  const ages = {}; people.forEach(p => { if (rng.int(4)) ages[p.no] = 20 + rng.int(45); });   // 나이 일부 결측
  const ageOf = no => ages[no];
  const draw = DrawCore.assignGroups(people, 'd' + seed);
  const opt1 = { start: '07:00', roundMinutes: 13, tiePrefix: 'R1-' };
  const half1 = { groups: draw.groups.map(g => ({ no: g.no, members: g.members.map(m => ({ no: m.no, name: m.name })) })), scores: {}, ties: {} };
  let ev1 = B.evaluateHalf(half1, opt1, ageOf);
  ev1.matches.forEach(m => half1.scores[m.id] = randomScore(rng, 21));
  ev1 = B.evaluateHalf(half1, opt1, ageOf);
  resolveTies(half1, ev1, rng);
  ev1 = B.evaluateHalf(half1, opt1, ageOf);
  if (!ev1.ready) throw new Error('전반전 ready 아님');
  const sizes = DrawCore.groupSizes(n).sizes;
  let pl = B.placement(ev1, placeMode, sizes, {});
  const pdec = {};
  for (const t of pl.ties) pdec[t.key] = { order: B.coinOrder(t.nos, rng), method: 'coin' };
  pl = B.placement(ev1, placeMode, sizes, pdec);
  if (pl.ties.length) throw new Error('배치 동률 미해결');
  const opt2 = { start: '08:25', roundMinutes: 13, tiePrefix: 'R2-' };
  const half2 = { groups: pl.groups.map(g => ({ no: g.no, members: g.members.map(m => ({ no: m.no, name: m.name })) })), scores: {}, ties: {} };
  let ev2 = B.evaluateHalf(half2, opt2, ageOf);
  ev2.matches.forEach(m => half2.scores[m.id] = randomScore(rng, 21));
  ev2 = B.evaluateHalf(half2, opt2, ageOf);
  resolveTies(half2, ev2, rng);
  ev2 = B.evaluateHalf(half2, opt2, ageOf);
  if (!ev2.ready) throw new Error('후반전 ready 아님');
  const res = B.results(ev2, gradeMode);
  return { people, draw, ev1, pl, ev2, res, sizes };
}

for (const n of [28, 27, 25, 30]) {
  test(`전체 흐름 시뮬 ${n}명 × ${SIM_RUNS}회 × (배치 엑셀/포스터 교대, 급수 포스터/엑셀 교대): 오류 0·전원 급수 1개·조 크기 보존`, () => {
    let errors = 0, ties1 = 0, tiesP = 0;
    const gradeCount = {};
    for (let i = 0; i < SIM_RUNS; i++) {
      const placeMode = i % 2 ? 'poster' : 'excel', gradeMode = i % 4 < 2 ? 'poster' : 'excel';
      let f;
      try { f = runFlow(n, n * 100000 + i, placeMode, gradeMode); } catch (e) { errors++; if (errors < 3) console.error(e); continue; }
      const { people, ev1, pl, ev2, res, sizes } = f;
      // 경기 수·1인 4경기
      assert.equal(ev1.total, sizes.reduce((s, z) => s + (z === 6 ? 6 : 5), 0));
      for (const ev of [ev1, ev2]) for (const g of ev.groups) for (const s of g.stats) assert.equal(s.played, 4);
      // 조 크기 보존(전반=후반=1단계 블록)
      assert.deepEqual(ev1.groups.map(g => g.members.length), sizes);
      assert.deepEqual(pl.groups.map(g => g.members.length), sizes);
      // 배치: 전원 1회
      const placed = pl.groups.flatMap(g => g.members.map(m => m.no)).sort((a, b) => a - b);
      assert.deepEqual(placed, people.map(p => p.no));
      if (placeMode === 'excel') {
        const winners = ev1.groups.map(g => g.rank.order[0]).sort((a, b) => a - b);
        assert.deepEqual(pl.groups[0].members.slice(0, 5).map(m => m.no).sort((a, b) => a - b), winners);   // 각 조 1위 → 1조
      } else {
        // 포스터: r위는 r조 또는 넘침 보정으로 인접 조(뒤로 밀림만, 앞당김 없음)
        for (const g of pl.groups) for (const m of g.members) assert.ok(g.no >= Math.min(m.fromRank, 5) - 1 && g.no <= m.fromRank + 1, `포스터 배치 ${m.fromRank}위→${g.no}조`);
      }
      // 결과: 전원 1개 급수, 순위 1..n
      assert.equal(res.length, n);
      assert.deepEqual(res.map(r => r.overall), Array.from({ length: n }, (_, k) => k + 1));
      assert.equal(new Set(res.map(r => r.no)).size, n);
      res.forEach(r => { assert.ok(B.GRADES.includes(r.grade)); gradeCount[r.grade] = (gradeCount[r.grade] || 0) + 1; });
      if (gradeMode === 'poster') { assert.equal(res[0].grade, '자강'); assert.equal(res[n - 1].grade, '일반인'); assert.equal(res.filter(r => r.grade === '일반인').length, 2); }
      // 급수는 순위가 내려갈수록 같거나 낮아짐(포스터 모드)
      if (gradeMode === 'poster') for (let k = 1; k < n; k++) assert.ok(B.GRADES.indexOf(res[k].grade) >= B.GRADES.indexOf(res[k - 1].grade));
      // 상품 7건(1조 3 + 2~5조 1등 4), 꼴찌 조당 1명
      assert.equal(res.filter(r => r.prize).length, 7);
      assert.equal(res.filter(r => r.last).length, 5);
      assert.equal(ev1.groups.filter(g => g.last).length, 5);
      ties1 += ev1.groups.reduce((s, g) => s + g.rank.blocks.length, 0); tiesP += pl.decided.length;
    }
    assert.equal(errors, 0);
    console.log(`  sim ${n}명: ${SIM_RUNS}회 오류 0 · 전반 동률 결정 ${ties1}건 · 배치 경계 동률 ${tiesP}건 · 급수 분포 ${JSON.stringify(gradeCount)}`);
  });
}
