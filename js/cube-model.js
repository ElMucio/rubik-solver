/**
 * Cube Model, Move Engine, Facelet <-> Cubie conversion, and State Validator.
 * Standard Kociemba URFDLB facelet indexing (0..53):
 *   U: 0..8   (Alto    - default Bianco)
 *   R: 9..17  (Destra  - default Rosso)
 *   F: 18..26 (Fronte  - default Verde)
 *   D: 27..35 (Basso   - default Giallo)
 *   L: 36..44 (Sinistra- default Arancione)
 *   B: 45..53 (Retro   - default Blu)
 */
(function (root) {
  'use strict';

  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const CENTER_INDICES = [4, 13, 22, 31, 40, 49];

  // Official Western / WCA color scheme (White on Top, Green in Front)
  const COLORS = {
    W: { id: 'W', name: 'Bianco', hex: '#F7F9FC', face: 'U' },
    R: { id: 'R', name: 'Rosso', hex: '#E12D39', face: 'R' },
    G: { id: 'G', name: 'Verde', hex: '#14A44D', face: 'F' },
    Y: { id: 'Y', name: 'Giallo', hex: '#F5C518', face: 'D' },
    O: { id: 'O', name: 'Arancione', hex: '#F97316', face: 'L' },
    B: { id: 'B', name: 'Blu', hex: '#1D63ED', face: 'B' },
  };

  const DEFAULT_FACE_COLORS = ['W', 'R', 'G', 'Y', 'O', 'B'];

  const FACE_INFO = {
    U: { name: 'Alto', short: 'U', defaultColor: 'W' },
    R: { name: 'Destra', short: 'R', defaultColor: 'R' },
    F: { name: 'Fronte', short: 'F', defaultColor: 'G' },
    D: { name: 'Basso', short: 'D', defaultColor: 'Y' },
    L: { name: 'Sinistra', short: 'L', defaultColor: 'O' },
    B: { name: 'Retro', short: 'B', defaultColor: 'B' },
  };

  // Corner facelets in clockwise order starting with U/D facelet
  // 0:URF, 1:UFL, 2:ULB, 3:UBR, 4:DFR, 5:DLF, 6:DBL, 7:DRB
  const CORNER_FACELET = [
    [8, 9, 20],   // URF: U8, R0, F2
    [6, 18, 38],  // UFL: U6, F0, L2
    [0, 36, 47],  // ULB: U0, L0, B2
    [2, 45, 11],  // UBR: U2, B0, R2
    [29, 26, 15], // DFR: D2, F8, R6
    [27, 44, 24], // DLF: D0, L8, F6
    [33, 53, 42], // DBL: D6, B8, L6
    [35, 17, 51], // DRB: D8, R8, B6
  ];

  // Edge facelets starting with U/D (for UD edges) or F/B (for E-slice edges)
  // 0:UR, 1:UF, 2:UL, 3:UB, 4:DR, 5:DF, 6:DL, 7:DB, 8:FR, 9:FL, 10:BL, 11:BR
  const EDGE_FACELET = [
    [5, 10],  // UR: U5, R1
    [7, 19],  // UF: U7, F1
    [3, 37],  // UL: U3, L1
    [1, 46],  // UB: U1, B1
    [32, 16], // DR: D5, R7
    [28, 25], // DF: D1, F7
    [30, 43], // DL: D3, L7
    [34, 52], // DB: D7, B7
    [23, 12], // FR: F5, R3
    [21, 41], // FL: F3, L5
    [50, 39], // BL: B5, L3
    [48, 14], // BR: B3, R5
  ];

  // Canonical face indices (0..5 = U,R,F,D,L,B) for each corner & edge
  const CORNER_COLOR = [
    [0, 1, 2], // URF
    [0, 2, 4], // UFL
    [0, 4, 5], // ULB
    [0, 5, 1], // UBR
    [3, 2, 1], // DFR
    [3, 4, 2], // DLF
    [3, 5, 4], // DBL
    [3, 1, 5], // DRB
  ];

  const EDGE_COLOR = [
    [0, 1], // UR
    [0, 2], // UF
    [0, 4], // UL
    [0, 5], // UB
    [3, 1], // DR
    [3, 2], // DF
    [3, 4], // DL
    [3, 5], // DB
    [2, 1], // FR
    [2, 4], // FL
    [5, 4], // BL
    [5, 1], // BR
  ];

  // Basic 6 clockwise moves at cubie level (U, R, F, D, L, B)
  // Convention: new_cp[i] = old_cp[move.cp[i]]
  //             new_co[i] = (old_co[move.cp[i]] + move.co[i]) % 3
  const BASIC_MOVES = [
    {
      // 0: U
      cp: [3, 0, 1, 2, 4, 5, 6, 7],
      co: [0, 0, 0, 0, 0, 0, 0, 0],
      ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11],
      eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      // 1: R
      cp: [4, 1, 2, 0, 7, 5, 6, 3],
      co: [2, 0, 0, 1, 1, 0, 0, 2],
      ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0],
      eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      // 2: F
      cp: [1, 5, 2, 3, 0, 4, 6, 7],
      co: [1, 2, 0, 0, 2, 1, 0, 0],
      ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11],
      eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0],
    },
    {
      // 3: D
      cp: [0, 1, 2, 3, 5, 6, 7, 4],
      co: [0, 0, 0, 0, 0, 0, 0, 0],
      ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11],
      eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      // 4: L
      cp: [0, 2, 6, 3, 4, 1, 5, 7],
      co: [0, 1, 2, 0, 0, 2, 1, 0],
      ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11],
      eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
      // 5: B
      cp: [0, 1, 3, 7, 4, 5, 2, 6],
      co: [0, 0, 1, 2, 0, 0, 2, 1],
      ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7],
      eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1],
    },
  ];

  // Move names indexed 0..17: U, U2, U', R, R2, R', F, F2, F', D, D2, D', L, L2, L', B, B2, B'
  const MOVE_NAMES = [];
  const MOVE_INDEX = {};
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const suffixes = ['', '2', "'"];
    for (let p = 0; p < 3; p++) {
      const name = face + suffixes[p];
      MOVE_INDEX[name] = f * 3 + p;
      MOVE_NAMES.push(name);
    }
  }

  function createSolvedCubie() {
    return {
      cp: [0, 1, 2, 3, 4, 5, 6, 7],
      co: [0, 0, 0, 0, 0, 0, 0, 0],
      ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    };
  }

  function cloneCubie(c) {
    return {
      cp: c.cp.slice(),
      co: c.co.slice(),
      ep: c.ep.slice(),
      eo: c.eo.slice(),
    };
  }

  function multiplyCubie(a, b) {
    const cp = new Array(8);
    const co = new Array(8);
    for (let i = 0; i < 8; i++) {
      cp[i] = a.cp[b.cp[i]];
      co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
    }
    const ep = new Array(12);
    const eo = new Array(12);
    for (let i = 0; i < 12; i++) {
      ep[i] = a.ep[b.ep[i]];
      eo[i] = (a.eo[b.ep[i]] + b.eo[i]) & 1;
    }
    return { cp, co, ep, eo };
  }

  // Precompute all 18 cubie moves
  const ALL_MOVES = [];
  for (let f = 0; f < 6; f++) {
    const m1 = BASIC_MOVES[f];
    const m2 = multiplyCubie(m1, m1);
    const m3 = multiplyCubie(m2, m1);
    ALL_MOVES.push(m1, m2, m3);
  }

  // Precompute facelet permutation for all 18 moves directly from cubie moves!
  // This guarantees 100% consistency between facelet moves and cubie moves.
  function cubieToFaceIndices(cubie) {
    const f = new Array(54);
    for (let i = 0; i < 6; i++) {
      f[CENTER_INDICES[i]] = CENTER_INDICES[i];
    }
    for (let i = 0; i < 8; i++) {
      const piece = cubie.cp[i];
      const ori = cubie.co[i];
      for (let k = 0; k < 3; k++) {
        // Facelet at slot i, offset (k + ori) % 3 gets sticker from piece, offset k
        f[CORNER_FACELET[i][(k + ori) % 3]] = CORNER_FACELET[piece][k];
      }
    }
    for (let i = 0; i < 12; i++) {
      const piece = cubie.ep[i];
      const ori = cubie.eo[i];
      for (let k = 0; k < 2; k++) {
        f[EDGE_FACELET[i][(k + ori) & 1]] = EDGE_FACELET[piece][k];
      }
    }
    return f;
  }

  const FACELET_MOVE_PERM = ALL_MOVES.map(cubieToFaceIndices);

  /**
   * Create a solved 54-sticker array using the specified 6 center colors (default W,R,G,Y,O,B).
   */
  function createSolvedFacelets(centerColors) {
    const colors = centerColors || DEFAULT_FACE_COLORS;
    const arr = new Array(54);
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 9; i++) {
        arr[f * 9 + i] = colors[f];
      }
    }
    return arr;
  }

  /**
   * Create a blank 54-sticker array (only centers filled, rest null).
   */
  function createEmptyFacelets(centerColors) {
    const colors = centerColors || DEFAULT_FACE_COLORS;
    const arr = new Array(54).fill(null);
    for (let f = 0; f < 6; f++) {
      arr[CENTER_INDICES[f]] = colors[f];
    }
    return arr;
  }

  /**
   * Apply a move (e.g. "R", "U'", "F2" or move index 0..17) to a 54-facelet array.
   * Returns a new 54-element array.
   */
  function applyMoveToFacelets(facelets, move) {
    const idx = typeof move === 'number' ? move : MOVE_INDEX[move];
    if (idx === undefined) {
      throw new Error('Mossa sconosciuta: ' + move);
    }
    const perm = FACELET_MOVE_PERM[idx];
    const next = new Array(54);
    for (let i = 0; i < 54; i++) {
      next[i] = facelets[perm[i]];
    }
    return next;
  }

  function applyMovesToFacelets(facelets, moves) {
    let cur = facelets.slice();
    for (let i = 0; i < moves.length; i++) {
      cur = applyMoveToFacelets(cur, moves[i]);
    }
    return cur;
  }

  function invertMove(move) {
    if (move.endsWith('2')) return move;
    if (move.endsWith("'")) return move[0];
    return move + "'";
  }

  function isSolvedFacelets(facelets) {
    for (let f = 0; f < 6; f++) {
      const c = facelets[CENTER_INDICES[f]];
      if (!c) return false;
      for (let i = 0; i < 9; i++) {
        if (facelets[f * 9 + i] !== c) return false;
      }
    }
    return true;
  }

  function countParity(perm) {
    let inv = 0;
    for (let i = 0; i < perm.length; i++) {
      for (let j = i + 1; j < perm.length; j++) {
        if (perm[i] > perm[j]) inv++;
      }
    }
    return inv & 1;
  }

  /**
   * Validate a 54-facelet array and convert to Cubie representation.
   * Dynamically maps whatever distinct colors occupy the 6 centers to U, R, F, D, L, B!
   * Returns { valid: true, cubie, centerColors, faceletFaces }
   *      or { valid: false, error: string, code: string }
   */
  function validateAndToCubie(facelets) {
    if (!Array.isArray(facelets) || facelets.length !== 54) {
      return {
        valid: false,
        code: 'INVALID_LENGTH',
        error: 'Il cubo deve avere esattamente 54 adesivi.',
      };
    }

    // 1. Check unfilled stickers
    let missingCount = 0;
    for (let i = 0; i < 54; i++) {
      if (!facelets[i]) missingCount++;
    }
    if (missingCount > 0) {
      return {
        valid: false,
        code: 'INCOMPLETE',
        error: `Mancano ancora ${missingCount} adesiv${missingCount === 1 ? 'o' : 'i'} da colorare prima di poter risolvere il cubo.`,
      };
    }

    // 2. Check centers are 6 distinct colors
    const centerColors = CENTER_INDICES.map((idx) => facelets[idx]);
    const colorToFace = {};
    for (let f = 0; f < 6; f++) {
      const col = centerColors[f];
      if (colorToFace[col] !== undefined) {
        const colName = COLORS[col] ? COLORS[col].name : col;
        return {
          valid: false,
          code: 'DUPLICATE_CENTER',
          error: `Il colore ${colName} compare su due centri diversi. Ogni faccia deve avere un colore centrale unico.`,
        };
      }
      colorToFace[col] = f;
    }

    // 3. Check exactly 9 of each center color
    const counts = [0, 0, 0, 0, 0, 0];
    const fIdx = new Array(54);
    for (let i = 0; i < 54; i++) {
      const face = colorToFace[facelets[i]];
      if (face === undefined) {
        const colName = COLORS[facelets[i]] ? COLORS[facelets[i]].name : facelets[i];
        return {
          valid: false,
          code: 'UNKNOWN_COLOR',
          error: `Il colore ${colName} non corrisponde a nessuno dei 6 centri del cubo.`,
        };
      }
      fIdx[i] = face;
      counts[face]++;
    }

    for (let f = 0; f < 6; f++) {
      if (counts[f] !== 9) {
        const colName = COLORS[centerColors[f]] ? COLORS[centerColors[f]].name : centerColors[f];
        return {
          valid: false,
          code: 'WRONG_COUNT',
          error: `Il colore ${colName} ha ${counts[f]} adesivi invece di 9. Controlla i contatori dei colori.`,
        };
      }
    }

    // 4. Extract corners
    const cp = new Array(8).fill(-1);
    const co = new Array(8).fill(0);
    const seenCorners = new Array(8).fill(false);

    for (let i = 0; i < 8; i++) {
      const slot = CORNER_FACELET[i];
      // Find which of the 3 facelets has U (0) or D (3) color
      let ori = -1;
      for (let k = 0; k < 3; k++) {
        const col = fIdx[slot[k]];
        if (col === 0 || col === 3) {
          ori = k;
          break;
        }
      }
      if (ori === -1) {
        return {
          valid: false,
          code: 'INVALID_CORNER',
          error: 'Un angolo non contiene né il colore della faccia Alta né quello della faccia Bassa. Controlla i colori degli angoli.',
        };
      }
      const c0 = fIdx[slot[ori]];
      const c1 = fIdx[slot[(ori + 1) % 3]];
      const c2 = fIdx[slot[(ori + 2) % 3]];

      let matched = -1;
      for (let j = 0; j < 8; j++) {
        if (
          CORNER_COLOR[j][0] === c0 &&
          CORNER_COLOR[j][1] === c1 &&
          CORNER_COLOR[j][2] === c2
        ) {
          matched = j;
          break;
        }
      }
      if (matched === -1) {
        return {
          valid: false,
          code: 'IMPOSSIBLE_CORNER',
          error: 'Combinazione di colori impossibile su un angolo (verifica se hai invertito due facce o due adesivi su uno spigolo d\'angolo).',
        };
      }
      if (seenCorners[matched]) {
        return {
          valid: false,
          code: 'DUPLICATE_CORNER',
          error: 'Lo stesso pezzo d\'angolo appare due volte. Controlla gli adesivi degli angoli.',
        };
      }
      seenCorners[matched] = true;
      cp[i] = matched;
      co[i] = ori;
    }

    // 5. Extract edges
    const ep = new Array(12).fill(-1);
    const eo = new Array(12).fill(0);
    const seenEdges = new Array(12).fill(false);

    for (let i = 0; i < 12; i++) {
      const slot = EDGE_FACELET[i];
      const e0 = fIdx[slot[0]];
      const e1 = fIdx[slot[1]];

      let matched = -1;
      let ori = 0;
      for (let j = 0; j < 12; j++) {
        if (EDGE_COLOR[j][0] === e0 && EDGE_COLOR[j][1] === e1) {
          matched = j;
          ori = 0;
          break;
        }
        if (EDGE_COLOR[j][0] === e1 && EDGE_COLOR[j][1] === e0) {
          matched = j;
          ori = 1;
          break;
        }
      }
      if (matched === -1) {
        return {
          valid: false,
          code: 'IMPOSSIBLE_EDGE',
          error: 'Esiste uno spigolo con colori impossibili (ad esempio due colori di facce opposte sullo stesso spigolo).',
        };
      }
      if (seenEdges[matched]) {
        return {
          valid: false,
          code: 'DUPLICATE_EDGE',
          error: 'Lo stesso pezzo di spigolo appare due volte. Controlla i colori inseriti.',
        };
      }
      seenEdges[matched] = true;
      ep[i] = matched;
      eo[i] = ori;
    }

    // 6. Parity checks (physics of a real 3x3 Rubik's Cube)
    let coSum = 0;
    for (let i = 0; i < 8; i++) coSum += co[i];
    if (coSum % 3 !== 0) {
      return {
        valid: false,
        code: 'CORNER_TWIST_PARITY',
        error: 'Errore di orientamento angoli: un angolo risulta ruotato in modo fisicamente impossibile. Controlla gli angoli del cubo.',
      };
    }

    let eoSum = 0;
    for (let i = 0; i < 12; i++) eoSum += eo[i];
    if (eoSum % 2 !== 0) {
      return {
        valid: false,
        code: 'EDGE_FLIP_PARITY',
        error: 'Errore di orientamento spigoli: uno spigolo risulta capovolto in modo fisicamente impossibile. Controlla gli spigoli.',
      };
    }

    if (countParity(cp) !== countParity(ep)) {
      return {
        valid: false,
        code: 'PERMUTATION_PARITY',
        error: 'Errore di parità: due pezzi risultano scambiati tra loro (configurazione non risolvibile senza smontare il cubo). Ricontrolla gli adesivi.',
      };
    }

    return {
      valid: true,
      cubie: { cp, co, ep, eo },
      centerColors,
      faceletFaces: fIdx,
    };
  }

  /**
   * Generate a random valid scramble sequence of `length` moves (default 20).
   */
  function generateScramble(length) {
    const len = length || 20;
    const moves = [];
    let lastFace = -1;
    let secondLastFace = -1;
    const suffixes = ['', "'", '2'];

    for (let i = 0; i < len; i++) {
      let f;
      while (true) {
        f = Math.floor(Math.random() * 6);
        if (f === lastFace) continue;
        // Avoid redundant U D U patterns
        if (secondLastFace === f && Math.abs(f - lastFace) === 3) continue;
        break;
      }
      const suf = suffixes[Math.floor(Math.random() * 3)];
      moves.push(FACES[f] + suf);
      secondLastFace = lastFace;
      lastFace = f;
    }
    return moves;
  }

  /**
   * Human-readable Italian explanation for a single Rubik's notation move.
   */
  function describeMoveItalian(move, centerColors) {
    const face = move[0];
    const mod = move.slice(1);
    const faceIdx = FACES.indexOf(face);
    const info = FACE_INFO[face];
    const colId = centerColors ? centerColors[faceIdx] : info.defaultColor;
    const colName = COLORS[colId] ? COLORS[colId].name : '';

    let dirLabel = 'Orario 90°';
    let dirVerb = 'in senso orario di 90° (un quarto di giro)';
    let turns = 1;

    if (mod === "'") {
      dirLabel = 'Antiorario 90°';
      dirVerb = 'in senso antiorario di 90° (un quarto di giro)';
      turns = -1;
    } else if (mod === '2') {
      dirLabel = 'Doppio 180°';
      dirVerb = 'di 180° (mezzo giro)';
      turns = 2;
    }

    const hints = {
      U: mod === "'" ? 'Spingi lo strato superiore verso destra' : mod === '2' ? 'Ruota lo strato superiore di mezzo giro' : 'Spingi lo strato superiore verso sinistra',
      D: mod === "'" ? 'Spingi lo strato inferiore verso sinistra' : mod === '2' ? 'Ruota lo strato inferiore di mezzo giro' : 'Spingi lo strato inferiore verso destra',
      R: mod === "'" ? 'Porta il lato destro verso il basso (verso di te)' : mod === '2' ? 'Ruota il lato destro di mezzo giro' : 'Spingi il lato destro verso l\'alto (lontano da te)',
      L: mod === "'" ? 'Spingi il lato sinistro verso l\'alto (lontano da te)' : mod === '2' ? 'Ruota il lato sinistro di mezzo giro' : 'Porta il lato sinistro verso il basso (verso di te)',
      F: mod === "'" ? 'Ruota la faccia frontale a sinistra (antiorario)' : mod === '2' ? 'Ruota la faccia frontale di mezzo giro' : 'Ruota la faccia frontale a destra (orario)',
      B: mod === "'" ? 'Ruota la faccia posteriore guardandola da dietro in antiorario' : mod === '2' ? 'Ruota la faccia posteriore di mezzo giro' : 'Ruota la faccia posteriore guardandola da dietro in orario',
    };

    return {
      move,
      face,
      faceName: info.name,
      colorId: colId,
      colorName: colName,
      colorHex: COLORS[colId] ? COLORS[colId].hex : '#ffffff',
      dirLabel,
      turns,
      title: `Faccia ${info.name} (${colName}) — ${dirLabel}`,
      detail: `Ruota la faccia ${info.name} ${dirVerb}. ${hints[face]}.`,
    };
  }

  const api = {
    FACES,
    CENTER_INDICES,
    COLORS,
    DEFAULT_FACE_COLORS,
    FACE_INFO,
    CORNER_FACELET,
    EDGE_FACELET,
    CORNER_COLOR,
    EDGE_COLOR,
    BASIC_MOVES,
    ALL_MOVES,
    MOVE_NAMES,
    MOVE_INDEX,
    FACELET_MOVE_PERM,
    createSolvedCubie,
    cloneCubie,
    multiplyCubie,
    createSolvedFacelets,
    createEmptyFacelets,
    applyMoveToFacelets,
    applyMovesToFacelets,
    invertMove,
    isSolvedFacelets,
    validateAndToCubie,
    generateScramble,
    describeMoveItalian,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CubeModel = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
