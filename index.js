import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ============================
// ESTADO
// ============================
let state = {
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

let commandQueue = [];

// ============================
// POLLING (Luau)
// ============================
app.get('/poll', (req, res) => {
    const cmds = [...commandQueue];
    commandQueue = [];
    res.setHeader('Cache-Control', 'no-store');
    res.json({ state, commands: cmds });
});

// ============================
// COMANDO (painel)
// ============================
app.post('/command', (req, res) => {
    const { type, value } = req.body || {};

    if (type === 'toggle' && typeof state[value] === 'boolean') {
        state[value] = !state[value];
        console.log('[TOGGLE]', value, '->', state[value]);
    } else if (type === 'set' && value && value.key !== undefined) {
        state[value.key] = value.val;
        console.log('[SET]', value.key, '=', value.val);
    }

    commandQueue.push({ type, value, ts: Date.now() });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, state });
});

// ============================
// STATE (painel)
// ============================
app.get('/state', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(state);
});

// ============================
// SERVE O HTML DA RAIZ
// ============================
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'index.html');
    if (fs.existsSync(htmlPath)) {
        res.setHeader('Content-Type', 'text/html');
        res.send(fs.readFileSync(htmlPath, 'utf-8'));
    } else {
        res.status(404).send('index.html não encontrado');
    }
});

export default app;
