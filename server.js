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
    
    // ⚠️ SUBSTITUA PELO DOMÍNIO CORRETO DA API!
    const API_URL = 'https://api.sortenabet.bet.br/v1/auth/login';
    
    try {
        const authRes = await axios.post(API_URL, {
            email: email,
            password: password
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Content-Type': 'application/json'
            }
        });
        
        const token = authRes.data.access_token;
        
        // Gerar EVOSESSIONID
        const evoRes = await axios.post('https://sortenabet.evo-games.com/api/v1/session/init', {
            token: token,
            game_type: 'topcard',
            platform: 'web',
            table_id: 'TopCard000000001'
        });
        
        res.json({
            success: true,
            iframeUrl: `https://sortenabet.evo-games.com/frontend/evo/r2/?EVOSESSIONID=${evoRes.data.sessionId}`
        });
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
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
