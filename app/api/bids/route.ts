import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function listBidsFromRedis(bountyId: string): Promise<any[]> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) return [];
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: redisUrl, token: redisToken });
    const ids = await redis.smembers(`bounty:${bountyId}:bids`);
    const bids: any[] = [];
    for (const id of ids) {
      const data = await redis.get(`bid:${id}`);
      if (data) {
        // Upstash Redis auto-parses JSON, data is already an object
        if (typeof data === 'object') {
          bids.push(data);
        } else {
          bids.push(JSON.parse(data as string));
        }
      }
    }
    return bids.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch (error) {
    console.error('[api/bids] Redis error:', error);
    return [];
  }
}

async function createBidInRedis(bid: any): Promise<void> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) return;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: redisUrl, token: redisToken });
    await redis.set(`bid:${bid.id}`, JSON.stringify(bid));
    await redis.sadd(`bounty:${bid.bountyId}:bids`, bid.id);
    await redis.incr(`bounty:${bid.bountyId}:bidCount`);
  } catch (error) {
    console.error('[api/bids] createBid error:', error);
  }
}

async function acceptBidInRedis(bidId: string, bountyId: string, workerFid: number, workerUsername: string): Promise<any> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: redisUrl, token: redisToken });
    
    const bidData = await redis.get(`bid:${bidId}`);
    const bid = typeof bidData === 'string' ? JSON.parse(bidData) : bidData;
    if (!bid) return null;
    
    bid.status = 'accepted';
    bid.acceptedAt = Math.floor(Date.now() / 1000);
    await redis.set(`bid:${bidId}`, JSON.stringify(bid));
    
    const bountyKey = `bounty:${bountyId}`;
    const bountyData = await redis.get(bountyKey);
    const bounty = typeof bountyData === 'string' ? JSON.parse(bountyData) : bountyData;
    if (bounty) {
      bounty.status = 'assigned';
      bounty.workerFid = workerFid;
      bounty.workerUsername = workerUsername;
      bounty.winnerBidId = bidId;
      bounty.acceptedAt = Math.floor(Date.now() / 1000);
      await redis.set(bountyKey, JSON.stringify(bounty));
      return bounty;
    }
    return null;
  } catch (error) {
    console.error('[api/bids] acceptBid error:', error);
    return null;
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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { bidId, status, bountyId, workerFid, workerUsername } = body;

    if (!bidId || !status || !bountyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (status === 'accepted') {
      const bounty = await acceptBidInRedis(bidId, bountyId, workerFid, workerUsername);
      if (!bounty) {
        return NextResponse.json({ error: 'Failed to accept bid' }, { status: 500 });
      }
      return NextResponse.json({ bounty, success: true });
    }

    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  } catch (error) {
    console.error('[api/bids] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update bid' }, { status: 500 });
  }
}