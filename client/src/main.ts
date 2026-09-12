import * as THREE from 'three';
import './style.css';
import { getWorld, answer } from './api';
import { createScene } from './scene';
import { buildTree } from './tree';
import { Player } from './player';
import { closestTree } from './proximity';
import { isLocked } from './state';
import { closeQuestion, showHint, showQuestion } from './questionCard';
import { layout } from './layout';
import { animateAvatar, buildAvatar } from './avatar';
import type { World } from '../../shared/types';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `<div id="hud"><div class="brand">MASTERY <span>GROVE</span></div><div class="topic">Primary 5 · Mathematics · Fractions</div></div><div id="prompt">Press <kbd>E</kbd> to tend this tree</div><div id="toast"></div><div id="levelup">LEVEL UP <small>Primary 6 Fractions unlocked</small></div><div id="question-overlay"></div><button id="enter">ENTER THE GROVE <small>WASD to walk · mouse to look · Shift to sprint</small></button>`;
const canvas = document.createElement('canvas'); document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .1, 250); const scene = createScene(); const player = new Player(camera, document.body);
const forest = new THREE.Group(); scene.add(forest);
const avatar = buildAvatar(); scene.add(avatar);
let world: World; let nearby: string | null = null; const objects = new Map<string, THREE.Group>(); const clock = new THREE.Clock();
function renderForest() {
  forest.clear(); objects.clear();
  for (const tree of world.trees) { const concept = world.concepts.find((item) => item.id === tree.conceptId)!; const object = buildTree(tree.state, tree.id, isLocked(world, concept)); object.position.set(...tree.pos); forest.add(object); objects.set(tree.id, object); }
  for (const concept of world.concepts) {
    const locked = isLocked(world, concept);
    const label = locked ? ['GROVE LOCKED', 'Master the path ahead'] : splitLabel(concept.name);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSprite(label, locked), transparent: true, depthWrite: false }));
    sign.position.set(concept.centre[0], 5.5, concept.centre[2]); sign.scale.set(8.2, 2.35, 1); forest.add(sign);
  }
}
function splitLabel(value: string): [string, string] {
  const words = value.split(' '); const middle = Math.ceil(words.length / 2);
  return [words.slice(0, middle).join(' '), words.slice(middle).join(' ')];
}
function textSprite(lines: [string, string], locked: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 288;
  const context = canvas.getContext('2d')!; const background = locked ? '#2e3541' : '#173f52';
  context.fillStyle = background; context.beginPath(); context.roundRect(24, 24, 976, 240, 30); context.fill();
  context.strokeStyle = locked ? '#718095' : '#9de1e8'; context.lineWidth = 7; context.stroke();
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = locked ? '#b8c0ca' : '#fff7d4';
  context.font = '800 52px Nunito, system-ui'; context.fillText(lines[0].toUpperCase(), 512, 112);
  context.font = '700 35px Nunito, system-ui'; context.fillStyle = locked ? '#8e9bab' : '#a9e3e6'; context.fillText(lines[1], 512, 184);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearFilter; return texture;
}
function toast(message: string) { const el = document.querySelector<HTMLElement>('#toast')!; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 4000); }
function openTree(treeId: string) { const tree = world.trees.find((item) => item.id === treeId)!; player.controls.unlock(); showQuestion(tree, async (response) => { const result = await answer(world, tree.id, response); tree.state = result.treeState; renderForest(); if (result.correct) { closeQuestion(); toast('🔨 Bridge Repair +1 · The grove brightens.'); } else showHint(result.scaffoldHint ?? 'What could you try next?', () => { closeQuestion(); toast(`⚠️ The Fraction Bridge is unstable. A sapling of ${world.concepts.find((c) => c.id === tree.conceptId)?.name} has taken root ahead.`); }); }, closeQuestion); }
const enter = document.querySelector<HTMLElement>('#enter')!;
player.controls.addEventListener('lock', () => { enter.style.display = 'none'; });
player.controls.addEventListener('unlock', () => { enter.style.display = ''; });
enter.addEventListener('click', () => player.controls.lock());
window.addEventListener('keydown', (event) => { if (event.code === 'KeyE' && nearby && player.controls.isLocked) openTree(nearby); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setSize(innerWidth, innerHeight);
getWorld().then((loaded) => { world = layout(loaded); renderForest(); animate(); });
function animate() { requestAnimationFrame(animate); const delta = Math.min(clock.getDelta(), .08); player.update(delta); const time = clock.elapsedTime;
  const look = new THREE.Vector3(); camera.getWorldDirection(look); look.y = 0; look.normalize();
  animateAvatar(avatar, player.position, look, player.isMoving, time);
  for (const object of objects.values()) { if (object.userData.bob) object.position.y = Math.sin(time * 2 + object.position.x) * .13; if (object.userData.pop) object.scale.setScalar(1 + Math.sin(time * 3) * .04); }
  const nearest = closestTree(world, avatar.position); nearby = nearest?.id ?? null; document.querySelector('#prompt')!.classList.toggle('show', Boolean(nearby) && player.controls.isLocked); renderer.render(scene, camera); }
