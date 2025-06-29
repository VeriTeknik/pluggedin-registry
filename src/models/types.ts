// Type definitions for MCP Registry models

export enum McpServerSource {
  PLUGGEDIN = 'PLUGGEDIN',
  SMITHERY = 'SMITHERY',
  NPM = 'NPM',
  GITHUB = 'GITHUB',
  COMMUNITY = 'COMMUNITY',
}

export enum TrustLevel {
  BASIC = 'basic',
  DOMAIN_VERIFIED = 'domain_verified',
  ORG_VERIFIED = 'org_verified',
  SECURITY_AUDITED = 'security_audited',
}

export enum PackageRegistry {
  NPM = 'npm',
  DOCKER = 'docker',
  PYPI = 'pypi',
}

export interface IServerVersion {
  version: string;
  release_date: Date;
  is_latest: boolean;
  changelog?: string;
  packages?: IPackageInfo[];
}

export interface IPackageInfo {
  registry_name: PackageRegistry;
  name: string;
  version: string;
  package_arguments?: string[];
  environment_variables?: Record<string, string>;
}

export interface IRepository {
  url: string;
  source: 'github' | 'gitlab' | 'bitbucket';
  id: string;
  default_branch?: string;
}

export interface ICapabilities {
  tools?: Record<string, any>;
  resources?: Record<string, any>;
  prompts?: Record<string, any>;
  logging?: Record<string, any>;
}

export interface IServerMetadata {
  trust_score: number;
  verified: boolean;
  github_stars?: number;
  download_count?: number;
  install_count?: number;
  last_crawled?: Date;
  last_updated?: Date;
  last_scanned?: Date;
  installation_count?: number;
  rating?: number;
  rating_count?: number;
  tags?: string[];
  category?: string;
  ai_extraction?: {
    confidence_score: number;
    extracted_at: Date;
    source_files: string[];
    raw_config?: any;
  };
}

export interface IPublisher {
  username: string;
  email: string;
  verified_domains: string[];
  github_orgs: string[];
  trust_level: TrustLevel;
  created_at: Date;
  updated_at: Date;
}

export interface IMcpServer {
  name: string;
  description: string;
  source: McpServerSource;
  external_id: string;
  publisher_id?: string;
  claimed_by?: string;
  claimed_at?: Date;
  versions: IServerVersion[];
  repository?: IRepository;
  capabilities: ICapabilities;
  metadata: IServerMetadata;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  created_at: Date;
  updated_at: Date;
}