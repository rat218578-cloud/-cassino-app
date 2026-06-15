const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
}

log('🚀 SERVIDOR INICIANDO...');

const sessions = new Map();

// Healthcheck
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', sessions: sessions.size, timestamp: Date.now() });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// ========== LOGIN ==========
app.post('/api/cassino/login', async (req, res) => {
    const { email, password, captcha_token } = req.body;
    
    log(`📝 Tentativa de login: ${email}`);
    log(`🔑 Captcha: ${captcha_token ? '✅ SIM (length: ' + captcha_token.length + ')' : '❌ NÃO'}`);
    
    if (!captcha_token) {
        return res.status(400).json({ 
            success: false, 
            error: 'Captcha é obrigatório. Marque "Não sou um robô".' 
        });
    }
    
    try {
        const API_URL = 'https://sortenabet.bet.br/api/auth/login';
        
        log(`📡 Enviando POST para: ${API_URL}`);
        
        const response = await axios.post(API_URL, {
            login: email,
            email: email,
            password: password,
            app_source: 'web',
            captcha_token: captcha_token
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://sortenabet.bet.br',
                'Referer': 'https://sortenabet.bet.br/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 30000
        });
        
        const data = response.data;
        log(`📥 Status: ${response.status}`);
        
        if (data.access_token) {
            const sessionId = crypto.randomBytes(16).toString('hex');
            sessions.set(sessionId, {
                access_token: data.access_token,
                email: email,
                created_at: Date.now(),
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
            
            log(`✅ Login bem-sucedido! Session: ${sessionId.substring(0, 16)}...`);
            
            res.json({
                success: true,
                session_id: sessionId,
                access_token: data.access_token,
                user: data.user,
                expires_in: data.expires_in,
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
        } else {
            throw new Error('Resposta sem access_token');
        }
        
    } catch (error) {
        log(`❌ ERRO: ${error.message}`);
        if (error.response) {
            log(`📡 Status: ${error.response.status}`);
            log(`📦 Data: ${JSON.stringify(error.response.data)}`);
        }
        res.status(401).json({
            success: false,
            error: error.response?.data?.message || error.message || 'Falha na autenticação'
        });
    }
});

// ========== INICIAR JOGO ==========
app.post('/api/cassino/start-game', async (req, res) => {
    const { session_id, game_slug } = req.body;
    
    log(`🎮 Iniciando jogo - session: ${session_id?.substring(0, 16)}...`);
    
    const session = sessions.get(session_id);
    if (!session) {
        log('❌ Sessão inválida');
        return res.status(401).json({ success: false, error: 'Sessão inválida. Faça login novamente.' });
    }
    
    const slug = game_slug || 'evolution/football-studio-dice';
    log(`🎲 Game: ${slug}`);
    
    try {
        const tabId = crypto.randomUUID();
        const mountedId = crypto.randomUUID();
        
        const START_GAME_URL = 'https://sortenabet.bet.br/api/start-game-v2';
        
        log(`📡 GET para: ${START_GAME_URL}`);
        
        const response = await axios.get(START_GAME_URL, {
            params: {
                slug: slug,
                platform: 'WEB',
                use_demo: 0,
                source: 'watchIsAuthenticated',
                tab_id: tabId,
                mounted_id: mountedId
            },
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://sortenabet.bet.br',
                'Referer': 'https://sortenabet.bet.br/'
            },
            timeout: 30000
        });
        
        const data = response.data;
        log(`📥 Status: ${response.status}`);
        
        let verificationToken = data.verification_token || data.token;
        let gameUrl = null;
        
        if (!verificationToken && data.iframe_url) {
            const match = data.iframe_url.match(/[?&]token=([^&]+)/);
            if (match) verificationToken = match[1];
            gameUrl = data.iframe_url;
            log('🔑 Token extraído do iframe_url');
        }
        
        if (!verificationToken) {
            throw new Error('Não foi possível obter o verification_token');
        }
        
        session.evo_token = verificationToken;
        
        if (!gameUrl) {
            gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopDice000000001&token=${verificationToken}`;
        }
        
        log(`✅ Jogo iniciado!`);
        
        res.json({
            success: true,
            verification_token: verificationToken,
            game_url: gameUrl
        });
        
    } catch (error) {
        log(`❌ ERRO: ${error.message}`);
        if (error.response) {
            log(`📡 Status: ${error.response.status}`);
            log(`📦 Data: ${JSON.stringify(error.response.data)}`);
        }
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message || 'Falha ao iniciar o jogo'
        });
    }
});

// ========== VERIFICAR SESSÃO ==========
app.post('/api/cassino/verify', async (req, res) => {
    const { session_id } = req.body;
    
    const session = sessions.get(session_id);
    if (!session) {
        return res.json({ valid: false });
    }
    
    if (session.expires_at < Date.now()) {
        log(`⚠️ Sessão expirada: ${session.email}`);
        sessions.delete(session_id);
        return res.json({ valid: false, expired: true });
    }
    
    // Verifica se o token ainda é válido na API
    try {
        const response = await axios.get('https://sortenabet.bet.br/auth', {
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
        
        if (response.status === 200) {
            res.json({
                valid: true,
                has_game_token: !!session.evo_token,
                expires_at: session.expires_at,
                user: response.data
            });
        } else {
            throw new Error('Token inválido');
        }
    } catch (error) {
        log(`⚠️ Token expirado na API: ${session.email}`);
        sessions.delete(session_id);
        res.json({ valid: false, expired: true });
    }
});

// ========== RENOVAR TOKEN ==========
app.post('/api/cassino/refresh', async (req, res) => {
    const { session_id, captcha_token } = req.body;
    
    const session = sessions.get(session_id);
    if (!session) {
        return res.status(401).json({ success: false, error: 'Sessão inválida' });
    }
    
    if (!captcha_token) {
        return res.status(400).json({ success: false, error: 'Captcha necessário para renovar' });
    }
    
    try {
        const response = await axios.post('https://sortenabet.bet.br/api/auth/login', {
            login: session.email,
            email: session.email,
            password: null,
            app_source: 'web',
            captcha_token: captcha_token,
            refresh: true
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://sortenabet.bet.br',
                'Referer': 'https://sortenabet.bet.br/'
            },
            timeout: 30000
        });
        
        const data = response.data;
        
        if (data.access_token) {
            session.access_token = data.access_token;
            session.expires_at = Date.now() + (7 * 24 * 60 * 60 * 1000);
            
            log(`🔄 Token renovado para: ${session.email}`);
            
            res.json({
                success: true,
                access_token: data.access_token,
                expires_at: session.expires_at
            });
        } else {
            throw new Error('Não foi possível renovar');
        }
    } catch (error) {
        log(`❌ Erro ao renovar: ${error.message}`);
        res.status(401).json({ success: false, error: 'Falha ao renovar sessão' });
    }
});

// Limpeza de sessões expiradas
setInterval(() => {
    const now = Date.now();
    let deleted = 0;
    for (const [key, session] of sessions.entries()) {
        if (session.expires_at < now) {
            sessions.delete(key);
            deleted++;
        }
    }
    if (deleted > 0) {
        log(`🧹 ${deleted} sessões expiradas removidas. Total: ${sessions.size}`);
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Servidor rodando na porta ${PORT}`);
    log(`📝 Login URL: POST https://sortenabet.bet.br/api/auth/login`);
    log(`📝 Game URL: GET https://sortenabet.bet.br/api/start-game-v2`);
    log(`✅ Pronto para receber requisições!`);
});
