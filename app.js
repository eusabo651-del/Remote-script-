"use strict";
const STATE_STORAGE_KEY = 'remote-script-state-v1';
const PENDING_STORAGE_KEY = 'remote-script-pending-v1';
const API = '';
const toggleInputs = Array.from(document.querySelectorAll('input[type="checkbox"][data-key]'));
const raioFoco = document.getElementById('raioFoco');
const suavidade = document.getElementById('suavidade');
const raioFocoVal = document.getElementById('raioFoco-val');
const suavidadeVal = document.getElementById('suavidade-val');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
let isOnline = false;
let isSyncing = false;
let isProcessingPending = false;
let pendingState = readPendingState();
const lastRecoveryAttempt = new Map();
function isToggleKey(value) {
    return Boolean(value && toggleInputs.some((input) => input.dataset.key === value));
}
function readPendingState() {
    try {
        const raw = localStorage.getItem(PENDING_STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        const pending = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (isToggleKey(key) && typeof value === 'boolean')
                pending[key] = value;
        }
        return pending;
    }
    catch {
        return {};
    }
}
function savePendingState() {
    try {
        localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pendingState));
    }
    catch {
        // A API continua sendo a fonte persistente caso o armazenamento local esteja indisponível.
    }
}
function saveCachedState(state) {
    try {
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
    }
    catch {
        // O cache visual é opcional; o estado remoto continua funcionando normalmente.
    }
}
function readCachedState() {
    try {
        const raw = localStorage.getItem(STATE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
function setOnline(ok) {
    if (ok === isOnline)
        return;
    isOnline = ok;
    statusEl.classList.toggle('off', !ok);
    statusText.textContent = ok ? 'Online' : 'Offline';
}
function renderState(state) {
    isSyncing = true;
    for (const input of toggleInputs) {
        const key = input.dataset.key;
        if (!isToggleKey(key) || key in pendingState)
            continue;
        const value = state[key];
        if (typeof value === 'boolean')
            input.checked = value;
    }
    if (typeof state.raioFoco === 'number' && document.activeElement !== raioFoco) {
        raioFoco.value = String(state.raioFoco);
        raioFocoVal.textContent = String(state.raioFoco);
    }
    if (typeof state.suavidade === 'number' && document.activeElement !== suavidade) {
        suavidade.value = String(state.suavidade);
        suavidadeVal.textContent = String(state.suavidade);
    }
    isSyncing = false;
}
function updateCacheWithPending(state) {
    const cached = { ...state };
    for (const [key, value] of Object.entries(pendingState)) {
        if (isToggleKey(key) && typeof value === 'boolean')
            cached[key] = value;
    }
    saveCachedState(cached);
}
async function processPendingState() {
    if (isProcessingPending || !Object.keys(pendingState).length)
        return;
    isProcessingPending = true;
    try {
        while (Object.keys(pendingState).length > 0) {
            const [key, desiredValue] = Object.entries(pendingState)[0];
            const response = await fetch(`${API}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'set', value: { key, val: desiredValue } }),
            });
            if (!response.ok)
                throw new Error('Não foi possível salvar a alteração.');
            const result = (await response.json());
            if (!result.ok)
                throw new Error('Não foi possível salvar a alteração.');
            if (pendingState[key] === desiredValue) {
                delete pendingState[key];
                savePendingState();
            }
            renderState(result.state);
            updateCacheWithPending(result.state);
            setOnline(true);
        }
    }
    catch {
        setOnline(false);
        window.setTimeout(() => void processPendingState(), 2000);
    }
    finally {
        isProcessingPending = false;
    }
}
function queueToggle(key, desiredValue) {
    pendingState[key] = desiredValue;
    savePendingState();
    const current = readCachedState() ?? {};
    current[key] = desiredValue;
    saveCachedState(current);
    void processPendingState();
}
for (const input of toggleInputs) {
    input.addEventListener('change', () => {
        if (isSyncing)
            return;
        const key = input.dataset.key;
        if (isToggleKey(key))
            queueToggle(key, input.checked);
    });
}
raioFoco.addEventListener('input', () => {
    raioFocoVal.textContent = raioFoco.value;
});
raioFoco.addEventListener('change', () => {
    void sendNumericSetting('raioFoco', Number(raioFoco.value));
});
suavidade.addEventListener('input', () => {
    suavidadeVal.textContent = suavidade.value;
});
suavidade.addEventListener('change', () => {
    void sendNumericSetting('suavidade', Number(suavidade.value));
});
async function sendNumericSetting(key, value) {
    try {
        const response = await fetch(`${API}/command`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'set', value: { key, val: value } }),
        });
        if (!response.ok)
            throw new Error('Não foi possível salvar.');
        const result = (await response.json());
        renderState(result.state);
        updateCacheWithPending(result.state);
        setOnline(true);
    }
    catch {
        setOnline(false);
    }
}
async function pollState() {
    if (Object.keys(pendingState).length > 0) {
        void processPendingState();
        return;
    }
    try {
        const response = await fetch(`${API}/state`, { cache: 'no-store' });
        if (!response.ok)
            throw new Error('Falha ao sincronizar estado.');
        const state = (await response.json());
        const cached = readCachedState();
        let needsRecovery = false;
        if (cached) {
            const now = Date.now();
            for (const input of toggleInputs) {
                const key = input.dataset.key;
                if (isToggleKey(key) &&
                    typeof cached[key] === 'boolean' &&
                    state[key] !== cached[key] &&
                    now - (lastRecoveryAttempt.get(key) ?? 0) >= 4000) {
                    pendingState[key] = cached[key];
                    lastRecoveryAttempt.set(key, now);
                    needsRecovery = true;
                }
            }
        }
        if (needsRecovery) {
            savePendingState();
            void processPendingState();
            setOnline(true);
            return;
        }
        renderState(state);
        saveCachedState(state);
        setOnline(true);
    }
    catch {
        setOnline(false);
    }
}
const cachedState = readCachedState();
if (cachedState) {
    renderState(cachedState);
    // Ao reabrir o painel, reenviar os toggles em cache para reidratar a memória do servidor.
    for (const input of toggleInputs) {
        const key = input.dataset.key;
        if (isToggleKey(key) && typeof cachedState[key] === 'boolean' && !(key in pendingState)) {
            pendingState[key] = cachedState[key];
        }
    }
    savePendingState();
}
for (const [key, value] of Object.entries(pendingState)) {
    if (isToggleKey(key) && typeof value === 'boolean') {
        const input = toggleInputs.find((candidate) => candidate.dataset.key === key);
        if (input)
            input.checked = value;
    }
}
void processPendingState();
void pollState();
window.setInterval(() => void pollState(), 500);
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/service-worker.js').catch(() => {
            // O painel continua utilizável mesmo se o navegador não oferecer suporte ao PWA.
        });
    });
}
