/**
 * GB2 Layer 2 Bootstrap
 * Ponte tra sicurezza.js (PortalUjet) e l'app MRP (Gabriele 2.0).
 * - Ascolta securityReady per inizializzare l'app
 * - Gestisce la sidebar a scomparsa
 * - Costruisce il menu dinamico delle app autorizzate
 */
(function () {
    'use strict';

    // --- Sidebar ---
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

    // --- Menu dinamico (app autorizzate) ---
    function buildDynamicMenu() {
        const apps = window.SecurityData?.user?.authorizedApps;
        if (!Array.isArray(apps)) return;

        const container = document.getElementById('dynamicMenuApps');
        if (!container) return;
        container.innerHTML = '';

        // Mappa IDModule -> URL
        const urlMap = {
            1: '/bobine.html',     // App Bobine
            3: '/ET.html'          // Progettazione Etichette
            // 4 = GB2 = noi stessi, non mostrare
        };

        apps.forEach((app) => {
            const aid = Number(app.id);
            if (aid === 4 || aid === 2) return; // Salta noi stessi e Captain
            const url = urlMap[aid];
            if (!url) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'menu-drawer-btn';
            btn.textContent = app.name || 'App';
            btn.addEventListener('click', () => {
                closeMenuDrawer();
                window.location.href = url;
            });
            container.appendChild(btn);
        });

        // Captain Console (se superuser)
        const captainBtn = document.getElementById('menuOpenCaptain');
        if (captainBtn && window.SecurityData?.user?.isSuperuser) {
            captainBtn.classList.remove('is-hidden');
        }
    }

    // --- Bootstrap dall'evento di sicurezza ---
    function bootstrapFromSecurity() {
        if (!window.SecurityData || !window.SecurityData.user) return;

        buildDynamicMenu();

        // Inizializza l'app MRP
        if (window.MrpApp && typeof MrpApp.init === 'function') {
            MrpApp.init();
        }
    }

    // --- Event listeners ---
    document.addEventListener('DOMContentLoaded', () => {
        // Sidebar toggle
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) menuBtn.addEventListener('click', openMenuDrawer);

        const closeBtn = document.getElementById('menuDrawerClose');
        if (closeBtn) closeBtn.addEventListener('click', closeMenuDrawer);

        const backdrop = document.getElementById('menuDrawerBackdrop');
        if (backdrop) backdrop.addEventListener('click', closeMenuDrawer);

        // Menu actions
        const drawer = document.getElementById('menuDrawer');
        if (drawer) {
            drawer.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-menu-action]');
                if (!btn) return;
                const action = btn.dataset.menuAction;
                closeMenuDrawer();
                if (action === 'open-profile') window.location.href = '/profile.html';
                else if (action === 'open-captain') window.location.href = '/captain.html';
            });
        }
    });

    // Ascolta l'evento di sicurezza
    document.addEventListener('securityReady', () => {
        bootstrapFromSecurity();
    });

    // Fallback se SecurityData gia disponibile
    if (window.SecurityData && window.SecurityData.user) {
        setTimeout(() => bootstrapFromSecurity(), 50);
    }

    // Aggiornamento post-cambio password (sipario)
    document.addEventListener('securityCurtainResolved', () => {
        // Nessuna azione speciale necessaria per MRP
    });
})();
