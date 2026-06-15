#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import requests
import json
import time
import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)

# Headers padrão
HEADERS = {
    'Content-Type': 'application/json',
    'Origin': 'https://sortenabet.bet.br',
    'Referer': 'https://sortenabet.bet.br/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
}

# Cache de sessões
sessions = {}

def fazer_login(email, senha, captcha_token):
    """Faz login na Sorte na Bet"""
    
    login_data = {
        "login": email,
        "email": email,
        "password": senha,
        "app_source": "web",
        "captcha_token": captcha_token
    }
    
    print(f"🔐 Tentando login para: {email}")
    print(f"📝 Token size: {len(captcha_token)} caracteres")
    
    try:
        response = requests.post(
            'https://sortenabet.bet.br/api/auth/login',
            headers=HEADERS,
            json=login_data,
            timeout=15
        )
        
        print(f"📥 Status da API: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Login bem-sucedido!")
            return {
                'success': True,
                'access_token': data.get('access_token'),
                'user': data.get('user')
            }
        else:
            print(f"❌ Falha: {response.text[:200]}")
            return {'success': False, 'error': f'Status: {response.status_code} - {response.text[:100]}'}
            
    except Exception as e:
        print(f"❌ Exceção: {str(e)}")
        return {'success': False, 'error': str(e)}

def obter_url_jogo(access_token, slug='evolution/football-studio-dice'):
    """Obtém URL do iframe do jogo"""
    
    print(f"🎮 Buscando jogo: {slug}")
    
    try:
        response = requests.get(
            'https://sortenabet.bet.br/api/start-game-v2',
            params={
                'slug': slug,
                'platform': 'WEB',
                'use_demo': 0,
                'source': 'watchIsAuthenticated'
            },
            headers={
                **HEADERS,
                'Authorization': f'Bearer {access_token}'
            },
            timeout=15
        )
        
        print(f"📥 Status da API jogo: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('gameURL'):
                print(f"✅ Game URL obtida!")
                return {'success': True, 'gameURL': data['gameURL']}
            else:
                print(f"⚠️ gameURL não encontrado: {data}")
                return {'success': False, 'error': 'gameURL não encontrado'}
        else:
            return {'success': False, 'error': f'Status: {response.status_code}'}
            
    except Exception as e:
        print(f"❌ Exceção: {str(e)}")
        return {'success': False, 'error': str(e)}

# ========== ROTAS ==========

@app.route('/')
def index():
    print("📄 Servindo index.html")
    return send_from_directory('public', 'index.html')

@app.route('/api/login', methods=['POST'])
def login():
    print("\n" + "="*50)
    print("🔐 REQUISIÇÃO DE LOGIN RECEBIDA")
    print("="*50)
    
    try:
        data = request.get_json()
        print(f"📦 Body recebido: {data}")
        
        email = data.get('email')
        senha = data.get('password')
        captcha_token = data.get('captcha_token')
        
        print(f"📧 Email: {email}")
        print(f"🔑 Captcha token existe: {bool(captcha_token)}")
        
        if not email or not senha:
            return jsonify({'success': False, 'error': 'Email e senha são obrigatórios'}), 400
        
        if not captcha_token:
            return jsonify({'success': False, 'error': 'Captcha token é obrigatório'}), 400
        
        result = fazer_login(email, senha, captcha_token)
        
        if not result['success']:
            return jsonify({'success': False, 'error': result.get('error', 'Falha no login')}), 401
        
        access_token = result['access_token']
        
        sessions[email] = {
            'access_token': access_token,
            'created_at': time.time(),
            'user': result.get('user')
        }
        
        return jsonify({
            'success': True,
            'access_token': access_token,
            'user': result.get('user')
        })
        
    except Exception as e:
        print(f"❌ Erro na rota /api/login: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/game-url', methods=['POST'])
def game_url():
    print("\n" + "="*50)
    print("🎮 REQUISIÇÃO DE GAME URL RECEBIDA")
    print("="*50)
    
    try:
        data = request.get_json()
        print(f"📦 Body: {data}")
        
        email = data.get('email')
        access_token = data.get('access_token')
        slug = data.get('slug', 'evolution/football-studio-dice')
        
        if not access_token and email and email in sessions:
            access_token = sessions[email]['access_token']
            print(f"🔄 Token recuperado da sessão para {email}")
        
        if not access_token:
            return jsonify({'success': False, 'error': 'Token não encontrado'}), 401
        
        result = obter_url_jogo(access_token, slug)
        
        if result['success']:
            return jsonify({
                'success': True,
                'gameURL': result['gameURL']
            })
        else:
            return jsonify({'success': False, 'error': result.get('error', 'Falha ao obter jogo')}), 500
            
    except Exception as e:
        print(f"❌ Erro na rota /api/game-url: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/check-session', methods=['POST'])
def check_session():
    data = request.get_json()
    email = data.get('email')
    
    if email and email in sessions:
        session = sessions[email]
        if time.time() - session['created_at'] < 604800:
            return jsonify({'valid': True, 'access_token': session['access_token']})
    
    return jsonify({'valid': False})

@app.route('/api/test', methods=['GET'])
def test():
    """Rota de teste para verificar se o servidor está funcionando"""
    return jsonify({'status': 'ok', 'message': 'Servidor rodando!'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"🚀 Servidor iniciando na porta {port}")
    print(f"📁 Pasta pública: public/")
    print(f"🔗 Rotas disponíveis:")
    print(f"   GET  /")
    print(f"   POST /api/login")
    print(f"   POST /api/game-url")
    print(f"   GET  /api/test")
    app.run(host='0.0.0.0', port=port, debug=True)
