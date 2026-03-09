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
    if (loginMessageEl) loginMessageEl.textContent = 'Inserisci il barcode operatore.';
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

    // Cambio password forzato
    if (data.user && data.user.forcePwdChange) {
      document.getElementById('profileModal').classList.add('is-open');
      document.getElementById('profileCloseBtn').style.display = 'none';
      document.getElementById('profilePwdMsg').textContent = '⚠️ Cambio password obbligatorio.';
      return;
    }
    
    // Routing basato sui permessi
    if (data.user.defaultModuleId) {
      window.location.href = '/bobine.html';
    } else if (data.user.isSuperuser) {
      window.location.href = '/captain.html';
    } else {
      alert('Nessuna app predefinita. Contatta il Captain.');
    }
  } catch (err) {
    console.error(err);
    if (loginMessageEl) {
      loginMessageEl.textContent = 'Errore di rete durante il login.';
    }
  }
}

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

