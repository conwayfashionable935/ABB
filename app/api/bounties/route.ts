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
  let neynarApiKey = process.env.NEYNAR_API_KEY || '';
  const signerUuid = process.env.BOUNTY_POSTER_SIGNER_UUID || '';
  
  // Sanitize API key - remove invalid HTTP header characters
  neynarApiKey = neynarApiKey.replace(/[^\x20-\x7E]/g, '').trim();
  
  if (!neynarApiKey || !signerUuid) {
    return { hash: null, error: 'Missing NEYNAR_API_KEY or BOUNTY_POSTER_SIGNER_UUID' };
  }
  
  try {
    const axios = (await import('axios')).default;
    
    const response = await axios.post(
      'https://api.neynar.com/v2/cast',
      {
        signer_uuid: signerUuid,
        text: text,
      },
      { headers: { 'x-api-key': neynarApiKey } }
    );
    
    if (response.data?.hash) {
      return { hash: response.data.hash };
    } else {
      return { hash: null, error: response.data?.message || 'No hash returned' };
    }
  } catch (error: any) {
    return { hash: null, error: error.response?.data?.message || error.message || String(error) };
  }
}

export async function GET() {
  try {
    const config = getRedisConfig();
    const redisUrl = config.url?.trim() || '';
    const redisToken = config.token?.trim() || '';

    if (!redisUrl || !redisToken) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }
    
    const redis = new Redis({ url: redisUrl, token: redisToken });
    
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
        // Upstash Redis auto-parses JSON, so data is already an object
        if (typeof data === 'object') {
          bounties.push(data as any);
        } else {
          // Fallback for string data
          try {
            bounties.push(JSON.parse(data as string));
          } catch { /* skip */ }
        }
      }
    }
    
    // Get recent activities
    const activityData = await redis.lrange('activities:recent', 0, 19);
    const activities: any[] = [];
    if (activityData && Array.isArray(activityData)) {
      for (const item of activityData) {
        if (typeof item === 'object') {
          activities.push(item as any);
        } else {
          try {
            activities.push(JSON.parse(item as string));
          } catch { /* skip */ }
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

    const fidNum = posterFid || 0;
    
    // Check user's funded balance before creating bounty
    if (fidNum > 0) {
      const config = getRedisConfig();
      if (config.url && config.token) {
        const redis = new Redis({ url: config.url, token: config.token });
        const depositedUsdc = await redis.hget(`user:${fidNum}`, 'depositedUsdc') as number || 0;
        
        if (depositedUsdc < rewardUsdc) {
          return NextResponse.json({ 
            error: 'Insufficient balance',
            required: rewardUsdc,
            available: depositedUsdc,
            message: `You need at least ${rewardUsdc} USDC funded to create this bounty. Please deposit funds first.`
          }, { status: 400 });
        }
      }
    }

    const { nanoid } = await import('nanoid');
    const id = 'bnt_' + nanoid(8);

    const config = getRedisConfig();
    const redisUrl = config.url?.trim() || '';
    const redisToken = config.token?.trim() || '';
    
    if (!redisUrl || !redisToken) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const redis = new Redis({ url: redisUrl, token: redisToken });
    
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
    
    // Deduct from user's funded balance
    if (fidNum > 0) {
      await redis.hincrby(`user:${fidNum}`, 'depositedUsdc', -rewardUsdc);
      await redis.hincrby(`user:${fidNum}`, 'lockedUsdc', rewardUsdc);
    }
    
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