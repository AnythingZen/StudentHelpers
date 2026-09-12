import * as THREE from 'three';

export function createScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9bd9e9); scene.fog = new THREE.Fog(0x9bd9e9, 36, 150);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 20, 20), new THREE.MeshLambertMaterial({ color: 0x376d45, flatShading: true }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(9, 145), new THREE.MeshLambertMaterial({ color: 0xb59465 })); path.rotation.x = -Math.PI / 2; path.position.set(0, .012, -58); scene.add(path);
  scene.add(new THREE.HemisphereLight(0xdaf4ff, 0x36522f, 2));
  const sun = new THREE.DirectionalLight(0xfff0c2, 2.8); sun.position.set(15, 28, 12); sun.castShadow = false; scene.add(sun);
  return scene;
}
