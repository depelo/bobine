(function () {
  'use strict';

  const APP_CONFIG = {
    1: { url: '/bobine.html', icon: '🏭' },
    3: { url: '/ET.html', icon: '🏷️' },
    4: { url: '/gb2.html', icon: '📦' },
    5: { url: '/ITT/classificazione.html', icon: '🔬' },
    6: { url: '/PRG/prg.html', icon: '📋' },
  };

  function normalizePath(path) {
    if (!path) return '/';
    const lowered = path.toLowerCase();
    if (lowered.length > 1 && lowered.endsWith('/')) return lowered.slice(0, -1);
    return lowered;
  }

  function isAppActive(appId) {
    const currentPath = normalizePath(window.location.pathname);
    if (appId === 6) return currentPath.startsWith('/prg/');
    if (appId === 5) return currentPath.startsWith('/itt/');
    const target = APP_CONFIG[appId]?.url;
    if (!target) return false;
    return currentPath === normalizePath(target);
  }

  function openMenuDrawer() {
    const drawer = document.getElementById('menuDrawer');
    const backdrop = document.getElementById('menuDrawerBackdrop');
    if (drawer) {
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) {
      backdrop.classList.add('is-open');
      backdrop.setAttribute('aria-hidden', 'false');
    }
  }

  function closeMenuDrawer() {
    const drawer = document.getElementById('menuDrawer');
    const backdrop = document.getElementById('menuDrawerBackdrop');
    if (drawer) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.remove('is-open');
      backdrop.setAttribute('aria-hidden', 'true');
    }
  }

  function buildDynamicMenu() {
    const apps = window.SecurityData?.user?.authorizedApps;
    if (!Array.isArray(apps)) return;

    const container = document.getElementById('dynamicMenuApps');
    if (!container) return;
    container.innerHTML = '';

    apps.forEach((app) => {
      const aid = Number(app.id);
      if (aid === 2) return;
      const cfg = APP_CONFIG[aid];
      if (!cfg) return;

      const item = document.createElement('div');
      item.className = `gb2-nav-item${isAppActive(aid) ? ' is-active' : ''}`;
      item.innerHTML = `<span class="gb2-nav-icon">${cfg.icon || '📦'}</span><span>${app.name || 'App'}</span>`;
      item.addEventListener('click', () => {
        closeMenuDrawer();
        window.location.href = cfg.url;
      });
      container.appendChild(item);
    });

    const captainBtn = document.getElementById('menuOpenCaptain');
    if (captainBtn && window.SecurityData?.user?.isSuperuser) {
      captainBtn.classList.remove('is-hidden');
    }
  }

  function bindSidebarEvents() {
    document.getElementById('menuBtn')?.addEventListener('click', openMenuDrawer);
    document.getElementById('menuDrawerBackdrop')?.addEventListener('click', closeMenuDrawer);

    document.getElementById('menuDrawer')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-menu-action]');
      if (!item) return;
      closeMenuDrawer();
      if (item.dataset.menuAction === 'open-profile') {
        window.location.href = '/profile.html';
      } else if (item.dataset.menuAction === 'open-captain') {
        window.location.href = '/captain.html';
      }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      try {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      } catch (err) {
        console.error('Errore durante il logout:', err);
      }
      window.SecurityData = null;
      window.location.href = '/';
    });
  }

  async function injectSidebar() {
    if (document.getElementById('menuDrawer')) {
      bindSidebarEvents();
      buildDynamicMenu();
      return;
    }
    try {
      const response = await fetch('/assets/components/sidebar.html', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      document.body.insertAdjacentHTML('afterbegin', html);
      bindSidebarEvents();
      buildDynamicMenu();
    } catch (error) {
      console.error('Impossibile caricare la sidebar condivisa:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', injectSidebar);
  document.addEventListener('securityReady', buildDynamicMenu);

  window.PortalSidebar = {
    refresh: buildDynamicMenu,
    open: openMenuDrawer,
    close: closeMenuDrawer,
  };
})();
