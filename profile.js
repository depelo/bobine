const API_URL = '/api';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Caricamento dati utente
    try {
        const res = await fetch(`${API_URL}/me`, { credentials: 'include' });
        if (res.ok) {
            const user = await res.json();
            document.getElementById('profName').textContent = user.name || '-';
            document.getElementById('profRole').textContent = user.isSuperuser ? 'Superuser' : (user.isAdmin ? 'Admin' : 'Operatore');
        } else {
            document.getElementById('profName').textContent = 'Utente non autenticato';
        }
    } catch (e) {
        console.error('Errore fetch profilo', e);
    }

    // 2. Cambio Password
    document.getElementById('changePwdForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldPassword = document.getElementById('oldPwd').value;
        const newPassword = document.getElementById('newPwd').value;
        const msgEl = document.getElementById('pwdMsg');

        try {
            const res = await fetch(`${API_URL}/users/me/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ oldPassword, newPassword })
            });

            if (res.ok) {
                msgEl.style.color = 'var(--success)';
                msgEl.textContent = 'Password aggiornata con successo.';
                document.getElementById('changePwdForm').reset();
            } else {
                const data = await res.json();
                msgEl.style.color = 'var(--danger)';
                msgEl.textContent = data.message || 'Errore durante l\'aggiornamento.';
            }
        } catch (err) {
            msgEl.textContent = 'Errore di rete.';
        }
    });

    // 3. Recupero Password
    document.getElementById('recoverPwdForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const barcode = document.getElementById('recoverBarcode').value;
        const msgEl = document.getElementById('recoverMsg');

        try {
            const res = await fetch(`${API_URL}/users/recover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barcode })
            });

            if (res.ok) {
                msgEl.style.color = 'var(--success)';
                msgEl.textContent = 'Richiesta inviata in amministrazione. Recati in ufficio per ricevere la tua password temporanea.';
                document.getElementById('recoverPwdForm').reset();
            } else {
                const data = await res.json();
                msgEl.style.color = 'var(--danger)';
                msgEl.textContent = data.message || 'Errore nella richiesta di recupero.';
            }
        } catch (err) {
            msgEl.textContent = 'Errore di rete.';
        }
    });
});
