from flask import Flask, send_from_directory, request, jsonify
from flask_cors import CORS
import requests
import os
import json
from datetime import datetime, timedelta

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)

# ========== CONFIGURAÇÕES ==========
TOKEN_CACHE_FILE = 'tokens/cache.json'

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

cache = TokenCache()

# ========== ROTAS ==========
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/api/login', methods=['POST'])
def login():
    """Recebe o CAPTCHA_TOKEN gerado no navegador do usuário"""
    data = request.json
    email = data.get('email')
    senha = data.get('senha')
    captcha_token = data.get('captcha_token')  # ← GERADO NO NAVEGADOR!
    
    if not email or not senha:
        return jsonify({'success': False, 'error': 'Email e senha obrigatórios'}), 400
    
    if not captcha_token:
        return jsonify({'success': False, 'error': 'CAPTCHA_TOKEN não fornecido'}), 400
    
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
    
    # Faz login com o token do navegador
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
        "captcha_token": captcha_token  # ← USANDO O TOKEN DO NAVEGADOR
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

@app.route('/api/jogo/<slug>', methods=['GET'])
def carregar_jogo(slug):
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
    print("🚀 APP SEM PLAYWRIGHT - TOKEN GERADO NO NAVEGADOR")
    print("=" * 60)
    print("📌 O CAPTCHA_TOKEN é gerado no navegador do USUÁRIO")
    print("📌 IP do usuário é usado, NUNCA será bloqueado!")
    print("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False)
