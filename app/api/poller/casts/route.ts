import { NextRequest, NextResponse } from 'next/server';

const BOUNTY_PREFIX = 'BOUNTY |';
const BID_PREFIX = 'BID |';
const RESULT_PREFIX = 'RESULT |';
const ASSIGNED_PREFIX = 'ASSIGNED |';
const SETTLED_PREFIX = 'SETTLED |';

const SIGNER_UUID = process.env.BOUNTY_POSTER_SIGNER_UUID || '';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

interface Cast {
  hash: string;
  text: string;
  author: {
    fid: number;
    username: string;
  };
  parent_hash?: string;
  timestamp: string;
}

async function searchCasts(query: string, limit = 25): Promise<Cast[]> {
  if (!NEYNAR_API_KEY) return [];
  
  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/cast/search?q=${encodeURIComponent(query)}&limit=${limit}&sort=chronological`,
      {
        headers: { 'x-api-key': NEYNAR_API_KEY },
      }
    );
    const data = await res.json();
    return data.casts || [];
  } catch (e) {
    console.error('[cast-poller] searchCasts error:', e);
    return [];
  }
}

async function postCast(text: string, replyTo?: string): Promise<string | null> {
  if (!NEYNAR_API_KEY || !SIGNER_UUID) {
    console.log('[cast-poller] No signer, skipping cast post');
    return null;
  }
  
  try {
    const { NeynarAPIClient, Configuration } = await import('@neynar/nodejs-sdk');
    const client = new NeynarAPIClient(new Configuration({ apiKey: NEYNAR_API_KEY }));
    
    const result = await client.publishCast({
      signerUuid: SIGNER_UUID,
      text,
      parent: replyTo,
    });
    
    return (result as any)?.success ? `cast_${Date.now()}` : null;
  } catch (e) {
    console.error('[cast-poller] postCast error:', e);
    return null;
  }
}

async function getRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({ 
    url: process.env.UPSTASH_REDIS_REST_URL, 
    token: process.env.UPSTASH_REDIS_REST_TOKEN 
  });
}

async function getBountyFromRedis(id: string, redis: any): Promise<any | null> {
  const data = await redis.get(`bounty:${id}`);
  return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
}

async function saveBountyToRedis(bounty: any, redis: any): Promise<void> {
  await redis.set(`bounty:${bounty.id}`, JSON.stringify(bounty));
  await redis.sadd('bounties:open', bounty.id);
}

async function saveBidToRedis(bid: any, redis: any): Promise<void> {
  await redis.set(`bid:${bid.id}`, JSON.stringify(bid));
  await redis.sadd(`bounty:${bid.bountyId}:bids`, bid.id);
  await redis.incr(`bounty:${bid.bountyId}:bidCount`);
}

async function updateBountyStatus(id: string, status: string, extra: Record<string, any> = {}, redis: any): Promise<void> {
  const bounty = await getBountyFromRedis(id, redis);
  if (!bounty) return;
  
  const updated = { ...bounty, status, ...extra, updatedAt: Math.floor(Date.now() / 1000) };
  await redis.set(`bounty:${id}`, JSON.stringify(updated));
  
  if (status === 'open') {
    await redis.sadd('bounties:open', id);
  } else {
    await redis.srem('bounties:open', id);
  }
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

function parseAssignedCast(text: string): any | null {
  if (!text.startsWith(ASSIGNED_PREFIX)) return null;
  try {
    const parts = text.slice(ASSIGNED_PREFIX.length).split('|').map(s => s.trim());
    const result: any = {};
    for (const part of parts) {
      const [key, ...valueParts] = part.split(':').map(s => s.trim());
      if (key && valueParts.length > 0) {
        result[key] = valueParts.join(':').trim();
      }
    }
    if (!result.bounty || !result.winner) return null;
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

function parseSettledCast(text: string): any | null {
  if (!text.startsWith(SETTLED_PREFIX)) return null;
  try {
    const parts = text.slice(SETTLED_PREFIX.length).split('|').map(s => s.trim());
    const result: any = {};
    for (const part of parts) {
      const [key, ...valueParts] = part.split(':').map(s => s.trim());
      if (key && valueParts.length > 0) {
        result[key] = valueParts.join(':').trim();
      }
    }
    if (!result.bounty) return null;
    return result;
  } catch { return null; }
}

const processedCasts = new Set<string>();

async function handleBountyCast(cast: Cast, redis: any): Promise<void> {
  const parsed = parseBountyCast(cast.text);
  if (!parsed) return;
  
  const existing = await getBountyFromRedis(parsed.id, redis);
  if (existing) return;
  
  const bounty = {
    id: parsed.id,
    task: parsed.task,
    type: parsed.type || 'custom',
    reward: parsed.reward || 0,
    status: 'open',
    posterUsername: cast.author.username,
    posterFid: cast.author.fid,
    deadlineTs: Math.floor(Date.now() / 1000) + 86400 * 7,
    createdAt: Math.floor(Date.now() / 1000),
    castHash: cast.hash,
  };
  
  await saveBountyToRedis(bounty, redis);
  console.log(`[cast-poller] Created bounty ${bounty.id} from cast`);
}

async function handleBidCast(cast: Cast, redis: any): Promise<void> {
  const parsed = parseBidCast(cast.text);
  if (!parsed) return;
  
  const bounty = await getBountyFromRedis(parsed.bountyId, redis);
  if (!bounty || bounty.status !== 'open') return;
  
  const { nanoid } = await import('nanoid');
  const bid = {
    id: `bid_${nanoid(8)}`,
    bountyId: parsed.bountyId,
    agentFid: cast.author.fid,
    agentUsername: cast.author.username,
    proposal: parsed.approach || `ETA: ${parsed.eta}`,
    priceUsdc: Math.round(bounty.reward * 0.9 * 100) / 100,
    status: 'pending',
    createdAt: Math.floor(Date.now() / 1000),
    castHash: cast.hash,
  };
  
  await saveBidToRedis(bid, redis);
  console.log(`[cast-poller] Bid from @${cast.author.username} for bounty ${parsed.bountyId}`);
  
  const assignedText = [
    `ASSIGNED | bounty: ${parsed.bountyId}`,
    `winner: @${cast.author.username}`,
  ].join(' | ');
  
  await postCast(assignedText, bounty.castHash);
  await updateBountyStatus(parsed.bountyId, 'assigned', {
    workerFid: cast.author.fid,
    workerUsername: cast.author.username,
    winnerBidId: bid.id,
  }, redis);
}

async function handleAssignedCast(cast: Cast, redis: any): Promise<void> {
  const parsed = parseAssignedCast(cast.text);
  if (!parsed) return;
  
  const bounty = await getBountyFromRedis(parsed.bounty, redis);
  if (!bounty || bounty.status !== 'open') return;
  
  const winnerUsername = parsed.winner.replace('@', '');
  
  await updateBountyStatus(parsed.bounty, 'assigned', {
    workerFid: cast.author.fid,
    workerUsername: winnerUsername,
  }, redis);
  
  console.log(`[cast-poller] Bounty ${parsed.bounty} assigned to @${winnerUsername}`);
}

async function handleResultCast(cast: Cast, redis: any): Promise<void> {
  const parsed = parseResultCast(cast.text);
  if (!parsed) return;
  
  const bounty = await getBountyFromRedis(parsed.bountyId, redis);
  if (!bounty || bounty.status !== 'assigned') return;
  if (cast.author.fid !== bounty.workerFid) return;
  
  await updateBountyStatus(parsed.bountyId, 'completed', {
    result: parsed.output,
    resultCastHash: cast.hash,
    completedAt: Math.floor(Date.now() / 1000),
  }, redis);
  
  const settledText = [
    `SETTLED | bounty: ${parsed.bountyId}`,
    `paid: ${bounty.reward} USDC`,
    `worker: @${cast.author.username}`,
  ].join(' | ');
  
  await postCast(settledText, bounty.castHash);
  await updateBountyStatus(parsed.bountyId, 'settled', {
    settledAt: Math.floor(Date.now() / 1000),
  }, redis);
  
  console.log(`[cast-poller] Bounty ${parsed.bountyId} settled, paid ${bounty.reward} USDC`);
}

async function handleSettledCast(cast: Cast, redis: any): Promise<void> {
  const parsed = parseSettledCast(cast.text);
  if (!parsed) return;
  
  const bounty = await getBountyFromRedis(parsed.bounty, redis);
  if (!bounty || bounty.status === 'settled') return;
  
  await updateBountyStatus(parsed.bounty, 'settled', {
    settledAt: Math.floor(Date.now() / 1000),
    txHash: parsed.tx,
    paidAmount: parsed.paid,
  }, redis);
  
  console.log(`[cast-poller] Bounty ${parsed.bounty} marked as settled`);
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const pollerToken = process.env.CAST_POLLER_TOKEN;
  
  const isVercelCron = req.headers.get('user-agent')?.includes('Vercel Cron');
  const isManualCall = pollerToken && authHeader === `Bearer ${pollerToken}`;
  
  if (!isVercelCron && !isManualCall) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const redis = await getRedis();
    if (!redis) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const results: any[] = [];
    
    const queries = [
      { prefix: BOUNTY_PREFIX, handler: handleBountyCast },
      { prefix: BID_PREFIX, handler: handleBidCast },
      { prefix: ASSIGNED_PREFIX, handler: handleAssignedCast },
      { prefix: RESULT_PREFIX, handler: handleResultCast },
      { prefix: SETTLED_PREFIX, handler: handleSettledCast },
    ];

    for (const { prefix, handler } of queries) {
      const casts = await searchCasts(prefix.replace(' |', ''), 20);
      
      for (const cast of casts) {
        if (processedCasts.has(cast.hash)) continue;
        
        try {
          await handler(cast, redis);
          processedCasts.add(cast.hash);
          results.push({ hash: cast.hash, type: prefix.trim(), status: 'processed' });
        } catch (e) {
          console.error(`[cast-poller] Error handling ${prefix}:`, e);
        }
      }
    }

    if (processedCasts.size > 1000) {
      const arr = Array.from(processedCasts);
      arr.slice(0, 500).forEach(h => processedCasts.delete(h));
    }

    return NextResponse.json({ 
      success: true, 
      processed: results.length,
      results: results.slice(0, 20),
    });
  } catch (error) {
    console.error('[cast-poller] Error:', error);
    return NextResponse.json({ error: 'Poller failed' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Cast Poller - Searches for BOUNTY, BID, ASSIGNED, RESULT, SETTLED casts',
    endpoints: {
      POST: 'Run poller to search and process casts',
    },
    searchPrefixes: [
      'BOUNTY',
      'BID', 
      'ASSIGNED',
      'RESULT',
      'SETTLED',
    ],
  });
}