interface AppState {
  assistenteMira: boolean;
  desaceleracao: boolean;
  ancoragem: boolean;
  marcadorCaixa: boolean;
  marcadorCirculo: boolean;
  marcadorVida: boolean;
  marcadorLinha: boolean;
  marcadorSeta: boolean;
  marcadorMinimapa: boolean;
  modoStream: boolean;
  raioFoco: number;
  suavidade: number;
}

type ToggleKey = {
  [K in keyof AppState]: AppState[K] extends boolean ? K : never;
}[keyof AppState];

const STATE_STORAGE_KEY = 'remote-script-state-v1';
const PENDING_STORAGE_KEY = 'remote-script-pending-v1';
const API = '';

const toggleInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-key]'),
);
const raioFoco = document.getElementById('raioFoco') as HTMLInputElement;
const suavidade = document.getElementById('suavidade') as HTMLInputElement;
const raioFocoVal = document.getElementById('raioFoco-val') as HTMLSpanElement;
const suavidadeVal = document.getElementById('suavidade-val') as HTMLSpanElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;

let isOnline = false;
let isSyncing = false;
let isProcessingPending = false;
let pendingState: Partial<Record<ToggleKey, boolean>> = readPendingState();

function isToggleKey(value: string | undefined): value is ToggleKey {
  return Boolean(value && toggleInputs.some((input) => input.dataset.key === value));
}

function readPendingState(): Partial<Record<ToggleKey, boolean>> {
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const pending: Partial<Record<ToggleKey, boolean>> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isToggleKey(key) && typeof value === 'boolean') pending[key] = value;
    }
    return pending;
  } catch {
    return {};
  }
}

function savePendingState(): void {
  try {
    localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pendingState));
  } catch {
    // A API continua sendo a fonte persistente caso o armazenamento local esteja indisponível.
  }
}

function saveCachedState(state: Partial<AppState>): void {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // O cache visual é opcional; o estado remoto continua funcionando normalmente.
  }
}

function readCachedState(): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppState>) : null;
  } catch {
    return null;
  }
}

function setOnline(ok: boolean): void {
  if (ok === isOnline) return;
  isOnline = ok;
  statusEl.classList.toggle('off', !ok);
  statusText.textContent = ok ? 'Online' : 'Offline';
}

function renderState(state: Partial<AppState>): void {
  isSyncing = true;
  for (const input of toggleInputs) {
    const key = input.dataset.key;
    if (!isToggleKey(key) || key in pendingState) continue;
    const value = state[key];
    if (typeof value === 'boolean') input.checked = value;
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

function updateCacheWithPending(state: Partial<AppState>): void {
  const cached: Partial<AppState> = { ...state };
  for (const [key, value] of Object.entries(pendingState)) {
    if (isToggleKey(key) && typeof value === 'boolean') cached[key] = value;
  }
  saveCachedState(cached);
}

async function processPendingState(): Promise<void> {
  if (isProcessingPending || !Object.keys(pendingState).length) return;
  isProcessingPending = true;

  try {
    while (Object.keys(pendingState).length > 0) {
      const [key, desiredValue] = Object.entries(pendingState)[0] as [ToggleKey, boolean];
      const response = await fetch(`${API}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'set', value: { key, val: desiredValue } }),
      });
      if (!response.ok) throw new Error('Não foi possível salvar a alteração.');

      const result = (await response.json()) as { ok: boolean; state: AppState };
      if (!result.ok) throw new Error('Não foi possível salvar a alteração.');
      if (pendingState[key] === desiredValue) {
        delete pendingState[key];
        savePendingState();
      }
      renderState(result.state);
      updateCacheWithPending(result.state);
      setOnline(true);
    }
  } catch {
    setOnline(false);
    window.setTimeout(() => void processPendingState(), 2000);
  } finally {
    isProcessingPending = false;
  }
}

function queueToggle(key: ToggleKey, desiredValue: boolean): void {
  pendingState[key] = desiredValue;
  savePendingState();
  const current = readCachedState() ?? {};
  current[key] = desiredValue;
  saveCachedState(current);
  void processPendingState();
}

for (const input of toggleInputs) {
  input.addEventListener('change', () => {
    if (isSyncing) return;
    const key = input.dataset.key;
    if (isToggleKey(key)) queueToggle(key, input.checked);
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

async function sendNumericSetting(key: 'raioFoco' | 'suavidade', value: number): Promise<void> {
  try {
    const response = await fetch(`${API}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'set', value: { key, val: value } }),
    });
    if (!response.ok) throw new Error('Não foi possível salvar.');
    const result = (await response.json()) as { ok: boolean; state: AppState };
    renderState(result.state);
    updateCacheWithPending(result.state);
    setOnline(true);
  } catch {
    setOnline(false);
  }
}

async function pollState(): Promise<void> {
  if (Object.keys(pendingState).length > 0) {
    void processPendingState();
    return;
  }
  try {
    const response = await fetch(`${API}/state`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Falha ao sincronizar estado.');
    const state = (await response.json()) as AppState;
    renderState(state);
    saveCachedState(state);
    setOnline(true);
  } catch {
    setOnline(false);
  }
}

const cachedState = readCachedState();
if (cachedState) renderState(cachedState);
for (const [key, value] of Object.entries(pendingState)) {
  if (isToggleKey(key) && typeof value === 'boolean') {
    const input = toggleInputs.find((candidate) => candidate.dataset.key === key);
    if (input) input.checked = value;
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
