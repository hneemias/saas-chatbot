# ==============================================================================
# Stage 1: Install Dependencies
# ==============================================================================
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ==============================================================================
# Stage 2: Build Next.js 16 Standalone
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ==============================================================================
# Stage 3: Production Runtime (Lightweight Standalone Server)
# ==============================================================================
FROM node:22-alpine AS runner

RUN apk add --no-cache curl tzdata
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=America/Sao_Paulo
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/painel/api/health || exit 1

CMD ["node", "server.js"]
