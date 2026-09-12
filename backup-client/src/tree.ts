// Trees from primitives. The four states are the moments the demo turns on,
// so every transition animates rather than snapping.
import * as THREE from 'three';
import type { TreeState } from '../../server/src/contract';
import type { Skin } from './skins';

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class TreeView {
  readonly group = new THREE.Group();
  private readonly canopy = new THREE.Group();
  private readonly trunk: THREE.Mesh;
  private readonly cones: THREE.Mesh[] = [];
  private readonly ring: THREE.Mesh;
  private readonly jitter: number;
  private state: TreeState = 'healthy';
  private targetScale = 1;
  private scale = 0.01;           // grows in from nothing when first planted
  private targetTilt = 0;
  private glow = 0;

  constructor(readonly id: string, private skin: Skin) {
    const h = hash(id);
    this.jitter = 0.85 + ((h % 100) / 100) * 0.4;
    this.group.rotation.y = (h % 628) / 100;

    const trunkMat = new THREE.MeshLambertMaterial({ color: skin.trunk, flatShading: true });
    this.trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.6, 6), trunkMat);
    this.trunk.position.y = 0.8;
    this.trunk.castShadow = true;
    this.group.add(this.trunk);

    for (let i = 0; i < 3; i++) {
      const color = skin.foliage[(h + i) % skin.foliage.length]!;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.25 - i * 0.3, 1.5 - i * 0.15, 7),
        new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: 0xffe08a, emissiveIntensity: 0 }),
      );
      cone.position.y = 1.9 + i * 0.75;
      cone.castShadow = true;
      this.cones.push(cone);
      this.canopy.add(cone);
    }
    this.group.add(this.canopy);

    // A golden ring once the student has actually learned this tree (box 2+).
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.35, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.group.add(this.ring);
  }

  setState(state: TreeState, learned: boolean, locked: boolean): void {
    if (state !== this.state && state === 'regrown') this.glow = 1;     // the regrow moment
    this.state = state;
    this.targetScale = state === 'sapling' ? 0.45 : state === 'withered' ? 0.8 : 1;
    this.targetTilt = state === 'withered' ? 0.35 : 0;
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = learned ? 0.85 : 0;

    const trunkMat = this.trunk.material as THREE.MeshLambertMaterial;
    trunkMat.color.setHex(state === 'withered' ? 0x6d6256 : this.skin.trunk);
    this.cones.forEach((cone, i) => {
      const m = cone.material as THREE.MeshLambertMaterial;
      if (state === 'withered') m.color.setHex(0x8b7d62);
      else if (state === 'sapling') m.color.setHex(0x8fd46a);
      else m.color.setHex(this.skin.foliage[(hash(this.id) + i) % this.skin.foliage.length]!);
      if (locked) m.color.multiplyScalar(0.45);
      cone.visible = state !== 'sapling' || i === 0;
      cone.scale.setScalar(state === 'withered' ? 0.5 : 1);
    });
    if (locked) trunkMat.color.multiplyScalar(0.5);
  }

  update(dt: number, t: number): void {
    this.scale += (this.targetScale * this.jitter - this.scale) * Math.min(1, dt * 4);
    this.group.scale.setScalar(this.scale);
    this.canopy.rotation.z += (this.targetTilt - this.canopy.rotation.z) * Math.min(1, dt * 3);
    if (this.state === 'sapling') this.canopy.position.y = Math.sin(t * 3 + this.jitter * 10) * 0.08;
    if (this.glow > 0) {
      this.glow = Math.max(0, this.glow - dt * 0.8);
      const pop = 1 + Math.sin((1 - this.glow) * Math.PI) * 0.25;
      this.group.scale.setScalar(this.scale * pop);
      this.cones.forEach(c => ((c.material as THREE.MeshLambertMaterial).emissiveIntensity = this.glow * 0.9));
    }
    const ring = this.ring.material as THREE.MeshBasicMaterial;
    if (ring.opacity > 0) this.ring.rotation.z = t * 0.4;
  }
}
