FROM python:3.11-slim

# ========== INSTALA DEPENDÊNCIAS MÍNIMAS ==========
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# ========== INSTALA PLAYWRIGHT (MAIS RÁPIDO) ==========
RUN pip install --no-cache-dir playwright==1.40.0 && \
    playwright install chromium && \
    playwright install-deps

RUN mkdir -p /app/profiles /app/screenshots /app/tokens

WORKDIR /app

# ========== COPIA E INSTALA DEPENDÊNCIAS ==========
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ========== COPIA O CÓDIGO ==========
COPY main.py .
COPY templates ./templates

EXPOSE 5000

CMD ["python", "main.py"]
