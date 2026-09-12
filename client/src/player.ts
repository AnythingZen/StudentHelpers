import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class Player {
  controls: PointerLockControls; private keys = new Set<string>(); private velocity = new THREE.Vector3();
  constructor(camera: THREE.PerspectiveCamera, element: HTMLElement) {
    this.controls = new PointerLockControls(camera, element); camera.position.set(0, 1.7, 10);
    window.addEventListener('keydown', (event) => this.keys.add(event.code)); window.addEventListener('keyup', (event) => this.keys.delete(event.code));
  }
  update(delta: number) {
    if (!this.controls.isLocked) return;
    const speed = this.keys.has('ShiftLeft') ? 14 : 6; const direction = new THREE.Vector3();
    if (this.keys.has('KeyW')) direction.z -= 1; if (this.keys.has('KeyS')) direction.z += 1;
    if (this.keys.has('KeyA')) direction.x -= 1; if (this.keys.has('KeyD')) direction.x += 1;
    direction.normalize(); this.velocity.lerp(direction.multiplyScalar(speed), Math.min(1, delta * 11));
    this.controls.moveRight(this.velocity.x * delta); this.controls.moveForward(-this.velocity.z * delta);
    const p = this.controls.object.position; p.x = THREE.MathUtils.clamp(p.x, -45, 45); p.z = THREE.MathUtils.clamp(p.z, -140, 18); p.y = 1.7;
  }
}
