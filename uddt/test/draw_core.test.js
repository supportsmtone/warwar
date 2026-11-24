// 우당탕탕 조 추첨 — 순수 로직 단위 테스트 (Node 내장 node:test, 외부 패키지 없음)
// 실행: node --test web/test/   또는   node web/test/draw_core.test.js
// index.html 의 DRAW_CORE_BEGIN~END 블록을 그대로 추출해 검증한다(출하 코드 = 테스트 코드).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* DRAW_CORE_BEGIN[\s\S]*?\*\/([\s\S]*?)\/\* DRAW_CORE_END \*\//);
assert.ok(m, 'index.html 에서 DRAW_CORE 블록을 찾지 못함');
// 같은 realm 에서 실행(다른 realm 이면 deepStrictEqual 이 프로토타입 차이로 실패)
const factory = vm.runInThisContext('(function(module){' + m[1] + '\n})', { filename: 'draw_core.extracted.js' });
const mod = { exports: {} }; factory(mod);
const Core = mod.exports;

function names(n){ return Array.from({ length: n }, (_, i) => ({ no: i + 1, name: '참가자' + String(i + 1).padStart(2, '0') })); }

test('groupSizes: 27/28 은 엑셀 블록, 그 외는 일반화', () => {
  assert.deepEqual(Core.groupSizes(27), { sizes: [6,6,5,5,5], generalized: false });
  assert.deepEqual(Core.groupSizes(28), { sizes: [6,6,6,5,5], generalized: false });
  assert.deepEqual(Core.groupSizes(20), { sizes: [4,4,4,4,4], generalized: true });
  assert.deepEqual(Core.groupSizes(26), { sizes: [6,5,5,5,5], generalized: true });
  assert.deepEqual(Core.groupSizes(30), { sizes: [6,6,6,6,6], generalized: true });
  assert.deepEqual(Core.groupSizes(33), { sizes: [7,7,7,6,6], generalized: true });
  assert.deepEqual(Core.groupSizes(35), { sizes: [7,7,7,7,7], generalized: true });
  for (let n = 20; n <= 35; n++) assert.equal(Core.groupSizes(n).sizes.reduce((a, b) => a + b, 0), n);
});

test('sizeWarnings: 4명 이하·7명 이상 경고', () => {
  assert.equal(Core.sizeWarnings([6,6,5,5,5]).length, 0);
  assert.equal(Core.sizeWarnings([4,4,4,4,4]).length, 1);
  assert.equal(Core.sizeWarnings([7,7,7,7,7]).length, 1);
});

test('assignGroups: N=27 블록 6/6/5/5/5, 전원 1회·중복 0', () => {
  const r = Core.assignGroups(names(27), '20261114');
  assert.deepEqual(r.sizes, [6,6,5,5,5]);
  assert.deepEqual(r.groups.map(g => g.members.length), [6,6,5,5,5]);
  assert.equal(r.generalized, false);
  const all = r.groups.flatMap(g => g.members.map(m => m.no));
  assert.equal(all.length, 27);
  assert.equal(new Set(all).size, 27);
  assert.deepEqual([...all].sort((a, b) => a - b), names(27).map(p => p.no));
  // 추첨 순번 1..27 연속, 좌석 1..size
  assert.deepEqual(r.groups.flatMap(g => g.members.map(m => m.drawNo)), Array.from({ length: 27 }, (_, i) => i + 1));
  r.groups.forEach(g => assert.deepEqual(g.members.map(m => m.seat), Array.from({ length: g.size }, (_, i) => i + 1)));
  // order (RANK 순) 와 블록 채움이 일치 (엑셀: 순위 1~6 → 1조, 7~12 → 2조 …)
  assert.deepEqual(r.order.slice(0, 6), r.groups[0].members.map(m => m.no));
  assert.deepEqual(r.order.slice(6, 12), r.groups[1].members.map(m => m.no));
  assert.deepEqual(r.order.slice(12, 17), r.groups[2].members.map(m => m.no));
});

test('assignGroups: N=28 블록 6/6/6/5/5, 전원 1회·중복 0', () => {
  const r = Core.assignGroups(names(28), 'abc');
  assert.deepEqual(r.sizes, [6,6,6,5,5]);
  const all = r.groups.flatMap(g => g.members.map(m => m.no));
  assert.equal(all.length, 28); assert.equal(new Set(all).size, 28);
});

test('assignGroups: 같은 seed → 같은 결과(재현), 다른 seed → 다른 결과', () => {
  const a = Core.assignGroups(names(27), '123456789');
  const b = Core.assignGroups(names(27), '123456789');
  assert.deepEqual(a, b);
  const c = Core.assignGroups(names(27), '123456788');
  assert.notDeepEqual(a.order, c.order);
  // 문자열 배열 입력도 동일 결과(no=index+1)
  const d = Core.assignGroups(names(27).map(p => p.name), '123456789');
  assert.deepEqual(d.order, a.order);
});

test('assignGroups: 유효성 — 인원 범위·중복 이름·빈 이름·seed 누락', () => {
  assert.throws(() => Core.assignGroups(names(19), '1'), /20명 이상/);
  assert.throws(() => Core.assignGroups(names(36), '1'), /35명 이하/);
  const dup = names(27); dup[5].name = dup[0].name;
  assert.throws(() => Core.assignGroups(dup, '1'), /같은 이름/);
  const empty = names(27); empty[3].name = '  ';
  assert.throws(() => Core.assignGroups(empty, '1'), /비어/);
  assert.throws(() => Core.assignGroups(names(27)), /seed/);
  assert.doesNotThrow(() => Core.assignGroups(names(20), '1'));
  assert.doesNotThrow(() => Core.assignGroups(names(35), '1'));
});

test('분포 편향 없음: 10,000 seed, 각 사람×각 조 빈도가 기대값 ±10% 이내 (N=27)', () => {
  const N = 27, RUNS = 10000, list = names(N);
  const freq = Array.from({ length: N }, () => [0,0,0,0,0]);
  const posFreq = Array.from({ length: N }, () => new Array(N).fill(0)); // 추첨 순번 분포
  for (let s = 0; s < RUNS; s++) {
    const r = Core.assignGroups(list, 'seed-' + s);
    r.groups.forEach(g => g.members.forEach(m => { freq[m.no - 1][g.no - 1]++; posFreq[m.no - 1][m.drawNo - 1]++; }));
  }
  const sizes = [6,6,5,5,5];
  let worst = 0;
  for (let p = 0; p < N; p++) for (let g = 0; g < 5; g++) {
    const expected = RUNS * sizes[g] / N;
    const dev = Math.abs(freq[p][g] - expected) / expected;
    worst = Math.max(worst, dev);
    assert.ok(dev <= 0.10, `참가자${p + 1} ${g + 1}조 빈도 ${freq[p][g]} (기대 ${expected.toFixed(0)}, 편차 ${(dev * 100).toFixed(1)}%)`);
  }
  // 1번 순번(첫 자리)에 특정인이 몰리지 않음 (기대 370, ±25%)
  for (let p = 0; p < N; p++) {
    const dev = Math.abs(posFreq[p][0] - RUNS / N) / (RUNS / N);
    assert.ok(dev <= 0.25, `참가자${p + 1} 1번 순번 빈도 ${posFreq[p][0]}`);
  }
  console.log(`  분포 검사: 10,000회 · 최대 편차 ${(worst * 100).toFixed(2)}% (허용 10%)`);
});

test('분포 편향 없음: N=28 도 ±10% (10,000 seed)', () => {
  const N = 28, RUNS = 10000, list = names(N), sizes = [6,6,6,5,5];
  const freq = Array.from({ length: N }, () => [0,0,0,0,0]);
  for (let s = 0; s < RUNS; s++) Core.assignGroups(list, 's28-' + s).groups.forEach(g => g.members.forEach(m => freq[m.no - 1][g.no - 1]++));
  let worst = 0;
  for (let p = 0; p < N; p++) for (let g = 0; g < 5; g++) { const exp = RUNS * sizes[g] / N; const dev = Math.abs(freq[p][g] - exp) / exp; worst = Math.max(worst, dev); assert.ok(dev <= 0.10); }
  console.log(`  분포 검사(28): 최대 편차 ${(worst * 100).toFixed(2)}%`);
});

test('makeRng.int: 범위·편향 없는 정수', () => {
  const rng = Core.makeRng('x');
  const cnt = new Array(7).fill(0);
  for (let i = 0; i < 70000; i++) { const v = rng.int(7); assert.ok(v >= 0 && v < 7); cnt[v]++; }
  cnt.forEach(c => assert.ok(Math.abs(c - 10000) < 500, 'int(7) 분포 ' + cnt.join(',')));
  assert.throws(() => rng.int(0));
});

test('newSeed: crypto 기반 9자리 숫자, 연속 호출 100회 중복 없음', () => {
  const set = new Set();
  for (let i = 0; i < 100; i++) { const s = Core.newSeed(); assert.match(s, /^[1-9]\d{8}$/); set.add(s); }
  assert.ok(set.size >= 99);
});

test('parseNames: 줄 단위·번호 제거·나이 분리·빈 줄 무시', () => {
  const r = Core.parseNames('1. 김우당 41\n2) 이탕탕\n\n  박요절,38 \n3: 최복통\t45\n4] 홍 길동 200\n');
  assert.deepEqual(r, [
    { name: '김우당', age: 41 }, { name: '이탕탕' }, { name: '박요절', age: 38 }, { name: '최복통', age: 45 }, { name: '홍 길동 200' }
  ]);
  assert.deepEqual(Core.parseNames(''), []);
  assert.equal(Core.parseNames('가'.repeat(40))[0].name.length, 20);
});

test('validateParticipants: 정상 27명 → 오류 0', () => {
  assert.equal(Core.validateParticipants(names(27)).length, 0);
  assert.equal(Core.validateParticipants(names(28)).length, 0);
});
