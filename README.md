# Plugged.in Registry Service

Advanced MCP (Model Context Protocol) registry and search service for the Plugged.in ecosystem.

## Overview

This microservice provides:
- 🔍 Advanced search with Elasticsearch
- 📊 Multi-factor ranking algorithm
- 🗄️ MongoDB-based registry storage
- ⚡ Redis caching for performance
- 🔐 Publisher verification system
- 🤖 AI-powered configuration extraction (planned)
- 🔗 GitHub integration for repository scanning

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client Apps   │────▶│   Registry API  │────▶│  Elasticsearch  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │    MongoDB      │     │      Redis      │
                        └─────────────────┘     └─────────────────┘
```

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+
- npm or pnpm

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/veriteknik/pluggedin-registry.git
cd pluggedin-registry
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Start Docker services:
```bash
cd docker
docker-compose up -d
```

4. Install dependencies:
```bash
npm install
```

5. Run development server:
```bash
npm run dev
```

The API will be available at http://localhost:3001

## API Endpoints

### Search
- `GET /api/v1/search` - Search MCP servers
- `GET /api/v1/search/suggestions` - Get search suggestions
- `GET /api/v1/search/facets` - Get available filters

### Registry
- `POST /api/v1/registry/publish` - Publish a new server
- `GET /api/v1/registry/servers/:id` - Get server details
- `PUT /api/v1/registry/servers/:id` - Update server
- `DELETE /api/v1/registry/servers/:id` - Delete server

### Verification
- `POST /api/v1/verify/domain` - Verify domain ownership
- `POST /api/v1/verify/github` - Verify GitHub organization
- `GET /api/v1/verify/status` - Check verification status

## Search Features

### Multi-factor Ranking
The search algorithm considers:
- **Quality** (30%): Documentation, capabilities, versioning
- **Popularity** (20%): Stars, downloads, installations
- **Maintenance** (25%): Update frequency, version history
- **Trust** (25%): Verification status, ratings, age

### Faceted Search
Filter by:
- Category (tools, resources, prompts)
- Source (PLUGGEDIN, SMITHERY, NPM, GITHUB, COMMUNITY)
- Verification status
- Tags

### Sorting Options
- Relevance (default)
- GitHub stars
- Download count
- User rating
- Last updated

## Development

### Project Structure
```
src/
├── api/          # API routes and controllers
├── models/       # MongoDB models
├── services/     # Business logic
├── middleware/   # Express middleware
└── utils/        # Utilities and helpers
```

### Testing
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Building
```bash
npm run build
```

## Docker Services

### MongoDB
- Port: 27017
- Database: mcp-registry
- Includes initialization script with indexes

### Elasticsearch
- Port: 9200
- Used for full-text search and aggregations

### Redis
- Port: 6379
- Used for caching search results

### Kibana (Development)
- Port: 5601
- Elasticsearch monitoring and debugging

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `MONGODB_URI` - MongoDB connection string
- `ELASTICSEARCH_URL` - Elasticsearch endpoint
- `REDIS_URL` - Redis connection string
- `PORT` - API server port
- `NODE_ENV` - Environment (development/production)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

Apache-2.0 License - see LICENSE file for details.