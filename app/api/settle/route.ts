import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
}

async function getBountyFromRedis(id: string, redis: any): Promise<any | null> {
  try {
    const data = await redis.get(`bounty:${id}`);
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  } catch (e) {
    console.error('[settle] getBountyFromRedis error:', e);
    return null;
  }
}

async function updateBountyInRedis(bounty: any, redis: any): Promise<void> {
  try {
    await redis.set(`bounty:${bounty.id}`, JSON.stringify(bounty));
  } catch (e) {
    console.error('[settle] updateBountyInRedis error:', e);
    throw e;
  }
}

async function updateAgentStats(agentFid: number, amountUsdc: number, redis: any): Promise<void> {
  try {
    await redis.hincrby(`agent:stats:${agentFid}`, 'tasksCompleted', 1);
    await redis.hincrbyfloat(`agent:stats:${agentFid}`, 'totalEarnedUsdc', amountUsdc);
  } catch (e) {
    console.error('[settle] updateAgentStats error:', e);
  }
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    console.error('[settle] Failed to parse JSON:', e);
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { bountyId, resultUrl } = body;
  console.log('[settle] Request:', { bountyId, resultUrl });

  try {
    if (!bountyId) {
      return NextResponse.json({ error: 'bountyId required' }, { status: 400 });
    }

    const redis = await getRedis();
    if (!redis) {
      console.error('[settle] Redis not configured');
      return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
    }

    const bounty = await getBountyFromRedis(bountyId, redis);
    if (!bounty) {
      console.error('[settle] Bounty not found:', bountyId);
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }

    console.log('[settle] Bounty found:', bounty);

    if (bounty.status !== 'assigned') {
      console.error('[settle] Wrong status:', bounty.status);
      return NextResponse.json({ error: 'Bounty must be assigned before completing' }, { status: 400 });
    }

    if (!bounty.workerFid) {
      console.error('[settle] No workerFid on bounty:', bounty);
      return NextResponse.json({ error: 'Bounty has no worker assigned' }, { status: 400 });
    }

    const rewardAmount = bounty.reward || bounty.rewardUsdc || 0;
    
    bounty.status = 'settled';
    bounty.resultUrl = resultUrl || '';
    bounty.paidAmountUsdc = rewardAmount;
    bounty.settledAt = Math.floor(Date.now() / 1000);
    
    await updateBountyInRedis(bounty, redis);
    await updateAgentStats(bounty.workerFid, rewardAmount, redis);

    return NextResponse.json({ 
      bounty,
      message: 'Bounty completed successfully',
    });
  } catch (error: any) {
    console.error('[settle] POST error:', error);
    const message = error?.message || 'Failed to complete bounty';
    return NextResponse.json({ error: message, details: error?.toString() }, { status: 500 });
  }
}