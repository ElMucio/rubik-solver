/**
 * Interactive 3D Rubik's Cube renderer & smooth layer-rotation animator.
 * Pure CSS 3D transforms + Vanilla JS. Zero external dependencies.
 */
(function (root) {
  'use strict';

  const CubeModel = root.CubeModel;

  // CSS 3D rotation axis and clockwise angle for each face (verified against CSS Transforms L2)
  const MOVE_ANIM = {
    U: { axis: 'Y', layerAxis: 'y', layerVal: -1, cwDeg: -90 },
    D: { axis: 'Y', layerAxis: 'y', layerVal: 1, cwDeg: 90 },
    R: { axis: 'X', layerAxis: 'x', layerVal: 1, cwDeg: 90 },
    L: { axis: 'X', layerAxis: 'x', layerVal: -1, cwDeg: -90 },
    F: { axis: 'Z', layerAxis: 'z', layerVal: 1, cwDeg: 90 },
    B: { axis: 'Z', layerAxis: 'z', layerVal: -1, cwDeg: -90 },
  };

  // Map a cubie grid coordinate (x, y, z) in {-1,0,1}^3 and face key to facelet index 0..53
  function getFaceletIndex(x, y, z, face) {
    switch (face) {
      case 'U': return 0 + (z + 1) * 3 + (x + 1);
      case 'R': return 9 + (y + 1) * 3 + (1 - z);
      case 'F': return 18 + (y + 1) * 3 + (x + 1);
      case 'D': return 27 + (1 - z) * 3 + (x + 1);
      case 'L': return 36 + (y + 1) * 3 + (z + 1);
      case 'B': return 45 + (y + 1) * 3 + (1 - x);
      default: return -1;
    }
  }

  class Cube3D {
    constructor(stageEl, options) {
      this.stageEl = stageEl;
      this.options = options || {};
      this.onStickerClick = this.options.onStickerClick || null;
      this.showFaceLabels = this.options.showFaceLabels !== false;

      // Camera Euler angles
      this.rotX = -26;
      this.rotY = -36;

      // DOM registries
      this.cubies = []; // { el, x, y, z }
      this.stickerEls = new Array(54);

      // Animation state
      this.isAnimating = false;
      this._animTimer = null;
      this._animFinish = null;

      this._buildDOM();
      this._bindOrbit();
      this._applyCamera(false);
    }

    _buildDOM() {
      this.stageEl.innerHTML = '';

      const scene = document.createElement('div');
      scene.className = 'cube3d-scene';

      const camera = document.createElement('div');
      camera.className = 'cube3d-camera';

      const cube = document.createElement('div');
      cube.className = 'cube3d-root';

      // Internal solid black core prevents any thin light seams during turns
      const core = document.createElement('div');
      core.className = 'cube3d-core';
      for (const f of ['front', 'back', 'right', 'left', 'top', 'bottom']) {
        const cf = document.createElement('div');
        cf.className = `cube3d-core-face cube3d-core-${f}`;
        core.appendChild(cf);
      }
      cube.appendChild(core);

      // Dedicated pivot container for active turning layer
      const pivot = document.createElement('div');
      pivot.className = 'cube3d-pivot';
      cube.appendChild(pivot);

      this.sceneEl = scene;
      this.cameraEl = camera;
      this.cubeEl = cube;
      this.pivotEl = pivot;

      // Create the 26 visible cubies
      for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 1; y++) {
          for (let z = -1; z <= 1; z++) {
            if (x === 0 && y === 0 && z === 0) continue;
            const cubieEl = this._createCubie(x, y, z);
            cube.appendChild(cubieEl);
            this.cubies.push({ el: cubieEl, x, y, z });
          }
        }
      }

      camera.appendChild(cube);
      scene.appendChild(camera);
      this.stageEl.appendChild(scene);
    }

    _createCubie(x, y, z) {
      const el = document.createElement('div');
      el.className = 'cubie';
      el.style.setProperty('--cx', x);
      el.style.setProperty('--cy', y);
      el.style.setProperty('--cz', z);

      const faceDefs = [
        { key: 'U', cls: 'cubie-face-u', visible: y === -1 },
        { key: 'D', cls: 'cubie-face-d', visible: y === 1 },
        { key: 'R', cls: 'cubie-face-r', visible: x === 1 },
        { key: 'L', cls: 'cubie-face-l', visible: x === -1 },
        { key: 'F', cls: 'cubie-face-f', visible: z === 1 },
        { key: 'B', cls: 'cubie-face-b', visible: z === -1 },
      ];

      for (const fd of faceDefs) {
        const faceEl = document.createElement('div');
        faceEl.className = `cubie-face ${fd.cls}`;

        if (fd.visible) {
          const idx = getFaceletIndex(x, y, z, fd.key);
          const isCenter = CubeModel.CENTER_INDICES.includes(idx);

          const sticker = document.createElement('div');
          sticker.className = 'cubie-sticker' + (isCenter ? ' is-center' : '');
          sticker.dataset.facelet = String(idx);
          sticker.dataset.face = fd.key;

          if (isCenter) {
            const label = document.createElement('span');
            label.className = 'cubie-center-label';
            label.textContent = fd.key;
            sticker.appendChild(label);
          }

          faceEl.appendChild(sticker);
          this.stickerEls[idx] = sticker;
        }
        el.appendChild(faceEl);
      }

      return el;
    }

    _bindOrbit() {
      let dragging = false;
      let moved = false;
      let startX = 0;
      let startY = 0;
      let startRotX = 0;
      let startRotY = 0;
      let pointerDownTarget = null;

      const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        startRotX = this.rotX;
        startRotY = this.rotY;
        pointerDownTarget = e.target;

        this.cameraEl.classList.remove('smooth-camera');
        this.stageEl.classList.add('is-dragging');
        if (this.stageEl.setPointerCapture) {
          try {
            this.stageEl.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
      };

      const onPointerMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 5) {
          moved = true;
        }
        if (moved) {
          this.rotY = startRotY + dx * 0.52;
          this.rotX = Math.max(-82, Math.min(82, startRotX - dy * 0.52));
          this._applyCamera(false);
        }
      };

      const onPointerUp = (e) => {
        if (!dragging) return;
        dragging = false;
        this.stageEl.classList.remove('is-dragging');
        if (this.stageEl.releasePointerCapture) {
          try {
            this.stageEl.releasePointerCapture(e.pointerId);
          } catch (_) {}
        }

        // Distinguish click-to-paint from drag-to-orbit
        if (!moved && this.onStickerClick && pointerDownTarget) {
          const sticker = pointerDownTarget.closest('.cubie-sticker');
          if (sticker && sticker.dataset.facelet !== undefined) {
            this.onStickerClick(Number(sticker.dataset.facelet));
          }
        }
        pointerDownTarget = null;
      };

      this.stageEl.addEventListener('pointerdown', onPointerDown);
      this.stageEl.addEventListener('pointermove', onPointerMove);
      this.stageEl.addEventListener('pointerup', onPointerUp);
      this.stageEl.addEventListener('pointercancel', onPointerUp);
    }

    _applyCamera(smooth) {
      if (smooth) {
        this.cameraEl.classList.add('smooth-camera');
      } else {
        this.cameraEl.classList.remove('smooth-camera');
      }
      this.cameraEl.style.transform = `rotateX(${this.rotX}deg) rotateY(${this.rotY}deg)`;
    }

    setView(rotX, rotY, smooth = true) {
      this.rotX = rotX;
      this.rotY = rotY;
      this._applyCamera(smooth);
    }

    setShowFaceLabels(show) {
      this.showFaceLabels = show;
      this.stageEl.classList.toggle('hide-face-labels', !show);
    }

    /**
     * Update all 54 stickers to match the given 54-element facelet color array.
     */
    renderState(facelets) {
      for (let i = 0; i < 54; i++) {
        const el = this.stickerEls[i];
        if (!el) continue;
        const colorId = facelets[i];
        el.dataset.color = colorId || 'EMPTY';
      }
    }

    /**
     * Highlight a specific face briefly (e.g. active move face).
     */
    highlightFace(faceKey) {
      for (let i = 0; i < 54; i++) {
        const el = this.stickerEls[i];
        if (!el) continue;
        el.classList.toggle('is-active-face', Boolean(faceKey && el.dataset.face === faceKey));
      }
    }

    /**
     * Immediately cancel any in-flight layer rotation and restore DOM cleanly.
     */
    cancelAnimation() {
      if (!this.isAnimating) return;
      if (this._animTimer) {
        clearTimeout(this._animTimer);
        this._animTimer = null;
      }
      this.pivotEl.style.transition = 'none';
      this.pivotEl.style.transform = '';
      while (this.pivotEl.firstChild) {
        this.cubeEl.appendChild(this.pivotEl.firstChild);
      }
      this.isAnimating = false;
      this._animFinish = null;
    }

    /**
     * Smoothly animate a single Rubik's move ("U", "R'", "F2", etc.).
     * Calls `onComplete(finishedNaturally)` right as the layer snaps back cleanly.
     */
    animateMove(move, durationMs, onComplete) {
      this.cancelAnimation();

      const face = move[0];
      const mod = move.slice(1);
      const spec = MOVE_ANIM[face];
      if (!spec) {
        if (onComplete) onComplete(false);
        return;
      }

      let deg = spec.cwDeg;
      let dur = durationMs || 380;
      if (mod === "'") {
        deg = -spec.cwDeg;
      } else if (mod === '2') {
        deg = spec.cwDeg * 2;
        dur = Math.round(dur * 1.28);
      }

      this.isAnimating = true;

      // Move the 9 layer cubies into the pivot
      const layerCubies = this.cubies.filter((c) => c[spec.layerAxis] === spec.layerVal);
      this.pivotEl.style.transition = 'none';
      this.pivotEl.style.transform = `rotate${spec.axis}(0deg)`;
      for (const c of layerCubies) {
        this.pivotEl.appendChild(c.el);
      }

      // Force synchronous reflow so the initial 0deg transform is committed
      void this.pivotEl.offsetWidth;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (this._animTimer) {
          clearTimeout(this._animTimer);
          this._animTimer = null;
        }
        this.pivotEl.removeEventListener('transitionend', onTransitionEnd);

        // Reset pivot & return cubies in the same JS turn before repainting stickers
        this.pivotEl.style.transition = 'none';
        this.pivotEl.style.transform = '';
        for (const c of layerCubies) {
          this.cubeEl.appendChild(c.el);
        }
        this.isAnimating = false;
        this._animFinish = null;
        if (onComplete) onComplete(true);
      };

      const onTransitionEnd = (e) => {
        if (e.target === this.pivotEl && e.propertyName === 'transform') {
          finish();
        }
      };

      this._animFinish = finish;
      this.pivotEl.addEventListener('transitionend', onTransitionEnd);
      // Fallback timer guarantees completion even if tab loses focus
      this._animTimer = setTimeout(finish, dur + 70);

      // Kick off smooth GPU transform
      this.pivotEl.style.transition = `transform ${dur}ms cubic-bezier(0.32, 0.06, 0.22, 1)`;
      this.pivotEl.style.transform = `rotate${spec.axis}(${deg}deg)`;
    }
  }

  root.Cube3D = Cube3D;
})(typeof window !== 'undefined' ? window : globalThis);
