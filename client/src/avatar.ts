import * as THREE from 'three';

/** A deliberately simple, readable player character — no models or rig required. */
export function buildAvatar() {
  const avatar = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xf2b38d, flatShading: true });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x3179c7, flatShading: true });
  const trousers = new THREE.MeshLambertMaterial({ color: 0x273653, flatShading: true });
  const add = (mesh: THREE.Mesh, x: number, y: number, z: number) => { mesh.position.set(x, y, z); avatar.add(mesh); return mesh; };
  add(new THREE.Mesh(new THREE.BoxGeometry(.78, .94, .38), shirt), 0, 1.42, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(.62, .62, .58), skin), 0, 2.2, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .72, 6), skin), -.55, 1.47, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .72, 6), skin), .55, 1.47, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .82, 6), trousers), -.23, .5, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .82, 6), trousers), .23, .5, 0);
  avatar.userData.distance = 0;
  return avatar;
}

export function animateAvatar(avatar: THREE.Group, player: THREE.Vector3, look: THREE.Vector3, moving: boolean, time: number) {
  avatar.position.copy(player).addScaledVector(look, 5.2); avatar.position.y = 0;
  avatar.rotation.y = Math.atan2(look.x, look.z);
  avatar.position.y += moving ? Math.abs(Math.sin(time * 9)) * .06 : 0;
}
