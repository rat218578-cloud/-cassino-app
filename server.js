const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const session = require('express-session');
const cors = require('cors');

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'sorte-na-bet-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24h
}));

// Armazena browsers por usuário
const userBrowsers = new Map();

// ========== 1. ENDPOINT DE LOGIN ==========
app.post('/api/login', async (req, res) => {
    const { email, senha, sessionId } = req.body;
    const userSessionId = sessionId || req.session.id;

    try {
        // Verifica se já existe browser para este usuário
        let browserData = userBrowsers.get(userSessionId);
        
        if (!browserData || browserData.expires < Date.now()) {
            console.log(`🔄 Criando nova instância headless para ${email}`);
            
            // Lança navegador headless
            const browser = await puppeteer.launch({
                headless: 'new', // ou false se quiser ver
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                userDataDir: `./user-data/${userSessionId}` // Persiste cookies
            });
            
            const page = await browser.newPage();
            
            // Configura viewport
            await page.setViewport({ width: 1280, height: 720 });
            
            // Intercepta requisições para capturar EVOSESSIONID
            let evoSessionId = null;
            
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const url = request.url();
                // Captura headers que contém EVOSESSIONID
                if (url.includes('evo') || url.includes('session')) {
                    const headers = request.headers();
                    if (headers['x-evo-session'] || headers['evosessionid']) {
                        evoSessionId = headers['x-evo-session'] || headers['evosessionid'];
                        console.log('🎯 EVOSESSIONID capturado:', evoSessionId);
                    }
                }
                request.continue();
            });
            
            // Monitora respostas
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('/auth/login') || url.includes('/api/login')) {
                    try {
                        const body = await response.text();
                        const match = body.match(/EVOSESSIONID["\s:=]+([A-Za-z0-9_-]+)/i);
                        if (match) {
                            evoSessionId = match[1];
                            console.log('✅ EVOSESSIONID encontrado na resposta:', evoSessionId);
                        }
                    } catch (e) {}
                }
            });
            
            // Navega para o site
            await page.goto('https://sortenabet.bet.br', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Aguarda e preenche o formulário de login
            await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 10000 });
            
            // Preenche email
            await page.type('input[type="email"], input[name="email"]', email, { delay: 50 });
            
            // Preenche senha
            await page.type('input[type="password"]', senha, { delay: 50 });
            
            // Clica no botão de login
            await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")');
            
            // Aguarda login completar e captura EVOSESSIONID
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
            
            // Tenta extrair EVOSESSIONID dos cookies
            const cookies = await page.cookies();
            const evoCookie = cookies.find(c => c.name === 'EVOSESSIONID' || c.name.includes('EVO'));
            if (evoCookie) {
                evoSessionId = evoCookie.value;
            }
            
            // Se não achou, tenta do localStorage
            const localStorageData = await page.evaluate(() => {
                return {
                    evo_session: localStorage.getItem('evo_session_id'),
                    session: localStorage.getItem('session_id'),
                    token: localStorage.getItem('token')
                };
            });
            
            evoSessionId = evoSessionId || localStorageData.evo_session || localStorageData.session;
            
            // Armazena dados do browser
            browserData = {
                browser,
                page,
                evoSessionId,
                email,
                expires: Date.now() + (24 * 60 * 60 * 1000),
                cookies
            };
            
            userBrowsers.set(userSessionId, browserData);
        }
        
        // Retorna o EVOSESSIONID e URL do jogo
        const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopCard000000001&session=${browserData.evoSessionId}`;
        
        res.json({
            success: true,
            evo_session_id: browserData.evoSessionId,
            game_url: gameUrl,
            session_id: userSessionId
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== 2. ENDPOINT PARA VERIFICAR SESSÃO ==========
app.get('/api/check-session', async (req, res) => {
    const sessionId = req.session.id;
    const browserData = userBrowsers.get(sessionId);
    
    if (browserData && browserData.expires > Date.now() && browserData.evoSessionId) {
        res.json({
            valid: true,
            evo_session_id: browserData.evoSessionId
        });
    } else {
        res.json({ valid: false });
    }
});

// ========== 3. ENDPOINT PARA CARREGAR IFRAME DIRETO ==========
app.get('/api/game-url', async (req, res) => {
    const sessionId = req.session.id;
    const browserData = userBrowsers.get(sessionId);
    
    if (browserData && browserData.evoSessionId) {
        const gameUrl = `https://sortenabet.evo-games.com/frontend/evo/r2/?table_id=TopCard000000001&session=${browserData.evoSessionId}`;
        res.json({ url: gameUrl });
    } else {
        res.json({ url: null, requires_login: true });
    }
});

// ========== 4. ENDPOINT PARA LOGOUT ==========
app.post('/api/logout', async (req, res) => {
    const sessionId = req.session.id;
    const browserData = userBrowsers.get(sessionId);
    
    if (browserData && browserData.browser) {
        await browserData.browser.close();
        userBrowsers.delete(sessionId);
    }
    
    req.session.destroy();
    res.json({ success: true });
});

// Limpeza periódica de sessões expiradas
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of userBrowsers.entries()) {
        if (data.expires < now) {
            data.browser.close().catch(console.error);
            userBrowsers.delete(key);
            console.log(`🧹 Sessão ${key} expirada e removida`);
        }
    }
}, 60 * 60 * 1000); // A cada hora

// Servir arquivos estáticos
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📝 Use este HTML: http://localhost:${PORT}`);
});
