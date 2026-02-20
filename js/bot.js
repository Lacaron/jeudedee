'use strict';

// ═══════════════════════════════════════════════
//  BOT LOGIC
//
//  Public API:
//    botChooseColumn(boards, currentDie, difficulty) → column index (0 | 1 | 2)
//
//  boards      – full state.boards object (both players)
//  currentDie  – the die value about to be placed (1-6)
//  difficulty  – 'easy' | 'medium' | 'hard'
//
//  Returns the column index the bot wants to play in.
// ═══════════════════════════════════════════════

/**
 * Score a single column (duplicated from game.js to keep bot.js standalone).
 * Dice sharing the same value are each multiplied by how many there are.
 */
function _colScore(column) {
  const values = column.filter(v => v !== null);
  let score = 0;
  for (const val of values) {
    score += val * values.filter(v => v === val).length;
  }
  return score;
}

/**
 * Choose a column based on difficulty:
 *
 *  easy   – random available column
 *  medium – heuristic: +4 per matching die in column, +6 per opponent die destroyed
 *  hard   – greedy: maximises (own score gain) + (opponent score lost)
 */
function botChooseColumn(boards, currentDie, difficulty = 'medium') {
  const botBoard      = boards[2];
  const opponentBoard = boards[1];

  // Only consider columns that still have an empty slot
  const available = [0, 1, 2].filter(col =>
    botBoard[col].some(cell => cell === null)
  );

  if (available.length === 0) return 0; // fallback — should never happen

  // ── Easy: random ──────────────────────────────
  if (difficulty === 'easy') {
    return available[Math.floor(Math.random() * available.length)];
  }

  const scored = available.map(col => {
    let score = 0;

    if (difficulty === 'medium') {
      // ── Medium: simple heuristic ──────────────
      // Reward matching dice already in column (combo multiplier grows)
      score += botBoard[col].filter(v => v === currentDie).length * 4;
      // Reward opponent dice that would be destroyed
      score += opponentBoard[col].filter(v => v === currentDie).length * 6;

    } else {
      // ── Hard: actual score delta ───────────────
      // Own gain: difference in column score after placing the die
      const slot = botBoard[col].indexOf(null);
      const newBotCol = botBoard[col].slice();
      newBotCol[slot] = currentDie;
      const ownGain = _colScore(newBotCol) - _colScore(botBoard[col]);

      // Opponent loss: difference in opponent column score after destruction
      const oppBefore = _colScore(opponentBoard[col]);
      const remaining = opponentBoard[col]
        .map(v => v === currentDie ? null : v)
        .filter(v => v !== null);
      while (remaining.length < 3) remaining.push(null);
      const opponentLoss = oppBefore - _colScore(remaining);

      score = ownGain + opponentLoss;
    }

    return { col, score };
  });

  // Pick column with highest score; break ties randomly
  const best = scored.reduce((max, s) => s.score > max.score ? s : max, scored[0]);
  const tied = scored.filter(s => s.score === best.score);
  return tied[Math.floor(Math.random() * tied.length)].col;
}
