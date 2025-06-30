# Build stage
FROM node:20-alpine AS builder

# Add labels for proper identification
LABEL maintainer="VeriTeknik"
LABEL description="Plugged.in Registry - MCP Server Registry Service"
LABEL version="1.0.0"

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:20-slim AS production

# Add labels for proper identification
LABEL maintainer="VeriTeknik"
LABEL description="Plugged.in Registry - MCP Server Registry Service"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="pluggedin-registry"
LABEL org.opencontainers.image.description="MCP Server Registry for Plugged.in Platform"
LABEL org.opencontainers.image.vendor="VeriTeknik"
LABEL org.opencontainers.image.url="https://plugged.in"
LABEL org.opencontainers.image.source="https://github.com/veriteknik/pluggedin-registry"

WORKDIR /app

# Install dumb-init for proper signal handling and Python for AI extraction  
# Add build dependencies for torch and other scientific packages
RUN apt-get update && apt-get install -y \
    dumb-init \
    python3 \
    python3-pip \
    python3-dev \
    python3-venv \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy Python scripts and requirements
COPY requirements.txt ./
COPY src/scripts/extract_config.py ./dist/scripts/

# Install Python dependencies with virtual environment
# Use a larger timeout for large packages like torch
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install --no-cache-dir --timeout 600 -r requirements.txt

# Add virtual environment to PATH
ENV PATH="/opt/venv/bin:$PATH"

# Create logs directory
RUN mkdir -p logs && chown -R nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]