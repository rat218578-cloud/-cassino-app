const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// LOGS detalhados para Railway
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
}

log('🚀 SERVIDOR INICIANDO...');
log(`📅 Data: ${new Date().toLocaleString()}`);
log(`🌍 PORT: ${process.env.PORT || 3000}`);

const sessions = new Map();

// Healthcheck - obrigatório para Railway
app.get('/health', (req, res) => {
    log('📊 Healthcheck OK');
    res.status(200).json({ 
        status: 'ok', 
        sessions: sessions.size, 
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    log('🏠 GET / - Servindo index.html');
    res.sendFile(__dirname + '/public/index.html');
});

// ========== LOGIN ==========
app.post('/api/cassino/login', async (req, res) => {
    const { email, password, captcha_token } = req.body;
    
    log(`📝 Tentativa de login: ${email}`);
    log(`🔑 Captcha recebido: ${captcha_token ? '✅ SIM (length: ' + captcha_token.length + ')' : '❌ NÃO'}`);
    
    if (!captcha_token) {
        log('❌ ERRO: Captcha não enviado!');
        return res.status(400).json({ 
            success: false, 
            error: 'Captcha é obrigatório. Marque o checkbox "Não sou um robô".' 
        });
    }
    
    try {
        log('📡 Enviando para API externa...');
        
        const response = await axios.post('https://api-front.appbackend.tech/api/auth/login', {
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
            timeout: 30000
        });
        
        const data = response.data;
        log(`📥 Resposta status: ${response.status}`);
        
        if (data.access_token) {
            const sessionId = crypto.randomBytes(16).toString('hex');
            sessions.set(sessionId, {
                access_token: data.access_token,
                email: email,
                created_at: Date.now(),
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
            
            log(`✅ Login bem-sucedido! Session: ${sessionId.substring(0, 16)}...`);
            log(`👤 Usuário: ${data.user?.name || email}`);
            
            res.json({
                success: true,
                session_id: sessionId,
                access_token: data.access_token,
                user: data.user,
                expires_in: data.expires_in,
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
        } else {
            log('❌ Resposta sem access_token');
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
            error: error.response?.data?.message || error.message || 'Falha na autenticação. Verifique email/senha.'
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
    
    log(`👤 Usuário: ${session.email}`);
    
    const slug = game_slug || 'evolution/football-studio-dice';
    log(`🎲 Game: ${slug}`);
    
    try {
        const tabId = crypto.randomUUID();
        const mountedId = crypto.randomUUID();
        
        log('📡 Chamando start-game-v2...');
        
        const response = await axios.get(`https://api-front.appbackend.tech/api/start-game-v2`, {
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
            timeout: 30000
        });
        
        const data = response.data;
        log(`📥 Resposta status: ${response.status}`);
        
        let verificationToken = data.verification_token || data.token;
        
        if (!verificationToken && data.iframe_url) {
            const match = data.iframe_url.match(/[?&]token=([^&]+)/);
            if (match) verificationToken = match[1];
            log('🔑 Token extraído do iframe_url');
        }
        
        if (!verificationToken) {
            log('❌ Não foi possível obter verification_token');
            throw new Error('Não foi possível obter o token do jogo');
        }
        
        session.evo_token = verificationToken;
        
        const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopDice000000001&token=${verificationToken}`;
        
        log(`✅ Jogo iniciado! Token: ${verificationToken.substring(0, 30)}...`);
        
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
    
    res.json({
        valid: true,
        has_game_token: !!session.evo_token,
        expires_at: session.expires_at
    });
});

// Limpeza de sessões expiradas a cada hora
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
        log(`🧹 ${deleted} sessões expiradas removidas. Total ativo: ${sessions.size}`);
    }
}, 60 * 60 * 1000);

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    log(`💥 Uncaught Exception: ${err.message}`);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`💥 Unhandled Rejection: ${reason}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    log(`🚀 Servidor rodando na porta ${PORT}`);
    log(`📝 Healthcheck: /health`);
    log(`✅ Pronto para receber requisições!`);
});
