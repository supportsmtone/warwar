/* SHADDO 현황 판정 공용(2026-11-26) — 화면(ui.js·status.html)과 서버(tools/status_page.js)가 같은 규칙을 쓴다.
 *  상태 6종: working · directing · waiting · blocked · idle · stale-work
 *   - stale-work: 기록은 working/directing 인데 마지막 기록 시각(since, 있으면 touchedAt)이 임계 시간을 넘었다(역할 단위).
 *   - blocked   : 회사 원천이 실패(ok:false 또는 error 가 비어 있지 않음)하면 그 회사 전체, 또는 역할 상태가 blocked.
 *   - 자동 감지(auto: 최근 10분 파일 변경)로 잡힌 근무는 지금 실제로 움직이는 것이므로 멈춤으로 보지 않는다. */
(function (root, factory) { const m = factory(); if (typeof module === 'object' && module.exports) module.exports = m; else root.HQState = m; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DEF_STALE = { working: 180, directing: 240 };          // 분
  const DEF_FRESH = { dimMinutes: 5, staleMinutes: 30 };       // 분
  const KINDS = ['working', 'directing', 'waiting', 'blocked', 'idle', 'stale-work'];
  const KO = { working: '근무 중', directing: '지휘 중', waiting: '대기', blocked: '막힘', idle: '휴식', 'stale-work': '멈춤 의심' };
  const COLOR = { working: '#4ea1ff', directing: '#b388ff', waiting: '#9aa0ad', blocked: '#ff5d6c', idle: '#6f6990', 'stale-work': '#ff9a3c' };
  const ALIAS = { wait: 'waiting', pending: 'waiting', paused: 'waiting', queued: 'waiting', error: 'blocked', failed: 'blocked', block: 'blocked', busy: 'working', work: 'working', direct: 'directing', rest: 'idle', off: 'idle' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  function norm(state) { const s = String(state || 'idle').toLowerCase(); if (s === 'stale-work') return 'working'; return KINDS.includes(s) ? s : (ALIAS[s] || 'idle'); }
  function companyBlocked(c) { return !!c && (c.ok === false || !!(c.error && String(c.error).trim())); }
  function thresholds(cfg) { const t = (cfg && cfg.staleThresholds) || {}; return { working: num(t.working, DEF_STALE.working), directing: num(t.directing, DEF_STALE.directing) }; }
  function freshCfg(cfg) { const f = (cfg && cfg.freshness) || {}; return { dimMinutes: num(f.dimMinutes, DEF_FRESH.dimMinutes), staleMinutes: num(f.staleMinutes, DEF_FRESH.staleMinutes) }; }
  // 한 역할의 판정. role = {state, since, touchedAt?, auto?}, company = {ok, error, ...}
  function judge(role, company, cfg, now) {
    const a = role || {}, raw = norm(a.state), th = thresholds(cfg); now = now || Date.now();
    const ts = [Date.parse(a.since), Date.parse(a.touchedAt)].filter(Number.isFinite), last = ts.length ? Math.max(...ts) : null;
    const sinceMs = Number.isFinite(Date.parse(a.since)) ? Date.parse(a.since) : null;
    const out = { raw, kind: raw, minutes: sinceMs == null ? null : Math.max(0, (now - sinceMs) / 60000), quietMinutes: last == null ? null : Math.max(0, (now - last) / 60000), reason: '' };
    if (companyBlocked(company)) { out.kind = 'blocked'; out.reason = (company.error && String(company.error).trim()) || '현황 원천 연결 실패'; return out; }
    if (raw === 'blocked') { out.reason = '막힘으로 기록됨'; return out; }
    if ((raw === 'working' || raw === 'directing') && !a.auto && (last == null || out.quietMinutes > th[raw])) { out.kind = 'stale-work'; out.reason = last == null ? '시작 시각 기록 없음' : `${dur(out.quietMinutes)}째 새 기록 없음`; }
    return out;
  }
  const isBusy = k => k === 'working' || k === 'directing';
  const needsLook = k => k === 'blocked' || k === 'stale-work';
  function dur(min) { min = Math.max(0, Math.floor(min)); if (min < 60) return min + '분'; const h = Math.floor(min / 60); return h < 48 ? `${h}시간 ${min % 60}분` : `${Math.floor(h / 24)}일 ${h % 24}시간`; }
  function agoText(ms) { const s = Math.max(0, Math.floor(ms / 1000)); if (s < 60) return s + '초 전'; const m = Math.floor(s / 60); if (m < 60) return m + '분 전'; const h = Math.floor(m / 60); return h < 24 ? h + '시간 전' : Math.floor(h / 24) + '일 전'; }
  // 신선도: ok(정상) · dim(dimMinutes 초과) · late(staleMinutes 초과 = unreachable)
  function freshness(fetchedAt, cfg, now) {
    const f = freshCfg(cfg), t = Date.parse(fetchedAt); now = now || Date.now();
    if (!Number.isFinite(t)) return { level: 'late', ms: null, text: '기록 없음' };
    const ms = Math.max(0, now - t), min = ms / 60000;
    return { level: min > f.staleMinutes ? 'late' : min > f.dimMinutes ? 'dim' : 'ok', ms, text: agoText(ms) };
  }
  function newest(tower) { let t = 0; for (const c of Object.values((tower && tower.companies) || {})) { const x = Date.parse(c.fetchedAt); if (Number.isFinite(x) && x > t) t = x; } return t ? new Date(t).toISOString() : (tower && tower.time) || null; }
  function metricsOf(company) { return (Array.isArray(company && company.metrics) ? company.metrics : []).filter(m => m && m.label && m.value != null && String(m.value) !== ''); }
  // 회사별 요약(사람 = 근무 기록 원천이 없는 대표·본부장은 뺀다)
  function summarize(cfg, tower, now) {
    now = now || Date.now(); const out = [];
    for (const [key, co] of Object.entries((cfg && cfg.companies) || {})) {
      const c = ((tower && tower.companies) || {})[key] || { ok: false, error: '현황 없음', roles: {} };
      const rows = (cfg.staff || []).filter(s => s.company === key && !s.human).map(s => { const j = judge((c.roles || {})[s.role], c, cfg, now), fl = (cfg.floors || []).find(f => f.n === s.floor); return { id: `${s.company}:${s.role}`, name: s.name, title: s.title, floor: fl ? (fl.label || fl.n + 'F') : '', floorTitle: fl ? fl.title : '', since: ((c.roles || {})[s.role] || {}).since || null, note: ((c.roles || {})[s.role] || {}).note || '', ...j }; });
      out.push({ key, name: co.name, tagline: co.tagline || '', color: co.color, rows, busy: rows.filter(r => isBusy(r.kind)).length, look: rows.filter(r => needsLook(r.kind)).length, total: rows.length, fresh: freshness(c.fetchedAt, cfg, now), blocked: companyBlocked(c), error: c.error || '', metrics: metricsOf(c) });
    }
    return out;
  }
  const hhmm = iso => { const t = Date.parse(iso); if (!Number.isFinite(t)) return '—'; return new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
  function elapsedText(r) { if (r.kind === 'stale-work') return '⚠ ' + (r.quietMinutes == null ? '시각 없음' : dur(r.quietMinutes) + '째'); return r.minutes == null ? '' : dur(r.minutes); }
  function legendHtml() { return KINDS.map(k => `<span class="lg k-${k}"><i style="background:${COLOR[k]}"></i>${KO[k]}</span>`).join(''); }
  // JS 없이 읽히는 본문(표). status.html 과 그 화면의 자동 갱신이 같은 함수를 쓴다.
  function statusHtml(cfg, tower, now) {
    now = now || Date.now(); const sum = summarize(cfg, tower, now), all = sum.reduce((a, c) => ({ busy: a.busy + c.busy, total: a.total + c.total, look: a.look + c.look }), { busy: 0, total: 0, look: 0 });
    const base = newest(tower);
    let h = `<p class="base">현황 기준 <time datetime="${esc(base || '')}">${esc(hhmm(base))}</time> (한국 시각) · 근무 ${all.busy} / ${all.total}명 · 확인 필요 ${all.look}건</p>`;
    for (const c of sum) {
      const fr = c.fresh.level === 'late' ? ' · <strong class="late">unreachable</strong>' : '';
      h += `<section><h2>${esc(c.name)} <small>${esc(c.tagline)}</small></h2><p>근무 ${c.busy} / ${c.total}명 · 확인 필요 ${c.look}건 · 원천 확인 ${esc(hhmm(((tower.companies || {})[c.key] || {}).fetchedAt))}${fr}${c.blocked ? ` · <strong class="k-blocked">막힘: ${esc(c.error || '원천 연결 실패')}</strong>` : ''}</p>`;
      if (c.metrics.length) h += `<table class="metrics"><caption>${esc(c.name)} 지표</caption><thead><tr><th>지표</th><th>값</th><th>비고</th></tr></thead><tbody>${c.metrics.map(m => `<tr><td>${esc(m.label)}</td><td><b>${esc(m.value)}</b></td><td>${esc(m.hint || '')}</td></tr>`).join('')}</tbody></table>`;
      h += `<table><caption>${esc(c.name)} 역할별 상태</caption><thead><tr><th>층</th><th>이름</th><th>역할</th><th>상태</th><th>경과</th><th>시작</th></tr></thead><tbody>${c.rows.map(r => `<tr class="k-${r.kind}"><td>${esc(r.floor)} ${esc(r.floorTitle)}</td><td>${esc(r.name)}</td><td>${esc(r.title)}</td><td><b>${esc(KO[r.kind])}</b></td><td>${esc(elapsedText(r))}</td><td>${r.since ? esc(hhmm(r.since)) : '—'}</td></tr>`).join('')}</tbody></table></section>`;
    }
    return h;
  }
  return { KINDS, KO, COLOR, norm, judge, isBusy, needsLook, companyBlocked, thresholds, freshCfg, freshness, newest, metricsOf, summarize, statusHtml, legendHtml, elapsedText, dur, agoText, hhmm, esc };
});
