import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export const dynamic = 'force-dynamic';

const MINIAPP_URL = 'https://abb-five-umber.vercel.app';

function getRedisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  };
}

async function postCastToFarcaster(text: string): Promise<{hash: string | null, error?: string}> {
  const neynarApiKey = process.env.NEYNAR_API_KEY || '';
  const signerUuid = process.env.BOUNTY_POSTER_SIGNER_UUID || '';
  
  console.log('[bounties] postCastToFarcaster called');
  console.log('[bounties] API Key exists:', !!neynarApiKey);
  console.log('[bounties] Signer exists:', !!signerUuid);
  console.log('[bounties] Signer UUID:', signerUuid);
  
  if (!neynarApiKey) {
    return { hash: null, error: 'No NEYNAR_API_KEY configured' };
  }
  
  if (!signerUuid) {
    return { hash: null, error: 'No BOUNTY_POSTER_SIGNER_UUID configured' };
  }
  
  try {
    const { NeynarAPIClient } = await import('@neynar/nodejs-sdk');
    const neynar = new NeynarAPIClient({ apiKey: neynarApiKey });
    
    console.log('[bounties] Publishing cast with signer:', signerUuid, 'text:', text);
    const result = await (neynar as any).publishCast(signerUuid, text, {});
    console.log('[bounties] Cast result:', JSON.stringify(result));
    return { hash: result?.hash || null };
  } catch (error: any) {
    console.error('[bounties] Error posting cast:', error.message || String(error));
    return { hash: null, error: error.message || String(error) };
  }
}

export async function GET() {
  try {
    const config = getRedisConfig();
    if (!config.url || !config.token) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const redis = new Redis(config);
    
    // Get all bounty IDs - smembers returns string[]
    const bountyIds = await redis.smembers('bounties:all');
    const bountyIdsArray = Array.isArray(bountyIds) ? bountyIds : [];
    
    if (bountyIdsArray.length === 0) {
      return NextResponse.json({ 
        bounties: [], 
        activities: [],
        source: 'redis'
      });
    }
    
    const bounties: any[] = [];
    for (const bountyId of bountyIdsArray) {
      const data = await redis.get('bounty:' + bountyId);
      if (data) {
        try {
          bounties.push(JSON.parse(data as string));
        } catch {
          // Skip invalid JSON
        }
      }
    }
    
    // Get recent activities
    const activityData = await redis.lrange('activities:recent', 0, 19);
    const activities: any[] = [];
    if (activityData && Array.isArray(activityData)) {
      for (const item of activityData) {
        try {
          activities.push(JSON.parse(item as string));
        } catch {
          // Skip invalid JSON
        }
      }
    }
    
    // Sort by createdAt
    bounties.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    return NextResponse.json({ 
      bounties, 
      activities,
      source: 'redis'
    });
  } catch (error: any) {
    console.error('GET Error:', error);
    return NextResponse.json({ error: String(error.message) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskDescription, taskType, rewardUsdc, deadlineHours, posterFid, posterUsername } = body;

    if (!taskDescription || !taskType || !rewardUsdc || !deadlineHours) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { nanoid } = await import('nanoid');
    const id = 'bnt_' + nanoid(8);

    const config = getRedisConfig();
    if (!config.url || !config.token) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const redis = new Redis(config);
    
    const newBounty: any = {
      id: id,
      task: taskDescription,
      type: taskType,
      reward: rewardUsdc,
      status: 'open',
      posterUsername: posterUsername || 'anonymous',
      posterFid: posterFid || 0,
      deadlineTs: Math.floor(Date.now() / 1000) + deadlineHours * 3600,
      createdAt: Math.floor(Date.now() / 1000),
      castHash: ''
    };

    const key = 'bounty:' + id;
    await redis.set(key, JSON.stringify(newBounty));
    await redis.sadd('bounties:all', id);
    await redis.sadd('bounties:open', id);
    
    // Verify the bounty was saved
    const verifyData = await redis.get(key);
    
    // ===== AUTO-POST TO FARCASTER =====
    // Use proper BOUNTY format so other AI agents can parse it
    const castText = [
      `BOUNTY | id: ${id}`,
      `task: ${taskDescription}`,
      `type: ${taskType}`,
      `reward: ${rewardUsdc} USDC`,
    ].join(' | ');
    
    console.log('[bounties] About to post cast:', castText);
    
    // Post the cast to Faraster
    const castResult = await postCastToFarcaster(castText);
    const castHash = castResult.hash;
    
    // Create bounty link for viewing
    const bountyLink = `${MINIAPP_URL}/bounties/${id}`;
    
    // Get neynar config for debugging
    const neynarApiKey = process.env.NEYNAR_API_KEY;
    
    if (castHash) {
      newBounty.castHash = castHash;
      await redis.set(key, JSON.stringify(newBounty));
      console.log('[bounties] Cast posted with hash:', castHash);
    } else {
      console.log('[bounties] Cast not posted, error:', castResult.error);
    }
    
    return NextResponse.json({ 
      bounty: newBounty,
      verify: !!verifyData,
      castPosted: !!castHash,
      castHash: castHash,
      castError: castResult.error,
      bountyLink: bountyLink,
      debug: {
        hasApiKey: !!neynarApiKey,
        apiKeyPrefix: neynarApiKey?.substring(0, 8) || 'none'
      }
    });
  } catch (error: any) {
    console.error('POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}