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
import type { World } from '../../shared/types';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `<div id="hud"><div class="brand">MASTERY <span>GROVE</span></div><div class="topic">Primary 5 · Mathematics · Fractions</div></div><div id="prompt">Press <kbd>E</kbd> to tend this tree</div><div id="toast"></div><div id="levelup">LEVEL UP <small>Primary 6 Fractions unlocked</small></div><div id="question-overlay"></div><button id="enter">ENTER THE GROVE <small>WASD to walk · mouse to look · Shift to sprint</small></button>`;
const canvas = document.createElement('canvas'); document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, .1, 250); const scene = createScene(); const player = new Player(camera, document.body);
const forest = new THREE.Group(); scene.add(forest); let world: World; let nearby: string | null = null; const objects = new Map<string, THREE.Group>(); const clock = new THREE.Clock();
function renderForest() {
  forest.clear(); objects.clear();
  for (const tree of world.trees) { const concept = world.concepts.find((item) => item.id === tree.conceptId)!; const object = buildTree(tree.state, tree.id, isLocked(world, concept)); object.position.set(...tree.pos); forest.add(object); objects.set(tree.id, object); }
  for (const concept of world.concepts) { const locked = isLocked(world, concept); const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: textSprite(locked ? 'LOCKED' : concept.name, locked ? '#9b8791' : '#fff3cf') })); sign.position.set(concept.centre[0], 5, concept.centre[2]); sign.scale.set(7, 1.35, 1); forest.add(sign); }
}
function textSprite(text: string, color: string) { const c = document.createElement('canvas'); c.width = 512; c.height = 96; const ctx = c.getContext('2d')!; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text.toUpperCase(), 256, 56); const texture = new THREE.CanvasTexture(c); return texture; }
function toast(message: string) { const el = document.querySelector<HTMLElement>('#toast')!; el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 4000); }
function openTree(treeId: string) { const tree = world.trees.find((item) => item.id === treeId)!; player.controls.unlock(); showQuestion(tree, async (response) => { const result = await answer(world, tree.id, response); tree.state = result.treeState; renderForest(); if (result.correct) { closeQuestion(); toast('The grove brightens. Your understanding is taking root.'); } else showHint(result.scaffoldHint ?? 'What could you try next?', () => { closeQuestion(); toast(`A sapling of ${world.concepts.find((c) => c.id === tree.conceptId)?.name} has taken root further along the path.`); }); }, closeQuestion); }
const enter = document.querySelector<HTMLElement>('#enter')!;
player.controls.addEventListener('lock', () => { enter.style.display = 'none'; });
player.controls.addEventListener('unlock', () => { enter.style.display = ''; });
enter.addEventListener('click', () => player.controls.lock());
window.addEventListener('keydown', (event) => { if (event.code === 'KeyE' && nearby && player.controls.isLocked) openTree(nearby); });
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setSize(innerWidth, innerHeight);
getWorld().then((loaded) => { world = layout(loaded); renderForest(); animate(); });
function animate() { requestAnimationFrame(animate); const delta = Math.min(clock.getDelta(), .08); player.update(delta); const time = clock.elapsedTime; for (const object of objects.values()) { if (object.userData.bob) object.position.y = Math.sin(time * 2 + object.position.x) * .13; if (object.userData.pop) object.scale.setScalar(1 + Math.sin(time * 3) * .04); }
  const nearest = closestTree(world, camera.position); nearby = nearest?.id ?? null; document.querySelector('#prompt')!.classList.toggle('show', Boolean(nearby) && player.controls.isLocked); renderer.render(scene, camera); }
