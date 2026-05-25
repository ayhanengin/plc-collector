FROM node:20-slim

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY src/ ./src/
COPY tsconfig.json ./

# Build
RUN npx tsc

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 4000

# Environment defaults
ENV PORT=4000
ENV DB_ENGINE=sqlite
ENV NODE_ENV=production

# Run
CMD ["node", "dist/index.js"]
