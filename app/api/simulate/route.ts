import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BOUNTY_PREFIX = 'BOUNTY |';
const BID_PREFIX = 'BID |';
const RESULT_PREFIX = 'RESULT |';
const ASSIGNED_PREFIX = 'ASSIGNED |';
const SETTLED_PREFIX = 'SETTLED |';

const SIGNER_UUID = process.env.BOUNTY_POSTER_SIGNER_UUID || '';

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ 
    url: process.env.UPSTASH_REDIS_REST_URL, 
    token: process.env.UPSTASH_REDIS_REST_TOKEN 
  });
}

function parseBountyCast(text: string): any | null {
  if (!text.startsWith(BOUNTY_PREFIX)) return null;
  try {
    const parts = text.slice(BOUNTY_PREFIX.length).split('|').map(s => s.trim());
    const result: any = {};
    for (const part of parts) {
      const [key, ...valueParts] = part.split(':').map(s => s.trim());
      if (key && valueParts.length > 0) {
        let value: any = valueParts.join(':').trim();
        if (key === 'reward') value = parseFloat(value.replace('USDC', '').trim()) || 0;
        result[key] = value;
      }
    }
    if (!result.id || !result.task) return null;
    return result;
  } catch { return null; }
}

function parseBidCast(text: string): any | null {
  if (!text.startsWith(BID_PREFIX)) return null;
  try {
    const parts = text.slice(BID_PREFIX.length).split('|').map(s => s.trim());
    const result: any = {};
    for (const part of parts) {
      const [key, ...valueParts] = part.split(':').map(s => s.trim());
      if (key && valueParts.length > 0) {
        const value = valueParts.join(':').trim();
        if (key === 'eta' || key === 'etaHours') {
          result.eta = value;
          result.etaHours = parseInt(value.replace('h', '')) || 0;
        } else {
          result[key] = value;
        }
      }
    }
    if (!result.bounty) return null;
    result.bountyId = result.bounty;
    return result;
  } catch { return null; }
}

function parseResultCast(text: string): any | null {
  if (!text.startsWith(RESULT_PREFIX)) return null;
  try {
    const parts = text.slice(RESULT_PREFIX.length).split('|').map(s => s.trim());
    const result: any = {};
    let outputParts: string[] = [];
    
    for (const part of parts) {
      if (part.startsWith('bounty:')) {
        result.bountyId = part.replace('bounty:', '').trim();
      } else if (part.startsWith('payment:')) {
        continue;
      } else if (result.bountyId) {
        outputParts.push(part);
      }
    }
    
    if (!result.bountyId) return null;
    result.output = outputParts.join(' | ').trim();
    return result;
  } catch { return null; }
}

async function processCast(text: string, authorFid: number, authorUsername: string, castHash: string): Promise<any> {
  const redis = await getRedis();
  if (!redis) return { error: 'Redis not configured' };

  const results: string[] = [];

  const bountyParsed = parseBountyCast(text);
  if (bountyParsed) {
    const existing = await redis.get(`bounty:${bountyParsed.id}`);
    if (!existing) {
      const bounty = {
        id: bountyParsed.id,
        task: bountyParsed.task,
        type: bountyParsed.type || 'custom',
        reward: bountyParsed.reward || 0,
        status: 'open',
        posterUsername: authorUsername,
        posterFid: authorFid,
        deadlineTs: Math.floor(Date.now() / 1000) + 86400 * 7,
        createdAt: Math.floor(Date.now() / 1000),
        castHash,
      };
      await redis.set(`bounty:${bounty.id}`, JSON.stringify(bounty));
      await redis.sadd('bounties:open', bounty.id);
      results.push(`Created bounty: ${bounty.id}`);
    }
  }

  const bidParsed = parseBidCast(text);
  if (bidParsed) {
    const bountyData = await redis.get(`bounty:${bidParsed.bountyId}`);
    if (bountyData) {
      const bounty = typeof bountyData === 'string' ? JSON.parse(bountyData) : bountyData;
      if (bounty.status === 'open') {
        const { nanoid } = await import('nanoid');
        const bidId = `bid_${nanoid(8)}`;
        const bid = {
          id: bidId,
          bountyId: bidParsed.bountyId,
          agentFid: authorFid,
          agentUsername: authorUsername,
          proposal: bidParsed.approach || `ETA: ${bidParsed.eta}`,
          priceUsdc: Math.round(bounty.reward * 0.9 * 100) / 100,
          status: 'pending',
          createdAt: Math.floor(Date.now() / 1000),
          castHash,
        };
        await redis.set(`bid:${bidId}`, JSON.stringify(bid));
        await redis.sadd(`bounty:${bidParsed.bountyId}:bids`, bidId);
        results.push(`Bid created: ${bidId}`);
        
        bounty.status = 'assigned';
        bounty.workerFid = authorFid;
        bounty.workerUsername = authorUsername;
        bounty.acceptedAt = Math.floor(Date.now() / 1000);
        await redis.set(`bounty:${bidParsed.bountyId}`, JSON.stringify(bounty));
        await redis.srem('bounties:open', bidParsed.bountyId);
        results.push(`Bounty assigned to @${authorUsername}`);
      }
    }
  }

  const resultParsed = parseResultCast(text);
  if (resultParsed) {
    const bountyData = await redis.get(`bounty:${resultParsed.bountyId}`);
    if (bountyData) {
      const bounty = typeof bountyData === 'string' ? JSON.parse(bountyData) : bountyData;
      if (bounty.status === 'assigned' && authorFid === bounty.workerFid) {
        bounty.status = 'completed';
        bounty.result = resultParsed.output;
        bounty.completedAt = Math.floor(Date.now() / 1000);
        await redis.set(`bounty:${resultParsed.bountyId}`, JSON.stringify(bounty));
        results.push(`Work completed`);
        
        setTimeout(async () => {
          const r = await getRedis();
          if (r) {
            const bData = await r.get(`bounty:${resultParsed.bountyId}`);
            if (bData) {
              const b = typeof bData === 'string' ? JSON.parse(bData) : bData;
              b.status = 'settled';
              b.settledAt = Math.floor(Date.now() / 1000);
              await r.set(`bounty:${resultParsed.bountyId}`, JSON.stringify(b));
            }
          }
        }, 2000);
        
        results.push(`Payment settled: ${bounty.reward} USDC`);
      }
    }
  }

  return { success: true, actions: results };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { castText, authorFid = 12345, authorUsername = 'demo_user' } = body;

    if (!castText) {
      return NextResponse.json({ error: 'castText required' }, { status: 400 });
    }

    const hash = `sim_${Date.now()}`;
    const result = await processCast(castText, authorFid, authorUsername, hash);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[api/simulate-cast] Error:', error);
    return NextResponse.json({ error: 'Failed to simulate cast' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Simulate Cast API - Test the bounty workflow',
    usage: {
      method: 'POST',
      body: {
        castText: 'BOUNTY | id: test_001 | task: Translate hello to Spanish | type: translate | reward: 1 USDC',
        authorFid: 12345,
        authorUsername: 'demo_user'
      }
    },
    supportedFormats: [
      'BOUNTY | id: <id> | task: <desc> | type: <type> | reward: <X> USDC',
      'BID | bounty: <id> | agent: @<user> | eta: 1h | approach: <desc>',
      'RESULT | bounty: <id> | <output> | payment: @abb',
    ]
  });
}