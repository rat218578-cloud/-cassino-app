FROM python:3.11-slim

# Instalar Tor e dependências
RUN apt-get update && apt-get install -y \
    tor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Instalar Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Configurar Tor
RUN echo "SocksPort 9050" >> /etc/tor/torrc && \
    echo "RunAsDaemon 1" >> /etc/tor/torrc

COPY . .

# Iniciar Tor e depois o app
CMD service tor start && sleep 3 && python app.py
