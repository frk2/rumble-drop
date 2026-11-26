// Rumble Drop rendering: the well, the blocks, and every effect.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COLS, ROWS, HIDDEN, ROTATIONS, pieceCells } from './logic.js';

export const PALETTE = {
  I: 0xff4fa3, // bubblegum
  O: 0x7cff6b, // lime
  T: 0x3fd8ff, // sky
  S: 0xff9f1c, // tangerine
  Z: 0xb86bff, // grape
  J: 0xffe347, // lemon
  L: 0xff5a5a, // watermelon
};

const KIND_COLOR = {};
for (const k in PALETTE) KIND_COLOR[k] = new THREE.Color(PALETTE[k]);

// Board cell to world position. Visible rows sit between y=0 and y=20.
export function cellToWorld(x, y, out = new THREE.Vector3()) {
  return out.set(x - COLS / 2 + 0.5, ROWS - 1 - y + 0.5, 0);
}

const FRAME_WIDTH = COLS + 0.7;
const VIEW_WIDTH = 11.6; // Room for the previews and neon trim on narrow screens.
const VIEW_BOTTOM = -0.7;
const PREVIEW_Y = ROWS + 1.2;
const HOLD_X = -4.1;
const NEXT_SLOTS = [-0.7, 1.75, 4.05];
const VIEW_TOP = PREVIEW_Y + 1.15;
const VIEW_HEIGHT = VIEW_TOP - VIEW_BOTTOM;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function glowMaterial(opts) {
  const m = new THREE.MeshStandardMaterial(opts);
  m.userData.glow = { value: 0.22 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = m.userData.glow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uGlow + max(diffuseColor.rgb - 1.0, 0.0) * 1.5;'
      );
  };
  return m;
}

function bevelTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, s, s);
  const inner = g.createRadialGradient(s * 0.35, s * 0.3, 4, s / 2, s / 2, s * 0.75);
  inner.addColorStop(0, 'rgba(255,255,255,1)');
  inner.addColorStop(1, 'rgba(170,170,190,1)');
  g.fillStyle = inner;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 10;
  g.strokeRect(12, 12, s - 24, s - 24);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.ellipse(s * 0.33, s * 0.28, s * 0.14, s * 0.07, -0.5, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Ghost piece: bright rim, nearly empty middle.
function ghostTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.strokeRect(5, 5, s - 10, s - 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function softDotTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = '800 44px ui-rounded, "Arial Rounded MT", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(255,120,220,0.9)';
  g.shadowBlur = 12;
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sp.scale.set(3.2, 0.8, 1);
  return sp;
}

// ---------- particles (sparks, confetti, fireworks) ----------
class Sparks {
  constructor(scene, max = 4000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 100);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uMap: { value: softDotTexture() } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha; uniform float uScale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor * 1.25, a * 0.85);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, color, { life = 0.8, size = 0.35, grav = -9, drag = 1.5 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.baseSize[i] = size;
  }

  burst(x, y, z, count, color, { speed = 6, spread = 1, up = 2, ...rest } = {}) {
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(Math.random() * 2 - 1);
      const s = speed * (0.35 + Math.random() * 0.65);
      const c = color.isColor ? color : color();
      this.emit(
        x + (Math.random() - 0.5) * spread,
        y + (Math.random() - 0.5) * spread * 0.5,
        z,
        Math.sin(b) * Math.cos(a) * s,
        Math.cos(b) * s + up,
        Math.sin(b) * Math.sin(a) * s * 0.6,
        c,
        { ...rest, life: (rest.life ?? 0.8) * (0.6 + Math.random() * 0.6) }
      );
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, k * 1.6);
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * k);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
  }
}

// ---------- flying cube debris ----------
class Debris {
  constructor(scene, geometry, material, max = 420) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: max }, () => ({
      alive: false,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      r: new THREE.Euler(),
      w: new THREE.Vector3(),
      life: 0,
      max: 1,
      wait: 0,
      color: new THREE.Color(),
      flash: new THREE.Color(),
    }));
    this.cursor = 0;
    this.dummy = new THREE.Object3D();
    this.tmp = new THREE.Color();
    this.white = new THREE.Color(1.5, 1.5, 1.6);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, this.tmp.set(0, 0, 0));
    scene.add(this.mesh);
  }

  spawn(pos, vel, color, { life = 1.4, wait = 0, flash = null } = {}) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    it.alive = true;
    it.p.copy(pos);
    it.v.copy(vel);
    it.r.set(0, 0, 0);
    it.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    it.life = life;
    it.max = life;
    it.wait = wait;
    it.color.copy(color);
    it.flash.copy(flash ?? color);
  }

  update(dt, timeScale) {
    const d = this.dummy;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      if (!it.alive) {
        d.scale.setScalar(0);
        d.position.set(0, -100, 0);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      let s = 1;
      if (it.wait > 0) {
        // Hold in place and glow before bursting.
        it.wait -= dt;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.05);
        this.tmp.copy(it.flash).lerp(this.white, 0.35 + 0.35 * pulse);
        s = 1 + 0.08 * pulse;
      } else {
        const sdt = dt * timeScale;
        it.life -= sdt;
        if (it.life <= 0) {
          it.alive = false;
          continue;
        }
        it.v.y -= 22 * sdt;
        it.v.multiplyScalar(Math.exp(-0.6 * sdt));
        it.p.addScaledVector(it.v, sdt);
        it.r.x += it.w.x * sdt;
        it.r.y += it.w.y * sdt;
        it.r.z += it.w.z * sdt;
        const k = it.life / it.max;
        s = k < 0.5 ? k * 2 : 1;
        this.tmp.copy(it.color).multiplyScalar(1 + 0.5 * k * k);
      }
      d.position.copy(it.p);
      d.rotation.copy(it.r);
      d.scale.setScalar(s * 0.9);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.mesh.setColorAt(i, this.tmp);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- the whole scene ----------
export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
    this.center = new THREE.Vector3(0, (VIEW_TOP + VIEW_BOTTOM) / 2, 0);
    this.tanHalfFov = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);

    this.time = 0;
    this.trauma = 0;
    this.punch = 0;
    this.roll = 0;
    this.rainbow = 0;
    this.slowmo = 0;
    this.bgPulse = 0;
    this.danger = 0;
    this.hue = 0;
    this.impacts = [];
    this.squash = new Map();
    this.rowDrop = new Float32Array(ROWS);
    this.rowDropDelay = 0;
    this.flashRows = [];

    this.buildBackground();
    this.buildWell();
    this.buildBlocks();
    this.buildPreviews();
    this.sparks = new Sparks(this.scene);
    this.debris = new Debris(this.scene, this.blockGeo, this.debrisMat);
    this.buildRings();
    this.buildStreaks();
    this.buildBeams();
    this.buildLights();

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 0.7);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  buildBackground() {
    const geo = new THREE.PlaneGeometry(260, 200);
    this.bgUniforms = {
      uTime: { value: 0 },
      uHue: { value: 0 },
      uPulse: { value: 0 },
      uRainbow: { value: 0 },
      uDanger: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.bgUniforms,
      depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime, uHue, uPulse, uRainbow, uDanger;
        vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); return v*mix(vec3(1.),k,s); }
        float blob(vec2 p, vec2 c, float r){ return smoothstep(r, 0.0, length(p - c)); }
        void main(){
          vec2 p = vUv * vec2(1.3, 1.0);
          float t = uTime * 0.07;
          vec3 base = mix(hsv(0.72 + uHue, 0.8, 0.05), hsv(0.80 + uHue, 0.75, 0.11), vUv.y);
          vec3 c = base;
          c += hsv(0.92 + uHue, 0.85, 0.20) * blob(p, vec2(0.35 + 0.15*sin(t*2.1), 0.65 + 0.1*cos(t*1.7)), 0.45);
          c += hsv(0.55 + uHue, 0.85, 0.16) * blob(p, vec2(0.95 + 0.12*cos(t*1.3), 0.35 + 0.15*sin(t*1.9)), 0.5);
          c += hsv(0.12 + uHue, 0.85, 0.10) * blob(p, vec2(0.65 + 0.2*sin(t*0.9), 0.1 + 0.1*sin(t*2.3)), 0.4);
          float stripes = 0.5 + 0.5 * sin((vUv.x * 6.0 + vUv.y * 3.0) * 6.2831 - uTime * 0.6);
          c += hsv(fract(vUv.x * 0.8 + vUv.y * 0.6 - uTime * 0.4), 0.9, 0.9) * uRainbow * (0.35 + 0.25 * stripes);
          c += hsv(0.88 + uHue, 0.6, 1.0) * uPulse * 0.14;
          c = mix(c, c * vec3(1.6, 0.45, 0.5) + vec3(0.12, 0.0, 0.02), uDanger * (0.55 + 0.45 * sin(uTime * 5.0)));
          float vig = smoothstep(1.2, 0.2, length(vUv - 0.5) * 1.6);
          gl_FragColor = vec4(c * (0.55 + 0.45 * vig), 1.0);
        }`,
    });
    const bg = new THREE.Mesh(geo, mat);
    bg.position.set(0, 10, -60);
    bg.renderOrder = -10;
    this.scene.add(bg);

    // Floating star dust behind the well.
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 70 - 25;
      pos[i * 3 + 2] = -10 - Math.random() * 40;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        size: 0.35,
        map: softDotTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: 0xffd6ff,
        opacity: 0.7,
      })
    );
    this.scene.add(this.stars);
  }

  buildWell() {
    const g = new THREE.Group();
    // Glassy back panel.
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS + 0.3, 20.3),
      new THREE.MeshBasicMaterial({ color: 0x0c0520, transparent: true, opacity: 0.88 })
    );
    back.position.set(0, 10, -0.55);
    g.add(back);
    // Faint grid.
    const pts = [];
    for (let x = 0; x <= COLS; x++) pts.push(x - COLS / 2, 0, -0.5, x - COLS / 2, 20, -0.5);
    for (let y = 0; y <= 20; y++) pts.push(-COLS / 2, y, -0.5, COLS / 2, y, -0.5);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8a6cff, transparent: true, opacity: 0.22 }));
    g.add(this.grid);
    // Neon frame.
    this.frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.5, 1.8) });
    const bar = (w, h, x, y) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.4, 2, 0.12), this.frameMat);
      m.position.set(x, y, 0);
      g.add(m);
    };
    bar(0.3, 20.9, -COLS / 2 - 0.2, 10.1);
    bar(0.3, 20.9, COLS / 2 + 0.2, 10.1);
    bar(FRAME_WIDTH, 0.3, 0, -0.2);
    this.scene.add(g);
  }

  buildPreviews() {
    this.previewRow = new THREE.Group();
    this.previewRow.position.y = PREVIEW_Y;
    this.scene.add(this.previewRow);

    const panelMat = new THREE.MeshBasicMaterial({ color: 0x1d0f3d, transparent: true, opacity: 0.6 });
    const panel = (text, x, width) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.8), panelMat);
      m.position.set(x, 0, -0.55);
      const label = labelSprite(text);
      label.position.set(x, 0.55, 0);
      this.previewRow.add(m, label);
    };
    panel('HOLD', HOLD_X, 2.8);
    panel('NEXT', 1.65, 7.7);

    this.previews = new THREE.InstancedMesh(this.blockGeo, this.blockMat, 4 * 4);
    this.previews.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.previews.frustumCulled = false;
    this.previews.setColorAt(0, new THREE.Color());
    this.previewRow.add(this.previews);
  }

  buildBlocks() {
    this.blockGeo = new RoundedBoxGeometry(0.92, 0.92, 0.92, 2, 0.14);
    const map = bevelTexture();
    this.blockMat = glowMaterial({ map, roughness: 0.28, metalness: 0.08 });
    this.debrisMat = glowMaterial({ map, roughness: 0.3, metalness: 0.1 });
    this.debrisMat.userData.glow.value = 0.35;
    const max = COLS * ROWS + 4;
    this.blocks = new THREE.InstancedMesh(this.blockGeo, this.blockMat, max);
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blocks.frustumCulled = false;
    this.blocks.setColorAt(0, new THREE.Color());
    this.scene.add(this.blocks);
    this.ghostMat = new THREE.MeshBasicMaterial({
      map: ghostTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ghost = new THREE.InstancedMesh(this.blockGeo, this.ghostMat, 4);
    this.ghost.frustumCulled = false;
    this.ghost.setColorAt(0, new THREE.Color());
    this.scene.add(this.ghost);
    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();
    this.tmpV = new THREE.Vector3();
    this.activePos = new THREE.Vector3();
    this.activeKey = '';
  }

  buildRings() {
    this.rings = [];
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
      );
      m.visible = false;
      m.renderOrder = 9;
      this.scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, grow: 1, flat: false });
    }
    this.ringCursor = 0;
  }

  ring(pos, color, { size = 6, life = 0.5, flat = false, strength = 1 } = {}) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.mesh.position.copy(pos);
    r.mesh.material.color.copy(color).multiplyScalar(1.6 * strength);
    r.mesh.rotation.set(flat ? -Math.PI / 2.4 : 0, 0, 0);
    r.life = life;
    r.max = life;
    r.grow = size;
    r.mesh.visible = true;
  }

  buildStreaks() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    this.streaks = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      m.visible = false;
      m.renderOrder = 8;
      this.scene.add(m);
      this.streaks.push({ mesh: m, life: 0 });
    }
    this.streakCursor = 0;
  }

  buildBeams() {
    this.beams = [];
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      m.visible = false;
      m.renderOrder = 11;
      this.scene.add(m);
      this.beams.push({ mesh: m, life: 0, max: 1, delay: 0 });
    }
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a1450, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-8, 30, 25);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff7ad9, 1.0);
    rim.position.set(12, 5, 10);
    this.scene.add(rim);
    this.flashLight = new THREE.PointLight(0xffffff, 0, 30, 1.5);
    this.flashLight.position.set(0, 5, 5);
    this.scene.add(this.flashLight);
  }

  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    // A single scale keeps the cells square. Height usually limits the
    // 20-row well in portrait, but narrow phones can be width-limited.
    this.cellSize = Math.min(w / VIEW_WIDTH, h / VIEW_HEIGHT);
    this.baseDistance = h / (2 * this.tanHalfFov * this.cellSize);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.sparks.material.uniforms.uScale.value = (h * this.renderer.getPixelRatio()) / (2 * this.tanHalfFov);
  }

  // Screen pixels per board cell, used to map drag distance to moves.
  cellPixels() {
    return this.cellSize;
  }

  addTrauma(t) {
    this.trauma = Math.min(1.2, this.trauma + t * (reducedMotion ? 0.35 : 1));
  }

  // ---------- effects triggered by game events ----------
  slam(ev) {
    const color = KIND_COLOR[ev.kind];
    const power = Math.min(1, 0.35 + ev.distance / 16);
    this.addTrauma(0.22 + power * 0.35);
    this.punch = Math.max(this.punch, 0.35 * power);
    // Streak per column, from where the piece started to where it landed.
    const cols = new Map();
    ev.from.forEach(([x, y], i) => {
      const [, ty] = ev.to[i];
      const c = cols.get(x) ?? { top: Infinity, bottom: -Infinity };
      c.top = Math.min(c.top, y);
      c.bottom = Math.max(c.bottom, ty);
      cols.set(x, c);
    });
    for (const [x, c] of cols) {
      if (ev.distance < 1) break;
      const s = this.streaks[this.streakCursor];
      this.streakCursor = (this.streakCursor + 1) % this.streaks.length;
      const top = cellToWorld(x, c.top).y + 0.5;
      const bottom = cellToWorld(x, c.bottom).y - 0.4;
      s.mesh.position.set(cellToWorld(x, 0).x, (top + bottom) / 2, 0.2);
      s.mesh.scale.set(0.85, Math.max(0.5, top - bottom), 1);
      s.mesh.material.color.copy(color).multiplyScalar(1.6);
      s.mesh.material.opacity = 1;
      s.mesh.visible = true;
      s.life = 0.28;
    }
    // Dust and a shockwave at the landing spot.
    let lowY = -Infinity;
    let sumX = 0;
    for (const [x, y] of ev.to) {
      lowY = Math.max(lowY, y);
      sumX += x;
    }
    const impact = cellToWorld(sumX / 4, lowY);
    impact.y -= 0.5;
    this.ring(impact, color, { size: 3 + power * 4, life: 0.45, flat: true });
    const dust = new THREE.Color(1, 0.95, 1);
    for (const [x, y] of ev.to) {
      // Only the bottom cell of each column kicks up dust.
      if (ev.to.some(([x2, y2]) => x2 === x && y2 > y)) continue;
      const p = cellToWorld(x, y);
      this.sparks.burst(p.x, p.y - 0.45, 0.3, 10 + Math.round(power * 10), () => (Math.random() < 0.5 ? dust : color), {
        speed: 5 + power * 6,
        up: 2,
        life: 0.5,
        size: 0.32,
        grav: -14,
        spread: 0.9,
      });
    }
    for (const [x, y] of ev.to) this.squash.set(`${x},${y}`, this.time);
    this.impacts.push({ y: impact.y, x: impact.x, t: this.time, power });
    this.flashLight.color.copy(color);
    this.flashLight.position.set(impact.x, impact.y + 1, 3);
    this.flashLight.intensity = 60 * power;
  }

  land(cells, kind) {
    for (const [x, y] of cells) this.squash.set(`${x},${y}`, this.time - 0.08);
    const p = cellToWorld(cells[0][0], cells[0][1]);
    this.sparks.burst(p.x, p.y - 0.4, 0.3, 6, KIND_COLOR[kind], { speed: 3, up: 1, life: 0.35, size: 0.25 });
    this.addTrauma(0.06);
  }

  perfect(cells, kind) {
    const gold = new THREE.Color(1, 0.82, 0.3);
    const color = KIND_COLOR[kind];
    this.addTrauma(0.25);
    this.punch = Math.max(this.punch, 0.5);
    const c = new THREE.Vector3();
    for (const [x, y] of cells) {
      const p = cellToWorld(x, y);
      c.add(p);
      this.sparks.burst(p.x, p.y, 0.5, 22, () => (Math.random() < 0.6 ? gold : color), {
        speed: 9,
        up: 4,
        life: 0.9,
        size: 0.42,
        grav: -6,
        drag: 2,
      });
      this.squash.set(`${x},${y}`, this.time);
    }
    c.multiplyScalar(0.25);
    c.z = 0.6;
    this.ring(c, gold, { size: 9, life: 0.6 });
    setTimeout(() => this.ring(c, color, { size: 6, life: 0.5 }), 90);
    this.perfectGlow = { cells: new Set(cells.map(([x, y]) => `${x},${y}`)), t: this.time };
    this.flashLight.color.copy(gold);
    this.flashLight.position.copy(c).setZ(4);
    this.flashLight.intensity = 90;
  }

  clear(ev) {
    const n = ev.lines;
    const hold = 0.16 + n * 0.06;
    this.rowDropDelay = hold;
    // Rows above the cleared ones fall into place after the flash.
    const cleared = new Set(ev.rows);
    this.rowDrop.fill(0);
    let newY = ROWS - 1;
    for (let oldY = ROWS - 1; oldY >= 0; oldY--) {
      if (cleared.has(oldY)) continue;
      this.rowDrop[newY] = newY - oldY;
      newY--;
    }
    for (; newY >= 0; newY--) this.rowDrop[newY] = n;
    // Each cleared block flashes, then bursts out as a flying cube.
    const centerY = ev.rows.reduce((a, y) => a + cellToWorld(0, y).y, 0) / n;
    const power = [0, 0.8, 1.1, 1.45, 2][n];
    ev.rows.forEach((y, ri) => {
      ev.clearedRows[ri].forEach((kind, x) => {
        const p = cellToWorld(x, y);
        const color = KIND_COLOR[kind] ?? new THREE.Color(1, 1, 1);
        const dir = new THREE.Vector3(p.x * 0.9 + (Math.random() - 0.5) * 2, (p.y - centerY) * 0.8 + 6 + Math.random() * 6, 4 + Math.random() * 8);
        dir.multiplyScalar(power);
        this.debris.spawn(p, dir, color, { life: 1.1 + Math.random() * 0.6 + n * 0.2, wait: hold + x * 0.012 * (ri % 2 ? -1 : 1) + 0.06 });
      });
      const beam = this.beams[ri % this.beams.length];
      beam.mesh.position.set(0, cellToWorld(0, y).y, 0.7);
      beam.mesh.material.color.setHSL((this.time * 0.2 + ri * 0.15) % 1, 1, 0.55).multiplyScalar(0.8);
      beam.life = hold + 0.35;
      beam.max = beam.life;
      beam.mesh.visible = true;
    });
    // Sparks along each row once it bursts.
    const rows = ev.rows.map((y) => cellToWorld(0, y).y);
    const kinds = ev.clearedRows.flat().filter(Boolean);
    setTimeout(() => {
      for (const wy of rows) {
        for (let x = 0; x < COLS; x++) {
          const col = KIND_COLOR[kinds[(x * 7) % kinds.length]];
          this.sparks.burst(x - COLS / 2 + 0.5, wy, 0.5, 4 + n * 2, col, {
            speed: 6 + n * 3,
            up: 3,
            life: 0.9 + n * 0.15,
            size: 0.3 + n * 0.03,
            grav: -10,
          });
        }
      }
      this.ring(new THREE.Vector3(0, centerY, 0.8), new THREE.Color(0.55, 0.75, 1), { size: 7 + n * 3, life: 0.45 + n * 0.1, strength: 0.7 });
      if (n >= 2) setTimeout(() => this.ring(new THREE.Vector3(0, centerY, 0.8), new THREE.Color(1, 0.35, 0.8), { size: 6 + n * 3, life: 0.55, strength: 0.6 }), 120);
      this.addTrauma([0, 0.4, 0.55, 0.8, 1.15][n]);
      this.punch = Math.max(this.punch, [0, 0.4, 0.6, 0.9, 1.3][n]);
      this.bgPulse = Math.max(this.bgPulse, 0.4 + n * 0.25);
      this.flashLight.color.set(1, 1, 1);
      this.flashLight.position.set(0, centerY, 6);
      this.flashLight.intensity = 40 + n * 20;
    }, hold * 1000);

    if (n >= 3) {
      const shots = n === 4 ? 12 : 4;
      for (let i = 0; i < shots; i++) setTimeout(() => this.firework(), hold * 1000 + 150 + i * (n === 4 ? 170 : 220));
    }
    if (n === 4) {
      this.rainbow = 1;
      this.slowmo = 0.7;
      this.roll = 1;
      setTimeout(() => this.confetti(260), hold * 1000);
    }
    if (ev.combo >= 2) this.bgPulse = Math.max(this.bgPulse, 0.5);
    if (ev.allClear) setTimeout(() => this.confetti(200), 600);
  }

  firework() {
    const x = (Math.random() - 0.5) * 16;
    const y = 8 + Math.random() * 11;
    const hue = Math.random();
    const a = new THREE.Color().setHSL(hue, 1, 0.6);
    const b = new THREE.Color().setHSL((hue + 0.15) % 1, 1, 0.7);
    this.sparks.burst(x, y, 1.5, 110, () => (Math.random() < 0.5 ? a : b), {
      speed: 11,
      up: 0,
      spread: 0.2,
      life: 1.3,
      size: 0.45,
      grav: -4,
      drag: 1.8,
    });
    this.ring(new THREE.Vector3(x, y, 1.5), a, { size: 5, life: 0.5 });
    this.addTrauma(0.12);
  }

  confetti(count) {
    for (let i = 0; i < count; i++) {
      const c = new THREE.Color().setHSL(Math.random(), 1, 0.65);
      this.sparks.emit((Math.random() - 0.5) * 20, 22 + Math.random() * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, -2 - Math.random() * 4, 0, c, {
        life: 2.5 + Math.random() * 1.5,
        size: 0.35 + Math.random() * 0.25,
        grav: -2.5,
        drag: 0.6,
      });
    }
  }

  levelUp() {
    this.hue = (this.hue + 0.13) % 1;
    this.bgPulse = 1;
    this.confetti(80);
  }

  gameOver(board) {
    this.addTrauma(0.6);
    let i = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const k = board[y][x];
        if (!k) continue;
        const p = cellToWorld(x, y);
        const v = new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 8 + 2, Math.random() * 10);
        this.debris.spawn(p, v, KIND_COLOR[k], { life: 2.2, wait: 0.3 + (ROWS - y) * 0.04 });
        i++;
      }
    }
    this.hideBoard = true;
  }

  restart() {
    this.hideBoard = false;
    this.rowDrop.fill(0);
    this.squash.clear();
    this.impacts = [];
    this.rainbow = 0;
  }

  // ---------- per-frame drawing ----------
  render(dt, game, { showPiece = true, paused = false } = {}) {
    const realDt = dt;
    if (paused) dt = 0;
    this.time += dt;
    const t = this.time;

    // Decays.
    this.trauma = Math.max(0, this.trauma - realDt * 1.5);
    this.punch = Math.max(0, this.punch - dt * 2.2);
    this.roll = Math.max(0, this.roll - dt * 0.6);
    this.rainbow = Math.max(0, this.rainbow - dt * 0.45);
    this.slowmo = Math.max(0, this.slowmo - realDt);
    this.bgPulse = Math.max(0, this.bgPulse - dt * 1.6);
    this.flashLight.intensity *= Math.exp(-realDt * 7);
    if (this.rowDropDelay > 0) this.rowDropDelay -= dt;
    else for (let y = 0; y < ROWS; y++) this.rowDrop[y] = Math.max(0, this.rowDrop[y] - dt * (6 + this.rowDrop[y] * 8));

    // Stack height drives the danger glow.
    let top = ROWS;
    for (let y = 0; y < ROWS; y++) {
      if (game.board[y].some(Boolean)) {
        top = y;
        break;
      }
    }
    const height = ROWS - top;
    const targetDanger = height > 15 ? Math.min(1, (height - 15) / 4) : 0;
    this.danger += (targetDanger - this.danger) * Math.min(1, dt * 3);

    this.bgUniforms.uTime.value = t;
    this.bgUniforms.uHue.value = this.hue + Math.sin(t * 0.05) * 0.03;
    this.bgUniforms.uPulse.value = this.bgPulse;
    this.bgUniforms.uRainbow.value = this.rainbow;
    this.bgUniforms.uDanger.value = this.danger;
    this.stars.position.y = (t * 0.6) % 20 - 10;
    this.stars.rotation.z = Math.sin(t * 0.03) * 0.05;
    const fh = (t * 0.05 + this.rainbow * t * 0.8) % 1;
    this.frameMat.color.setHSL(0.83 + Math.sin(t * 0.7) * 0.06 + fh * this.rainbow, 1, 0.6).multiplyScalar(1.2 + this.bgPulse * 0.25);
    this.blockMat.userData.glow.value = 0.2 + this.bgPulse * 0.25 + this.rainbow * 0.2;

    this.drawBlocks(game, showPiece, dt);
    this.updateEffects(realDt, dt);
    this.updateCamera(realDt);
    this.composer.render(realDt);
  }

  drawBlocks(game, showPiece, dt) {
    const d = this.dummy;
    const m = this.blocks;
    let i = 0;
    const t = this.time;
    const p = this.tmpV;
    // Settle wobble after a slam.
    this.impacts = this.impacts.filter((im) => t - im.t < 0.8);
    const glow = this.perfectGlow && t - this.perfectGlow.t < 0.8 ? this.perfectGlow : null;
    if (!this.hideBoard) {
      for (let y = 0; y < ROWS; y++) {
        const row = game.board[y];
        for (let x = 0; x < COLS; x++) {
          const k = row[x];
          if (!k) continue;
          cellToWorld(x, y, p);
          p.y += this.rowDrop[y];
          let sx = 1;
          let sy = 1;
          for (const im of this.impacts) {
            const age = t - im.t;
            const fall = Math.exp(-Math.abs(p.y - im.y) * 0.35 - Math.abs(p.x - im.x) * 0.12);
            p.y -= im.power * 0.32 * fall * Math.sin(age * 28) * Math.exp(-age * 7);
          }
          const sq = this.squash.get(`${x},${y}`);
          if (sq !== undefined) {
            const age = t - sq;
            if (age > 0.6) this.squash.delete(`${x},${y}`);
            else {
              const k2 = Math.sin(age * 30) * Math.exp(-age * 9) * 0.28;
              sx = 1 + k2;
              sy = 1 - k2;
            }
          }
          d.position.copy(p);
          d.rotation.set(0, 0, 0);
          d.scale.set(sx, sy, sx);
          d.updateMatrix();
          m.setMatrixAt(i, d.matrix);
          const c = this.tmpColor.copy(KIND_COLOR[k]);
          if (this.rainbow > 0) {
            const h = (x * 0.07 + y * 0.05 - t * 1.4) % 1;
            c.lerp(new THREE.Color().setHSL((h + 1) % 1, 1, 0.6), Math.min(1, this.rainbow * 1.5));
          }
          if (glow && glow.cells.has(`${x},${y}`)) {
            const a = 1 - (t - glow.t) / 0.8;
            c.lerp(new THREE.Color(1, 0.85, 0.4), a * 0.6).multiplyScalar(1 + a * 1.6);
          }
          if (y < HIDDEN) c.multiplyScalar(0.6);
          m.setColorAt(i, c);
          i++;
        }
      }
    }
    // Active piece, smoothly following its cell position.
    const ghostMesh = this.ghost;
    ghostMesh.count = 0;
    if (showPiece && !game.over && game.piece) {
      const pc = game.piece;
      const key = `${pc.kind}:${game.pieceCount}`;
      const target = cellToWorld(pc.x, pc.y, new THREE.Vector3());
      if (key !== this.activeKey) {
        this.activeKey = key;
        this.activePos.copy(target);
      }
      const follow = 1 - Math.exp(-dt * 30);
      this.activePos.lerp(target, follow);
      if (Math.abs(this.activePos.y - target.y) > 2.5) this.activePos.y = target.y;
      const color = KIND_COLOR[pc.kind];
      const cells = ROTATIONS[pc.kind][pc.rot];
      const shimmer = 1.12 + 0.08 * Math.sin(t * 8);
      const gy = game.ghostY();
      for (const [cx, cy] of cells) {
        d.position.set(this.activePos.x + cx, this.activePos.y - cy, 0.02);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
        m.setColorAt(i, this.tmpColor.copy(color).multiplyScalar(shimmer));
        i++;
        if (gy !== pc.y) {
          cellToWorld(pc.x + cx, gy + cy, p);
          d.position.copy(p);
          d.scale.setScalar(0.96);
          d.updateMatrix();
          ghostMesh.setMatrixAt(ghostMesh.count, d.matrix);
          ghostMesh.setColorAt(ghostMesh.count, this.tmpColor.copy(color));
          ghostMesh.count++;
        }
      }
      this.ghostMat.opacity = 0.45 + 0.12 * Math.sin(t * 5);
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
    ghostMesh.instanceMatrix.needsUpdate = true;
    ghostMesh.instanceColor.needsUpdate = true;

    this.drawPreviews(game);
  }

  drawPreviews(game) {
    const d = this.dummy;
    const m = this.previews;
    let i = 0;
    const preview = (kind, x, scale, dim) => {
      const cells = ROTATIONS[kind][0];
      let minX = 9, maxX = -9, minY = 9, maxY = -9;
      for (const [cx, cy] of cells) {
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
      }
      const ox = (minX + maxX) / 2;
      const oy = (minY + maxY) / 2;
      const spin = Math.sin(this.time * 1.2 + x) * 0.25;
      for (const [cx, cy] of cells) {
        const dx = (cx - ox) * scale;
        d.position.set(x + dx * Math.cos(spin), -0.28 - (cy - oy) * scale, -dx * Math.sin(spin));
        d.rotation.set(0, spin, 0);
        d.scale.setScalar(scale);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
        m.setColorAt(i, this.tmpColor.copy(KIND_COLOR[kind]).multiplyScalar(dim ? 0.35 : 1));
        i++;
      }
    };
    if (game.hold) preview(game.hold, HOLD_X, 0.52, game.holdUsed);
    game.queue.slice(0, 3).forEach((k, n) => preview(k, NEXT_SLOTS[n], n === 0 ? 0.52 : 0.43, false));
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
  }

  updateEffects(realDt, dt) {
    const timeScale = this.slowmo > 0 ? 0.35 : 1;
    this.sparks.update(dt * (this.slowmo > 0 ? 0.5 : 1));
    this.debris.update(dt, timeScale);
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.max;
      const s = 0.3 + r.grow * (1 - Math.pow(1 - k, 3));
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = (1 - k) * (1 - k) * 0.85;
    }
    for (const s of this.streaks) {
      if (!s.mesh.visible) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.mesh.material.opacity = s.life / 0.28;
      s.mesh.scale.x = 0.85 * (s.life / 0.28);
    }
    for (const b of this.beams) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      const k = 1 - b.life / b.max;
      b.mesh.scale.set(COLS + 2 + k * 14, 0.9 + Math.sin(k * Math.PI) * 0.8, 1);
      b.mesh.material.opacity = Math.sin(k * Math.PI) * 0.6;
    }
  }

  updateCamera(realDt) {
    const t = performance.now() / 1000;
    const shake = this.trauma * this.trauma;
    const n = (a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.2;
    const dist = this.baseDistance * (1 - this.punch * 0.07);
    const sway = Math.sin(t * 0.35) * 0.5;
    this.camera.position.set(
      this.center.x + sway + n(37, 51, 73) * shake * 1.1,
      this.center.y + 0.8 + n(41, 59, 67) * shake * 1.1,
      dist
    );
    this.camera.lookAt(this.center.x + n(29, 43, 61) * shake * 0.3, this.center.y + n(31, 47, 53) * shake * 0.3, 0);
    this.camera.rotation.z += n(23, 39, 57) * shake * 0.05 + Math.sin(t * 9) * 0.06 * this.roll * this.roll;
  }
}
