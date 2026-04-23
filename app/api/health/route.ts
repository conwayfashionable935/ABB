import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, any> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };

  if (process.env.UPSTASH_REDIS_REST_URL) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL?.trim() || '',
        token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || '',
      });
      
      await redis.ping();
      checks.redis = 'connected';
    } catch (err: any) {
      checks.redis = 'error';
      checks.redisError = err?.message || String(err);
    }
  } else {
    checks.redis = 'not configured';
  }

  let allOk = Object.values(checks).every(v => v === 'ok' || v === 'connected' || v === 'not configured');

  return NextResponse.json(checks, {
    status: allOk ? 200 : 503,
  });
}