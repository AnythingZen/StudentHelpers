// Answer stones: you answer by walking. Stones rise in an arc between you and
// the tree; stand on one and a ring fills over ~0.6s, so walking past a stone by
// accident never submits. Pointer lock never releases, the game never stops.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Tree } from '../../server/src/contract';
import { removeWithLabels } from './labels';

const FILL_SECONDS = 0.6;
const STAND_RADIUS = 1.0;

interface Stone { root: THREE.Group; disc: THREE.Mesh; label: HTMLDivElement; fill: number }

export class AnswerStones {
  private stones: Stone[] = [];
  private card: CSS2DObject | null = null;
  private rise = 0;
  private sinkAt: number | null = null;
  private fired = false;
  // After an answer the student must step off every stone before one can fill
  // again; otherwise standing still on a wrong stone re-submits it in a loop.
  private armed = true;
  treeId: string | null = null;

  constructor(private readonly scene: THREE.Scene) {}

  get open(): boolean { return this.treeId !== null && this.sinkAt === null; }

  show(tree: Tree, questName: string, from: THREE.Vector3): void {
    this.clear();
    this.treeId = tree.id;
    this.fired = false;
    this.armed = true;
    this.rise = 0;
    const treePos = new THREE.Vector3(...tree.pos);
    const toPlayer = new THREE.Vector3(from.x - treePos.x, 0, from.z - treePos.z);
    if (toPlayer.lengthSq() < 0.01) toPlayer.set(0, 0, 1);
    toPlayer.normalize();
    const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
    const choices = tree.choices ?? [];

    choices.forEach((_choice, i) => {
      const offset = (i - (choices.length - 1) / 2) * 2.4;
      const pos = treePos.clone().addScaledVector(toPlayer, 3.4 - Math.abs(offset) * 0.18).addScaledVector(side, offset);
      const root = new THREE.Group();
      root.position.set(pos.x, -0.5, pos.z);
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.4, 8),
        new THREE.MeshLambertMaterial({ color: 0xb9b3a6, flatShading: true, emissive: 0x9fd8ff, emissiveIntensity: 0.25 }));
      stone.castShadow = true;
      root.add(stone);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: 0.9 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.21;
      disc.scale.setScalar(0.001);
      root.add(disc);
      // A big letter on the stone; the full answer is listed on the question card.
      // Long answers floating over the stones collided with each other on screen.
      const label = document.createElement('div');
      label.className = 'label stone-label';
      label.textContent = 'ABCDEF'[i] ?? String(i + 1);
      const tag = new CSS2DObject(label);
      tag.position.y = 1.2;
      root.add(tag);
      this.scene.add(root);
      this.stones.push({ root, disc, label, fill: 0 });
    });

    const cardEl = document.createElement('div');
    cardEl.className = 'label question-card';
    cardEl.innerHTML = `<b></b><ol class="options"></ol><small></small><em class="cite"></em>`;
    cardEl.querySelector('b')!.textContent = tree.question;
    const list = cardEl.querySelector('.options')!;
    choices.forEach((text, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span></span> ';
      li.querySelector('span')!.textContent = 'ABCDEF'[i] ?? String(i + 1);
      li.append(document.createTextNode(text));
      list.append(li);
    });
    cardEl.querySelector('small')!.textContent = `${questName} · walk onto a stone to answer`;
    // The page and passage this question came from, verified against the worksheet by the server.
    const cite = cardEl.querySelector<HTMLElement>('.cite')!;
    if (tree.citation) {
      const quote = tree.citation.quote.length > 90 ? `${tree.citation.quote.slice(0, 89)}…` : tree.citation.quote;
      cite.textContent = `📄 Worksheet p.${tree.citation.page} — “${quote}”`;
    } else cite.remove();
    this.card = new CSS2DObject(cardEl);
    this.card.position.set(treePos.x, 5.6, treePos.z);
    this.scene.add(this.card);
  }

  /** Returns the chosen index once, the moment a stone's ring fills. */
  update(dt: number, player: THREE.Vector3, now: number): number | null {
    if (this.sinkAt !== null) {
      const k = Math.min(1, (now - this.sinkAt) / 400);
      this.stones.forEach(s => (s.root.position.y = 0 - k * 0.8));
      if (k >= 1) this.clear();
      return null;
    }
    if (!this.treeId) return null;
    this.rise = Math.min(1, this.rise + dt / 0.4);
    let chosen: number | null = null;
    const onAny = this.stones.some(s => Math.hypot(player.x - s.root.position.x, player.z - s.root.position.z) <= STAND_RADIUS);
    if (!this.armed && !onAny) this.armed = true;
    this.stones.forEach((s, i) => {
      s.root.position.y = -0.5 + this.rise * 0.5;
      const d = Math.hypot(player.x - s.root.position.x, player.z - s.root.position.z);
      const standing = this.rise >= 1 && d <= STAND_RADIUS && !this.fired && this.armed;
      s.fill = Math.max(0, Math.min(1, s.fill + (standing ? dt / FILL_SECONDS : -dt / 0.4)));
      s.disc.scale.setScalar(Math.max(0.001, s.fill));
      s.label.classList.toggle('active', standing);
      if (s.fill >= 1 && !this.fired) { this.fired = true; chosen = i; }
    });
    return chosen;
  }

  /** Where each stone stands, in choice order. Used by the ?debug=1 test hook. */
  positions(): Array<[number, number]> { return this.stones.map(s => [s.root.position.x, s.root.position.z]); }

  /** Let the student try again without walking away and back. */
  rearm(): void { this.fired = false; this.armed = false; this.stones.forEach(s => (s.fill = 0)); }

  sink(now: number): void { if (this.treeId) this.sinkAt = now; }

  clear(): void {
    this.stones.forEach(s => removeWithLabels(this.scene, s.root));   // stone labels are children — see labels.ts
    if (this.card) this.scene.remove(this.card);
    this.stones = []; this.card = null; this.treeId = null; this.sinkAt = null;
  }
}
