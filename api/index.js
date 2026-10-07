import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(express.json());

// ============================
// ESTADO (memória)
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
// POLLING (Luau lê aqui)
// ============================
app.get('/poll', (req, res) => {
    const cmds = [...commandQueue];
    commandQueue = [];
    res.setHeader('Cache-Control', 'no-store');
    res.json({ state, commands: cmds });
});

// ============================
// COMANDO (painel manda aqui)
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
// STATE (painel lê aqui)
// ============================
app.get('/state', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(state);
});

// ============================
// SERVE O PAINEL HTML
// ============================
app.get('/', (req, res) => {
    const htmlPath = path.join(process.cwd(), 'public', 'index.html');
    if (fs.existsSync(htmlPath)) {
        res.setHeader('Content-Type', 'text/html');
        res.send(fs.readFileSync(htmlPath, 'utf-8'));
    } else {
        res.status(404).send('index.html não encontrado em public/');
    }
});

export default app;
