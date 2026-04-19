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
ENV RUN_ON_START=true

EXPOSE 3001

CMD ["node", "dist/index.js"]