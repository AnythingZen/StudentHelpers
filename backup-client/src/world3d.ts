// The forest scene: ground and path, groves with labels, bridges to locked
// groves, trees synced from server state, and other players lerped from presence.
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Player, Tree, World } from '../../server/src/contract';
import { Avatar } from './avatar';
import { conceptHealth, isLocked } from './rules';
import { skinFor, type Skin } from './skins';
import { TreeView } from './tree';

const PLANKS = 5;

class Bridge {
  readonly group = new THREE.Group();
  private readonly planks: THREE.Mesh[] = [];
  private readonly posts: THREE.Mesh[] = [];
  private filled = -1;

  constructor(centre: [number, number, number]) {
    const z = centre[2] + 11;
    const gap = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.4), new THREE.MeshLambertMaterial({ color: 0x2a2f2a }));
    gap.rotation.x = -Math.PI / 2;
    gap.position.set(centre[0], 0.02, z);
    this.group.add(gap);
    for (let i = 0; i < PLANKS; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.72), new THREE.MeshLambertMaterial({ color: 0x9a6b3f, flatShading: true }));
      plank.position.set(centre[0], 3, z - 1.7 + i * 0.85);
      plank.castShadow = true;
      plank.visible = false;
      this.planks.push(plank);
      this.group.add(plank);
    }
    for (const dz of [-2.4, 2.4]) for (const dx of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.3, 6), new THREE.MeshLambertMaterial({ color: 0xb5462b }));
      post.position.set(centre[0] + dx, 0.65, z + dz);
      this.posts.push(post);
      this.group.add(post);
    }
  }

  /** Returns +1 / -1 when a plank was gained or lost, so the HUD can say so. */
  set(filled: number, locked: boolean): number {
    const change = this.filled < 0 ? 0 : Math.sign(filled - this.filled);
    this.filled = filled;
    this.planks.forEach((p, i) => (p.visible = i < filled));
    this.posts.forEach(p => (p.material as THREE.MeshLambertMaterial).color.setHex(locked ? 0xb5462b : 0x2f7d4f));
    return change;
  }

  update(dt: number): void {
    this.planks.forEach(p => { if (p.visible) p.position.y += (0.1 - p.position.y) * Math.min(1, dt * 7); else p.position.y = 3; });
  }
}

interface Other { avatar: Avatar; target: THREE.Vector3; yaw: number; jumpUntil: number }

export class ForestScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly labels = new CSS2DRenderer();
  private skin: Skin = skinFor('');
  private readonly ground: THREE.Mesh;
  private readonly path: THREE.Mesh;
  private readonly hemi: THREE.HemisphereLight;
  private trees = new Map<string, TreeView>();
  private groves = new Map<string, { obj: CSS2DObject; el: HTMLDivElement }>();
  private bridges = new Map<string, Bridge>();
  private others = new Map<string, Other>();
  private subject = '';
  private readonly scenery = new THREE.Group();

  constructor(container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);
    Object.assign(this.labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
    container.append(this.labels.domElement);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 280), new THREE.MeshLambertMaterial({ color: this.skin.ground }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.z = -60;
    this.ground.receiveShadow = true;
    this.path = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 150), new THREE.MeshLambertMaterial({ color: this.skin.path }));
    this.path.rotation.x = -Math.PI / 2;
    this.path.position.set(0, 0.01, -58);
    this.path.receiveShadow = true;
    this.hemi = new THREE.HemisphereLight(this.skin.sky, this.skin.ground, 1.2);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -140, far: 200 });
    this.scene.add(this.ground, this.path, this.hemi, sun);
    this.applySkin('');
    this.scene.add(this.scenery);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // The walls of the world: a dense, non-interactive forest either side of the
  // play area and past the far end, so the groves feel like clearings in a forest
  // rather than trees in a field. Instanced — hundreds of trees, a handful of draw calls.
  private buildScenery(): void {
    this.scenery.clear();
    let seed = 1337;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots: Array<[number, number, number]> = [];
    while (spots.length < 520) {
      const x = (rand() * 2 - 1) * 105;
      const z = 30 - rand() * 250;
      const clearing = Math.abs(x) < 30 && z > -128 && z < 22;      // where the groves live
      const nearPath = Math.abs(x) < 4 && z > -135;
      if (!clearing && !nearPath) spots.push([x, z, 0.8 + rand() * 1.6]);
    }
    const dummy = new THREE.Object3D();
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1.8, 6),
      new THREE.MeshLambertMaterial({ color: this.skin.trunk, flatShading: true }), spots.length);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.4, 7),
      new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);
    const colour = new THREE.Color();
    spots.forEach(([x, z, s], i) => {
      dummy.position.set(x, 0.9 * s, z); dummy.scale.setScalar(s); dummy.rotation.set(0, rand() * 6, 0); dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 3.2 * s, z); dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(i, colour.setHex(this.skin.foliage[i % this.skin.foliage.length]!).multiplyScalar(0.78 + rand() * 0.3));
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    this.scenery.add(trunks, crowns);

    // Rocks and bushes scattered in the clearings, away from the path.
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.55, 0),
      new THREE.MeshLambertMaterial({ color: 0x9a968c, flatShading: true }), 60);
    for (let i = 0; i < 60; i++) {
      const x = (rand() < 0.5 ? -1 : 1) * (6 + rand() * 24);
      dummy.position.set(x, 0.2, 18 - rand() * 150); dummy.scale.set(0.6 + rand(), 0.4 + rand() * 0.6, 0.6 + rand());
      dummy.rotation.set(rand(), rand() * 6, 0); dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.scenery.add(rocks);
  }

  private applySkin(subject: string): void {
    this.skin = skinFor(subject);
    this.buildScenery();
    this.scene.background = new THREE.Color(this.skin.sky);
    this.scene.fog = new THREE.Fog(this.skin.fog, 30, 110);
    (this.ground.material as THREE.MeshLambertMaterial).color.setHex(this.skin.ground);
    (this.path.material as THREE.MeshLambertMaterial).color.setHex(this.skin.path);
    this.hemi.color.setHex(this.skin.sky);
  }

  /** Sync to server state. Returns plank changes per concept for toasts. */
  sync(world: World<Tree>): Array<{ conceptId: string; change: number }> {
    if (world.subject !== this.subject) {
      this.subject = world.subject;
      this.applySkin(world.subject);
      this.trees.forEach(v => this.scene.remove(v.group));
      this.trees.clear();
    }
    const seen = new Set<string>();
    for (const t of world.trees) {
      seen.add(t.id);
      let view = this.trees.get(t.id);
      if (!view) { view = new TreeView(t.id, this.skin); this.trees.set(t.id, view); this.scene.add(view.group); }
      view.group.position.set(t.pos[0], 0, t.pos[2]);
      view.setState(t.state, t.leitnerBox >= 2, isLocked(world, t.conceptId));
    }
    for (const [id, view] of this.trees) if (!seen.has(id)) { this.scene.remove(view.group); this.trees.delete(id); }

    const changes: Array<{ conceptId: string; change: number }> = [];
    for (const c of world.concepts) {
      const locked = isLocked(world, c.id);
      let g = this.groves.get(c.id);
      if (!g) {
        const el = document.createElement('div');
        const obj = new CSS2DObject(el);
        this.scene.add(obj);
        g = { obj, el };
        this.groves.set(c.id, g);
      }
      g.obj.position.set(c.centre[0], 7.5, c.centre[2]);
      g.el.className = `label grove-label${locked ? ' locked' : ''}`;
      g.el.textContent = `${locked ? '🔒 ' : ''}${c.questName}${c.level !== world.syllabus.level ? ` · ${c.level}` : ''}`;

      if (c.prerequisites.length > 0) {
        let b = this.bridges.get(c.id);
        if (!b) { b = new Bridge(c.centre); this.bridges.set(c.id, b); this.scene.add(b.group); }
        const minHealth = Math.min(...c.prerequisites.map(p => conceptHealth(world, p)));
        const change = b.set(locked ? Math.min(PLANKS - 1, Math.round(PLANKS * minHealth)) : PLANKS, locked);
        if (change !== 0) changes.push({ conceptId: c.id, change });
      }
    }
    return changes;
  }

  syncPlayers(players: Player[]): void {
    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.playerId);
      let o = this.others.get(p.playerId);
      if (!o) {
        const shirt = p.playerId === 'seed-mia' ? 0xe86aa6 : p.seeded ? 0xe0a43a : 0x7b5cd6;
        const avatar = new Avatar(shirt);
        const tag = document.createElement('div');
        tag.className = 'label name-tag';
        tag.textContent = p.seeded ? p.name : `${p.name} (player)`;
        const obj = new CSS2DObject(tag);
        obj.position.y = 2.8;
        avatar.group.add(obj);
        avatar.group.position.set(...p.pos);
        o = { avatar, target: new THREE.Vector3(...p.pos), yaw: p.yaw, jumpUntil: 0 };
        this.others.set(p.playerId, o);
        this.scene.add(avatar.group);
      }
      o.target.set(p.pos[0], 0, p.pos[2]);
      o.yaw = p.yaw;
    }
    for (const [id, o] of this.others) if (!seen.has(id)) { this.scene.remove(o.avatar.group); this.others.delete(id); }
  }

  playerPos(id: string): THREE.Vector3 | null { return this.others.get(id)?.avatar.group.position.clone() ?? null; }
  cheer(id: string, now: number): void { const o = this.others.get(id); if (o) o.jumpUntil = now + 1600; }

  update(dt: number, t: number, now: number): void {
    this.trees.forEach(v => v.update(dt, t));
    for (const g of this.groves.values()) {
      const d = this.camera.position.distanceTo(g.obj.position);
      const alpha = Math.max(0, Math.min(1, (48 - d) / 14));
      g.el.style.opacity = String(alpha);
      g.el.style.visibility = alpha < 0.02 ? 'hidden' : 'visible';
    }
    this.bridges.forEach(b => b.update(dt));
    for (const o of this.others.values()) {
      const g = o.avatar.group;
      const before = g.position.clone();
      g.position.x += (o.target.x - g.position.x) * Math.min(1, dt * 5);   // lerp, or they'd teleport every poll
      g.position.z += (o.target.z - g.position.z) * Math.min(1, dt * 5);
      g.rotation.y = o.yaw;
      o.avatar.animate(dt, before.distanceTo(g.position) / Math.max(dt, 1e-3));
      if (now < o.jumpUntil) o.avatar.jump(t); else g.position.y = 0;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
  }
}
