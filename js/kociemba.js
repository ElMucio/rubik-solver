/**
 * Pure JavaScript Kociemba Two-Phase Rubik's Cube Solver.
 * Finds near-optimal / optimal solutions (typically 18-20 moves HTM) in milliseconds.
 * Zero external dependencies. Works both in browser (file:// & http://) and Node.js.
 */
(function (root) {
  'use strict';

  const CubeModel =
    typeof module !== 'undefined' && module.exports
      ? require('./cube-model.js')
      : root.CubeModel;

  const N_TWIST = 2187; // 3^7
  const N_FLIP = 2048;  // 2^11
  const N_SLICE = 495;  // C(12, 4)
  const N_PERM8 = 40320; // 8!
  const N_PERM4 = 24;    // 4!

  // Phase 2 allowed moves out of the 18 moves (0..17):
  // U(0), U2(1), U'(2), R2(4), F2(7), D(9), D2(10), D'(11), L2(13), B2(16)
  const PHASE2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];
  const N_P2_MOVES = PHASE2_MOVES.length;

  const IS_PHASE2_MOVE = new Uint8Array(18);
  for (let i = 0; i < N_P2_MOVES; i++) {
    IS_PHASE2_MOVE[PHASE2_MOVES[i]] = 1;
  }

  const MOVE_FACE = new Uint8Array(18);
  for (let m = 0; m < 18; m++) {
    MOVE_FACE[m] = (m / 3) | 0;
  }

  const P2_MOVE_FACE = new Uint8Array(N_P2_MOVES);
  for (let i = 0; i < N_P2_MOVES; i++) {
    P2_MOVE_FACE[i] = MOVE_FACE[PHASE2_MOVES[i]];
  }

  // Binomial coefficients C(n, k) for 0 <= n <= 12, 0 <= k <= 4
  const BINOM = [];
  for (let n = 0; n <= 12; n++) {
    BINOM[n] = [1, 0, 0, 0, 0];
    for (let k = 1; k <= 4; k++) {
      BINOM[n][k] = n === 0 ? 0 : BINOM[n - 1][k - 1] + BINOM[n - 1][k];
    }
  }

  // Move tables
  let twistMove = null;   // Int16Array(N_TWIST * 18)
  let flipMove = null;    // Int16Array(N_FLIP * 18)
  let sliceMove = null;   // Int16Array(N_SLICE * 18)
  let cpMove = null;      // Uint16Array(N_PERM8 * 10)
  let udEpMove = null;    // Uint16Array(N_PERM8 * 10)
  let sliceEpMove = null; // Uint8Array(N_PERM4 * 10)

  // Pruning tables (depth distances)
  let sliceTwistPrun = null; // Uint8Array(N_SLICE * N_TWIST)
  let sliceFlipPrun = null;  // Uint8Array(N_SLICE * N_FLIP)
  let sliceCpPrun = null;    // Uint8Array(N_PERM8 * N_PERM4)
  let sliceUdEpPrun = null;  // Uint8Array(N_PERM8 * N_PERM4)

  let initialized = false;
  let initDurationMs = 0;

  // --- Coordinate Encoders & Decoders ---

  function getTwist(co) {
    let ret = 0;
    for (let i = 0; i < 7; i++) {
      ret = ret * 3 + co[i];
    }
    return ret;
  }

  function setTwist(co, twist) {
    let parity = 0;
    for (let i = 6; i >= 0; i--) {
      const v = twist % 3;
      co[i] = v;
      parity += v;
      twist = (twist - v) / 3;
    }
    co[7] = (3 - (parity % 3)) % 3;
  }

  function getFlip(eo) {
    let ret = 0;
    for (let i = 0; i < 11; i++) {
      ret = (ret << 1) | eo[i];
    }
    return ret;
  }

  function setFlip(eo, flip) {
    let parity = 0;
    for (let i = 10; i >= 0; i--) {
      const v = flip & 1;
      eo[i] = v;
      parity ^= v;
      flip >>= 1;
    }
    eo[11] = parity;
  }

  function getSlice(ep) {
    let a = 0;
    let x = 0;
    for (let j = 11; j >= 0; j--) {
      if (ep[j] >= 8) {
        a += BINOM[11 - j][x + 1];
        x++;
      }
    }
    return a;
  }

  function setSlice(ep, a) {
    let x = 4;
    let other = 0;
    for (let j = 0; j < 12; j++) {
      const p = 11 - j;
      if (x > 0 && a >= BINOM[p][x]) {
        a -= BINOM[p][x];
        ep[j] = 8 + (x - 1);
        x--;
      } else {
        ep[j] = other++;
      }
    }
  }

  function permToIdx(arr, offset, len) {
    let idx = 0;
    for (let i = 0; i < len - 1; i++) {
      let smaller = 0;
      const v = arr[offset + i];
      for (let j = i + 1; j < len; j++) {
        if (arr[offset + j] < v) smaller++;
      }
      idx = (idx + smaller) * (len - 1 - i);
    }
    return idx;
  }

  function idxToPerm(idx, len, out, offset, baseVal) {
    const digits = new Int8Array(len);
    for (let i = len - 1; i >= 0; i--) {
      const base = len - i;
      digits[i] = idx % base;
      idx = (idx - digits[i]) / base;
    }
    const used = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      let cnt = digits[i];
      for (let v = 0; v < len; v++) {
        if (!used[v]) {
          if (cnt === 0) {
            used[v] = 1;
            out[offset + i] = baseVal + v;
            break;
          }
          cnt--;
        }
      }
    }
  }

  // --- Table Builders ---

  function buildMoveTables() {
    const moves = CubeModel.ALL_MOVES;
    const tmpCo = new Int8Array(8);
    const nextCo = new Int8Array(8);
    const tmpEo = new Int8Array(12);
    const nextEo = new Int8Array(12);
    const tmpEp = new Int8Array(12);
    const nextEp = new Int8Array(12);
    const tmpCp = new Int8Array(8);
    const nextCp = new Int8Array(8);

    // 1. twistMove
    twistMove = new Int16Array(N_TWIST * 18);
    for (let t = 0; t < N_TWIST; t++) {
      setTwist(tmpCo, t);
      const row = t * 18;
      for (let m = 0; m < 18; m++) {
        const mv = moves[m];
        const mcp = mv.cp;
        const mco = mv.co;
        for (let i = 0; i < 8; i++) {
          nextCo[i] = (tmpCo[mcp[i]] + mco[i]) % 3;
        }
        twistMove[row + m] = getTwist(nextCo);
      }
    }

    // 2. flipMove
    flipMove = new Int16Array(N_FLIP * 18);
    for (let f = 0; f < N_FLIP; f++) {
      setFlip(tmpEo, f);
      const row = f * 18;
      for (let m = 0; m < 18; m++) {
        const mv = moves[m];
        const mep = mv.ep;
        const meo = mv.eo;
        for (let i = 0; i < 12; i++) {
          nextEo[i] = (tmpEo[mep[i]] + meo[i]) & 1;
        }
        flipMove[row + m] = getFlip(nextEo);
      }
    }

    // 3. sliceMove
    sliceMove = new Int16Array(N_SLICE * 18);
    for (let s = 0; s < N_SLICE; s++) {
      setSlice(tmpEp, s);
      const row = s * 18;
      for (let m = 0; m < 18; m++) {
        const mep = moves[m].ep;
        for (let i = 0; i < 12; i++) {
          nextEp[i] = tmpEp[mep[i]];
        }
        sliceMove[row + m] = getSlice(nextEp);
      }
    }

    // 4. cpMove (Phase 2 moves only)
    cpMove = new Uint16Array(N_PERM8 * N_P2_MOVES);
    for (let c = 0; c < N_PERM8; c++) {
      idxToPerm(c, 8, tmpCp, 0, 0);
      const row = c * N_P2_MOVES;
      for (let k = 0; k < N_P2_MOVES; k++) {
        const mcp = moves[PHASE2_MOVES[k]].cp;
        for (let i = 0; i < 8; i++) {
          nextCp[i] = tmpCp[mcp[i]];
        }
        cpMove[row + k] = permToIdx(nextCp, 0, 8);
      }
    }

    // 5. udEpMove (Phase 2 moves only: slots 0..7 stay within 0..7)
    udEpMove = new Uint16Array(N_PERM8 * N_P2_MOVES);
    for (let e = 0; e < N_PERM8; e++) {
      idxToPerm(e, 8, tmpEp, 0, 0);
      const row = e * N_P2_MOVES;
      for (let k = 0; k < N_P2_MOVES; k++) {
        const mep = moves[PHASE2_MOVES[k]].ep;
        for (let i = 0; i < 8; i++) {
          nextEp[i] = tmpEp[mep[i]];
        }
        udEpMove[row + k] = permToIdx(nextEp, 0, 8);
      }
    }

    // 6. sliceEpMove (Phase 2 moves only: slots 8..11 stay within 8..11)
    sliceEpMove = new Uint8Array(N_PERM4 * N_P2_MOVES);
    for (let e = 0; e < N_PERM4; e++) {
      idxToPerm(e, 4, tmpEp, 8, 8);
      const row = e * N_P2_MOVES;
      for (let k = 0; k < N_P2_MOVES; k++) {
        const mep = moves[PHASE2_MOVES[k]].ep;
        for (let i = 8; i < 12; i++) {
          nextEp[i] = tmpEp[mep[i]];
        }
        sliceEpMove[row + k] = permToIdx(nextEp, 8, 4);
      }
    }
  }

  function buildPrunTable(nA, nB, moveA, moveB, nMoves) {
    const total = nA * nB;
    const dist = new Uint8Array(total);
    dist.fill(255);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    dist[0] = 0;
    queue[tail++] = 0;

    while (head < tail) {
      const idx = queue[head++];
      const d = dist[idx] + 1;
      const b = idx % nB;
      const a = (idx - b) / nB | 0;
      const rowA = a * nMoves;
      const rowB = b * nMoves;

      for (let m = 0; m < nMoves; m++) {
        const nIdx = moveA[rowA + m] * nB + moveB[rowB + m];
        if (dist[nIdx] === 255) {
          dist[nIdx] = d;
          queue[tail++] = nIdx;
        }
      }
    }
    return dist;
  }

  function init() {
    if (initialized) return initDurationMs;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    buildMoveTables();
    // Phase 1 pruning tables
    sliceTwistPrun = buildPrunTable(N_SLICE, N_TWIST, sliceMove, twistMove, 18);
    sliceFlipPrun = buildPrunTable(N_SLICE, N_FLIP, sliceMove, flipMove, 18);
    // Phase 2 pruning tables
    sliceCpPrun = buildPrunTable(N_PERM8, N_PERM4, cpMove, sliceEpMove, N_P2_MOVES);
    sliceUdEpPrun = buildPrunTable(N_PERM8, N_PERM4, udEpMove, sliceEpMove, N_P2_MOVES);

    initialized = true;
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    initDurationMs = Math.round(t1 - t0);
    return initDurationMs;
  }

  // --- Two-Phase IDA* Search ---

  function solveCubie(startCubie, options) {
    init();

    const opts = options || {};
    const targetLength = opts.targetLength !== undefined ? opts.targetLength : 20;
    const maxTimeMs = opts.maxTimeMs !== undefined ? opts.maxTimeMs : 250;
    const maxTotalLength = opts.maxTotalLength !== undefined ? opts.maxTotalLength : 28;

    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tStart = now();

    const startTwist = getTwist(startCubie.co);
    const startFlip = getFlip(startCubie.eo);
    const startSlice = getSlice(startCubie.ep);

    // Quick check: already solved?
    if (
      startTwist === 0 &&
      startFlip === 0 &&
      startSlice === 0 &&
      permToIdx(startCubie.cp, 0, 8) === 0 &&
      permToIdx(startCubie.ep, 0, 8) === 0 &&
      permToIdx(startCubie.ep, 8, 4) === 0
    ) {
      return {
        moves: [],
        length: 0,
        timeMs: 0,
        optimal: true,
      };
    }

    const movesP1 = new Int8Array(32);
    const movesP2 = new Int8Array(32);
    let bestMoves = null;
    let bestLen = maxTotalLength + 1;
    let firstSolutionTime = 0;
    let timedOut = false;
    let nodes = 0;

    function checkTimeout() {
      if ((++nodes & 4095) === 0 && bestMoves !== null) {
        if (now() - firstSolutionTime >= maxTimeMs) {
          timedOut = true;
        }
      }
      return timedOut;
    }

    // Phase 2 IDA* search
    function searchP2(cp, udEp, sliceEp, rem, ply, lastFace) {
      if (rem === 0) {
        return cp === 0 && udEp === 0 && sliceEp === 0;
      }
      if (checkTimeout()) return false;

      const rowCp = cp * N_P2_MOVES;
      const rowUd = udEp * N_P2_MOVES;
      const rowSl = sliceEp * N_P2_MOVES;
      const nextRem = rem - 1;

      for (let k = 0; k < N_P2_MOVES; k++) {
        const f = P2_MOVE_FACE[k];
        if (f === lastFace || lastFace - f === 3) continue;

        const nCp = cpMove[rowCp + k];
        const nSl = sliceEpMove[rowSl + k];
        const h1 = sliceCpPrun[nCp * N_PERM4 + nSl];
        if (h1 > nextRem) continue;

        const nUd = udEpMove[rowUd + k];
        const h2 = sliceUdEpPrun[nUd * N_PERM4 + nSl];
        if (h2 > nextRem) continue;

        movesP2[ply] = PHASE2_MOVES[k];
        if (searchP2(nCp, nUd, nSl, nextRem, ply + 1, f)) {
          return true;
        }
        if (timedOut) return false;
      }
      return false;
    }

    // Transition from Phase 1 solution to Phase 2
    function tryPhase2(depth1, lastFace) {
      // Apply Phase 1 moves to startCubie to obtain exact Phase 2 coordinates
      let cur = startCubie;
      for (let i = 0; i < depth1; i++) {
        cur = CubeModel.multiplyCubie(cur, CubeModel.ALL_MOVES[movesP1[i]]);
      }

      const cp = permToIdx(cur.cp, 0, 8);
      const udEp = permToIdx(cur.ep, 0, 8);
      const sliceEp = permToIdx(cur.ep, 8, 4);

      const h1 = sliceCpPrun[cp * N_PERM4 + sliceEp];
      const h2 = sliceUdEpPrun[udEp * N_PERM4 + sliceEp];
      const minD2 = h1 > h2 ? h1 : h2;
      const maxD2 = bestLen - 1 - depth1;

      if (minD2 > maxD2) return false;

      for (let d2 = minD2; d2 <= maxD2; d2++) {
        if (searchP2(cp, udEp, sliceEp, d2, 0, lastFace)) {
          const totalLen = depth1 + d2;
          const sol = new Array(totalLen);
          for (let i = 0; i < depth1; i++) sol[i] = CubeModel.MOVE_NAMES[movesP1[i]];
          for (let i = 0; i < d2; i++) sol[depth1 + i] = CubeModel.MOVE_NAMES[movesP2[i]];

          bestMoves = sol;
          bestLen = totalLen;
          if (firstSolutionTime === 0) {
            firstSolutionTime = now();
          }
          // Only abort immediately if we hit targetLength at a deep Phase 1 level
          // (short depths <= 7 finish in <2ms so we let them prove true optimality!)
          if (bestLen <= targetLength && depth1 >= 8) {
            timedOut = true;
          }
          return true;
        }
        if (timedOut) return false;
      }
      return false;
    }

    // Phase 1 IDA* search
    function searchP1(twist, flip, slice, rem, ply, lastFace, depth1) {
      if (rem === 0) {
        if (twist === 0 && flip === 0 && slice === 0) {
          // For depth1 > 0, the final Phase 1 move must not be a Phase 2 move
          // (otherwise the previous state was already in G1 and checked at depth1 - 1).
          if (depth1 > 0 && IS_PHASE2_MOVE[movesP1[depth1 - 1]]) {
            return;
          }
          tryPhase2(depth1, lastFace);
        }
        return;
      }
      if (timedOut) return;
      if (checkTimeout()) return;

      // Avoid passing through G1 mid-search in Phase 1 (except at root ply === 0)
      if (ply > 0 && twist === 0 && flip === 0 && slice === 0) {
        return;
      }

      const rowTw = twist * 18;
      const rowFl = flip * 18;
      const rowSl = slice * 18;
      const nextRem = rem - 1;

      for (let m = 0; m < 18; m++) {
        const f = MOVE_FACE[m];
        if (f === lastFace || lastFace - f === 3) continue;

        const nSl = sliceMove[rowSl + m];
        const nTw = twistMove[rowTw + m];
        if (sliceTwistPrun[nSl * N_TWIST + nTw] > nextRem) continue;

        const nFl = flipMove[rowFl + m];
        if (sliceFlipPrun[nSl * N_FLIP + nFl] > nextRem) continue;

        movesP1[ply] = m;
        searchP1(nTw, nFl, nSl, nextRem, ply + 1, f, depth1);

        if (timedOut || depth1 >= bestLen) return;
      }
    }

    const minD1A = sliceTwistPrun[startSlice * N_TWIST + startTwist];
    const minD1B = sliceFlipPrun[startSlice * N_FLIP + startFlip];
    const minD1 = minD1A > minD1B ? minD1A : minD1B;

    let provedOptimal = false;
    for (let depth1 = minD1; depth1 < bestLen && depth1 <= 12; depth1++) {
      searchP1(startTwist, startFlip, startSlice, depth1, 0, -1, depth1);
      if (timedOut) break;
      if (bestMoves !== null && depth1 + 1 >= bestLen) {
        provedOptimal = true;
        break;
      }
    }

    const elapsed = Math.round(now() - tStart);
    if (!bestMoves) {
      return {
        moves: null,
        error: 'Impossibile trovare una soluzione entro il limite di ricerca.',
        timeMs: elapsed,
      };
    }

    return {
      moves: bestMoves,
      length: bestMoves.length,
      timeMs: elapsed,
      optimal: provedOptimal,
    };
  }

  /**
   * Solve directly from a 54-facelet array (validates state first).
   */
  function solveFacelets(facelets, options) {
    const check = CubeModel.validateAndToCubie(facelets);
    if (!check.valid) {
      return {
        valid: false,
        error: check.error,
        code: check.code,
      };
    }
    const res = solveCubie(check.cubie, options);
    if (!res.moves) {
      return {
        valid: false,
        error: res.error,
      };
    }
    return {
      valid: true,
      moves: res.moves,
      length: res.length,
      timeMs: res.timeMs,
      optimal: res.optimal,
      centerColors: check.centerColors,
    };
  }

  const api = {
    init,
    isInitialized: () => initialized,
    getInitDurationMs: () => initDurationMs,
    solveCubie,
    solveFacelets,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.KociembaSolver = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
