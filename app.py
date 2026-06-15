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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
    
    try:
        response = requests.post(
            'https://sortenabet.bet.br/api/auth/login',
            headers=HEADERS,
            json=login_data,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                'success': True,
                'access_token': data.get('access_token'),
                'user': data.get('user')
            }
        else:
            return {'success': False, 'error': f'Status: {response.status_code}'}
            
    except Exception as e:
        return {'success': False, 'error': str(e)}

def obter_url_jogo(access_token, slug='evolution/football-studio-dice'):
    """Obtém URL do iframe do jogo"""
    
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
        
        if response.status_code == 200:
            data = response.json()
            if data.get('gameURL'):
                return {'success': True, 'gameURL': data['gameURL']}
            else:
                return {'success': False, 'error': 'gameURL não encontrado'}
        else:
            return {'success': False, 'error': f'Status: {response.status_code}'}
            
    except Exception as e:
        return {'success': False, 'error': str(e)}

# ========== ROTAS ==========

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    senha = data.get('password')
    captcha_token = data.get('captcha_token')
    
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

@app.route('/api/game-url', methods=['POST'])
def game_url():
    data = request.get_json()
    email = data.get('email')
    access_token = data.get('access_token')
    slug = data.get('slug', 'evolution/football-studio-dice')
    
    if not access_token and email and email in sessions:
        access_token = sessions[email]['access_token']
    
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

@app.route('/api/check-session', methods=['POST'])
def check_session():
    data = request.get_json()
    email = data.get('email')
    
    if email and email in sessions:
        session = sessions[email]
        if time.time() - session['created_at'] < 604800:
            return jsonify({'valid': True, 'access_token': session['access_token']})
    
    return jsonify({'valid': False})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
