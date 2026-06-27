FROM node:20-slim

WORKDIR /app

# Install system dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy server files
COPY server/ ./server/

# Create data directory for SQLite
RUN mkdir -p ./data

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "--import", "tsx", "server/index.ts"]
