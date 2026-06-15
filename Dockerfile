FROM python:3.11-slim

# Instalar Tor
RUN apt-get update && apt-get install -y tor curl && \
    rm -rf /var/lib/apt/lists/*

# Configurar Tor
RUN echo "SocksPort 9050" >> /etc/tor/torrc && \
    echo "RunAsDaemon 1" >> /etc/tor/torrc

# Copiar arquivos
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Iniciar Tor e Flask
CMD service tor start && sleep 5 && python app.py
