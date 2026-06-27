FROM node:20-alpine

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/

# Copy public files
COPY public/ ./public/

# Create config directory
RUN mkdir -p /root/.onyx-agent/logs

# Expose UI port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/status || exit 1

# Start agent
CMD ["node", "dist/index.js", "start"]
