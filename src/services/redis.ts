import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

let redisClient: RedisClientType;

export async function connectRedis(): Promise<void> {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  
  redisClient = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.error('Redis: Max reconnection attempts reached');
          return new Error('Max reconnection attempts reached');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });
  
  redisClient.on('error', (error) => {
    logger.error('Redis error:', error);
  });
  
  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });
  
  redisClient.on('reconnecting', () => {
    logger.warn('Redis reconnecting...');
  });
  
  try {
    await redisClient.connect();
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Failed to get cached data for key ${key}:`, error);
    return null;
  }
}

export async function setCachedData<T>(
  key: string,
  data: T,
  ttlSeconds?: number
): Promise<void> {
  try {
    const ttl = ttlSeconds || parseInt(process.env.REDIS_TTL_SECONDS || '3600');
    await redisClient.setEx(key, ttl, JSON.stringify(data));
  } catch (error) {
    logger.error(`Failed to set cached data for key ${key}:`, error);
  }
}

export async function deleteCachedData(pattern: string): Promise<void> {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    logger.error(`Failed to delete cached data for pattern ${pattern}:`, error);
  }
}