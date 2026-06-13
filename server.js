import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 🔐 SEU ENDPOINT DE LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log(`📝 Login via formulário: ${email}`);
    
    try {
        // 1. Login na Sorte na Bet
        const authRes = await axios.post('https://api.sortenabet.com/v1/auth/login', {
            email: email,
            password: password,
            client_id: 'web_app',
            grant_type: 'password'
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Content-Type': 'application/json',
                'Origin': 'https://sortenabet.com'
            }
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
        });
        
        const sessionId = evoRes.data.sessionId;
        console.log('✅ EVOSESSIONID gerado');
        
        // 3. Retornar URL do iframe
        res.json({
            success: true,
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
