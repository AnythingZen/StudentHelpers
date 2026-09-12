// Hands-on challenges in the world: a cake to serve and a bridge to lay. The
// student clicks real pieces to build a fraction; the server grades the count.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Tree, TreeState } from '../../server/src/contract';

type Spec = NonNullable<Tree['model']>;

export class ChallengeView {
  readonly group = new THREE.Group();
  private readonly pieces: THREE.Group[] = [];
  private readonly picked = new Set<number>();
  private readonly tag: HTMLDivElement;
  private celebrateAt = -1;

  constructor(readonly id: string, readonly spec: Spec) {
    if (spec.shape === 'cake') this.buildCake(); else this.buildBridge();
    this.tag = document.createElement('div');
    this.tag.className = 'label challenge-tag';
    const obj = new CSS2DObject(this.tag);
    obj.position.y = spec.shape === 'cake' ? 2.5 : 2.2;
    this.group.add(obj);
    this.setState('healthy', false, false);
  }

  get thing(): string { return this.spec.shape === 'cake' ? 'slices' : 'planks'; }
  count(): number { return this.picked.size; }

  private buildCake(): void {
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a3b, flatShading: true });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.12, 20), wood);
    top.position.y = 0.95;
    top.castShadow = true;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.95, 8), wood);
    leg.position.y = 0.47;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.05, 28), new THREE.MeshLambertMaterial({ color: 0xf4f1ea }));
    plate.position.y = 1.03;
    this.group.add(top, leg, plate);
    const n = this.spec.parts, step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const slice = new THREE.Group();
      const sponge = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 10, 1, false, i * step + 0.03, step - 0.06),
        new THREE.MeshLambertMaterial({ color: 0xf1c27d, flatShading: true, emissive: 0xffd23f, emissiveIntensity: 0 }));
      const icing = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, 0.1, 10, 1, false, i * step + 0.03, step - 0.06),
        new THREE.MeshLambertMaterial({ color: 0xf7a8c4, flatShading: true, emissive: 0xffd23f, emissiveIntensity: 0 }));
      icing.position.y = 0.3;
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd62d3a }));
      const mid = i * step + step / 2;
      berry.position.set(Math.sin(mid) * 0.85, 0.42, Math.cos(mid) * 0.85);
      sponge.castShadow = true;
      slice.add(sponge, icing, berry);
      slice.position.y = 1.31;
      slice.userData = { part: i, dir: new THREE.Vector3(Math.sin(mid), 0, Math.cos(mid)) };
      slice.traverse(o => (o.userData.part = i));
      this.pieces.push(slice);
      this.group.add(slice);
    }
  }

  private buildBridge(): void {
    const n = this.spec.parts, gap = n * 0.52;
    const bank = new THREE.MeshLambertMaterial({ color: 0x6f8f4e, flatShading: true });
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 2.8), bank);
      b.position.set(side * (gap / 2 + 0.7), 0.3, 0);
      b.castShadow = true;
      this.group.add(b);
    }
    const water = new THREE.Mesh(new THREE.PlaneGeometry(gap, 2.8), new THREE.MeshLambertMaterial({ color: 0x3f7fb5 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.04;
    this.group.add(water);
    for (let i = 0; i < n; i++) {
      const plank = new THREE.Group();
      const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 2.3),
        new THREE.MeshLambertMaterial({ color: 0xc58b4f, transparent: true, opacity: 0.28, emissive: 0xffd23f, emissiveIntensity: 0 }));
      ghost.castShadow = true;
      plank.add(ghost);
      plank.position.set(-gap / 2 + 0.26 + i * 0.52, 0.62, 0);
      plank.userData = { part: i };
      plank.traverse(o => (o.userData.part = i));
      this.pieces.push(plank);
      this.group.add(plank);
    }
  }

  toggle(i: number): void {
    if (i < 0 || i >= this.pieces.length) return;
    if (this.picked.has(i)) this.picked.delete(i); else this.picked.add(i);
    this.paint();
  }

  clear(): void { this.picked.clear(); this.paint(); }

  private paint(): void {
    this.pieces.forEach((p, i) => {
      const on = this.picked.has(i);
      p.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
        if (!m || !('emissiveIntensity' in m)) return;
        m.emissiveIntensity = on ? 0.6 : 0;
        if (this.spec.shape === 'bridge') { m.opacity = on ? 1 : 0.28; m.transparent = !on; }
      });
    });
  }

  /** Which piece a ray hits, if any. */
  pick(ray: THREE.Raycaster): number | null {
    const hit = ray.intersectObjects(this.pieces, true)[0];
    return hit ? (hit.object.userData.part as number) : null;
  }

  pieceWorld(i: number): THREE.Vector3 {
    const p = this.pieces[i]!;
    const v = new THREE.Vector3();
    p.getWorldPosition(v);
    if (this.spec.shape === 'cake') {
      const d = (p.userData.dir as THREE.Vector3).clone().applyQuaternion(this.group.quaternion);
      v.addScaledVector(d, 0.7).setY(v.y + 0.3);
    }
    return v;
  }

  /** Where the camera should sit to work on it: above and in front, on the player's side. */
  focus(from: THREE.Vector3): { cam: THREE.Vector3; look: THREE.Vector3 } {
    const c = this.group.position;
    const dir = new THREE.Vector3(from.x - c.x, 0, from.z - c.z);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const high = this.spec.shape === 'cake' ? 4.2 : 3.6;
    return { cam: c.clone().addScaledVector(dir, 3.4).setY(high), look: c.clone().setY(this.spec.shape === 'cake' ? 1.2 : 0.5) };
  }

  celebrate(): void { this.celebrateAt = performance.now(); }

  setState(state: TreeState, learned: boolean, locked: boolean): void {
    const name = this.spec.shape === 'cake' ? '🎂 Cake challenge' : '🌉 Bridge checkpoint';
    this.tag.textContent = locked ? `🔒 ${name}` : learned && state !== 'withered' ? `✓ ${name}` : state === 'withered' ? `${name} · try again` : name;
    this.tag.classList.toggle('done', learned && state !== 'withered');
  }

  update(dt: number, t: number): void {
    const since = this.celebrateAt < 0 ? Infinity : (performance.now() - this.celebrateAt) / 1000;
    this.pieces.forEach((p, i) => {
      const on = this.picked.has(i);
      if (this.spec.shape === 'cake') {
        const dir = p.userData.dir as THREE.Vector3;
        const out = on ? 0.45 : 0;
        const hop = since < 1.6 && on ? Math.abs(Math.sin(since * 9 + i)) * 0.35 : 0;
        p.position.x += (dir.x * out - p.position.x) * Math.min(1, dt * 10);
        p.position.z += (dir.z * out - p.position.z) * Math.min(1, dt * 10);
        p.position.y = 1.31 + (on ? 0.3 : 0) + hop;
      } else {
        const y = on ? 0.62 : 0.62 + Math.sin(t * 3 + i) * 0.03;
        const hop = since < 1.6 && on ? Math.abs(Math.sin(since * 9 + i)) * 0.3 : 0;
        p.position.y += (y + hop - p.position.y) * Math.min(1, dt * 12);
      }
    });
  }
}
