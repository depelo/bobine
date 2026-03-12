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

      // Allinea lo stato globale di sicurezza
      window.SecurityData = { user: user };

      // Registra il socket per lo stato "Online"
      if (typeof io !== 'undefined' && window.SecurityData && window.SecurityData.user) {
          if (!window.appSocket) window.appSocket = io();
          window.appSocket.emit('register', { userId: window.SecurityData.user.globalId });
      }

      // --- REAL-TIME SECURITY (WEBSOCKETS) ---
      if (typeof io !== 'undefined') {
          const socket = window.appSocket || io();
          if (!window.appSocket) window.appSocket = socket;
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
  const rules = JSON.parse(localStorage.getItem('pwdRules') || '{"minLength":6,"requireNum":true,"requireUpp":false,"requireSpec":false}');

  // Genera la checklist in base alle regole attive
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
            <button id="curtainSaveBtn" disabled style="width:100%; padding:12px; background:#444; color:#888; border:none; border-radius:4px; cursor:not-allowed; font-weight: bold; margin-top: 4px;">Aggiorna e Riprendi il Lavoro</button>
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
      submitBtn.disabled = false;
      submitBtn.textContent = 'Aggiorna e Riprendi il Lavoro';
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

