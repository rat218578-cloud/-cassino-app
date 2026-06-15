import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Armazena sessões ativas (em produção use Redis)
const activeSessions = new Map();

// 🔐 ENDPOINT DE LOGIN REAL
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log(`📝 Login: ${email}`);
    
    // Verifica se já tem sessão ativa
    if (activeSessions.has(email)) {
        const session = activeSessions.get(email);
        if (Date.now() - session.createdAt < 3600000) { // 1 hora
            console.log(`✅ Usando sessão existente para: ${email}`);
            return res.json({
                success: true,
                iframeUrl: `https://sortenabet.evo-games.com/frontend/evo/r2/?EVOSESSIONID=${session.sessionId}`,
                fromCache: true
            });
        }
    }
    
    try {
        // 1. Login na Sorte na Bet
        const authRes = await axios.post('https://api.sortenabet.bet.br/v1/auth/login', {
            email: email,
            password: password
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        const token = authRes.data.access_token;
        console.log('✅ Login Sorte na Bet OK');
        
        // 2. Gerar EVOSESSIONID na Evolution
        const evoRes = await axios.post('https://sortenabet.evo-games.com/api/v1/session/init', {
            token: token,
            game_type: 'topcard',
            platform: 'web',
            client_version: '6.20260612.73024.62644-7774ff9958-r2',
            table_id: 'TopCard000000001'
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        const sessionId = evoRes.data.sessionId;
        console.log('✅ EVOSESSIONID gerado');
        
        // Salva sessão
        activeSessions.set(email, {
            sessionId: sessionId,
            email: email,
            createdAt: Date.now()
        });
        
        // 3. Retornar URL do iframe
        res.json({
            success: true,
            sessionId: sessionId,
            iframeUrl: `https://sortenabet.evo-games.com/frontend/evo/r2/?EVOSESSIONID=${sessionId}&table_id=TopCard000000001`
        });
        
    } catch (error) {
        console.error('❌ Erro:', error.response?.data || error.message);
        res.status(401).json({
            success: false,
            error: 'Email ou senha inválidos'
        });
    }
});

// Endpoint para verificar sessão
app.post('/api/check-session', (req, res) => {
    const { email } = req.body;
    const session = activeSessions.get(email);
    
    if (session && (Date.now() - session.createdAt) < 3600000) {
        res.json({ valid: true, sessionId: session.sessionId });
    } else {
        res.json({ valid: false });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📍 API: http://localhost:${PORT}/api/login`);
});
