# ============================================================================
# Moodle-Proctor Backend Dockerfile
# Multi-stage build for production optimization
# ============================================================================

# ----------------------------------------------------------------------------
# Build stage
# ----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# mediasoup may need to build worker binaries in-container when prebuilt
# artifacts are not compatible with host kernel/glibc.
RUN apk add --no-cache python3 py3-pip make g++ && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ----------------------------------------------------------------------------
# Production stage
# ----------------------------------------------------------------------------
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init wget

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Create directories
RUN mkdir -p /app/logs /app/uploads && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
