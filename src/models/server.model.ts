import mongoose, { Schema, Document } from 'mongoose';
import {
  IMcpServer,
  McpServerSource,
  PackageRegistry,
  IServerVersion,
  IPackageInfo,
  IRepository,
  ICapabilities,
  IServerMetadata,
} from './types';

export interface IMcpServerDocument extends IMcpServer, Document {
  getLatestVersion(): IServerVersion | undefined;
  addVersion(version: IServerVersion): void;
  calculateTrustScore(): number;
}

const PackageInfoSchema = new Schema<IPackageInfo>({
  registry_name: {
    type: String,
    enum: Object.values(PackageRegistry),
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  version: {
    type: String,
    required: true,
  },
  package_arguments: [String],
  environment_variables: {
    type: Map,
    of: String,
  },
});

const ServerVersionSchema = new Schema<IServerVersion>({
  version: {
    type: String,
    required: true,
  },
  release_date: {
    type: Date,
    required: true,
  },
  is_latest: {
    type: Boolean,
    default: false,
  },
  changelog: String,
  packages: [PackageInfoSchema],
});

const RepositorySchema = new Schema<IRepository>({
  url: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    enum: ['github', 'gitlab', 'bitbucket'],
    required: true,
  },
  id: {
    type: String,
    required: true,
  },
  default_branch: String,
});

const CapabilitiesSchema = new Schema<ICapabilities>({
  tools: {
    type: Map,
    of: Schema.Types.Mixed,
  },
  resources: {
    type: Map,
    of: Schema.Types.Mixed,
  },
  prompts: {
    type: Map,
    of: Schema.Types.Mixed,
  },
  logging: {
    type: Map,
    of: Schema.Types.Mixed,
  },
});

const ServerMetadataSchema = new Schema<IServerMetadata>({
  trust_score: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  github_stars: Number,
  download_count: Number,
  last_crawled: Date,
  last_scanned: Date,
  installation_count: {
    type: Number,
    default: 0,
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
  },
  rating_count: {
    type: Number,
    default: 0,
  },
  tags: [String],
  category: String,
  ai_extraction: {
    confidence_score: {
      type: Number,
      min: 0,
      max: 1,
    },
    extracted_at: Date,
    source_files: [String],
    raw_config: Schema.Types.Mixed,
  },
});

const McpServerSchema = new Schema<IMcpServerDocument>({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  description: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    enum: Object.values(McpServerSource),
    required: true,
    index: true,
  },
  external_id: {
    type: String,
    required: true,
  },
  publisher_id: {
    type: Schema.Types.ObjectId,
    ref: 'Publisher',
  },
  claimed_by: {
    type: String, // pluggedin-app user ID
    index: true,
  },
  claimed_at: Date,
  versions: {
    type: [ServerVersionSchema],
    required: true,
    validate: {
      validator: function(versions: IServerVersion[]) {
        // Ensure at least one version exists
        if (versions.length === 0) return false;
        // Ensure only one version is marked as latest
        const latestCount = versions.filter(v => v.is_latest).length;
        return latestCount === 1;
      },
      message: 'Must have exactly one version marked as latest',
    },
  },
  repository: RepositorySchema,
  capabilities: {
    type: CapabilitiesSchema,
    required: true,
  },
  metadata: {
    type: ServerMetadataSchema,
    required: true,
  },
  command: String,
  args: [String],
  env: {
    type: Map,
    of: String,
  },
  url: String,
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for unique source + external_id
McpServerSchema.index({ source: 1, external_id: 1 }, { unique: true });

// Indexes for search and filtering
McpServerSchema.index({ 'metadata.trust_score': -1 });
McpServerSchema.index({ 'metadata.github_stars': -1 });
McpServerSchema.index({ 'metadata.download_count': -1 });
McpServerSchema.index({ 'metadata.rating': -1 });
McpServerSchema.index({ 'metadata.tags': 1 });
McpServerSchema.index({ 'metadata.category': 1 });
McpServerSchema.index({ 'repository.url': 1 });
McpServerSchema.index({ 'versions.is_latest': 1 });
McpServerSchema.index({ updated_at: -1 });

// Text index for search
McpServerSchema.index({
  name: 'text',
  description: 'text',
  'metadata.tags': 'text',
});

// Pre-save middleware to update timestamp
McpServerSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Methods
McpServerSchema.methods.getLatestVersion = function(): IServerVersion | undefined {
  return this.versions.find((v: IServerVersion) => v.is_latest);
};

McpServerSchema.methods.addVersion = function(version: IServerVersion): void {
  // Mark all existing versions as not latest
  this.versions.forEach((v: IServerVersion) => {
    v.is_latest = false;
  });
  // Add new version as latest
  version.is_latest = true;
  this.versions.push(version);
};

McpServerSchema.methods.calculateTrustScore = function(): number {
  let score = 0;
  const weights = {
    verified: 0.2,
    github_stars: 0.2,
    download_count: 0.2,
    rating: 0.2,
    age: 0.2,
  };

  if (this.metadata.verified) score += weights.verified;
  
  if (this.metadata.github_stars) {
    const starScore = Math.min(this.metadata.github_stars / 1000, 1);
    score += starScore * weights.github_stars;
  }
  
  if (this.metadata.download_count) {
    const downloadScore = Math.min(this.metadata.download_count / 10000, 1);
    score += downloadScore * weights.download_count;
  }
  
  if (this.metadata.rating && this.metadata.rating_count) {
    const ratingScore = (this.metadata.rating / 5) * Math.min(this.metadata.rating_count / 100, 1);
    score += ratingScore * weights.rating;
  }
  
  // Age score (older servers are more trusted)
  const ageInDays = (Date.now() - this.created_at.getTime()) / (1000 * 60 * 60 * 24);
  const ageScore = Math.min(ageInDays / 365, 1); // Max score at 1 year
  score += ageScore * weights.age;

  return Math.round(score * 100) / 100; // Round to 2 decimal places
};

export const McpServer = mongoose.model<IMcpServerDocument>('McpServer', McpServerSchema);