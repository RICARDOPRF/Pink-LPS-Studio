// Pink Autonomy Modal Hotfix — ensures hidden state wins over overlay display styles.
(() => {
  'use strict';

  const STYLE_ID = 'pink-autonomy-modal-hotfix-style';
  const OVERLAY_ID = 'pinkAutonomyOverlay';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}[hidden] { display: none !important; }
      #${OVERLAY_ID}.pink-autonomy-overlay[hidden] { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function close() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('pink-autonomy-open');
    return true;
  }

  function sync() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return false;
    if (overlay.hidden) overlay.setAttribute('aria-hidden', 'true');
    else overlay.setAttribute('aria-hidden', 'false');
    return true;
  }

  function install() {
    ensureStyle();
    close();

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay || overlay.hidden) return;
      event.preventDefault();
      close();
    });

    document.addEventListener('click', event => {
      const closeButton = event.target?.closest?.('[data-pink-close]');
      if (!closeButton) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }, true);

    const observer = new MutationObserver(sync);
    const watch = () => {
      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) return false;
      observer.observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
      sync();
      return true;
    };

    if (!watch()) {
      const bodyObserver = new MutationObserver(() => {
        if (watch()) bodyObserver.disconnect();
      });
      bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.PinkAutonomyModalHotfix = Object.freeze({ version: '1.0.0', close, sync });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
