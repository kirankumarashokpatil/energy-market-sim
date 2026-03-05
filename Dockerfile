## Multi-stage Dockerfile for GridForge (Vite + React)
## - Stage 1: Install deps, run tests, build static assets
## - Stage 2: Serve built app with nginx

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
FROM nginx:1.27-alpine AS runner

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose default HTTP port
EXPOSE 80

# Default nginx command
CMD ["nginx", "-g", "daemon off;"]

