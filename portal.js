const API_URL = '/api';

const loginBarcodeInput = document.getElementById('loginBarcode');
const loginPasswordField = document.getElementById('loginPasswordField');
const loginPasswordInput = document.getElementById('loginPassword');
const loginMessageEl = document.getElementById('loginMessage');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');

const profileModal = document.getElementById('profileModal');
const profileNameDisplay = document.getElementById('profileNameDisplay');
const profileRoleDisplay = document.getElementById('profileRoleDisplay');
const profileTimeDisplay = document.getElementById('profileTimeDisplay');
const profilePwdSection = document.getElementById('profilePwdSection');
const profileOldPwdInput = document.getElementById('profileOldPwd');
const profileNewPwdInput = document.getElementById('profileNewPwd');
const profilePwdMsg = document.getElementById('profilePwdMsg');
const profileSavePwdBtn = document.getElementById('profileSavePwdBtn');
const profileCloseBtn = document.getElementById('profileCloseBtn');

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

function openProfileModal(isForced = false) {
  if (!currentUser) {
    alert('Effettua il login per visualizzare il profilo.');
    return;
  }
  if (!profileModal) return;

  const name = currentUser.name || '-';
  const roleLabel = currentUser.isSuperuser
    ? 'Superuser'
    : currentUser.isAdmin
      ? 'Admin'
      : 'Operatore';
  const startTime = currentUser.startTime || '-';

  if (profileNameDisplay) profileNameDisplay.textContent = name;
  if (profileRoleDisplay) profileRoleDisplay.textContent = roleLabel;
  if (profileTimeDisplay) profileTimeDisplay.textContent = startTime;

  const isForcedMode = !!isForced || currentUser.forcePwdChange === true;

  const isAdmin = currentUser.isAdmin === true || currentUser.isAdmin === 1;
  if (profilePwdSection) {
    profilePwdSection.style.display = isAdmin ? '' : 'none';
  }
  if (profileOldPwdInput) profileOldPwdInput.value = '';
  if (profileNewPwdInput) profileNewPwdInput.value = '';
  if (profilePwdMsg) {
    profilePwdMsg.textContent = isForcedMode
      ? '⚠️ Password scaduta o reset forzato dall\'amministratore. Inserisci una nuova password per continuare.'
      : '';
  }

  if (profileCloseBtn) {
    if (isForcedMode) {
      profileCloseBtn.style.display = 'none';
      profileCloseBtn.disabled = true;
    } else {
      profileCloseBtn.style.display = '';
      profileCloseBtn.disabled = false;
    }
  }

  profileModal.classList.add('is-open');
  profileModal.setAttribute('aria-hidden', 'false');
}

function closeProfileModal() {
  if (!profileModal) return;
  profileModal.classList.remove('is-open');
  profileModal.setAttribute('aria-hidden', 'true');
}

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
          loginMessageEl.textContent = data.message || 'Password richiesta per questo utente.';
        }
        if (loginPasswordInput) {
          loginPasswordInput.focus();
        }
        return;
      }
      if (loginMessageEl) {
        loginMessageEl.textContent = data.message || 'Credenziali non valide.';
      }
      return;
    }
    if (!res.ok) {
      const text = await res.text();
      if (loginMessageEl) {
        loginMessageEl.textContent = text || `Errore HTTP ${res.status}`;
      }
      return;
    }
    const data = await res.json();

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

if (profileCloseBtn) {
  profileCloseBtn.addEventListener('click', () => {
    document.activeElement?.blur();
    if (currentUser?.forcePwdChange) return;
    closeProfileModal();
  });
}

if (profileModal && profileModal.addEventListener) {
  profileModal.addEventListener('click', (e) => {
    if (e.target.id === 'profileModal') {
      if (currentUser?.forcePwdChange) return;
      closeProfileModal();
    }
  });
}

if (profileSavePwdBtn) {
  profileSavePwdBtn.addEventListener('click', async () => {
    if (!currentUser) {
      alert('Sessione scaduta. Effettua nuovamente il login.');
      closeProfileModal();
      return;
    }
    if (!profileOldPwdInput || !profileNewPwdInput) return;
    const oldPassword = profileOldPwdInput.value;
    const newPassword = profileNewPwdInput.value;

    if (!newPassword) {
      if (profilePwdMsg) profilePwdMsg.textContent = 'Inserisci la nuova password.';
      return;
    }

    if (profilePwdMsg) profilePwdMsg.textContent = '';

    try {
      const res = await fetch(`${API_URL}/users/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword })
      });

      if (!res.ok) {
        let message = 'Errore durante l\'aggiornamento della password.';
        try {
          const data = await res.clone().json();
          if (data && data.message) message = data.message;
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        if (profilePwdMsg) profilePwdMsg.textContent = message;
        return;
      }

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (data && data.user) {
        currentUser = data.user;
      }
      if (currentUser) {
        currentUser.forcePwdChange = false;
      }

      if (profileOldPwdInput) profileOldPwdInput.value = '';
      if (profileNewPwdInput) profileNewPwdInput.value = '';
      if (profilePwdMsg) profilePwdMsg.textContent = '';

      closeProfileModal();
      alert('Password aggiornata con successo. Effettua nuovamente il login se necessario.');
    } catch (err) {
      console.error(err);
      if (profilePwdMsg) profilePwdMsg.textContent = 'Errore di rete durante l\'aggiornamento della password.';
    }
  });
}

// --- SIPARIO DI SICUREZZA PER IL GATEWAY ---
function showGatewayPasswordCurtain(user, customMessage) {
  if (document.getElementById('securityCurtain')) return;
  
  const curtain = document.createElement('div');
  curtain.id = 'securityCurtain';
  curtain.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:white; font-family:sans-serif;';
  
  const displayMessage = customMessage || 'Devi cambiare la password per continuare.';

  curtain.innerHTML = `
        <div style="background:#222; padding:30px; border-radius:8px; width:90%; max-width:400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h2 style="color: #ffc107; margin-top:0;">⚠️ Sicurezza: Azione Richiesta</h2>
            <p style="font-size:0.95rem; color:#ccc; margin-bottom:20px; line-height: 1.4;">${displayMessage}</p>
            <input type="password" id="curtainOldPwd" placeholder="Password Attuale" style="width:100%; margin-bottom:10px; padding:10px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;" />
            <input type="password" id="curtainNewPwd" placeholder="Nuova Password" style="width:100%; margin-bottom:10px; padding:10px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;" />
            <button id="curtainSaveBtn" style="width:100%; padding:12px; background:#2563a8; color:white; border:none; border-radius:4px; cursor:pointer; font-weight: bold; margin-top: 10px;">Aggiorna e Accedi</button>
            <p id="curtainMsg" style="color:#ff4444; margin-top:12px; font-size:0.9rem; text-align: center; min-height: 1.2em;"></p>
        </div>
    `;
  
  document.body.appendChild(curtain);
  
  document.getElementById('curtainSaveBtn').addEventListener('click', async () => {
    const oldP = document.getElementById('curtainOldPwd').value;
    const newP = document.getElementById('curtainNewPwd').value;
    const msg = document.getElementById('curtainMsg');
    
    if (!oldP || !newP) { msg.textContent = 'Compila tutti i campi'; return; }
    
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
    }
  });
}

