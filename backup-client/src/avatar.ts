// A blocky humanoid from primitives — for you, classmates, and Professor Byte.
import * as THREE from 'three';

export class Avatar {
  readonly group = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];
  private readonly arms: THREE.Mesh[] = [];
  private stride = 0;

  constructor(shirt: number, skin = 0xf1c7a3, hair = 0x3b2a20) {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const box = (w: number, h: number, d: number, c: number, x: number, y: number, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    box(0.7, 0.85, 0.4, shirt, 0, 1.25);                  // torso
    box(0.55, 0.55, 0.55, skin, 0, 1.97);                 // head
    box(0.58, 0.14, 0.58, hair, 0, 2.28);                 // hair
    box(0.08, 0.08, 0.02, 0x111111, -0.13, 2.02, 0.28);   // eyes, so you can tell which way they face
    box(0.08, 0.08, 0.02, 0x111111, 0.13, 2.02, 0.28);
    for (const x of [-0.18, 0.18]) {
      const leg = box(0.26, 0.8, 0.3, 0x2d3a4a, x, 0.4);
      leg.geometry.translate(0, -0.4, 0); leg.position.y = 0.8;
      this.legs.push(leg);
    }
    for (const x of [-0.48, 0.48]) {
      const arm = box(0.22, 0.75, 0.24, shirt, x, 1.3);
      arm.geometry.translate(0, -0.3, 0); arm.position.y = 1.6;
      this.arms.push(arm);
    }
  }

  animate(dt: number, speed: number): void {
    this.stride += dt * speed * 1.6;
    const swing = Math.sin(this.stride) * Math.min(1, speed / 4) * 0.7;
    this.legs[0]!.rotation.x = swing; this.legs[1]!.rotation.x = -swing;
    this.arms[0]!.rotation.x = -swing; this.arms[1]!.rotation.x = swing;
  }

  jump(t: number): void { this.group.position.y = Math.max(0, Math.sin(t * 9)) * 0.5; }
}

// The companion. Its job is the confidence prompt, so it should read as a fox.
export function makeFox(): THREE.Group {
  const fox = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: 0xe36f1e, flatShading: true });
  const cream = new THREE.MeshLambertMaterial({ color: 0xfff1dd, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b1d14, flatShading: true });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; fox.add(m); return m;
  };
  add(new THREE.BoxGeometry(0.34, 0.3, 0.62), orange, 0, 0.36, 0);             // body
  add(new THREE.BoxGeometry(0.3, 0.28, 0.3), orange, 0, 0.56, 0.38);           // head
  add(new THREE.BoxGeometry(0.14, 0.12, 0.16), cream, 0, 0.5, 0.58);           // snout
  add(new THREE.BoxGeometry(0.05, 0.05, 0.03), dark, 0, 0.54, 0.67);           // nose
  add(new THREE.ConeGeometry(0.07, 0.16, 4), orange, -0.09, 0.77, 0.36);       // ears
  add(new THREE.ConeGeometry(0.07, 0.16, 4), orange, 0.09, 0.77, 0.36);
  add(new THREE.ConeGeometry(0.12, 0.5, 5), orange, 0, 0.45, -0.52, -Math.PI / 2.4); // tail
  add(new THREE.ConeGeometry(0.06, 0.14, 5), cream, 0, 0.56, -0.74, -Math.PI / 2.4); // tail tip
  for (const [x, z] of [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]]) {
    add(new THREE.BoxGeometry(0.08, 0.22, 0.08), dark, x!, 0.11, z!);           // legs
  }
  return fox;
}
