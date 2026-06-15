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

// Armazena sessões do navegador headless
const sessions = new Map();

// URL base da API (pode ser alterada)
const API_BASE = process.env.API_BASE || 'https://api-front.appbackend.tech';

// Healthcheck
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', sessions: sessions.size });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// ========== PROXY PARA A API ==========
// Qualquer requisição para /api/proxy/* é redirecionada para a API real
app.all('/api/proxy/*', async (req, res) => {
    const targetPath = req.params[0];
    const targetUrl = `${API_BASE}/${targetPath}`;
    
    // Pega o session_id do header ou body
    const sessionId = req.headers['x-session-id'] || req.body?.session_id;
    const session = sessions.get(sessionId);
    
    log(`🔄 Proxy: ${req.method} ${targetUrl}`);
    
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Origin': 'https://sortenabet.bet.br',
            'Referer': 'https://sortenabet.bet.br/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        
        // Se tiver sessão, adiciona o token
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: headers,
            data: req.body,
            params: req.query,
            timeout: 30000
        });
        
        res.status(response.status).json(response.data);
    } catch (error) {
        log(`❌ Proxy error: ${error.message}`);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

// ========== LOGIN ==========
app.post('/api/cassino/login', async (req, res) => {
    const { email, password, captcha_token } = req.body;
    
    log(`📝 Tentativa de login: ${email}`);
    
    if (!captcha_token) {
        return res.status(400).json({ 
            success: false, 
            error: 'Captcha é obrigatório' 
        });
    }
    
    try {
        // Tenta diferentes endpoints
        const endpoints = [
            '/api/auth/login',
            '/auth/login', 
            '/v1/auth/login',
            '/v2/auth/login'
        ];
        
        let responseData = null;
        let workingEndpoint = null;
        
        for (const endpoint of endpoints) {
            try {
                log(`📡 Tentando: ${API_BASE}${endpoint}`);
                
                const response = await axios.post(`${API_BASE}${endpoint}`, {
                    login: email,
                    email: email,
                    password: password,
                    app_source: 'web',
                    captcha_token: captcha_token
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Origin': 'https://sortenabet.bet.br',
                        'Referer': 'https://sortenabet.bet.br/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                });
                
                if (response.status === 200 && (response.data.access_token || response.data.token)) {
                    responseData = response.data;
                    workingEndpoint = endpoint;
                    break;
                }
            } catch (e) {
                log(`⚠️ Endpoint ${endpoint} falhou: ${e.response?.status || e.message}`);
            }
        }
        
        if (!responseData) {
            throw new Error('Nenhum endpoint de login funcionou');
        }
        
        const accessToken = responseData.access_token || responseData.token;
        
        if (accessToken) {
            const sessionId = crypto.randomBytes(16).toString('hex');
            sessions.set(sessionId, {
                access_token: accessToken,
                email: email,
                created_at: Date.now(),
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
            
            log(`✅ Login bem-sucedido! Endpoint: ${workingEndpoint}`);
            
            res.json({
                success: true,
                session_id: sessionId,
                access_token: accessToken,
                user: responseData.user,
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
        } else {
            throw new Error('Resposta sem token');
        }
        
    } catch (error) {
        log(`❌ ERRO: ${error.message}`);
        res.status(401).json({
            success: false,
            error: 'Falha na autenticação. Verifique se o site está online.'
        });
    }
});

// ========== INICIAR JOGO ==========
app.post('/api/cassino/start-game', async (req, res) => {
    const { session_id, game_slug } = req.body;
    
    const session = sessions.get(session_id);
    if (!session) {
        return res.status(401).json({ success: false, error: 'Sessão inválida' });
    }
    
    const slug = game_slug || 'evolution/football-studio-dice';
    
    try {
        const tabId = crypto.randomUUID();
        const mountedId = crypto.randomUUID();
        
        const endpoints = [
            '/api/start-game-v2',
            '/start-game-v2',
            '/v2/start-game'
        ];
        
        let gameData = null;
        
        for (const endpoint of endpoints) {
            try {
                log(`📡 Tentando start-game: ${API_BASE}${endpoint}`);
                
                const response = await axios.get(`${API_BASE}${endpoint}`, {
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
                        'Origin': 'https://sortenabet.bet.br',
                        'Referer': 'https://sortenabet.bet.br/'
                    },
                    timeout: 10000
                });
                
                if (response.status === 200) {
                    gameData = response.data;
                    break;
                }
            } catch (e) {}
        }
        
        if (!gameData) {
            throw new Error('Não foi possível iniciar o jogo');
        }
        
        let verificationToken = gameData.verification_token || gameData.token;
        
        if (!verificationToken && gameData.iframe_url) {
            const match = gameData.iframe_url.match(/[?&]token=([^&]+)/);
            if (match) verificationToken = match[1];
        }
        
        if (!verificationToken) {
            throw new Error('Token não encontrado');
        }
        
        session.evo_token = verificationToken;
        
        const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopDice000000001&token=${verificationToken}`;
        
        res.json({
            success: true,
            verification_token: verificationToken,
            game_url: gameUrl
        });
        
    } catch (error) {
        log(`❌ ERRO: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message || 'Falha ao iniciar o jogo'
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
        sessions.delete(session_id);
        return res.json({ valid: false, expired: true });
    }
    
    res.json({
        valid: true,
        has_game_token: !!session.evo_token,
        expires_at: session.expires_at
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Servidor rodando na porta ${PORT}`);
    log(`📝 API Base: ${API_BASE}`);
});
