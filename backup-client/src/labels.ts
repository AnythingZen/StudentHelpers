import type * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Remove an object and delete the DOM elements of every CSS2D label inside it.
 * three.js fires 'removed' only on the object passed to remove(), never its
 * children — and CSS2DObject cleans up its element on its own 'removed' event.
 * So removing a group that holds labels leaves those labels frozen on screen.
 */
export function removeWithLabels(parent: THREE.Object3D, obj: THREE.Object3D): void {
  obj.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); });
  parent.remove(obj);
}
