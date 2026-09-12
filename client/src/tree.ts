import * as THREE from 'three';
import type { TreeState } from '../../shared/types';

const hash = (id: string) => [...id].reduce((n, c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 1);

export function buildTree(state: TreeState, id: string, locked = false): THREE.Group {
  const group = new THREE.Group(); group.name = id;
  const seed = hash(id); const scale = 0.8 + (seed % 51) / 100;
  const healthy = state === 'healthy' || state === 'regrown';
  const sapling = state === 'sapling'; const withered = state === 'withered';
  const green = new THREE.Color().setHSL(0.29 + ((seed % 17) - 8) / 100, locked ? 0.08 : 0.46, locked ? 0.19 : 0.30);
  const leafColor = withered ? 0x7d7060 : sapling ? 0x74ed79 : green;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(sapling ? .12 : .23, sapling ? .17 : .34, sapling ? 1.2 : 2.5, 6), new THREE.MeshLambertMaterial({ color: withered ? 0x5c5045 : 0x745038, flatShading: true }));
  trunk.position.y = sapling ? .6 : 1.25; group.add(trunk);
  const canopyScale = withered ? .42 : sapling ? .48 : 1;
  const levels = sapling ? 1 : 3;
  for (let index = 0; index < levels; index++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry((1.25 - index * .22) * canopyScale, (1.9 - index * .18) * canopyScale, 7), new THREE.MeshLambertMaterial({ color: leafColor, flatShading: true }));
    cone.position.y = (sapling ? 1.45 : 2.2 + index * .66); group.add(cone);
  }
  if (withered) {
    group.rotation.z = .18;
    for (let i = 0; i < 4; i++) { const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(.15, 0), new THREE.MeshLambertMaterial({ color: 0x776b54 })); leaf.position.set((i - 1.5) * .22, .1, i % 2 ? .35 : -.35); group.add(leaf); }
  }
  if (state === 'regrown') { const glow = new THREE.PointLight(0xffd76b, 1.3, 5); glow.position.y = 3; group.add(glow); }
  group.rotation.y = (seed % 628) / 100; group.scale.setScalar(scale); group.userData = { state, bob: sapling, pop: state === 'regrown' };
  return group;
}
