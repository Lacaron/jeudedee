'use strict';

// ═══════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════

const state = {
  /**
   * boards[player][col][slot] = die value (1-6) or null.
   * Slot 0 = bottom of column, slot 2 = top.
   */
  boards: {
    1: [ [null, null, null], [null, null, null], [null, null, null] ],
    2: [ [null, null, null], [null, null, null], [null, null, null] ],
  },
  currentPlayer: 1,    // 1 or 2
  currentDie:    null, // 1-6 after rolling, null otherwise
  phase: 'roll',       // 'roll' | 'place' | 'gameover'
};

// ═══════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════

const dom = {
  rollBtn:          document.getElementById('roll-btn'),
  currentDie:       document.getElementById('current-die'),
  hud:              document.getElementById('hud'),
  turnIndicator:    document.getElementById('turn-indicator'),
  sideValueP1:      document.getElementById('side-value-p1'),
  sideValueP2:      document.getElementById('side-value-p2'),
  overlayStart:     document.getElementById('overlay-start'),
  startMessage:     document.getElementById('start-message'),
  startBtn:         document.getElementById('start-btn'),
  overlayGameover:  document.getElementById('overlay-gameover'),
  gameoverSubtitle: document.getElementById('gameover-subtitle'),
  finalScoreP1:     document.getElementById('final-score-p1'),
  finalScoreP2:     document.getElementById('final-score-p2'),
  restartBtn:       document.getElementById('restart-btn'),
};

// ═══════════════════════════════════════════════
//  SCORE HELPERS
// ═══════════════════════════════════════════════

/**
 * Score of a single column.
 * Dice sharing the same value are each multiplied by how many there are.
 * e.g. [4, 1, 4] → 4×2 + 1×1 + 4×2 = 17
 */
function calcColumnScore(column) {
  const values = column.filter(v => v !== null);
  let score = 0;
  for (const val of values) {
    const count = values.filter(v => v === val).length;
    score += val * count;
  }
  return score;
}

function calcTotalScore(player) {
  let total = 0;
  for (let col = 0; col < 3; col++) {
    total += calcColumnScore(state.boards[player][col]);
  }
  return total;
}

// ═══════════════════════════════════════════════
//  CELL MAPPING
// ═══════════════════════════════════════════════

/**
 * Resolve the DOM cell ID for a given player/col/slot.
 *
 * Both boards are perfect vertical mirrors from a bird's-eye view.
 * "Slot 0" = first die placed = nearest to the centre HUD for both players.
 *
 * Player 1 (bottom zone, not rotated) — DOM column order: col-score, r2, r1, r0
 *   slot 0 → r2  (DOM second = visual TOP of P1's zone = nearest centre)
 *   slot 2 → r0  (DOM last  = visual BOTTOM = farthest from centre)
 *
 * Player 2 (top zone, rotated 180°) — DOM column order: col-score, r0, r1, r2
 *   slot 0 → r0  (DOM second → after rotation = visual near centre)
 *   slot 2 → r2  (DOM last  → after rotation = visual far from centre)
 */
function cellId(player, col, slot) {
  const row = player === 1 ? (2 - slot) : slot;
  return `p${player}-c${col}-r${row}`;
}

// ═══════════════════════════════════════════════
//  GAME LOGIC
// ═══════════════════════════════════════════════

function rollDie() {
  return Math.ceil(Math.random() * 6);
}

function placeDie(player, col) {
  const column = state.boards[player][col];
  const slot = column.indexOf(null);
  if (slot === -1) return; // column full — shouldn't happen with clickable guard

  column[slot] = state.currentDie;

  // Animate the placed cell
  const cell = document.getElementById(cellId(player, col, slot));
  cell.classList.add('placing');
  cell.addEventListener('animationend', () => cell.classList.remove('placing'), { once: true });

  // Destroy matching dice in the physically aligned column of the opponent.
  // Because P2's board is rotated 180°, their column indices are mirrored:
  // P1's col 0 (screen-left) aligns with P2's col 2 (also screen-left after rotation).
  const opponent = player === 1 ? 2 : 1;
  const opponentCol = 2 - col;
  destroyMatchingDice(opponent, opponentCol, state.currentDie);

  state.currentDie = null;

  renderBoard(1);
  renderBoard(2);
  renderScores();

  if (isBoardFull(1) || isBoardFull(2)) {
    endGame();
  } else {
    switchTurn();
  }
}

/**
 * Remove all dice of `value` from the opponent's column, then compact downward.
 */
function destroyMatchingDice(opponent, col, value) {
  const column = state.boards[opponent][col];
  for (let i = 0; i < 3; i++) {
    if (column[i] === value) column[i] = null;
  }
  // Compact: shift remaining dice to the bottom (lower indices)
  const remaining = column.filter(v => v !== null);
  for (let i = 0; i < 3; i++) {
    column[i] = remaining[i] !== undefined ? remaining[i] : null;
  }
}

function isBoardFull(player) {
  return state.boards[player].every(col => col.every(cell => cell !== null));
}

function switchTurn() {
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  state.currentDie = null;
  state.phase = 'roll';
  render();
}

function endGame() {
  state.phase = 'gameover';

  const s1 = calcTotalScore(1);
  const s2 = calcTotalScore(2);
  dom.finalScoreP1.textContent = s1;
  dom.finalScoreP2.textContent = s2;

  if (s1 > s2) {
    dom.gameoverSubtitle.textContent = 'Joueur 1 gagne!';
    dom.gameoverSubtitle.style.color = 'var(--clr-p1)';
  } else if (s2 > s1) {
    dom.gameoverSubtitle.textContent = 'Joueur 2 gagne!';
    dom.gameoverSubtitle.style.color = 'var(--clr-p2)';
  } else {
    dom.gameoverSubtitle.textContent = 'Égalité!';
    dom.gameoverSubtitle.style.color = 'var(--clr-accent2)';
  }

  dom.overlayGameover.classList.remove('hidden');
  render();
}

function restartGame() {
  state.boards = {
    1: [ [null, null, null], [null, null, null], [null, null, null] ],
    2: [ [null, null, null], [null, null, null], [null, null, null] ],
  };
  state.currentDie = null;
  state.phase = 'roll';
  dom.overlayGameover.classList.add('hidden');
  render();
  chooseStartingPlayer();
}

function chooseStartingPlayer() {
  state.currentPlayer = Math.random() < 0.5 ? 1 : 2;
  state.phase = 'roll';
  state.currentDie = null;

  const p = state.currentPlayer;
  const color = p === 1 ? 'var(--clr-p1)' : 'var(--clr-p2)';
  dom.startMessage.innerHTML =
    `Le <span style="color:${color}; font-weight:900;">Joueur ${p}</span> commence!`;
  dom.overlayStart.classList.remove('hidden');
}

// ═══════════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════════

function renderBoard(player) {
  for (let col = 0; col < 3; col++) {
    const column = state.boards[player][col];
    const values = column.filter(v => v !== null);

    // Count how many of each value exist in this column (for combo highlight)
    const counts = {};
    for (const v of values) {
      counts[v] = (counts[v] || 0) + 1;
    }

    for (let slot = 0; slot < 3; slot++) {
      const cell = document.getElementById(cellId(player, col, slot));
      const val = column[slot];
      cell.textContent = val !== null ? val : '';
      cell.classList.toggle('filled', val !== null);
      cell.classList.toggle('combo', val !== null && counts[val] > 1);
    }

    const colScore = calcColumnScore(column);
    const scoreEl = document.getElementById(`p${player}-col-score-${col}`);
    scoreEl.textContent = colScore;
    scoreEl.classList.toggle('nonzero', colScore > 0);

    const colEl = document.getElementById(`p${player}-col-${col}`);
    colEl.classList.toggle('full', column.every(v => v !== null));
  }
}

function renderClickable() {
  document.querySelectorAll('.column').forEach(el => el.classList.remove('clickable'));
  if (state.phase !== 'place') return;

  for (let col = 0; col < 3; col++) {
    const colEl = document.getElementById(`p${state.currentPlayer}-col-${col}`);
    if (!colEl.classList.contains('full')) {
      colEl.classList.add('clickable');
    }
  }
}

function renderTurnIndicator() {
  const p = state.currentPlayer;
  dom.turnIndicator.textContent = state.phase === 'roll'
    ? `Joueur ${p} — Lancez le dé!`
    : `Joueur ${p} — Choisissez une colonne`;
  dom.turnIndicator.className = `turn-indicator p${p}`;
  dom.hud.className = `hud p${p}`;
}

function renderScores() {
  const s1 = calcTotalScore(1);
  const s2 = calcTotalScore(2);
  dom.sideValueP1.textContent = s1;
  dom.sideValueP2.textContent = s2;
}

function renderDie() {
  dom.currentDie.textContent = state.currentDie !== null ? state.currentDie : '?';
  dom.rollBtn.disabled = state.phase !== 'roll';
}

function render() {
  renderBoard(1);
  renderBoard(2);
  renderClickable();
  renderTurnIndicator();
  renderScores();
  renderDie();
}

// ═══════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════

dom.rollBtn.addEventListener('click', () => {
  if (state.phase !== 'roll') return;

  state.currentDie = rollDie();
  state.phase = 'place';

  dom.currentDie.classList.add('rolling');
  dom.currentDie.addEventListener('animationend', () => {
    dom.currentDie.classList.remove('rolling');
  }, { once: true });

  render();
});

dom.startBtn.addEventListener('click', () => {
  dom.overlayStart.classList.add('hidden');
  render();
});

dom.restartBtn.addEventListener('click', restartGame);

document.getElementById('board-player1').addEventListener('click', (e) => {
  if (state.currentPlayer !== 1 || state.phase !== 'place') return;
  const col = e.target.closest('.column');
  if (!col || !col.classList.contains('clickable')) return;
  placeDie(1, parseInt(col.dataset.col, 10));
});

document.getElementById('board-player2').addEventListener('click', (e) => {
  if (state.currentPlayer !== 2 || state.phase !== 'place') return;
  const col = e.target.closest('.column');
  if (!col || !col.classList.contains('clickable')) return;
  placeDie(2, parseInt(col.dataset.col, 10));
});

// ═══════════════════════════════════════════════
//  SERVICE WORKER
// ═══════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('Service Worker registration failed:', err);
    });
  });
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════

render();
chooseStartingPlayer();
