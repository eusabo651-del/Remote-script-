import express, { type Request, type Response } from 'express';

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

const DEFAULT_STATE: AppState = {
  assistenteMira: false,
  desaceleracao: false,
  ancoragem: false,
  marcadorCaixa: false,
  marcadorCirculo: false,
  marcadorVida: false,
  marcadorLinha: false,
  marcadorSeta: false,
  marcadorMinimapa: false,
  modoStream: false,
  raioFoco: 120,
  suavidade: 0.35,
};

// Fallback sem banco: fica disponível enquanto esta instância serverless estiver ativa.
// Uma reinicialização ou outra instância pode iniciar com os valores padrão.
let memoryState: AppState = { ...DEFAULT_STATE };

type ToggleKey = {
  [K in keyof AppState]: AppState[K] extends boolean ? K : never;
}[keyof AppState];

const TOGGLE_KEYS = new Set<keyof AppState>([
  'assistenteMira',
  'desaceleracao',
  'ancoragem',
  'marcadorCaixa',
  'marcadorCirculo',
  'marcadorVida',
  'marcadorLinha',
  'marcadorSeta',
  'marcadorMinimapa',
  'modoStream',
]);

function isToggleKey(value: unknown): value is ToggleKey {
  return typeof value === 'string' && TOGGLE_KEYS.has(value as ToggleKey);
}

const app = express();
app.use(express.json());

function getState(): AppState {
  return { ...memoryState };
}

function setState(state: AppState): void {
  memoryState = { ...state };
}

// O jogo continua lendo o estado pelo endpoint existente.
app.get('/poll', async (_req: Request, res: Response) => {
  const state = getState();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ state, commands: [] });
});

// /command também aceita o protocolo antigo "toggle" para compatibilidade.
// A interface atual usa "set" com o valor desejado, evitando inversões por corrida.
app.post('/command', async (req: Request, res: Response) => {
  const body = req.body as { type?: unknown; value?: unknown } | undefined;
  const state = getState();
  const value = body?.value;

  if (body?.type === 'toggle' && isToggleKey(value)) {
    state[value] = !state[value];
  } else if (
    body?.type === 'set' &&
    value !== null &&
    typeof value === 'object' &&
    'key' in value &&
    'val' in value
  ) {
    const setting = value as { key: unknown; val: unknown };
    if (isToggleKey(setting.key) && typeof setting.val === 'boolean') {
      state[setting.key] = setting.val;
    } else if (
      (setting.key === 'raioFoco' || setting.key === 'suavidade') &&
      typeof setting.val === 'number' &&
      Number.isFinite(setting.val)
    ) {
      state[setting.key] = setting.val;
    } else {
      res.status(400).json({ ok: false, error: 'Configuração inválida.' });
      return;
    }
  } else {
    res.status(400).json({ ok: false, error: 'Comando inválido.' });
    return;
  }

  setState(state);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, state });
});

app.get('/state', async (_req: Request, res: Response) => {
  const state = getState();
  res.setHeader('Cache-Control', 'no-store');
  res.json(state);
});

export default app;
