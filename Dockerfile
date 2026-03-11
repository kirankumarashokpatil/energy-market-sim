## Multi-stage Dockerfile for GridForge (Vite + React)
## - Stage 1: Install deps, run tests, build static assets
## - Stage 2: Serve built app with Node + Express (also hosts Gun relay at /gun)

# ---------- Builder & Test Stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy the rest of the source
COPY . .

# Run unit tests (vitest). If tests fail, build fails.
RUN npm test -- --run

# Build production assets
RUN npm run build


# ---------- Production Runtime Stage ----------
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/server.cjs ./server.cjs

RUN npm install --omit=dev --legacy-peer-deps

# Expose default HTTP port
EXPOSE 80

# Default Node command (Azure sets PORT automatically)
CMD ["node", "server.cjs"]
