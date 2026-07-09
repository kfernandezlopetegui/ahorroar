FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Playwright browsers ya vienen en la imagen base
# Solo instalar dependencias del sistema que falten
RUN npx playwright install chromium --with-deps

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

ENV NODE_ENV=production
# Bancos y supers corren una vez al arrancar el contenedor; después siguen
# con el cron (bancos diario 7am, supers martes y viernes 6am). Así un
# deploy nuevo puebla datos —incluidos los cortes de carne— sin esperar al
# próximo cron.
ENV RUN_ON_START=true
ENV RUN_SUPERS_ON_START=true

EXPOSE 3001

CMD ["node", "dist/index.js"]