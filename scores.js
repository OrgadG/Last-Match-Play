/* Local names and pairing scores. No network access; storage is optional. */
(function (root) {
  'use strict';
  const KEY = 'last-match-players-v1';
  const cleanName = (value, seat) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 24) : '') || `Player ${seat + 1}`;
  function createScores(storage) {
    let data = {names: ['Player 1', 'Player 2'], pairs: Object.create(null)};
    try {
      const saved = JSON.parse(storage.getItem(KEY));
      if (saved && Array.isArray(saved.names) && saved.names.length === 2) data.names = saved.names.map(cleanName);
      if (saved && saved.pairs && typeof saved.pairs === 'object') {
        for (const [key, scores] of Object.entries(saved.pairs)) {
          if (Array.isArray(scores) && scores.length === 2 && scores.every(n => Number.isSafeInteger(n) && n >= 0)) data.pairs[key] = scores;
        }
      }
    } catch { /* Private browsing, unavailable storage or invalid saved data. */ }
    function save() { try { storage.setItem(KEY, JSON.stringify(data)); } catch {} }
    function pairing(config) {
      if (config.mode === 'computer') return {key: 'computer', seats: [0, 1]};
      const names = config.names.map((name, seat) => ({name: cleanName(name, seat).toLowerCase(), seat}));
      names.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.seat - b.seat);
      return {key: JSON.stringify(names.map(item => item.name)), seats: names.map(item => item.seat)};
    }
    function get(config) {
      const {key, seats} = pairing(config), values = data.pairs[key] || [0, 0];
      return [values[seats.indexOf(0)], values[seats.indexOf(1)]];
    }
    function record(config, seat) {
      const {key, seats} = pairing(config);
      const values = data.pairs[key] || [0, 0];
      values[seats.indexOf(seat)]++; data.pairs[key] = values; save();
    }
    function reset(config) { data.pairs[pairing(config).key] = [0, 0]; save(); }
    function remember(names) { data.names = names.map(cleanName); save(); }
    return {get, record, reset, remember, names: () => [...data.names]};
  }
  const api = {createScores, cleanName};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LastMatchScores = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
