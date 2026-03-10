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
      // --- CONTROLLO ACCESSO AI MODULI (RBAC) ---
      const user = data.user || data;
      const currentPath = window.location.pathname.toLowerCase();

      // Escludiamo il root e il gateway dal controllo
      if (currentPath !== '/' && currentPath !== '/index.html') {
        if (user && !user.isSuperuser) {
          // Se tenta di accedere alla captain console
          if (currentPath.includes('captain')) {
            alert('Accesso negato alla Captain Console.');
            window.location.href = '/';
            return false;
          }

          // Se tenta di accedere a bobine
          if (currentPath.includes('bobine')) {
            // Cerca se ha l'autorizzazione per la TargetTable 'Operators'
            const hasBobineAccess =
              Array.isArray(user.authorizedApps) &&
              user.authorizedApps.some((app) => app.target === 'Operators');
            if (!hasBobineAccess) {
              alert('Non sei autorizzato ad accedere al modulo Bobine.');
              window.location.href = '/';
              return false;
            }
          }
        }
      }

      // --- REAL-TIME SECURITY (WEBSOCKETS) ---
      if (typeof io !== 'undefined') {
          const socket = io();
          const userId = user.globalId || user.IDUser || user.id || user.IDOperator;
          
          if (userId) {
              socket.emit('register', userId);
              
             socket.on('force_logout', async (payload) => {
                 try {
                     await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                 } catch (e) { console.error('Errore durante il logout forzato', e); }
                 
                 // Iniezione dinamica del modale di espulsione
                 const curtain = document.createElement('div');
                 curtain.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:white; font-family:sans-serif;';
                 curtain.innerHTML = `
                     <div style="background:var(--bg-content, #fff); padding:30px; border-radius:8px; width:90%; max-width:400px; text-align:center;">
                         <h2 style="color:var(--danger, #dc3545); margin-top:0;">⚡ Espulsione Forzata</h2>
                         <p style="color:var(--text, #333); font-size:1.1rem; margin-bottom:24px;">${payload.message || 'Sessione interrotta forzatamente.'}</p>
                         <button id="kickOkBtn" style="width:100%; padding:12px; background:var(--primary, #2563a8); color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer; font-size:1rem;">Ho capito</button>
                     </div>
                 `;
                 document.body.appendChild(curtain);
                 document.getElementById('kickOkBtn').addEventListener('click', () => {
                     window.location.href = '/';
                 });
             });

             socket.on('show_pwd_curtain', (payload) => {
                 showPasswordCurtain(payload.message);
             });
          }
      } else {
          console.warn("Socket.io non rilevato. Sicurezza real-time disabilitata.");
      }

      window.SecurityData = { user: user };
      document.dispatchEvent(new Event('securityReady')); // Avvisa il Layer 2
      return true;
    }
  } catch (err) {
    console.error('Errore di sicurezza:', err);
    window.location.href = '/';
  }
}

function showPasswordCurtain(customMessage) {
  if (document.getElementById('securityCurtain')) return;
  
  const curtain = document.createElement('div');
  curtain.id = 'securityCurtain';
  curtain.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:white; font-family:sans-serif;';
  
  const displayMessage = customMessage || 'I tuoi dati attuali sono salvi, ma devi cambiare la password per continuare.';

  curtain.innerHTML = `
        <div style="background:#222; padding:30px; border-radius:8px; width:90%; max-width:400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <h2 style="color: #ffc107; margin-top:0;">⚠️ Sicurezza: Azione Richiesta</h2>
            <p style="font-size:0.95rem; color:#ccc; margin-bottom:20px; line-height: 1.4;">${displayMessage}</p>
            <input type="password" id="curtainOldPwd" placeholder="Password Attuale" style="width:100%; margin-bottom:10px; padding:10px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;" />
            <input type="password" id="curtainNewPwd" placeholder="Nuova Password" style="width:100%; margin-bottom:10px; padding:10px; border-radius: 4px; border: 1px solid #444; background: #333; color: white;" />
            <button id="curtainSaveBtn" style="width:100%; padding:12px; background:#2563a8; color:white; border:none; border-radius:4px; cursor:pointer; font-weight: bold; margin-top: 10px;">Aggiorna e Riprendi il Lavoro</button>
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
      const data = await res.json();
      
      // Allinea lo stato globale di sicurezza
      if (window.SecurityData && window.SecurityData.user) {
          window.SecurityData.user.forcePwdChange = false;
      }
      
      // Avvisa l'app di Layer 2 (es. bobine.js) di allineare i suoi stati interni
      document.dispatchEvent(new CustomEvent('securityCurtainResolved', { detail: data.user }));

      // Rimuove il sipario senza ricaricare la pagina
      document.body.removeChild(curtain);
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
      window.SecurityData = null;
      window.location.href = '/';
    });
  }
});

// Avvia il controllo immediatamente
initSecurity();

