const API_URL = '/api';

// Funzioni per i modali isolati
function showProfSuccess(msg) {
    document.getElementById('profSuccessMsg').textContent = msg;
    document.getElementById('profSuccessModal').classList.add('is-active');
}

function showProfError(msg) {
    document.getElementById('profErrorMsg').textContent = msg;
    document.getElementById('profErrorModal').classList.add('is-active');
}

function closeProfModals() {
    document.getElementById('profSuccessModal').classList.remove('is-active');
    document.getElementById('profErrorModal').classList.remove('is-active');
}

document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;

    // Gestione tasto Indietro
    document.getElementById('btnGoBack').addEventListener('click', () => {
        if (currentUser && currentUser.defaultModuleId === 2) {
            window.location.href = '/captain.html';
        } else {
            window.location.href = '/bobine.html';
        }
    });

    // 1. Caricamento dati utente
    try {
        const res = await fetch(`${API_URL}/me`, { credentials: 'include' });
        if (res.ok) {
            currentUser = await res.json();
            document.getElementById('profName').textContent = currentUser.name || '-';

            // Generazione dinamica dei ruoli e controllo password
            let needsPassword = currentUser.isSuperuser; // Il superuser di base richiede sempre password
            const rolesContainer = document.getElementById('profRolesContainer');
            rolesContainer.innerHTML = '';

            if (currentUser.authorizedApps && currentUser.authorizedApps.length > 0) {
                currentUser.authorizedApps.forEach(app => {
                    // Controlla il requisito password per l'app corrente
                    if (app.requiresPassword) needsPassword = true;

                    // Crea il badge visivo per l'app
                    const badge = document.createElement('div');
                    badge.style.cssText = 'font-size: 0.85rem; padding: 6px 10px; border-radius: 6px; background: var(--bg-content); border: 1px solid var(--border); box-shadow: 0 1px 2px rgba(0,0,0,0.05);';

                    // Mostra Nome App e Nome Ruolo Visibile
                    const appLabel = app.roleLabel || app.roleKey;
                    badge.innerHTML = `<span style="color: var(--primary); font-weight: bold;">${app.name}</span> <span style="color: var(--text-muted); margin: 0 4px;">&rarr;</span> <span style="font-weight: 600;">${appLabel}</span>`;

                    rolesContainer.appendChild(badge);
                });
            } else {
                rolesContainer.innerHTML = '<span style="font-weight: bold; color: var(--text-muted); font-size: 0.9rem;">Nessun accesso</span>';
            }

            // Nascondi il blocco password se nessun ruolo in nessuna app lo richiede
            if (!needsPassword) {
                document.getElementById('passwordSectionWrapper').style.display = 'none';
            }

        } else {
            document.getElementById('profName').textContent = 'Utente non autenticato';
        }
    } catch (e) {
        console.error('Errore fetch profilo', e);
        showProfError('Impossibile caricare i dati del profilo.');
    }

    // 2. Cambio Password
    const changePwdForm = document.getElementById('changePwdForm');
    if (changePwdForm) {
        changePwdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const oldPassword = document.getElementById('oldPwd').value;
            const newPassword = document.getElementById('newPwd').value;

            try {
                const res = await fetch(`${API_URL}/users/me/password`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ oldPassword, newPassword })
                });

                if (res.ok) {
                    changePwdForm.reset();
                    showProfSuccess('Password aggiornata con successo.');
                } else {
                    const data = await res.json();
                    showProfError(data.message || 'Errore durante l\'aggiornamento.');
                }
            } catch (err) {
                showProfError('Errore di rete di connessione al server.');
            }
        });
    }
});
