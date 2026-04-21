import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getAgentStatsFromRedis(fid: number): Promise<any> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    const stats = await redis.hgetall(`agent:stats:${fid}`);
    return stats;
  } catch (error) {
    console.error(`[api/agents] Redis error for FID ${fid}:`, error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { checkRateLimit, getRateLimitHeaders } = await import('../../lib/rate-limit');
  const rateLimit = await checkRateLimit('/api/agents');
  
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return NextResponse.json({ agents: [] });
  }

  return NextResponse.json({ agents: [] });
}
