/* HQ 사옥 3D — 5층 건물(1F 헬스장·배드민턴장 / 2·3F 써포츠 / 4F 소프링 / 5F SHADDO).
   건물 전체 보기 ↔ 층 집중 보기. 사람은 실제 상태에 따라 책상·휴게실·1층 사이를 걸어서(엘리베이터 포함) 이동한다. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildOutdoor, LOT } from './outdoor.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HQ = window.HQ;
const cfg = await HQ.ready;
const manifest = await fetch('assets/people/manifest.json').then(r => r.json()).catch(() => ({}));
try { await Promise.all([document.fonts.load('900 40px Pretendard'), document.fonts.load('600 20px Pretendard')]); } catch { /* 기본 글꼴 */ }
const FONT = 'Pretendard, "Apple SD Gothic Neo", sans-serif';

// ---------- 치수 ----------
const W = 30, D = 14, FH = 5, CEIL = 4.5, HX = W / 2, HZ = D / 2;
const floorY = n => (n - 1) * FH;
const FLOORS = Object.fromEntries(cfg.floors.map(f => [f.n, f]));
const NS = cfg.floors.filter(f => !f.roof && !f.lot && !f.cafe).map(f => f.n).sort((a, b) => a - b);   // 건물 층(옥상 대표실 제외)
const RN = (cfg.floors.find(f => f.roof) || {}).n || 0;                          // 옥상 대표실 번호(없으면 0)
const flabel = n => (FLOORS[n] && FLOORS[n].label) || n + 'F';
const CAFN = (cfg.floors.find(f => f.cafe) || {}).n || -2;                        // 카페 보기 번호
const LOTN = (cfg.floors.find(f => f.lot) || {}).n || -1;                         // 주차장 보기 번호
const AISLE = { 0: LOT.SIDE_Z, 1: -4.2, 2: 0.1, 3: 0.1, 4: 0.1, 5: 0.1, 6: 2.4 };   // 층별 통로(0 = 바깥 보도)
const ELEV = { x: 3.5, z: -6.0 };
const THEME = {
  1: { wall: 0x16212b, wall2: 0x111a22 },
  2: { wall: 0x221a4f, wall2: 0x1a1440, wood: 0xffffff, carpet: 0x3b2a86, sofa: 0x6a3cff },
  3: { wall: 0x251c56, wall2: 0x1c1545, wood: 0xfff6ea, carpet: 0x43309a, sofa: 0x7c5cff },
  4: { wall: 0x33241a, wall2: 0x281c14, wood: 0xffe2c2, carpet: 0x8a4512, sofa: 0xff8400 },
  5: { wall: 0x0f2836, wall2: 0x0b1f2b, wood: 0xc4cfe0, carpet: 0x0f5f63, sofa: 0x14b8ae },
};
const C_WORK = 0x39e58c, C_DIRECT = 0xffd23f;

// ---------- 렌더러 ----------
const el = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;   // 그림자는 필요할 때만 다시 계산(루프에서 요청)
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
el.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a24);
scene.fog = new THREE.Fog(0x1b1342, 170, 420);
const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 900);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(8, 8), 0.5, 0.7, 0.92);
composer.addPass(bloom); composer.addPass(new OutputPass());
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.065; controls.enablePan = false; controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.9;
controls.minPolarAngle = 0.3; controls.maxPolarAngle = 1.53; controls.minAzimuthAngle = -1.05; controls.maxAzimuthAngle = 1.05;
let shadowDirty = 120;   // 그림자를 다시 계산할 남은 프레임 수

// ---------- 도우미 ----------
const loader = new THREE.TextureLoader();
function tex(path, repeat) {
  const t = loader.load(path); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.canvas = c; return t;
}
function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, ...(o.map ? { map: o.map } : {}), ...(o.emissive ? { emissive: o.emissive, emissiveIntensity: o.ei ?? 1 } : {}) }); }
function glow(color, k = 1.8) { const m = new THREE.MeshBasicMaterial({ color }); m.color.multiplyScalar(k); m.toneMapped = false; return m; }
function box(parent, w, h, d, mat, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? std(mat, o) : mat);
  m.position.set(x, y, z); m.castShadow = o.cast ?? true; m.receiveShadow = o.recv ?? true; if (o.ry) m.rotation.y = o.ry; parent.add(m); return m;
}
function plane(parent, w, h, mat, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; m.receiveShadow = !!o.recv; parent.add(m); return m;
}
// 글자 판(네온·명패·안내). 높이 h(월드) 기준으로 폭을 글자 길이에 맞춘다.
function textPlane(parent, text, o) {
  const size = o.px || 96, pad = size * 0.5;
  const probe = document.createElement('canvas').getContext('2d'); probe.font = `${o.weight || 800} ${size}px ${FONT}`;
  const tw = Math.ceil(probe.measureText(text).width + pad * 2), th = Math.ceil(size * 1.6);
  const t = canvasTex(tw, th, g => {
    g.font = `${o.weight || 800} ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (o.glow) { g.shadowColor = o.color; g.shadowBlur = size * 0.35; }
    g.fillStyle = o.color || '#fff'; g.fillText(text, tw / 2, th / 2 + size * 0.04);
    if (o.glow) g.fillText(text, tw / 2, th / 2 + size * 0.04);
  });
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
  if (o.boost) mat.color.multiplyScalar(o.boost);
  const m = plane(parent, o.h * tw / th, o.h, mat, o.x, o.y, o.z, { ry: o.ry });
  m.userData.w = o.h * tw / th; return m;
}
const noiseTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5200; i++) { const v = 170 + Math.random() * 85 | 0; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
});
noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
const radialTex = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const shadowTex = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.6, 'rgba(0,0,0,.22)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const woodTex = () => tex('assets/art/floor.jpg', [6, 4]);
const metalMat = std(0x9aa0ad, { metal: 0.6, rough: 0.4 });
const darkMat = std(0x16142a, { rough: 0.6 });

// ---------- 조명 ----------
scene.add(new THREE.HemisphereLight(0xcdd4ff, 0x2a2148, 1.0));
const key = new THREE.DirectionalLight(0xffe9cf, 1.9);
key.position.set(22, 44, 38); key.target.position.set(0, 10, 0); scene.add(key.target);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -30, right: 30, top: 34, bottom: -12, near: 1, far: 140 });
scene.add(key);
const fill = new THREE.DirectionalLight(0x8d9bff, 0.7); fill.position.set(-30, 18, 26); scene.add(fill);
const focusLight = new THREE.PointLight(0xfff1dc, 0, 46, 1.4); scene.add(focusLight);   // 층 집중 보기에서 그 층을 밝힌다

// ---------- 하늘·도시·광장 ----------
(function buildEnv() {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 top = vec3(0.012,0.012,0.06); vec3 mid = vec3(0.06,0.035,0.2); vec3 hor = vec3(0.2,0.09,0.2); vec3 c = mix(hor, mid, smoothstep(-0.05,0.22,h)); c = mix(c, top, smoothstep(0.18,0.7,h)); gl_FragColor = vec4(c,1.0); }',
  }));
  scene.add(sky);
  // 별
  const sp = []; for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI * 2, e = 0.25 + Math.random() * 1.2, r = 560; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75 })));
  // 도시 스카이라인(Gemini 생성 파노라마) — 건물 뒤를 반원으로 두른다
  const sk = tex('assets/art/skyline.jpg'); sk.wrapS = THREE.MirroredRepeatWrapping; sk.repeat.set(2, 1);
  const fade = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(0.32, '#fff'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 190, 72, 1, true, Math.PI * 0.5, Math.PI),
    new THREE.MeshBasicMaterial({ map: sk, alphaMap: fade, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  cyl.material.color.multiplyScalar(0.92); cyl.position.y = 78; cyl.renderOrder = -5; scene.add(cyl);
  // 땅·광장
  const ground = new THREE.Mesh(new THREE.CircleGeometry(320, 64), std(0x0b0a1c, { rough: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.52; scene.add(ground);
  const tile = canvasTex(256, 256, (g, w) => { g.fillStyle = '#17142e'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 3; g.strokeRect(0, 0, w, w); g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(0, 0, w / 2, w / 2); g.fillRect(w / 2, w / 2, w / 2, w / 2); });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(22, 14);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(88, 56), std(0xffffff, { map: tile, rough: 0.55, metal: 0.15 })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -0.5, 14); plaza.receiveShadow = true; scene.add(plaza);
  // 진입로 + 빛 웅덩이
  plane(scene, 5, 3.6, std(0x221d45, { rough: 0.5 }), LOT.DOOR_X, -0.49, 9.0, { rx: -Math.PI / 2, recv: true });
  for (const sx of [-1, 1]) box(scene, 0.08, 0.05, 3.6, glow(0xffffff, 1.3), LOT.DOOR_X + sx * 2.5, -0.46, 9.0, { cast: false });
  const pool = (x, z, r, color, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r, r), new THREE.MeshBasicMaterial({ map: radialTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.47, z); scene.add(m); };
  pool(0, 11, 44, 0x6a5cff, 0.22); pool(LOT.DOOR_X, 9.5, 12, 0xffe2b0, 0.5);
  // 가로등·나무·벤치
  for (const [x, z] of [[-32, 13], [27.2, 12], [-16, 27.5], [-1, 27.5], [14, 27.5]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), darkMat); p.position.set(x, 2.1, z); p.castShadow = true; scene.add(p);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), glow(0xffe1a8, 2.6)); b.position.set(x, 4.8, z); scene.add(b);
    pool(x, z, 11, 0xffd9a0, 0.42);
  }
  const leaf = std(0x1f6a52, { rough: 1 }), leaf2 = std(0x2a8466, { rough: 1 }), trunk = std(0x3a2a22);
  for (const [x, z, s] of [[-27, 6.5, 1.1], [-36, 18, 1], [28.6, 8.2, 1.15], [27, 19, 0.95], [-24, 31, 1.05], [8, 31.5, 1], [-21, 1, 0.9], [28.8, -2.5, 0.9], [-8, 32, 0.9], [21, 30, 1]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 2.4 * s, 8), trunk); t.position.set(x, 0.7 * s, z); t.castShadow = true; scene.add(t);
    const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 1), leaf); c1.position.set(x, 2.9 * s, z); c1.castShadow = true; scene.add(c1);
    const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 * s, 1), leaf2); c2.position.set(x + 0.5 * s, 3.9 * s, z + 0.2); c2.castShadow = true; scene.add(c2);
  }
  for (const [x, z] of [[-20, 28.6], [-5, 28.6], [10, 28.6]]) { box(scene, 2.2, 0.12, 0.6, 0x3a3166, x, 0.0, z); box(scene, 0.12, 0.45, 0.5, darkMat, x - 0.9, -0.25, z); box(scene, 0.12, 0.45, 0.5, darkMat, x + 0.9, -0.25, z); }
})();

// ---------- 건물 ----------
const F = {};          // n → { g, shell, ceil, lift, liftT, leds[], doorL, doorR, board, hit, ceilMats[] }
const screens = {};    // staff id → { canvas, tex, color }
const deskOf = {};     // staff id → { x, z, lead }
const loungeOf = {};   // staff id → { x, z }
const TREAD_X = [6.9, 9.5, 12.1], TREAD_Z = -5.6;
const LOUNGE_SPOTS = [[6.0, -3.4], [7.8, -1.6], [9.6, -0.6], [11.4, -2.0], [13.0, -0.4], [6.2, 1.6], [12.9, 2.9], [6.6, 4.9], [12.3, 5.3], [8.9, -4.2]];
const GYM_SPOTS = [  // 앞 4곳 = 배드민턴 코트(왼쪽 2·오른쪽 2), 러닝머신 3, 벤치프레스 2, 덤벨 1
  { x: -10.6, z: -1.3, act: 'court', court: 'L' }, { x: -4.4, z: 1.3, act: 'court', court: 'R' }, { x: -9.6, z: 1.5, act: 'court', court: 'L' }, { x: -5.4, z: -1.4, act: 'court', court: 'R' },
  { x: TREAD_X[0] - 0.1, z: TREAD_Z, act: 'tread' }, { x: TREAD_X[1] - 0.1, z: TREAD_Z, act: 'tread' }, { x: TREAD_X[2] - 0.1, z: TREAD_Z, act: 'tread' },
  { x: 7.4, z: 1.2, act: 'bench' }, { x: 10.6, z: 1.9, act: 'bench' }, { x: 12.3, z: -1.6, act: 'curl' },
];

function buildDesk(g, s, x, z, big, col) {
  const d = new THREE.Group(); d.position.set(x, 0, z); g.add(d);
  const w = big ? 2.6 : 1.8, dp = big ? 1.1 : 0.8;
  box(d, w, 0.06, dp, std(0xe2d5c0, { rough: 0.55 }), 0, 0.74, 0);
  box(d, w, 0.03, 0.05, glow(col, 1.3), 0, 0.7, dp / 2, { cast: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(d, 0.06, 0.72, 0.06, metalMat, sx * (w / 2 - 0.1), 0.36, sz * (dp / 2 - 0.1), { cast: false });
  const mw = big ? 1.0 : 0.74, mh = big ? 0.58 : 0.44;
  const mon = new THREE.Group(); mon.position.set(-w * 0.27, 0, -dp * 0.05); mon.rotation.y = 0.95; d.add(mon);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.22, 8), metalMat); st.position.set(0, 0.88, 0); mon.add(st);
  box(mon, mw + 0.06, mh + 0.06, 0.04, 0x14121f, 0, 0.99 + mh / 2, 0);
  const sc = document.createElement('canvas'); sc.width = 192; sc.height = 120;
  const t = new THREE.CanvasTexture(sc); t.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.set(0, 0.99 + mh / 2, 0.025); mon.add(scr); scr.material.color.multiplyScalar(1.35);
  screens[s.id] = { canvas: sc, tex: t, color: '#' + col.getHexString(), seed: Math.random() * 1000, on: null };
  const kbx = big ? 0.0 : -0.02, kbz = -dp * 0.24;
  box(d, 0.46, 0.022, 0.16, 0x2a2740, kbx, 0.781, kbz, { ry: 0.12, cast: false }); box(d, 0.42, 0.006, 0.12, glow(col, 0.5), kbx, 0.795, kbz, { ry: 0.12, cast: false });
  const plate = textPlane(d, s.name, { h: 0.2, px: 64, color: '#f4f1ff', weight: 700, x: -w * 0.24, y: 0.87, z: dp / 2 + 0.012 }); plate.rotation.x = -0.35;
  deskOf[s.id] = { x, z, lead: big, dp, kbx };
}
function plant(g, x, z, s = 1) {
  box(g, 0.5 * s, 0.5 * s, 0.5 * s, 0x2d2752, x, 0.25 * s, z);
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52 * s, 1), std(0x3fb46a, { rough: 1 })); b.position.set(x, 0.95 * s, z); b.scale.y = 1.25; b.castShadow = true; g.add(b);
}
function buildElevator(g, f, col) {
  const z = -HZ + 0.09;
  box(g, 2.0, 2.75, 0.14, 0x0d0c1c, ELEV.x, 1.375, -HZ + 0.07, { cast: false });
  const dm = std(0xb9bfd0, { metal: 0.7, rough: 0.3 });
  f.doorL = box(g, 0.82, 2.4, 0.05, dm, ELEV.x - 0.42, 1.2, z + 0.07, { cast: false });
  f.doorR = box(g, 0.82, 2.4, 0.05, dm, ELEV.x + 0.42, 1.2, z + 0.07, { cast: false });
  box(g, 1.7, 2.4, 0.02, glow(0xfff1d6, 0.9), ELEV.x, 1.2, z + 0.03, { cast: false });   // 안쪽 불빛(문이 열리면 보임)
  box(g, 0.5, 0.2, 0.03, glow(col, 1.8), ELEV.x, 2.62, z + 0.08, { cast: false });
  textPlane(g, 'ELEVATOR', { h: 0.17, px: 48, color: '#9f98c4', weight: 700, x: ELEV.x, y: 2.95, z: z + 0.06 });
}
function buildLounge(g, n, th, col) {
  const sofa = std(th.sofa, { rough: 0.9 }), sofa2 = std(new THREE.Color(th.sofa).multiplyScalar(0.72).getHex(), { rough: 0.9 });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), std(new THREE.Color(th.sofa).multiplyScalar(0.35).getHex(), { rough: 1, map: noiseTex })); rug.rotation.x = -Math.PI / 2; rug.position.set(9.5, 0.025, 2.7); rug.receiveShadow = true; g.add(rug);
  box(g, 3.2, 0.5, 1.1, sofa, 9.5, 0.25, 1.9); box(g, 3.2, 0.7, 0.3, sofa2, 9.5, 0.85, 1.35); box(g, 0.3, 0.6, 1.1, sofa2, 7.75, 0.55, 1.9); box(g, 0.3, 0.6, 1.1, sofa2, 11.25, 0.55, 1.9);
  box(g, 1.6, 0.08, 0.8, 0xf3e8d2, 9.5, 0.42, 3.5); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.08, 0.4, 0.08, 0x8d7a60, 9.5 + sx * 0.65, 0.2, 3.5 + sz * 0.28, { cast: false });
  box(g, 3.4, 0.9, 0.7, 0x2d2752, 8.2, 0.45, -6.5); box(g, 3.5, 0.06, 0.75, 0xe9ddc8, 8.2, 0.93, -6.5);
  box(g, 0.5, 0.6, 0.45, std(0x1b1830, { metal: 0.4 }), 7.2, 1.26, -6.5); box(g, 0.1, 0.1, 0.1, glow(0xff5e7a, 2), 7.2, 1.6, -6.3, { cast: false });
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), std([0xffffff, th.sofa, 0xffd23f, 0xffffff][i])); m.position.set(8.1 + i * 0.28, 1.02, -6.45); g.add(m); }
  textPlane(g, 'LOUNGE', { h: 0.62, px: 110, color: '#' + col.getHexString(), glow: true, boost: 1.5, weight: 800, x: 9.6, y: 3.45, z: -HZ + 0.06 });
  plant(g, 5.4, -6.4, 1.1); plant(g, 14.2, 6.3, 1.1); plant(g, 14.2, -3.2, 0.9);
  box(g, 0.4, 1.0, 0.4, 0xdde6f0, 5.3, 0.5, 6.3); const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.7 })); bt.position.set(5.3, 1.25, 6.3); g.add(bt);
  for (let z = 1.9; z <= 6.5; z += 1.15) { box(g, 0.45, 0.55, 1.0, 0x2d2752, 4.3, 0.275, z); const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), std(0x3fb46a, { rough: 1 })); b.position.set(4.3, 0.82, z); b.scale.set(1, 0.85, 1.25); b.castShadow = true; g.add(b); }
}
function poster(g, path, x, y, z, w, h, ry = 0) {
  const fr = plane(g, w + 0.14, h + 0.14, std(0x0c0a1c), x, y, z, { ry }); fr.translateZ(-0.006);
  plane(g, w, h, new THREE.MeshStandardMaterial({ map: tex(path), roughness: 0.55 }), x, y, z, { ry });
}
const rackTex = canvasTex(128, 256, () => {}); let kanbanDone = false;
function drawRack(t) {
  const g = rackTex.userData.canvas.getContext('2d'); g.fillStyle = '#0b0a16'; g.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 14; r++) { g.fillStyle = '#17152a'; g.fillRect(8, 8 + r * 17.5, 112, 13);
    for (let c = 0; c < 9; c++) { const on = Math.sin(t * 0.004 + r * 1.7 + c * 2.3 + Math.sin(r * c)) > 0.2; g.fillStyle = on ? (c % 4 === 0 ? '#ffb84a' : '#39e58c') : '#22203a'; g.fillRect(14 + c * 11.5, 12 + r * 17.5, 5, 5); } }
  rackTex.needsUpdate = true;
}
function buildOffice(n, g, f, th, col) {
  const co = cfg.companies[FLOORS[n].company], hex = '#' + col.getHexString();
  // 바닥
  const wood = woodTex(); const fl = plane(g, HX + 4.2, D, std(th.wood, { map: wood, rough: 0.7 }), (-HX + 4.2) / 2, 0.01, 0, { rx: -Math.PI / 2, recv: true });
  const cp = noiseTex.clone(); cp.needsUpdate = true; cp.repeat.set(5, 6);
  plane(g, HX - 4.2, D, std(th.carpet, { map: cp, rough: 1 }), (HX + 4.2) / 2, 0.012, 0, { rx: -Math.PI / 2, recv: true });
  // 간판·포스터
  const sign = textPlane(g, co.en, { h: 1.05, px: 150, color: hex, glow: true, boost: 1.55, weight: 900, x: -6.2, y: 3.3, z: -HZ + 0.06 });
  textPlane(g, FLOORS[n].title, { h: 0.3, px: 64, color: '#d8d2f5', weight: 600, x: -6.2, y: 2.52, z: -HZ + 0.06 });
  const lx = -6.2 - sign.userData.w / 2 - 0.75;
  if (FLOORS[n].company === 'sofring') plane(g, 1.0, 1.0, new THREE.MeshBasicMaterial({ map: tex('assets/art/sofring_logo_dark.png'), transparent: true, toneMapped: false }), lx, 3.3, -HZ + 0.06);
  if (FLOORS[n].company === 'studio') plane(g, 0.95, 1.1, new THREE.MeshBasicMaterial({ map: tex('assets/art/studio_logo.png'), transparent: true, toneMapped: false }), lx + 0.05, 3.3, -HZ + 0.06);
  const arts = { supports: ['supports_1.jpg', 'supports_2.jpg'], sofring: ['sofring_1.jpg', 'sofring_2.jpg'], studio: ['poster_1.jpg', 'poster_2.jpg'] }[FLOORS[n].company];
  poster(g, 'assets/art/' + arts[0], -13.6, 2.35, -HZ + 0.03, 1.4, 2.1); poster(g, 'assets/art/' + arts[1], -11.9, 2.35, -HZ + 0.03, 1.4, 2.1);
  // 상황판
  const bc = document.createElement('canvas'); bc.width = 880; bc.height = 495; const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace; bt.anisotropy = 8;
  box(g, 4.6, 2.66, 0.08, 0x0b0918, 0.2, 2.6, -HZ + 0.05, { cast: false }); plane(g, 4.4, 2.475, new THREE.MeshBasicMaterial({ map: bt, toneMapped: false }), 0.2, 2.6, -HZ + 0.1);
  f.board = { canvas: bc, tex: bt };
  for (const [x, w, op] of [[-6.2, 15, 0.34], [9.6, 9, 0.26], [0.2, 8, 0.14]]) plane(g, w, 6.5, new THREE.MeshBasicMaterial({ map: radialTex, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), x, 3.1, -HZ + 0.02);
  buildElevator(g, f, col); buildLounge(g, n, th, col);
  // 층별 소품
  if (n === 2) { for (let i = 0; i < 3; i++) { box(g, 0.9, 2.2, 1.1, 0x0d0c1a, -14.3, 1.1, -1.4 + i * 1.3); plane(g, 0.95, 2.0, new THREE.MeshBasicMaterial({ map: rackTex, toneMapped: false }), -13.84, 1.15, -1.4 + i * 1.3, { ry: Math.PI / 2 }); }
    textPlane(g, 'SERVER ROOM', { h: 0.26, px: 56, color: '#9f98c4', weight: 700, x: -13.8, y: 2.6, z: -0.1, ry: Math.PI / 2 }); }
  if (n === 3) { const kb = canvasTex(640, 360, (c, w, h) => { c.fillStyle = '#f6f3ff'; c.fillRect(0, 0, w, h); const cols = ['할 일', '진행', '검토', '완료']; c.font = `700 22px ${FONT}`; c.fillStyle = '#4a4470';
      cols.forEach((t, i) => { c.fillText(t, 24 + i * 156, 36); c.fillStyle = '#e4defa'; c.fillRect(16 + i * 156, 48, 144, 296); const k = [3, 2, 2, 4][i]; for (let j = 0; j < k; j++) { c.fillStyle = ['#b9a5ff', '#ffd23f', '#7dd3fc', '#86efac'][(i + j) % 4]; c.fillRect(26 + i * 156, 60 + j * 68, 124, 54); } c.fillStyle = '#4a4470'; }); });
    box(g, 0.06, 2.3, 4.0, 0xd9d4ee, -HX + 0.05, 2.2, 3.2, { cast: false }); plane(g, 3.8, 2.14, new THREE.MeshBasicMaterial({ map: kb, toneMapped: false }), -HX + 0.09, 2.2, 3.2, { ry: Math.PI / 2 });
    box(g, 0.5, 0.05, 1.6, 0xe2d5c0, -14.5, 1.0, -0.9); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 14, 1, true), std(0xffffff, { rough: 0.6 })); cone.position.set(-14.5, 1.22, -0.9); cone.rotation.x = Math.PI; g.add(cone);
    const cork = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), std(0xf0c9a0)); cork.position.set(-14.5, 1.08, -0.9); g.add(cork); box(g, 0.18, 0.3, 0.18, std(0xffd23f, { metal: 0.8, rough: 0.25 }), -14.5, 1.18, -1.4); }
  if (n === 4) { const db = canvasTex(640, 360, (c, w, h) => { c.fillStyle = '#17110c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb25c'; c.font = `800 24px ${FONT}`; c.fillText('LICENSE OVERVIEW', 24, 38);
      c.lineWidth = 26; c.strokeStyle = '#3a2a1c'; c.beginPath(); c.arc(130, 200, 84, 0, 7); c.stroke(); c.strokeStyle = '#ff8400'; c.beginPath(); c.arc(130, 200, 84, -1.57, 2.6); c.stroke();
      c.fillStyle = '#fff'; c.font = `900 40px ${FONT}`; c.textAlign = 'center'; c.fillText('68%', 130, 214); c.textAlign = 'left';
      [0.5, 0.8, 0.62, 0.9, 0.7, 0.45, 0.76].forEach((v, i) => { c.fillStyle = i % 2 ? '#ff8400' : '#ffc078'; c.fillRect(270 + i * 50, 320 - v * 220, 32, v * 220); }); });
    box(g, 0.06, 2.3, 4.0, 0x0e0a07, -HX + 0.05, 2.2, 3.0, { cast: false }); plane(g, 3.8, 2.14, new THREE.MeshBasicMaterial({ map: db, toneMapped: false }), -HX + 0.09, 2.2, 3.0, { ry: Math.PI / 2 });
    box(g, 0.5, 1.9, 2.4, 0x3a2a1c, -14.6, 0.95, -1.6); for (let i = 0; i < 3; i++) box(g, 0.4, 0.4, 2.2, [0xff8400, 0xffc078, 0xe8580c][i], -14.55, 0.35 + i * 0.6, -1.6, { cast: false }); }
  if (n === 5) { poster(g, 'assets/art/poster_3.jpg', -HX + 0.03, 2.3, 3.0, 1.5, 2.25, Math.PI / 2); poster(g, 'assets/art/poster_1.jpg', HX - 0.03, 2.3, 4.2, 1.5, 2.25, -Math.PI / 2);
    for (const [x, p, c2] of [[11.6, 'poster_2.jpg', 0x19e3d6], [13.1, 'poster_3.jpg', 0xff4fd8]]) { box(g, 1.1, 1.9, 0.9, 0x141228, x, 0.95, -6.4); box(g, 1.1, 0.42, 0.95, glow(c2, 1.4), x, 2.11, -6.4, { cast: false });
      const sc = plane(g, 0.86, 0.94, new THREE.MeshBasicMaterial({ map: tex('assets/art/' + p), toneMapped: false }), x, 1.27, -5.94); sc.rotation.x = -0.15; box(g, 0.9, 0.08, 0.35, 0x2a2740, x, 0.98, -5.8, { cast: false });
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), glow([0xff5e7a, 0xffd23f, 0x39e58c][i], 1.6)); b.position.set(x - 0.2 + i * 0.2, 1.04, -5.74); g.add(b); } } }
  // 책상 배치: 책임자 1명은 뒤 왼쪽 큰 책상, 나머지는 2줄
  const staff = HQ.staff.filter(s => s.floor === n), leads = staff.filter(s => s.lead), rest = staff.filter(s => !s.lead);
  leads.forEach((s, i) => buildDesk(g, s, [-12.6, -8.3, -4.0][i] ?? -4.0, -5.7, true, col));   // 총괄·본부장은 뒤쪽 큰 책상
  const small = rest.length <= 5;   // 인원이 적은 층은 책상을 왼쪽에 모으고 오른쪽에 회의 공간을 둔다
  const COLS = small ? [-11.4, -8.2, -5.0] : [-12, -9, -6, -3, 0], back = Math.ceil(rest.length / 2), front = rest.length - back;
  rest.forEach((s, i) => { const inBack = i < back, k = inBack ? back : front, j = inBack ? i : i - back; const off = small ? 0 : Math.floor((5 - k) / 2);
    buildDesk(g, s, COLS[off + j], inBack ? -2.6 : 2.8, false, col); });
  if (small) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.07, 36), std(0xefe4d0, { rough: 0.5 })); top.position.set(-0.6, 0.74, 3.7); top.castShadow = true; top.receiveShadow = true; g.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 0.72, 16), metalMat); leg.position.set(-0.6, 0.36, 3.7); g.add(leg);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6, st = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.5, 18), std(th.sofa, { rough: 0.9 })); st.position.set(-0.6 + Math.cos(a) * 1.75, 0.25, 3.7 + Math.sin(a) * 1.75); st.castShadow = true; g.add(st); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glow(0xfff0d8, 1.5)); lamp.position.set(-0.6, 3.0, 3.7); g.add(lamp); box(g, 0.015, 1.4, 0.015, darkMat, -0.6, 3.8, 3.7, { cast: false });
    for (const [x, z, c2] of [[-1.9, -3.2, th.sofa], [-0.5, -4.1, 0xffd23f], [0.6, -2.9, th.carpet]]) { const bb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), std(c2, { rough: 1 })); bb.scale.set(1, 0.62, 1); bb.position.set(x, 0.34, z); bb.castShadow = true; g.add(bb); }
    box(g, 1.9, 1.3, 0.06, 0xf6f3ff, -3.2, 1.25, -4.6, { ry: 0.5 }); box(g, 0.06, 1.2, 0.06, metalMat, -4.0, 0.6, -4.2, { cast: false }); box(g, 0.06, 1.2, 0.06, metalMat, -2.4, 0.6, -5.05, { cast: false });
    plant(g, -14.1, 6.2, 1.2); plant(g, 2.6, -6.3, 1.0);
  }
  staff.forEach((s, i) => { const p = LOUNGE_SPOTS[i % LOUNGE_SPOTS.length]; loungeOf[s.id] = { x: p[0], z: p[1] }; });
}
let shuttle = null;
function buildGym(g, f, col) {
  plane(g, W, D, std(0x232b33, { map: noiseTex, rough: 0.9 }), 0, 0.01, 0, { rx: -Math.PI / 2, recv: true });
  // 배드민턴 코트(복식 13.4 × 6.1m 비율)
  const court = canvasTex(1340, 610, (c, w, h) => { c.fillStyle = '#17835a'; c.fillRect(0, 0, w, h); c.fillStyle = '#1c9566'; c.fillRect(30, 30, w - 60, h - 60); c.strokeStyle = '#fff'; c.lineWidth = 6;
    const L = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    c.strokeRect(33, 33, w - 66, h - 66); L(33, 79, w - 33, 79); L(33, h - 79, w - 33, h - 79); L(109, 33, 109, h - 33); L(w - 109, 33, w - 109, h - 33);
    L(w / 2 - 198, 33, w / 2 - 198, h - 33); L(w / 2 + 198, 33, w / 2 + 198, h - 33); L(33, h / 2, w / 2 - 198, h / 2); L(w / 2 + 198, h / 2, w - 33, h / 2); });
  plane(g, 13.4, 6.1, std(0xffffff, { map: court, rough: 0.75 }), -7.5, 0.02, 0, { rx: -Math.PI / 2, recv: true });
  const net = canvasTex(256, 64, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; for (let x = 0; x <= w; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.fillStyle = '#fff'; c.fillRect(0, 0, w, 7); });
  const nm = plane(g, 6.3, 0.78, new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false }), -7.5, 1.16, 0, { ry: Math.PI / 2 });
  for (const z of [-3.2, 3.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.58, 10), metalMat); p.position.set(-7.5, 0.79, z); p.castShadow = true; g.add(p); }
  box(g, 5.2, 0.42, 0.5, 0x2d3640, -7.5, 0.21, -6.4); box(g, 5.2, 0.42, 0.5, 0x2d3640, -12.2, 0.21, -6.4);
  textPlane(g, 'BADMINTON COURT', { h: 0.72, px: 120, color: '#b6f23c', glow: true, boost: 1.5, weight: 900, x: -8.6, y: 3.45, z: -HZ + 0.06 });
  poster(g, 'assets/art/supports_1.jpg', -13.6, 2.2, -HZ + 0.03, 1.3, 1.95); poster(g, 'assets/art/supports_2.jpg', -1.4, 2.2, -HZ + 0.03, 1.3, 1.95);
  // 점수판
  const sb = canvasTex(512, 200, (c, w, h) => { c.fillStyle = '#0a0f14'; c.fillRect(0, 0, w, h); c.fillStyle = '#b6f23c'; c.font = `900 120px ${FONT}`; c.textAlign = 'center'; c.fillText('21', 128, 142); c.fillText('19', 384, 142); c.fillStyle = '#fff'; c.font = `800 60px ${FONT}`; c.fillText(':', 256, 128); c.font = `700 22px ${FONT}`; c.fillStyle = '#8fa3b5'; c.fillText('HOME', 128, 34); c.fillText('AWAY', 384, 34); });
  box(g, 2.7, 1.1, 0.08, 0x05080b, -4.6, 2.9, -HZ + 0.05, { cast: false }); plane(g, 2.56, 1.0, new THREE.MeshBasicMaterial({ map: sb, toneMapped: false }), -4.6, 2.9, -HZ + 0.1);
  // 셔틀콕
  shuttle = new THREE.Group(); const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); cone.rotation.z = Math.PI / 2; shuttle.add(cone);
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9c4 })); cork.position.x = 0.13; shuttle.add(cork); shuttle.visible = false; g.add(shuttle);
  for (const [x, w, op] of [[-8.6, 16, 0.3], [9.4, 9, 0.26]]) plane(g, w, 6.5, new THREE.MeshBasicMaterial({ map: radialTex, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), x, 3.1, -HZ + 0.02);
  // 헬스 구역
  buildElevator(g, f, col);
  textPlane(g, 'GYM', { h: 0.9, px: 140, color: '#b6f23c', glow: true, boost: 1.5, weight: 900, x: 9.4, y: 3.4, z: -HZ + 0.06 });
  poster(g, 'assets/art/gym.jpg', 12.9, 2.3, -HZ + 0.03, 1.3, 2.1);
  f.belts = [];
  for (const x of TREAD_X) { box(g, 2.1, 0.22, 0.95, 0x14181d, x, 0.14, TREAD_Z); const bt = noiseTex.clone(); bt.needsUpdate = true; bt.repeat.set(3, 1); f.belts.push(bt);
    plane(g, 1.8, 0.7, std(0x3a424b, { map: bt, rough: 0.9 }), x - 0.05, 0.26, TREAD_Z, { rx: -Math.PI / 2 });
    for (const sz of [-1, 1]) box(g, 0.06, 1.15, 0.06, metalMat, x + 0.85, 0.8, TREAD_Z + sz * 0.42, { cast: false });
    box(g, 0.08, 0.34, 0.9, 0x0b0e12, x + 0.9, 1.45, TREAD_Z, { cast: false }); box(g, 0.02, 0.2, 0.5, glow(0xb6f23c, 1.2), x + 0.85, 1.46, TREAD_Z, { cast: false });
    for (const sz of [-1, 1]) box(g, 0.9, 0.05, 0.05, metalMat, x + 0.42, 1.12, TREAD_Z + sz * 0.42, { cast: false }); }
  box(g, 0.5, 1.0, 3.0, 0x14181d, 14.4, 0.5, 0.2); for (let i = 0; i < 5; i++) for (const y of [0.42, 0.86]) { const db = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 12), std([0xb6f23c, 0x39e58c, 0xffffff, 0x7dd3fc, 0xff8400][i], { rough: 0.5 })); db.rotation.x = Math.PI / 2; db.position.set(14.2, y + 0.2, -1.0 + i * 0.6); g.add(db); }
  for (const [x, z, c2] of [[11.2, 4.6, 0xb6f23c], [12.6, 4.9, 0x7dd3fc], [9.8, 5.2, 0xff8fb1]]) box(g, 0.75, 0.03, 1.9, std(c2, { rough: 0.9 }), x, 0.03, z, { ry: 0.12, cast: false });
  const mir = plane(g, 7.5, 2.6, new THREE.MeshStandardMaterial({ color: 0x9fb4c8, metalness: 0.9, roughness: 0.12 }), HX - 0.02, 1.9, 1.5, { ry: -Math.PI / 2 });
  // 안내 데스크·출입구
  box(g, 3.2, 1.05, 0.9, 0x1c232b, 1.2, 0.52, 5.3); box(g, 3.3, 0.06, 1.0, 0xe9ddc8, 1.2, 1.08, 5.3); box(g, 3.2, 0.06, 0.04, glow(0xb6f23c, 1.6), 1.2, 0.3, 5.77, { cast: false });
  textPlane(g, cfg.building.name + (cfg.building.ceo ? ` · 대표 ${cfg.building.ceo}` : ''), { h: 0.26, px: 64, color: '#eaf7d0', weight: 800, x: 1.2, y: 0.68, z: 5.76 });
  plant(g, -14.2, 6.3, 1.1); plant(g, 6.6, 6.3, 1.0);
}
function buildFloor(n) {
  const fd = FLOORS[n], th = THEME[n], col = new THREE.Color(fd.color);
  const g = new THREE.Group(); g.position.y = floorY(n); scene.add(g);
  const f = F[n] = { n, g, col, lift: 0, liftT: 0, shell: new THREE.Group(), ceil: new THREE.Group(), ceilMats: [], leds: [] };
  g.add(f.shell); g.add(f.ceil);
  box(g, W + 0.9, 0.5, D + 0.9, std(0x15132a, { rough: 0.7 }), 0, -0.25, 0, { cast: false, recv: false });
  plane(g, W, CEIL, std(th.wall, { rough: 0.92 }), 0, CEIL / 2, -HZ, { recv: true });
  box(g, W + 0.9, CEIL, 0.3, 0x0d0b1e, 0, CEIL / 2, -HZ - 0.3, { cast: false });
  for (const sx of [-1, 1]) {
    box(g, 0.3, CEIL, D + 0.6, std(th.wall2, { rough: 0.92 }), sx * (HX + 0.15), CEIL / 2, 0, { cast: false });
    for (let i = 0; i < 3; i++) { const m = glow(col.clone().lerp(new THREE.Color(0xffffff), 0.35), 0.62); plane(g, 3.0, 2.3, m, sx * (HX + 0.31), 2.35, -4.2 + i * 4.2, { ry: sx * Math.PI / 2 }); }
  }
  f.leds.push(box(g, W + 0.9, 0.1, 0.09, glow(col, 2.3), 0, -0.07, HZ + 0.47, { cast: false }));
  f.leds.push(box(g, W, 0.06, 0.06, glow(col, 1.7), 0, CEIL - 0.3, -HZ + 0.05, { cast: false }));
  // 유리·멀리언(층 집중 보기에서는 숨김)
  plane(f.shell, W, CEIL, new THREE.MeshPhysicalMaterial({ color: 0x9ec9ff, transparent: true, opacity: 0.09, roughness: 0.05, metalness: 0.1, depthWrite: false }), 0, CEIL / 2, HZ + 0.02);
  for (let x = -HX; x <= HX + 0.01; x += 5) box(f.shell, 0.14, CEIL, 0.16, std(0x1a1833, { metal: 0.5, rough: 0.4 }), x, CEIL / 2, HZ + 0.06, { cast: false });
  box(f.shell, W, 0.08, 0.1, std(0x1a1833, { metal: 0.5, rough: 0.4 }), 0, 2.9, HZ + 0.06, { cast: false });
  // 천장 조명(위층 바닥 밑)
  for (const x of [-10, -3, 4, 11]) for (const z of [-3, 3]) { const m = glow(0xfff0d8, 1.25); f.ceilMats.push(m); box(f.ceil, 2.6, 0.05, 0.5, m, x, CEIL - 0.03, z, { cast: false }); }
  if (n === 1) buildGym(g, f, col); else buildOffice(n, g, f, th, col);
  // 층 선택용 투명 상자
  f.hit = new THREE.Mesh(new THREE.BoxGeometry(W + 1, FH - 0.1, D + 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); f.hit.position.y = FH / 2 - 0.5; f.hit.userData.floor = n; g.add(f.hit);
}
NS.forEach(buildFloor);

// 옥상
const roof = new THREE.Group(); roof.position.y = floorY(NS.length + 1); scene.add(roof); const roofS = { lift: 0, liftT: 0 };
box(roof, W + 0.9, 0.5, D + 0.9, std(0x15132a, { rough: 0.7 }), 0, -0.25, 0, { cast: false });
box(roof, W + 0.9, 0.1, 0.09, glow(0xffffff, 1.5), 0, -0.07, HZ + 0.47, { cast: false });
for (const [w, d, x, z] of [[W + 0.9, 0.25, 0, HZ + 0.32], [W + 0.9, 0.25, 0, -HZ - 0.32], [0.25, D + 0.9, HX + 0.32, 0], [0.25, D + 0.9, -HX - 0.32, 0]]) box(roof, w, 0.9, d, 0x1d1a3a, x, 0.45, z, { cast: false });
box(roof, 2.6, 1.3, 2.0, 0x2a2650, 12.9, 0.65, -5.2); box(roof, 1.6, 1.0, 1.4, 0x2a2650, 13.6, 0.5, -2.6); box(roof, 3.6, 2.4, 2.6, 0x221f44, ELEV.x, 1.2, -5.2);
// 옥상 대표실(유리 파빌리온) — 3개 회사 전체를 내려다보는 자리
const PAV = { cx: -8.5, cz: -0.5, w: 10, d: 8, h: 3.3 }, gold = new THREE.Color(0xffd23f);
const pavRoof = new THREE.Group(); roof.add(pavRoof); let pavBoard = null, pavHit = null;
{ // 건물 간판은 대표실 지붕 위(없으면 옥상 앞)
  const sx = RN ? PAV.cx + 0.9 : 0, sy = RN ? PAV.h + 0.3 : 0, rsign = textPlane(pavRoof, cfg.building.name, { h: 2.3, px: 200, color: '#f1edff', glow: false, boost: 1.12, weight: 900, x: sx, y: sy + 1.35, z: PAV.cz + PAV.d / 2 - 0.2 });
  plane(pavRoof, 1.6, 2.3, new THREE.MeshBasicMaterial({ map: tex('assets/art/shaddo_logo.png'), transparent: true, toneMapped: false }), sx - rsign.userData.w / 2 - 1.0, sy + 1.35, PAV.cz + PAV.d / 2 - 0.2);
  for (const k of [-1, 1]) box(pavRoof, 0.1, 0.5, 0.1, darkMat, sx + k * rsign.userData.w * 0.4, sy + 0.2, PAV.cz + PAV.d / 2 - 0.3, { cast: false }); }
if (RN) {
  const x0 = PAV.cx - PAV.w / 2, x1 = PAV.cx + PAV.w / 2, z0 = PAV.cz - PAV.d / 2, z1 = PAV.cz + PAV.d / 2;
  plane(roof, PAV.w, PAV.d, std(0xd9c7a6, { map: woodTex(), rough: 0.6 }), PAV.cx, 0.02, PAV.cz, { rx: -Math.PI / 2, recv: true });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.1, 36), std(0x2a2350, { map: noiseTex, rough: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(-5.9, 0.03, 0.9); rug.receiveShadow = true; roof.add(rug);
  plane(roof, PAV.w, PAV.h, std(0x1d1838, { rough: 0.9 }), PAV.cx, PAV.h / 2, z0 + 0.01, { recv: true }); box(roof, PAV.w + 0.3, PAV.h, 0.2, 0x0d0b1e, PAV.cx, PAV.h / 2, z0 - 0.11, { cast: false });
  plane(roof, PAV.w + 4, 6, new THREE.MeshBasicMaterial({ map: radialTex, color: gold, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), PAV.cx, 2.2, z0 + 0.03);
  box(roof, PAV.w, 0.06, 0.06, glow(gold, 1.8), PAV.cx, PAV.h - 0.25, z0 + 0.05, { cast: false });
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.1, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
  plane(roof, PAV.w, PAV.h, glassM, PAV.cx, PAV.h / 2, z1); plane(roof, PAV.d, PAV.h, glassM, x0, PAV.h / 2, PAV.cz, { ry: Math.PI / 2 }); plane(roof, PAV.d, PAV.h, glassM, x1, PAV.h / 2, PAV.cz, { ry: Math.PI / 2 });
  for (const [x, z] of [[x0, z1], [x1, z1], [x0, z0], [x1, z0], [PAV.cx, z1]]) box(roof, 0.12, PAV.h, 0.12, std(0x1a1833, { metal: 0.5, rough: 0.4 }), x, PAV.h / 2, z, { cast: false });
  box(pavRoof, PAV.w + 0.8, 0.22, PAV.d + 0.8, std(0x15132a, { rough: 0.7 }), PAV.cx, PAV.h + 0.11, PAV.cz, { cast: false }); box(pavRoof, PAV.w + 0.8, 0.07, 0.07, glow(gold, 2.0), PAV.cx, PAV.h + 0.02, z1 + 0.42, { cast: false });
  for (const x of [-11, -6]) box(pavRoof, 2.4, 0.05, 0.5, glow(0xfff0d8, 1.2), x, PAV.h - 0.03, PAV.cz + 0.8, { cast: false });
  textPlane(roof, 'CEO OFFICE', { h: 0.5, px: 110, color: '#ffd23f', glow: true, boost: 1.4, weight: 900, x: -10.6, y: 2.75, z: z0 + 0.06 });
  textPlane(roof, `${cfg.building.name} · 대표 ${cfg.building.ceo || ''}`, { h: 0.24, px: 64, color: '#e9e2c6', weight: 600, x: -10.6, y: 2.25, z: z0 + 0.06 });
  const pc = document.createElement('canvas'); pc.width = 720; pc.height = 405; const pt = new THREE.CanvasTexture(pc); pt.colorSpace = THREE.SRGBColorSpace; pt.anisotropy = 8;
  box(roof, 3.9, 2.25, 0.08, 0x0b0918, -5.9, 1.95, z0 + 0.06, { cast: false }); plane(roof, 3.7, 2.08, new THREE.MeshBasicMaterial({ map: pt, toneMapped: false }), -5.9, 1.95, z0 + 0.11); pavBoard = { canvas: pc, tex: pt };
  const ceo = HQ.staff.find(s => s.floor === RN); if (ceo) buildDesk(roof, ceo, -10.2, -2.2, true, gold);
  const sofa = std(0x3b3270, { rough: 0.9 }), sofa2 = std(0x2a2350, { rough: 0.9 });
  box(roof, 2.6, 0.5, 1.0, sofa, -5.9, 0.25, -0.4); box(roof, 2.6, 0.7, 0.28, sofa2, -5.9, 0.85, -0.9); box(roof, 1.3, 0.07, 0.7, 0xf3e8d2, -5.9, 0.4, 1.2); box(roof, 0.1, 0.36, 0.1, 0x8d7a60, -5.9, 0.18, 1.2, { cast: false });
  box(roof, 0.4, 1.5, 2.2, 0x2d2752, x1 - 0.35, 0.75, -2.6); for (let i = 0; i < 3; i++) box(roof, 0.3, 0.3, 0.3, std([0xffd23f, 0x6a3cff, 0xff8400][i], { metal: 0.6, rough: 0.3 }), x1 - 0.42, 1.68, -3.3 + i * 0.7, { cast: false });
  plant(roof, x0 + 0.6, z1 - 0.6, 1.1);
  for (const [x, z] of [[-1.8, 5.2], [0.6, 5.2]]) { box(roof, 0.8, 0.3, 1.9, 0x3a3166, x, 0.3, z, { ry: 0.25 }); box(roof, 0.8, 0.5, 0.25, 0x3a3166, x - 0.22, 0.6, z - 0.85, { ry: 0.25 }); }
  pavHit = new THREE.Mesh(new THREE.BoxGeometry(PAV.w + 0.6, PAV.h + 0.4, PAV.d + 0.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); pavHit.position.set(PAV.cx, PAV.h / 2, PAV.cz); pavHit.userData.floor = RN; roof.add(pavHit);
  F[RN] = roofS; roofS.col = gold; roofS.g = roof;   // 사람 위치·보이기 계산이 층과 같은 방식으로 돌도록
}
const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 6, 8), metalMat); ant.position.set(14.2, 3, -6.2); roof.add(ant);
const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), glow(0xff3b4e, 3)); beacon.position.set(14.2, 6.1, -6.2); roof.add(beacon);

{ const refl = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); const cols = NS.map(n => FLOORS[n].color); cols.forEach((c, i) => gr.addColorStop(Math.min(0.92, 0.05 + i * 0.17), c)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; const a = g.createLinearGradient(0, 0, 0, h); a.addColorStop(0, 'rgba(0,0,0,.9)'); a.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = a; g.fillRect(0, 0, w, h); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, 3.3), new THREE.MeshBasicMaterial({ map: refl, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, LOT.GY + 0.016, HZ + 2.2); scene.add(m); }
// 바깥: 주차장·차량·출입문·헬기
const OUTSIDE = { lift: 0, n: 0 }; F[0] = OUTSIDE;
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;   // 차·헬기 도장 반사용(장면 전체 조명에는 쓰지 않음)
const outdoor = buildOutdoor({ env: envTex, tex, scene, roof, cfg, HQ, std, glow, box, plane, textPlane, canvasTex, radialTex, noiseTex, metalMat, darkMat, FONT });

// 층 안내 기둥(건물 왼쪽) — 층·회사·실시간 근무 수
const totem = new THREE.Group(); totem.position.set(-HX - 3.4, 0, HZ + 0.6); scene.add(totem);
box(totem, 3.5, NS.length * FH + 0.4, 0.5, 0x0d0b1e, 0, NS.length * FH / 2 - 0.3, 0);
const totemSeg = {};
for (const n of NS) {
  const c = document.createElement('canvas'); c.width = 420; c.height = 600; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = plane(totem, 3.2, 4.57, new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), 0, floorY(n) + 2.05, 0.27); m.userData.floor = n;
  totemSeg[n] = { canvas: c, tex: t, mesh: m, key: '' };
}
function drawTotem() {
  for (const n of NS) {
    const fd = FLOORS[n], seg = totemSeg[n], here = HQ.staff.filter(s => !s.human && HQ.stat(s.id).floorNow === n), busy = here.filter(s => HQ.stat(s.id).busy).length;
    const key = `${here.length}/${busy}/${hoverFloor === n}`; if (seg.key === key) continue; seg.key = key;
    const g = seg.canvas.getContext('2d'), w = 420, h = 600, hov = hoverFloor === n;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hov ? '#2a2356' : '#17142f'); gr.addColorStop(1, '#0f0d22'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = fd.color; g.fillRect(0, 0, 14, h); g.globalAlpha = 0.16; g.fillRect(14, 0, w, h); g.globalAlpha = 1;
    g.fillStyle = '#fff'; g.font = `900 150px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillText(n + 'F', 44, 190);
    g.fillStyle = fd.color; g.font = `900 ${fd.short.length > 9 ? 46 : 58}px ${FONT}`; g.fillText(fd.short, 46, 280);
    g.fillStyle = '#cfc8ee'; g.font = `600 34px ${FONT}`; g.fillText(fd.title, 46, 338);
    const on = n === 1 ? here.length > 0 : busy > 0;
    g.fillStyle = on ? '#39e58c' : '#5c567d'; g.beginPath(); g.arc(66, 470, 16, 0, 7); g.fill();
    g.fillStyle = on ? '#eafff3' : '#8f88b3'; g.font = `800 58px ${FONT}`; g.fillText(n === 1 ? `운동 ${here.length}명` : `근무 ${busy}/${here.length}`, 100, 490);
    g.fillStyle = hov ? '#fff' : '#6d668f'; g.font = `600 26px ${FONT}`; g.fillText(hov ? '눌러서 들어가기 →' : '', 46, 560);
    seg.tex.needsUpdate = true;
  }
}

// 같은 재질의 고정 물체를 한 덩어리로 합친다 — 그리는 횟수를 크게 줄여 회전이 끊기지 않게 한다.
// (움직이거나 나중에 따로 다루는 것은 keep 에 넣거나 userData.dynamic 으로 표시해 제외)
function mergeStatic(container, skip = [], keep = []) {
  container.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(container.matrixWorld).invert(), groups = new Map(), sk = new Set(skip), kp = new Set(keep);
  const sig = m => [m.type, m.color ? [m.color.r, m.color.g, m.color.b].map(v => v.toFixed(3)).join(',') : '', m.roughness, m.metalness, m.map ? m.map.uuid : '', m.alphaMap ? m.alphaMap.uuid : '', m.emissive ? m.emissive.getHexString() + m.emissiveIntensity : '', m.transparent, m.opacity, m.side, m.blending, m.toneMapped, m.depthWrite, m.depthTest, m.clearcoat || 0, m.envMap ? m.envMap.uuid : ''].join('|');
  const walk = o => { for (const ch of o.children.slice()) { if (sk.has(ch) || ch.userData.dynamic) continue;
      if (ch.isMesh && !kp.has(ch) && !Array.isArray(ch.material) && ch.geometry.attributes.uv && ch.geometry.attributes.normal && ch.visible) { const k = sig(ch.material) + '|' + ch.castShadow + ch.receiveShadow + ch.renderOrder; (groups.get(k) || groups.set(k, []).get(k)).push(ch); }
      walk(ch); } };
  walk(container);
  for (const list of groups.values()) { if (list.length < 2) continue;
    const geos = list.map(m => { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); return g; });
    const mg = mergeGeometries(geos, false); if (!mg) continue;
    const mesh = new THREE.Mesh(mg, list[0].material); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.renderOrder = list[0].renderOrder; container.add(mesh);
    for (const m of list) { if (m.children.length) continue; m.parent.remove(m); m.geometry.dispose(); } for (const g of geos) g.dispose(); }
}
for (const n of NS) { const f = F[n]; mergeStatic(f.shell); mergeStatic(f.ceil); mergeStatic(f.g, [f.shell, f.ceil, shuttle].filter(Boolean), [f.doorL, f.doorR, f.hit, f.leds[0]].filter(Boolean)); }
mergeStatic(pavRoof); mergeStatic(roof, [pavRoof, outdoor.heli.g], [pavHit].filter(Boolean));
mergeStatic(outdoor.groups.cafeRoof); mergeStatic(outdoor.groups.cafe, [outdoor.groups.cafeRoof]); mergeStatic(outdoor.groups.lot);
for (const c of outdoor.cars) { for (const w of c.wheels) mergeStatic(w); mergeStatic(c.g, c.wheels, [c.hit, c.beam]); }   // 차 한 대를 재질별 몇 덩어리로
{ const h = outdoor.heli; for (const sp of h.spinners) mergeStatic(sp); mergeStatic(h.g, h.spinners, [h.hit]); }
// 움직이지 않는 물체는 위치 계산을 한 번만 한다(매 프레임 수천 개를 다시 계산하지 않게)
for (const n of NS) { const f = F[n]; f.g.traverse(o => { if (o !== f.g && o !== f.shell && o !== f.ceil) { o.matrixAutoUpdate = false; o.updateMatrix(); } });
  for (const o of [f.doorL, f.doorR]) if (o) o.matrixAutoUpdate = true; }
if (shuttle) shuttle.traverse(o => { o.matrixAutoUpdate = true; });

// ---------- 사람 ----------
const IDLE_H = 1.74, SEAT_H = 1.5, SPORT_H = 1.6, STRIDE = 0.27;
const ringGeo = new THREE.RingGeometry(0.44, 0.58, 36), shGeo = new THREE.PlaneGeometry(1, 1);
const people = {};
const baseY = f => f === 0 ? LOT.GY : floorY(f);
const hashN = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function labelTex(name) {
  return canvasTex(320, 96, (g, w, h) => { g.font = `800 44px ${FONT}`; const tw = Math.min(w - 20, g.measureText(name).width + 44); g.fillStyle = 'rgba(12,10,30,.82)';
    g.beginPath(); g.roundRect((w - tw) / 2, 16, tw, 64, 32); g.fill(); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, 50); });
}
// 앉은 그림의 손 부분만 위아래로 움직여 키보드를 치는 것처럼 보이게 한다(몸 전체가 떨리지 않게 손 영역에만 적용).
function typingMaterial(map, hands) {
  const m = new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.06, toneMapped: false });
  m.userData.u = { uTime: { value: 0 }, uType: { value: 0 }, uHand: { value: new THREE.Vector4(...hands) } };
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, m.userData.u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uType; uniform vec4 uHand;').replace('#include <map_fragment>', `
      vec2 tuv = vMapUv; vec2 hc = ( tuv - uHand.xy ) / ( uHand.zw - uHand.xy );
      if ( uType > 0.001 && hc.x > 0.0 && hc.x < 1.0 && hc.y > 0.0 && hc.y < 1.0 ) {
        float w = smoothstep( 0.0, 0.22, hc.x ) * smoothstep( 1.0, 0.78, hc.x ) * smoothstep( 0.0, 0.25, hc.y ) * smoothstep( 1.0, 0.75, hc.y );
        float side = step( 0.5, hc.x );
        float burst = 0.5 + 0.5 * sin( uTime * 1.3 + side * 2.0 );
        float tap = sin( uTime * 19.0 + side * 3.14159 ) * 0.55 + sin( uTime * 27.0 + side * 1.3 ) * 0.45;
        tuv.y += uType * w * burst * tap * 0.017;
        tuv.x += uType * w * burst * sin( uTime * 11.0 + side * 2.2 ) * 0.004;
      }
      vec4 sampledDiffuseColor = texture2D( map, tuv ); diffuseColor *= sampledDiffuseColor;`); };
  m.customProgramCacheKey = () => 'hq-typing';
  return m;
}
const setCell = (t, n, i, flip) => { if (flip) { t.repeat.set(-1 / n, 1); t.offset.set((i + 1) / n, 0); } else { t.repeat.set(1 / n, 1); t.offset.set(i / n, 0); } };
class Person {
  constructor(s) {
    this.s = s; this.id = s.id; const m = manifest[s.key] || {}; this.m = m; this.floor = s.floor; this.pos = { x: 0, z: 0 }; this.route = []; this.anchor = null; this.dest = null; this.destKey = ''; this.fade = 1;
    this.dir = 1; this.walkD = 0; this.pose = ''; this.inited = false; this.vel = 0; this.hx = 1; this.hz = 0; this.away = false; this.returning = false; this.veh = null; this.vehKind = '';
    this.speed = 2.05 + (hashN(s.id) % 50) / 100; this.seed = (hashN(s.id) % 1000) / 37; this.act = ''; this.ph = this.seed; this.swingAt = -1e9; this.courtT = null; this.pop = 0;
    this.errand = null; this.drink = null; this.sipT = 0; this.nextSip = 0; this.nextCafe = performance.now() + 180000 + (hashN(s.id + 'c') % 720) * 1000; this.board = null; this.cup = null; this.carry = null;
    const flipSeat = !!s.seatFlip, hb = m.hands || (flipSeat ? [0.6, 0.38, 0.96, 0.62] : [0.04, 0.38, 0.4, 0.62]);
    const sprMat = map => new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.06, toneMapped: false });
    const load = (kind, onload) => { const t = loader.load(`assets/people/${s.key}_${kind}.png`, onload); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; return t; };
    this.ghostMats = {};
    const atlas = kind => { if (!m[kind]) return null; let ghost; const t = load(kind, () => { ghost.needsUpdate = true; }); ghost = t.clone(); this.ghostMats[kind] = sprMat(ghost); return sprMat(t); };
    this.mats = { seat: typingMaterial(load('seat'), hb), sip: m.sip ? sprMat(load('sip')) : null, idle: sprMat(load('idle')), sport: m.sport ? sprMat(load('sport')) : null, walk: atlas('walk'), run: atlas('run'), swing: m.swing ? sprMat(load('swing')) : null, curl: atlas('curl'), bench: atlas('bench') };
    // 앉은 그림은 의자 다리 중심을 기준점으로 놓는다(마시는 그림으로 바뀌어도 의자가 같은 자리에 있게).
    // 손이 키보드 위에 오도록 앉는 자리를 잡는 데 쓴다(의자 중심에서 손까지의 가로 거리).
    const sc = v => flipSeat ? 1 - v : v; this.seatCx = sc(m.seatCx ?? 0.5); this.sipCx = sc(m.sipCx ?? m.seatCx ?? 0.5);
    const uc = (hb[0] + hb[2]) / 2, seatW = SEAT_H * (m.seat ? m.seat[0] / m.seat[1] : 0.6); this.handDX = (sc(uc) - this.seatCx) * seatW;
    this.sp = new THREE.Sprite(this.mats.idle); this.sp.userData.id = s.id; scene.add(this.sp);
    this.ghost = new THREE.Sprite(this.mats.idle); this.ghost.visible = false; this.ghost.renderOrder = 1; scene.add(this.ghost);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(s.name), transparent: true, depthTest: false, toneMapped: false })); this.label.scale.set(1.5, 0.45, 1); this.label.renderOrder = 20; this.label.visible = false; scene.add(this.label);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C_WORK, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); this.ring.rotation.x = -Math.PI / 2; scene.add(this.ring);
    this.shadow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 })); this.shadow.rotation.x = -Math.PI / 2; scene.add(this.shadow);
  }
  // 그림 종류별 크기(월드 단위)와 발끝 기준점
  dims(kind) {
    const m = this.m, a = m[kind];
    if ((kind === 'walk' || kind === 'run') && a) { const h = IDLE_H * (kind === 'run' ? 0.98 : 1) * a.cellH / a.bodyH; return { w: h * a.cellW / a.cellH, h, cy: 8 / a.cellH, cx: 0.5, n: a.frames }; }
    if ((kind === 'swing' || kind === 'curl' || kind === 'bench') && a) { const h = (kind === 'swing' ? IDLE_H * 0.9 : kind === 'bench' ? 1.22 : IDLE_H * 0.97) * a.cellH / a.refH; return { w: h * a.cellW / a.cellH, h, cy: 8 / a.cellH, cx: 0.5, n: a.frames }; }
    const d = (Array.isArray(a) && a) || m.idle || [180, 512], seated = kind === 'seat' || kind === 'sip', h = seated ? SEAT_H : kind === 'sport' ? SPORT_H : IDLE_H; return { w: h * d[0] / d[1], h, cy: 0, cx: kind === 'seat' ? this.seatCx : kind === 'sip' ? this.sipCx : 0.5, n: 1 };
  }
  show(kind) { const mat = this.mats[kind] || this.mats.idle, k = this.mats[kind] ? kind : 'idle', d = this.dims(k); this.kind = k; this.d = d; this.sp.material = mat; this.sp.scale.set(d.w, d.h, 1); this.sp.center.set(d.cx, d.cy);
    const g = this.ghostMats[k]; if (g) { this.ghost.material = g; this.ghost.scale.set(d.w, d.h, 1); this.ghost.center.set(d.cx, d.cy); } this.ghost.visible = false;
    if (d.n === 1) { const t = mat.map, fl = (k === 'seat' || k === 'sip' || k === 'idle' || k === 'sport') && this.flip; t.repeat.set(fl ? -1 : 1, 1); t.offset.set(fl ? 1 : 0, 0); } }
  setPose(pose, flip = false, act = '') {
    this.pose = pose; this.act = act; this.flip = flip;
    if (pose === 'walk') this.show(this.mats.walk ? 'walk' : 'idle');
    else if (pose === 'sport') this.show(act === 'court' ? (this.mats.swing ? 'swing' : 'sport') : act === 'tread' ? (this.mats.run ? 'run' : this.mats.walk ? 'walk' : 'sport') : act === 'bench' ? (this.mats.bench ? 'bench' : this.mats.curl ? 'curl' : 'sport') : act === 'curl' ? (this.mats.curl ? 'curl' : 'sport') : 'sport');
    else this.show(pose);
    this.sp.material.rotation = 0;
    this.shadow.scale.set(pose === 'seat' ? 1.5 : pose === 'sport' ? 1.3 : 0.95, pose === 'seat' ? 1.1 : 0.55, 1);
  }
  // 아틀라스 동작(걷기·달리기·덤벨): 지금 컷은 또렷하게, 다음 컷을 그 위에 서서히 겹쳐 끊김을 줄인다
  cycle(phase, flip) {
    const n = this.d.n; if (n <= 1) return; const i = Math.floor(phase) % n, f = phase - Math.floor(phase);
    setCell(this.sp.material.map, n, i, flip);
    const g = this.ghostMats[this.kind]; if (g) { setCell(g.map, n, (i + 1) % n, flip); const o = THREE.MathUtils.smoothstep(f, 0.45, 1.0); g.opacity = o * this.fade; this.ghost.visible = this.sp.visible && o > 0.02; }
  }
  snap(a) { this.floor = a.floor; const p = a.pts[a.pts.length - 1]; this.pos = { x: p.x, z: p.z }; this.route = []; this.anchor = a; this.dest = a; this.destKey = a.key; this.setPose(a.pose, a.flip, a.act); this.inited = true; }
  go(a) {
    const steps = [], cur = this.floor;
    if (this.anchor && !this.route.length) { const pts = this.anchor.pts; for (let i = pts.length - 2; i >= 0; i--) steps.push({ floor: cur, x: pts[i].x, z: pts[i].z }); }
    else steps.push({ floor: cur, x: this.pos.x, z: AISLE[cur] });
    if (a.floor !== cur) steps.push(...transfer(cur, a.floor));
    for (const p of a.pts) steps.push({ floor: a.floor, x: p.x, z: p.z });
    this.route = steps; this.dest = a; this.destKey = a.key; this.anchor = null; this.courtT = null; this.setPose('walk');
  }
  update(dt, now) {
    let moved = 0;
    if (this.board) {   // 차·헬기에 올라타는 짧은 연출: 탈것 쪽으로 다가가며 사라진다
      const b = this.board; b.t += dt; const k = Math.min(1, b.t / 0.6); this.pos.x += (b.tx - this.pos.x) * Math.min(1, dt * 6); this.pos.z += (b.tz - this.pos.z) * Math.min(1, dt * 6); this.fade = 1 - k; this.walkD += dt * 1.2;
      if (k >= 1) { this.board = null; this.setPose('idle');
        if (this.veh === b.veh) { this.away = true; HQ.actualVeh[this.id] = this.vehKind; b.veh.depart(); } else { this.fade = 1; this.destKey = ''; } }   // 그 사이 외근이 풀렸으면 타지 않는다
    } else if (this.route.length) {
      const wp = this.route[0];
      if (wp.elev != null) { this.vel = 0; this.fade -= dt * 3.2; if (this.fade <= 0) { this.fade = 0; this.floor = wp.elev; this.pos = { x: ELEV.x, z: ELEV.z }; this.route.shift(); } }
      else {
        if (wp.floor !== this.floor) this.floor = wp.floor;   // 출입문을 지나 안팎이 바뀜
        const dv = this.dest && this.dest.vehicle; if (dv && dv.unlock && this.route.length <= 2 && Math.hypot(dv.door.x - this.pos.x, dv.door.z - this.pos.z) < 6.5) dv.unlock();
        this.fade = Math.min(1, this.fade + dt * 3.2);
        let dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, dist = Math.hypot(dx, dz);
        const nx = this.route[1], last = this.route.length === 1 || (nx && nx.elev != null);
        // 모퉁이는 미리 꺾어 둥글게 돈다(다음 지점이 같은 층일 때)
        if (!last && dist < 0.55 && nx && nx.elev == null && nx.floor === wp.floor) { this.route.shift(); return this.update(0, now); }
        const want = last ? Math.min(this.speed, 0.55 + dist * 2.4) : this.speed;      // 도착 직전에는 속도를 줄인다
        this.vel += (want - this.vel) * Math.min(1, dt * 5.5);
        const step = this.vel * dt;
        if (dist <= Math.max(step, 0.03)) { this.pos.x = wp.x; this.pos.z = wp.z; moved = dist; this.route.shift(); if (!this.route.length) this.arrived(now); }
        else { const k = Math.min(1, dt * 9); this.hx += (dx / dist - this.hx) * k; this.hz += (dz / dist - this.hz) * k; const hl = Math.hypot(this.hx, this.hz) || 1;
          this.pos.x += this.hx / hl * step; this.pos.z += this.hz / hl * step; moved = step; if (Math.abs(this.hx) > 0.25) this.dir = this.hx > 0 ? 1 : -1; }
        this.walkD += moved;
      }
    } else { this.fade = Math.min(1, this.fade + dt * 3.2); this.vel = 0; }
    const f = F[this.floor] || OUTSIDE, vis = !this.away && f.lift < 40 && this.fade > 0.02; let y0 = baseY(this.floor) + f.lift;
    if (this.floor <= 1 && Math.abs(this.pos.x - LOT.DOOR_X) < 2.4 && this.pos.z > 6.9 && this.pos.z < 9.95) y0 = THREE.MathUtils.lerp(0, LOT.GY, THREE.MathUtils.clamp((this.pos.z - 7.3) / 2.3, 0, 1));   // 출입 계단
    const st = this.stat || { busy: false, state: 'lounge' };
    let bob = 0, lift = 0;
    this.sp.visible = vis;
    if (this.pose === 'walk') { const ph = this.walkD / STRIDE; this.cycle(ph, this.dir < 0); bob = Math.abs(Math.sin(ph * Math.PI * 2 / Math.max(2, this.d.n))) * 0.03; this.sp.material.rotation = -this.dir * 0.035 * Math.min(1, this.vel / this.speed); }
    else if (this.pose === 'seat') {
      if (this.drink && this.mats.sip && this.sipT <= 0 && now > this.nextSip) { this.sipT = 2.7; this.nextSip = now + 15000 + Math.random() * 26000; }   // 가끔 한 모금
      if (this.sipT > 0) { this.sipT -= dt; if (this.kind !== 'sip') this.show('sip'); } else if (this.kind === 'sip') this.show('seat');
      const u = this.mats.seat.userData.u, typing = this.kind !== 'seat' ? 0 : st.busy ? 1 : st.state === 'present' ? 0.45 : 0; u.uTime.value = now / 1000 + this.seed; u.uType.value += (typing - u.uType.value) * Math.min(1, dt * 4); bob = Math.sin(now / 1500 + this.seed) * 0.006; }
    else if (this.pose === 'sport' && this.act === 'tread') { this.ph += dt * (this.kind === 'run' ? 9.5 : 6.4); this.cycle(this.ph, false); bob = this.kind === 'run' ? 0 : Math.abs(Math.sin(this.ph * Math.PI * 2 / Math.max(2, this.d.n))) * 0.06; lift = 0.25; this.sp.material.rotation = this.kind === 'run' ? 0 : -0.06; }
    else if (this.pose === 'sport' && (this.act === 'curl' || this.act === 'bench')) { this.ph += dt * (this.act === 'bench' ? 1.9 : 2.3); this.cycle(this.ph, this.act === 'curl' && this.flip); }
    else if (this.pose === 'sport' && this.act === 'court' && this.kind === 'swing') { const ds = (now - this.swingAt) / 1000, fr = ds > -0.3 && ds <= -0.09 ? 1 : ds > -0.09 && ds <= 0.13 ? 2 : ds > 0.13 && ds <= 0.42 ? 3 : 0;
      setCell(this.sp.material.map, this.d.n, fr, this.flip); lift = fr === 2 ? 0.16 : fr === 1 ? 0.05 : 0; bob = fr === 0 ? Math.abs(Math.sin(now / 190 + this.seed)) * 0.035 : 0; }   // 준비 자세에서는 잔발
    else bob = Math.sin(now / 1300 + this.seed) * 0.012;
    this.pop = Math.max(0, this.pop - dt * 5);
    this.sp.position.set(this.pos.x, y0 + bob + lift, this.pos.z); this.sp.material.opacity = this.fade;
    if (this.ghost.visible) this.ghost.position.copy(this.sp.position); if (!vis) this.ghost.visible = false;
    this.shadow.visible = vis; this.shadow.position.set(this.pos.x + 0.05, y0 + 0.03 + (this.act === 'tread' && this.pose === 'sport' ? 0.25 : 0), this.pos.z + 0.04); this.shadow.material.opacity = 0.9 * this.fade * (lift > 0.1 ? 0.6 : 1);
    const active = st.busy && this.pose === 'seat';
    this.ring.visible = vis; this.ring.position.set(this.pos.x, y0 + 0.035, this.pos.z); this.ring.material.color.setHex(st.state === 'directing' ? C_DIRECT : C_WORK);
    this.ring.material.opacity += ((active ? 0.5 + 0.3 * Math.sin(now / 280) : 0) - this.ring.material.opacity) * 0.12;
    if (this.cup) this.cup.visible = !!this.drink && this.pose === 'seat' && this.sipT <= 0 && !this.away;
    if (this.carry) { const on = vis && this.pose === 'walk' && !!this.errand && this.errand.stage === 'back'; this.carry.visible = on; if (on) this.carry.position.set(this.pos.x + this.dir * 0.3, y0 + 0.93 + bob, this.pos.z + 0.03); }
    const showLabel = vis && (mode.floor === this.floor || (mode.floor === LOTN && this.floor === 0) || (mode.floor === CAFN && this.floor === 1 && this.pos.x > 14.6));
    this.label.visible = showLabel; if (showLabel) this.label.position.set(this.pos.x, y0 + (this.pose === 'seat' ? 1.78 : 2.02) + bob + lift, this.pos.z);
  }
  arrived(now) {
    const a = this.dest; this.anchor = a; this.vel = 0;
    if (a.vehicle) { const v = a.vehicle; this.board = { t: 0, veh: v, tx: v.bx != null ? v.bx + 0.5 : v.door.x + 0.5, tz: v.bx != null ? LOT.BAY_Z + 0.2 : v.door.z - 0.9 }; this.dir = this.board.tx > this.pos.x ? 1 : -1; this.setPose('walk'); return; }   // 차·헬기에 탄다
    if (a.cafe) { this.setPose('idle'); if (this.errand) { this.errand.stage = 'wait'; this.errand.until = now + 3000 + Math.random() * 2500; } return; }   // 카페 카운터 앞에서 주문
    this.setPose(a.pose, a.flip, a.act); this.pop = 1; if (a.act === 'court') this.swingAt = -1e9;
    if (a.key === 'desk' && this.errand) { this.errand = null; this.nextCafe = now + (25 + Math.random() * 20) * 60000; this.nextSip = now + 3500; }
  }
}
// 층 사이 이동 경로: 건물 안은 엘리베이터, 바깥(0)은 1층 출입문
function transfer(from, to) {
  const s = []; let f = from;
  if (f === 0) { s.push({ floor: 0, x: LOT.DOOR_X, z: LOT.DOOR_OUT }, { floor: 1, x: LOT.DOOR_X, z: LOT.DOOR_IN }, { floor: 1, x: LOT.DOOR_X, z: AISLE[1] }); f = 1; }
  const viaElev = t => { s.push({ floor: f, x: ELEV.x, z: AISLE[f] }, { floor: f, x: ELEV.x, z: ELEV.z }, { elev: t }, { floor: t, x: ELEV.x, z: AISLE[t] }); f = t; };
  if (to === 0) { if (f !== 1) viaElev(1); s.push({ floor: 1, x: LOT.DOOR_X, z: AISLE[1] }, { floor: 1, x: LOT.DOOR_X, z: LOT.DOOR_IN }, { floor: 0, x: LOT.DOOR_X, z: LOT.DOOR_OUT }); return s; }
  if (f !== to) viaElev(to);
  return s;
}
function deskAnchor(s) {
  const d = deskOf[s.id], az = AISLE[s.floor], p = people[s.id], lead = d.lead;
  const seat = { x: d.x + d.kbx - (p ? p.handDX : -0.4), z: d.z - d.dp / 2 - 0.1 }, lane = d.x + (lead ? 2.1 : 1.5);
  const pts = d.z > az ? [{ x: seat.x, z: az }, seat] : [{ x: lane, z: az }, { x: lane, z: seat.z }, seat];
  return { key: 'desk', floor: s.floor, pts, pose: 'seat', flip: !!s.seatFlip };
}
function loungeAnchor(s) { const p = loungeOf[s.id] || { x: 9, z: 0 }; return { key: 'lounge', floor: s.floor, pts: [{ x: p.x, z: AISLE[s.floor] }, p], pose: 'idle', flip: false }; }
function gymAnchor(i) { const p = GYM_SPOTS[i % GYM_SPOTS.length]; return { key: 'gym' + i, floor: 1, pts: [{ x: p.x, z: AISLE[1] }, { x: p.x, z: p.z }], pose: 'sport', act: p.act, flip: p.act === 'court' ? p.court === 'R' : !!p.flip, court: p.court, home: { x: p.x, z: p.z } }; }   // 스윙 그림은 오른쪽을 본다 → 오른쪽 코트 선수만 뒤집어 서로 마주 본다
function cafeAnchor(i) { const sp = outdoor.cafeSpots[i], C = outdoor.CAF; return { key: 'cafe' + i, floor: 1, cafe: true, pose: 'idle', pts: [{ x: 13.6, z: AISLE[1] }, { x: 13.6, z: C.doorZ }, { x: 16.6, z: C.doorZ }, { x: 16.6, z: -0.6 }, { x: sp.x, z: -0.6 }, { x: sp.x, z: sp.z }] }; }
function outAnchor(v, kind) {
  if (kind === 'heli') return { key: 'heli', floor: RN, pts: [{ x: 4.4, z: AISLE[RN] }, { x: 4.4, z: v.door.z }, { x: v.door.x, z: v.door.z }], pose: 'idle', vehicle: v };
  return { key: 'out@' + v.bx, floor: 0, pts: [{ x: v.door.x, z: AISLE[0] }, { x: v.door.x, z: v.door.z }], pose: 'idle', vehicle: v };
}
outdoor.cafeHit.userData.floor = CAFN;
for (const s of HQ.staff) people[s.id] = new Person(s);
function cancelBoard(p) { if (!p.board) return; p.board = null; p.fade = 1; p.destKey = ''; p.setPose('idle'); }
function applyOne(s) {
  const p = people[s.id], st = HQ.stat(s.id); p.stat = st;
  const wantOut = st.place === 'out' || st.place === 'heli';
  if (p.errand) { if (st.place === 'desk' && !wantOut) return; if (p.errand.slot) p.errand.slot.user = null; p.errand = null; }   // 음료 사러 간 동안은 그대로 두고, 상태가 바뀌면 중단
  if (wantOut) {
    const kind = st.place === 'heli' && RN ? 'heli' : 'car';
    if (p.veh && p.vehKind !== kind && !p.away) { cancelBoard(p); outdoor.release(p.veh); p.veh = null; delete HQ.actualVeh[s.id]; }
    if (!p.veh) { p.veh = outdoor.acquire(s.id, kind) || (kind === 'heli' ? outdoor.acquire(s.id, 'car') : null); p.vehKind = p.veh === outdoor.heli ? 'heli' : 'car';
      if (p.veh && p.vehKind !== kind) HQ.actualVeh[s.id] = p.vehKind; }   // 헬기가 없어 차로 바뀌면 화면 표시도 차로 맞춘다
    if (p.veh) {
      const a = outAnchor(p.veh, p.vehKind);
      if (!p.inited) { p.inited = true; p.away = true; HQ.actualVeh[s.id] = p.vehKind; p.veh.snapGone(); p.floor = a.floor; p.pos = { x: p.veh.door.x, z: p.veh.door.z }; p.dest = a; p.destKey = a.key; p.anchor = null; p.route = []; p.setPose('idle'); return; }
      if (p.away) return;
      if (p.destKey !== a.key) p.go(a);
      return;
    }
  }
  // 외근 대상인데 탈것이 없으면: 임원·근무 중인 사람은 자리, 나머지는 휴게실에서 기다린다
  const a = st.place === 'desk' || (wantOut && (s.human || st.busy)) ? deskAnchor(s) : st.place === 'gym' ? gymAnchor(st.gymIndex) : loungeAnchor(s);
  cancelBoard(p);   // 타려던 중에 외근이 풀리면 타지 않고 돌아간다
  if (p.away && !p.veh) { p.away = false; p.returning = false; p.floor = 0; p.pos = { x: LOT.DOOR_X, z: AISLE[0] }; p.anchor = null; p.route = []; p.destKey = ''; p.fade = 0; }   // 방어: 탈것 없이 나가 있는 상태는 없다
  if (p.away) {   // 탈것이 돌아와야 내린다
    if (!p.returning) { p.returning = true; const v = p.veh, kind = p.vehKind;
      v.arrive(() => { p.away = false; p.returning = false; p.floor = kind === 'heli' ? RN : 0; p.pos = { x: v.door.x, z: v.door.z }; p.anchor = null; p.route = []; p.destKey = ''; p.fade = 0; outdoor.release(v); p.veh = null; delete HQ.actualVeh[s.id]; applyOne(s); }); }
    return;
  }
  if (p.veh) { outdoor.release(p.veh); p.veh = null; }
  delete HQ.actualVeh[s.id];
  if (!p.inited) p.snap(a); else if (a.key !== p.destKey || a.floor !== (p.dest ? p.dest.floor : p.floor)) p.go(a);
}
function applyData() {
  for (const s of HQ.staff) applyOne(s);
  // 층 밝기: 일하는 사람이 많을수록 천장 조명이 밝다
  for (const n of NS) { const here = HQ.staff.filter(s => s.floor === n && !s.human), r = here.length ? here.filter(s => HQ.stat(s.id).busy).length / here.length : (n === 1 ? Math.min(1, HQ.gymOrder.length / 6) : 0);
    F[n].busy = r; for (const m of F[n].ceilMats) m.color.setHex(0xfff0d8).multiplyScalar(0.75 + 0.75 * r); }
  drawTotem(); drawBoards(); drawPavBoard();
}
const KO = { working: '근무 중', directing: '지휘 중', lounge: '휴게 중', gym: '운동 중', present: '재석', out: '외근 중', heli: '긴급 외근' };
function drawBoards() {
  const CO = { working: '#39e58c', directing: '#ffd23f', lounge: '#7f77a8', gym: '#7dd3fc', present: '#e9d48a', out: '#ffb25c', heli: '#ff6b81' };
  for (const n of NS) { const b = F[n].board; if (!b) continue; const g = b.canvas.getContext('2d'), w = 880, h = 495, fd = FLOORS[n], list = HQ.staff.filter(s => s.floor === n);
    g.fillStyle = '#120e2b'; g.fillRect(0, 0, w, h); g.fillStyle = fd.color; g.fillRect(0, 0, w, 8);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `900 34px ${FONT}`; g.fillStyle = '#fff'; g.fillText(`${n}F ${fd.title} 상황판`, 28, 48);
    g.textAlign = 'right'; g.font = `600 24px ${FONT}`; g.fillStyle = '#a79ccb'; g.fillText(new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' }), w - 28, 48);
    list.forEach((s, i) => { const st = HQ.stat(s.id), col = i % 3, row = Math.floor(i / 3), x = 28 + col * 278, y = 90 + row * 128;
      g.fillStyle = st.state === 'working' ? '#14402f' : st.state === 'directing' ? '#4a3b10' : '#241c4d'; g.fillRect(x, y, 262, 114); g.fillStyle = CO[st.state] || '#7f77a8'; g.fillRect(x, y, 7, 114);
      g.textAlign = 'left'; g.font = `800 26px ${FONT}`; g.fillStyle = '#f1ecff'; g.fillText(s.name, x + 22, y + 32);
      g.font = `700 22px ${FONT}`; g.fillStyle = CO[st.state] || '#7f77a8'; g.fillText(KO[st.state] || st.state, x + 22, y + 72);
      if (st.note) { g.font = `400 16px ${FONT}`; g.fillStyle = '#cfc8ee'; g.fillText(st.note.length > 17 ? st.note.slice(0, 17) + '…' : st.note, x + 22, y + 98); } });
    b.tex.needsUpdate = true; }
}
function drawPavBoard() {
  if (!pavBoard) return; const g = pavBoard.canvas.getContext('2d'), w = 720, h = 405; g.fillStyle = '#120e2b'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, 7);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `900 30px ${FONT}`; g.fillStyle = '#fff'; g.fillText(`${cfg.building.name} 그룹 현황`, 26, 44);
  Object.entries(cfg.companies).forEach(([k, co], i) => { const list = HQ.staff.filter(s => s.company === k && !s.human), busy = list.filter(s => HQ.stat(s.id).busy).length, y = 96 + i * 100;
    g.fillStyle = '#1d1740'; g.fillRect(26, y, w - 52, 82); g.fillStyle = co.color; g.fillRect(26, y, 8, 82); g.font = `800 28px ${FONT}`; g.fillStyle = '#f1ecff'; g.textAlign = 'left'; g.fillText(co.name, 52, y + 28);
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(52, y + 54, 420, 10); g.fillStyle = co.color; g.fillRect(52, y + 54, 420 * (list.length ? busy / list.length : 0), 10);
    g.textAlign = 'right'; g.font = `900 40px ${FONT}`; g.fillStyle = busy ? '#39e58c' : '#8f88b3'; g.fillText(`${busy}/${list.length}`, w - 44, y + 42); });
  pavBoard.tex.needsUpdate = true;
}
// 모니터: 자리에 앉아 일하면 반드시 켜진다(사람이 자리에 있으면 대기 화면)
function drawScreens(t) {
  for (const s of HQ.staff) { const sc = screens[s.id], p = people[s.id]; if (!sc) continue; const seated = p.pose === 'seat' && !p.away, st = p.stat || {}, lvl = !seated ? 0 : st.busy ? 2 : 1;
    if (lvl === 0 && sc.on === 0) continue; sc.on = lvl; const g = sc.canvas.getContext('2d'), w = 192, h = 120;
    g.fillStyle = lvl === 2 ? '#16285a' : lvl === 1 ? '#111a38' : '#07070f'; g.fillRect(0, 0, w, h);
    if (lvl === 2) { g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, 0, w, 12);
      for (let i = 0; i < 7; i++) { const ph = (t * 0.0012 + sc.seed + i * 0.7) % 1, bw = 30 + ((Math.sin(sc.seed * 3 + i * 1.7 + Math.floor(t / 400)) + 1) / 2) * (w - 60);
        g.fillStyle = i % 3 === 0 ? sc.color : 'rgba(235,240,255,.9)'; g.fillRect(12, 20 + i * 13, bw * (i === 6 ? ph : 1), 6); } g.fillStyle = '#fff'; if (Math.floor(t / 420) % 2) g.fillRect(14 + ((t / 500) % 1) * (w - 40), 111, 8, 4); }
    else if (lvl === 1) { g.fillStyle = sc.color; g.globalAlpha = 0.55; g.fillRect(w / 2 - 34, h / 2 - 3, 68, 6); g.globalAlpha = 1; }
    else { g.fillStyle = '#1a1a2a'; g.fillRect(w / 2 - 5, h / 2 - 5, 10, 10); }
    sc.tex.needsUpdate = true; }
}

// ---------- 카페: 자리에서 일하던 사람이 수시로 음료를 사 와 자리에서 마신다 ----------
function setDrink(p, kind) {
  p.drink = kind; HQ.drinks[p.id] = kind; const d = deskOf[p.id]; if (!d) return;
  if (p.cup) p.cup.parent.remove(p.cup); if (p.carry) scene.remove(p.carry);
  p.cup = outdoor.makeCup(kind); p.cup.scale.setScalar(1.25); p.cup.position.set(d.x + d.kbx + 0.52, 0.775, d.z - d.dp * 0.02); (F[p.s.floor].g).add(p.cup);
  p.carry = outdoor.makeCup(kind); p.carry.scale.setScalar(1.35); p.carry.visible = false; scene.add(p.carry);
}
let cafeAt = 0, cafeKey = '';
function cafeTick(now) {
  if (now - cafeAt < 900) return; cafeAt = now;
  { const cn = {}; for (const s of HQ.staff) { const e = people[s.id].errand; if (e && e.stage !== 'back') cn[s.id] = e.stage; } const k = JSON.stringify(cn); if (k !== cafeKey) { cafeKey = k; HQ.cafeNow = cn; if (mode.floor === CAFN || mode.floor == null) HQ.refresh && HQ.refresh(); } }   // 카페 이용 현황(패널용)
  for (const s of HQ.staff) { const p = people[s.id];
    if (p.errand) { if (p.errand.stage === 'wait' && now > p.errand.until) { setDrink(p, outdoor.DRINK_KINDS[Math.floor(Math.random() * outdoor.DRINK_KINDS.length)]); p.errand.slot.user = null; p.errand.stage = 'back'; p.go(deskAnchor(s)); } continue; }
    if (p.pose !== 'seat' || p.away || p.route.length || now < p.nextCafe || !p.stat || p.stat.place !== 'desk' || !deskOf[s.id]) continue;
    if (HQ.staff.filter(x => people[x.id].errand).length >= 2) continue;   // 자리를 비우는 사람은 동시에 2명까지만(일하는 모습이 보이게)
    const i = outdoor.cafeSpots.findIndex(sp => !sp.user); if (i < 0) continue;
    outdoor.cafeSpots[i].user = s.id; p.errand = { stage: 'go', slot: outdoor.cafeSpots[i] }; p.sipT = 0; p.go(cafeAnchor(i)); }
}

// ---------- 배드민턴 랠리 ----------
const COURT = { L: { x0: -13.3, x1: -8.4 }, R: { x0: -6.6, x1: -1.7 } };
let rally = { state: 'idle', wait: 1 };
function rallyStep(dt, now) {
  const on = HQ.staff.map(s => people[s.id]).filter(p => p.floor === 1 && p.anchor && p.anchor.act === 'court' && !p.route.length && !p.away);
  for (const p of on) { const tg = p.courtT || p.anchor.home, dx = tg.x - p.pos.x, dz = tg.z - p.pos.z, d = Math.hypot(dx, dz); if (d > 0.02) { const st = Math.min(d, 3.6 * dt); p.pos.x += dx / d * st; p.pos.z += dz / d * st; } }
  const Ls = on.filter(p => p.anchor.court === 'L'), Rs = on.filter(p => p.anchor.court === 'R');
  if (!Ls.length || !Rs.length) {   // 상대가 없으면 빈 스윙 연습
    shuttle.visible = false; rally = { state: 'idle', wait: 1 };
    for (const p of on) { p.courtT = null; if (now - (p.lastSwing || 0) > 2400 + hashN(p.id) % 1600) { p.swingAt = now + 300; p.lastSwing = now; } }
    return;
  }
  const launch = (from, delay) => {
    const side = from.anchor.court === 'L' ? 'R' : 'L', list = side === 'L' ? Ls : Rs, b = COURT[side];
    const tx = b.x0 + 0.5 + Math.random() * (b.x1 - b.x0 - 1.0), tz = -2.1 + Math.random() * 4.2;
    const rec = list.reduce((a, p) => Math.hypot(p.pos.x - tx, p.pos.z - tz) < Math.hypot(a.pos.x - tx, a.pos.z - tz) ? p : a);
    const dur = 1.15 + Math.random() * 0.5;
    for (const p of list) p.courtT = p === rec ? { x: tx + (side === 'L' ? -0.3 : 0.3), z: tz } : null;
    for (const p of (side === 'L' ? Rs : Ls)) p.courtT = null;
    rec.swingAt = now + (delay + dur) * 1000;
    rally = { state: 'fly', t: -delay, dur, from, to: rec, tx, tz, peak: 1.9 + Math.random() * 1.5, sx: 0, sz: 0, set: false };
  };
  if (rally.state === 'idle') { rally.wait -= dt; shuttle.visible = false; if (rally.wait <= 0) { const from = on[Math.floor(Math.random() * on.length)]; from.swingAt = now + 320; launch(from, 0.32); } return; }
  if (rally.state === 'drop') { rally.wait -= dt; if (rally.wait <= 0) rally = { state: 'idle', wait: 0.9 }; return; }
  if (!on.includes(rally.from) || !on.includes(rally.to)) { rally = { state: 'idle', wait: 0.6 }; return; }
  rally.t += dt; if (rally.t < 0) { shuttle.visible = false; return; }
  if (!rally.set) { rally.set = true; rally.sx = rally.from.pos.x + (rally.from.anchor.court === 'L' ? 0.55 : -0.55); rally.sz = rally.from.pos.z; }
  const k = Math.min(1, rally.t / rally.dur), x = rally.sx + (rally.tx - rally.sx) * k, z = rally.sz + (rally.tz - rally.sz) * k, y = 2.35 + (2.1 - 2.35) * k + Math.sin(k * Math.PI) * rally.peak;
  shuttle.visible = true; shuttle.position.set(x, y, z); const right = rally.tx > rally.sx; shuttle.rotation.y = right ? 0 : Math.PI; shuttle.rotation.z = (0.5 - k) * 1.3 * (right ? 1 : -1);
  if (k >= 1) { const rec = rally.to, reach = Math.hypot(rec.pos.x - rally.tx, rec.pos.z - rally.tz);
    if (reach < 0.9) launch(rec, 0);                                     // 받아넘김
    else { shuttle.position.y = 0.1; rally = { state: 'drop', wait: 1.3 }; for (const p of on) p.courtT = null; } }   // 놓침 → 다시 서브
}

// ---------- 보기 전환·카메라 ----------
const mode = { floor: null };
let camTween = null, hoverFloor = null, userAt = 0;
function insets() {
  const w = el.clientWidth, h = el.clientHeight, cards = Number(document.body.dataset.cards || 3) > 0, panel = !document.body.classList.contains('hide-panel');
  if (w <= 980) { const sheet = !panel ? 16 : document.body.classList.contains('sheet-min') ? 84 : h * 0.4 + 8; return { l: 0, r: 56, t: cards ? 150 : 60, b: sheet, w, h }; }
  const cs = getComputedStyle(document.documentElement), L = parseFloat(cs.getPropertyValue('--L')) || 308, R = parseFloat(cs.getPropertyValue('--R')) || 348;
  return { l: mode.floor == null && cards ? L + 28 : 20, r: panel ? R + 100 : 92, t: 64, b: 10, w, h };
}
function applyView() {
  const i = insets(); camera.aspect = i.w / i.h;
  camera.setViewOffset(i.w, i.h, (i.r - i.l) / 2, (i.b - i.t) / 2, i.w, i.h); camera.updateProjectionMatrix();
  // 빈 영역(패널에 가리지 않는 곳)이 전체 세로 화각에서 차지하는 비율 — 가로·세로
  return { fw: Math.max(120, i.w - i.l - i.r) / i.h, fh: Math.max(120, i.h - i.t - i.b) / i.h };
}
function camFor(n) {
  const v = applyView(), tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let tgt, pos, need;
  if (n == null) { const top = floorY(NS.length + 1) + 5.5; tgt = new THREE.Vector3(1.4, top / 2 - 2.6, 3); pos = new THREE.Vector3(19, top / 2 + 7.5, 64); need = Math.max(25.5 / (tan * v.fw), (top / 2 + 3.2) / (tan * v.fh)); }
  else if (n === LOTN) { tgt = new THREE.Vector3(-5, 0.4, 16.5); pos = new THREE.Vector3(-1, 17, 46); need = Math.max(27 / (tan * v.fw), 12 / (tan * v.fh)); }
  else if (n === CAFN) { const C = outdoor.CAF, cx = (C.x0 + C.x1) / 2; tgt = new THREE.Vector3(cx, 0.9, 0.2); pos = new THREE.Vector3(cx + 0.6, 11.5, 15.2); need = Math.max(6.9 / (tan * v.fw), 6.6 / (tan * v.fh)); }   // 카페 안
  else if (n === RN) { const y = floorY(n); tgt = new THREE.Vector3(-1.5, y + 1.2, -0.3); pos = new THREE.Vector3(0.5, y + 10.5, 17); need = Math.max(14.5 / (tan * v.fw), 7.5 / (tan * v.fh)); }
  else if (n === 1) { tgt = new THREE.Vector3(4.6, 0.6, -0.9); pos = new THREE.Vector3(4.8, 17.5, 20.5); need = Math.max(20.6 / (tan * v.fw), 9.8 / (tan * v.fh)); }   // 1층은 오른쪽 카페까지
  else { const y = floorY(n); tgt = new THREE.Vector3(-0.2, y + 0.6, -0.9); pos = new THREE.Vector3(0, y + 15.5, 18.5); need = Math.max(15.7 / (tan * v.fw), 9.6 / (tan * v.fh)); }
  const dir = pos.clone().sub(tgt), d0 = dir.length(); return { tgt, pos: tgt.clone().add(dir.multiplyScalar(Math.max(1, need / d0))) };
}
function goCam(c, dur = 1100) { camTween = { from: camera.position.clone(), to: c.pos, tf: controls.target.clone(), tt: c.tgt, t0: performance.now(), dur }; }
function setMode(n, instant) {
  mode.floor = n; const inside = n != null && n !== LOTN && n !== RN && n !== CAFN;
  for (const m of NS) { const f = F[m]; f.liftT = inside && m > n ? 46 : 0; f.shell.visible = n !== m; f.ceil.visible = n !== m; }
  roofS.liftT = inside ? 46 : 0; totem.visible = n == null || n === LOTN; pavRoof.visible = n !== RN; outdoor.setLabels(n === LOTN); outdoor.cafeRoof.visible = n !== 1 && n !== CAFN; shadowDirty = 60;
  controls.maxPolarAngle = n == null ? 1.53 : n === LOTN ? 1.5 : 1.36; controls.minDistance = n == null ? 7 : 2.4; controls.maxDistance = n == null ? 240 : 160;
  hoverFloor = null; drawTotem(); renderer.domElement.style.cursor = '';
  if (n === CAFN) { focusLight.position.set(20, 8.5, 5); focusLight.intensity = 9; } else if (n === RN && RN) { focusLight.position.set(-2, floorY(n) + 8, 6); focusLight.intensity = 10; } else if (inside) { focusLight.position.set(-1, floorY(n) + 9, 6); focusLight.intensity = 14; } else focusLight.intensity = 0;
  goCam(camFor(n), instant ? 0 : 1100);
}
function focusPerson(id) {
  const p = people[id]; if (!p) return; const y = baseY(p.floor);
  if (p.away) return goCam(camFor(p.vehKind === 'heli' ? RN : LOTN), 800);
  goCam({ tgt: new THREE.Vector3(p.pos.x, y + 1.0, p.pos.z), pos: new THREE.Vector3(p.pos.x + 2.6, y + 3.4, p.pos.z + 7.2) }, 800);
}
function focusVehicle(v) {   // 차·헬기를 누르면 가까이 본다
  const heli = v === outdoor.heli, want = heli ? RN : LOTN;
  if (v.g.visible) { if (mode.floor !== want) HQ.focusFloor(want); setTimeout(() => goCam(heli ? v.view(floorY(RN)) : v.view(), 900), 90); }
  if (v.owner && HQ.showCar) setTimeout(() => HQ.showCar(v.owner, v.state), 130);   // 임원 차량은 정보 카드도 띄운다
}
HQ.on('mode', n => setMode(n)); HQ.on('vehicle', id => { const v = outdoor.exec[id]; if (v) focusVehicle(v); }); HQ.on('select', id => setTimeout(() => focusPerson(id), 80)); HQ.on('data', applyData); HQ.on('layout', () => goCam(camFor(mode.floor), 450));

// ---------- 마우스 ----------
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = document.getElementById('tip'); let down = null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, camera);
  if (mode.floor == null || mode.floor === LOTN || mode.floor === RN) { const vh = ray.intersectObjects(outdoor.hits.filter(h => h.userData.car ? h.userData.car.g.visible : (roof.visible && outdoor.heli.g.visible && mode.floor !== LOTN)), false)[0]; if (vh) return { veh: vh.object.userData.car || vh.object.userData.heli }; }
  if (mode.floor == null) { const hit = ray.intersectObjects([...(pavHit ? [pavHit] : []), outdoor.cafeHit, ...NS.map(n => F[n].hit), ...NS.map(n => totemSeg[n].mesh)], false)[0]; return hit ? { floor: hit.object.userData.floor } : null; }
  const onFloor = p => p.sp.visible && (p.floor === mode.floor || (mode.floor === LOTN && p.floor === 0) || (mode.floor === CAFN && p.floor === 1 && p.pos.x > 14.6));
  const hit = ray.intersectObjects(HQ.staff.map(s => people[s.id]).filter(onFloor).map(p => p.sp), false)[0]; if (hit) return { id: hit.object.userData.id };
  if (mode.floor === 1 || mode.floor === LOTN) { const ch = ray.intersectObject(outdoor.cafeHit, false)[0]; if (ch) return { floor: CAFN }; }   // 1층·주차장 보기에서 카페를 누르면 카페 안으로
  return null;
}
renderer.domElement.addEventListener('pointermove', e => {
  if (down) return; const h = pick(e); let html = '';
  if (h && h.floor) { const fd = FLOORS[h.floor], here = HQ.staff.filter(s => HQ.stat(s.id).floorNow === h.floor), busy = here.filter(s => HQ.stat(s.id).busy).length; html = `<b>${esc(flabel(h.floor))} ${esc(fd.title)}</b><span>${h.floor === CAFN ? `이용 ${Object.keys(HQ.cafeNow || {}).length}명` : h.floor === RN ? `대표 ${esc(cfg.building.ceo || '')}` : h.floor === 1 ? `운동 ${here.length}명` : `근무 ${busy}/${here.filter(s => !s.human).length}`} · 눌러서 들어가기</span>`; }
  if (h && h.id) { const s = HQ.byId[h.id], st = HQ.stat(h.id); html = `<b>${esc(s.name)}</b><span>${esc(KO[st.state] || st.state)}${st.note ? ' · ' + esc(st.note.slice(0, 40)) : ''}</span>`; }
  if (h && h.veh) html = `<b>${esc(h.veh.name || '')}</b><span>${h.veh.state === 'parked' ? '주차 중' : '이동 중'} · 눌러서 확대</span>`;
  const hf = h && h.floor ? h.floor : null; if (hf !== hoverFloor) { hoverFloor = hf; drawTotem(); }
  renderer.domElement.style.cursor = h ? 'pointer' : ''; tip.hidden = !html; if (html) { tip.innerHTML = html; tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; }
});
renderer.domElement.addEventListener('pointerleave', () => { tip.hidden = true; if (hoverFloor != null) { hoverFloor = null; drawTotem(); } });
renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; userAt = performance.now(); tip.hidden = true; });
renderer.domElement.addEventListener('pointerup', e => {
  const d = down; down = null; if (!d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 6) return;
  const h = pick(e); if (h && h.veh) focusVehicle(h.veh); else if (h && h.floor) HQ.focusFloor(h.floor); else if (h && h.id) HQ.selectStaff(h.id);
});
renderer.domElement.addEventListener('wheel', () => { userAt = performance.now(); }, { passive: true });

// ---------- 크기·루프 ----------
let lastW = 0, lastH = 0;
function resize() {   // 화면 크기가 실제로 바뀐 때에만 구도를 다시 잡는다(해상도 자동 조절 때는 카메라를 건드리지 않는다)
  const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); { const pr = renderer.getPixelRatio(); bloom.setSize(Math.round(w * pr / 2), Math.round(h * pr / 2)); }
  if (w !== lastW || h !== lastH) { const first = !lastW; lastW = w; lastH = h; const c = camFor(mode.floor); if (first) { camera.position.copy(c.pos); controls.target.copy(c.tgt); } else goCam(c, 350); } else applyView();
}
new ResizeObserver(resize).observe(el);
new MutationObserver(() => { goCam(camFor(mode.floor), 400); }).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-cards'] });
applyData(); for (const s of HQ.staff) { const p = people[s.id]; if (p.pose === 'seat' && deskOf[s.id] && hashN(s.id + 'd') % 100 < 55) setDrink(p, outdoor.DRINK_KINDS[hashN(s.id) % outdoor.DRINK_KINDS.length]); }
setMode(null, true); resize(); { const c = camFor(null); camera.position.copy(c.pos); controls.target.copy(c.tgt); camTween = null; }

let last = performance.now(), scrAt = 0, brdAt = 0, swayT = 0, swayK = 0, swayApplied = 0, shadowAt = 0;
let dpr = renderer.getPixelRatio(), fAcc = 0, fCnt = 0, dprAt = 0, dprDownAt = -1e9; const DPR_MAX = Math.min(devicePixelRatio, 2);
const yAxis = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3();
function liftStep(o, grp, base, dt) { o.lift += (o.liftT - o.lift) * Math.min(1, dt * 4.5); if (Math.abs(o.liftT - o.lift) < 0.02) o.lift = o.liftT; grp.position.y = base + o.lift; grp.visible = o.lift < 40; }
function frame(now) {
  const rawDt = (now - last) / 1000, dt = Math.min(0.05, rawDt); last = now;
  // 화면이 버거우면 해상도를 한 단계 낮추고, 여유가 생기면 되돌린다(회전 끊김 방지)
  if (rawDt < 0.2) { fAcc += rawDt; fCnt++; }
  if (fCnt >= 50) { const avg = fAcc / fCnt; fAcc = 0; fCnt = 0;
    if (now - dprAt > 2500) { if (avg > 0.023 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); dprDownAt = now; dprAt = now; renderer.setPixelRatio(dpr); resize(); } else if (avg < 0.0125 && dpr < DPR_MAX && now - dprDownAt > 30000) { dpr = Math.min(DPR_MAX, dpr + 0.25); dprAt = now; renderer.setPixelRatio(dpr); resize(); } } }
  if (camTween) { const k = camTween.dur ? Math.min(1, (now - camTween.t0) / camTween.dur) : 1, e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(camTween.from, camTween.to, e); controls.target.lerpVectors(camTween.tf, camTween.tt, e); if (k >= 1) camTween = null; }
  for (const n of NS) liftStep(F[n], F[n].g, floorY(n), dt);
  liftStep(roofS, roof, floorY(NS.length + 1), dt);
  // 건물 전체 보기: 천천히 좌우로 도는 카메라(손대면 잠시 멈춤)
  { const idle = mode.floor == null && !camTween && now - userAt > 4500; swayK += ((idle ? 1 : 0) - swayK) * Math.min(1, dt * 0.9); swayT += dt * swayK;
    const want = 0.3 * Math.sin(swayT * 0.11) + 0.03 * Math.sin(swayT * 0.31), d = (want - swayApplied) * swayK; swayApplied += d;
    if (Math.abs(d) > 1e-6) { tmpV.copy(camera.position).sub(controls.target).applyAxisAngle(yAxis, d); camera.position.copy(controls.target).add(tmpV); } }
  if (shuttle) rallyStep(dt, now);
  let nearDoor = false;
  for (const s of HQ.staff) { const p = people[s.id]; p.update(dt, now); if (!nearDoor && p.route.length && !p.away && p.floor <= 1 && Math.hypot(p.pos.x - LOT.DOOR_X, p.pos.z - 7.6) < 2.6) nearDoor = true; }
  outdoor.update(dt, now, nearDoor); cafeTick(now);
  // 그림자는 움직이는 것이 있을 때만 다시 계산한다
  if (outdoor.anyMoving || NS.some(n => F[n].lift !== F[n].liftT) || roofS.lift !== roofS.liftT) shadowDirty = 3;
  if (shadowDirty > 0 || now - shadowAt > 2500) { renderer.shadowMap.needsUpdate = true; shadowDirty--; shadowAt = now; }
  // 엘리베이터 문
  for (const n of NS) { const f = F[n]; let open = 0; for (const s of HQ.staff) { const p = people[s.id]; if (p.floor === n && p.route.length && Math.hypot(p.pos.x - ELEV.x, p.pos.z - ELEV.z) < 2.3) { open = 1; break; } }
    f.door = (f.door || 0) + (open - (f.door || 0)) * Math.min(1, dt * 6); f.doorL.position.x = ELEV.x - 0.42 - f.door * 0.72; f.doorR.position.x = ELEV.x + 0.42 + f.door * 0.72;
    const pulse = 1 + (f.busy > 0 ? 0.25 * Math.sin(now / 420 + n) : 0); f.leds[0].material.color.copy(f.col).multiplyScalar((hoverFloor === n ? 3.4 : 2.3) * pulse); }
  if (F[1].belts) { const run = HQ.staff.some(s => { const p = people[s.id]; return p.pose === 'sport' && p.act === 'tread'; }); for (const b of F[1].belts) b.offset.x += dt * (run ? 2.4 : 0.25); }
  beacon.material.color.setHex(0xff3b4e).multiplyScalar(Math.sin(now / 500) > 0.3 ? 3.2 : 0.4);
  if (now - scrAt > 140) { scrAt = now; drawScreens(now); drawRack(now); }
  if (now - brdAt > 15000) { brdAt = now; drawBoards(); }
  controls.update(); composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(now => { frame(now); document.getElementById('loading').classList.add('gone'); });
window.HQ3D = { people, F, camera, controls, mode, outdoor, renderer, composer, bloom, scene };
