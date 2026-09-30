import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { config } from '../config/env';

/**
 * Idempotency Middleware
 * 
 * Critical Behaviour: Preventing accidental duplicate operations
 * 
 * When a client sends an Idempotency-Key header, this middleware:
 * 1. Checks if we've already processed a request with this key
 * 2. If yes, returns the cached response (preventing duplicate execution)
 * 3. If no, processes the request and caches the response
 * 
 * This prevents: double-claiming, double-commenting, duplicate status changes
 * when a user clicks a button twice or retries after a network timeout.
 */
export const idempotency = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Only apply to state-changing methods
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }

  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  // If no key provided, proceed normally (not all requests need idempotency)
  if (!idempotencyKey) {
    next();
    return;
  }

  const cacheKey = `idempotency:${idempotencyKey}`;

  try {
    // Check if this key was already processed
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      const cachedResponse = JSON.parse(cached);
      console.log(`[Idempotency] Returning cached response for key: ${idempotencyKey}`);
      res.status(cachedResponse.statusCode).json(cachedResponse.body);
      return;
    }

    // Mark as in-progress (prevent concurrent duplicate processing)
    const acquired = await redis.set(
      `${cacheKey}:lock`,
      'processing',
      'EX',
      30, // Lock expires in 30 seconds
      'NX' // Only set if not exists
    );

    if (!acquired) {
      // Another request with the same key is currently being processed
      res.status(409).json({
        error: 'Request is currently being processed',
        code: 'DUPLICATE_IN_PROGRESS',
        idempotencyKey,
      });
      return;
    }

    // Override res.json to capture the response and cache it
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Cache the response
      const ttlSeconds = config.IDEMPOTENCY_TTL_HOURS * 3600;
      const cacheData = JSON.stringify({
        statusCode: res.statusCode,
        body,
      });
      
      redis.set(cacheKey, cacheData, 'EX', ttlSeconds).catch((err) => {
        console.error('[Idempotency] Failed to cache response:', err);
      });

      // Remove the lock
      redis.del(`${cacheKey}:lock`).catch(() => {});

      return originalJson(body);
    };

    next();
  } catch (error) {
    // If Redis is down, proceed without idempotency (graceful degradation)
    console.warn('[Idempotency] Redis error, proceeding without idempotency:', error);
    next();
  }
};
