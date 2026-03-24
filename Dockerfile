# ETAP 1: Build (Kompilacja TS -> JS)
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
# Instalujemy wszystkie zależności (w tym typescript i devDependencies)
RUN npm install
COPY . .
# Kompilujemy projekt do folderu dist/
RUN npm run build

# ETAP 2: Produkcja (Tylko runtime)
FROM node:20-slim

# Instalacja bibliotek systemowych dla Chrome (Puppeteer)
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Kopiujemy tylko pliki package.json
COPY package*.json ./

# Instalujemy TYLKO zależności produkcyjne (bez TS, tsx itp.)
RUN npm install --omit=dev

# Kopiujemy skompilowany kod z pierwszego etapu
COPY --from=builder /app/dist ./dist
# Kopiujemy ewentualne inne potrzebne pliki (np. deklaracje, jeśli są wymagane w runtime)
# COPY --from=builder /app/src/declarations ./dist/declarations

# Instalacja przeglądarki dla Puppeteera
RUN npx puppeteer browsers install chrome

# Uruchamiamy czystym nodem z folderu dist
CMD ["node", "dist/index.js"]