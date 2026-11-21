/* Pure rules: physical rows contain stable match IDs; sections are derived independently. */
(function (root) {
  'use strict';
  function createBoard(sizes = [3, 5, 7]) {
    if (!Array.isArray(sizes) || !sizes.length || sizes.some(n => !Number.isInteger(n) || n < 0)) throw new Error('Invalid board');
    return sizes.map((n, r) => Array.from({length: n}, (_, i) => `${r}-${i}`));
  }
  function applyMove(board, row, ids, split = false) {
    if (!Number.isInteger(row) || !board[row] || !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !board[row].includes(id))) throw new Error('Invalid move');
    if (split) {
      const section = sections(board, true).find(section => section.row === row && ids.every(id => section.ids.includes(id)));
      const indices = section && ids.map(id => section.ids.indexOf(id)).sort((a,b) => a-b);
      if (!indices || indices.at(-1) - indices[0] + 1 !== ids.length) throw new Error('Move must be contiguous within one section');
    }
    return board.map((matches, r) => r === row ? matches.filter(id => !ids.includes(id)) : [...matches]);
  }
  const isOver = board => board.every(row => row.length === 0);
  const nimSum = board => board.reduce((sum, row) => sum ^ row.length, 0);
  function startingPlayer(gameNumber = 1) {
    return gameNumber % 2 === 1 ? 'human' : 'computer';
  }
  function winner(lastPlayer, rule = 'wins') {
    return rule === 'loses' ? (lastPlayer === 'human' ? 'computer' : 'human') : lastPlayer;
  }
  function computerMove(board, difficulty, random = Math.random, rule = 'wins', split = false) {
    if (split) return splitMove(board, difficulty, random, rule);
    const rows = board.map((matches, row) => ({row, count: matches.length})).filter(item => item.count);
    if (!rows.length) return null;
    const sum = nimSum(board);
    if (difficulty === 'expert' || random() < 0.55) {
      if (rule === 'loses') {
        const large = rows.filter(item => item.count > 1);
        if (large.length === 0) return {row: rows[0].row, ids: board[rows[0].row].slice()};
        if (large.length === 1) {
          // Leave an odd number of singleton heaps to the opponent.
          const row = large[0].row;
          const target = (rows.length - 1) % 2 === 0 ? 1 : 0;
          return {row, ids: board[row].slice(target)};
        }
      }
      for (const {row, count} of rows) {
        const target = count ^ sum;
        if (target < count) return {row, ids: board[row].slice(target)};
      }
    }
    const chosen = rows[Math.floor(random() * rows.length)];
    const count = 1 + Math.floor(random() * chosen.count);
    return {row: chosen.row, ids: board[chosen.row].slice(-count)};
  }
  // IDs retain the original slot even after removals. Physical rows never multiply.
  const matchPosition = id => Number(id.split('-')[1]);
  function sections(board, split = false) {
    const result = [];
    board.forEach((ids, row) => {
      let section;
      ids.forEach((id, index) => {
        if (!section || (split && matchPosition(id) !== matchPosition(ids[index-1]) + 1)) {
          section = {row, ids: []}; result.push(section);
        }
        section.ids.push(id);
      });
    });
    return result;
  }
  const configs = Object.freeze({'3-5-7': [3,5,7], '4-6-8': [4,6,8], '5-7-9': [5,7,9]});
  function startingSizes(config = '3-5-7', random = Math.random, previous = null) {
    if (config !== 'random') return [...(configs[config] || configs['3-5-7'])];
    const choices = [];
    for (let a=3;a<=7;a++) for (let b=a+1;b<=8;b++) for (let c=b+1;c<=9;c++) {
      const sizes=[a,b,c];
      if (sizes.join(',') !== previous?.join(',')) choices.push(sizes);
    }
    return choices[Math.min(choices.length-1, Math.floor(random()*choices.length))];
  }
  // Exact impartial-game search. Canonical multisets of section lengths erase
  // irrelevant row/position distinctions. Every move strictly reduces total size.
  // In misere play an empty position is winning for the player about to move:
  // their opponent just took the final match and lost.
  const splitCache = {wins: new Map(), loses: new Map()};
  function splitWinning(lengths, rule = 'wins') {
    const state = lengths.filter(n => n > 0).sort((a,b) => a-b);
    if (!state.length) return rule === 'loses';
    const cache = splitCache[rule], key = state.join(',');
    if (cache.has(key)) return cache.get(key);
    for (let i=0;i<state.length;i++) {
      if (i && state[i] === state[i-1]) continue;
      const rest = state.filter((_, index) => index !== i), n=state[i];
      for (let left=0;left<n;left++) for (let right=0;right<n-left;right++) {
        if (right < left) continue; // reflected moves have identical outcomes
        if (!splitWinning([...rest,left,right], rule)) { cache.set(key,true); return true; }
      }
    }
    cache.set(key,false); return false;
  }
  function splitMove(board, difficulty, random, rule) {
    const groups = sections(board,true);
    if (!groups.length) return null;
    const moves = [];
    for (let i=0;i<groups.length;i++) {
      const group=groups[i], n=group.ids.length;
      for (let start=0;start<n;start++) for (let end=start+1;end<=n;end++) {
        moves.push({row:group.row, ids:group.ids.slice(start,end),
          lengths:[...groups.filter((_,j)=>j!==i).map(g=>g.ids.length),start,n-end]});
      }
    }
    let chosen;
    if (difficulty === 'expert' || random() < .55) chosen = moves.find(move => !splitWinning(move.lengths,rule));
    chosen ||= moves[Math.floor(random()*moves.length)];
    return {row:chosen.row, ids:chosen.ids};
  }
  const api = {createBoard, applyMove, isOver, nimSum, startingPlayer, computerMove, winner,
    sections, matchPosition, startingSizes, splitWinning};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LastMatchRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
