/**
 * Rubik Solver Web App Controller
 * Connects CubeModel, KociembaSolver, Cube3D, 2D 6-Face Net Editor, and Playback UI.
 */
(function () {
  'use strict';

  const CubeModel = window.CubeModel;
  const Kociemba = window.KociembaSolver;
  const Cube3D = window.Cube3D;

  // Classic Rubik's Cube patterns
  const PATTERNS = {
    checkerboard: ['R2', 'L2', 'U2', 'D2', 'F2', 'B2'],
    'cube-in-cube': ['F', 'L', 'F', "U'", 'R', 'U', 'F2', 'L2', "U'", "L'", 'B', "D'", "B'", 'L2', 'U'],
    superflip: ['U', 'R2', 'F', 'B', 'R', 'B2', 'R', 'U2', 'L', 'B2', 'R', "U'", "D'", 'R2', 'F', "R'", 'L', 'B2', 'U2', 'F2'],
    cross: ['U', 'F', "B'", 'L2', 'U2', 'L2', "F'", 'B', 'U2', 'L2', 'U'],
  };

  const COLOR_ORDER = ['W', 'R', 'G', 'Y', 'O', 'B'];

  // --- Application State ---
  let facelets = CubeModel.createSolvedFacelets();
  let selectedColor = 'W'; // Color ID ('W','R','G','Y','O','B') or null for eraser
  let unlockCenters = false;
  let isPainting = false;

  // Solution & Playback State
  let solutionMoves = [];
  let solutionStates = []; // length = solutionMoves.length + 1
  let solutionMeta = null; // { timeMs, optimal, centerColors }
  let currentStep = 0;     // 0 .. solutionMoves.length
  let isPlaying = false;
  let playTimer = null;
  let playbackSpeed = 1;

  // --- DOM Elements ---
  const elStage = document.getElementById('cube3dStage');
  const elStageStatus = document.getElementById('stageStatusText');
  const elToggleFaceLabels = document.getElementById('toggleFaceLabels');
  const elCameraPills = document.querySelectorAll('.camera-pills .pill-btn');

  const elPalette = document.getElementById('colorPalette');
  const elCubeNet = document.getElementById('cubeNet');
  const elFilledCounter = document.getElementById('filledCounter');
  const elToggleUnlockCenters = document.getElementById('toggleUnlockCenters');

  const elValidationBox = document.getElementById('validationBox');
  const elValidationIcon = document.getElementById('validationIcon');
  const elValidationTitle = document.getElementById('validationTitle');
  const elValidationDesc = document.getElementById('validationDesc');

  const elBtnSolve = document.getElementById('btnSolve');
  const elBtnSolveText = document.getElementById('btnSolveText');
  const elBtnScramble = document.getElementById('btnScramble');
  const elBtnResetSolved = document.getElementById('btnResetSolved');
  const elBtnClear = document.getElementById('btnClear');
  const elBtnPatterns = document.getElementById('btnPatterns');
  const elPatternsMenu = document.getElementById('patternsMenu');

  const elSolutionPanel = document.getElementById('solutionPanel');
  const elStatMoves = document.getElementById('statMoves');
  const elStatTime = document.getElementById('statTime');
  const elStatOptimal = document.getElementById('statOptimal');
  const elBtnCopyMoves = document.getElementById('btnCopyMoves');
  const elCopyMovesLabel = document.getElementById('copyMovesLabel');

  const elActiveMoveBadge = document.getElementById('activeMoveBadge');
  const elActiveMoveArrow = document.getElementById('activeMoveArrow');
  const elActiveMoveStep = document.getElementById('activeMoveStep');
  const elActiveMoveTitle = document.getElementById('activeMoveTitle');
  const elActiveMoveDetail = document.getElementById('activeMoveDetail');

  const elBtnFirst = document.getElementById('btnFirst');
  const elBtnPrev = document.getElementById('btnPrev');
  const elBtnPlayPause = document.getElementById('btnPlayPause');
  const elIconPlay = document.getElementById('iconPlay');
  const elIconPause = document.getElementById('iconPause');
  const elBtnNext = document.getElementById('btnNext');
  const elBtnLast = document.getElementById('btnLast');
  const elSpeedPills = document.querySelectorAll('#speedPills .speed-pill');
  const elProgressFill = document.getElementById('progressFill');
  const elProgressText = document.getElementById('progressText');
  const elMovesGrid = document.getElementById('movesGrid');

  // Registries for fast updates
  const netStickerEls = new Array(54);
  const netFaceEls = {};
  const swatchCountEls = {};
  let moveChipEls = [];

  // Initialize 3D Cube
  const cube3d = new Cube3D(elStage, {
    showFaceLabels: true,
    onStickerClick: (idx) => {
      paintSticker(idx);
    },
  });

  // --- SVG Helpers ---
  const ICONS = {
    valid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    cw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><polyline points="21 3 21 8 16 8"/></svg>',
    ccw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>',
    half: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  };

  // --- Build Palette & 2D Net ---

  function buildPalette() {
    elPalette.innerHTML = '';

    for (let i = 0; i < COLOR_ORDER.length; i++) {
      const colId = COLOR_ORDER[i];
      const info = CubeModel.COLORS[colId];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch-btn' + (selectedColor === colId ? ' is-selected' : '');
      btn.dataset.color = colId;
      btn.title = `${info.name} (tasto ${i + 1})`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(selectedColor === colId));

      const chip = document.createElement('span');
      chip.className = 'swatch-chip';
      chip.style.backgroundColor = info.hex;

      const name = document.createElement('span');
      name.className = 'swatch-name';
      name.textContent = info.name;

      const count = document.createElement('span');
      count.className = 'swatch-count';
      count.textContent = '9/9';
      swatchCountEls[colId] = count;

      btn.append(chip, name, count);
      btn.addEventListener('click', () => selectColor(colId));
      elPalette.appendChild(btn);
    }

    // Eraser swatch
    const eraserBtn = document.createElement('button');
    eraserBtn.type = 'button';
    eraserBtn.className = 'swatch-btn' + (selectedColor === null ? ' is-selected' : '');
    eraserBtn.dataset.color = 'EMPTY';
    eraserBtn.title = 'Gomma — rimuovi colore (tasto 0)';
    eraserBtn.setAttribute('role', 'radio');
    eraserBtn.setAttribute('aria-checked', 'false');

    const eChip = document.createElement('span');
    eChip.className = 'swatch-chip is-eraser';
    eChip.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/></svg>';

    const eName = document.createElement('span');
    eName.className = 'swatch-name';
    eName.textContent = 'Gomma';

    const eCount = document.createElement('span');
    eCount.className = 'swatch-count';
    eCount.textContent = '0';
    swatchCountEls.EMPTY = eCount;

    eraserBtn.append(eChip, eName, eCount);
    eraserBtn.addEventListener('click', () => selectColor(null));
    elPalette.appendChild(eraserBtn);
  }

  function selectColor(colId) {
    selectedColor = colId;
    const btns = elPalette.querySelectorAll('.swatch-btn');
    btns.forEach((b) => {
      const match = (colId === null && b.dataset.color === 'EMPTY') || b.dataset.color === colId;
      b.classList.toggle('is-selected', match);
      b.setAttribute('aria-checked', String(match));
    });
  }

  function buildNet() {
    elCubeNet.innerHTML = '';

    for (let f = 0; f < 6; f++) {
      const faceKey = CubeModel.FACES[f];
      const faceInfo = CubeModel.FACE_INFO[faceKey];

      const faceWrap = document.createElement('div');
      faceWrap.className = 'net-face';
      faceWrap.dataset.face = faceKey;
      netFaceEls[faceKey] = faceWrap;

      const title = document.createElement('div');
      title.className = 'net-face-title';
      title.innerHTML = `<span class="face-code">${faceKey}</span><span>${faceInfo.name}</span>`;

      const grid = document.createElement('div');
      grid.className = 'net-grid';

      for (let i = 0; i < 9; i++) {
        const idx = f * 9 + i;
        const isCenter = i === 4;

        const tile = document.createElement('div');
        tile.className = 'net-sticker' + (isCenter ? ' is-center is-locked' : '');
        tile.dataset.facelet = String(idx);
        tile.dataset.color = facelets[idx] || 'EMPTY';

        if (isCenter) {
          const dot = document.createElement('span');
          dot.className = 'net-center-dot';
          dot.textContent = faceKey;
          tile.appendChild(dot);
        }

        tile.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          isPainting = true;
          paintSticker(idx);
        });

        tile.addEventListener('pointerenter', () => {
          if (isPainting) {
            paintSticker(idx);
          }
        });

        grid.appendChild(tile);
        netStickerEls[idx] = tile;
      }

      faceWrap.append(title, grid);
      elCubeNet.appendChild(faceWrap);
    }

    window.addEventListener('pointerup', () => {
      isPainting = false;
    });
  }

  // --- Core Paint & Sync ---

  function paintSticker(idx) {
    const isCenter = CubeModel.CENTER_INDICES.includes(idx);
    if (isCenter && !unlockCenters) return;

    // If a solution was active, snap back to editing from the currently displayed state
    if (solutionMoves.length > 0) {
      stopPlayback();
      cube3d.cancelAnimation();
      facelets = solutionStates[currentStep].slice();
      clearSolutionUI();
    }

    if (facelets[idx] === selectedColor) return;
    facelets[idx] = selectedColor;
    renderAll();
  }

  function renderAll(displayState) {
    const state = displayState || facelets;

    // 1. Update 3D cube
    cube3d.renderState(state);

    // 2. Update 2D net
    for (let i = 0; i < 54; i++) {
      const tile = netStickerEls[i];
      if (!tile) continue;
      tile.dataset.color = state[i] || 'EMPTY';
      const isCenter = CubeModel.CENTER_INDICES.includes(i);
      if (isCenter) {
        tile.classList.toggle('is-locked', !unlockCenters);
      }
    }

    // 3. Update color counters
    const counts = { W: 0, R: 0, G: 0, Y: 0, O: 0, B: 0, EMPTY: 0 };
    let filled = 0;
    for (let i = 0; i < 54; i++) {
      const c = state[i];
      if (c && counts[c] !== undefined) {
        counts[c]++;
        filled++;
      } else {
        counts.EMPTY++;
      }
    }

    for (const colId of COLOR_ORDER) {
      const el = swatchCountEls[colId];
      const n = counts[colId];
      el.textContent = `${n}/9`;
      el.classList.remove('is-ok', 'is-over', 'is-under');
      if (n === 9) el.classList.add('is-ok');
      else if (n > 9) el.classList.add('is-over');
      else el.classList.add('is-under');
    }
    swatchCountEls.EMPTY.textContent = String(counts.EMPTY);

    elFilledCounter.textContent = `${filled} / 54`;
    elFilledCounter.classList.toggle('is-full', filled === 54);

    // 4. Live state validation (only update CTA banner if no solution is displayed)
    if (solutionMoves.length === 0) {
      updateValidationBanner(state);
    }
  }

  function updateValidationBanner(state) {
    const check = CubeModel.validateAndToCubie(state);
    elValidationBox.classList.remove('is-valid', 'is-error', 'is-warn');

    if (!check.valid) {
      if (check.code === 'INCOMPLETE') {
        elValidationBox.classList.add('is-warn');
        elValidationIcon.innerHTML = ICONS.warn;
        elValidationTitle.textContent = 'Configurazione incompleta';
      } else {
        elValidationBox.classList.add('is-error');
        elValidationIcon.innerHTML = ICONS.error;
        elValidationTitle.textContent = 'Configurazione non valida';
      }
      elValidationDesc.textContent = check.error;
      elBtnSolve.disabled = true;
      return false;
    }

    elValidationBox.classList.add('is-valid');
    elValidationIcon.innerHTML = ICONS.valid;
    elBtnSolve.disabled = false;

    if (CubeModel.isSolvedFacelets(state)) {
      elValidationTitle.textContent = 'Cubo già risolto';
      elValidationDesc.textContent = 'Premi "Mischia", scegli un "Pattern" oppure colora le 6 facce e poi premi Start.';
    } else {
      elValidationTitle.textContent = 'Cubo valido — Pronto!';
      elValidationDesc.textContent = 'Premi Start per calcolare le mosse più veloci e avviare la guida animata.';
    }
    return true;
  }

  // --- Solving ---

  function clearSolutionUI() {
    stopPlayback();
    cube3d.cancelAnimation();
    cube3d.highlightFace(null);
    highlightNetFace(null);

    solutionMoves = [];
    solutionStates = [];
    solutionMeta = null;
    currentStep = 0;
    moveChipEls = [];

    elSolutionPanel.hidden = true;
    elMovesGrid.innerHTML = '';
    elStageStatus.textContent = 'Trascina per ruotare il cubo 3D • Clicca un adesivo per colorarlo';
  }

  function highlightNetFace(faceKey) {
    for (const f of CubeModel.FACES) {
      if (netFaceEls[f]) {
        netFaceEls[f].classList.toggle('is-active-face', f === faceKey);
      }
    }
  }

  function startSolve() {
    stopPlayback();
    cube3d.cancelAnimation();

    // Always solve from the currently visible cube state if a previous solution existed
    if (solutionMoves.length > 0) {
      facelets = solutionStates[currentStep].slice();
      clearSolutionUI();
    }

    const check = CubeModel.validateAndToCubie(facelets);
    if (!check.valid) {
      updateValidationBanner(facelets);
      return;
    }

    if (CubeModel.isSolvedFacelets(facelets)) {
      elValidationBox.classList.remove('is-error', 'is-warn');
      elValidationBox.classList.add('is-valid');
      elValidationIcon.innerHTML = ICONS.valid;
      elValidationTitle.textContent = 'Il cubo è già risolto! (0 mosse)';
      elValidationDesc.textContent = 'Mischia il cubo o inserisci i colori delle 6 facce del tuo cubo per calcolare la soluzione.';
      return;
    }

    // Show computing state briefly (allows UI paint before fast synchronous solve)
    elBtnSolve.classList.add('is-solving');
    elBtnSolveText.textContent = 'Calcolo mosse...';

    requestAnimationFrame(() => {
      setTimeout(() => {
        const res = Kociemba.solveFacelets(facelets, {
          targetLength: 19,
          maxTimeMs: 220,
        });

        elBtnSolve.classList.remove('is-solving');
        elBtnSolveText.textContent = 'Start • Risolvi';

        if (!res.valid) {
          elValidationBox.classList.remove('is-valid', 'is-warn');
          elValidationBox.classList.add('is-error');
          elValidationIcon.innerHTML = ICONS.error;
          elValidationTitle.textContent = 'Impossibile risolvere';
          elValidationDesc.textContent = res.error;
          return;
        }

        // Precompute all intermediate states 0..N for instant scrubbing
        solutionMoves = res.moves;
        solutionStates = [facelets.slice()];
        let cur = facelets.slice();
        for (let i = 0; i < solutionMoves.length; i++) {
          cur = CubeModel.applyMoveToFacelets(cur, solutionMoves[i]);
          solutionStates.push(cur);
        }
        solutionMeta = {
          timeMs: res.timeMs,
          optimal: res.optimal,
          centerColors: res.centerColors,
        };
        currentStep = 0;

        renderSolutionPanel();
        updateValidationBannerForSolved(res);

        // Automatically start animated walkthrough!
        playTimer = setTimeout(() => {
          startPlayback();
        }, 320);
      }, 20);
    });
  }

  function updateValidationBannerForSolved(res) {
    elValidationBox.classList.remove('is-error', 'is-warn');
    elValidationBox.classList.add('is-valid');
    elValidationIcon.innerHTML = ICONS.valid;
    elValidationTitle.textContent = `Soluzione trovata in ${res.length} moss${res.length === 1 ? 'a' : 'e'}!`;
    elValidationDesc.textContent = `Algoritmo Kociemba 2-Phase completato in ${Math.max(1, res.timeMs)} ms. Segui l'animazione o usa i controlli passo-passo.`;
  }

  function renderSolutionPanel() {
    elSolutionPanel.hidden = false;

    const total = solutionMoves.length;
    elStatMoves.textContent = `${total} moss${total === 1 ? 'a' : 'e'}`;
    elStatTime.textContent = `${Math.max(1, solutionMeta.timeMs)} ms`;
    elStatOptimal.hidden = !solutionMeta.optimal;

    // Build clickable move chips
    elMovesGrid.innerHTML = '';
    moveChipEls = [];

    for (let i = 0; i < total; i++) {
      const mv = solutionMoves[i];
      const info = CubeModel.describeMoveItalian(mv, solutionMeta.centerColors);

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'move-chip';
      chip.setAttribute('role', 'listitem');
      chip.title = `Mossa ${i + 1}: ${info.title}`;
      chip.innerHTML = `
        <span class="move-chip-num">${i + 1}.</span>
        <span class="move-chip-dot" style="background:${info.colorHex}"></span>
        <span>${mv}</span>
      `;
      chip.addEventListener('click', () => {
        // Jump right before move i, then smoothly play move i so the user sees it!
        stopPlayback();
        cube3d.cancelAnimation();
        currentStep = i;
        renderAll(solutionStates[currentStep]);
        updatePlaybackUI();
        stepForward(false);
      });

      elMovesGrid.appendChild(chip);
      moveChipEls.push(chip);
    }

    renderAll(solutionStates[0]);
    updatePlaybackUI();
  }

  // --- Playback Engine ---

  function getTurnDurationMs() {
    return Math.max(140, Math.round(520 / playbackSpeed));
  }

  function getPauseBetweenMovesMs() {
    return Math.max(90, Math.round(280 / playbackSpeed));
  }

  function startPlayback() {
    if (solutionMoves.length === 0) return;
    // If already at the end, restart from step 0!
    if (currentStep >= solutionMoves.length) {
      jumpToStep(0);
    }
    isPlaying = true;
    updatePlayPauseIcon();
    elStageStatus.textContent = 'Riproduzione della soluzione ottimale in corso...';

    if (!cube3d.isAnimating) {
      stepForward(true);
    }
  }

  function stopPlayback() {
    isPlaying = false;
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    updatePlayPauseIcon();
  }

  function togglePlayback() {
    if (isPlaying) {
      stopPlayback();
      elStageStatus.textContent = 'In pausa • Usa le frecce o clicca una mossa per continuare';
    } else {
      startPlayback();
    }
  }

  function stepForward(continueAutoplay) {
    if (solutionMoves.length === 0) return;
    if (currentStep >= solutionMoves.length) {
      stopPlayback();
      return;
    }
    if (cube3d.isAnimating) return;

    if (!continueAutoplay) {
      stopPlayback();
    }

    const moveIdx = currentStep;
    const mv = solutionMoves[moveIdx];
    const face = mv[0];

    // Show the move currently being executed
    updateActiveMoveCard(moveIdx, true);
    highlightMoveChip(moveIdx);
    cube3d.highlightFace(face);
    highlightNetFace(face);

    cube3d.animateMove(mv, getTurnDurationMs(), (finished) => {
      if (!finished) return;

      currentStep = moveIdx + 1;
      renderAll(solutionStates[currentStep]);
      cube3d.highlightFace(null);
      highlightNetFace(null);
      updatePlaybackUI();

      if (currentStep >= solutionMoves.length) {
        stopPlayback();
        elStageStatus.textContent = 'Cubo risolto! Clicca "Mischia" o colora un nuovo cubo.';
        return;
      }

      if (isPlaying) {
        playTimer = setTimeout(() => {
          if (isPlaying) stepForward(true);
        }, getPauseBetweenMovesMs());
      }
    });
  }

  function stepBackward() {
    if (solutionMoves.length === 0 || currentStep <= 0) return;
    if (cube3d.isAnimating) return;

    stopPlayback();

    const prevMoveIdx = currentStep - 1;
    const invMove = CubeModel.invertMove(solutionMoves[prevMoveIdx]);
    const face = invMove[0];

    cube3d.highlightFace(face);
    highlightNetFace(face);

    cube3d.animateMove(invMove, Math.round(getTurnDurationMs() * 0.85), (finished) => {
      if (!finished) return;
      currentStep = prevMoveIdx;
      renderAll(solutionStates[currentStep]);
      cube3d.highlightFace(null);
      highlightNetFace(null);
      updatePlaybackUI();
    });
  }

  function jumpToStep(step) {
    if (solutionMoves.length === 0) return;
    stopPlayback();
    cube3d.cancelAnimation();
    cube3d.highlightFace(null);
    highlightNetFace(null);

    currentStep = Math.max(0, Math.min(solutionMoves.length, step));
    renderAll(solutionStates[currentStep]);
    updatePlaybackUI();
  }

  function updatePlayPauseIcon() {
    elIconPlay.hidden = isPlaying;
    elIconPause.hidden = !isPlaying;
  }

  function highlightMoveChip(activeIndex) {
    for (let i = 0; i < moveChipEls.length; i++) {
      const chip = moveChipEls[i];
      chip.classList.toggle('is-done', i < currentStep);
      chip.classList.toggle('is-current', i === activeIndex);
    }
    if (activeIndex >= 0 && activeIndex < moveChipEls.length) {
      moveChipEls[activeIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }

  function updateActiveMoveCard(moveIdx, isExecuting) {
    const total = solutionMoves.length;

    if (currentStep >= total && !isExecuting) {
      elActiveMoveBadge.textContent = 'OK';
      elActiveMoveBadge.style.borderColor = '#10b981';
      elActiveMoveBadge.style.color = '#34d399';
      elActiveMoveArrow.innerHTML = ICONS.check;
      elActiveMoveArrow.style.color = '#34d399';
      elActiveMoveStep.textContent = `Completato (${total} / ${total} mosse)`;
      elActiveMoveTitle.textContent = 'Cubo di Rubik Risolto!';
      elActiveMoveDetail.textContent = 'Tutte e 6 le facce sono allineate. Puoi rivedere qualsiasi mossa cliccandola qui sotto.';
      return;
    }

    const idx = isExecuting ? moveIdx : currentStep;
    const mv = solutionMoves[idx];
    const info = CubeModel.describeMoveItalian(mv, solutionMeta.centerColors);

    elActiveMoveBadge.textContent = mv;
    elActiveMoveBadge.style.borderColor = info.colorHex;
    elActiveMoveBadge.style.color = '#ffffff';

    elActiveMoveArrow.style.color = info.colorHex;
    if (info.turns === 1) elActiveMoveArrow.innerHTML = ICONS.cw;
    else if (info.turns === -1) elActiveMoveArrow.innerHTML = ICONS.ccw;
    else elActiveMoveArrow.innerHTML = ICONS.half;

    elActiveMoveStep.textContent = isExecuting
      ? `Esecuzione mossa ${idx + 1} di ${total}`
      : `Prossima mossa: ${idx + 1} di ${total}`;
    elActiveMoveTitle.textContent = info.title;
    elActiveMoveDetail.textContent = info.detail;
  }

  function updatePlaybackUI() {
    const total = solutionMoves.length;
    const pct = total > 0 ? Math.round((currentStep / total) * 100) : 0;

    elProgressFill.style.width = `${pct}%`;
    elProgressText.textContent = `${currentStep} / ${total}`;

    elBtnFirst.disabled = currentStep === 0;
    elBtnPrev.disabled = currentStep === 0;
    elBtnNext.disabled = currentStep >= total;
    elBtnLast.disabled = currentStep >= total;

    updatePlayPauseIcon();
    updateActiveMoveCard(currentStep, false);
    highlightMoveChip(currentStep < total ? currentStep : -1);
  }

  // --- Header & Preset Actions ---

  function applyScramble(moves, label) {
    clearSolutionUI();
    const centers = CubeModel.CENTER_INDICES.map((i) => facelets[i] || CubeModel.DEFAULT_FACE_COLORS[CubeModel.CENTER_INDICES.indexOf(i)]);
    const validDistinct = new Set(centers).size === 6 ? centers : CubeModel.DEFAULT_FACE_COLORS;
    const base = CubeModel.createSolvedFacelets(validDistinct);
    facelets = CubeModel.applyMovesToFacelets(base, moves);
    renderAll();

    elValidationTitle.textContent = label || 'Cubo mischiato — Pronto!';
    elValidationDesc.textContent = `Applicate ${moves.length} mosse (${moves.slice(0, 6).join(' ')}${moves.length > 6 ? ' ...' : ''}). Premi Start per risolverlo nel minor numero di mosse.`;
  }

  // --- Event Listeners ---

  elBtnSolve.addEventListener('click', startSolve);

  elBtnScramble.addEventListener('click', () => {
    const moves = CubeModel.generateScramble(20);
    applyScramble(moves, 'Cubo mischiato (20 mosse casuali)');
  });

  elBtnResetSolved.addEventListener('click', () => {
    clearSolutionUI();
    facelets = CubeModel.createSolvedFacelets();
    renderAll();
  });

  elBtnClear.addEventListener('click', () => {
    clearSolutionUI();
    facelets = CubeModel.createEmptyFacelets();
    renderAll();
  });

  // Patterns dropdown
  elBtnPatterns.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !elPatternsMenu.hidden;
    elPatternsMenu.hidden = isOpen;
    elBtnPatterns.setAttribute('aria-expanded', String(!isOpen));
  });

  elPatternsMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const key = item.dataset.pattern;
    const seq = PATTERNS[key];
    if (seq) {
      const title = item.querySelector('strong').textContent;
      applyScramble(seq, `Pattern "${title}" caricato`);
    }
    elPatternsMenu.hidden = true;
    elBtnPatterns.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('click', () => {
    if (!elPatternsMenu.hidden) {
      elPatternsMenu.hidden = true;
      elBtnPatterns.setAttribute('aria-expanded', 'false');
    }
  });

  // Camera views
  elCameraPills.forEach((btn) => {
    btn.addEventListener('click', () => {
      const [rx, ry] = btn.dataset.view.split(',').map(Number);
      cube3d.setView(rx, ry, true);
      elCameraPills.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  elToggleFaceLabels.addEventListener('change', () => {
    cube3d.setShowFaceLabels(elToggleFaceLabels.checked);
  });

  elToggleUnlockCenters.addEventListener('change', () => {
    unlockCenters = elToggleUnlockCenters.checked;
    renderAll(solutionMoves.length > 0 ? solutionStates[currentStep] : facelets);
  });

  // Playback buttons
  elBtnFirst.addEventListener('click', () => jumpToStep(0));
  elBtnPrev.addEventListener('click', stepBackward);
  elBtnPlayPause.addEventListener('click', togglePlayback);
  elBtnNext.addEventListener('click', () => stepForward(false));
  elBtnLast.addEventListener('click', () => jumpToStep(solutionMoves.length));

  elSpeedPills.forEach((btn) => {
    btn.addEventListener('click', () => {
      playbackSpeed = Number(btn.dataset.speed) || 1;
      elSpeedPills.forEach((b) => b.classList.toggle('is-active', b === btn));
    });
  });

  elBtnCopyMoves.addEventListener('click', () => {
    if (!solutionMoves.length) return;
    const text = solutionMoves.join(' ');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        elCopyMovesLabel.textContent = 'Copiata!';
        setTimeout(() => {
          elCopyMovesLabel.textContent = 'Copia sequenza';
        }, 1600);
      });
    } else {
      window.prompt('Sequenza di mosse:', text);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key >= '1' && e.key <= '6') {
      selectColor(COLOR_ORDER[Number(e.key) - 1]);
      return;
    }
    if (e.key === '0') {
      selectColor(null);
      return;
    }

    if (solutionMoves.length > 0) {
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepForward(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      }
    }
  });

  // --- Boot ---
  buildPalette();
  buildNet();
  renderAll();

  // Pre-warm Kociemba lookup tables quietly after initial paint so solving feels instantaneous
  setTimeout(() => {
    Kociemba.init();
  }, 180);
})();
