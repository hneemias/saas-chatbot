# ==============================================================================
# Production Runtime (Node.js 22 Alpine)
# Utiliza dist pré-compilado para build ultrarrápido (<15s) e zero sobrecarga de RAM na VPS
# ==============================================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache curl tzdata
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
ENV PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main.js"]
