#!/bin/bash
# Stop docker-compose with the root .env file

cd "$(dirname "$0")"
docker-compose --env-file ../.env down "$@"