import mongoose, { Schema, Document } from 'mongoose';
import { IPublisher, TrustLevel } from './types';

export interface IPublisherDocument extends IPublisher, Document {
  isVerifiedDomain(domain: string): boolean;
  isVerifiedOrg(org: string): boolean;
  canPublishServer(serverName: string): boolean;
}

const PublisherSchema = new Schema<IPublisherDocument>({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-zA-Z0-9_-]+$/,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  },
  verified_domains: {
    type: [String],
    default: [],
    validate: {
      validator: function(domains: string[]) {
        // Validate each domain format
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
        return domains.every(domain => domainRegex.test(domain));
      },
      message: 'Invalid domain format',
    },
  },
  github_orgs: {
    type: [String],
    default: [],
    validate: {
      validator: function(orgs: string[]) {
        // Validate GitHub org format
        const orgRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
        return orgs.every(org => orgRegex.test(org));
      },
      message: 'Invalid GitHub organization format',
    },
  },
  trust_level: {
    type: String,
    enum: Object.values(TrustLevel),
    default: TrustLevel.BASIC,
    index: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Indexes
PublisherSchema.index({ email: 1 });
PublisherSchema.index({ verified_domains: 1 });
PublisherSchema.index({ github_orgs: 1 });
PublisherSchema.index({ trust_level: 1 });

// Pre-save middleware
PublisherSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Update trust level based on verifications
  if (this.github_orgs.length > 0) {
    this.trust_level = TrustLevel.ORG_VERIFIED;
  } else if (this.verified_domains.length > 0) {
    this.trust_level = TrustLevel.DOMAIN_VERIFIED;
  } else {
    this.trust_level = TrustLevel.BASIC;
  }
  
  next();
});

// Methods
PublisherSchema.methods.isVerifiedDomain = function(domain: string): boolean {
  return this.verified_domains.includes(domain);
};

PublisherSchema.methods.isVerifiedOrg = function(org: string): boolean {
  return this.github_orgs.includes(org);
};

PublisherSchema.methods.canPublishServer = function(serverName: string): boolean {
  // Check if publisher can publish a server with given name
  // Format: io.domain.subdomain/package or io.github.org/repo
  
  if (this.trust_level === TrustLevel.SECURITY_AUDITED) {
    // Security audited publishers can publish anything
    return true;
  }
  
  const parts = serverName.split('/');
  if (parts.length !== 2) return false;
  
  const [namespace, _package] = parts;
  const namespaceParts = namespace.split('.');
  
  if (namespaceParts[0] !== 'io') return false;
  
  // Check GitHub org format: io.github.org
  if (namespaceParts[1] === 'github' && namespaceParts[2]) {
    return this.isVerifiedOrg(namespaceParts[2]);
  }
  
  // Check domain format: io.domain.subdomain
  if (namespaceParts.length >= 3) {
    // Reconstruct domain from namespace
    const domain = namespaceParts.slice(1).reverse().join('.');
    return this.isVerifiedDomain(domain);
  }
  
  return false;
};

// Statics
PublisherSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

PublisherSchema.statics.findByUsername = function(username: string) {
  return this.findOne({ username });
};

PublisherSchema.statics.findVerifiedPublishers = function(trustLevel?: TrustLevel) {
  const query: any = {};
  if (trustLevel) {
    query.trust_level = trustLevel;
  } else {
    query.trust_level = { $ne: TrustLevel.BASIC };
  }
  return this.find(query);
};

export const Publisher = mongoose.model<IPublisherDocument>('Publisher', PublisherSchema);