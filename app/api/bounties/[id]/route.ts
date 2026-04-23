import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

function getRedisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const config = getRedisConfig();
    if (!config.url || !config.token) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const redis = new Redis(config);
    const id = params.id;
    
    const key = 'bounty:' + id;
    const data = await redis.get(key);
    
    if (!data) {
      return NextResponse.json({ error: 'Bounty not found', debugId: id }, { status: 404 });
    }
    
    const bounty = typeof data === 'string' ? JSON.parse(data) : data;
    return NextResponse.json({ bounty });
  } catch (error: any) {
    console.error('GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const { status, winnerBidId, workerFid, workerUsername } = body;
    const id = params.id;

    const config = getRedisConfig();
    if (!config.url || !config.token) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const redis = new Redis(config);
    
    const key = 'bounty:' + id;
    const data = await redis.get(key);
    
    if (!data) {
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }
    
    const bounty = typeof data === 'string' ? JSON.parse(data) : data;

    if (status) {
      bounty.status = status;
    }
    if (winnerBidId) {
      bounty.winnerBidId = winnerBidId;
      bounty.workerFid = workerFid;
      bounty.workerUsername = workerUsername;
      bounty.status = 'assigned';
    }
    bounty.updatedAt = Math.floor(Date.now() / 1000);

    await redis.set(key, JSON.stringify(bounty));

    return NextResponse.json({ bounty });
  } catch (error: any) {
    console.error('PATCH Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}