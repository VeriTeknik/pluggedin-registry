#!/bin/bash
# Run docker-compose with the root .env file

cd "$(dirname "$0")"
docker-compose --env-file ../.env up "$@"