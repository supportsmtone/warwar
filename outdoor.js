/* SHADDO 사옥 바깥 — 전용 주차장(임원 3대 + 업무용 10대), 출입문, 옥상 헬리패드·헬기. tower.js 가 불러 쓴다. */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const LOT = { BAY_Z: 13.6, SIDE_Z: 10.4, ARC_Z: 17.6, R: 4.1, GY: -0.5, DOOR_X: 4.0, DOOR_IN: 6.5, DOOR_OUT: 9.7 };
LOT.LANE_Z = LOT.ARC_Z + LOT.R;

export function buildOutdoor(ctx) {
  const { scene, roof, cfg, HQ, std, glow, box, plane, textPlane, canvasTex, radialTex, metalMat, darkMat, FONT } = ctx;
  const V = cfg.vehicles || { exec: [], pool: { count: 0 } };
  const lot = new THREE.Group(); lot.position.y = LOT.GY; scene.add(lot);

  // ---------- 주차장 바닥·표시 ----------
  const asphalt = canvasTex(256, 256, (g, w) => { g.fillStyle = '#1b1a26'; g.fillRect(0, 0, w, w); for (let i = 0; i < 2600; i++) { const v = 34 + Math.random() * 26 | 0; g.fillStyle = `rgba(${v},${v},${v + 6},.55)`; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); } });
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping; asphalt.repeat.set(14, 5);
  plane(lot, 53, 15.6, std(0xffffff, { map: asphalt, rough: 0.92 }), -4.6, 0.012, 18.4, { rx: -Math.PI / 2, recv: true });
  const white = new THREE.MeshBasicMaterial({ color: 0xdfe3ee }), gold = glow(0xffd23f, 1.15);
  const flat = (w, d, mat, x, z, y = 0.02) => plane(lot, w, d, mat, x, y, z, { rx: -Math.PI / 2 });
  const poolN = (V.pool && V.pool.count) || 0, POOL_X = i => -26.8 + i * 2.7, EXEC_X = i => 9.4 + i * 3.5;
  for (let i = 0; i <= poolN; i++) flat(0.1, 5.6, white, POOL_X(i) - 1.35, 13.7);
  for (let i = 0; i < poolN; i++) { const t = textPlane(lot, String(i + 1).padStart(2, '0'), { h: 0.5, px: 80, color: '#aeb6c8', weight: 800, x: POOL_X(i), y: 0.022, z: 16.9 }); t.rotation.x = -Math.PI / 2; }
  for (let i = 0; i <= V.exec.length; i++) flat(0.12, 5.9, gold, EXEC_X(i) - 1.75, 13.75);
  flat(V.exec.length * 3.5, 0.12, gold, EXEC_X(0) - 1.75 + V.exec.length * 1.75, 16.7);
  // 차로: 가운데 점선·방향 화살표·횡단 보도
  for (let x = -29; x <= 20; x += 3.2) flat(1.5, 0.1, white, x, LOT.LANE_Z + 2.0);
  for (const x of [-18, -4, 14]) { const a = textPlane(lot, '➜', { h: 1.1, px: 120, color: '#dfe3ee', weight: 800, x, y: 0.022, z: LOT.LANE_Z }); a.rotation.x = -Math.PI / 2; }
  for (let z = 17.3; z <= 25.6; z += 0.9) flat(3.4, 0.42, white, LOT.DOOR_X, z);
  // 주차장 표지·임원 명패
  box(lot, 0.7, 4.4, 0.7, 0x12111f, -30.2, 2.2, 11.4); const pm = glow(0x3d7bff, 1.5); box(lot, 1.6, 1.6, 0.16, pm, -30.2, 3.5, 11.85, { cast: false });
  textPlane(lot, 'P', { h: 1.25, px: 160, color: '#ffffff', weight: 900, x: -30.2, y: 3.5, z: 11.95 });
  textPlane(lot, '업무용 차량', { h: 0.34, px: 64, color: '#dfe3ee', weight: 700, x: -30.2, y: 2.3, z: 11.78 });
  V.exec.forEach((v, i) => { const o = HQ.byId[v.owner] || {}, x = EXEC_X(i);
    box(lot, 0.08, 1.5, 0.08, metalMat, x, 0.75, 10.75, { cast: false }); box(lot, 2.5, 0.78, 0.07, 0x12111f, x, 1.62, 10.75, { cast: false }); box(lot, 2.5, 0.05, 0.08, gold, x, 2.02, 10.76, { cast: false });
    textPlane(lot, `${o.title || ''} ${o.name || ''}`, { h: 0.34, px: 72, color: '#ffd23f', weight: 800, x, y: 1.76, z: 10.8 });
    textPlane(lot, v.model, { h: 0.2, px: 56, color: '#cfd4e2', weight: 600, x, y: 1.4, z: 10.8 });
    const t = textPlane(lot, o.name || '', { h: 0.55, px: 90, color: '#ffd23f', weight: 800, x, y: 0.022, z: 17.35 }); t.rotation.x = -Math.PI / 2; });
  // 볼라드 조명
  for (let x = -28; x <= 18; x += 5.75) { box(lot, 0.14, 0.7, 0.14, darkMat, x, 0.35, 10.7, { cast: false }); box(lot, 0.16, 0.08, 0.16, glow(0xfff0d8, 1.6), x, 0.74, 10.7, { cast: false }); }

  // ---------- 출입문(자동문)·캐노피 ----------
  const door = { open: 0 }; const frameMat = std(0x1a1833, { metal: 0.5, rough: 0.4 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  box(scene, 2.5, 0.14, 0.2, frameMat, LOT.DOOR_X, 2.55, 7.1, { cast: false }); for (const sx of [-1, 1]) box(scene, 0.12, 2.6, 0.2, frameMat, LOT.DOOR_X + sx * 1.22, 1.3, 7.1, { cast: false });
  door.l = plane(scene, 1.1, 2.4, glassM, LOT.DOOR_X - 0.56, 1.25, 7.14); door.r = plane(scene, 1.1, 2.4, glassM, LOT.DOOR_X + 0.56, 1.25, 7.14);
  box(scene, 5.2, 0.14, 2.6, std(0x15132a, { rough: 0.6 }), LOT.DOOR_X, 3.05, 8.4, { cast: false }); box(scene, 5.2, 0.06, 0.06, glow(0xffffff, 1.6), LOT.DOOR_X, 2.96, 9.68, { cast: false });
  for (const sx of [-1, 1]) box(scene, 0.1, 3.5, 0.1, frameMat, LOT.DOOR_X + sx * 2.4, 1.3, 9.55, { cast: false });
  textPlane(scene, cfg.building.name, { h: 0.42, px: 90, color: '#ffffff', glow: true, boost: 1.3, weight: 900, x: LOT.DOOR_X, y: 3.42, z: 9.72 });
  for (let i = 0; i < 4; i++) box(scene, 3.4, 0.125, 0.62, std(0x2a2650, { rough: 0.6 }), LOT.DOOR_X, -0.06 - i * 0.125, 7.55 + i * 0.6, { cast: false });   // 계단 4단
  for (const sx of [-1, 1]) box(scene, 0.06, 0.05, 2.5, glow(0xffffff, 1.2), LOT.DOOR_X + sx * 1.72, 0.0, 8.5, { cast: false }).rotation.x = 0.2;

  // ---------- 차량 ----------
  // 옆모습을 곡선으로 그려 아랫몸통(넓게)과 객실(좁게)을 따로 만든다 — 어깨선이 살아난다. 앞이 +x.
  // c = [제어점x, 제어점y, 끝x, 끝y] 는 곡선, [x, y] 는 직선.
  const BEV = 0.09, BEVC = 0.07;
  const TYPES = {
    sedan: { L: 4.95, W: 1.88, r: 0.345, wx: [-1.48, 1.5], belt: 1.0, cabW: 0.8, doors: [1.0, -0.14, -1.22],
      lower: [[-2.44, 0.33], [-2.46, 0.78], { c: [-2.44, 0.985, -2.1, 1.0] }, [-1.5, 1.02], [1.22, 1.02], { c: [1.86, 0.95, 2.26, 0.86] }, { c: [2.5, 0.8, 2.48, 0.54] }, [2.46, 0.33]],
      cabin: [[-1.66, 0.98], { c: [-1.2, 1.4, -0.6, 1.445] }, [0.22, 1.445], { c: [0.84, 1.4, 1.27, 0.98] }],
      glass: [[-1.4, 1.05], { c: [-1.06, 1.36, -0.6, 1.39] }, [0.2, 1.39], { c: [0.7, 1.36, 1.0, 1.05] }],
      ws: [[1.2, 1.04], [0.34, 1.43]], rw: [[-1.58, 1.04], [-0.72, 1.43]], pillar: -0.16, top: 1.445, fy: 0.74, ry: 0.86 },
    sports: { L: 4.86, W: 1.96, r: 0.37, wx: [-1.5, 1.52], belt: 0.94, cabW: 0.76, doors: [0.72, -0.62],
      lower: [[-2.4, 0.28], [-2.42, 0.7], { c: [-2.4, 0.9, -2.0, 0.93] }, [-1.4, 0.96], [0.7, 0.95], { c: [1.6, 0.85, 2.16, 0.72] }, { c: [2.46, 0.64, 2.44, 0.44] }, [2.42, 0.28]],
      cabin: [[-1.78, 0.92], { c: [-1.0, 1.24, -0.45, 1.28] }, [-0.05, 1.28], { c: [0.44, 1.24, 0.84, 0.92] }],
      glass: [[-1.26, 0.98], { c: [-0.88, 1.19, -0.45, 1.22] }, [-0.07, 1.22], { c: [0.32, 1.19, 0.58, 0.98] }],
      ws: [[0.8, 0.97], [0.0, 1.27]], rw: [[-1.72, 0.96], [-0.62, 1.27]], pillar: null, top: 1.28, fy: 0.62, ry: 0.78 },
    suv: { L: 5.18, W: 2.0, r: 0.41, wx: [-1.62, 1.64], belt: 1.25, cabW: 0.86, doors: [1.12, -0.1, -1.36],
      lower: [[-2.56, 0.4], [-2.6, 1.1], { c: [-2.6, 1.27, -2.4, 1.27] }, [1.3, 1.27], { c: [1.95, 1.2, 2.32, 1.14] }, { c: [2.62, 1.08, 2.6, 0.72] }, [2.58, 0.4]],
      cabin: [[-2.52, 1.25], { c: [-2.5, 1.78, -2.2, 1.8] }, [0.3, 1.82], { c: [0.92, 1.8, 1.42, 1.25] }],
      glass: [[-2.2, 1.3], { c: [-2.18, 1.7, -1.95, 1.72] }, [0.28, 1.74], { c: [0.8, 1.72, 1.16, 1.3] }],
      ws: [[1.38, 1.29], [0.4, 1.8]], rw: [[-2.56, 1.3], [-2.44, 1.76]], pillar: -0.12, top: 1.82, fy: 1.0, ry: 1.16 },
  };
  const tire = std(0x0b0b10, { rough: 0.92 }), rimM = std(0xdfe3ea, { metal: 0.9, rough: 0.22 }), darkPl = std(0x0a0a10, { rough: 0.7 }), chrome = std(0xe8ecf2, { metal: 1, rough: 0.16 }), arch = new THREE.MeshBasicMaterial({ color: 0x050508 });
  const gunM = std(0x5a606b, { metal: 0.85, rough: 0.38 }), roofGlass = std(0x07090e, { metal: 0.2, rough: 0.28 });
  if (ctx.env) { chrome.envMap = ctx.env; chrome.envMapIntensity = 0.9; rimM.envMap = ctx.env; rimM.envMapIntensity = 0.6; }
  const glassCar = new THREE.MeshPhysicalMaterial({ color: 0x0b1326, metalness: 0.4, roughness: 0.06, clearcoat: 1, side: THREE.DoubleSide, envMap: ctx.env || null, envMapIntensity: 0.7 });
  const carShadow = canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 6, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,.78)'); r.addColorStop(0.7, 'rgba(0,0,0,.4)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const trace = (sh, path) => { path.forEach((p, i) => { if (p.c) sh.quadraticCurveTo(...p.c); else if (i) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); }); sh.closePath(); return sh; };
  const shapeOf = path => trace(new THREE.Shape(), path);
  const bz = (s0, c, t) => [s0[0] * (1 - t) ** 2 + 2 * c[0] * t * (1 - t) + c[2] * t * t, s0[1] * (1 - t) ** 2 + 2 * c[1] * t * (1 - t) + c[3] * t * t];   // 옆모습 곡선 위의 점
  function quad(parent, a, b, w, mat, off, k = 0.9) {   // 옆모습의 비스듬한 선 a→b 위에 유리판(앞·뒤 유리)
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0), len = d.length(); d.normalize(); const X = new THREE.Vector3(0, 0, 1), Z = new THREE.Vector3().crossVectors(X, d); if (Z.y < 0) Z.negate();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len * k), mat); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, d, new THREE.Vector3().crossVectors(X, d)));
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0).addScaledVector(Z, off); parent.add(m); return m;
  }
  // 그릴·엠블럼은 캔버스로 그린다(차종별 인상)
  function emblemTex(brand) {
    return canvasTex(128, 128, (g, w) => { const c = w / 2; g.clearRect(0, 0, w, w); g.lineCap = 'round';
      if (brand === 'bmw') { g.fillStyle = '#0c0c10'; g.beginPath(); g.arc(c, c, 60, 0, 7); g.fill(); for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#1c69d4' : '#f4f6fa'; g.beginPath(); g.moveTo(c, c); g.arc(c, c, 40, i * Math.PI / 2, (i + 1) * Math.PI / 2); g.fill(); } g.strokeStyle = '#d9dde4'; g.lineWidth = 5; g.beginPath(); g.arc(c, c, 60, 0, 7); g.stroke(); }
      else if (brand === 'mercedes') { g.strokeStyle = '#e9edf3'; g.lineWidth = 9; g.beginPath(); g.arc(c, c, 54, 0, 7); g.stroke(); g.lineWidth = 11; for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * 52, c + Math.sin(a) * 52); g.stroke(); } }
      else if (brand === 'volvo') { g.strokeStyle = '#e9edf3'; g.lineWidth = 10; g.beginPath(); g.arc(c, c + 6, 46, 0, 7); g.stroke(); g.beginPath(); g.moveTo(c + 30, c - 28); g.lineTo(c + 54, c - 52); g.stroke(); g.beginPath(); g.moveTo(c + 54, c - 52); g.lineTo(c + 34, c - 52); g.moveTo(c + 54, c - 52); g.lineTo(c + 54, c - 32); g.stroke(); g.fillStyle = '#16335c'; g.fillRect(c - 50, c - 4, 100, 20); }
      else { g.fillStyle = '#0d1b3a'; g.beginPath(); g.ellipse(c, c, 46, 58, 0, 0, 7); g.fill(); g.strokeStyle = '#e9edf3'; g.lineWidth = 5; g.beginPath(); g.ellipse(c, c, 46, 58, 0, 0, 7); g.stroke(); g.lineWidth = 7; g.strokeStyle = '#ff4a4a';
        g.beginPath(); g.moveTo(c, c + 36); g.lineTo(c, c - 34); g.moveTo(c - 22, c - 30); g.quadraticCurveTo(c - 22, c + 4, c, c + 6); g.quadraticCurveTo(c + 22, c + 4, c + 22, c - 30); g.stroke(); } });
  }
  function grilleTex(brand) {
    return canvasTex(512, 256, (g, w, h) => { g.clearRect(0, 0, w, h); const rr = (x, y, ww, hh, r) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
      const bars = (x0, x1, y0, y1, n, vert) => { g.strokeStyle = 'rgba(210,216,226,.75)'; g.lineWidth = 5; for (let i = 1; i < n; i++) { g.beginPath(); if (vert) { const x = x0 + (x1 - x0) * i / n; g.moveTo(x, y0); g.lineTo(x, y1); } else { const y = y0 + (y1 - y0) * i / n; g.moveTo(x0, y); g.lineTo(x1, y); } g.stroke(); } };
      if (brand === 'bmw') { for (const x of [26, 264]) { const kid = () => { g.beginPath(); g.moveTo(x + 40, 14); g.lineTo(x + 200, 14); g.lineTo(x + 222, 44); g.lineTo(x + 222, 200); g.lineTo(x + 190, 242); g.lineTo(x + 34, 242); g.lineTo(x, 200); g.lineTo(x, 50); g.closePath(); };
          kid(); g.fillStyle = '#06060a'; g.fill(); g.save(); kid(); g.clip(); bars(x + 6, x + 216, 14, 242, 9, true); g.restore(); kid(); g.strokeStyle = '#dfe4ec'; g.lineWidth = 12; g.stroke(); kid(); g.shadowColor = '#bfe0ff'; g.shadowBlur = 14; g.strokeStyle = 'rgba(238,246,255,.95)'; g.lineWidth = 3; g.stroke(); g.shadowBlur = 0; } }
      else if (brand === 'mercedes') { rr(14, 30, 484, 196, 70); g.fillStyle = '#06060a'; g.fill(); g.save(); rr(14, 30, 484, 196, 70); g.clip(); g.lineWidth = 2.4; g.strokeStyle = 'rgba(215,222,232,.8)';
        for (let r = 0; r < 7; r++) for (let c = 0; c < 22; c++) { const px = 28 + c * 22 + (r % 2) * 11, py = 48 + r * 27; g.beginPath(); for (let i = 0; i < 3; i++) { const an = -Math.PI / 2 + i * Math.PI * 2 / 3; g.moveTo(px, py); g.lineTo(px + Math.cos(an) * 6, py + Math.sin(an) * 6); } g.stroke(); } g.restore();
        g.strokeStyle = '#e4e8ee'; g.lineWidth = 12; g.beginPath(); g.moveTo(30, 128); g.lineTo(186, 128); g.moveTo(326, 128); g.lineTo(482, 128); g.stroke(); rr(14, 30, 484, 196, 70); g.lineWidth = 9; g.stroke(); }
      else if (brand === 'volvo') { rr(36, 30, 440, 196, 30); g.fillStyle = '#07070b'; g.fill(); bars(50, 462, 36, 220, 15, true); rr(36, 30, 440, 196, 30); g.strokeStyle = '#e4e8ee'; g.lineWidth = 12; g.stroke(); g.lineWidth = 12; g.beginPath(); g.moveTo(60, 214); g.lineTo(452, 42); g.stroke(); }
      else { g.beginPath(); g.moveTo(20, 50); g.quadraticCurveTo(256, 10, 492, 50); g.quadraticCurveTo(440, 250, 256, 250); g.quadraticCurveTo(72, 250, 20, 50); g.closePath(); g.fillStyle = '#07070b'; g.fill(); g.save(); g.clip(); bars(20, 492, 10, 250, 13, true); g.restore(); g.strokeStyle = '#e4e8ee'; g.lineWidth = 9; g.stroke(); } });
  }
  const basic = t => new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
  // 꼭짓점을 합쳐 음영을 매끈하게(각진 면이 아니라 도장면처럼 보이게)
  function smooth(geo) { geo.deleteAttribute('normal'); geo.deleteAttribute('uv'); const m = mergeVertices(geo, 1e-4); m.computeVertexNormals(); m.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(m.attributes.position.count * 2), 2)); return m; }
  const starM = basic(canvasTex(128, 128, (g, w) => { const c = w / 2; g.clearRect(0, 0, w, w); g.shadowColor = '#c8101e'; g.shadowBlur = 10; g.strokeStyle = '#d81c2a'; g.lineWidth = 10; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * 44, c + Math.sin(a) * 44); g.stroke(); } }));   // 벤츠 후미등의 별 무늬
  function makeCar(spec, plate) {
    const P = TYPES[spec.type] || TYPES.sedan, brand = spec.brand || 'mercedes', g = new THREE.Group(), col = new THREE.Color(spec.color), hc = P.W * P.cabW / 2, FX = P.L / 2 + BEV, RX = -(P.L / 2 + BEV), suv = spec.type === 'suv', sport = spec.type === 'sports';
    const ex = !!spec.exec, lum = col.getHSL({}).l, pearl = lum > 0.85;
    const paint = new THREE.MeshPhysicalMaterial({ color: col, metalness: pearl ? 0.12 : 0.65, roughness: pearl ? 0.42 : 0.26, clearcoat: pearl ? 0.5 : 1, clearcoatRoughness: pearl ? 0.2 : 0.06, envMap: ctx.env || null, envMapIntensity: pearl ? 0.14 : lum > 0.75 ? 0.24 : 0.42 });
    const hw = P.W / 2, Lh = P.L / 2 + BEV, KF = 0.24, KR = 0.15, TP = 0;   // TP(끝을 좁히기)는 쓰지 않는다 — 옆판에 중간 꼭짓점이 없어 문 쪽이 안으로 꺼진다
    const edge = (z, K) => K * Math.max(0, (Math.abs(z) / hw - 0.42) / 0.58) ** 2;                    // 앞·뒤 면이 모서리로 갈수록 물러나는 양(가운데는 평평)
    const slope = (z, K) => 2 * K * Math.max(0, Math.abs(z) / hw - 0.42) / (0.58 * 0.58) / hw;
    const ext = (path, depth, bev, mat, seg = 5, body = false) => { let geo = new THREE.ExtrudeGeometry(shapeOf(path), { depth, steps: body ? 16 : 1, bevelEnabled: bev > 0, bevelSize: bev, bevelThickness: bev, bevelSegments: seg, curveSegments: body ? 20 : 14 }); geo.translate(0, 0, -depth / 2);
      if (body) { const q = geo.attributes.position; for (let i = 0; i < q.count; i++) { let x = q.getX(i), z = q.getZ(i); const ax = Math.abs(x), sT = Math.min(1, Math.max(0, (ax - 0.5 * Lh) / (0.5 * Lh))), tB = Math.min(1, Math.max(0, (ax - 0.72 * Lh) / (0.28 * Lh)));
          z *= 1 - TP * sT * sT; x -= Math.sign(x) * edge(z, x > 0 ? KF : KR) * tB; q.setX(i, x); q.setZ(i, z); } }   // 위에서 보면 앞뒤가 좁아지고 모서리가 둥글다
      if (bev > 0) geo = smooth(geo);
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const hl = glow(0xfff6e0, 0.4), tl = glow(0xff2a3a, 0.6), rv = glow(0xffffff, 0.05), ind = glow(0xffa51f, 0.06);
    ext(P.lower, P.W - BEV * 2, BEV, paint, 5, true);
    const b = (w, h, d, mat, x, y, z, o) => box(g, w, h, d, mat, x, y, z, { cast: false, ...(o || {}) });
    const moldX = (P.glass[0][0] + P.glass[P.glass.length - 1].c[2]) / 2;
    const li = P.lower.findIndex(q => q.c && q.c[2] > 1.4), hS = P.lower[li - 1], hC = P.lower[li].c, nS = [hC[2], hC[3]], nC = P.lower[li + 1].c;   // 보닛 곡선·앞코 곡선
    if (!ex) {
      ext(P.cabin, hc * 2 - BEVC * 2, BEVC, paint);
      ext(P.glass, hc * 2 + 0.014, 0, glassCar).castShadow = false;
      quad(g, P.ws[0], P.ws[1], hc * 2 * 0.9, glassCar, BEVC + 0.012); quad(g, P.rw[0], P.rw[1], hc * 2 * (suv ? 0.84 : 0.88), glassCar, BEVC + 0.012);
      if (P.pillar != null) b(0.09, P.top - P.belt - 0.08, hc * 2 + 0.024, paint, P.pillar, (P.top + P.belt) / 2 + 0.02, 0);          // B 필러
      b(P.L * 0.5, 0.022, hc * 2 + 0.03, chrome, moldX, P.belt + 0.05, 0);                                                              // 창 아래 크롬 몰딩
    } else {
      // 임원 차량: 옆 창틀 2장 + 지붕 + 비치는 유리 → 실내(시트·운전대·계기판·화면·무드등)가 들여다보인다
      const sill = P.glass[0][1], roofY = P.top + BEVC, base = sill + 0.072, hV = roofY - 0.06 - base;
      const gx = new THREE.MeshPhysicalMaterial({ color: 0x1d2a3e, transparent: true, opacity: 0.4, metalness: 0.1, roughness: 0.22, specularIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false, envMap: ctx.env || null, envMapIntensity: 0.35 });
      const trim = std(0x14141b, { rough: 0.85 }), leather = std({ volvo: 0xb98a5e, maserati: 0x8a1620, bmw: 0xe6dccb }[brand] || 0x6b4a33, { rough: 0.62 }), acc = { volvo: 0xbfe3ff, maserati: 0xff3344, bmw: 0x4d8dff }[brand] || 0xffffff, scr = glow(0x6fb8ff, 0.62), amb = glow(acc, 1.0);
      const fsh = shapeOf(P.cabin); fsh.holes.push(trace(new THREE.Path(), P.glass));
      const fgeo = smooth(new THREE.ExtrudeGeometry(fsh, { depth: 0.04, bevelEnabled: true, bevelSize: BEVC, bevelThickness: 0.03, bevelSegments: 4, curveSegments: 18 })), ggeo = new THREE.ShapeGeometry(shapeOf(P.glass), 14);
      for (const sz of [-1, 1]) {
        const fr = new THREE.Mesh(fgeo, paint); fr.position.z = sz * (hc - 0.05) - 0.02; fr.castShadow = true; g.add(fr);            // 옆 창틀(A·C 필러)
        const gp = new THREE.Mesh(ggeo, gx); gp.position.z = sz * (hc - 0.014); g.add(gp);                                            // 옆 유리
        if (P.pillar != null) b(0.1, roofY - sill - 0.05, 0.07, darkPl, P.pillar, (roofY + sill) / 2, sz * (hc - 0.045));              // B 필러(검정)
        b(P.L * 0.5, 0.022, 0.03, chrome, moldX, P.belt + 0.05, sz * hc);                                                              // 창 아래 크롬 몰딩
        b(Math.min(1.7, P.L * 0.32), 0.012, 0.012, amb, moldX, base + 0.014, sz * (hc - 0.13));                                        // 무드등
      }
      const nc = P.cabin.length, fS = P.cabin[nc - 2], fC = P.cabin[nc - 1].c, rS = P.cabin[0], rC = P.cabin[1].c, rt = suv ? [0.08, 0.6] : [0.1, 0.9];
      const fp = [0.9, 0.63, 0.37, 0.1].map(t => bz(fS, fC, t)), rp = [0, 1, 2, 3].map(i => bz(rS, rC, rt[0] + (rt[1] - rt[0]) * i / 3));
      for (let i = 0; i < 3; i++) { quad(g, fp[i], fp[i + 1], hc * 2 - 0.1, gx, BEVC + 0.004, 1.03); quad(g, rp[i], rp[i + 1], hc * 2 - 0.1, gx, BEVC + 0.004, 1.03); }   // 앞·뒤 유리(곡면을 세 장으로)
      const xF = fp[3][0] + 0.03, xR = rp[3][0] - 0.03; b(xF - xR, 0.05, hc * 2 - 0.06, paint, (xF + xR) / 2, roofY - 0.037, 0, { cast: true });   // 지붕
      const fx0 = fp[0][0], x0 = P.glass[0][0] - 0.12; b(fx0 - x0, 0.04, hc * 2 - 0.16, trim, (fx0 + x0) / 2, base - 0.02, 0);          // 실내 바닥(문 안쪽 윗선)
      b(0.36, 0.08, hc * 2 - 0.14, trim, fx0 - 0.3, base + 0.01, 0); b(0.3, 0.02, hc * 2 - 0.2, leather, fx0 - 0.3, base + 0.056, 0);   // 계기판(가죽 덮개)
      for (const sz of [-1, 1]) b(0.03, 0.012, hc * 0.72, darkPl, fx0 + 0.02, fp[0][1] + BEVC + 0.02, sz * hc * 0.4).rotation.y = sz * 0.1;   // 와이퍼
      const SEATS = { sedan: [[0.0, 2], [-0.86, 3]], sports: [[-0.12, 2]], suv: [[0.3, 2], [-0.72, 3], [-1.62, 2]] }[spec.type] || [[0, 2]];
      const backH = hV * 0.62 + 0.05;
      for (const [sx, n] of SEATS) { const zs = n === 2 ? [-hc * 0.5, hc * 0.5] : [-hc * 0.58, 0, hc * 0.58];
        if (n === 3) b(0.13, backH, hc * 2 - 0.22, leather, sx, base - 0.05 + backH / 2, 0).rotation.z = 0.16;                           // 뒷좌석 등받이(벤치)
        for (const z of zs) { if (n === 2) b(0.13, backH, 0.46, leather, sx, base - 0.05 + backH / 2, z).rotation.z = 0.16;
          b(0.1, hV * 0.26, n === 2 ? 0.25 : 0.2, leather, sx - 0.07, base + hV * 0.76, z); } }                                         // 머리 받침
      const dvx = SEATS[0][0] + 0.46, wr = Math.min(0.16, hV * 0.48), sw = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.02, 8, 22).rotateY(Math.PI / 2), trim); sw.position.set(dvx, base + 0.07, -hc * 0.5); sw.rotation.z = -0.4; g.add(sw);   // 운전대(왼쪽)
      b(0.05, 0.03, wr * 1.9, trim, dvx, base + 0.07, -hc * 0.5).rotation.z = -0.4; b(0.2, 0.05, 0.05, trim, dvx + 0.12, base + 0.03, -hc * 0.5);
      if (brand === 'volvo') { b(0.02, 0.17, 0.115, scr, fx0 - 0.49, base + 0.1, 0); b(0.02, 0.07, 0.24, scr, fx0 - 0.47, base + 0.1, -hc * 0.5); }            // 세로 화면 + 계기 화면
      else if (brand === 'bmw') { const m = b(0.02, 0.095, 0.66, scr, fx0 - 0.48, base + 0.1, -hc * 0.2); m.rotation.y = 0.08; }                                 // 가로로 긴 곡면 화면
      else { b(0.02, 0.11, 0.27, scr, fx0 - 0.49, base + 0.08, 0); const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16), glow(0xffe1a8, 1.4)); ck.rotation.z = Math.PI / 2; ck.position.set(fx0 - 0.36, base + 0.085, 0); g.add(ck); }   // 화면 + 아날로그 시계
      b(0.03, 0.018, hc * 0.9, tl, rp[3][0] + 0.02, rp[3][1] + BEVC + 0.012, 0);                                                         // 보조 제동등
      // 몸통 디테일: 어깨선·아래 크롬·보닛 선·앞 범퍼
      const pdark = paint.clone(); pdark.color.multiplyScalar(pearl ? 0.72 : 0.55);
      b(P.L * 0.62, 0.014, P.W + 0.008, pdark, 0.1, P.belt - 0.17, 0);
      if (!sport) b(P.L * 0.4, 0.018, P.W + 0.012, chrome, 0, P.lower[0][1] + 0.19, 0);
      const h0 = bz(hS, hC, 0.1), h1 = bz(hS, hC, 0.9);
      for (const sz of [-1, 1]) { quad(g, h0, h1, 0.02, pdark, BEV + 0.012, 1).position.z = sz * P.W * (brand === 'bmw' ? 0.13 : 0.23);     // 보닛 주름선
        if (sport) { for (const [ta, tb] of [[0.34, 0.39], [0.42, 0.47], [0.5, 0.55]]) quad(g, bz(hS, hC, ta), bz(hS, hC, tb), 0.2, darkPl, BEV + 0.014, 1).position.z = sz * P.W * 0.19; }   // 보닛 통풍구
        b(0.02, 0.022, 0.15, ind, P.ws[0][0] - 0.1, P.belt + 0.15, sz * (hc + 0.245)); }                                               // 미러 방향지시등
      if (sport) { b(0.2, 0.035, P.W * 0.6, darkPl, FX - 0.04, P.lower[0][1] + 0.015, 0); for (const k of [-0.36, -0.12, 0.12, 0.36]) b(0.16, 0.11, 0.02, darkPl, RX + 0.04, P.lower[0][1] + 0.08, k * P.W * 0.6);   // 앞 스플리터·뒤 디퓨저 날개
        for (const sz of [-1, 1]) { const tb = plane(g, 0.085, 0.085, basic(emblemTex(brand)), -1.37, 1.0, sz * (hc + 0.006)); if (sz < 0) tb.rotation.y = Math.PI; } }   // C 필러 삼지창
      else b(0.05, 0.022, P.W * 0.46, chrome, FX - 0.02, P.lower[0][1] + 0.07, 0);
      if (suv) { b(0.34, 0.07, hc * 2 - 0.04, paint, xR + 0.02, roofY - 0.06, 0); b(0.03, 0.22, P.W + 0.012, chrome, P.wx[1] - 0.66, P.belt - 0.34, 0); b(0.02, 0.012, hc * 0.7, darkPl, rp[1][0] - 0.07, rp[1][1] + 0.02, 0.1); }   // 루프 스포일러·에어 브리더·뒤 와이퍼
      if (brand === 'volvo') for (const sz of [-1, 1]) b(0.04, 0.06, 0.26, chrome, RX + 0.012, P.lower[0][1] + 0.12, sz * P.W * 0.3);   // 범퍼 일체형 배기구
      const ug = new THREE.Mesh(new THREE.PlaneGeometry(P.L + 1.6, P.W + 1.8), new THREE.MeshBasicMaterial({ map: radialTex, color: acc, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); ug.rotation.x = -Math.PI / 2; ug.position.y = 0.03; g.add(ug);   // 바닥 조명
    }
    b(1.0, 0.014, hc * 1.3, ex ? roofGlass : glassCar, sport ? -0.3 : -0.2, P.top + BEVC + 0.002, 0);                                                     // 글라스 루프
    b(P.L * 0.66, 0.1, P.W + 0.016, darkPl, 0, P.lower[0][1] + 0.02, 0);                                                                 // 사이드 스커트
    for (const x of P.doors) b(0.014, P.belt - P.lower[0][1] - 0.16, P.W + 0.012, darkPl, x, (P.belt + P.lower[0][1]) / 2 + 0.04, 0);   // 문 틈
    for (const x of P.doors.slice(1)) { if (brand === 'maserati' || brand === 'mercedes') b(0.2, 0.034, P.W + 0.006, darkPl, x + 0.2, P.belt - 0.1, 0); else b(0.17, 0.03, P.W + 0.03, chrome, x + 0.2, P.belt - 0.1, 0); }   // 손잡이(마세라티·벤츠는 매립형)                                       // 손잡이
    for (const sz of [-1, 1]) { b(0.17, 0.1, 0.2, paint, P.ws[0][0] - 0.18, P.belt + 0.14, sz * (hc + 0.15)); b(0.05, 0.05, 0.14, darkPl, P.ws[0][0] - 0.18, P.belt + 0.07, sz * (hc + 0.06)); }   // 사이드미러
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), darkPl); fin.position.set(P.rw[1][0] + 0.25, P.top + BEVC + 0.07, 0); fin.rotation.z = -0.5; g.add(fin);
    // 바퀴: 타이어·림·스포크·캘리퍼, 펜더 플레어
    const wheels = [], RR = ex ? 0.79 : 0.73;
    for (const wx of P.wx) for (const sz of [-1, 1]) { const hold = new THREE.Group(); hold.position.set(wx, P.r, sz * (P.W / 2 - 0.12)); g.add(hold); const w = new THREE.Group(); hold.add(w); wheels.push(w);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(P.r, P.r, 0.26, 28), tire); t.rotation.x = Math.PI / 2; w.add(t);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(P.r * RR, P.r * RR, 0.262, 24), darkPl); rim.rotation.x = Math.PI / 2; w.add(rim);
      if (!ex) for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(P.r * 1.32, 0.055, 0.27), rimM); sp.rotation.z = i * Math.PI / 5; w.add(sp); }
      else { const R = P.r * RR, spk = (a, r0, len, wd, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(len, wd, 0.268), mat); m.position.set(Math.cos(a) * (r0 + len / 2), Math.sin(a) * (r0 + len / 2), 0); m.rotation.z = a; w.add(m); };
        if (brand === 'volvo') for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; spk(a - 0.13, 0.03, R - 0.03, 0.034, rimM); spk(a + 0.13, 0.03, R - 0.03, 0.034, rimM); }                       // 더블 스포크 5쌍
        else if (brand === 'bmw') for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; spk(a, 0.03, R * 0.44, 0.07, rimM); spk(a - 0.2, R * 0.4, R * 0.6, 0.042, rimM); spk(a + 0.2, R * 0.4, R * 0.6, 0.042, rimM); spk(a + Math.PI / 5, R * 0.5, R * 0.48, 0.026, gunM); }   // Y 스포크 투톤
        else for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; spk(a, 0.03, R - 0.03, 0.028, rimM); spk(a - 0.15, R * 0.46, R * 0.54, 0.024, rimM); spk(a + 0.15, R * 0.46, R * 0.54, 0.024, rimM); }   // 삼지창 스포크 7개
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(P.r * 0.6, P.r * 0.6, 0.03, 26), gunM); disc.rotation.x = Math.PI / 2; disc.position.z = sz * 0.07; hold.add(disc); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(P.r * RR, 0.022, 8, 28), rimM); ring.position.z = sz * 0.125; w.add(ring);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12), rimM); cap.rotation.x = Math.PI / 2; w.add(cap);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(ex ? 0.2 : 0.14, ex ? 0.1 : 0.08, ex ? 0.07 : 0.05), std(sport ? (ex ? 0xd4122a : 0xffd23f) : brand === 'bmw' ? 0x1c69d4 : ex ? 0xc9ced8 : 0x8a8f99, { rough: 0.5 })); cal.position.set(0.12, P.r * 0.42, sz * 0.1); hold.add(cal);
      const ar = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.085, 26, 0, Math.PI), arch); ar.position.set(wx, P.r - 0.02, sz * (P.W / 2 + 0.005)); if (sz < 0) ar.rotation.y = Math.PI; g.add(ar);
      const fl = new THREE.Mesh(new THREE.TorusGeometry(P.r + 0.1, 0.042, 8, 22, Math.PI), suv ? darkPl : paint); fl.position.set(wx, P.r - 0.02, sz * (P.W / 2 + 0.004)); g.add(fl); }
    // ---------- 앞·뒤 얼굴: 브랜드별 최신 디자인 ----------
    const lo = P.lower[0][1], face = (w, h, tx, x, y, z, back) => plane(g, w, h, basic(tx), x, y, z, { ry: back ? -Math.PI / 2 : Math.PI / 2 });
    const prof = []; { let prev = null; for (const q of P.lower) { if (q.c) { for (let i = 1; i <= 10; i++) prof.push(bz(prev, q.c, i / 10)); prev = [q.c[2], q.c[3]]; } else { prof.push(q); prev = q; } } }
    const surf = (front, y) => { let best = null;   // 그 높이에서 차체 앞(뒤) 면의 x
      for (let i = 0; i < prof.length - 1; i++) { const p0 = prof[i], p1 = prof[i + 1]; if ((front ? Math.min(p0[0], p1[0]) < 1 : Math.max(p0[0], p1[0]) > -1) || (p0[1] - y) * (p1[1] - y) > 0 || p0[1] === p1[1]) continue;
        const x = p0[0] + (p1[0] - p0[0]) * (y - p0[1]) / (p1[1] - p0[1]); if (best == null || (front ? x > best : x < best)) best = x; }
      return best == null ? (front ? FX - 0.25 : RX + 0.25) : best + (front ? 1 : -1) * BEV * 0.92; };
    const tilt = (m, front, y, h, lift = 0.012) => { const xt = surf(front, y + h / 2), xb = surf(front, y - h / 2); let dev = 0;   // 볼록한 면이 판을 뚫지 않게, 가장 튀어나온 만큼 더 띄운다
      for (let k = 1; k < 8; k++) { const yy = y - h / 2 + h * k / 8, d = (front ? 1 : -1) * (surf(front, yy) - (xb + (xt - xb) * k / 8)); if (d > dev) dev = d; }
      m.position.x = (xt + xb) / 2 + (front ? 1 : -1) * (dev + lift); m.rotateX(-Math.atan2(front ? xb - xt : xt - xb, h)); return m; };   // 면의 기울기를 따라 눕힌다
    // 모서리 묶음: 둥근 앞·뒤 면을 따라 돌려 놓는다. 안의 좌표 = (면 바깥쪽 dx, 높이 y, 차 바깥쪽 dz)
    const corner = (front, sz, zu, y) => { const z0 = sz * hw * zu, K = front ? KF : KR, cg = new THREE.Group(); cg.position.set(surf(front, y) + (front ? -1 : 1) * (edge(z0, K) + 0.012), 0, z0); cg.rotation.y = (front ? -1 : 1) * sz * Math.atan(slope(z0, K)); g.add(cg);
      const f = (w, h, d, mat, dx, yy, dz) => box(cg, w, h, d, mat, (front ? 1 : -1) * dx, yy, sz * dz, { cast: false }); f.g = cg; return f; };
    const G = { bmw: [0.98, 0.44, 0.82], mercedes: [1.02, 0.3, 0.63], volvo: [0.94, 0.33, 0.63], maserati: [1.04, 0.28, 0.46] }[brand];
    tilt(face(G[0], G[1], grilleTex(brand), 0, G[2], 0), true, G[2], G[1]);
    if (brand === 'bmw') quad(g, bz(hS, hC, 0.83), bz(hS, hC, 0.97), 0.14, basic(emblemTex(brand)), BEV + 0.008, 1);                    // 보닛 코의 엠블럼
    else { const es = brand === 'mercedes' ? 0.26 : brand === 'maserati' ? 0.2 : 0.17; tilt(face(es, es, emblemTex(brand), 0, G[2], 0), true, G[2], G[1], 0.022); }
    b(0.06, brand === 'bmw' ? 0.2 : 0.13, P.W * 0.5, darkPl, surf(true, lo + 0.13) - 0.02, lo + 0.13, 0);                                // 아래 흡기구
    if (brand === 'bmw') b(0.05, 0.045, P.W * 0.44, chrome, surf(true, lo + 0.03) - 0.012, lo + 0.03, 0);                                // 스키드 플레이트
    for (const sz of [-1, 1]) {
      if (brand === 'volvo') { const y = P.fy, L1 = corner(true, sz, 0.6, y);                                                             // 토르의 망치(T 자 주간등)
        L1(0.1, 0.115, 0.42, glassCar, -0.02, y, 0); L1(0.1, 0.026, 0.37, hl, -0.012, y, 0); L1(0.1, 0.1, 0.03, hl, -0.012, y, -0.075);
        const L2 = corner(true, sz, 0.62, lo + 0.17); L2(0.08, 0.1, 0.3, darkPl, -0.02, lo + 0.17, 0); L2(0.08, 0.016, 0.22, chrome, -0.01, lo + 0.2, 0); }
      else if (brand === 'bmw') { const y1 = P.fy - 0.02, U = corner(true, sz, 0.62, y1);                                                 // 위아래로 나뉜 전조등
        U(0.1, 0.06, 0.44, glassCar, -0.02, y1, 0); U(0.1, 0.024, 0.18, hl, -0.012, y1 + 0.004, -0.11); U(0.1, 0.024, 0.18, hl, -0.012, y1 + 0.004, 0.1);
        const y2 = P.fy - 0.2, M = corner(true, sz, 0.64, y2); M(0.1, 0.13, 0.3, darkPl, -0.02, y2, 0); M(0.1, 0.05, 0.085, hl, -0.014, y2, -0.06); M(0.1, 0.05, 0.085, hl, -0.014, y2, 0.06);
        const A = corner(true, sz, 0.8, lo + 0.26); A(0.08, 0.24, 0.07, darkPl, -0.02, lo + 0.26, 0); }                                  // 에어 커튼
      else if (brand === 'mercedes') { const y = P.fy, L1 = corner(true, sz, 0.62, y);                                                    // 눈썹 주간등 + 그릴과 이어지는 검은 패널
        L1(0.1, 0.13, 0.4, glassCar, -0.02, y, 0); L1(0.1, 0.024, 0.36, hl, -0.012, y + 0.045, 0); L1(0.1, 0.045, 0.1, hl, -0.012, y - 0.02, -0.09); L1(0.1, 0.045, 0.1, hl, -0.012, y - 0.02, 0.07);
        L1(0.09, 0.11, 0.16, darkPl, -0.024, y - 0.01, -0.27); }
      else { const hA = bz(hS, hC, 0.8), hB = bz(nS, nC, 0.3), zz = sz * P.W * 0.33;                                                      // 펜더 위에 길게 누운 전조등
        quad(g, hA, hB, 0.17, glassCar, BEV + 0.016, 1).position.z = zz; quad(g, hA, hB, 0.028, hl, BEV + 0.021, 0.9).position.z = zz + sz * 0.055; quad(g, bz(nS, nC, 0.12), hB, 0.12, hl, BEV + 0.021, 1).position.z = zz;
        const C = corner(true, sz, 0.68, lo + 0.2); C(0.08, 0.13, 0.3, darkPl, -0.02, lo + 0.2, 0); }
      const I1 = corner(true, sz, 0.8, P.fy - 0.11), I2 = corner(false, sz, 0.78, P.ry - 0.14); I1(0.08, 0.03, 0.1, ind, -0.024, P.fy - 0.11, 0); I2(0.08, 0.03, 0.1, ind, -0.024, P.ry - 0.14, 0);
      // 뒤: 브랜드별 후미등·배기구
      if (brand === 'volvo') { const y = P.ry - 0.03, T = corner(false, sz, 0.72, y); T(0.1, 0.27, 0.045, tl, -0.012, y, 0.07); T(0.1, 0.045, 0.28, tl, -0.012, y + 0.113, -0.07); T(0.1, 0.045, 0.28, tl, -0.012, y - 0.113, -0.07); }   // C 자
      else if (brand === 'bmw') { const y = P.ry + 0.02, T = corner(false, sz, 0.62, y); T(0.1, 0.085, 0.46, glassCar, -0.02, y, 0); T(0.1, 0.03, 0.42, tl, -0.012, y + 0.015, 0); T(0.1, 0.03, 0.2, tl, -0.012, y - 0.022, 0.1);       // 얇은 가로등
        const E = corner(false, sz, 0.5, lo + 0.13); E(0.09, 0.075, 0.28, chrome, -0.02, lo + 0.13, 0); E(0.095, 0.045, 0.23, darkPl, -0.02, lo + 0.13, 0); }                                                                           // 사다리꼴 배기 장식
      else if (brand === 'mercedes') { const y = P.ry + 0.04, T = corner(false, sz, 0.62, y); T(0.1, 0.1, 0.46, glassCar, -0.02, y, 0); T(0.1, 0.022, 0.42, tl, -0.012, y + 0.03, 0);
        for (const dz of [-0.11, 0.1]) plane(T.g, 0.1, 0.1, starM, -0.04, y - 0.012, sz * dz, { ry: -Math.PI / 2 }); }                                                                                                              // 별 무늬 후미등
      else { const y = P.ry + 0.03, T = corner(false, sz, 0.6, y); T(0.1, 0.04, 0.46, tl, -0.012, y, 0); T(0.1, 0.11, 0.04, tl, -0.012, y - 0.04, 0.21); }                                                                         // 부메랑
      const R1 = corner(false, sz, 0.42, P.ry - 0.2); R1(0.08, 0.05, 0.13, rv, -0.02, P.ry - 0.2, 0);
      if (brand !== 'bmw') for (const k of sport ? [0, 1] : [0]) { const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 14), chrome); tp.rotation.z = Math.PI / 2; tp.position.set(surf(false, lo + 0.1) + 0.03, lo + 0.1, sz * (P.W * 0.28 - k * 0.14)); g.add(tp); } }
    b(0.06, 0.16, P.W * 0.56, darkPl, surf(false, lo + 0.1) + 0.02, lo + 0.1, 0);                                                         // 디퓨저
    const rtxt = (text, h, y, z, wgt = 700) => textPlane(g, text, { h, px: 64, color: pearl ? '#2b2e36' : '#e8ecf2', weight: wgt, x: surf(false, y) - 0.01, y, z, ry: -Math.PI / 2 });
    const ey = suv ? P.ry - 0.12 : P.ry + 0.07; tilt(face(0.14, 0.14, emblemTex(brand), 0, ey, 0, true), false, ey, 0.14);
    if (brand === 'volvo') rtxt('V O L V O', 0.075, P.ry - 0.09, 0, 800);
    else if (brand === 'maserati') rtxt('MASERATI', 0.06, P.ry - 0.07, 0);
    else if (brand === 'bmw') { b(0.03, 0.022, P.W * 0.42, chrome, surf(false, P.ry + 0.02) - 0.01, P.ry + 0.02, 0); rtxt('xDrive40i', 0.05, P.ry - 0.12, P.W * 0.3, 600); }   // 후미등을 잇는 크롬 바
    else b(0.04, 0.07, P.W * 0.34, darkPl, surf(false, P.ry + 0.04) - 0.004, P.ry + 0.04, 0);                                             // 후미등을 잇는 검은 띠
    rtxt(spec.badge || '', 0.08, P.ry - (suv ? 0.12 : 0.19), -P.W * 0.3, 800);
    const plTex = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#f6f6f2'; c.beginPath(); c.roundRect(0, 0, w, h, 8); c.fill(); c.strokeStyle = '#1b1b22'; c.lineWidth = 4; c.beginPath(); c.roundRect(3, 3, w - 6, h - 6, 6); c.stroke(); c.fillStyle = '#111118'; c.font = `800 40px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(plate, w / 2, h / 2 + 3); });
    tilt(face(0.52, 0.13, plTex, 0, lo + 0.15, 0), true, lo + 0.15, 0.13, 0.03); tilt(face(0.52, 0.13, plTex, 0, P.ry - 0.3, 0, true), false, P.ry - 0.3, 0.13);
    // 차종별 덧붙임
    if (sport) { for (const x of [1.18, 1.02, 0.86]) b(0.09, 0.055, P.W + 0.014, darkPl, x, P.belt - 0.14, 0); b(0.22, 0.03, P.W * 0.8, paint, RX + 0.12, P.ry + 0.2, 0); }        // 펜더 통풍구 3개·립 스포일러
    if (suv) { for (const sz of [-1, 1]) { b(2.3, 0.04, 0.05, chrome, -0.9, P.top + BEVC + 0.03, sz * (hc - 0.12)); b(2.5, 0.05, 0.16, chrome, 0, P.lower[0][1] + 0.04, sz * (P.W / 2 + 0.05)); } }   // 루프 레일·사이드 스텝
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(P.L + 1.5, P.W + 1.3), new THREE.MeshBasicMaterial({ map: carShadow, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.022; g.add(sh);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial({ map: radialTex, color: 0xfff1cf, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    beam.rotation.x = -Math.PI / 2; beam.position.set(P.L / 2 + 3.0, 0.035, 0); g.add(beam);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(P.L + 0.5, P.top + 0.3, P.W + 0.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.y = (P.top + 0.3) / 2; g.add(hit);
    return { g, wheels, hl, tl, rv, ind, beam, hit, P, topY: P.top + BEVC };
  }
  // 전면 주차(앞머리가 차로 쪽). 나갈 때는 앞으로 나와 오른쪽으로 돌고, 들어올 때는 자리를 지나쳐 멈춘 뒤 후진으로 넣는다.
  const head = a => ({ x: Math.sin(a), z: -Math.cos(a) });   // 호 각도 a 에서 차 앞머리 방향(a=π: 차로 쪽, a=π/2: 오른쪽)
  // ---------- 교통 정리: 차는 절대 겹치지 않는다 ----------
  // 차로(가로 한 줄)는 모두 +x 로만 달린다. 자리에서 빼거나 넣는 동안에는 자기 자리 앞 구간을 「예약」하고,
  // 예약이 안 되면 자리(나갈 때) 또는 차로 뒤쪽(들어올 때)에서 기다린다. 차로에서는 앞차와 남의 예약 구간 앞에서 멈춘다.
  const GAP = 6.4, traffic = {
    res: new Map(),                                                        // 차 → [x 시작, x 끝] (빼기·넣기에 쓰는 구간)
    zone(c) { return [c.bx - 1.7, c.bx + LOT.R + 3.6]; },
    hit(a, b) { return a[0] < b[1] && b[0] < a[1]; },
    travelling(c) { return (c.state === 'leaving' && c.phase === 3) || (c.state === 'arriving' && c.phase === 0); },   // 차로를 달리는 중
    tryReserve(c, departing) {
      if (this.res.has(c)) return true; const z = this.zone(c);
      for (const [o, r] of this.res) if (o !== c && this.hit(z, r)) return false;                 // 옆 차가 빼거나 넣는 중
      for (const o of cars) { if (o === c || !this.travelling(o)) continue;
        if (departing ? (o.x > z[0] - 15 && o.x < z[1] + 1) : (o.x > c.x && o.x < z[1] + 1)) return false; }   // 차로에 다가오는(지나가는) 차가 있다
      this.res.set(c, z); return true; },
    release(c) { this.res.delete(c); },
    limit(c) {                                                             // 차로를 달리는 차가 나아가도 되는 한계 x
      let lim = Infinity;
      for (const o of cars) if (o !== c && this.travelling(o) && o.x > c.x) lim = Math.min(lim, o.x - GAP);
      for (const [o, r] of this.res) if (o !== c && r[0] > c.x) lim = Math.min(lim, r[0] - 3.6);
      if (c.state === 'arriving' && !this.res.has(c)) lim = Math.min(lim, this.zone(c)[0] - 0.6);
      return lim; },
  };
  class Car {
    constructor(spec, bx, plate, label, owner) {
      Object.assign(this, makeCar(spec, plate)); this.spec = spec; this.bx = bx; this.owner = owner || null; this.name = label; this.state = 'parked'; this.phase = 0; this.t = 0; this.v = 0; this.user = null; this.cb = null; this.wantArrive = false; this.lights = 0; this.a = Math.PI; this.blinkT = 0; this.moving = false;
      this.x = bx; this.z = LOT.BAY_Z; this.g.userData.dynamic = true; lot.add(this.g); this.pose(bx, LOT.BAY_Z, head(Math.PI)); this.hit.userData.car = this;
      this.label = textPlane(lot, label, { h: 0.34, px: 64, color: '#ffffff', weight: 800, x: bx, y: this.topY + 0.62, z: LOT.BAY_Z }); this.label.visible = false; this.label.userData.dynamic = true;
    }
    get door() { return { x: this.bx + 1.34, z: LOT.BAY_Z + 0.25 }; }
    pose(x, z, h) { const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz), fwd = dx * h.x + dz * h.z >= 0 ? 1 : -1; for (const w of this.wheels) w.rotation.z -= fwd * d / this.P.r;
      this.x = x; this.z = z; this.g.position.set(x, 0, z); this.g.rotation.y = Math.atan2(-h.z, h.x); }
    unlock() { if (this.blinkT <= 0 && this.state === 'parked') this.blinkT = 1.25; }   // 주인이 다가오면 깜빡이 두 번
    depart() { if (this.state === 'parked') { this.wantDepart = false; this.state = 'leaving'; this.phase = 0; this.t = 0; this.v = 0; this.a = Math.PI; } else if (this.state === 'arriving') this.wantDepart = true; }   // 주차 중이면 다 대고 바로 다시 나간다
    arrive(cb) { this.cb = cb; this.wantDepart = false; if (this.state === 'gone') this.startArrive();
      else if (this.state === 'leaving' && this.phase === 0) { this.state = 'parked'; traffic.release(this); const f = this.cb; this.cb = null; f && f(); }   // 아직 자리에서 기다리던 중이면 그대로 취소
      else if (this.state === 'leaving') this.wantArrive = true; else if (this.state === 'parked') { const f = this.cb; this.cb = null; f && f(); } }
    startArrive() { this.state = 'arriving'; this.phase = 0; this.t = 0; this.wantArrive = false; this.g.visible = true;
      let sx = -104; for (const o of cars) if (o !== this && o.state === 'arriving' && o.phase === 0) sx = Math.min(sx, o.x - GAP);   // 먼저 들어오는 차 뒤에 줄을 선다
      this.x = sx; this.z = LOT.LANE_Z; this.pose(sx, LOT.LANE_Z, head(Math.PI / 2)); this.v = 13; this.a = Math.PI / 2; }
    snapGone() { this.state = 'gone'; this.g.visible = false; traffic.release(this); }
    view() { const y = LOT.GY; return { tgt: new THREE.Vector3(this.x, y + 0.72, this.z), pos: new THREE.Vector3(this.x + 3.5, y + 1.75, this.z + 6.4) }; }
    update(dt) {
      const R = LOT.R, cx = this.bx + R; let reversing = false, braking = false; this.moving = this.state === 'leaving' || this.state === 'arriving';
      if (this.state === 'leaving') {
        if (this.phase === 0) { this.t += dt; if (this.t > 0.9 && traffic.tryReserve(this, true)) this.phase = 1; }   // 앞이 비고 차로가 한산해질 때까지 자리에서 기다린다
        else if (this.phase === 1) { this.v = Math.min(2.8, this.v + dt * 2.6); const z = Math.min(LOT.ARC_Z, this.z + this.v * dt); this.pose(this.bx, z, head(Math.PI)); if (z >= LOT.ARC_Z) this.phase = 2; }
        else if (this.phase === 2) { this.v = Math.min(4.2, this.v + dt * 2); this.a = Math.max(Math.PI / 2, this.a - (this.v / R) * dt); this.pose(cx + R * Math.cos(this.a), LOT.ARC_Z + R * Math.sin(this.a), head(this.a)); if (this.a <= Math.PI / 2) this.phase = 3; }
        else { const lim = traffic.limit(this); this.v = Math.max(0, Math.min(16, this.v + dt * 5.5, (lim - this.x) * 1.6)); braking = lim - this.x < 8;
          this.pose(Math.max(this.x, Math.min(lim, this.x + this.v * dt)), LOT.LANE_Z, head(Math.PI / 2));
          if (traffic.res.has(this) && this.x > traffic.zone(this)[1]) traffic.release(this);
          if (this.x > 104) { this.state = 'gone'; this.g.visible = false; traffic.release(this); if (this.wantArrive) this.startArrive(); } }
      } else if (this.state === 'arriving') {
        if (this.phase === 0) { if (this.x > traffic.zone(this)[0] - 16) traffic.tryReserve(this, false);
          const lim = Math.min(cx, traffic.limit(this)), left = lim - this.x; this.v = Math.max(0, Math.min(13, (lim >= cx ? 1.2 : 0) + left * 0.85)); braking = left < 14;
          const x = Math.max(this.x, Math.min(lim, this.x + this.v * dt)); this.pose(x, LOT.LANE_Z, head(Math.PI / 2)); if (x >= cx && traffic.res.has(this)) { this.phase = 1; this.t = 0; this.a = Math.PI / 2; } }
        else if (this.phase === 1) { braking = true; reversing = true; this.t += dt; if (this.t > 0.6) { this.phase = 2; this.v = 0; } }
        else if (this.phase === 2) { reversing = true; this.v = Math.min(2.3, this.v + dt * 2); this.a = Math.min(Math.PI, this.a + (this.v / R) * dt); this.pose(cx + R * Math.cos(this.a), LOT.ARC_Z + R * Math.sin(this.a), head(this.a)); if (this.a >= Math.PI) this.phase = 3; }
        else if (this.phase === 3) { reversing = true; const left = this.z - LOT.BAY_Z; this.v = Math.max(0.6, Math.min(2.3, left * 1.5)); braking = left < 1.2; const z = Math.max(LOT.BAY_Z, this.z - this.v * dt); this.pose(this.bx, z, head(Math.PI)); if (z <= LOT.BAY_Z) { this.phase = 4; this.t = 0; } }
        else { braking = true; this.t += dt; if (this.t > 0.7) { this.state = 'parked'; traffic.release(this); const f = this.cb; this.cb = null; f && f(); if (this.wantDepart) this.depart(); } }
      }
      this.blinkT = Math.max(0, this.blinkT - dt); const blink = this.blinkT > 0 && Math.floor(this.blinkT / 0.3) % 2 === 0;
      this.lights += ((this.moving ? 1 : 0) - this.lights) * Math.min(1, dt * 4);
      this.hl.color.setHex(0xfff6e0).multiplyScalar((this.spec.exec ? 0.92 : 0.4) + 2.5 * this.lights + (blink ? 1.6 : 0)); this.beam.material.opacity = 0.3 * this.lights;
      this.tl.color.setHex(0xff2a3a).multiplyScalar(braking ? 2.8 : (this.spec.exec ? 0.72 : 0.6) + 0.5 * this.lights); this.rv.color.setHex(0xffffff).multiplyScalar(reversing ? 2.4 : 0.05); this.ind.color.setHex(0xffa51f).multiplyScalar(blink ? 3 : 0.06);
    }
  }
  const exec = {}, pool = [];
  V.exec.forEach((v, i) => { const o = HQ.byId[v.owner] || {}; exec[v.owner] = new Car({ ...v, exec: true }, EXEC_X(i), v.plate || '00가 0000', `${v.model} · ${o.name || ''}`, v.owner); });
  for (let i = 0; i < poolN; i++) pool.push(new Car({ ...V.pool, color: (V.pool.colors || [])[i % ((V.pool.colors || []).length || 1)] || V.pool.color }, POOL_X(i), `${20 + i}하 ${String(3000 + i * 137).slice(0, 4)}`, `업무용 ${i + 1} · ${V.pool.model}`));
  const cars = [...Object.values(exec), ...pool];

  // ---------- 옥상 헬리패드·써포츠 헬기 ----------
  const PAD = { x: 7.0, z: -0.2, r: 3.2 }, hcol = new THREE.Color((V.heli && V.heli.color) || '#6A3CFF');
  const padTex = canvasTex(512, 512, (g, w) => { g.fillStyle = '#23212f'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 4, 0, 7); g.fill(); g.strokeStyle = '#ffd23f'; g.lineWidth = 16; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 34, 0, 7); g.stroke();
    g.fillStyle = '#ffffff'; g.font = `900 250px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, w / 2 + 14); });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(PAD.r, 48), new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.8, transparent: true })); pad.rotation.x = -Math.PI / 2; pad.position.set(PAD.x, 0.03, PAD.z); pad.receiveShadow = true; roof.add(pad);
  const padLights = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, m = glow(0x39e58c, 1.6), b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), m); b.position.set(PAD.x + Math.cos(a) * (PAD.r + 0.12), 0.09, PAD.z + Math.sin(a) * (PAD.r + 0.12)); roof.add(b); padLights.push(m); }
  const heliG = new THREE.Group(); roof.add(heliG);
  const hp = new THREE.MeshPhysicalMaterial({ color: hcol, metalness: 0.5, roughness: 0.3, clearcoat: 1, envMap: ctx.env || null, envMapIntensity: 0.22 }), hw = std(0xf4f1ff, { rough: 0.5 });
  const fus = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), hp); fus.scale.set(1.85, 1.0, 0.95); fus.position.y = 1.5; fus.castShadow = true; heliG.add(fus);
  const cock = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), glassCar); cock.scale.set(1.2, 0.86, 0.9); cock.position.set(0.82, 1.56, 0); cock.rotation.z = -Math.PI / 2.35; heliG.add(cock);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), hw); belly.scale.set(1.5, 0.5, 0.8); belly.position.set(0, 1.02, 0); heliG.add(belly);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.34, 3.5, 12), hp); boom.rotation.z = Math.PI / 2; boom.position.set(-3.1, 1.72, 0); boom.castShadow = true; heliG.add(boom);
  box(heliG, 0.9, 1.15, 0.08, hp, -4.75, 2.25, 0, { cast: false }).rotation.z = 0.35; box(heliG, 0.5, 0.06, 1.3, hp, -4.6, 1.8, 0, { cast: false });
  for (const sz of [-1, 1]) { textPlane(heliG, (V.heli && V.heli.name) || 'SUPPORTS', { h: 0.3, px: 72, color: '#ffffff', weight: 900, x: -2.9, y: 1.76, z: sz * 0.3, ry: sz > 0 ? 0 : Math.PI });
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.3, 8), metalMat); sk.rotation.z = Math.PI / 2; sk.position.set(0.1, 0.1, sz * 0.86); heliG.add(sk);
    for (const sx of [-0.8, 0.9]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6), metalMat); st.position.set(sx, 0.45, sz * 0.74); st.rotation.x = sz * -0.32; heliG.add(st); } }
  box(heliG, 3.3, 0.07, 0.1, hw, 0, 1.5, 0.92, { cast: false }); box(heliG, 3.3, 0.07, 0.1, hw, 0, 1.5, -0.92, { cast: false });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), metalMat); mast.position.set(0, 2.72, 0); heliG.add(mast);
  const rotor = new THREE.Group(); rotor.position.set(0, 2.98, 0); heliG.add(rotor); for (let i = 0; i < 4; i++) { const b = box(rotor, 3.5, 0.035, 0.24, 0x1a1a22, 1.75, 0, 0, { cast: false }); const piv = new THREE.Group(); piv.rotation.y = i * Math.PI / 2; rotor.remove(b); piv.add(b); rotor.add(piv); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.55, 40), new THREE.MeshBasicMaterial({ color: 0xcfd6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; disc.position.set(0, 3.0, 0); heliG.add(disc);
  const trot = new THREE.Group(); trot.position.set(-4.82, 2.3, 0.12); heliG.add(trot); for (let i = 0; i < 2; i++) { const b = box(trot, 0.07, 1.15, 0.03, 0x1a1a22, 0, 0, 0, { cast: false }); b.rotation.z = i * Math.PI / 2; }
  const navR = glow(0xff2a3a, 2), navG = glow(0x39e58c, 2); const n1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), navR); n1.position.set(0, 1.5, 0.98); heliG.add(n1); const n2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), navG); n2.position.set(0, 1.5, -0.98); heliG.add(n2);
  const heliHit = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3.4, 3.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); heliHit.position.set(-1.2, 1.7, 0); heliG.add(heliHit);
  const HREST = { x: PAD.x, y: 0.04, z: PAD.z, yaw: -0.45 }, FLY = new THREE.Vector3(0.82, 0.3, 0.5).normalize();
  const heli = { g: heliG, hit: heliHit, spinners: [rotor, trot], name: `${(V.heli && V.heli.name) || 'SUPPORTS'} 헬기`, state: 'parked', phase: 0, t: 0, spin: 0, user: null, cb: null, wantArrive: false, door: { x: PAD.x - 0.3, z: PAD.z + 1.7 },
    depart() { if (this.state === 'parked') { this.wantDepart = false; this.state = 'leaving'; this.phase = 0; this.t = this.spin * 2.4; } else if (this.state === 'arriving') this.wantDepart = true; },   // 착륙·시동 끄는 중이면 내려앉는 대로 다시 뜬다
    arrive(cb) { this.cb = cb; this.wantDepart = false; if (this.state === 'gone') this.startArrive(); else if (this.state === 'leaving') this.wantArrive = true; else if (this.state === 'parked') { const f = this.cb; this.cb = null; f && f(); } },
    startArrive() { this.state = 'arriving'; this.phase = 0; this.t = 0; this.wantArrive = false; this.g.visible = true; this.spin = 1; },
    snapGone() { this.state = 'gone'; this.g.visible = false; },
    place(h, d, pitch) { this.g.position.set(HREST.x + FLY.x * d, HREST.y + h + FLY.y * d, HREST.z + FLY.z * d); this.g.rotation.set(0, HREST.yaw + Math.min(1, h / 5) * 0.25, pitch); },
    update(dt, now) {
      const ease = k => k * k * (3 - 2 * k);
      if (this.state === 'leaving') { this.t += dt;
        if (this.phase === 0) { this.spin = Math.min(1, this.t / 2.4); this.place(0, 0, 0); if (this.t > 2.6) { this.phase = 1; this.t = 0; } }
        else if (this.phase === 1) { const k = Math.min(1, this.t / 3.0); this.place(7.5 * ease(k), 0, -0.07 * k); if (k >= 1) { this.phase = 2; this.t = 0; } }
        else { const d = 4.2 * this.t * this.t; this.place(7.5, d, -0.2); if (d > 150) { this.state = 'gone'; this.g.visible = false; if (this.wantArrive) this.startArrive(); } } }
      else if (this.state === 'arriving') { this.t += dt;
        if (this.phase === 0) { const T = 6.0, k = Math.min(1, this.t / T), d = 150 * (1 - ease(k)); this.place(7.5, d, 0.14 * (1 - k)); if (k >= 1) { this.phase = 1; this.t = 0; } }
        else if (this.phase === 1) { const k = Math.min(1, this.t / 3.2); this.place(7.5 * (1 - ease(k)), 0, 0); if (k >= 1) { this.phase = 2; this.t = 0; const f = this.cb; this.cb = null; f && f(); } }
        else { this.spin = Math.max(0, 1 - this.t / 3.0);   // 내려앉은 뒤: 기다리는 사람을 내리고, 다시 타면 날개를 멈추지 않고 뜬다
          if (this.cb) { const f = this.cb; this.cb = null; f(); }
          if (this.wantDepart) { this.state = 'parked'; this.depart(); } else if (this.spin <= 0) this.state = 'parked'; } }
      else if (this.state === 'parked') { this.spin = Math.max(0, this.spin - dt * 0.5); this.place(0, 0, 0); }
      rotor.rotation.y += dt * 34 * this.spin; trot.rotation.z += dt * 50 * this.spin; disc.material.opacity = 0.16 * Math.max(0, this.spin - 0.35) / 0.65;
      const blink = Math.sin(now / 240) > 0.2 ? 2.4 : 0.3; navR.color.setHex(0xff2a3a).multiplyScalar(this.state === 'parked' && this.spin === 0 ? 0.5 : blink); navG.color.setHex(0x39e58c).multiplyScalar(this.state === 'parked' && this.spin === 0 ? 0.5 : blink);
      const pl = this.state === 'parked' && this.spin === 0 ? 0.9 : 1.2 + Math.sin(now / 180) * 0.9; for (const m of padLights) m.color.setHex(0x39e58c).multiplyScalar(pl);
    } };
  heli.place(0, 0, 0); heliHit.userData.heli = heli;
  heli.view = y0 => ({ tgt: new THREE.Vector3(PAD.x - 0.6, y0 + 1.6, PAD.z), pos: new THREE.Vector3(PAD.x + 4.5, y0 + 3.6, PAD.z + 9.5) });


  // ---------- 1층 오른쪽 전용 카페 ----------
  const CAF = { x0: 15.45, x1: 24.7, z0: -5.4, z1: 5.7, h: 3.5, doorZ: 4.3 }, amber = new THREE.Color(0xffb25c), cafe = new THREE.Group(); scene.add(cafe);
  const cafeRoof = new THREE.Group(); cafe.add(cafeRoof); const cw = CAF.x1 - CAF.x0, cd = CAF.z1 - CAF.z0, ccx = (CAF.x0 + CAF.x1) / 2, ccz = (CAF.z0 + CAF.z1) / 2;
  box(cafe, cw + 0.4, 0.5, cd + 0.4, std(0x15132a, { rough: 0.7 }), ccx, -0.25, ccz, { cast: false, recv: false });
  const wood2 = ctx.tex ? ctx.tex('assets/art/floor.jpg', [3, 3]) : null;
  plane(cafe, cw, cd, std(0xf1d9b8, { map: wood2, rough: 0.7 }), ccx, 0.012, ccz, { rx: -Math.PI / 2, recv: true });
  plane(cafe, cw, CAF.h, std(0x2a1d14, { rough: 0.9 }), ccx, CAF.h / 2, CAF.z0 + 0.01, { recv: true }); box(cafe, cw + 0.4, CAF.h, 0.25, 0x0d0b1e, ccx, CAF.h / 2, CAF.z0 - 0.14, { cast: false });
  plane(cafe, cw + 3, 6, new THREE.MeshBasicMaterial({ map: radialTex, color: amber, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), ccx, 2.6, CAF.z0 + 0.03);
  const cglass = new THREE.MeshPhysicalMaterial({ color: 0xffe2bd, transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }), cframe = std(0x1a1833, { metal: 0.5, rough: 0.4 });
  plane(cafe, cw, CAF.h, cglass, ccx, CAF.h / 2, CAF.z1); plane(cafe, cd, CAF.h, cglass, CAF.x1, CAF.h / 2, ccz, { ry: Math.PI / 2 });
  for (const [x, z] of [[CAF.x1, CAF.z1], [CAF.x1, CAF.z0], [ccx, CAF.z1], [CAF.x0 + 0.1, CAF.z1]]) box(cafe, 0.12, CAF.h, 0.12, cframe, x, CAF.h / 2, z, { cast: false });
  box(cafe, cw, 0.07, 0.07, glow(amber, 1.9), ccx, CAF.h - 0.25, CAF.z0 + 0.05, { cast: false }); box(cafe, cw + 0.4, 0.09, 0.08, glow(amber, 2.1), ccx, -0.07, CAF.z1 + 0.22, { cast: false });
  // 건물 쪽 출입구(1층 오른쪽 벽)
  box(cafe, 0.36, 2.5, 1.7, 0x07060f, 15.16, 1.25, CAF.doorZ, { cast: false }); for (const sz of [-1, 1]) box(cafe, 0.4, 2.6, 0.08, glow(amber, 1.5), 15.16, 1.3, CAF.doorZ + sz * 0.88, { cast: false }); box(cafe, 0.4, 0.08, 1.84, glow(amber, 1.5), 15.16, 2.58, CAF.doorZ, { cast: false });
  textPlane(cafe, 'CAFÉ →', { h: 0.26, px: 64, color: '#ffb25c', glow: true, boost: 1.4, weight: 800, x: 14.96, y: 2.9, z: CAF.doorZ, ry: -Math.PI / 2 });
  // 카운터·머신·쇼케이스·메뉴판
  box(cafe, 5.6, 1.0, 0.85, 0x3a281b, 20.6, 0.5, -3.4); box(cafe, 5.7, 0.07, 0.95, 0xf1e3cc, 20.6, 1.03, -3.4); box(cafe, 5.6, 0.05, 0.04, glow(amber, 1.5), 20.6, 0.2, -2.96, { cast: false });
  box(cafe, 0.9, 0.62, 0.6, chrome, 22.4, 1.37, -3.45); for (const k of [-1, 1]) box(cafe, 0.05, 0.16, 0.05, darkPl, 22.4 + k * 0.2, 1.14, -3.1, { cast: false }); box(cafe, 0.3, 0.3, 0.3, darkPl, 23.1, 1.21, -3.5);
  const caseG = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0.05, depthWrite: false }); box(cafe, 1.3, 0.55, 0.6, caseG, 18.5, 1.34, -3.4, { cast: false });
  for (let i = 0; i < 5; i++) box(cafe, 0.2, 0.1, 0.2, std([0xf5c16c, 0xff8fb1, 0x8b5a2b, 0xf5e6c8, 0xb6f23c][i], { rough: 0.8 }), 18.02 + i * 0.24, 1.14, -3.4, { cast: false });
  for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.3, 12), std(0xffffff, { rough: 0.6 })); st.position.set(19.6 + i * 0.14, 1.22, -3.6); cafe.add(st); }
  const menu = canvasTex(640, 300, (g, w, h) => { g.fillStyle = '#17110c'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb25c'; g.font = `900 40px ${FONT}`; g.fillText(`${cfg.building.name} CAFÉ`, 28, 54);
    g.font = `600 26px ${FONT}`; [['아메리카노', 'HOT · ICE'], ['카페 라떼', 'HOT · ICE'], ['말차 라떼', 'ICE'], ['딸기 에이드', 'ICE'], ['오렌지 주스', 'ICE'], ['허브 티', 'HOT']].forEach(([n, t], i) => { const x = 28 + (i % 2) * 310, y = 112 + Math.floor(i / 2) * 60; g.fillStyle = '#f6ead8'; g.fillText(n, x, y); g.fillStyle = '#b89a78'; g.font = `500 18px ${FONT}`; g.fillText(t, x, y + 24); g.font = `600 26px ${FONT}`; }); });
  box(cafe, 3.5, 1.7, 0.06, 0x0b0907, 20.6, 2.45, CAF.z0 + 0.05, { cast: false }); plane(cafe, 3.36, 1.58, new THREE.MeshBasicMaterial({ map: menu, toneMapped: false }), 20.6, 2.45, CAF.z0 + 0.09);
  // 로봇 바리스타
  const bot = new THREE.Group(); bot.position.set(20.9, 1.06, -4.35); bot.userData.dynamic = true; cafe.add(bot);
  const botW = std(0xf4f1ff, { rough: 0.4 }); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 20), botW); base.position.y = 0.15; bot.add(base);
  const arm1 = new THREE.Group(); arm1.position.y = 0.3; bot.add(arm1); box(arm1, 0.14, 0.75, 0.14, botW, 0, 0.37, 0, { cast: false });
  const arm2 = new THREE.Group(); arm2.position.y = 0.75; arm1.add(arm2); box(arm2, 0.12, 0.6, 0.12, std(0xffb25c, { rough: 0.5 }), 0, 0.3, 0, { cast: false });
  const grip = new THREE.Group(); grip.position.y = 0.6; arm2.add(grip); box(grip, 0.2, 0.06, 0.1, darkPl, 0, 0, 0, { cast: false }); const gcup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.13, 12), std(0xffffff, { rough: 0.6 })); gcup.position.y = -0.09; grip.add(gcup);
  const faceT = canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7dd3fc'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.arc(40, 46, 13, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(88, 46, 13, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(64, 60, 14, 0.2, Math.PI - 0.2); g.stroke(); });
  box(bot, 0.42, 0.32, 0.08, darkPl, -0.55, 0.62, 0.2, { cast: false }); plane(bot, 0.38, 0.28, new THREE.MeshBasicMaterial({ map: faceT, toneMapped: false }), -0.55, 0.62, 0.245);
  // 좌석·조명·화분
  for (const [x, z] of [[18.2, 2.9], [22.2, 2.3]]) { const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 28), std(0xf1e3cc, { rough: 0.5 })); tp.position.set(x, 0.74, z); tp.castShadow = true; cafe.add(tp);
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 0.72, 12), metalMat); lg.position.set(x, 0.36, z); cafe.add(lg);
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4, st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.46, 16), std(0xc2703a, { rough: 0.9 })); st.position.set(x + Math.cos(a) * 0.98, 0.23, z + Math.sin(a) * 0.98); st.castShadow = true; cafe.add(st); } }
  box(cafe, 0.5, 0.45, 5.2, 0x3a281b, CAF.x1 - 0.4, 0.22, 1.6); box(cafe, 0.2, 0.6, 5.2, 0x4a3323, CAF.x1 - 0.22, 0.75, 1.6);
  for (const [x, z] of [[18.2, 2.9], [22.2, 2.3], [20.6, -2.2]]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), glow(0xffe1a8, 1.6)); l.position.set(x, 2.7, z); cafe.add(l); box(cafe, 0.012, CAF.h - 2.85, 0.012, darkPl, x, (CAF.h + 2.85) / 2, z, { cast: false }); }
  for (const [x, z] of [[CAF.x0 + 0.7, CAF.z1 - 0.7], [CAF.x1 - 0.7, CAF.z1 - 0.7], [CAF.x0 + 0.7, CAF.z0 + 0.7]]) { box(cafe, 0.5, 0.5, 0.5, 0x3a281b, x, 0.25, z); const bsh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), std(0x3fb46a, { rough: 1 })); bsh.position.set(x, 1.0, z); bsh.scale.y = 1.25; bsh.castShadow = true; cafe.add(bsh); }
  // 지붕·간판(1층 집중 보기에서는 지붕을 걷는다)
  box(cafeRoof, cw + 0.8, 0.3, cd + 0.8, std(0x15132a, { rough: 0.7 }), ccx, CAF.h + 0.15, ccz, { cast: false }); box(cafeRoof, cw + 0.8, 0.08, 0.08, glow(amber, 2.2), ccx, CAF.h + 0.04, CAF.z1 + 0.42, { cast: false });
  const csign = textPlane(cafeRoof, `${cfg.building.name} CAFÉ`, { h: 0.95, px: 150, color: '#ffb25c', glow: true, boost: 1.5, weight: 900, x: ccx + 0.5, y: CAF.h + 0.95, z: CAF.z1 + 0.2 });
  const cupIcon = canvasTex(128, 128, (g, w) => { g.clearRect(0, 0, w, w); g.strokeStyle = '#ffb25c'; g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); g.moveTo(30, 46); g.lineTo(38, 110); g.lineTo(82, 110); g.lineTo(90, 46); g.closePath(); g.stroke(); g.beginPath(); g.arc(96, 70, 16, -1.2, 1.2); g.stroke(); for (const x of [46, 60, 74]) { g.beginPath(); g.moveTo(x, 32); g.quadraticCurveTo(x + 8, 22, x, 10); g.stroke(); } });
  plane(cafeRoof, 0.95, 0.95, new THREE.MeshBasicMaterial({ map: cupIcon, transparent: true, toneMapped: false }), ccx + 0.5 - csign.userData.w / 2 - 0.7, CAF.h + 0.95, CAF.z1 + 0.2).material.color.multiplyScalar(1.5);
  const cafeHit = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.6, CAF.h + 1.8, cd + 0.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); cafeHit.position.set(ccx, (CAF.h + 1.8) / 2, ccz); scene.add(cafeHit);   // 누르면 카페 안으로
  const cafeSpots = [0, 1, 2, 3, 4].map(i => ({ x: 18.6 + i * 1.0, z: -2.3, user: null }));
  // 음료 컵(책상 위·들고 걷기): hot 종이컵, ice 아메리카노, ade 딸기 에이드, matcha 말차, juice 오렌지 주스
  const DRINKS = { hot: null, ice: 0x3a2416, ade: 0xff7fa8, matcha: 0x8fca5a, juice: 0xffa53a };
  function makeCup(kind) {
    const g = new THREE.Group();
    if (kind === 'hot') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.036, 0.13, 14), std(0xffffff, { rough: 0.6 })); c.position.y = 0.065; g.add(c); const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.041, 0.055, 14), std(0x9a6a3c, { rough: 0.9 })); sl.position.y = 0.062; g.add(sl); const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 14), std(0x17171d)); lid.position.y = 0.137; g.add(lid); }
    else { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.036, 0.15, 14), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.05, depthWrite: false })); c.position.y = 0.075; g.add(c);
      const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.034, 0.11, 14), std(DRINKS[kind] || 0x3a2416, { rough: 0.4 })); liq.position.y = 0.06; g.add(liq); const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 14), std(0xf2f2f2)); lid.position.y = 0.154; g.add(lid);
      const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 6), std(kind === 'ice' ? 0x1f7a4d : 0xffffff)); straw.position.set(0.012, 0.16, 0); straw.rotation.z = -0.14; g.add(straw); }
    return g;
  }

  return {
    exec, pool, cars, heli, door, PAD, CAF, cafeRoof, cafeHit, cafeSpots, makeCup, groups: { lot, cafe, cafeRoof }, DRINK_KINDS: Object.keys(DRINKS),
    hits: [...cars.map(c => c.hit), heli.hit],
    // 사람에게 탈것을 배정한다(임원은 자기 차, 직원은 비어 있는 업무용 차). 없으면 null.
    acquire(id, kind) { if (kind === 'heli') { if (heli.user && heli.user !== id) return null; heli.user = id; return heli; }
      if (exec[id]) { exec[id].user = id; return exec[id]; } const c = pool.find(c => !c.user && c.state === 'parked') || pool.find(c => !c.user); if (c) c.user = id; return c || null; },
    release(v) { if (v) v.user = null; },
    setLabels(on) { for (const c of cars) c.label.visible = on && c.state === 'parked'; },
    get anyMoving() { return cars.some(c => c.moving) || heli.state === 'leaving' || heli.state === 'arriving'; },
    update(dt, now, nearDoor) { for (const c of cars) c.update(dt); heli.update(dt, now);
      const busy = cafeSpots.some(sp => sp.user), t = now / 1000; arm1.rotation.z = Math.sin(t * (busy ? 1.7 : 0.5)) * (busy ? 0.5 : 0.18) - 0.2; arm2.rotation.z = Math.cos(t * (busy ? 2.3 : 0.6)) * (busy ? 0.7 : 0.25) + 0.9; bot.rotation.y = Math.sin(t * (busy ? 0.9 : 0.3)) * 0.5; door.open += ((nearDoor ? 1 : 0) - door.open) * Math.min(1, dt * 6); door.l.position.x = LOT.DOOR_X - 0.56 - door.open * 1.0; door.r.position.x = LOT.DOOR_X + 0.56 + door.open * 1.0; },
  };
}
