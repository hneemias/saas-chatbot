# ==============================================================================
# Stage 1: Build TypeScript Backend
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ==============================================================================
# Stage 2: Production Runtime (Node.js 22 Alpine)
# ==============================================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache curl tzdata
ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
ENV PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main.js"]
