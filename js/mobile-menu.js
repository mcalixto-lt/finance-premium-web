(() => {
  'use strict';

  const init = () => {
    const button = document.getElementById('mobileMenuButton');
    const sidebar = document.getElementById('sidebar');
    if (!button || !sidebar) return;

    let backdrop = document.querySelector('.mobile-nav-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'mobile-nav-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
    }

    const isMobile = () => window.matchMedia('(max-width: 1080px)').matches;

    const openMenu = () => {
      if (!isMobile()) return;
      sidebar.classList.add('mobile-open');
      backdrop.classList.add('open');
      document.body.classList.add('mobile-nav-open');
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', 'Fechar menu');
      backdrop.setAttribute('aria-hidden', 'false');
    };

    const closeMenu = () => {
      sidebar.classList.remove('mobile-open');
      backdrop.classList.remove('open');
      document.body.classList.remove('mobile-nav-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Abrir menu');
      backdrop.setAttribute('aria-hidden', 'true');
    };

    const toggleMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      sidebar.classList.contains('mobile-open') ? closeMenu() : openMenu();
    };

    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', toggleMenu, true);
    backdrop.addEventListener('click', closeMenu);

    sidebar.addEventListener('click', event => {
      if (event.target.closest('[data-page]') || event.target.closest('[data-page-link]')) closeMenu();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenu();
    });

    let startX = null;
    sidebar.addEventListener('touchstart', event => {
      startX = event.touches?.[0]?.clientX ?? null;
    }, { passive: true });
    sidebar.addEventListener('touchend', event => {
      if (startX == null) return;
      const endX = event.changedTouches?.[0]?.clientX ?? startX;
      if (startX - endX > 55) closeMenu();
      startX = null;
    }, { passive: true });

    window.addEventListener('resize', () => {
      if (!isMobile()) closeMenu();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
