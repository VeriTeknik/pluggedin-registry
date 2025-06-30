# Plugged.in Registry Service

Advanced MCP (Model Context Protocol) registry and search service for the Plugged.in ecosystem.

## Overview

This microservice provides:
- 🔍 Advanced search with Elasticsearch
- 📊 Multi-factor ranking algorithm
- 🗄️ MongoDB-based registry storage
- ⚡ Redis caching for performance
- 🔐 Server claiming and ownership system
- 🌐 Hybrid public/private API architecture
- 🤖 AI-powered configuration extraction with OpenAI
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
- Python 3.8+ (for AI extraction features)

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

4. Install Node.js dependencies:
```bash
npm install
```

5. Set up Python environment for AI extraction:
```bash
# Create a Python virtual environment
python3 -m venv venv

# Activate the virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

6. Run development server:
```bash
npm run dev
```

The API will be available at http://localhost:3001

## API Endpoints

### Public Endpoints (No Authentication Required)

#### Search
- `GET /api/v1/search` - Search MCP servers

#### Discover
- `GET /api/v1/discover/featured` - Get featured servers
- `GET /api/v1/discover/trending` - Get trending servers
- `GET /api/v1/discover/recent` - Get recently added servers
- `GET /api/v1/discover/categories` - Get server categories
- `GET /api/v1/discover/stats` - Get registry statistics

#### Servers
- `GET /api/v1/servers/:id` - Get server details
- `GET /api/v1/servers` - List recent servers

### Internal Endpoints (Authentication Required)

All internal endpoints require:
- `x-api-key` header with the internal API key
- `x-user-id` header with the user ID from pluggedin-app

#### Registry Management
- `POST /api/v1/internal/registry/publish` - Publish a new server
- `PUT /api/v1/internal/registry/:id` - Update a server
- `DELETE /api/v1/internal/registry/:id` - Delete a server
- `POST /api/v1/internal/registry/:id/version` - Add a new version

#### Server Claiming
- `GET /api/v1/internal/claim/unclaimed` - Get unclaimed servers
- `GET /api/v1/internal/claim/my-servers` - Get servers claimed by user
- `POST /api/v1/internal/claim/:id` - Claim a server
- `DELETE /api/v1/internal/claim/:id` - Unclaim a server

#### Verification
- `POST /api/v1/internal/verify/github` - Verify GitHub repository
- `POST /api/v1/internal/verify/npm` - Verify NPM package

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

## AI-Powered Extraction

The registry includes AI-powered configuration extraction for GitHub repositories that don't have explicit MCP configuration files.

### How it works:
1. Scans repository for `.mcp.json` or `.well-known/mcp.json`
2. If not found, uses AI to analyze README and package.json
3. Extracts configuration using OpenAI GPT-4
4. Provides confidence scores and warnings

### Python Setup:
The AI extraction requires Python dependencies to be installed:

```bash
# Ensure Python virtual environment is activated
source venv/bin/activate  # On macOS/Linux

# Required environment variable
export OPENAI_API_KEY="your-openai-api-key"
```

### Testing AI Extraction:
```bash
# Test the extraction script directly
python src/scripts/extract_config.py --readme /path/to/README.md --package-json /path/to/package.json
```

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
- `OPENAI_API_KEY` - OpenAI API key for AI extraction
- `GITHUB_APP_ID` - GitHub App ID for repository access
- `GITHUB_APP_PRIVATE_KEY` - Base64 encoded GitHub App private key
- `INTERNAL_API_KEY` - API key for internal endpoints

## Troubleshooting

### Python/AI Extraction Issues

1. **ModuleNotFoundError: No module named 'contextgem'**
   - Make sure you've activated the virtual environment: `source venv/bin/activate`
   - Install dependencies: `pip install -r requirements.txt`

2. **OpenAI API errors**
   - Verify your `OPENAI_API_KEY` is set in the `.env` file
   - Check your OpenAI account has credits/valid subscription

3. **Slow AI extraction (30-45 seconds)**
   - This is normal on first run as contextgem loads the sentence segmentation model
   - Subsequent runs will be faster due to caching

### Docker Issues

1. **Services won't start**
   - Check all required environment variables are in `.env`
   - Ensure ports 3001, 27017, 9200, 6379 are not in use

2. **Elasticsearch memory errors**
   - Adjust `ES_JAVA_OPTS` in `.env` (e.g., `-Xms256m -Xmx256m` for lower memory)

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

Apache-2.0 License - see LICENSE file for details.