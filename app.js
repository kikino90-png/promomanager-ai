// --- CONFIG & STATE ---
const state = {
    currentScreen: 'home',
    promos: JSON.parse(localStorage.getItem('promo_list') || '[]'),
    geminiKey: localStorage.getItem('gemini_key') || '',
    googleClientId: localStorage.getItem('google_client_id') || '',
    driveFolderId: localStorage.getItem('drive_folder_id') || '',
    isAuthorized: false,
    activeYear: 'total',
    lastUpdate: parseInt(localStorage.getItem('last_update')) || 0,
    currentPdfBase64: null,
    currentPdfFile: null,
    editingPromoId: null,
    tempPromoData: null
};

// --- DOM ELEMENTS ---
const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');
const syncBtn = document.getElementById('sync-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const promoList = document.getElementById('promo-list');
const yearFilter = document.getElementById('year-filter');
const cloudStatus = document.getElementById('cloud-status');
const createFormContainer = document.getElementById('create-form-container');
const detailsFormContainer = document.getElementById('details-form-container');

// PDF & Scanner Elements
const dropZonePdf = document.getElementById('drop-zone-pdf');
const pdfUpload = document.getElementById('pdf-upload');
const scannerOverlay = document.getElementById('scanner-overlay');
const scannerVideo = document.getElementById('scanner-video');
const scannerResult = document.getElementById('scanner-result');

// Tabs & Containers
const methodTabs = document.querySelectorAll('.method-tab');
const methodAi = document.getElementById('method-ai');
const methodManualHint = document.getElementById('method-manual-hint');
const aiResults = document.getElementById('ai-results');

// --- PWA SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => console.log('SW Registered'));
}

// --- NAVIGATION & SCREENS ---
function showScreen(screenId) {
    screens.forEach(s => s.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    
    const activeScreen = document.getElementById(`screen-${screenId}`);
    if (activeScreen) activeScreen.classList.add('active');
    
    const navItem = document.querySelector(`[data-screen="${screenId}"]`);
    if(navItem) navItem.classList.add('active');
    
    state.currentScreen = screenId;
    if(screenId === 'home') renderDashboard();
    if(screenId === 'new') resetNewPromoScreen();
    if(screenId === 'config') populateConfigFields();
}

function populateConfigFields() {
    document.getElementById('gemini-key').value = state.geminiKey;
    document.getElementById('google-client-id').value = state.googleClientId;
    document.getElementById('drive-folder-id').value = state.driveFolderId;
}

navItems.forEach(item => {
    item.addEventListener('click', () => showScreen(item.dataset.screen));
});

document.getElementById('back-to-home').onclick = () => showScreen('home');

// --- FORM RENDERER (SHARED) ---
function renderPromoForm(container, data = null, isEdit = false) {
    const template = document.getElementById('promo-form-template');
    const clone = template.content.cloneNode(true);
    
    const nameIn = clone.querySelector('.form-name');
    const startIn = clone.querySelector('.form-start');
    const endIn = clone.querySelector('.form-end');
    const refundTermsIn = clone.querySelector('.form-refund-terms');
    const amountIn = clone.querySelector('.form-amount');
    const supportIn = clone.querySelector('.form-support');
    const supportLink = clone.querySelector('.form-support-link');
    const eanTable = clone.querySelector('.form-ean-list');
    const scanBtn = clone.querySelector('.form-scan-btn');
    const purchaseDateIn = clone.querySelector('.form-purchase-date');
    const sendDeadline = clone.querySelector('.form-send-deadline');
    const refundDeadline = clone.querySelector('.form-refund-deadline');
    const saveBtn = clone.querySelector('.form-save-btn');
    
    if (data) {
        nameIn.value = tidy(data.name || data.shop);
        startIn.value = data.validity?.start || data.start || '';
        endIn.value = data.validity?.end || data.end || '';
        refundTermsIn.value = tidy(data.refund_mode || data.refund_terms);
        amountIn.value = data.cashback_amount || data.amount || 0;
        supportIn.value = data.support_contacts || data.support || '';
        purchaseDateIn.value = data.purchaseDate || '';
        
        const products = data.products || [];
        eanTable.innerHTML = products.map(p => `
            <tr>
                <td contenteditable="true" class="ean-cell" data-placeholder="EAN">${p.ean || ''}</td>
                <td contenteditable="true" class="name-cell" data-placeholder="Prodotto">${tidy(p.name)}</td>
                <td style="width:40px;"><button type="button" class="icon-btn small-error" onclick="removeEanRow(this)"><span class="material-icons-round">delete</span></button></td>
            </tr>
        `).join('');
        
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'primary-btn small add-ean-btn';
        addBtn.style.cssText = 'margin:10px auto; display:flex; align-items:center; gap:5px; font-size:0.85rem; padding:8px 12px;';
        addBtn.innerHTML = '<span class="material-icons-round" style="font-size:1.1rem;">add</span> Aggiungi Prodotto';
        addBtn.onclick = () => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td contenteditable="true" class="ean-cell" data-placeholder="EAN"></td>
                <td contenteditable="true" class="name-cell" data-placeholder="Prodotto"></td>
                <td style="width:40px;"><button type="button" class="icon-btn small-error" onclick="removeEanRow(this)"><span class="material-icons-round">delete</span></button></td>
            `;
            eanTable.appendChild(tr);
        };
        clone.querySelector('.ean-table').after(addBtn);
        
        if (data.purchaseDate) updateDeadlines(data.purchaseDate, data, sendDeadline, refundDeadline);
        updateSupportLink(supportIn.value, supportLink);
    }

    supportIn.oninput = (e) => updateSupportLink(e.target.value, supportLink);
    purchaseDateIn.onchange = (e) => updateDeadlines(e.target.value, data || state.tempPromoData, sendDeadline, refundDeadline);
    scanBtn.onclick = () => startScanner(eanTable, data || state.tempPromoData);
    
    if (isEdit) saveBtn.classList.add('hidden');
    else saveBtn.onclick = () => handleSave(container);

    container.innerHTML = '';
    container.appendChild(clone);
}

function updateDeadlines(dateStr, data, sendEl, refundEl) {
    if (!dateStr) return;
    const d = new Date(dateStr);
    const s = new Date(d); s.setDate(d.getDate() + (data?.invio_giorni || 7));
    const r = new Date(s); r.setDate(s.getDate() + (data?.rimborso_giorni || 180));
    sendEl.innerText = s.toLocaleDateString('it-IT');
    refundEl.innerText = r.toLocaleDateString('it-IT');
}

function updateSupportLink(val, linkEl) {
    if (!val) { linkEl.classList.add('hidden'); return; }
    linkEl.classList.remove('hidden');
    if (val.includes('@')) linkEl.href = `mailto:${val}`;
    else if (val.startsWith('http')) linkEl.href = val;
    else linkEl.href = `https://www.google.com/search?q=${encodeURIComponent(val)}`;
}

function tidy(str) {
    if (!str || typeof str !== 'string') return str || "";
    let s = str.trim();
    if (!s) return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
}

window.removeEanRow = (btn) => {
    btn.closest('tr').remove();
};

// --- GOOGLE DRIVE & SYNC ---
let tokenClient;
async function gapiInit() {
    await gapi.load('client', async () => {
        await gapi.client.init({ discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'] });
    });
}

function gisInit() {
    if (!state.googleClientId) {
        console.warn("Google Client ID mancante nelle impostazioni. Login Drive disabilitato.");
        return;
    }
    
    try {
        if (!window.google?.accounts?.oauth2) {
            console.warn("Libreria Google Identity non ancora caricata.");
            return;
        }

        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: state.googleClientId,
            scope: 'https://www.googleapis.com/auth/drive',
            callback: (resp) => {
                if (resp.error) return;
                state.isAuthorized = true;
                localStorage.setItem('has_authorized', 'true');
                updateCloudUI('online');
                pullStateFromCloud();
            }
        });
        
        // Auto-login se abbiamo già autorizzato in passato
        if (localStorage.getItem('has_authorized') === 'true') {
            console.log("Tentativo di login silenzioso...");
            tokenClient.requestAccessToken({ prompt: '' });
        }
    } catch (e) { 
        console.error("Errore inizializzazione GIS:", e); 
    }
}

function updateCloudUI(mode) {
    cloudStatus.className = `cloud-badge ${mode}`;
    const icon = { 'online': 'cloud_done', 'offline': 'cloud_off', 'syncing': 'sync' }[mode];
    cloudStatus.innerHTML = `<span class="material-icons-round">${icon}</span>`;
}

syncBtn.onclick = () => {
    // Se il servizio non è pronto (es: ID inserito dopo), proviamo a inizializzarlo ora
    if (!tokenClient) gisInit();

    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'consent select_account' });
    } else {
        if (!state.googleClientId) {
            alert("⚠️ Devi prima inserire il tuo 'Google Client ID' nelle Impostazioni ⚙️");
            showScreen('config');
        } else {
            alert("Servizio Google Identity non pronto. Verifica la connessione.");
        }
    }
};

async function pushStateToCloud() {
    if (!state.isAuthorized || !state.driveFolderId) return;
    updateCloudUI('syncing');
    try {
        const files = await gapi.client.drive.files.list({ q: `name = 'promo_sync.json' and '${state.driveFolderId}' in parents and trashed = false`, fields: 'files(id)' });
        
        // Prepariamo l'oggetto di sync con Timestamp
        const syncData = { promos: state.promos, lastUpdate: state.lastUpdate };
        const content = JSON.stringify(syncData);
        
        const metadata = { name: 'promo_sync.json', parents: [state.driveFolderId] };
        let fileId = files.result.files[0]?.id;
        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', new Blob([content], { type: 'application/json' }));
        const url = fileId ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart` : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
        await fetch(url, { method: fileId ? 'PATCH' : 'POST', headers: { 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token }, body: formData });
        updateCloudUI('online');
    } catch(e) { updateCloudUI('offline'); }
}

async function pullStateFromCloud() {
    if (!state.isAuthorized || !state.driveFolderId) return;
    updateCloudUI('syncing');
    try {
        const files = await gapi.client.drive.files.list({ q: `name = 'promo_sync.json' and '${state.driveFolderId}' in parents and trashed = false`, fields: 'files(id)' });
        if (files.result.files.length > 0) {
            const fileId = files.result.files[0].id;
            const resp = await gapi.client.drive.files.get({ fileId, alt: 'media' });
            
            // Gestione dati con Timestamp
            const remoteData = resp.result || {};
            const remotePromos = remoteData.promos || (Array.isArray(remoteData) ? remoteData : []);
            const remoteUpdate = remoteData.lastUpdate || 0;

            if (remoteUpdate > state.lastUpdate) {
                // Il Cloud è più nuovo: Carichiamolo
                if (confirm(`Trovati dati più recenti su Drive (${new Date(remoteUpdate).toLocaleString()}). Sincronizzare?`)) {
                    state.promos = remotePromos;
                    state.lastUpdate = remoteUpdate;
                    localStorage.setItem('promo_list', JSON.stringify(state.promos));
                    localStorage.setItem('last_update', state.lastUpdate);
                    renderDashboard();
                }
            } else if (remoteUpdate < state.lastUpdate && state.lastUpdate > 0) {
                // Il Locale è più nuovo: Aggiorniamo il Cloud in silenzio
                console.log("Locale più recente, aggiorno il cloud...");
                pushStateToCloud();
            }
        }
        updateCloudUI('online');
    } catch(e) { updateCloudUI('offline'); }
}

async function uploadFileToDrive(file, parentId, fileName) {
    if (!state.isAuthorized) return null;
    const metadata = { name: fileName || file.name, parents: [parentId] };
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);
    const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + gapi.auth.getToken().access_token },
        body: formData
    });
    const result = await resp.json();
    if (result.error) throw new Error(result.error.message);
    return result.id;
}

// --- NEW PROMO AI ---
function resetNewPromoScreen() {
    methodAi.classList.add('active');
    methodManualHint.classList.remove('active');
    aiResults.classList.add('hidden');
    document.getElementById('reg-link').value = '';
    dropZonePdf.querySelector('p').innerText = "Carica PDF Regolamento";
    dropZonePdf.style.borderColor = "";
    state.currentPdfBase64 = null;
    state.currentPdfFile = null;
}

methodTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        methodTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.method === 'ai') resetNewPromoScreen();
        else {
            methodAi.classList.remove('active');
            methodManualHint.classList.add('active');
            aiResults.classList.remove('hidden');
            state.tempPromoData = { invio_giorni: 7, rimborso_giorni: 180, products: [] };
            renderPromoForm(createFormContainer, state.tempPromoData);
        }
    });
});

dropZonePdf.onclick = () => pdfUpload.click();
pdfUpload.onchange = async (e) => {
    if (e.target.files[0]) {
        state.currentPdfFile = e.target.files[0];
        const reader = new FileReader();
        reader.readAsDataURL(state.currentPdfFile);
        reader.onload = () => {
            state.currentPdfBase64 = reader.result.split(',')[1];
            dropZonePdf.querySelector('p').innerText = "File: " + state.currentPdfFile.name;
            dropZonePdf.style.borderColor = "var(--primary)";
        };
    }
};

analyzeBtn.onclick = async () => {
    const link = document.getElementById('reg-link').value;
    if (!state.geminiKey) return alert("Inserisci la API Key nelle impostazioni!");
    if (!link && !state.currentPdfBase64) return alert("Inserisci un link o carica un PDF!");

    console.log("Inizio analisi AI...");
    loadingOverlay.classList.remove('hidden');
    
    let promptText = "Analizza questo regolamento ";
    promptText += link ? `al link: ${link}` : "dal PDF allegato";
    promptText += ". ESTRAI TUTTI I PRODOTTI COINVOLTI CON TUTTI I CODICI EAN SE PRESENTI, NON OMETTERE NULLA. Output in JSON: { \"name\": \"...\", \"validity\": {\"start\": \"...\", \"end\": \"...\"}, \"products\": [{\"ean\": \"...\", \"name\": \"...\"}], \"invio_giorni\": 7, \"rimborso_giorni\": 180, \"refund_mode\": \"...\", \"cashback_amount\": 10.0, \"support_contacts\": \"...\" }";

    const parts = [{ text: promptText }];
    if (state.currentPdfBase64) parts.push({ inlineData: { mimeType: "application/pdf", data: state.currentPdfBase64 } });

    try {
        console.log("Invio richiesta a Gemini...");
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${state.geminiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } })
        });
        
        const data = await resp.json();
        console.log("Dati ricevuti da Gemini:", data);
        if (data.error) throw new Error(data.error.message);
        
        const textResponse = data.candidates[0].content.parts[0].text;
        let json = JSON.parse(textResponse);
        
        if (Array.isArray(json)) json = json[0];
        
        console.log("JSON pronto per il form:", json);
        state.tempPromoData = json;
        aiResults.classList.remove('hidden');
        renderPromoForm(createFormContainer, json);
        console.log("Rendering completato.");
    } catch (e) { 
        alert("Errore AI: " + e.message); 
    } finally { 
        loadingOverlay.classList.add('hidden'); 
    }
};

// --- SAVE & DELETE LOGIC ---
async function handleSave(container, isUpdate = false) {
    if (!state.isAuthorized) return alert("Sincronizza Drive prima di salvare!");
    
    const name = container.querySelector('.form-name').value.trim();
    if (!name) return alert("Nome promozione obbligatorio!");

    loadingOverlay.classList.remove('hidden');
    document.getElementById('loader-text').innerText = isUpdate ? "Aggiornamento in corso..." : "Salvataggio su Drive in corso...";

    try {
        let folderId = isUpdate ? state.promos.find(p => p.id === state.editingPromoId).driveFolderId : null;
        let isFallback = false;

        if (!isUpdate) {
            let rootId = state.driveFolderId?.trim() || null;
            try {
                const fidResp = await gapi.client.drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder', parents: rootId ? [rootId] : [] } });
                folderId = fidResp.result.id;
            } catch(e) {
                const fidResp = await gapi.client.drive.files.create({ resource: { name, mimeType: 'application/vnd.google-apps.folder' } });
                folderId = fidResp.result.id;
                isFallback = true;
            }

            if (state.currentPdfFile) await uploadFileToDrive(state.currentPdfFile, folderId, "Regolamento.pdf");
            const receipt = container.querySelector('.form-receipt-upload').files[0];
            if (receipt) await uploadFileToDrive(receipt, folderId, "Scontrino.jpg");
            const prods = container.querySelector('.form-products-upload').files;
            for (let i = 0; i < prods.length; i++) { await uploadFileToDrive(prods[ i ], folderId, `Prodotto_${i+1}.jpg`); }
        }

        // Collect Products from Table (ContentEditable)
        const productRows = container.querySelectorAll('.ean-table tbody tr');
        const finalProducts = Array.from(productRows).map(row => ({
            ean: row.querySelector('.ean-cell').innerText.trim(),
            name: row.querySelector('.name-cell').innerText.trim()
        })).filter(p => p.name || p.ean);

        const promoObj = {
            id: isUpdate ? state.editingPromoId : Date.now(),
            shop: name,
            amount: parseFloat(container.querySelector('.form-amount').value) || 0,
            deadline: container.querySelector('.form-send-deadline').innerText,
            purchaseDate: container.querySelector('.form-purchase-date').value,
            support: container.querySelector('.form-support').value,
            status: isUpdate ? state.promos.find(p => p.id === state.editingPromoId).status : '⏳ In attesa',
            driveFolderId: folderId,
            products: finalProducts
        };

        if (isUpdate) {
            const idx = state.promos.findIndex(p => p.id === state.editingPromoId);
            state.promos[idx] = promoObj;
        } else {
            state.promos.unshift(promoObj);
        }

        state.lastUpdate = Date.now();
        localStorage.setItem('last_update', state.lastUpdate);
        localStorage.setItem('promo_list', JSON.stringify(state.promos));
        await pushStateToCloud();
        
        if (!isUpdate) {
            alert(`SALVATO CON SUCCESSO! ✅\nCartella creata su Drive: "${name}"\n${isFallback ? "⚠️ Attenzione: salvato nel 'My Drive' principale perché l'ID root non era valido." : "Salvato nella cartella dedicata."}`);
        }
        
        showScreen('home');
    } catch (e) { alert("Errore: " + e.message); } finally { loadingOverlay.classList.add('hidden'); }
}

async function deletePromoPermanently(id) {
    const promo = state.promos.find(p => p.id === id);
    if (!promo) return;
    
    if (!confirm(`ELIMINAZIONE DEFINITIVA:\nSei sicuro di voler eliminare "${promo.shop}"? \nVerrà cancellata anche la cartella su Drive con tutti i documenti.`)) return;
    if (!confirm("CONFERMA FINALE:\nI file NON potranno essere recuperati. Procedere?")) return;

    loadingOverlay.classList.remove('hidden');
    document.getElementById('loader-text').innerText = "Cancellazione file Drive...";

    try {
        if (state.isAuthorized && promo.driveFolderId) {
            try {
                await gapi.client.drive.files.delete({ fileId: promo.driveFolderId });
            } catch(driveErr) {
                console.warn("Cartella Drive non trovata o già eliminata.", driveErr);
            }
        }
        state.promos = state.promos.filter(p => p.id !== id);
        state.lastUpdate = Date.now();
        localStorage.setItem('last_update', state.lastUpdate);
        localStorage.setItem('promo_list', JSON.stringify(state.promos));
        await pushStateToCloud();
        showScreen('home');
    } catch(e) { alert("Errore durante l'eliminazione: " + e.message); } finally { loadingOverlay.classList.add('hidden'); }
}

// --- DASHBOARD & LIST ---
function renderDashboard() {
    // Dynamic Filter Population
    const years = [...new Set(state.promos.map(p => new Date(p.purchaseDate || p.id).getFullYear().toString()))].sort().reverse();
    const currentVal = yearFilter.value;
    yearFilter.innerHTML = '<option value="total">Tutto il tempo</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (years.includes(currentVal) || currentVal === 'total') yearFilter.value = currentVal;

    const list = state.promos.filter(p => state.activeYear === 'total' || new Date(p.purchaseDate || p.id).getFullYear().toString() === state.activeYear);
    const stats = { pending: 0, refunded: 0, invalid: 0 };
    list.forEach(p => { 
        if (p.status === '✅ Rimborsato') stats.refunded += p.amount; 
        else if (p.status === '❌ Non Validato') stats.invalid++; 
        else stats.pending += p.amount; 
    });
    
    document.getElementById('stat-pending-val').innerText = `€ ${stats.pending.toFixed(2)}`;
    document.getElementById('stat-refunded-val').innerText = `€ ${stats.refunded.toFixed(2)}`;
    document.getElementById('stat-invalid-count').innerText = stats.invalid;
    document.getElementById('stat-total-count').innerText = list.length;

    promoList.innerHTML = list.length ? list.map(p => `
        <div class="promo-card" onclick="openPromo(${p.id})">
            <div class="card-title">
                <strong>${p.shop}</strong> 
                <span class="material-icons-round" style="color:var(--accent); font-size:1.2rem; margin-left:10px; cursor:pointer;" onclick="openInDrive('${p.driveFolderId}', event)">folder</span>
            </div>
            <div class="card-meta">
                <span>€${p.amount.toFixed(2)} • ${p.deadline}</span>
                <span class="status">${p.status}</span>
            </div>
        </div>
    `).join('') : '<p style="text-align:center; color:var(--text-dim); margin-top:20px;">Ancora nessuna promozione</p>';
}

window.openPromo = (id) => {
    state.editingPromoId = id;
    const promo = state.promos.find(p => p.id === id);
    showScreen('details');
    renderPromoForm(detailsFormContainer, promo, true);
};

window.openInDrive = (id, event) => {
    event.stopPropagation();
    if (!id) return alert("Nessuna cartella associata a questa promo.");
    window.open(`https://drive.google.com/drive/folders/${id}`, '_blank');
};

async function updatePromoStatus(id, newStatus) {
    const promo = state.promos.find(p => p.id === id);
    if (!promo) return;
    
    loadingOverlay.classList.remove('hidden');
    document.getElementById('loader-text').innerText = "Aggiornamento stato...";

    try {
        promo.status = newStatus;
        state.lastUpdate = Date.now();
        localStorage.setItem('last_update', state.lastUpdate);
        localStorage.setItem('promo_list', JSON.stringify(state.promos));
        await pushStateToCloud();
        renderDashboard();
        showScreen('home');
    } catch(e) { alert("Errore: " + e.message); } finally { loadingOverlay.classList.add('hidden'); }
}

document.getElementById('status-refunded-btn').onclick = () => updatePromoStatus(state.editingPromoId, '✅ Rimborsata');
document.getElementById('status-rejected-btn').onclick = () => updatePromoStatus(state.editingPromoId, '❌ Rifiutata');
document.getElementById('update-promo-btn').onclick = () => handleSave(detailsFormContainer, true);
document.getElementById('delete-promo-btn').onclick = () => deletePromoPermanently(state.editingPromoId);

// --- SCANNER ---
let barcodeScanner = null, scanStream = null;
async function startScanner(tableEl, dataObj) {
    if (!('BarcodeDetector' in window)) return alert("Scanner non supportato.");
    barcodeScanner = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'] });
    scannerOverlay.classList.remove('hidden');
    try { 
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); 
        scannerVideo.srcObject = scanStream; 
        scannerVideo.play(); 
        requestAnimationFrame(scanFrame); 
    } catch(e) {}
}

async function scanFrame() {
    if (!scanStream) return;
    try { 
        const bc = await barcodeScanner.detect(scannerVideo); 
        if (bc.length) verifyEAN(bc[0].rawValue); 
        else requestAnimationFrame(scanFrame); 
    } catch(e) { requestAnimationFrame(scanFrame); }
}

function verifyEAN(code) {
    const data = state.tempPromoData || state.promos.find(p => p.id === state.editingPromoId);
    const match = data?.products?.some(p => p.ean && p.ean.includes(code));
    scannerResult.innerText = `Codice: ${code}\n${match ? '✅ VALIDO' : '❌ NON IN PROMO'}`;
    scannerResult.className = match ? 'scan-match' : 'scan-no-match';
    if(match) setTimeout(stopScanner, 2000);
}

function stopScanner() { if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; } scannerOverlay.classList.add('hidden'); }
document.getElementById('close-scanner').onclick = stopScanner;

// --- SETTINGS PERSISTENCE ---
function setupSettingsListeners() {
    const feedback = document.getElementById('settings-feedback');
    const showFeedback = () => {
        if (!feedback) return;
        feedback.style.opacity = '1';
        setTimeout(() => feedback.style.opacity = '0', 1000);
    };

    const binder = (id, key, callback) => {
        const el = document.getElementById(id);
        if (!el) { console.error(`Elemento ${id} non trovato!`); return; }
        el.addEventListener('input', (e) => {
            let val = e.target.value.trim();
            
            // Se è l'ID della cartella, puliamo l'eventuale URL intero
            if (id === 'drive-folder-id' && val.includes('folders/')) {
                val = val.split('folders/')[1].split('?')[0];
                e.target.value = val; // Aggiorna graficamente il campo
            }

            state[key] = val;
            try {
                localStorage.setItem(id.replace(/-/g, '_'), val);
                console.log(`Salvato ${key}:`, val);
                showFeedback();
                if (callback) callback();
            } catch(e) { console.error("Errore salvataggio storage:", e); }
        });
    };

    binder('gemini-key', 'geminiKey');
    binder('google-client-id', 'googleClientId', gisInit);
    binder('drive-folder-id', 'driveFolderId');
    
    // Pulsante Logout (Scollega)
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (confirm("Vuoi scollegare l'account Google attuale? Questo forzerà la selezione di un nuovo account al prossimo avvio.")) {
                
                // Opzione Nucleare: Revoca l'accesso sui server Google se possibile
                try {
                    const token = gapi.client.getToken()?.access_token;
                    if (token) {
                        google.accounts.oauth2.revoke(token, () => {
                            console.log("Accesso revocato correttamente.");
                        });
                    }
                } catch (e) { console.warn("Revoca non riuscita:", e); }

                localStorage.removeItem('has_authorized');
                state.isAuthorized = false;
                
                // Disabilita auto-select per il futuro
                if (window.google?.accounts?.id) {
                    google.accounts.id.disableAutoSelect();
                }
                
                updateCloudUI('offline');
                alert("Account scollegato e rimosso. Ora puoi scegliere un account diverso cliccando sulla nuvola.");
            }
        };
    }
    
    console.log("Listeners Impostazioni configurati con successo.");
}

// --- INIT ---
window.addEventListener('load', () => {
    console.log("App Initialization Start v1.5.7 (Lazy Auth Fix)");
    gapiInit(); 
    gisInit(); 
    renderDashboard();
    
    yearFilter.onchange = (e) => { 
        state.activeYear = e.target.value; 
        renderDashboard(); 
    };

    setupSettingsListeners();
    populateConfigFields();
});

// Forziamo il popolamento anche se onload è lento
if (document.readyState === 'complete') {
  setupSettingsListeners();
  populateConfigFields();
}
