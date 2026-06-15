const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ========== FUNÇÃO DE LOG DETALHADA ==========
const log = (type, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}`;
    
    // Console (vai aparecer nos logs do Railway)
    console.log(logEntry);
    if (data) console.log(JSON.stringify(data, null, 2));
    
    // Opcional: escrever em arquivo
    try {
        fs.appendFileSync('/app/logs.txt', logEntry + '\n');
        if (data) fs.appendFileSync('/app/logs.txt', JSON.stringify(data) + '\n');
    } catch(e) {}
};

// Log de inicialização
log('INFO', '🚀 SERVIDOR INICIANDO...');
log('INFO', `📅 Data: ${new Date().toLocaleString()}`);
log('INFO', `📂 Diretório atual: ${__dirname}`);
log('INFO', `🔧 PORT: ${process.env.PORT || 3000}`);

const sessions = new Map();

// Healthcheck com log
app.get('/health', (req, res) => {
    log('HEALTH', 'Healthcheck solicitado');
    res.status(200).json({ status: 'ok', sessions: sessions.size });
});

app.get('/', (req, res) => {
    log('ROUTE', 'GET / - Servindo index.html');
    res.sendFile(__dirname + '/public/index.html');
});

// ========== LOGIN ==========
app.post('/api/cassino/login', async (req, res) => {
    const { email, password, captcha_token } = req.body;
    
    log('LOGIN', `Tentativa para: ${email}`);
    log('LOGIN', `Captcha recebido: ${captcha_token ? 'SIM (length: ' + captcha_token.length + ')' : 'NÃO'}`);
    
    if (!captcha_token) {
        log('ERROR', 'Captcha não enviado');
        return res.status(400).json({ 
            success: false, 
            error: 'Captcha é obrigatório' 
        });
    }
    
    try {
        log('LOGIN', `Enviando requisição para API externa...`);
        
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
        log('LOGIN', `Resposta da API: status ${response.status}`);
        
        if (data.access_token) {
            const sessionId = crypto.randomBytes(16).toString('hex');
            sessions.set(sessionId, {
                access_token: data.access_token,
                email: email,
                created_at: Date.now(),
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
            
            log('SUCCESS', `✅ Login bem-sucedido para: ${email}`);
            log('SUCCESS', `Session ID: ${sessionId.substring(0, 16)}...`);
            
            res.json({
                success: true,
                session_id: sessionId,
                access_token: data.access_token,
                user: data.user,
                expires_in: data.expires_in,
                expires_at: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });
        } else {
            log('ERROR', 'Resposta da API sem access_token');
            throw new Error('Resposta sem access_token');
        }
        
    } catch (error) {
        log('ERROR', `Falha no login: ${error.message}`);
        if (error.response) {
            log('ERROR', `Status: ${error.response.status}`);
            log('ERROR', `Data: ${JSON.stringify(error.response.data)}`);
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
    
    log('GAME', `Iniciando jogo com session_id: ${session_id?.substring(0, 16)}...`);
    
    const session = sessions.get(session_id);
    if (!session) {
        log('ERROR', 'Sessão inválida ou não encontrada');
        return res.status(401).json({ success: false, error: 'Sessão inválida' });
    }
    
    log('GAME', `Usuário: ${session.email}`);
    
    const slug = game_slug || 'evolution/football-studio-dice';
    
    try {
        const tabId = crypto.randomUUID();
        const mountedId = crypto.randomUUID();
        
        log('GAME', `Chamando API /api/start-game-v2 para slug: ${slug}`);
        
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
        log('GAME', `Resposta recebida, status: ${response.status}`);
        
        let verificationToken = data.verification_token || data.token;
        
        if (!verificationToken && data.iframe_url) {
            const match = data.iframe_url.match(/[?&]token=([^&]+)/);
            if (match) verificationToken = match[1];
            log('GAME', `Token extraído do iframe_url`);
        }
        
        if (!verificationToken) {
            log('ERROR', 'Não foi possível obter verification_token');
            throw new Error('Não foi possível obter o verification_token');
        }
        
        session.evo_token = verificationToken;
        
        const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopDice000000001&token=${verificationToken}`;
        
        log('SUCCESS', `✅ Jogo iniciado com sucesso`);
        log('GAME', `Token: ${verificationToken.substring(0, 30)}...`);
        
        res.json({
            success: true,
            verification_token: verificationToken,
            game_url: gameUrl
        });
        
    } catch (error) {
        log('ERROR', `Erro ao iniciar jogo: ${error.message}`);
        if (error.response) {
            log('ERROR', `Status: ${error.response.status}`);
            log('ERROR', `Data: ${JSON.stringify(error.response.data)}`);
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
        log('VERIFY', `Sessão não encontrada: ${session_id?.substring(0, 16)}...`);
        return res.json({ valid: false });
    }
    
    if (session.expires_at < Date.now()) {
        log('VERIFY', `Sessão expirada: ${session.email}`);
        sessions.delete(session_id);
        return res.json({ valid: false, expired: true });
    }
    
    log('VERIFY', `Sessão válida para: ${session.email}`);
    res.json({
        valid: true,
        has_game_token: !!session.evo_token,
        expires_at: session.expires_at
    });
});

// Limpeza periódica
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
        log('CLEANUP', `🧹 ${deleted} sessões expiradas removidas. Total: ${sessions.size}`);
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    log('START', `🚀 Servidor rodando na porta ${PORT}`);
    log('START', `📝 Healthcheck: http://0.0.0.0:${PORT}/health`);
    log('START', `📝 Frontend: http://0.0.0.0:${PORT}/`);
    log('START', `📅 ${new Date().toISOString()}`);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (err) => {
    log('FATAL', `Uncaught Exception: ${err.message}`);
    log('FATAL', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    log('FATAL', `Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
