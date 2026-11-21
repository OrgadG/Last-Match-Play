// Local file play still works. Installation requires HTTPS (or localhost for testing).
(() => {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'})
      .then(() => navigator.serviceWorker.ready)
      .then(() => { document.documentElement.dataset.offlineReady = 'true'; })
      .catch(error => console.warn('Offline setup unavailable; online play is unaffected.', error));
  });
})();
