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
  phase: 'idle',       // 'idle' | 'place' | 'gameover'
  pausedPhase:   null, // phase saved when paused
  mode: 'local',       // 'local' | 'bot'
};

// Session win counters and history — persist across replays; reset on new game / main menu
const session = { 1: 0, 2: 0, ties: 0, history: [] };

function resetSession() {
  session[1] = 0;
  session[2] = 0;
  session.ties = 0;
  session.history = [];
  renderSessionScores();
}

let botDifficulty = 'medium';

// ═══════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════

const dom = {
  currentDie:       document.getElementById('current-die'),
  hud:              document.getElementById('hud'),
  turnIndicator:    document.getElementById('turn-indicator'),
  sideValueP1:      document.getElementById('side-value-p1'),
  sideValueP2:      document.getElementById('side-value-p2'),
  overlayAnnounce:  document.getElementById('overlay-announce'),
  announceText:     document.getElementById('announce-text'),
  pauseBtnP1:           document.getElementById('pause-btn-p1'),
  pauseBtnP2:           document.getElementById('pause-btn-p2'),
  overlayPause:         document.getElementById('overlay-pause'),
  pauseResumeBtn:       document.getElementById('pause-resume-btn'),
  pauseInstructionsBtn: document.getElementById('pause-instructions-btn'),
  pauseNewGameBtn:      document.getElementById('pause-newgame-btn'),
  pauseMainMenuBtn:     document.getElementById('pause-mainmenu-btn'),
  overlayInstructions:  document.getElementById('overlay-instructions'),
  instructionsBtn:      document.getElementById('instructions-btn'),
  instructionsCloseBtn: document.getElementById('instructions-close-btn'),
  overlayWelcome:       document.getElementById('overlay-welcome'),
  playBtn:              document.getElementById('play-btn'),
  playBotBtn:           document.getElementById('play-bot-btn'),
  overlayGameover:   document.getElementById('overlay-gameover'),
  gameoverResultP1:  document.getElementById('gameover-result-p1'),
  gameoverResultP2:  document.getElementById('gameover-result-p2'),
  gameoverScoreP1:   document.getElementById('gameover-score-p1'),
  gameoverScoreP2:   document.getElementById('gameover-score-p2'),
  billboardTop:      document.getElementById('billboard-top'),
  billboardBottom:   document.getElementById('billboard-bottom'),
  restartBtn:           document.getElementById('restart-btn'),
  gameoverMainMenuBtn:  document.getElementById('gameover-mainmenu-btn'),
  zoneScoreP1:          document.getElementById('zone-score-p1'),
  zoneScoreP2:          document.getElementById('zone-score-p2'),
  sessionRecord:        document.getElementById('session-record'),
  sessionRecordP2:      document.getElementById('session-record-p2'),
  leaderboard:          document.getElementById('leaderboard'),
  botDiffRow:    document.getElementById('bot-diff-row'),
  diffEasyBtn:   document.getElementById('diff-easy-btn'),
  diffMediumBtn: document.getElementById('diff-medium-btn'),
  diffHardBtn:   document.getElementById('diff-hard-btn'),
  labelPlayer2:  document.getElementById('label-player2'),
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

/**
 * Auto-roll sequence (staggered):
 *  1. Immediately rotate HUD to face the current player & show '?'
 *  2. After 450ms (HUD transition done), spin the die
 *  3. After spin animation ends, reveal the result and enter 'place' phase
 */
function autoRoll() {
  state.currentDie = null;
  state.phase = 'idle'; // block placement during roll sequence

  // Step 1: rotate HUD toward current player, show '?'
  renderTurnIndicator();
  renderDie();
  renderClickable();

  // Step 2: after HUD has rotated, spin the die
  setTimeout(() => {
    dom.currentDie.classList.add('rolling');

    // Step 3: reveal result once spin finishes
    dom.currentDie.addEventListener('animationend', () => {
      dom.currentDie.classList.remove('rolling');
      state.currentDie = rollDie();
      state.phase = 'place';
      render();
      // In bot mode, trigger bot move automatically after a short pause
      if (state.mode === 'bot' && state.currentPlayer === 2) {
        scheduleBotMove();
      }
    }, { once: true });
  }, 450); // slightly longer than the 0.4s CSS HUD transition
}

/**
 * Wait a beat so the player can see what the bot rolled, then place the die.
 */
function scheduleBotMove() {
  setTimeout(() => {
    if (state.phase !== 'place' || state.currentPlayer !== 2) return;
    const col = botChooseColumn(state.boards, state.currentDie, botDifficulty);
    placeDie(2, col);
  }, 900);
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

  // Destroy matching dice in the visually aligned column of the opponent.
  // In local (face-to-face) mode P2's board is rotated 180°, so columns mirror:
  //   P1 col 0 ↔ P2 col 2, etc.
  // In bot mode both boards face P1 with no rotation, so columns align directly:
  //   P1 col 0 ↔ P2 col 0, etc.
  const opponent = player === 1 ? 2 : 1;
  const opponentCol = state.mode === 'bot' ? col : (2 - col);
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

function pauseGame() {
  if (state.phase === 'idle' || state.phase === 'gameover') return;
  state.pausedPhase = state.phase;
  state.phase = 'paused';
  renderLeaderboard();
  dom.overlayPause.classList.remove('hidden');
  renderClickable(); // removes all clickable highlights
}

function resumeGame() {
  state.phase = state.pausedPhase;
  state.pausedPhase = null;
  dom.overlayPause.classList.add('hidden');
  render();
  // Re-trigger the bot if we paused while it was about to place its die
  if (state.mode === 'bot' && state.currentPlayer === 2 && state.phase === 'place') {
    scheduleBotMove();
  }
}

function switchTurn() {
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  state.currentDie = null;
  autoRoll();
}

function endGame() {
  state.phase = 'gameover';

  const s1 = calcTotalScore(1);
  const s2 = calcTotalScore(2);

  // Update session counters and history
  if (s1 > s2)      session[1]++;
  else if (s2 > s1) session[2]++;
  else              session.ties++;
  session.history.push({ s1, s2 });
  renderSessionScores();

  // Determine each player's outcome
  let label1, label2, color1, color2;
  if (s1 > s2) {
    label1 = 'Vous avez gagné!';  color1 = 'var(--clr-p1)';
    label2 = 'Vous avez perdu!'; color2 = 'var(--clr-text-muted)';
  } else if (s2 > s1) {
    label1 = 'Vous avez perdu!'; color1 = 'var(--clr-text-muted)';
    label2 = 'Vous avez gagné!';  color2 = 'var(--clr-p2)';
  } else {
    label1 = 'Égalité!'; color1 = 'var(--clr-accent2)';
    label2 = 'Égalité!'; color2 = 'var(--clr-accent2)';
  }

  dom.gameoverResultP1.textContent = label1;
  dom.gameoverResultP1.style.color = color1;
  dom.gameoverScoreP1.textContent  = s1;
  dom.gameoverScoreP1.style.color  = color1;

  dom.gameoverResultP2.textContent = label2;
  dom.gameoverResultP2.style.color = color2;
  dom.gameoverScoreP2.textContent  = s2;
  dom.gameoverScoreP2.style.color  = color2;

  // Center billboard — both players see both scores
  const billboardHtml =
    `<span style="color:var(--clr-p1)">J1\u00a0${s1}</span>` +
    `<span class="billboard-vs">-</span>` +
    `<span style="color:var(--clr-p2)">${s2}\u00a0J2</span>`;
  dom.billboardTop.innerHTML    = billboardHtml;
  dom.billboardBottom.innerHTML = billboardHtml;

  // Session record — two-line format: label then score row
  const sessionHtml =
    `<div class="sr-label">Session</div>` +
    `<div class="sr-scores">` +
    `<span style="color:var(--clr-p1)">J1</span>\u00a0${session[1]}` +
    `\u00a0-\u00a0` +
    `${session[2]}\u00a0<span style="color:var(--clr-p2)">J2</span>` +
    `</div>` +
    (session.ties > 0
      ? `<div class="sr-ties">${session.ties}\u00a0\u00e9galit\u00e9${session.ties > 1 ? 's' : ''}</div>`
      : '');
  dom.sessionRecord.innerHTML   = sessionHtml;
  dom.sessionRecordP2.innerHTML = sessionHtml;

  dom.overlayGameover.classList.remove('hidden');
  render();
}

function restartGame() {
  state.boards = {
    1: [ [null, null, null], [null, null, null], [null, null, null] ],
    2: [ [null, null, null], [null, null, null], [null, null, null] ],
  };
  state.currentDie = null;
  state.phase = 'idle';
  dom.overlayGameover.classList.add('hidden');
  render();
  chooseStartingPlayer();
}

/**
 * Pick a random starting player, show a full-screen blurred announcement
 * with text anchored to that player's half, then auto-roll after 2 seconds.
 */
function chooseStartingPlayer() {
  state.currentPlayer = Math.random() < 0.5 ? 1 : 2;
  state.currentDie = null;
  state.phase = 'idle';
  render();

  const p = state.currentPlayer;
  const color = p === 1 ? 'var(--clr-p1)' : 'var(--clr-p2)';

  // Position text in the starting player's half of the screen
  dom.announceText.innerHTML =
    `<span style="color:${color}">Joueur ${p}<br>commence!</span>`;
  dom.announceText.className = `announce-text for-p${p}`;
  dom.overlayAnnounce.classList.remove('hidden');

  setTimeout(() => {
    dom.overlayAnnounce.classList.add('hidden');
    autoRoll();
  }, 2000);
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
  dom.turnIndicator.textContent = `Joueur ${p} — Choisissez une colonne`;
  dom.turnIndicator.className = `turn-indicator p${p}`;
  dom.hud.className = `hud p${p}`;
}

function renderScores() {
  const s1 = calcTotalScore(1);
  const s2 = calcTotalScore(2);
  dom.sideValueP1.textContent = s1;
  dom.sideValueP2.textContent = s2;
}

function renderSessionScores() {
  const text = `J1\u00a0${session[1]}\u00a0-\u00a0${session[2]}\u00a0J2`;
  dom.zoneScoreP1.textContent = text;
  dom.zoneScoreP2.textContent = text;
}

function lbRow(leftVal, rightVal, cls, isTie = false) {
  const sep = isTie
    ? `<span class="lb-sep lb-sep--tie">=</span>`
    : `<span class="lb-sep">-</span>`;
  const p1Color = isTie ? 'var(--clr-accent2)' : 'var(--clr-p1)';
  const p2Color = isTie ? 'var(--clr-accent2)' : 'var(--clr-p2)';
  return `<div class="lb-row ${cls}">` +
    `<span class="lb-left"><span style="color:${p1Color}">J1</span>\u00a0${leftVal}</span>` +
    sep +
    `<span class="lb-right">${rightVal}\u00a0<span style="color:${p2Color}">J2</span></span>` +
    `</div>`;
}

function renderLeaderboard() {
  // Summary: wins + ties count if any
  let html = `<div class="lb-title">Session</div>`;
  html += lbRow(session[1], session[2], 'lb-summary');
  if (session.ties > 0) {
    html += `<div class="lb-ties-note">${session.ties}\u00a0\u00e9galit\u00e9${session.ties > 1 ? 's' : ''}</div>`;
  }

  if (session.history.length > 0) {
    html += `<div class="lb-history">`;
    session.history.forEach(({ s1, s2 }) => {
      html += lbRow(s1, s2, 'lb-game', s1 === s2);
    });
    html += `</div>`;
  } else {
    html += `<p class="lb-empty">Aucune partie compl\u00e9t\u00e9e</p>`;
  }

  dom.leaderboard.innerHTML = html;
}

function renderDie() {
  dom.currentDie.textContent = state.currentDie !== null ? state.currentDie : '?';
  // Show pause buttons throughout active play; hide only when game is over
  const hidePause = state.phase === 'gameover';
  dom.pauseBtnP1.classList.toggle('hidden', hidePause);
  dom.pauseBtnP2.classList.toggle('hidden', hidePause);
}

function render() {
  renderBoard(1);
  renderBoard(2);
  renderClickable();
  renderTurnIndicator();
  renderScores();
  renderSessionScores();
  renderDie();
}

// ═══════════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════════

// Track where instructions were opened from so close returns to the right screen
let instructionsReturnTo = 'welcome'; // 'welcome' | 'pause'

dom.pauseBtnP1.addEventListener('click', pauseGame);
dom.pauseBtnP2.addEventListener('click', pauseGame);

dom.pauseResumeBtn.addEventListener('click', resumeGame);

dom.pauseInstructionsBtn.addEventListener('click', () => {
  instructionsReturnTo = 'pause';
  dom.overlayInstructions.classList.remove('hidden');
});

dom.pauseNewGameBtn.addEventListener('click', () => {
  dom.overlayPause.classList.add('hidden');
  state.pausedPhase = null;
  resetSession();
  restartGame();
});

dom.pauseMainMenuBtn.addEventListener('click', () => {
  dom.overlayPause.classList.add('hidden');
  state.pausedPhase = null;
  resetSession();
  state.phase = 'idle';
  state.mode = 'local';
  document.body.classList.remove('bot-mode');
  dom.labelPlayer2.textContent = 'Joueur 2';
  state.boards = {
    1: [ [null, null, null], [null, null, null], [null, null, null] ],
    2: [ [null, null, null], [null, null, null], [null, null, null] ],
  };
  state.currentDie = null;
  render();
  dom.overlayWelcome.classList.remove('hidden');
});

dom.instructionsBtn.addEventListener('click', () => {
  instructionsReturnTo = 'welcome';
  dom.overlayInstructions.classList.remove('hidden');
});

dom.instructionsCloseBtn.addEventListener('click', () => {
  dom.overlayInstructions.classList.add('hidden');
  if (instructionsReturnTo === 'pause') {
    dom.overlayPause.classList.remove('hidden');
  }
  instructionsReturnTo = 'welcome';
});

dom.playBtn.addEventListener('click', () => {
  state.mode = 'local';
  document.body.classList.remove('bot-mode');
  dom.overlayWelcome.classList.add('hidden');
  chooseStartingPlayer();
});

dom.playBotBtn.addEventListener('click', () => {
  state.mode = 'bot';
  document.body.classList.add('bot-mode');
  dom.labelPlayer2.textContent = `Bot · ${diffLabels[botDifficulty]}`;
  dom.overlayWelcome.classList.add('hidden');
  chooseStartingPlayer();
});

function setDiffHighlight(selected) {
  [dom.diffEasyBtn, dom.diffMediumBtn, dom.diffHardBtn].forEach(btn =>
    btn.classList.remove('menu-btn--diff-selected')
  );
  selected.classList.add('menu-btn--diff-selected');
}

const diffLabels = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile' };

dom.diffEasyBtn.addEventListener('click', () => {
  setDiffHighlight(dom.diffEasyBtn);
  botDifficulty = 'easy';
});
dom.diffMediumBtn.addEventListener('click', () => {
  setDiffHighlight(dom.diffMediumBtn);
  botDifficulty = 'medium';
});
dom.diffHardBtn.addEventListener('click', () => {
  setDiffHighlight(dom.diffHardBtn);
  botDifficulty = 'hard';
});

dom.restartBtn.addEventListener('click', restartGame);

dom.gameoverMainMenuBtn.addEventListener('click', () => {
  dom.overlayGameover.classList.add('hidden');
  resetSession();
  state.phase = 'idle';
  state.mode = 'local';
  document.body.classList.remove('bot-mode');
  dom.labelPlayer2.textContent = 'Joueur 2';
  state.boards = {
    1: [ [null, null, null], [null, null, null], [null, null, null] ],
    2: [ [null, null, null], [null, null, null], [null, null, null] ],
  };
  state.currentDie = null;
  render();
  dom.overlayWelcome.classList.remove('hidden');
});

document.getElementById('board-player1').addEventListener('click', (e) => {
  if (state.currentPlayer !== 1 || state.phase !== 'place') return;
  const col = e.target.closest('.column');
  if (!col || !col.classList.contains('clickable')) return;
  placeDie(1, parseInt(col.dataset.col, 10));
});

document.getElementById('board-player2').addEventListener('click', (e) => {
  if (state.mode === 'bot') return; // bot controls P2
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
