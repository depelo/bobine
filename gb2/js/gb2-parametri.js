/**
 * MRP Parametri — Maschera selezione articolo (frmParRMP)
 *
 * Le 3 combo (codart, codalt, descr) si auto-compilano a vicenda:
 * - Selezioni da codart → popola codalt e descr
 * - Selezioni da codalt → popola codart e descr
 * - Selezioni da descr → popola codart e codalt
 * Dopo selezione articolo, carica le fasi nel dropdown Fase.
 * Il bottone Esegui lancia la vista progressivi.
 */
const MrpParametri = (() => {
    let debounceTimer = null;

    function init() {
        setupCombo('paramCodart', 'paramCodartDropdown', 'codart');
        setupCombo('paramCodalt', 'paramCodaltDropdown', 'codalt');
        setupCombo('paramDescr', 'paramDescrDropdown', 'descr');

        document.getElementById('btnEsegui').addEventListener('click', esegui);

        // Chiudi dropdown quando si clicca fuori
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.mrp-field-input')) {
                document.querySelectorAll('.mrp-dropdown').forEach(d => d.classList.remove('open'));
            }
        });
    }

    function setupCombo(inputId, dropdownId, field) {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(dropdownId);

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const q = input.value.trim();
                if (q.length < 2) { dropdown.classList.remove('open'); return; }
                searchArticoli(q, field, dropdown);
            }, 250);
        });

        input.addEventListener('focus', () => {
            const q = input.value.trim();
            if (q.length >= 2) {
                searchArticoli(q, field, dropdown);
            }
        });
    }

    async function searchArticoli(q, field, dropdown) {
        try {
            const res = await fetch(`${MrpApp.API_BASE}/articoli/search?q=${encodeURIComponent(q)}&field=${field}`, { credentials: 'include' });
            const data = await res.json();

            dropdown.innerHTML = '';
            if (data.length === 0) {
                dropdown.innerHTML = '<div class="mrp-dropdown-item" style="color:var(--text-muted)">Nessun risultato</div>';
                dropdown.classList.add('open');
                return;
            }

            data.forEach(art => {
                const item = document.createElement('div');
                item.className = 'mrp-dropdown-item';
                item.innerHTML = `
                    <span class="dd-code">${art.ar_codart}</span>
                    <span class="dd-descr">${art.ar_descr || ''}</span>
                    <span class="dd-alt">${art.ar_codalt || ''}</span>
                `;
                item.addEventListener('click', () => selezionaArticolo(art, dropdown));
                dropdown.appendChild(item);
            });

            dropdown.classList.add('open');
        } catch (err) {
            console.error('[Parametri] Errore ricerca:', err);
        }
    }

    async function selezionaArticolo(art, dropdown) {
        // Popola tutte e 3 le combo
        document.getElementById('paramCodart').value = art.ar_codart;
        document.getElementById('paramCodalt').value = art.ar_codalt || '';
        document.getElementById('paramDescr').value = art.ar_descr || '';

        // Chiudi tutti i dropdown
        document.querySelectorAll('.mrp-dropdown').forEach(d => d.classList.remove('open'));

        // Salva nello stato
        MrpApp.state.articoloSelezionato = art;
        MrpApp.state.parametri.codart = art.ar_codart;

        // Carica le fasi
        await caricaFasi(art.ar_codart);

        // Status
        setStatus(`Articolo selezionato: ${art.ar_codart} — ${art.ar_descr}`);
    }

    async function caricaFasi(codart) {
        const select = document.getElementById('paramFase');
        select.innerHTML = '<option value="">Tutte</option>';

        try {
            const res = await fetch(`${MrpApp.API_BASE}/articoli/${encodeURIComponent(codart)}/fasi`, { credentials: 'include' });
            const fasi = await res.json();

            fasi.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.af_fase;
                opt.textContent = `${f.af_fase} — ${f.af_descr || ''}`;
                select.appendChild(opt);
            });
        } catch (err) {
            console.error('[Parametri] Errore caricamento fasi:', err);
        }
    }

    async function esegui() {
        const codart = MrpApp.state.parametri.codart;
        if (!codart) {
            setStatus('Seleziona prima un articolo', true);
            return;
        }

        const magaz = document.getElementById('paramMagaz').value.trim();
        const fase = document.getElementById('paramFase').value;
        const modo = document.querySelector('input[name="paramModo"]:checked')?.value || '2';
        const sintetico = document.getElementById('paramSintetico').checked ? '1' : '0';

        // Aggiorna stato
        MrpApp.state.parametri = { codart, magaz, fase, modo, sintetico };

        setStatus('Caricamento in corso...');
        document.getElementById('btnEsegui').disabled = true;

        try {
            const params = new URLSearchParams({ codart, magaz, fase, modo, sintetico });
            const res = await fetch(`${MrpApp.API_BASE}/progressivi?${params}`, { credentials: 'include' });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Errore server');

            MrpApp.state.ultimoRisultato = data;

            // Passa alla vista progressivi
            MrpProgressivi.render(data);
            MrpApp.switchView('progressivi');

            setStatus('');
        } catch (err) {
            setStatus('Errore: ' + err.message, true);
            console.error('[Parametri] Errore esegui:', err);
        } finally {
            document.getElementById('btnEsegui').disabled = false;
        }
    }

    function setStatus(msg, isError = false) {
        const el = document.getElementById('paramStatus');
        el.textContent = msg;
        el.className = 'mrp-status' + (isError ? ' error' : '');
    }

    return { init, caricaFasi };
})();
