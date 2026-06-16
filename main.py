# main.py - App completo com Playwright + Anti-Detecção
import asyncio
import os
import json
import time
import logging
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS
from playwright.async_api import async_playwright
import requests
from fake_useragent import UserAgent
from dotenv import load_dotenv

# ========== CARREGA ENV ==========
load_dotenv()

# ========== CONFIGURAÇÕES ==========
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'sua-chave-secreta-aqui')
CORS(app)

TOKEN_CACHE_FILE = 'tokens/cache.json'
PROXY_HOST = os.getenv('PROXY_HOST')
PROXY_PORT = os.getenv('PROXY_PORT')
PROXY_USER = os.getenv('PROXY_USER')
PROXY_PASS = os.getenv('PROXY_PASS')

# ========== LOGGING ==========
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========== TOKEN FIXO (SEU TOKEN VÁLIDO) ==========
CAPTCHA_TOKEN_FIXO = os.getenv('CAPTCHA_TOKEN_FIXO', '')

# ========== GERENCIADOR DE CACHE ==========
class TokenCache:
    def __init__(self):
        self.arquivo = TOKEN_CACHE_FILE
        self.dados = self.carregar()
    
    def carregar(self):
        if os.path.exists(self.arquivo):
            try:
                with open(self.arquivo, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def salvar(self):
        os.makedirs(os.path.dirname(self.arquivo), exist_ok=True)
        with open(self.arquivo, 'w') as f:
            json.dump(self.dados, f, indent=2)
    
    def get_access_token(self):
        token = self.dados.get('access_token')
        expiracao = self.dados.get('access_token_expiracao')
        if token and expiracao:
            exp = datetime.fromisoformat(expiracao)
            if datetime.now() < exp:
                return token
        return None
    
    def set_access_token(self, token):
        expiracao = datetime.now() + timedelta(days=7)
        self.dados['access_token'] = token
        self.dados['access_token_expiracao'] = expiracao.isoformat()
        self.salvar()
    
    def get_captcha_token(self):
        return self.dados.get('captcha_token', CAPTCHA_TOKEN_FIXO)
    
    def set_captcha_token(self, token):
        self.dados['captcha_token'] = token
        self.salvar()

cache = TokenCache()

# ========== FUNÇÃO PARA GERAR CAPTCHA_TOKEN COM PLAYWRIGHT ==========
async def gerar_captcha_token():
    """Gera CAPTCHA_TOKEN usando Playwright com anti-detecção"""
    
    logger.info("🚀 Iniciando Playwright para gerar CAPTCHA_TOKEN...")
    
    async with async_playwright() as p:
        # ========== CONFIGURA ANTI-DETECÇÃO ==========
        ua = UserAgent()
        user_agent = ua.random
        
        args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',  # Bloqueia imagens (mais leve)
            '--disable-javascript',  # Se não precisar
            '--window-size=1024,768',
            '--lang=pt-BR,pt',
            '--disable-blink-features=AutomationControlled',
        ]
        
        # Proxy se configurado
        if PROXY_HOST and PROXY_PORT:
            logger.info(f"🌐 Usando proxy: {PROXY_HOST}:{PROXY_PORT}")
            proxy = {
                'server': f'http://{PROXY_HOST}:{PROXY_PORT}'
            }
            if PROXY_USER and PROXY_PASS:
                proxy['username'] = PROXY_USER
                proxy['password'] = PROXY_PASS
        else:
            proxy = None
        
        # ========== INICIA BROWSER ==========
        browser = await p.chromium.launch(
            headless=True,
            args=args,
            proxy=proxy
        )
        
        # ========== CRIA CONTEXTO ==========
        context = await browser.new_context(
            viewport={'width': 1024, 'height': 768},
            locale='pt-BR',
            user_agent=user_agent,
            ignore_https_errors=True,
            java_script_enabled=True,
            has_touch=False,
            device_scale_factor=1,
            extra_http_headers={
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1'
            }
        )
        
        # ========== BLOQUEIA RECURSOS DESNECESSÁRIOS ==========
        await context.route('**/*', lambda route: handle_route(route))
        
        # ========== CRIA PÁGINA ==========
        page = await context.new_page()
        
        # ========== ANTI-DETECÇÃO AVANÇADA ==========
        await page.add_init_script("""
            // Remove webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Plugin array
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // Languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['pt-BR', 'pt', 'en']
            });
            
            // Chrome runtime
            window.chrome = { runtime: {} };
            
            // Permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        """)
        
        # ========== ACESSA O SITE ==========
        logger.info("🌐 Acessando página de login...")
        await page.goto('https://sortenabet.bet.br/auth/login', {
            wait_until: 'networkidle',
            timeout: 30000
        })
        
        # ========== AGUARDA TURNSTILE ==========
        logger.info("⏳ Aguardando Turnstile...")
        await asyncio.sleep(5)
        
        # ========== TENTA CAPTURAR TOKEN ==========
        logger.info("🔍 Capturando token...")
        
        # Método 1: localStorage
        token = await page.evaluate('''
            () => {
                for (let key in localStorage) {
                    const value = localStorage[key];
                    if (value && (value.startsWith('t2:') || value.startsWith('1.')) && value.length > 100) {
                        return value;
                    }
                }
                return null;
            }
        ''')
        
        # Método 2: Se não encontrou, tenta interagir
        if not token:
            logger.info("🔄 Tentando interagir com o formulário...")
            try:
                await page.fill('input[name="email"]', 'gcriste268@gmail.com')
                await page.fill('input[name="password"]', '284050')
                await page.click('button[type="submit"]')
                await asyncio.sleep(3)
                
                token = await page.evaluate('''
                    () => {
                        for (let key in localStorage) {
                            const value = localStorage[key];
                            if (value && (value.startsWith('t2:') || value.startsWith('1.')) && value.length > 100) {
                                return value;
                            }
                        }
                        return null;
                    }
                ''')
            except Exception as e:
                logger.error(f"❌ Erro ao interagir: {e}")
        
        # ========== SALVA SCREENSHOT ==========
        try:
            screenshot_path = f"/app/screenshots/{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            await page.screenshot(path=screenshot_path)
            logger.info(f"📸 Screenshot salvo: {screenshot_path}")
        except:
            pass
        
        # ========== FECHA BROWSER ==========
        await browser.close()
        
        if token:
            logger.info(f"✅ CAPTCHA_TOKEN capturado: {token[:50]}...")
            cache.set_captcha_token(token)
            return token
        else:
            logger.error("❌ Token não encontrado")
            return None

async def handle_route(route):
    """Bloqueia recursos desnecessários"""
    resource_type = route.request.resource_type
    if resource_type in ['image', 'stylesheet', 'font', 'media']:
        await route.abort()
    else:
        await route.continue_()

# ========== ROTAS DA API ==========
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/login', methods=['POST'])
def login():
    """Login via API"""
    data = request.json
    email = data.get('email')
    senha = data.get('senha')
    
    if not email or not senha:
        return jsonify({'success': False, 'error': 'Email e senha obrigatórios'}), 400
    
    # Tenta token do cache
    captcha_token = cache.get_captcha_token()
    
    # Se não tem token, gera um
    if not captcha_token:
        logger.info("🔄 Gerando novo CAPTCHA_TOKEN...")
        captcha_token = asyncio.run(gerar_captcha_token())
        if not captcha_token:
            return jsonify({'success': False, 'error': 'Não foi possível gerar o token'}), 500
    
    # Tenta access_token do cache
    access_token = cache.get_access_token()
    
    if access_token:
        # Testa se ainda funciona
        session_req = requests.Session()
        session_req.headers.update({'Authorization': f'Bearer {access_token}'})
        try:
            response = session_req.get('https://sortenabet.bet.br/api/auth/profile', timeout=5)
            if response.status_code == 200:
                return jsonify({
                    'success': True,
                    'access_token': access_token,
                    'from_cache': True
                })
        except:
            pass
    
    # Faz login
    logger.info("🔐 Fazendo login...")
    session_req = requests.Session()
    session_req.headers.update({
        'Content-Type': 'application/json',
        'Origin': 'https://sortenabet.bet.br',
        'Referer': 'https://sortenabet.bet.br/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    
    login_data = {
        "login": email,
        "email": email,
        "password": senha,
        "app_source": "web",
        "captcha_token": captcha_token
    }
    
    try:
        response = session_req.post(
            'https://sortenabet.bet.br/api/auth/login',
            json=login_data,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            access_token = data.get('access_token')
            cache.set_access_token(access_token)
            
            return jsonify({
                'success': True,
                'access_token': access_token,
                'from_cache': False
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Login falhou: {response.status_code}',
                'details': response.text
            }), response.status_code
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/token/status', methods=['GET'])
def token_status():
    """Verifica status dos tokens"""
    access_token = cache.get_access_token()
    captcha_token = cache.get_captcha_token()
    
    return jsonify({
        'has_access_token': bool(access_token),
        'has_captcha_token': bool(captcha_token),
        'captcha_token_preview': captcha_token[:50] + '...' if captcha_token else None
    })

@app.route('/api/token/generate', methods=['POST'])
def generate_token():
    """Gera novo CAPTCHA_TOKEN"""
    token = asyncio.run(gerar_captcha_token())
    if token:
        return jsonify({'success': True, 'token': token[:50] + '...'})
    return jsonify({'success': False, 'error': 'Falha ao gerar token'}), 500

@app.route('/api/jogo/<slug>', methods=['GET'])
def carregar_jogo(slug):
    """Carrega um jogo"""
    access_token = cache.get_access_token()
    if not access_token:
        return jsonify({'success': False, 'error': 'Não autenticado'}), 401
    
    try:
        session_req = requests.Session()
        session_req.headers.update({
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        })
        
        response = session_req.get(
            'https://sortenabet.bet.br/api/start-game-v2',
            params={'slug': slug, 'platform': 'WEB', 'use_demo': 0},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            game_url = data.get('gameURL') or data.get('iframe_url')
            if game_url:
                return jsonify({'success': True, 'url': game_url})
        return jsonify({'success': False, 'error': 'Jogo não encontrado'}), 404
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 RAILWAY PLAYWRIGHT APP")
    print("=" * 60)
    print(f"📂 Cache: {TOKEN_CACHE_FILE}")
    print(f"🌐 Proxy: {PROXY_HOST or 'NÃO CONFIGURADO'}")
    print(f"🔑 Token fixo: {'✅' if CAPTCHA_TOKEN_FIXO else '❌'}")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)
