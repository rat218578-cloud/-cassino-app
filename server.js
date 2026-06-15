const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// ========== ENDPOINT DE LOGIN REAL ==========
app.post('/api/cassino/login', async (req, res) => {
    const { email, password, captcha_token } = req.body;
    
    try {
        console.log('📝 Tentando login para:', email);
        
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
            }
        });
        
        const data = response.data;
        
        if (data.access_token) {
            console.log('✅ Login bem-sucedido!');
            
            // Extrai informações
            const accessToken = data.access_token;
            const userData = data.user;
            
            // Tenta extrair ou construir EVOSESSIONID
            const evo_session_id = data.evo_session_id || 
                                   data.session_id || 
                                   accessToken;
            
            // URL do jogo (Football Studio)
            const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopCard000000001&session=${evo_session_id}`;
            
            res.json({
                success: true,
                access_token: accessToken,
                evo_session_id: evo_session_id,
                game_url: gameUrl,
                user: userData,
                expires_in: data.expires_in
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

// ========== ENDPOINT PARA VERIFICAR SESSÃO ==========
app.post('/api/cassino/verify', async (req, res) => {
    const { token } = req.body;
    
    try {
        const response = await axios.get('https://api-front.appbackend.tech/auth', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        res.json({
            valid: true,
            user: response.data
        });
    } catch (error) {
        res.json({ valid: false });
    }
});

// ========== ENDPOINT PARA PEGAR URL DO JOGO ==========
app.post('/api/cassino/game-url', async (req, res) => {
    const { token } = req.body;
    
    // URL do jogo específico (Football Studio)
    const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopCard000000001&session=${token}`;
    
    res.json({
        url: gameUrl,
        session: token
    });
});

// Servir frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(3000, () => {
    console.log('🚀 Servidor rodando em http://localhost:3000');
    console.log('📝 Endpoints disponíveis:');
    console.log('   POST /api/cassino/login');
    console.log('   POST /api/cassino/verify');
    console.log('   POST /api/cassino/game-url');
});
