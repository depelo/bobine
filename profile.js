const API_URL = '/api';

// --- MODALITÀ SEAMLESS IFRAME ---
// Se la pagina è caricata dentro la Captain Console, adatta l'interfaccia per fondersi perfettamente.
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embedded') === 'true') {
        // Nascondi il pulsante Indietro (ci pensa la sidebar del Captain)
        const backBtn = document.getElementById('profBackBtn');
        if (backBtn) backBtn.style.display = 'none';

        // Adatta il contenitore per fonderlo nello stile della Captain Console (stile "Data Card")
        const container = document.getElementById('profMainContainer');
        if (container) {
            container.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)'; // Ombra delicata come le altre card
            container.style.margin = '0'; // Allineato a sinistra
            container.style.padding = '32px'; // Ripristina il respiro interno
            container.style.maxWidth = '100%'; // In embedded occupa tutta la larghezza utile
            container.style.width = '100%';
            container.style.border = '1px solid var(--border)'; // Bordo standard Captain
            container.style.borderRadius = 'var(--radius)';
        }
        
        // Rendi lo sfondo trasparente e pulisci il body per ereditare quello del Captain
        document.body.style.background = 'transparent';
        document.body.style.padding = '0';
        document.body.style.margin = '0';

    }
});
// --------------------------------

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

function setupPasswordForm(rules) {
    const changePwdForm = document.getElementById('changePwdForm');
    if (!changePwdForm) return;

    // Costruisci la checklist visiva iniziale
    const checklistEl = document.getElementById('profPwdChecklist');
    let rulesHtml = `<li id="prof-rule-len" style="margin-bottom: 6px; transition: color 0.3s;">❌ Almeno ${rules.minLength} caratteri</li>`;
    if (rules.requireNum) rulesHtml += `<li id="prof-rule-num" style="margin-bottom: 6px; transition: color 0.3s;">❌ Almeno un numero (0-9)</li>`;
    if (rules.requireUpp) rulesHtml += `<li id="prof-rule-upp" style="margin-bottom: 6px; transition: color 0.3s;">❌ Almeno una lettera maiuscola (A-Z)</li>`;
    if (rules.requireSpec) rulesHtml += `<li id="prof-rule-spec" style="margin-bottom: 6px; transition: color 0.3s;">❌ Almeno un carattere speciale (!@#...)</li>`;
    checklistEl.innerHTML = rulesHtml;

    const oldInput = document.getElementById('oldPwd');
    const pwdInput = document.getElementById('newPwd');
    const confirmInput = document.getElementById('confirmPwd');
    const submitBtn = document.getElementById('profSubmitPwdBtn');
    const errorDiv = document.getElementById('pwdMsg');

    // Funzione di validazione in tempo reale
    const validateRules = () => {
        const val = pwdInput.value;
        let isValid = true;

        const setRuleUI = (id, condition) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (condition) {
                el.innerHTML = el.innerHTML.replace('❌', '✅');
                el.style.color = 'var(--success)';
            } else {
                el.innerHTML = el.innerHTML.replace('✅', '❌');
                el.style.color = 'var(--text-muted)';
                isValid = false;
            }
        };

        setRuleUI('prof-rule-len', val.length >= rules.minLength);
        if (rules.requireNum) setRuleUI('prof-rule-num', /\d/.test(val));
        if (rules.requireUpp) setRuleUI('prof-rule-upp', /[A-Z]/.test(val));
        if (rules.requireSpec) setRuleUI('prof-rule-spec', /[!@#$%^&*(),.?":{}|<>]/.test(val));

        const match = val !== '' && val === confirmInput.value;
        
        // Abilita il bottone solo se tutte le regole sono rispettate, le password coincidono, e la vecchia password è inserita
        if (isValid && match && oldInput.value !== '') {
            submitBtn.disabled = false;
            submitBtn.style.background = 'var(--primary)';
            submitBtn.style.color = 'white';
            submitBtn.style.cursor = 'pointer';
            errorDiv.textContent = '';
        } else {
            submitBtn.disabled = true;
            submitBtn.style.background = 'var(--border)';
            submitBtn.style.color = 'var(--text-muted)';
            submitBtn.style.cursor = 'not-allowed';
            if (isValid && !match && confirmInput.value !== '') {
                errorDiv.textContent = 'Le nuove password non coincidono.';
            } else {
                errorDiv.textContent = '';
            }
        }
    };

    // Aggancia i listener di input
    oldInput.addEventListener('input', validateRules);
    pwdInput.addEventListener('input', validateRules);
    confirmInput.addEventListener('input', validateRules);

    // Gestione Invio
    changePwdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const oldPassword = oldInput.value;
        const newPassword = pwdInput.value;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvataggio...';

        try {
            const res = await fetch(`${API_URL}/users/me/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ oldPassword, newPassword })
            });

            if (res.ok) {
                changePwdForm.reset();
                validateRules(); // Ricalcola per spegnere il semaforo
                showProfSuccess('Password aggiornata con successo! La tua nuova chiave di sicurezza è ora attiva.');
            } else {
                const data = await res.json();
                showProfError(data.message || 'Errore durante l\'aggiornamento.');
            }
        } catch (err) {
            showProfError('Errore di rete di connessione al server.');
        } finally {
            submitBtn.textContent = 'Aggiorna Password';
            validateRules(); // Ripristina lo stato corretto del bottone
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    let currentUser = null;

    // Gestione tasto Indietro
    const goBackBtn = document.getElementById('profBackBtn');
    if (goBackBtn) {
        goBackBtn.addEventListener('click', () => {
            const ref = document.referrer || '';
            if (ref.includes('/gb2.html')) {
                window.location.href = '/gb2.html';
            } else if (ref.includes('/captain.html')) {
                window.location.href = '/captain.html';
            } else if (ref.includes('/ET.html')) {
                window.location.href = '/ET.html';
            } else if (currentUser && currentUser.defaultModuleId === 2) {
                window.location.href = '/captain.html';
            } else {
                window.location.href = '/bobine.html';
            }
        });
    }

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

            // Estrae le regole fresche dalla risposta
            const fetchedRules = currentUser.pwdRules || (currentUser.user && currentUser.user.pwdRules);
            if (fetchedRules) {
                localStorage.setItem('pwdRules', JSON.stringify(fetchedRules));
                setupPasswordForm(fetchedRules);
            } else {
                // Fallback di sicurezza
                const fallbackRules = JSON.parse(localStorage.getItem('pwdRules') || '{"minLength":6,"requireNum":true,"requireUpp":false,"requireSpec":false}');
                setupPasswordForm(fallbackRules);
            }

        } else {
            document.getElementById('profName').textContent = 'Utente non autenticato';
        }
    } catch (e) {
        console.error('Errore fetch profilo', e);
        showProfError('Impossibile caricare i dati del profilo.');
    }
});
