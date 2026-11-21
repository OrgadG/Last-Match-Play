(() => {
  'use strict';
  const rules = window.LastMatchRules;
  const $ = id => document.getElementById(id);
  const boardElement = $('board');
  let board, phase, generation = 0, gesture = null, strike = null;
  let config = {mode: 'computer', difficulty: 'beginner', rule: 'wins', names: ['Player 1', 'Player 2'], boardConfig: '3-5-7', split: false, theme: 'dark'};
  let activeRule = 'wins', difficulty = 'beginner', turn = 'human', scored = false, winningPlayer = null;
  const gameNumbers = {computer: 0, local: 0};
  let storage; try { storage = window.localStorage; } catch {}
  const themeKey = 'last-match-theme';
  try { config.theme = storage?.getItem(themeKey) === 'light' ? 'light' : 'dark'; } catch {}
  function applyTheme() {
    document.documentElement.dataset.theme = config.theme;
    try { storage?.setItem(themeKey, config.theme); } catch {}
  }
  let initialSizes = [3,5,7], lastRandom = null;
  const settingsKey = 'last-match-board-v1';
  try {
    const saved = JSON.parse(storage?.getItem(settingsKey) || 'null');
    if (saved) {
      if (['3-5-7','4-6-8','5-7-9','random'].includes(saved.boardConfig)) config.boardConfig = saved.boardConfig;
      config.split = saved.split === true;
      if (Array.isArray(saved.lastRandom) && saved.lastRandom.length === 3 && saved.lastRandom.every((n,i,a) => Number.isInteger(n) && n>=3 && n<=9 && (!i || n>a[i-1]))) lastRandom = saved.lastRandom;
    }
  } catch {}
  function saveBoardSettings() {
    try { storage?.setItem(settingsKey, JSON.stringify({boardConfig:config.boardConfig,split:config.split,lastRandom})); } catch {}
  }
  const slotSize = () => Math.min(56, boardElement.clientWidth / Math.max(7,...initialSizes));
  const visualIndex = (row,id) => config.split ? rules.matchPosition(id) : board[row].indexOf(id);
  const visualLength = row => config.split ? initialSizes[row] : board[row].length;
  const scores = window.LastMatchScores.createScores(storage);
  let paused = false, burning = false;
  const pending = new Set();
  const isLocal = () => config.mode === 'local';
  const isPlayable = () => !paused && (phase === 'human' || (isLocal() && phase === 'computer'));
  const blue = player => player === 'computer';
  const playerName = player => isLocal() ? config.names[blue(player) ? 1 : 0] : blue(player) ? 'Piro' : 'You';
  const turnText = player => isLocal() ? `${playerName(player)}’s Turn` : blue(player) ? "Piro's Turn" : 'Your Turn';
  function updateScores() {
    const values = scores.get(config);
    ['human', 'computer'].forEach((player, seat) => {
      $(`player-${seat}-name`).textContent = playerName(player);
      $(`player-${seat}-wins`).textContent = String(values[seat]);
      const active = !winningPlayer && phase !== 'cancelled' && turn === player;
      $(`player-${seat}-score`).dataset.active = String(active);
      $(`player-${seat}-score`).dataset.winner = String(winningPlayer === player);
      $(`player-${seat}-score`).setAttribute('aria-current', active ? 'true' : 'false');
      $(`player-${seat}-name`).setAttribute('title', playerName(player));
    });
    $('scoreboard').setAttribute('aria-label', `${playerName('human')} ${values[0]}, ${playerName('computer')} ${values[1]}. ${winningPlayer ? `${playerName(winningPlayer)} wins.` : phase === 'cancelled' ? 'Game cancelled.' : turnText(turn)}`);
  }
  const sound = window.LastMatchSound;
  function updateSound() {
    $('sound-toggle').innerHTML = `<span aria-hidden="true">${sound.enabled ? '🔊' : '🔇'}</span>`;
    $('sound-toggle').setAttribute('aria-label', sound.enabled ? 'Mute sound' : 'Enable sound');
    $('sound-toggle').setAttribute('aria-pressed', String(sound.enabled));
  }
  // Resume directly from a trusted gesture, including Safari's audio gate.
  let keyboardNavigation = false;
  document.addEventListener('pointerdown', () => { keyboardNavigation = false; sound.unlock(); }, {capture:true});
  document.addEventListener('keydown', () => { keyboardNavigation = true; sound.unlock(); }, {capture:true});
  let computerSelection = null;
  function updateRuleLabels() {
    $('active-rule').textContent = activeRule === 'wins' ? 'WINS' : 'LOSES';
    $('active-rule').setAttribute('aria-label', activeRule === 'wins' ? 'Last Match Wins' : 'Last Match Loses');
    boardElement.setAttribute('aria-label', config.split ? 'Choose consecutive matches from one section' : 'Choose matches from one row');
  }
  function removeStrike() { if (strike) { strike.remove(); strike = null; } }
  function updateStrike() {
    const selection = gesture || computerSelection;
    if (!selection) return;
    if (!selection.ids.size) { removeStrike(); return; }
    const selected = [...selection.ids].map(id => document.getElementById(`match-${id}`));
    const slot = slotSize();
    const indices = selected.map(el => visualIndex(selection.row, el.dataset.id));
    const start = Math.min(...indices), end = Math.max(...indices);
    if (!strike) { strike = document.createElement('span'); strike.className = (computerSelection || blue(turn)) ? 'strike computer-strike' : 'strike'; strike.setAttribute('aria-hidden','true'); selected[0].parentNode.append(strike); }
    strike.style.left = `calc(50% + ${(start - (visualLength(selection.row) - 1) / 2) * slot - 14}px)`;
    strike.style.width = `${(end - start) * slot + 28}px`;
    strike.style.top = '53%';
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Pause the logical clock while setup is open. Cancelling resumes the exact
  // remaining delay; starting a replacement resolves obsolete waits by token.
  function schedule(item) {
    item.deadline = Date.now() + item.remaining;
    item.timer = setTimeout(() => { pending.delete(item); item.resolve(); }, item.remaining);
  }
  const delay = ms => new Promise(resolve => {
    const item = {remaining: ms, resolve}; pending.add(item);
    if (!paused) schedule(item);
  });
  const wait = ms => delay(reducedMotion.matches ? 10 : ms);
  let frozenAnimations = [];
  function pauseGame() {
    if (paused) return;
    paused = true; if (gesture) clearGesture(); sound.pause();
    // Web Animations includes CSS transitions (recentering), keyframes and
    // pseudo-element effects. Preserve their exact current times, not just timers.
    frozenAnimations = ($('game-shell').getAnimations?.({subtree:true}) || []).filter(a => a.playState === 'running' || a.pending);
    frozenAnimations.forEach(a => a.pause());
    for (const item of pending) { clearTimeout(item.timer); item.remaining = Math.max(0, item.deadline - Date.now()); }
    $('game-shell').classList.add('setup-open'); syncInput();
  }
  function resumeGame() {
    if (!paused) return;
    paused = false; $('game-shell').classList.remove('setup-open');
    for (const item of pending) schedule(item);
    frozenAnimations.forEach(a => { if (a.playState === 'paused') a.play(); }); frozenAnimations = [];
    sound.resume();
    syncInput();
  }
  function positionMatches() {
    board.forEach((row, r) => {
      const slot = slotSize();
      row.forEach((id, i) => {
        const el = document.getElementById(`match-${id}`);
        if (el) { el.style.setProperty('--slot', `${slot}px`); el.style.setProperty('--x', `${(visualIndex(r,id) - visualLength(r) / 2) * slot}px`); }
      });
    });
    updateStrike();
  }
  function renderBoard() {
    boardElement.replaceChildren();
    board.forEach((row, r) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'row'; rowElement.dataset.row = r;
      rowElement.setAttribute('role', 'group'); rowElement.setAttribute('aria-label', `Row ${r + 1}`);
      row.forEach(id => {
        const el = document.createElement('button');
        el.className = 'match'; el.id = `match-${id}`; el.dataset.id = id; el.dataset.row = r;
        el.setAttribute('aria-label', `Remove match ${Number(id.split('-')[1]) + 1} from row ${r + 1}`);
        el.innerHTML = '<span class="wood" aria-hidden="true"><span class="head"></span></span><span class="flame" aria-hidden="true"></span><span class="smoke" aria-hidden="true"></span>';
        // Keyboard and assistive-technology clicks have detail 0; pointer moves commit on release.
        el.addEventListener('click', event => { if (event.detail === 0 && isPlayable() && !gesture) { sound.play('select', blue(turn)); playMove(turn, r, [id]); } });
        rowElement.append(el);
      });
      boardElement.append(rowElement);
    });
    positionMatches();
  }
  function syncInput() {
    $('pause-game').hidden = phase === 'over' || phase === 'cancelled' || Boolean(winningPlayer);
    boardElement.querySelectorAll('button').forEach(el => { el.disabled = !isPlayable(); });
    boardElement.setAttribute('aria-busy', String(phase === 'animation' || (!isLocal() && phase === 'computer')));
  }
  function clearGesture() {
    const hadGesture = Boolean(gesture);
    if (gesture && boardElement.hasPointerCapture(gesture.pointerId)) boardElement.releasePointerCapture(gesture.pointerId);
    gesture = null;
    if (!computerSelection && (hadGesture || phase !== 'animation')) {
      removeStrike();
      boardElement.querySelectorAll('.selected').forEach(el => { el.classList.remove('selected'); if (isLocal()) el.classList.remove('computer-match'); });
    }
  }
  async function nextTurn(player, token) {
    if (token !== generation) return;
    phase = player; turn = player; syncInput(); updateScores(); sound.play('turn', blue(player));
    if (player === 'human' || isLocal()) return;
    // Presentation only: fewer rows feel more obvious. Never inspect move quality
    // or the winning strategy, and keep thinking separate from reduced motion.
    const rowsRemaining = board.filter(row => row.length).length;
    const thinkingMs = 1000 + (rowsRemaining - 1) * 300 + Math.floor(Math.random() * 401);
    await delay(thinkingMs);
    if (token !== generation) return;
    const move = rules.computerMove(board, difficulty, Math.random, activeRule, config.split);
    if (move) playMove('computer', move.row, move.ids);
  }
  async function playMove(player, row, ids) {
    if (phase !== player || paused) return;
    let next;
    try { next = rules.applyMove(board, row, ids, config.split); } catch { return; }
    const token = generation;
    phase = 'animation'; syncInput();
    const elements = ids.map(id => document.getElementById(`match-${id}`));
    if (player === 'computer' && !isLocal()) {
      computerSelection = {row, ids: new Set()};
      for (const el of elements) {
        el.classList.add('selected', 'computer-match');
        computerSelection.ids.add(el.dataset.id); updateStrike(); sound.play('select', true);
        await wait(110);
        if (token !== generation) return;
      }
      await wait(420);
      if (token !== generation) return;
      computerSelection = null; removeStrike();
    } else {
      elements.forEach(el => { el.classList.add('selected'); if (blue(player)) el.classList.add('computer-match'); });
      await wait(180);
      if (token !== generation) return;
    }
    elements.forEach(el => el.classList.add('burning'));
    burning = true; sound.play('burn', blue(player));
    await wait(800);
    if (token !== generation) return;
    burning = false; sound.stop('burn'); sound.play('crumble', blue(player));
    const finalMove = rules.isOver(next);
    const origin = finalMove ? moveOrigin(elements) : null;
    board = next;
    elements.forEach(el => el.remove());
    positionMatches();
    if (finalMove) {
      winningPlayer = rules.winner(player, activeRule);
      const celebrate = isLocal() || winningPlayer === 'human';
      phase = 'over'; syncInput();
      if (!scored) { scored = true; scores.record(config, winningPlayer === 'human' ? 0 : 1); }
      updateScores();
      $('result').dataset.celebrate = String(celebrate);
      $('result-title').textContent = isLocal() ? `${playerName(winningPlayer)} wins!` : celebrate ? 'You win!' : 'Piro wins.';
      $('result-detail').textContent = `${playerName(player)} took the last match${activeRule === 'loses' ? ' and lost.' : '.'}`;
      $('result').hidden = false;
      // The game is finished when the final burn completes. Replay never waits
      // for the presentation, and newGame clears every effect and audio voice.
      $('play-again').focus({preventScroll:true});
      burst(celebrate, origin);
      return;
    }
    await wait(player === 'computer' && !isLocal() ? 750 : 350);
    if (token !== generation) return;
    nextTurn(player === 'human' ? 'computer' : 'human', token);
  }

  function moveOrigin(elements) {
    const rects = elements.map(el => el.getBoundingClientRect());
    return {left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: rects[0].top, bottom: rects[0].bottom};
  }
  function burst(won, origin) {
    $('celebration').replaceChildren();
    sound.play(won ? 'win' : 'lose');
    if (reducedMotion.matches) return;
    const container = $('celebration').getBoundingClientRect();
    if (won) {
      const glow = document.createElement('div'); glow.className = 'final-glow';
      glow.style.left = `${(origin.left + origin.right) / 2 - container.left}px`;
      glow.style.top = `${(origin.top + origin.bottom) / 2 - container.top}px`;
      $('celebration').append(glow);
      const colors = config.theme === 'light' ? ['#bd7414','#ce3e76','#247da6','#8250b8'] : ['#ffd16b','#ff91b3','#8bdfff','#c0a9ff'];
      // CSS delays and one 3.6-second audio buffer share the same timeline.
      // No delayed callbacks can leak into a replacement game.
      [[25,29,.35],[75,38,1.35],[50,23,2.35]].forEach(([x,y,at],burstIndex) => {
        const firework = document.createElement('div'); firework.className = 'firework';
        firework.style.left = `${x}%`; firework.style.top = `${y}%`;
        firework.style.setProperty('--burst-delay', `${at}s`);
        const ring = document.createElement('i'); ring.className = 'firework-ring';
        ring.style.color = colors[burstIndex]; firework.append(ring);
        const radius = Math.min((container.right-container.left)*.27,(container.bottom-container.top)*.34,110);
        for (let i=0;i<36;i++) {
          const spark = document.createElement('i'); spark.className = 'spark victory-spark';
          const angle = i / 36 * Math.PI * 2;
          const distance = radius * (.65 + Math.random() * .35);
          spark.style.setProperty('--dx', `${Math.cos(angle)*distance}px`);
          spark.style.setProperty('--dy', `${Math.sin(angle)*distance*.85+24}px`);
          spark.style.background = colors[(i+burstIndex)%colors.length];
          spark.style.color = colors[(i+burstIndex)%colors.length];
          spark.addEventListener('animationend', () => spark.remove()); firework.append(spark);
        }
        firework.addEventListener('animationend', event => { if (event.target === ring) ring.remove(); });
        $('celebration').append(firework);
      });
      return;
    }
    // Piro's victory retains the smaller playful poof.
    for (let i = 0; i < 14; i++) {
      const spark = document.createElement('i'); spark.className = 'spark';
      const angle = (i / 14) * Math.PI * 2;
      const radius = 35 + Math.random() * 25;
      spark.style.left = `${(origin.left + origin.right) / 2 - container.left}px`;
      spark.style.top = `${(origin.top + origin.bottom) / 2 - container.top}px`;
      spark.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * radius}px`);
      spark.style.background = ['#f4a66b','#eedfc2','#a8b98c'][i % 3];
      spark.addEventListener('animationend', () => spark.remove()); $('celebration').append(spark);
    }
  }

  function newGame(nextConfig = config, announce = true) {
    generation++;
    for (const item of pending) { clearTimeout(item.timer); item.resolve(); } pending.clear();
    frozenAnimations.forEach(a => a.cancel()); frozenAnimations = [];
    sound.stop(); sound.resume(); burning = false; computerSelection = null; clearGesture(); removeStrike();
    paused = false; $('game-shell').classList.remove('setup-open');
    config = {...nextConfig, names: [...nextConfig.names]}; applyTheme(); scored = false; winningPlayer = null;
    initialSizes = rules.startingSizes(config.boardConfig, Math.random, lastRandom);
    if (config.boardConfig === 'random') lastRandom = [...initialSizes];
    saveBoardSettings();
    board = rules.createBoard(initialSizes); activeRule = config.rule; difficulty = config.difficulty;
    updateRuleLabels(); $('result').dataset.celebrate = 'false'; $('result').hidden = true; $('play-again').hidden = false; $('start-announcement').hidden = true; $('celebration').replaceChildren();
    const starter = rules.startingPlayer(++gameNumbers[config.mode]);
    turn = starter; phase = 'announcement'; renderBoard(); syncInput(); updateScores();
    if (announce) announceStart(starter,generation); else nextTurn(starter,generation);
  }
  async function announceStart(starter, token) {
    const announcement = $('start-announcement');
    announcement.textContent = starter === 'human' && !isLocal() ? 'You Start!' : `${playerName(starter)} Starts!`;
    announcement.dataset.player = starter; announcement.hidden = false;
    await delay(1250); // Readable even with reduced motion; no animation required.
    if (token !== generation) return;
    announcement.hidden = true; nextTurn(starter,token);
  }
  function closePause() { $('pause-dialog').close(); resumeGame(); }
  function cancelGame() {
    generation++;
    for (const item of pending) { clearTimeout(item.timer); item.resolve(); } pending.clear();
    frozenAnimations.forEach(a => a.cancel()); frozenAnimations = [];
    ($('game-shell').getAnimations?.({subtree:true}) || []).forEach(a => a.cancel());
    sound.stop(); burning = false; computerSelection = null; clearGesture(); removeStrike();
    boardElement.querySelectorAll('button').forEach(el => { el.classList.remove('selected'); el.classList.remove('burning'); el.classList.remove('computer-match'); });
    phase = 'cancelled'; paused = false; $('game-shell').classList.remove('setup-open'); sound.resume();
    $('start-announcement').hidden = true; $('celebration').replaceChildren();
    $('result').dataset.celebrate = 'false';
    $('result-title').textContent = 'Game cancelled'; $('result-detail').textContent = 'Open Game Setup to start another game.';
    $('play-again').hidden = true; $('result').hidden = false;
    $('pause-dialog').close(); syncInput(); updateScores(); $('new-game').focus({preventScroll:true});
  }
  function readSetup() {
    return {mode: $('setup-mode').value === 'local' ? 'local' : 'computer',
      difficulty: $('setup-difficulty').value === 'expert' ? 'expert' : 'beginner',
      rule: $('setup-rule').value === 'loses' ? 'loses' : 'wins',
      boardConfig: ['3-5-7','4-6-8','5-7-9','random'].includes($('setup-board').value) ? $('setup-board').value : '3-5-7',
      split: $('setup-split').value === 'on',
      theme: $('setup-theme').value === 'light' ? 'light' : 'dark',
      names: [$('player-one').value, $('player-two').value].map(window.LastMatchScores.cleanName)};
  }
  function updateSetup() {
    const draft = readSetup();
    $('difficulty-field').hidden = draft.mode !== 'computer';
    $('names-field').hidden = draft.mode !== 'local';
    $('setup-explanation').textContent = draft.rule === 'wins' ? 'Strike the final match to win.' : 'Strike the final match and lose.';
    $('reset-confirmation').hidden = true;
  }
  function openSetup() {
    if ($('setup').open) return;
    $('setup-mode').value = config.mode; $('setup-difficulty').value = config.difficulty; $('setup-rule').value = config.rule;
    $('setup-board').value = config.boardConfig; $('setup-split').value = config.split ? 'on' : 'off';
    $('setup-theme').value = config.theme;
    const names = scores.names(); $('player-one').value = names[0]; $('player-two').value = names[1];
    updateSetup(); pauseGame(); $('setup').showModal();
  }
  function closeSetup() { $('setup').close(); resumeGame(); }
  function selectAt(x, y) {
    const g = gesture;
    // The selected interval is anchored at the first match. Reversing the
    // pointer shrinks it; returning past the anchor cancels the whole move.
    const section = config.split ? rules.sections(board,true).find(s => s.row === g.row && s.ids.includes(g.anchor)).ids : board[g.row];
    const rowElements = [...boardElement.querySelectorAll(`.row[data-row="${g.row}"] .match`)].filter(el => section.includes(el.dataset.id));
    const first = rowElements[0].getBoundingClientRect();
    if (y < first.top || y > first.bottom) return; // Never follow a different row.
    const slot = first.right - first.left;
    const end = Math.max(0, Math.min(rowElements.length - 1, Math.floor((x - first.left) / slot)));
    const anchor = section.indexOf(g.anchor);
    if (!g.direction && Math.abs(x - g.startX) >= slot * .35) g.direction = Math.sign(x - g.startX);
    const anchorRect = rowElements[anchor].getBoundingClientRect();
    const anchorCenter = (anchorRect.left + anchorRect.right) / 2;
    const cancelled = g.direction && (x - anchorCenter) * g.direction < -5;
    const previous = [...g.ids].join(',');
    g.ids = cancelled ? new Set() : new Set(section.slice(Math.min(anchor,end), Math.max(anchor,end) + 1));
    rowElements.forEach(el => { if (g.ids.has(el.dataset.id)) { el.classList.add('selected'); if (blue(turn)) el.classList.add('computer-match'); } else { el.classList.remove('selected'); if (isLocal()) el.classList.remove('computer-match'); } });
    if (g.ids.size && [...g.ids].join(',') !== previous) sound.play('select', blue(turn));
    g.x = x; g.y = y; updateStrike();
  }
  boardElement.addEventListener('pointerdown', event => {
    if (!isPlayable() || gesture || !event.isPrimary || event.button !== 0) return;
    const el = event.target.closest('.match');
    if (!el) return;
    event.preventDefault();
    gesture = {pointerId:event.pointerId, row:Number(el.dataset.row), ids:new Set([el.dataset.id]), anchor:el.dataset.id, startX:event.clientX, direction:0, x:event.clientX, y:event.clientY};
    sound.play('select', blue(turn));
    el.classList.add('selected'); if (blue(turn)) el.classList.add('computer-match'); updateStrike(); boardElement.setPointerCapture(event.pointerId);
  });
  boardElement.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault(); selectAt(event.clientX, event.clientY);
  });
  boardElement.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    selectAt(event.clientX, event.clientY);
    const {row, ids} = gesture; clearGesture(); if (ids.size) playMove(turn, row, [...ids]);
  });
  boardElement.addEventListener('pointercancel', event => { if (gesture && event.pointerId === gesture.pointerId) clearGesture(); });
  boardElement.addEventListener('lostpointercapture', () => { if (gesture) clearGesture(); });
  window.addEventListener('blur', clearGesture);
  new ResizeObserver(positionMatches).observe(boardElement);
  $('help-toggle').addEventListener('click', () => { pauseGame(); $('instructions').showModal(); });
  $('help-close').addEventListener('click', () => { $('instructions').close(); resumeGame(); });
  $('instructions').addEventListener('close', resumeGame);
  $('instructions').addEventListener('cancel', event => { event.preventDefault(); $('instructions').close(); resumeGame(); });
  $('pause-game').addEventListener('click', () => { if (phase === 'over' || phase === 'cancelled' || winningPlayer) return; pauseGame(); $('pause-dialog').showModal(); });
  $('resume-game').addEventListener('click', closePause);
  $('cancel-game').addEventListener('click', cancelGame);
  $('pause-dialog').addEventListener('close', resumeGame);
  $('pause-dialog').addEventListener('cancel', event => { event.preventDefault(); closePause(); });
  $('sound-toggle').addEventListener('click', () => { sound.setEnabled(!sound.enabled); updateSound(); });
  updateSound();
  $('new-game').addEventListener('click', openSetup);
  $('play-again').addEventListener('click', () => newGame());
  ['setup-mode', 'setup-difficulty', 'setup-rule', 'setup-board', 'setup-split', 'setup-theme'].forEach(id => $(id).addEventListener('change', updateSetup));
  ['player-one', 'player-two'].forEach(id => $(id).addEventListener('input', updateSetup));
  $('setup-cancel').addEventListener('click', closeSetup);
  $('setup').addEventListener('cancel', event => { event.preventDefault(); closeSetup(); });
  $('setup').addEventListener('close', () => {
    resumeGame();
    // Native dialogs restore focus to their opener, even after pointer use in
    // text fields. Keep that restoration for keyboard users only.
    if (!keyboardNavigation && document.activeElement === $('new-game')) $('new-game').blur();
  });
  $('setup-form').addEventListener('submit', event => {
    event.preventDefault(); const draft = readSetup();
    scores.remember(draft.names); newGame(draft); $('setup').close();
  });
  $('reset-scores').addEventListener('click', () => {
    const draft = readSetup(), names = draft.mode === 'local' ? draft.names : ['You', 'Piro'];
    $('reset-description').textContent = `Reset wins for ${names[0]} and ${names[1]}?`;
    $('reset-confirmation').hidden = false; $('reset-cancel').focus();
  });
  $('reset-cancel').addEventListener('click', () => { $('reset-confirmation').hidden = true; $('reset-scores').focus(); });
  $('reset-confirm').addEventListener('click', () => {
    scores.reset(readSetup()); updateScores(); $('reset-confirmation').hidden = true; $('reset-scores').focus();
  });
  newGame(config, false);
})();
