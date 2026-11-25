/* HQ 사옥 — 화면 패널·데이터 수신. 3D 는 tower.js 가 window.HQ 를 통해 같은 상태를 쓴다. */
'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const listeners = {};
  const HQ = window.HQ = {
    cfg: null, data: null, staff: [], byId: {}, mode: { floor: null }, sel: null, gymOrder: [], gymSlots: {}, actualVeh: {}, cafeNow: {}, drinks: {}, outs: {}, hide: {},
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    emit(ev, arg) { (listeners[ev] || []).forEach(fn => { try { fn(arg); } catch (e) { console.error(e); } }); },
    stat(id) { return statOf(id); },
    focusFloor(n) { HQ.mode.floor = n; HQ.sel = null; HQ.hideCar(); render(); HQ.emit('mode', n); },
    hideCar() { const c = document.getElementById('carcard'); if (c) c.hidden = true; },
    showCar(owner, state) {   // 임원 차량 정보 카드(3D 에서 차를 누르거나 주차장 목록에서 고를 때)
      const v = ((HQ.cfg.vehicles && HQ.cfg.vehicles.exec) || []).find(x => x.owner === owner), c = document.getElementById('carcard'); if (!v || !c) return; const o = HQ.byId[owner] || {};
      c.innerHTML = `<button class="x" aria-label="닫기">×</button>${v.image ? `<img src="${esc(v.image)}" alt="">` : ''}<div class="in"><h3>${esc(v.model)}<span class="st">${state === 'parked' ? '주차 중' : state === 'gone' ? '외근 중' : '이동 중'}</span></h3><p>${esc(o.name || '')} ${esc(o.title || '')} 전용 · ${esc(v.colorName || '')} · ${esc(v.plate || '')}</p><p>${esc(v.note || '')}</p></div>`;
      c.hidden = false; c.querySelector('.x').onclick = () => { c.hidden = true; }; },
    refresh() { render(); },   // 3D 쪽에서 패널만 다시 그리게 할 때
    selectStaff(id) {
      const st = statOf(id); if (!st) return;
      if (HQ.mode.floor !== st.floorNow) { HQ.mode.floor = st.floorNow; HQ.emit('mode', st.floorNow); }
      HQ.sel = id; render(); HQ.emit('select', id);
    },
  };
  let resolveReady; HQ.ready = new Promise(r => { resolveReady = r; });

  const STATE_KO = { working: '근무 중', directing: '지휘 중', lounge: '휴게 중', gym: '운동 중', present: '재석', out: '외근 중', heli: '긴급 외근' };
  const HQ_CO = { name: '', color: '#FFD23F', color2: '#FFE9A6' };   // 대표(특정 회사 소속 아님)
  const flabel = f => f.label || f.n + 'F';
  const fkey = f => f.lot ? -1 : f.cafe ? 0.5 : f.n;   // 레일 순서: 옥상 → 5~1층 → 카페 → 주차장
  const DRINK_KO = { hot: '따뜻한 커피', ice: '아이스 아메리카노', ade: '에이드', matcha: '말차 라떼', juice: '과일 주스' };
  const cafeHere = () => HQ.staff.filter(s => HQ.cafeNow && HQ.cafeNow[s.id]);
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function ago(iso) {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (m < 1) return '방금'; if (m < 60) return m + '분'; const h = Math.floor(m / 60); return h < 24 ? `${h}시간 ${m % 60}분` : `${Math.floor(h / 24)}일`;
  }
  const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

  function raw(id) {
    const s = HQ.byId[id]; if (!s || !HQ.data) return { state: 'idle', note: '', since: null };
    const c = HQ.data.companies[s.company];
    return (c && c.roles && c.roles[s.role]) || { state: 'idle', note: '', since: null };
  }
  // 한 사람의 현재 상태·위치(책상/휴게실/1층 운동). 3D 와 패널이 이 한 곳의 판정을 같이 쓴다.
  function statOf(id) {
    const s = HQ.byId[id]; if (!s) return null;
    const a = raw(id), o = HQ.outs[id];
    const busy = !s.human && (a.state === 'working' || a.state === 'directing');
    // 외근(차량·헬기)이 가장 먼저다. 그다음 근무, 운동, 휴게. 사람(대표·본부장)은 근무 기록 원천이 없어 자리에 있으면 「재석」.
    // 실제 탈것(화면이 태운 것)이 있으면 그것으로 표시한다. 근무 수(busy)는 외근 중에도 실제 기록 그대로 센다.
    if (o) { const kind = (HQ.actualVeh && HQ.actualVeh[id]) || o.kind; return { state: kind === 'heli' ? 'heli' : 'out', busy, place: kind === 'heli' ? 'heli' : 'out', note: kind === 'heli' ? '긴급 외근 · 헬기' : o.why === '긴급 외근 · 헬기' ? '긴급 외근 · 차량' : o.why, since: o.since, until: o.until, floorNow: LOT, gymIndex: -1, human: !!s.human, cmd: !!o.cmd }; }
    if (s.human) return { state: 'present', busy: false, place: 'desk', note: '', since: null, floorNow: s.floor, gymIndex: -1, human: true };
    const gym = !busy && HQ.gymSlots[id] != null;
    const place = busy ? 'desk' : gym ? 'gym' : 'lounge';
    return { state: busy ? a.state : place, busy, place, note: busy ? (a.note || '') : '', since: a.since, auto: !!a.auto, floorNow: gym ? 1 : s.floor, gymIndex: gym ? HQ.gymSlots[id] : -1 };
  }
  // 외근 판정(한 곳): ① 명령(/api/outing) ② 임원 일정(2시간마다) ③ 쉬는 직원의 수시 외근(업무용 차량 수만큼).
  // 긴급 명령은 헬기 — 1대뿐이라 먼저 명령된 한 사람만 타고 나머지 긴급 명령은 차량으로 나간다.
  let LOT = 9;
  function computeOutings() {
    const cfgO = HQ.cfg.outing || {}, now = Date.now(), outs = {}, cmds = (HQ.data && HQ.data.outings) || {};
    const urgent = Object.entries(cmds).filter(([, o]) => o.urgent).sort((a, b) => Date.parse(a[1].at) - Date.parse(b[1].at))[0];
    const poolN = (HQ.cfg.vehicles && HQ.cfg.vehicles.pool && HQ.cfg.vehicles.pool.count) || 10; let cmdCars = 0;
    for (const [id, o] of Object.entries(cmds).sort((a, b) => Date.parse(a[1].at) - Date.parse(b[1].at))) { const st = HQ.byId[id]; if (!st) continue; const heli = urgent && urgent[0] === id;
      if (!heli && !st.human) { if (cmdCars >= poolN) continue; cmdCars++; }   // 업무용 차량이 다 나갔으면 명령이 있어도 기다린다
      outs[id] = { kind: heli ? 'heli' : 'car', why: heli ? '긴급 외근 · 헬기' : o.urgent ? '긴급 외근 · 차량' : '외근 명령', since: o.at, until: o.until, cmd: true }; }
    const every = (cfgO.execEveryMinutes || 120) * 60000, dur = (cfgO.execMinutes || 25) * 60000;
    for (const s of HQ.staff) { if (!s.human || outs[s.id]) continue; const off = ((cfgO.execOffsets || {})[s.id] || 0) * 60000, ph = ((now - off) % every + every) % every;
      if (ph < dur) outs[s.id] = { kind: 'car', why: '정기 외근', since: new Date(now - ph).toISOString(), until: new Date(now - ph + dur).toISOString() }; }
    const slotMs = (cfgO.staffSlotMinutes || 10) * 60000, slot = Math.floor(now / slotMs), pct = cfgO.staffPercent == null ? 20 : cfgO.staffPercent;
    const pool = (HQ.cfg.vehicles && HQ.cfg.vehicles.pool && HQ.cfg.vehicles.pool.count) || 10;
    let used = HQ.staff.filter(s => !s.human && outs[s.id] && outs[s.id].kind === 'car').length;
    const cands = HQ.staff.filter(s => { if (s.human || outs[s.id]) return false; const a = raw(s.id); return a.state === 'idle' && hash(s.id + ':out:' + slot) % 100 < pct; })
      .sort((a, b) => hash(a.id + slot) - hash(b.id + slot));
    for (const s of cands) { if (used >= pool) break; used++; outs[s.id] = { kind: 'car', why: '외근 · 업무용 차량', since: new Date(slot * slotMs).toISOString(), until: new Date((slot + 1) * slotMs).toISOString() }; }
    HQ.outs = outs;
  }
  // 30분 넘게 쉬는 사람 중 시간대별로 최대 10명이 1층에서 운동한다(한 시간 동안 같은 구성).
  function computeGym() {
    const lim = (HQ.cfg.gymAfterIdleMinutes || 30) * 60000, now = Date.now(), slot = new Date(now).toISOString().slice(0, 13), CAP = 10;
    const cands = HQ.staff.filter(s => { if (s.human || HQ.outs[s.id]) return false; const a = raw(s.id); return a.state === 'idle' && a.since && now - Date.parse(a.since) >= lim; });
    const ok = new Set(cands.map(s => s.id)), slots = HQ.gymSlots;
    for (const id of Object.keys(slots)) if (!ok.has(id)) delete slots[id];                       // 조건을 벗어난 사람만 뺀다
    const used = new Set(Object.values(slots));
    for (const s of cands.slice().sort((a, b) => hash(a.id + slot) - hash(b.id + slot))) {      // 빈 자리만 새로 채운다(이미 운동 중인 사람은 제자리)
      if (Object.keys(slots).length >= CAP) break; if (slots[s.id] != null) continue;
      let i = 0; while (used.has(i)) i++; slots[s.id] = i; used.add(i);
    }
    HQ.gymOrder = Object.keys(slots);
  }

  // ---------- 그리기 ----------
  const avatar = s => `assets/people/${s.company}_${s.role}_idle.png`;
  function companyOf(key) { return HQ.cfg.companies[key] || HQ_CO; }
  function counts(filter) {
    const list = HQ.staff.filter(s => !s.human).filter(filter); const busy = list.filter(s => statOf(s.id).busy).length;
    return { total: list.length, busy };
  }
  function staffRow(s, opts = {}) {
    const st = statOf(s.id), c = companyOf(s.company), fl = HQ.cfg.floors.find(f => f.n === st.floorNow);
    const where = opts.showFloor && fl ? `<span class="fl" style="--c:${c.color}">${flabel(fl)}</span>` : '';
    const sub = st.note ? esc(st.note) : (st.state === 'gym' ? '1층에서 운동' : st.state === 'lounge' ? '대기' : st.state === 'present' ? esc(c.name || HQ.cfg.building.name) : '');
    const away = st.place === 'out' || st.place === 'heli';
    const ctl = !HQ.cfg.readonly && (s.human || opts.ctl) ? `<span class="octl">${away ? (st.cmd ? `<button data-out="back" title="외근 명령 취소 — 복귀">복귀</button>` : '') : `<button data-out="car" title="차량으로 외근(30분)">외근</button><button data-out="heli" class="hot" title="긴급 외근 — 옥상 헬기(30분)">긴급</button>`}</span>` : '';
    return `<li data-id="${esc(s.id)}" class="${HQ.sel === s.id ? 'sel' : ''} st-${st.state}">
      <span class="av" style="--c:${c.color}"><img src="${avatar(s)}" alt="" loading="lazy"></span>
      <span class="who"><b>${esc(s.name)}</b> <i>${esc(s.title === s.name ? c.name : s.title)}</i>
        <em title="${esc(st.note)}">${sub}${away && st.until ? ` · ~${hhmm(st.until)}` : ''}</em>${ctl}</span>
      <span class="stt"><span class="badge ${st.state}">${STATE_KO[st.state]}</span>${where}<small>${st.since ? ago(st.since) : ''}</small></span></li>`;
  }
  async function sendOuting(id, kind) {
    const body = kind === 'back' ? { id, cancel: true } : { id, minutes: 30, urgent: kind === 'heli' };
    try { const r = await fetch('/api/outing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { $('#conn').textContent = r.status === 403 ? '외근 명령은 이 PC 에서만 됩니다' : '외근 명령 실패'; $('#conn').className = 'bad'; return; } } catch { return; }
    await poll();
  }
  function renderTop() {
    const all = counts(() => true);
    $('#tot').innerHTML = `<b>${all.busy}</b><span>/ ${all.total} 근무</span>`;
    $('#pills').innerHTML = Object.entries(HQ.cfg.companies).map(([k, c]) => {
      const n = counts(s => s.company === k);
      return `<button class="pill" data-co="${k}" style="--c:${c.color}"><i></i>${esc(c.name)} <b>${n.busy}</b>/${n.total}</button>`;
    }).join('');
    document.querySelectorAll('#pills .pill').forEach(b => b.onclick = () => HQ.focusFloor(HQ.cfg.floors.find(f => f.company === b.dataset.co).n));
  }
  function renderCompanies() {
    $('#companies').innerHTML = Object.entries(HQ.cfg.companies).map(([k, c]) => {
      const list = HQ.staff.filter(s => s.company === k).sort((a, b) => (b.human ? 1 : 0) - (a.human ? 1 : 0)), n = counts(s => s.company === k);
      const src = HQ.data && HQ.data.companies[k];
      const floors = HQ.cfg.floors.filter(f => f.company === k);
      const working = list.filter(s => statOf(s.id).busy);
      const dots = list.map(s => { const st = statOf(s.id); return `<span class="dot st-${st.state}" data-id="${esc(s.id)}" title="${esc(s.name)} · ${STATE_KO[st.state]}"><img src="${avatar(s)}" alt="" loading="lazy"></span>`; }).join('');
      const now = working.slice(0, 3).map(s => `<div class="now" data-id="${esc(s.id)}"><b>${esc(s.name)}</b><span>${esc(statOf(s.id).note || '작업 중')}</span></div>`).join('') || '<div class="now none">지금 근무 중인 담당자 없음</div>';
      const active = floors.some(f => f.n === HQ.mode.floor);
      if (HQ.hide[k]) return '';
      return `<section class="co ${active ? 'on' : ''}" style="--c:${c.color};--c2:${c.color2}" data-co="${k}">
        <button class="xhide" data-hide="${k}" title="이 카드 숨기기" aria-label="${esc(c.name)} 카드 숨기기">–</button>
        <header><div><h3>${esc(c.name)}</h3><p>${esc(c.tagline)}</p></div><div class="num"><b>${n.busy}</b><span>/ ${n.total}</span></div></header>
        <div class="bar"><i style="width:${n.total ? (n.busy / n.total) * 100 : 0}%"></i></div>
        <div class="dots">${dots}</div>
        ${now}
        <footer>${floors.map(f => `<button data-floor="${f.n}" class="${HQ.mode.floor === f.n ? 'on' : ''}">${f.n}F ${esc(f.title.replace(c.name, '').trim() || c.name)}</button>`).join('')}
          <span class="src ${src && src.ok ? 'ok' : 'bad'}" title="${esc((src && src.error) || c.source)}">${src && src.ok ? '실시간' : src && src.stale ? '연결 끊김 · 마지막 값' : '연결 끊김'}</span></footer>
      </section>`;
    }).join('');
    document.querySelectorAll('#companies .co').forEach(el => el.onclick = e => {
      const h = e.target.closest('[data-hide]'); if (h) return setHide(h.dataset.hide, true);
      const b = e.target.closest('[data-floor]'); const d = e.target.closest('[data-id]');
      if (d) return HQ.selectStaff(d.dataset.id);
      HQ.focusFloor(b ? Number(b.dataset.floor) : HQ.cfg.floors.find(f => f.company === el.dataset.co).n);
    });
  }
  function renderRail() {
    const fl = HQ.cfg.floors.slice().sort((a, b) => fkey(a) < fkey(b) ? 1 : -1);
    $('#rail').innerHTML = `<button class="${HQ.mode.floor == null ? 'on' : ''}" data-floor="" title="건물 전체"><b>전체</b></button>` + fl.map(f => {
      const here = f.cafe ? cafeHere() : HQ.staff.filter(s => statOf(s.id).floorNow === f.n); const busy = here.filter(s => statOf(s.id).busy).length;
      const ag = here.filter(s => !s.human);
      return `<button class="${HQ.mode.floor === f.n ? 'on' : ''}" data-floor="${f.n}" style="--c:${f.color}" title="${esc(f.title)}"><b>${flabel(f)}</b><span>${f.cafe ? here.length + '명' : f.lot ? '외근 ' + here.length : f.roof ? '대표' : f.n === 1 ? here.length + '명' : busy + '/' + ag.length}</span></button>`;
    }).join('');
    document.querySelectorAll('#rail button').forEach(b => b.onclick = () => HQ.focusFloor(b.dataset.floor ? Number(b.dataset.floor) : null));
  }
  function renderPanel() {
    const n = HQ.mode.floor, el = $('#panel-body');
    if (n == null) {
      const working = HQ.staff.filter(s => statOf(s.id).busy).sort((a, b) => Date.parse(statOf(b.id).since || 0) - Date.parse(statOf(a.id).since || 0));
      const gym = HQ.staff.filter(s => statOf(s.id).place === 'gym'), outL = HQ.staff.filter(s => ['out', 'heli'].includes(statOf(s.id).place));
      $('#panel-head').innerHTML = `<div><h2>지금 근무 중</h2><p>3개 회사 · ${working.length}명</p></div>`;
      el.innerHTML = `<ul class="staff">${working.map(s => staffRow(s, { showFloor: true })).join('') || '<li class="empty">지금 근무 중인 담당자가 없습니다.</li>'}</ul>
        ${outL.length ? `<h4>외근 중 · ${outL.length}명</h4><ul class="staff">${outL.map(s => staffRow(s)).join('')}</ul>` : ''}
        ${gym.length ? `<h4>1층에서 운동 중 · ${gym.length}명</h4><ul class="staff">${gym.map(s => staffRow(s)).join('')}</ul>` : ''}
        <h4>층 안내</h4><ul class="floors">${HQ.cfg.floors.slice().sort((a, b) => fkey(a) < fkey(b) ? 1 : -1).map(f => `<li data-floor="${f.n}" style="--c:${f.color}"><b>${flabel(f)}</b><span>${esc(f.title)}</span></li>`).join('')}</ul>`;
    } else {
      const f = HQ.cfg.floors.find(x => x.n === n), c = f.company ? companyOf(f.company) : null;
      const here = f.cafe ? cafeHere() : HQ.staff.filter(s => statOf(s.id).floorNow === n);
      const away = f.lot || f.cafe ? [] : HQ.staff.filter(s => s.floor === n && statOf(s.id).floorNow !== n);
      const busy = here.filter(s => statOf(s.id).busy).length, agents = here.concat(away).filter(s => !s.human).length;
      $('#panel-head').innerHTML = `<button id="back" title="건물 전체로">←</button><div style="--c:${f.color}"><h2><span class="fbadge">${flabel(f)}</span> ${esc(f.title)}</h2><p>${f.cafe ? `${esc(HQ.cfg.building.name)} 전용 카페 · 이용 중 ${here.length}명` : f.lot ? `외근 ${here.length}명 · 차량 ${3 + ((HQ.cfg.vehicles && HQ.cfg.vehicles.pool.count) || 10)}대 · 헬기 1대` : f.roof ? `${esc(HQ.cfg.building.name)} · 3개 회사 대표` : n === 1 ? `운동 중 ${here.length}명` : `근무 ${busy} / ${agents}명`}${c ? ' · ' + esc(c.tagline) : ''}</p></div>`;
      let html = `<ul class="staff">${here.map(s => staffRow(s)).join('') || `<li class="empty">${f.cafe ? '지금 카페에 온 사람이 없습니다. 자리에서 일하던 담당자가 수시로 음료를 사러 옵니다.' : f.lot ? '지금 외근 중인 사람이 없습니다.' : n === 1 ? '지금 운동 중인 사람이 없습니다. 30분 넘게 쉬는 담당자가 내려옵니다.' : '이 층에 있는 담당자가 없습니다.'}</li>`}</ul>`;
      if (f.lot) { const ex = HQ.staff.filter(s => s.human), vs = (HQ.cfg.vehicles && HQ.cfg.vehicles.exec) || [];
        html += `<h4>임원 차량 · 외근 명령</h4><ul class="staff">${ex.filter(s => !here.includes(s)).map(s => staffRow(s)).join('') || '<li class="empty">임원 전원 외근 중</li>'}</ul><h4>전용 주차</h4><ul class="cars">${vs.map(v => `<li data-car="${esc(v.owner)}">${v.image ? `<img src="${esc(v.image)}" alt="" loading="lazy">` : '<i></i>'}<div><b>${esc(v.model)}</b><span>${esc((HQ.byId[v.owner] || {}).name || '')} ${esc((HQ.byId[v.owner] || {}).title || '')} · ${esc(v.colorName || '')}</span><span>${esc(v.plate || '')}</span></div></li>`).join('')}</ul><ul class="plain"><li><span class="t">${esc(HQ.cfg.vehicles.pool.model)} × ${HQ.cfg.vehicles.pool.count}</span>업무용 차량 — 쉬는 직원이 수시로 사용</li><li><span class="t">HELICOPTER</span>써포츠 헬기 — 옥상, 긴급 외근</li></ul><p class="hintp">임원은 2시간마다 한 번 외근을 나갑니다. 「외근」「긴급」 버튼이나 도구 명령으로 바로 보낼 수 있습니다.</p>`; }
      if (f.cafe) { const dr = HQ.staff.filter(s => HQ.drinks && HQ.drinks[s.id]);
        html += `<h4>자리에서 마시는 중 · ${dr.length}명</h4><ul class="plain">${dr.map(s => `<li><span class="t">${esc(DRINK_KO[HQ.drinks[s.id]] || '음료')}</span>${esc(s.name)} · ${esc(companyOf(s.company).name || '')}</li>`).join('') || '<li>아직 없습니다.</li>'}</ul><h4>메뉴</h4><ul class="plain">${Object.values(DRINK_KO).map(v => `<li><span class="t">${esc(v)}</span>로봇 바리스타가 만듭니다</li>`).join('')}</ul><p class="hintp">카페로 가는 사람·주문 중인 사람이 위 목록에 나옵니다. 받은 음료는 자리로 들고 가서 마십니다.</p>`; }
      if (away.length) html += `<h4>자리 비움 · ${away.length}명</h4><ul class="staff">${away.map(s => staffRow(s)).join('')}</ul>`;
      if (f.roof) html += `<h4>회사별 근무</h4><ul class="floors">${Object.entries(HQ.cfg.companies).map(([k, co]) => { const cn = counts(x => x.company === k), fl = HQ.cfg.floors.find(x => x.company === k); return `<li data-floor="${fl.n}" style="--c:${co.color}"><b>${cn.busy}/${cn.total}</b><span>${esc(co.name)}</span></li>`; }).join('')}</ul>`;
      if (f.company === 'studio') html += studioWork();
      if (f.company === 'sofring') html += sofringWork();
      el.innerHTML = html;
      $('#back').onclick = () => HQ.focusFloor(null);
    }
    el.querySelectorAll('.staff li[data-id]').forEach(li => li.onclick = e => { const b = e.target.closest('[data-out]'); if (b) { e.stopPropagation(); return sendOuting(li.dataset.id, b.dataset.out); } HQ.selectStaff(li.dataset.id); });
    el.querySelectorAll('.cars li[data-car]').forEach(li => li.onclick = () => HQ.emit('vehicle', li.dataset.car));
    el.querySelectorAll('.floors li').forEach(li => li.onclick = () => HQ.focusFloor(Number(li.dataset.floor)));
    el.querySelectorAll('.rep').forEach(li => li.onclick = () => openReport(li.dataset.p));
  }
  let reports = [];
  // 2026-11-25: 소프링 층 — 대표 지시 진행 현황과 공지(리포트는 소프링 저장소 문서/ 에 있어 여기서는 열지 않는다)
  function sofringWork() {
    const so = (HQ.data && HQ.data.companies.sofring) || {}; const ds = (so.directives || []).slice().reverse(), ns = so.notices || [];
    return `<h4>대표 지시 · 진행 현황</h4><ul class="plain">${ds.map(d => `<li><span class="t">${esc(d.id)}</span><span class="status ${esc(d.status)}">${esc(d.status)}</span> ${esc(d.text)}${d.result ? `<div class="res">→ ${esc(d.result)}</div>` : ''}</li>`).join('') || '<li class="empty">접수된 지시 없음</li>'}</ul>
      <h4>공지</h4><ul class="plain">${ns.map(x => `<li><span class="t">${hhmm(x.at)}</span>${esc(x.text)}</li>`).join('') || '<li class="empty">공지 없음</li>'}</ul>`;
  }
  function studioWork() {
    const sh = (HQ.data && HQ.data.companies.studio) || {}; const ds = (sh.directives || []).slice().reverse(), ns = sh.notices || [];
    return `<h4>대표 지시</h4><ul class="plain">${ds.map(d => `<li><span class="t">${esc(d.id)}</span><span class="status ${esc(d.status)}">${esc(d.status)}</span> ${esc(d.text)}${d.result ? `<div class="res">→ ${esc(d.result)}</div>` : ''}</li>`).join('') || '<li class="empty">접수된 지시 없음</li>'}</ul>
      <h4>담당자 리포트</h4><ul class="plain">${reports.map(r => `<li class="rep" data-p="${esc(r.path)}"><span class="t">${hhmm(r.mtime)}</span>${esc((r.header && r.header.summary) || r.file)}<span class="status ${esc((r.header && r.header.status) || '')}">${esc((r.header && r.header.status) || 'md')}</span></li>`).join('') || '<li class="empty">리포트 없음</li>'}</ul>
      <h4>인사 게시판</h4><ul class="plain">${ns.map(x => `<li><span class="t">${hhmm(x.at)}</span>${esc(x.text)}</li>`).join('') || '<li class="empty">공지 없음</li>'}</ul>`;
  }
  // ---------- 카드 숨김/표시 (회사 카드 3개와 오른쪽 현황 패널, 이 브라우저에 기억) ----------
  try { HQ.hide = JSON.parse(localStorage.getItem('hq.hide') || '{}') || {}; } catch { HQ.hide = {}; }
  function setHide(key, v) { HQ.hide[key] = v; try { localStorage.setItem('hq.hide', JSON.stringify(HQ.hide)); } catch { /* 저장 불가 환경 */ } render(); HQ.emit('layout'); }
  function renderViews() {
    const items = Object.entries(HQ.cfg.companies).map(([k, c]) => [k, c.name, c.color]).concat([['panel', '현황', '#cfc8ee']]);
    $('#views').innerHTML = '<span>표시</span>' + items.map(([k, name, col]) => `<button data-k="${k}" class="${HQ.hide[k] ? '' : 'on'}" style="--c:${col}" title="${esc(name)} ${HQ.hide[k] ? '표시' : '숨김'}" aria-pressed="${!HQ.hide[k]}">${esc(name.length > 6 ? name.split(' ')[0] : name)}</button>`).join('');
    document.querySelectorAll('#views button').forEach(b => b.onclick = () => setHide(b.dataset.k, !HQ.hide[b.dataset.k]));
    const shown = Object.keys(HQ.cfg.companies).filter(k => !HQ.hide[k]).length;
    if (document.body.dataset.cards !== String(shown)) document.body.dataset.cards = shown;
    if (document.body.classList.contains('hide-panel') !== !!HQ.hide.panel) document.body.classList.toggle('hide-panel', !!HQ.hide.panel);
  }
  function render() { if (!HQ.cfg || !HQ.data) return; renderViews(); renderTop(); renderCompanies(); renderRail(); renderPanel(); document.body.dataset.mode = HQ.mode.floor == null ? 'tower' : 'floor'; }

  // ---------- 리포트 창 ----------
  async function openReport(p) {
    const md = await (await fetch('/api/report?p=' + encodeURIComponent(p))).text();
    $('#modal-body').innerHTML = mdToHtml(md); $('#modal').hidden = false;
  }
  function mdToHtml(md) {
    let fm = ''; md = md.replace(/^---\n([\s\S]*?)\n---\n?/, (_, y) => { fm = y; return ''; });
    const out = []; let inCode = false, inTable = false, inList = false;
    const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    const closeTable = () => { if (inTable) { out.push('</table>'); inTable = false; } };
    for (const l of md.split('\n')) {
      if (l.startsWith('```')) { closeList(); closeTable(); inCode = !inCode; out.push(inCode ? '<pre>' : '</pre>'); continue; }
      if (inCode) { out.push(esc(l)); continue; }
      if (/^\|/.test(l)) { if (/^\|\s*:?-+/.test(l)) continue; closeList(); if (!inTable) { out.push('<table>'); inTable = true; } out.push('<tr>' + l.replace(/^\||\|$/g, '').split('|').map(c => '<td>' + inline(c.trim()) + '</td>').join('') + '</tr>'); continue; }
      closeTable();
      const h = l.match(/^(#{1,4})\s+(.*)/); if (h) { closeList(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue; }
      const li = l.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/); if (li) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + inline(li[1]) + '</li>'); continue; }
      closeList(); if (l.trim()) out.push('<p>' + inline(l) + '</p>');
    }
    closeList(); closeTable();
    return (fm ? '<div class="fm">' + esc(fm) + '</div>' : '') + out.join('\n');
  }
  $('#modal-close').onclick = () => { $('#modal').hidden = true; };
  $('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };
  $('#sheet-toggle').onclick = () => document.body.classList.toggle('sheet-min');
  $('#panel-hide').onclick = () => setHide('panel', true);
  $('#panel-show').onclick = () => setHide('panel', false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#modal').hidden) $('#modal').hidden = true; else if (HQ.mode.floor != null) HQ.focusFloor(null); } });

  // ---------- 데이터 ----------
  async function poll() {
    try {
      const d = await readTower();
      HQ.data = d; computeOutings(); computeGym(); render(); HQ.emit('data', d);
      $('#conn').textContent = HQ.cfg.readonly ? '현황 기준 ' + new Date(d.time).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '갱신 ' + new Date().toLocaleTimeString('ko-KR', { hour12: false }); $('#conn').className = 'ok';
    } catch (e) { $('#conn').textContent = '서버 연결 끊김'; $('#conn').className = 'bad'; }
  }
  // 2026-11-25: 공개 화면(playjc.co.kr)은 3분마다 갱신되는 현황(cfg.statusUrl)을 먼저 읽는다 — 정적 사본만 읽으면 올린 순간에 멈춰 있었다.
  async function readTower() {
    if (HQ.cfg.readonly && HQ.cfg.statusUrl) {
      try {
        const r = await fetch(HQ.cfg.statusUrl + '?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' });
        if (r.ok) { const d = await r.json(); if (d && d.companies) return d; }
      } catch { /* 아래 사본으로 */ }
    }
    return (await fetch('/api/tower', { cache: 'no-store' })).json();
  }
  async function pollReports() { try { reports = await (await fetch('/api/reports', { cache: 'no-store' })).json(); const fl = HQ.cfg && HQ.cfg.floors.find(f => f.n === HQ.mode.floor); if (fl && fl.company === 'studio') renderPanel(); } catch { /* 무시 */ } }
  function tick() { $('#clock').textContent = new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); }

  (async () => {
    const cfg = await (await fetch('/api/config', { cache: 'no-store' })).json();
    HQ.cfg = cfg;
    HQ.staff = cfg.staff.map(s => ({ ...s, id: `${s.company}:${s.role}`, key: `${s.company}_${s.role}` }));
    HQ.byId = Object.fromEntries(HQ.staff.map(s => [s.id, s]));
    LOT = (cfg.floors.find(f => f.lot) || {}).n || 9;
    $('#bname').textContent = cfg.building.name;
    $('#ceo').textContent = cfg.building.ceo ? `대표 ${cfg.building.ceo} · ` : '';
    document.title = cfg.building.name + ' · ' + Object.values(cfg.companies).map(c => c.name).join(' · ');
    await poll(); pollReports(); tick();
    resolveReady(cfg);
    setInterval(poll, HQ.cfg.readonly ? 60000 : 4000); setInterval(pollReports, HQ.cfg.readonly ? 600000 : 20000); setInterval(tick, 10000);   // 공개(읽기 전용) 화면은 1분마다만 다시 읽는다
  })();
})();
