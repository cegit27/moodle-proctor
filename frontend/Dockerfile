# ============================================================================
# Frontend Dockerfile (Next.js)
# Multi-stage build for production optimization
# ============================================================================

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built application from builder stage
    # Removed: COPY --from=builder /app/public ./public (no public/ dir exists)
    COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
    COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static

USER nodejs

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]