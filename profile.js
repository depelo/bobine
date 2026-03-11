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

            // Estrazione Nome Visibile e Flag Password dall'app principale
            let primaryRoleLabel = '-';
            let needsPassword = false;

            if (currentUser.isSuperuser) {
                primaryRoleLabel = 'Superuser (Master)';
                needsPassword = true;
            } else if (currentUser.authorizedApps && currentUser.authorizedApps.length > 0) {
                // Prendi l'app di default o la prima disponibile
                const mainApp = currentUser.authorizedApps.find(a => a.id === currentUser.defaultModuleId) || currentUser.authorizedApps[0];
                primaryRoleLabel = mainApp.roleLabel || mainApp.roleKey;

                // Se ALMENO UNA delle app autorizzate richiede la password, mostriamo la sezione
                needsPassword = currentUser.authorizedApps.some(a => a.requiresPassword);
            }

            document.getElementById('profRole').textContent = primaryRoleLabel;

            // Nascondi il blocco password se non necessaria
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

    // 3. Recupero Password (Notifica al Captain)
    const recoverPwdForm = document.getElementById('recoverPwdForm');
    if (recoverPwdForm) {
        recoverPwdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const barcode = document.getElementById('recoverBarcode').value;

            try {
                const res = await fetch(`${API_URL}/users/recover`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ barcode })
                });

                if (res.ok) {
                    recoverPwdForm.reset();
                    showProfSuccess('Richiesta inviata in amministrazione. Recati in ufficio per ricevere la tua password temporanea.');
                } else {
                    const data = await res.json();
                    showProfError(data.message || 'Errore nella richiesta di recupero.');
                }
            } catch (err) {
                showProfError('Errore di rete di connessione al server.');
            }
        });
    }
});
