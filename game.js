// ===== BATTLESHIP GAME =====

const BOARD_SIZE = 10;
const SHIPS = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

// Difficulty config
const DIFFICULTY = {
  easy:   { playerShots: 2, aiShots: 1, label: 'Easy' },
  normal: { playerShots: 1, aiShots: 1, label: 'Normal' },
  hard:   { playerShots: 1, aiShots: 2, label: 'Hard' },
};
let difficulty = 'easy';

// Game state
let playerBoard = [];
let aiBoard = [];
let playerShips = [];
let aiShips = [];
let phase = 'placing'; // 'placing', 'playing', 'gameover'
let currentShipIndex = 0;
let orientation = 'horizontal'; // 'horizontal' or 'vertical'
let playerSunkCount = 0;
let aiSunkCount = 0;
let playerShotsRemaining = 0;

// AI hunt state
let aiMode = 'hunt'; // 'hunt' or 'target'
let aiTargetQueue = [];
let aiHits = [];
let aiTriedCells = new Set();

// DOM elements
const playerBoardEl = document.getElementById('player-board');
const aiBoardEl = document.getElementById('ai-board');
const messageBar = document.getElementById('message-bar');
const newGameBtn = document.getElementById('new-game-btn');
const playerScoreEl = document.getElementById('player-score');
const aiScoreEl = document.getElementById('ai-score');
const sunkLogEl = document.getElementById('sunk-log');
const rotateBtn = document.getElementById('rotate-btn');
const diffSelector = document.getElementById('difficulty-selector');
const diffBtns = document.querySelectorAll('.diff-btn');

// ===== BOARD CREATION =====

function createEmptyBoard() {
  const board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    board[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[r][c] = { ship: null, hit: false };
    }
  }
  return board;
}

function renderBoard(boardEl, board, isAI) {
  boardEl.innerHTML = '';
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.row = r;
      cell.dataset.col = c;

      const state = board[r][c];

      if (state.hit && state.ship) {
        // Check if ship is sunk
        if (state.ship.sunk) {
          cell.classList.add('sunk');
        } else {
          cell.classList.add('hit');
        }
      } else if (state.hit) {
        cell.classList.add('miss');
      } else if (!isAI && state.ship) {
        cell.classList.add('ship');
      }

      if (isAI && phase === 'playing') {
        cell.addEventListener('click', () => handlePlayerShot(r, c));
      }

      if (!isAI && phase === 'placing') {
        cell.addEventListener('mouseenter', () => showPlacementPreview(r, c));
        cell.addEventListener('mouseleave', clearPlacementPreview);
        cell.addEventListener('click', () => handlePlaceShip(r, c));
      }

      boardEl.appendChild(cell);
    }
  }
}

// ===== SHIP PLACEMENT (PLAYER) =====

function getShipCells(row, col, size, orient) {
  const cells = [];
  for (let i = 0; i < size; i++) {
    const r = orient === 'vertical' ? row + i : row;
    const c = orient === 'horizontal' ? col + i : col;
    cells.push({ r, c });
  }
  return cells;
}

function canPlaceShip(board, row, col, size, orient) {
  const cells = getShipCells(row, col, size, orient);
  for (const { r, c } of cells) {
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (board[r][c].ship) return false;
  }
  return true;
}

function placeShip(board, shipList, shipDef, row, col, orient) {
  const cells = getShipCells(row, col, shipDef.size, orient);
  const shipObj = { name: shipDef.name, size: shipDef.size, cells: cells, hits: 0, sunk: false };
  for (const { r, c } of cells) {
    board[r][c].ship = shipObj;
  }
  shipList.push(shipObj);
  return shipObj;
}

let previewCells = [];

function showPlacementPreview(row, col) {
  if (phase !== 'placing') return;
  clearPlacementPreview();
  const ship = SHIPS[currentShipIndex];
  const cells = getShipCells(row, col, ship.size, orientation);
  const valid = canPlaceShip(playerBoard, row, col, ship.size, orientation);

  cells.forEach(({ r, c }) => {
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      const cellEl = playerBoardEl.children[r * BOARD_SIZE + c];
      cellEl.classList.add(valid ? 'preview-valid' : 'preview-invalid');
      previewCells.push(cellEl);
    }
  });
}

function clearPlacementPreview() {
  previewCells.forEach(el => {
    el.classList.remove('preview-valid', 'preview-invalid');
  });
  previewCells = [];
}

function handlePlaceShip(row, col) {
  if (phase !== 'placing') return;
  const shipDef = SHIPS[currentShipIndex];
  if (!canPlaceShip(playerBoard, row, col, shipDef.size, orientation)) return;

  placeShip(playerBoard, playerShips, shipDef, row, col, orientation);
  currentShipIndex++;

  if (currentShipIndex >= SHIPS.length) {
    phase = 'playing';
    placeAIShips();
    const cfg = DIFFICULTY[difficulty];
    playerShotsRemaining = cfg.playerShots;
    const shotInfo = cfg.playerShots > 1 ? ` You get ${cfg.playerShots} shots per turn!` : '';
    setMessage('All ships placed! Click on the enemy board to fire.' + shotInfo);
    renderBoard(playerBoardEl, playerBoard, false);
    renderBoard(aiBoardEl, aiBoard, true);
    aiBoardEl.classList.remove('disabled');
    rotateBtn.classList.add('hidden');
    diffSelector.classList.add('locked');
  } else {
    const next = SHIPS[currentShipIndex];
    setMessage(`Place your ${next.name} (${next.size} cells). Click to place, tap Rotate or press R.`);
    renderBoard(playerBoardEl, playerBoard, false);
  }
}

// ===== AI SHIP PLACEMENT =====

function placeAIShips() {
  for (const shipDef of SHIPS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      const orient = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      if (canPlaceShip(aiBoard, row, col, shipDef.size, orient)) {
        placeShip(aiBoard, aiShips, shipDef, row, col, orient);
        placed = true;
      }
      attempts++;
    }
  }
}

// ===== SHOOTING =====

function handlePlayerShot(row, col) {
  if (phase !== 'playing') return;
  if (aiBoard[row][col].hit) return;

  aiBoard[row][col].hit = true;
  const ship = aiBoard[row][col].ship;

  if (ship) {
    ship.hits++;
    if (ship.hits === ship.size) {
      ship.sunk = true;
      aiSunkCount++;
      addSunkLog(`You sunk the enemy's ${ship.name}!`);
      updateScores();
      if (aiSunkCount === SHIPS.length) {
        phase = 'gameover';
        setMessage('You win! All enemy ships destroyed!');
        renderBoard(aiBoardEl, aiBoard, true);
        renderBoard(playerBoardEl, playerBoard, false);
        aiBoardEl.classList.add('disabled');
        return;
      }
    }
    setMessage('Hit!');
  } else {
    setMessage('Miss.');
  }

  playerShotsRemaining--;
  renderBoard(aiBoardEl, aiBoard, true);

  if (playerShotsRemaining > 0) {
    // Player has more shots this turn
    setMessage((ship ? 'Hit! ' : 'Miss. ') + `${playerShotsRemaining} shot${playerShotsRemaining > 1 ? 's' : ''} remaining this turn.`);
    return;
  }

  // AI turn after short delay
  aiBoardEl.classList.add('disabled');
  setTimeout(() => {
    runAiTurns();
  }, 500);
}

function runAiTurns() {
  const cfg = DIFFICULTY[difficulty];
  let shotsLeft = cfg.aiShots;
  let lastMsg = '';

  function doOneAiShot() {
    if (phase !== 'playing' || shotsLeft <= 0) {
      // AI turn done, start player turn
      if (phase === 'playing') {
        playerShotsRemaining = cfg.playerShots;
        if (cfg.playerShots > 1) {
          setMessage((lastMsg ? lastMsg + ' ' : '') + `Your turn! ${playerShotsRemaining} shots this turn.`);
        } else if (lastMsg) {
          setMessage(lastMsg);
        }
        renderBoard(aiBoardEl, aiBoard, true);
        aiBoardEl.classList.remove('disabled');
      }
      return;
    }

    const { row, col } = aiChooseTarget();
    playerBoard[row][col].hit = true;
    const ship = playerBoard[row][col].ship;

    if (ship) {
      ship.hits++;
      aiHits.push({ r: row, c: col, ship: ship });

      if (ship.hits === ship.size) {
        ship.sunk = true;
        playerSunkCount++;
        addSunkLog(`The enemy sunk your ${ship.name}!`);
        updateScores();

        // Remove hits belonging to this sunk ship from tracking
        aiHits = aiHits.filter(h => h.ship !== ship);
        // Remove targets that are only adjacent to the sunk ship's cells
        aiTargetQueue = aiTargetQueue.filter(t => {
          const adjacent = [
            { r: t.r - 1, c: t.c },
            { r: t.r + 1, c: t.c },
            { r: t.r, c: t.c - 1 },
            { r: t.r, c: t.c + 1 },
          ];
          const hasNonSunkNeighborHit = adjacent.some(a => {
            const key = `${a.r},${a.c}`;
            return aiHits.some(h => `${h.r},${h.c}` === key);
          });
          return hasNonSunkNeighborHit;
        });

        if (aiHits.length === 0) {
          aiMode = 'hunt';
          aiTargetQueue = [];
        }

        if (playerSunkCount === SHIPS.length) {
          phase = 'gameover';
          setMessage('You lose! All your ships have been destroyed.');
          renderBoard(playerBoardEl, playerBoard, false);
          renderBoard(aiBoardEl, aiBoard, true);
          aiBoardEl.classList.add('disabled');
          return;
        }
      } else {
        aiMode = 'target';
        addAdjacentTargets(row, col);
      }

      lastMsg = `Enemy hit your ship at (${row + 1}, ${col + 1})!`;
    } else {
      lastMsg = `Enemy missed at (${row + 1}, ${col + 1}).`;
    }

    setMessage(lastMsg);
    renderBoard(playerBoardEl, playerBoard, false);
    shotsLeft--;

    if (shotsLeft > 0 && phase === 'playing') {
      setTimeout(doOneAiShot, 400);
    } else {
      setTimeout(() => doOneAiShot(), 0);
    }
  }

  doOneAiShot();
}

// ===== AI LOGIC (Hunt/Target) =====

function aiChooseTarget() {
  // Target mode: try queued cells first
  while (aiTargetQueue.length > 0) {
    const target = aiTargetQueue.shift();
    const key = `${target.r},${target.c}`;
    if (!aiTriedCells.has(key) && target.r >= 0 && target.r < BOARD_SIZE && target.c >= 0 && target.c < BOARD_SIZE) {
      aiTriedCells.add(key);
      return { row: target.r, col: target.c };
    }
  }

  // If target queue empty but still have unsunk hits, rebuild targets
  if (aiHits.length > 0) {
    for (const hit of aiHits) {
      addAdjacentTargets(hit.r, hit.c);
    }
    while (aiTargetQueue.length > 0) {
      const target = aiTargetQueue.shift();
      const key = `${target.r},${target.c}`;
      if (!aiTriedCells.has(key) && target.r >= 0 && target.r < BOARD_SIZE && target.c >= 0 && target.c < BOARD_SIZE) {
        aiTriedCells.add(key);
        return { row: target.r, col: target.c };
      }
    }
  }

  // Hunt mode: pick random untried cell (checkerboard pattern for efficiency)
  aiMode = 'hunt';
  const candidates = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!aiTriedCells.has(`${r},${c}`) && (r + c) % 2 === 0) {
        candidates.push({ r, c });
      }
    }
  }
  // If no checkerboard cells left, use all remaining
  if (candidates.length === 0) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!aiTriedCells.has(`${r},${c}`)) {
          candidates.push({ r, c });
        }
      }
    }
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  aiTriedCells.add(`${pick.r},${pick.c}`);
  return { row: pick.r, col: pick.c };
}

function addAdjacentTargets(row, col) {
  const directions = [
    { r: row - 1, c: col },
    { r: row + 1, c: col },
    { r: row, c: col - 1 },
    { r: row, c: col + 1 },
  ];

  // If we have 2+ hits on the same ship in a line, prioritize that direction
  if (aiHits.length >= 2) {
    const shipHits = aiHits.filter(h => h.ship === aiHits[aiHits.length - 1].ship);
    if (shipHits.length >= 2) {
      const allSameRow = shipHits.every(h => h.r === shipHits[0].r);
      const allSameCol = shipHits.every(h => h.c === shipHits[0].c);

      if (allSameRow) {
        // Ship is horizontal, prioritize left/right
        const cols = shipHits.map(h => h.c).sort((a, b) => a - b);
        const prioritized = [
          { r: row, c: cols[0] - 1 },
          { r: row, c: cols[cols.length - 1] + 1 },
        ];
        for (const t of prioritized) {
          const key = `${t.r},${t.c}`;
          if (!aiTriedCells.has(key) && t.r >= 0 && t.r < BOARD_SIZE && t.c >= 0 && t.c < BOARD_SIZE) {
            aiTargetQueue.unshift(t); // Add to front
          }
        }
        return;
      }

      if (allSameCol) {
        // Ship is vertical, prioritize up/down
        const rows = shipHits.map(h => h.r).sort((a, b) => a - b);
        const prioritized = [
          { r: rows[0] - 1, c: col },
          { r: rows[rows.length - 1] + 1, c: col },
        ];
        for (const t of prioritized) {
          const key = `${t.r},${t.c}`;
          if (!aiTriedCells.has(key) && t.r >= 0 && t.r < BOARD_SIZE && t.c >= 0 && t.c < BOARD_SIZE) {
            aiTargetQueue.unshift(t); // Add to front
          }
        }
        return;
      }
    }
  }

  // Default: add all 4 adjacent
  for (const t of directions) {
    const key = `${t.r},${t.c}`;
    if (!aiTriedCells.has(key) && t.r >= 0 && t.r < BOARD_SIZE && t.c >= 0 && t.c < BOARD_SIZE) {
      aiTargetQueue.push(t);
    }
  }
}

// ===== UI HELPERS =====

function setMessage(msg) {
  messageBar.textContent = msg;
}

function updateScores() {
  playerScoreEl.textContent = `Your ships sunk: ${playerSunkCount}/5`;
  aiScoreEl.textContent = `Enemy ships sunk: ${aiSunkCount}/5`;
}

function addSunkLog(msg) {
  const p = document.createElement('p');
  p.textContent = msg;
  sunkLogEl.prepend(p);
}

// ===== KEYBOARD (ROTATE) =====

function toggleOrientation() {
  if (phase !== 'placing') return;
  orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  rotateBtn.textContent = `Rotate Ship (${orientation === 'horizontal' ? '\u2194' : '\u2195'})`;
  setMessage(`Orientation: ${orientation}. Place your ${SHIPS[currentShipIndex].name} (${SHIPS[currentShipIndex].size} cells).`);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    toggleOrientation();
  }
});

rotateBtn.addEventListener('click', toggleOrientation);

// ===== DIFFICULTY SELECTION =====

diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (phase !== 'placing') return;
    difficulty = btn.dataset.difficulty;
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ===== NEW GAME =====

function initGame() {
  playerBoard = createEmptyBoard();
  aiBoard = createEmptyBoard();
  playerShips = [];
  aiShips = [];
  phase = 'placing';
  currentShipIndex = 0;
  orientation = 'horizontal';
  playerSunkCount = 0;
  aiSunkCount = 0;
  aiMode = 'hunt';
  aiTargetQueue = [];
  aiHits = [];
  aiTriedCells = new Set();
  previewCells = [];

  playerShotsRemaining = 0;

  sunkLogEl.innerHTML = '';
  updateScores();
  setMessage(`Place your ${SHIPS[0].name} (${SHIPS[0].size} cells). Click to place, tap Rotate or press R.`);
  rotateBtn.classList.remove('hidden');
  rotateBtn.textContent = 'Rotate Ship (\u2194)';
  diffSelector.classList.remove('locked');

  renderBoard(playerBoardEl, playerBoard, false);
  renderBoard(aiBoardEl, aiBoard, true);
  aiBoardEl.classList.add('disabled');
}

newGameBtn.addEventListener('click', initGame);

// Start the game
initGame();
