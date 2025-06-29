// MongoDB initialization script
// This script runs when the MongoDB container is first created

// Switch to the mcp-registry database
db = db.getSiblingDB('mcp-registry');

// Create collections with validation schemas
db.createCollection('servers', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'description', 'source', 'external_id'],
      properties: {
        name: {
          bsonType: 'string',
          description: 'Unique server identifier'
        },
        description: {
          bsonType: 'string',
          description: 'Server description'
        },
        source: {
          enum: ['PLUGGEDIN', 'SMITHERY', 'NPM', 'GITHUB', 'COMMUNITY'],
          description: 'Source of the server'
        },
        external_id: {
          bsonType: 'string',
          description: 'External identifier from source'
        },
        versions: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            required: ['version', 'release_date'],
            properties: {
              version: { bsonType: 'string' },
              release_date: { bsonType: 'date' },
              is_latest: { bsonType: 'bool' }
            }
          }
        },
        capabilities: {
          bsonType: 'object',
          properties: {
            tools: { bsonType: 'object' },
            resources: { bsonType: 'object' },
            prompts: { bsonType: 'object' }
          }
        },
        metadata: {
          bsonType: 'object',
          properties: {
            trust_score: { bsonType: 'number' },
            verified: { bsonType: 'bool' },
            github_stars: { bsonType: 'int' },
            download_count: { bsonType: 'int' }
          }
        }
      }
    }
  }
});

db.createCollection('publishers', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username', 'email'],
      properties: {
        username: {
          bsonType: 'string',
          description: 'Unique username'
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        verified_domains: {
          bsonType: 'array',
          items: { bsonType: 'string' }
        },
        github_orgs: {
          bsonType: 'array',
          items: { bsonType: 'string' }
        },
        trust_level: {
          enum: ['basic', 'domain_verified', 'org_verified', 'security_audited']
        }
      }
    }
  }
});

// Create indexes
db.servers.createIndex({ name: 1 }, { unique: true });
db.servers.createIndex({ source: 1, external_id: 1 }, { unique: true });
db.servers.createIndex({ 'metadata.trust_score': -1 });
db.servers.createIndex({ 'metadata.github_stars': -1 });
db.servers.createIndex({ 'metadata.download_count': -1 });
db.servers.createIndex({ 'repository.url': 1 });
db.servers.createIndex({ 'versions.is_latest': 1 });

db.publishers.createIndex({ username: 1 }, { unique: true });
db.publishers.createIndex({ email: 1 }, { unique: true });
db.publishers.createIndex({ verified_domains: 1 });
db.publishers.createIndex({ github_orgs: 1 });

print('MongoDB initialization completed');