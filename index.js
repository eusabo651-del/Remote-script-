import express from 'express';
import { kv } from '@vercel/kv';

const app = express();
app.use(express.json());

// ============================
// ESTADO INICIAL (default)
// ============================
const DEFAULT_STATE = {
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
    suavidade: 0.35
};

// ============================
// LÊ O ESTADO DO KV
// ============================
async function getState() {
    try {
        const stored = await kv.get('state');
        if (stored && typeof stored === 'object') {
            return { ...DEFAULT_STATE, ...stored };
        }
        return { ...DEFAULT_STATE };
    } catch (e) {
        console.error('KV get error:', e);
        return { ...DEFAULT_STATE };
    }
}

// ============================
// SALVA O ESTADO NO KV
// ============================
async function setState(state) {
    try {
        await kv.set('state', state);
    } catch (e) {
        console.error('KV set error:', e);
    }
}

// ============================
// POLLING (Luau lê aqui)
// ============================
app.get('/poll', async (req, res) => {
    const state = await getState();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ state, commands: [] });
});

// ============================
// COMANDO (painel manda aqui)
// ============================
app.post('/command', async (req, res) => {
    const { type, value } = req.body || {};
    let state = await getState();

    if (type === 'toggle' && typeof state[value] === 'boolean') {
        state[value] = !state[value];
        console.log('[TOGGLE]', value, '->', state[value]);
    } else if (type === 'set' && value && value.key !== undefined) {
        state[value.key] = value.val;
        console.log('[SET]', value.key, '=', value.val);
    }

    await setState(state);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, state });
});

// ============================
// STATE (painel lê aqui)
// ============================
app.get('/state', async (req, res) => {
    const state = await getState();
    res.setHeader('Cache-Control', 'no-store');
    res.json(state);
});

// ============================
// SERVE O HTML
// ============================
app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(PAINEL_HTML);
});

const PAINEL_HTML = `COLE_AQUI_O_HTML`;

export default app;
