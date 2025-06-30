# Docker Setup for Plugged.in Registry

This directory contains Docker configuration for running the Plugged.in Registry with all its dependencies.

## Prerequisites

- Docker and Docker Compose installed
- `.env` file in the project root (copy from `.env.example`)

## Quick Start

1. Make sure you have a `.env` file in the project root with all required environment variables
2. Run the services:

```bash
# Start all services
./docker-up.sh

# Or with specific options
./docker-up.sh -d  # Run in detached mode
./docker-up.sh --build  # Rebuild the API image

# Stop all services
./docker-down.sh

# Stop and remove volumes
./docker-down.sh -v
```

## Services

- **registry-api**: The main API service (port 3001)
- **mongodb**: Database (port 27017)
- **elasticsearch**: Search engine (port 9200)
- **redis**: Cache (port 6379)
- **kibana**: Elasticsearch UI (port 5601)

## Environment Variables

The docker-compose.yml uses environment variables from the root `.env` file. Key variables include:

- `OPENAI_API_KEY`: Required for AI extraction features
- `INTERNAL_API_KEY`: For internal API authentication
- `NODE_ENV`: Development/production mode
- `PORT`: API port (default: 3001)

## Manual Docker Compose Commands

If you prefer to run docker-compose manually:

```bash
# From the docker directory, use the root .env file
docker-compose --env-file ../.env up

# Or from the project root
docker-compose -f docker/docker-compose.yml up
```

## Troubleshooting

- If services fail to start, check that all required environment variables are set in your `.env` file
- For Elasticsearch memory issues, adjust `ES_JAVA_OPTS` in your `.env` file
- MongoDB initialization scripts are in `mongo-init.js`