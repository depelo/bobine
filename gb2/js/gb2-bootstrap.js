/**
 * GB2 Layer 2 Bootstrap
 * Gestisce SOLO la sidebar e il menu dinamico delle app autorizzate.
 * L'app MRP si inizializza da sola (DOMContentLoaded in mrp-app.js).
 */
(function () {
    'use strict';

    function openMenuDrawer() {
        const drawer = document.getElementById('menuDrawer');
        const backdrop = document.getElementById('menuDrawerBackdrop');
        if (drawer) { drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); }
        if (backdrop) { backdrop.classList.add('is-open'); backdrop.setAttribute('aria-hidden', 'false'); }
    }

    function closeMenuDrawer() {
        const drawer = document.getElementById('menuDrawer');
        const backdrop = document.getElementById('menuDrawerBackdrop');
        if (drawer) { drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); }
        if (backdrop) { backdrop.classList.remove('is-open'); backdrop.setAttribute('aria-hidden', 'true'); }
    }

    function buildDynamicMenu() {
        const apps = window.SecurityData?.user?.authorizedApps;
        if (!Array.isArray(apps)) return;

        const container = document.getElementById('dynamicMenuApps');
        if (!container) return;
        container.innerHTML = '';

        const urlMap = { 1: '/bobine.html', 3: '/ET.html' };
        const iconMap = { 1: '🏭', 3: '🏷️' };

        apps.forEach((app) => {
            const aid = Number(app.id);
            if (aid === 4 || aid === 2) return;
            const url = urlMap[aid];
            if (!url) return;

            const item = document.createElement('div');
            item.className = 'gb2-nav-item';
            item.innerHTML = `<span class="gb2-nav-icon">${iconMap[aid] || '📦'}</span><span>${app.name || 'App'}</span>`;
            item.addEventListener('click', () => { closeMenuDrawer(); window.location.href = url; });
            container.appendChild(item);
        });

        const captainBtn = document.getElementById('menuOpenCaptain');
        if (captainBtn && window.SecurityData?.user?.isSuperuser) {
            captainBtn.classList.remove('is-hidden');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) menuBtn.addEventListener('click', openMenuDrawer);
        document.getElementById('menuDrawerClose')?.addEventListener('click', closeMenuDrawer);
        document.getElementById('menuDrawerBackdrop')?.addEventListener('click', closeMenuDrawer);

        document.getElementById('menuDrawer')?.addEventListener('click', (e) => {
            const item = e.target.closest('[data-menu-action]');
            if (!item) return;
            closeMenuDrawer();
            if (item.dataset.menuAction === 'open-profile') window.location.href = '/profile.html';
            else if (item.dataset.menuAction === 'open-captain') window.location.href = '/captain.html';
        });
    });

    // Costruisci menu quando SecurityData e disponibile
    document.addEventListener('securityReady', buildDynamicMenu);
    if (window.SecurityData?.user) setTimeout(buildDynamicMenu, 50);
})();
