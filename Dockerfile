# Dockerfile - Playwright + Chromium (Leve)
FROM python:3.11-slim

# ========== INSTALA DEPENDÊNCIAS DO SISTEMA ==========
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxtst6 \
    libpango-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# ========== INSTALA PLAYWRIGHT ==========
RUN pip install playwright==1.40.0 && \
    playwright install chromium && \
    playwright install-deps

# ========== CRIA DIRETÓRIOS ==========
RUN mkdir -p /app/profiles /app/screenshots /app/tokens

WORKDIR /app

# ========== COPIA ARQUIVOS ==========
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY templates ./templates
COPY static ./static

# ========== EXPÕE A PORTA ==========
EXPOSE 5000

# ========== COMANDO ==========
CMD ["python", "main.py"]
