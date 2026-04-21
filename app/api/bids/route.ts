import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function listBidsFromRedis(bountyId: string): Promise<any[]> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return [];
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    const ids = await redis.smembers(`bounty:${bountyId}:bids`);
    const bids: any[] = [];
    for (const id of ids) {
      const data = await redis.get(`bid:${id}`);
      if (data) bids.push(JSON.parse(data as string));
    }
    return bids.sort((a, b) => a.createdAt - b.createdAt);
  } catch (error) {
    console.error('[api/bids] Redis error:', error);
    return [];
  }
}

async function createBidInRedis(bid: any): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    await redis.set(`bid:${bid.id}`, JSON.stringify(bid));
    await redis.sadd(`bounty:${bid.bountyId}:bids`, bid.id);
    await redis.incr(`bounty:${bid.bountyId}:bidCount`);
  } catch (error) {
    console.error('[api/bids] createBid error:', error);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bountyId = searchParams.get('bountyId');

  if (!bountyId) {
    return NextResponse.json({ error: 'bountyId required' }, { status: 400 });
  }

  const bids = await listBidsFromRedis(bountyId);
  return NextResponse.json({ bids });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bountyId, agentFid, agentUsername, proposal, priceUsdc } = body;

    if (!bountyId || !agentFid || !agentUsername || !proposal || !priceUsdc) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { nanoid } = await import('nanoid');
    const id = `bid_${nanoid(8)}`;

    const newBid = {
      id,
      bountyId,
      agentFid,
      agentUsername,
      proposal,
      priceUsdc,
      status: 'pending',
      createdAt: Math.floor(Date.now() / 1000),
    };

    await createBidInRedis(newBid);

    return NextResponse.json({ bid: newBid });
  } catch (error) {
    console.error('[api/bids] POST error:', error);
    return NextResponse.json({ error: 'Failed to create bid' }, { status: 500 });
  }
}