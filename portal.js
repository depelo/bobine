const API_URL = '/api';

const loginBarcodeInput = document.getElementById('loginBarcode');
const loginPasswordField = document.getElementById('loginPasswordField');
const loginPasswordInput = document.getElementById('loginPassword');
const loginMessageEl = document.getElementById('loginMessage');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const forgotPwdLink = document.getElementById('forgotPwdLink');

let currentUser = null;

// --- ROUTER DINAMICO POST-LOGIN ---
function routeUserAfterLogin(user) {
    if (user.defaultModuleId === 2) {
        window.location.href = '/captain.html';
        return;
    }
    if (user.defaultModuleId === 1) {
        window.location.href = '/bobine.html';
        return;
    }
    
    // Fallback se il modulo non è 1 o 2
    if (user.isSuperuser) {
        window.location.href = '/captain.html';
    } else {
        window.location.href = '/bobine.html';
    }
}

// La gestione del profilo è demandata alla pagina standalone profile.html; il gateway non mostra più il vecchio modale inline.

async function performLogin() {
  const barcode = loginBarcodeInput ? loginBarcodeInput.value.trim() : '';
  const password = loginPasswordInput ? loginPasswordInput.value : '';
  if (!barcode) {
    if (loginMessageEl) loginMessageEl.textContent = 'Inserisci il QR Code operatore.';
    return;
  }
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ barcode, password: password || undefined })
    });
    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data.requiresPassword) {
        if (loginPasswordField) {
          loginPasswordField.classList.remove('is-hidden');
        }
        if (loginMessageEl) {
          loginMessageEl.style.color = 'var(--danger)';
          loginMessageEl.textContent = data.message || 'Password richiesta per questo utente.';
        }
        if (loginPasswordInput) {
          loginPasswordInput.focus();
        }
        return;
      }
      if (loginMessageEl) {
        loginMessageEl.style.color = 'var(--danger)';
        loginMessageEl.textContent = data.message || 'Credenziali non valide.';
      }
      return;
    }
    if (!res.ok) {
      const text = await res.text();
      if (loginMessageEl) {
        loginMessageEl.style.color = 'var(--danger)';
        loginMessageEl.textContent = text || `Errore HTTP ${res.status}`;
      }
      return;
    }
    const data = await res.json();

    if (data.pwdRules) {
      try {
        localStorage.setItem('pwdRules', JSON.stringify(data.pwdRules));
      } catch (e) {
        console.warn('Impossibile salvare pwdRules in localStorage:', e);
      }
    }

    currentUser = data.user || null;

    // Cambio password forzato: invochiamo il Sipario Universale invece del modale profilo
    if (data.user && data.user.forcePwdChange) {
      showGatewayPasswordCurtain(data.user, '⚠️ Cambio password obbligatorio. Inserisci la nuova password per accedere al sistema.');
      return;
    }
    
    // Routing dinamico basato sul modulo di default
    routeUserAfterLogin(data.user);
  } catch (err) {
    console.error(err);
    if (loginMessageEl) {
      loginMessageEl.style.color = 'var(--danger)';
      loginMessageEl.textContent = 'Errore di rete durante il login.';
    }
  }
}

// --- MOTORE SCANNER QR CODE (Indipendente per il Gateway) ---
let barcodeScannerInstance = null;
let isScannerRunning = false;

function playBarcodeBeep() {
  const audio = document.getElementById('barcodeBeepSound');
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch((error) => console.warn("Impossibile riprodurre il beep:", error));
}

function closeBarcodeScanner() {
  const modal = document.getElementById('scannerModal');
  if (modal) {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (barcodeScannerInstance) {
    if (isScannerRunning) {
      try { barcodeScannerInstance.stop().catch(() => {}); } catch (e) {}
    }
    barcodeScannerInstance = null;
    isScannerRunning = false;
  }
  const container = document.getElementById('scannerContainer');
  if (container) container.innerHTML = '';
}

function openBarcodeScanner() {
  const modal = document.getElementById('scannerModal');
  const container = document.getElementById('scannerContainer');
  if (!modal || !container) return;

  if (typeof Html5Qrcode === 'undefined') {
    alert('Libreria scanner non disponibile. Controlla la connessione.');
    return;
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  container.innerHTML = '';

  const onSuccess = (decodedText) => {
    playBarcodeBeep();
    const field = document.getElementById('loginBarcode');
    if (field) {
      field.value = decodedText;
      // Avvia il login automaticamente dopo la scansione
      void performLogin();
    }
    closeBarcodeScanner();
  };

  barcodeScannerInstance = new Html5Qrcode('scannerContainer');
  
  // Ottimizzazione mirata solo per QR Code
  const config = { 
      fps: 10, 
      qrbox: { width: 250, height: 250 },
      formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]
  };

  barcodeScannerInstance
    .start({ facingMode: 'environment' }, config, onSuccess)
    .then(() => { isScannerRunning = true; })
    .catch((err) => {
      isScannerRunning = false;
      closeBarcodeScanner();
      alert('Impossibile accedere alla fotocamera. Verifica i permessi.');
    });
}

// Intercetta il click sul pulsante della fotocamera nel login
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="login-scan-operator"]');
  if (btn) {
    openBarcodeScanner();
  }
});

// Chiusura del modale scanner
document.addEventListener('click', (e) => {
  if (e.target.id === 'scannerCancel' || e.target.closest('#scannerCancel') || e.target.id === 'scannerModal') {
    e.preventDefault();
    e.stopPropagation();
    closeBarcodeScanner();
  }
});

if (loginSubmitBtn) {
  loginSubmitBtn.addEventListener('click', () => {
    void performLogin();
  });
}

if (loginBarcodeInput) {
  loginBarcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void performLogin();
    }
  });
}

if (loginPasswordInput) {
  loginPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void performLogin();
    }
  });
}

if (forgotPwdLink) {
  forgotPwdLink.addEventListener('click', (e) => {
    e.preventDefault();
    const barcode = loginBarcodeInput ? loginBarcodeInput.value.trim() : '';

    if (!barcode) {
      if (loginMessageEl) {
        loginMessageEl.style.color = 'var(--danger)';
        loginMessageEl.textContent = 'Inserisci prima il tuo QR Code Operatore per richiedere il reset.';
      }
      return;
    }

    const confirmCurtain = document.createElement('div');
    confirmCurtain.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:white; font-family:sans-serif; text-align:center; padding: 20px;';
    
    confirmCurtain.innerHTML = `
        <div style="background:#222; padding:30px; border-radius:8px; max-width:400px; border: 2px solid #e11d48; box-shadow: 0 10px 30px rgba(225, 29, 72, 0.3);">
            <h2 style="color: #e11d48; margin-top:0; font-size: 1.8rem;">⚠️ ATTENZIONE ⚠️</h2>
            <p style="font-size:1.1rem; color:#ccc; margin-bottom:24px; line-height: 1.5;">
                Stai per invalidare la tua password attuale.<br><br>
                Se procedi, verrà inviato un allarme al Captain e <b>DOVRAI RECARTI FISICAMENTE IN UFFICIO</b> per farti sbloccare il profilo e ricevere un PIN temporaneo.
            </p>
            <div style="display: flex; gap: 12px;">
                <button id="cancelResetBtn" style="flex:1; padding:12px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight: bold;">ANNULLA</button>
                <button id="confirmResetBtn" style="flex:1; padding:12px; background:#e11d48; color:white; border:none; border-radius:4px; cursor:pointer; font-weight: bold;">PROCEDI</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmCurtain);

    document.getElementById('cancelResetBtn').addEventListener('click', () => {
        document.body.removeChild(confirmCurtain);
    });

    document.getElementById('confirmResetBtn').addEventListener('click', async () => {
        try {
          const res = await fetch('/api/users/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
          });

          if (res.ok) {
            // Trasforma il sipario in una schermata di attesa e inserimento PIN
            confirmCurtain.innerHTML = `
                <div style="background:#222; padding:30px; border-radius:8px; max-width:400px; border: 2px solid #2563a8; box-shadow: 0 10px 30px rgba(37, 99, 168, 0.3); width: 90%;">
                    <h2 style="color: #2563a8; margin-top:0; font-size: 1.5rem;">🔐 Attesa PIN Temporaneo</h2>
                    <p style="font-size:1.05rem; color:#ccc; margin-bottom:24px; line-height: 1.4;">
                        La richiesta è stata inviata al Captain.<br><br>
                        Quando l'ufficio ti comunica il PIN temporaneo, inseriscilo qui sotto per sbloccare il tuo profilo e scegliere la tua nuova password.
                    </p>
                    <input type="password" id="tempPinInput" placeholder="Inserisci PIN Temporaneo" style="width:100%; margin-bottom:20px; padding:15px; border-radius: 4px; border: 1px solid #444; background: #333; color: white; font-size: 1.2rem; text-align: center; letter-spacing: 2px;" autocomplete="off" />
                    <div style="display: flex; gap: 12px;">
                        <button id="cancelPinBtn" style="flex:1; padding:12px; background:#444; color:white; border:none; border-radius:4px; cursor:pointer; font-weight: bold;">ESCI</button>
                        <button id="submitPinBtn" style="flex:1; padding:12px; background:#2563a8; color:white; border:none; border-radius:4px; cursor:pointer; font-weight: bold;">ACCEDI</button>
                    </div>
                </div>
            `;
            
            // Focus automatico sull'input del PIN
            setTimeout(() => {
                const pinInput = document.getElementById('tempPinInput');
                if (pinInput) pinInput.focus();
            }, 100);

            // Tasto Esci: chiude il sipario e annulla
            document.getElementById('cancelPinBtn').addEventListener('click', () => {
                document.body.removeChild(confirmCurtain);
            });

            // Tasto Accedi: inietta il PIN nel form originale e lancia performLogin()
            document.getElementById('submitPinBtn').addEventListener('click', () => {
                const pin = document.getElementById('tempPinInput').value;
                if (!pin) return;
                
                if (loginPasswordInput) {
                    loginPasswordInput.value = pin;
                }
                document.body.removeChild(confirmCurtain);
                // Avvia il login normale. Dato che ForcePwdChange = 1, il sistema mostrerà poi il sipario del cambio password definitivo.
                performLogin();
            });

          } else {
            const data = await res.json();
            if (loginMessageEl) {
              loginMessageEl.style.color = 'var(--danger)';
              loginMessageEl.textContent = data.message || 'Errore nella richiesta di recupero.';
            }
          }
        } catch (err) {
          if (loginMessageEl) {
            loginMessageEl.style.color = 'var(--danger)';
            loginMessageEl.textContent = 'Errore di rete durante la richiesta di recupero.';
          }
        }
    });
  });
}

// Event listener del vecchio modale profilo rimossi

// --- SIPARIO DI SICUREZZA PER IL GATEWAY ---
function showGatewayPasswordCurtain(user, customMessage) {
  if (document.getElementById('securityCurtain')) return;
  
  const curtain = document.createElement('div');
  curtain.id = 'securityCurtain';
  curtain.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:white; font-family:sans-serif;';
  
  const displayMessage = customMessage || 'Devi cambiare la password per continuare.';
  const rules = JSON.parse(localStorage.getItem('pwdRules') || '{"minLength":6,"requireNum":true,"requireUpp":false,"requireSpec":false}');

  let rulesHtml = `<ul style="list-style: none; padding: 0; margin: 0 0 20px 0; text-align: left; font-size: 0.95rem; color: #ccc;" id="pwdChecklist">`;
  rulesHtml += `<li id="rule-len" style="margin-bottom: 6px;">❌ Almeno ${rules.minLength} caratteri</li>`;
  if (rules.requireNum) rulesHtml += `<li id="rule-num" style="margin-bottom: 6px;">❌ Almeno un numero (0-9)</li>`;
  if (rules.requireUpp) rulesHtml += `<li id="rule-upp" style="margin-bottom: 6px;">❌ Almeno una lettera maiuscola (A-Z)</li>`;
  if (rules.requireSpec) rulesHtml += `<li id="rule-spec" style="margin-bottom: 6px;">❌ Almeno un carattere speciale (!@#...)</li>`;
  rulesHtml += `</ul>`;

  curtain.innerHTML = `
        <div style="background:#222; padding:30px; border-radius:8px; width:90%; max-width:400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h2 style="color: #ffc107; margin-top:0;">⚠️ Sicurezza: Azione Richiesta</h2>
            <p style="font-size:0.95rem; color:#ccc; margin-bottom:20px; line-height: 1.4;">${displayMessage}</p>
            <input type="password" id="curtainOldPwd" placeholder="Password Attuale" style="width:100%; margin-bottom:10px; padding:10px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;" />
            <input type="password" id="curtainNewPwd" placeholder="Nuova Password" style="width:100%; margin-bottom:10px; padding:10px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;" />
            <input type="password" id="curtainConfirmPwd" placeholder="Conferma Nuova Password" style="width:100%; margin-bottom:16px; padding:10px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;" />
            ${rulesHtml}
            <p id="curtainMsg" style="color:#ff4444; margin-top:0; margin-bottom:12px; font-size:0.9rem; text-align: left; min-height: 1.2em;"></p>
            <button id="curtainSaveBtn" disabled style="width:100%; padding:12px; background:#444; color:#888; border:none; border-radius:4px; cursor:not-allowed; font-weight: bold; margin-top: 4px;">Aggiorna e Accedi</button>
        </div>
    `;
  
  document.body.appendChild(curtain);
  
  const oldInput = document.getElementById('curtainOldPwd');
  const pwdInput = document.getElementById('curtainNewPwd');
  const confirmInput = document.getElementById('curtainConfirmPwd');
  const submitBtn = document.getElementById('curtainSaveBtn');
  const msg = document.getElementById('curtainMsg');

  const setRuleUI = (id, condition) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (condition) {
      el.innerHTML = el.innerHTML.replace('❌', '✅');
      el.style.color = '#4ade80';
    } else {
      el.innerHTML = el.innerHTML.replace('✅', '❌');
      el.style.color = '#ccc';
    }
  };

  const validateRules = () => {
    const val = pwdInput.value || '';
    let isValid = true;

    setRuleUI('rule-len', val.length >= rules.minLength);
    if (val.length < rules.minLength) isValid = false;
    if (rules.requireNum) {
      const ok = /\d/.test(val);
      setRuleUI('rule-num', ok);
      if (!ok) isValid = false;
    }
    if (rules.requireUpp) {
      const ok = /[A-Z]/.test(val);
      setRuleUI('rule-upp', ok);
      if (!ok) isValid = false;
    }
    if (rules.requireSpec) {
      const ok = /[!@#$%^&*(),.?":{}|<>]/.test(val);
      setRuleUI('rule-spec', ok);
      if (!ok) isValid = false;
    }

    const match = val !== '' && val === (confirmInput.value || '');
    const hasOld = (oldInput.value || '') !== '';

    if (isValid && match && hasOld) {
      submitBtn.disabled = false;
      submitBtn.style.background = '#2563a8';
      submitBtn.style.color = 'white';
      submitBtn.style.cursor = 'pointer';
      msg.textContent = '';
    } else {
      submitBtn.disabled = true;
      submitBtn.style.background = '#444';
      submitBtn.style.color = '#888';
      submitBtn.style.cursor = 'not-allowed';
      if (isValid && !match && confirmInput.value !== '') {
        msg.textContent = 'Le password non coincidono.';
      } else {
        msg.textContent = '';
      }
    }
  };

  oldInput.addEventListener('input', validateRules);
  pwdInput.addEventListener('input', validateRules);
  confirmInput.addEventListener('input', validateRules);

  submitBtn.addEventListener('click', async () => {
    const oldP = oldInput.value;
    const newP = pwdInput.value;
    
    if (!oldP || !newP) { msg.textContent = 'Compila tutti i campi'; return; }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvataggio...';

    const res = await fetch('/api/users/me/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldP, newPassword: newP })
    });
    
    if (res.ok) {
      document.body.removeChild(curtain);
      
      // Routing dinamico post-aggiornamento password
      routeUserAfterLogin(user);
    } else {
      const errData = await res.clone().json().catch(() => ({}));
      msg.textContent = errData.message || 'Errore durante l\'aggiornamento.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Aggiorna e Accedi';
    }
  });
}

