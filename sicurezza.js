window.SecurityData = null;

async function initSecurity() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/'; // Kick to Layer 1
      return false;
    }
    
    const data = await res.json();
    
    if (res.status === 403 && data.requiresPasswordChange) {
      showPasswordCurtain();
      return false; // Ferma l'inizializzazione dell'app
    }
    
    if (res.ok) {
      window.SecurityData = data;
      document.dispatchEvent(new Event('securityReady')); // Avvisa il Layer 2
      return true;
    }
  } catch (err) {
    console.error('Errore di sicurezza:', err);
    window.location.href = '/';
  }
}

function showPasswordCurtain() {
  if (document.getElementById('securityCurtain')) return;
  
  const curtain = document.createElement('div');
  curtain.id = 'securityCurtain';
  curtain.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:white; font-family:sans-serif;';
  
  curtain.innerHTML = `
        <div style="background:#222; padding:30px; border-radius:8px; width:90%; max-width:400px;">
            <h2>⚠️ Sicurezza: Password Scaduta</h2>
            <p style="font-size:0.9rem; color:#aaa; margin-bottom:20px;">I tuoi dati attuali sono salvi, ma devi cambiare la password per continuare.</p>
            <input type="password" id="curtainOldPwd" placeholder="Vecchia Password" style="width:100%; margin-bottom:10px; padding:10px;" />
            <input type="password" id="curtainNewPwd" placeholder="Nuova Password" style="width:100%; margin-bottom:10px; padding:10px;" />
            <button id="curtainSaveBtn" style="width:100%; padding:10px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">Aggiorna Password</button>
            <p id="curtainMsg" style="color:#ff4444; margin-top:10px; font-size:0.9rem;"></p>
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
      window.location.reload(); // Ricarica pulita per rinfrescare i permessi
    } else {
      const errData = await res.clone().json().catch(() => ({}));
      msg.textContent = errData.message || 'Errore durante l\'aggiornamento.';
    }
  });
}

// Listener globale per il logout dai Layer 2
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/logout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (err) {
        console.error('Errore durante il logout:', err);
      }
      window.location.href = '/';
    });
  }
});

// Avvia il controllo immediatamente
initSecurity();

