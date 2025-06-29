import { IMcpServerDocument } from '../models';
import { logger } from '../utils/logger';

interface RankingFactors {
  quality: number;
  popularity: number;
  maintenance: number;
  trust: number;
}

interface RankingWeights {
  quality: number;
  popularity: number;
  maintenance: number;
  trust: number;
}

export class RankingService {
  private weights: RankingWeights = {
    quality: 0.3,
    popularity: 0.2,
    maintenance: 0.25,
    trust: 0.25,
  };

  /**
   * Calculate overall ranking score for a server
   */
  calculateScore(server: IMcpServerDocument): number {
    const factors = this.calculateFactors(server);
    
    const score = 
      factors.quality * this.weights.quality +
      factors.popularity * this.weights.popularity +
      factors.maintenance * this.weights.maintenance +
      factors.trust * this.weights.trust;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate individual ranking factors
   */
  private calculateFactors(server: IMcpServerDocument): RankingFactors {
    return {
      quality: this.calculateQualityScore(server),
      popularity: this.calculatePopularityScore(server),
      maintenance: this.calculateMaintenanceScore(server),
      trust: this.calculateTrustScore(server),
    };
  }

  /**
   * Calculate quality score based on documentation, capabilities, etc.
   */
  private calculateQualityScore(server: IMcpServerDocument): number {
    let score = 0;
    const factors = {
      hasDescription: 0.2,
      descriptionLength: 0.2,
      hasRepository: 0.2,
      hasCapabilities: 0.2,
      hasVersions: 0.2,
    };

    // Has description
    if (server.description && server.description.length > 0) {
      score += factors.hasDescription;
      
      // Description quality (length-based)
      const descLength = server.description.length;
      if (descLength >= 100) {
        score += factors.descriptionLength;
      } else if (descLength >= 50) {
        score += factors.descriptionLength * 0.5;
      }
    }

    // Has repository info
    if (server.repository && server.repository.url) {
      score += factors.hasRepository;
    }

    // Has capabilities defined
    const capabilities = server.capabilities;
    if (capabilities) {
      const hasTools = capabilities.tools && Object.keys(capabilities.tools).length > 0;
      const hasResources = capabilities.resources && Object.keys(capabilities.resources).length > 0;
      const hasPrompts = capabilities.prompts && Object.keys(capabilities.prompts).length > 0;
      
      if (hasTools || hasResources || hasPrompts) {
        score += factors.hasCapabilities;
      }
    }

    // Has proper versioning
    if (server.versions && server.versions.length > 0) {
      score += factors.hasVersions;
    }

    return Math.min(score, 1); // Cap at 1
  }

  /**
   * Calculate popularity score based on stars, downloads, installations
   */
  private calculatePopularityScore(server: IMcpServerDocument): number {
    let score = 0;
    const metadata = server.metadata;

    // GitHub stars (logarithmic scale)
    if (metadata.github_stars) {
      const starScore = Math.log10(metadata.github_stars + 1) / 4; // 10k stars = 1.0
      score += Math.min(starScore, 0.4) * 0.4; // 40% weight
    }

    // Download count (logarithmic scale)
    if (metadata.download_count) {
      const downloadScore = Math.log10(metadata.download_count + 1) / 5; // 100k downloads = 1.0
      score += Math.min(downloadScore, 0.3) * 0.3; // 30% weight
    }

    // Installation count
    if (metadata.installation_count) {
      const installScore = Math.log10(metadata.installation_count + 1) / 3; // 1k installs = 1.0
      score += Math.min(installScore, 0.3) * 0.3; // 30% weight
    }

    return Math.min(score, 1);
  }

  /**
   * Calculate maintenance score based on update frequency, version history
   */
  private calculateMaintenanceScore(server: IMcpServerDocument): number {
    let score = 0;

    // Last updated (decay over time)
    const daysSinceUpdate = (Date.now() - server.updated_at.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate <= 30) {
      score += 0.4; // Updated within a month
    } else if (daysSinceUpdate <= 90) {
      score += 0.3; // Updated within 3 months
    } else if (daysSinceUpdate <= 180) {
      score += 0.2; // Updated within 6 months
    } else if (daysSinceUpdate <= 365) {
      score += 0.1; // Updated within a year
    }

    // Version count (indicates active development)
    const versionCount = server.versions.length;
    if (versionCount >= 10) {
      score += 0.3;
    } else if (versionCount >= 5) {
      score += 0.2;
    } else if (versionCount >= 2) {
      score += 0.1;
    }

    // Has recent version
    const latestVersion = server.getLatestVersion();
    if (latestVersion) {
      const daysSinceRelease = (Date.now() - latestVersion.release_date.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceRelease <= 30) {
        score += 0.3;
      } else if (daysSinceRelease <= 90) {
        score += 0.2;
      } else if (daysSinceRelease <= 180) {
        score += 0.1;
      }
    }

    return Math.min(score, 1);
  }

  /**
   * Calculate trust score based on verification, ratings, publisher
   */
  private calculateTrustScore(server: IMcpServerDocument): number {
    let score = 0;
    const metadata = server.metadata;

    // Verified status
    if (metadata.verified) {
      score += 0.4;
    }

    // User ratings
    if (metadata.rating && metadata.rating_count) {
      const ratingScore = (metadata.rating / 5) * Math.min(metadata.rating_count / 100, 1);
      score += ratingScore * 0.3; // 30% weight
    }

    // Server age (older = more trustworthy)
    const ageInDays = (Date.now() - server.created_at.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays >= 365) {
      score += 0.2; // Over a year old
    } else if (ageInDays >= 180) {
      score += 0.15; // Over 6 months
    } else if (ageInDays >= 90) {
      score += 0.1; // Over 3 months
    } else if (ageInDays >= 30) {
      score += 0.05; // Over a month
    }

    // Source trust (some sources are more trusted)
    const sourceTrust = {
      PLUGGEDIN: 0.1,
      SMITHERY: 0.08,
      NPM: 0.08,
      GITHUB: 0.06,
      COMMUNITY: 0.04,
    };
    score += sourceTrust[server.source] || 0;

    return Math.min(score, 1);
  }

  /**
   * Batch calculate and update trust scores
   */
  async updateTrustScores(servers: IMcpServerDocument[]): Promise<void> {
    logger.info(`Updating trust scores for ${servers.length} servers`);

    for (const server of servers) {
      try {
        const oldScore = server.metadata.trust_score;
        const newScore = server.calculateTrustScore();
        
        if (Math.abs(oldScore - newScore) > 0.01) {
          server.metadata.trust_score = newScore;
          await server.save();
          
          logger.debug(`Updated trust score for ${server.name}: ${oldScore} -> ${newScore}`);
        }
      } catch (error) {
        logger.error(`Failed to update trust score for ${server.name}:`, error);
      }
    }
  }

  /**
   * Get percentile rank for a server
   */
  async getPercentileRank(server: IMcpServerDocument, totalServers: number): Promise<number> {
    const score = this.calculateScore(server);
    
    // This is a simplified implementation
    // In production, you'd want to maintain a sorted index
    // or use Elasticsearch aggregations
    
    // Estimate based on score distribution
    const percentile = score * 100;
    return Math.round(percentile);
  }
}

// Export singleton instance
export const rankingService = new RankingService();