const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const sessions = new Map();

// Healthcheck
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', sessions: sessions.size });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// ========== LOGIN ==========
app.post('/api/cassino/login', async (req, res) => {
    const { email, password, captcha_token } = req.body;
    
    // Verifica se o captcha foi enviado
    if (!captcha_token) {
        return res.status(400).json({ 
            success: false, 
            error: 'Captcha é obrigatório' 
        });
    }
    
    try {
        console.log('📝 Login para:', email);
        console.log('🔑 Captcha token:', captcha_token.substring(0, 30) + '...');
        
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
        
        if (data.access_token) {
            const sessionId = crypto.randomBytes(16).toString('hex');
            sessions.set(sessionId, {
                access_token: data.access_token,
                email: email,
                created_at: Date.now(),
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
            
            console.log('✅ Login bem-sucedido para:', email);
            
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
        console.error('❌ Erro no login:', error.response?.data || error.message);
        res.status(401).json({
            success: false,
            error: error.response?.data?.message || 'Falha na autenticação'
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
        
        console.log('🎮 Iniciando jogo para:', session.email);
        
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
        
        // Extrai o verification_token
        let verificationToken = data.verification_token || data.token;
        
        if (!verificationToken && data.iframe_url) {
            const match = data.iframe_url.match(/[?&]token=([^&]+)/);
            if (match) verificationToken = match[1];
        }
        
        if (!verificationToken) {
            throw new Error('Não foi possível obter o verification_token');
        }
        
        session.evo_token = verificationToken;
        
        const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopDice000000001&token=${verificationToken}`;
        
        console.log('✅ Jogo iniciado, token gerado');
        
        res.json({
            success: true,
            verification_token: verificationToken,
            game_url: gameUrl
        });
        
    } catch (error) {
        console.error('❌ Erro ao iniciar jogo:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || 'Falha ao iniciar o jogo'
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

// Limpeza periódica
setInterval(() => {
    const now = Date.now();
    for (const [key, session] of sessions.entries()) {
        if (session.expires_at < now) {
            sessions.delete(key);
            console.log(`🧹 Sessão ${key} expirada`);
        }
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
