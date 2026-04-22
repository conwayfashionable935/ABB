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
  const signerUuid = process.env.BOUNTY_POSTER_SIGNER_UUID || 'cdb7be82-a403-4cfe-8384-0b11657391a7';
  
  console.log('[bounties] postCastToFarcaster called');
  
  if (!neynarApiKey) {
    return { hash: null, error: 'No API key' };
  }
  
  try {
    const { NeynarAPIClient } = await import('@neynar/nodejs-sdk');
    const neynar = new NeynarAPIClient({ apiKey: neynarApiKey });
    
    console.log('[bounties] Publishing cast with signer:', signerUuid);
    const result = await (neynar as any).publishCast(signerUuid, text, {});
    console.log('[bounties] Cast result:', JSON.stringify(result));
    return { hash: result?.hash || null };
  } catch (error: any) {
    console.error('[bounties] Error:', error.message || String(error));
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
    
    const testKey = 'test_key_' + Date.now();
    await redis.set(testKey, 'value_' + Date.now());
    const testValue = await redis.get(testKey);
    
    return NextResponse.json({ 
      testKey: testKey,
      testValue: testValue,
      timestamp: Date.now()
    });
  } catch (error: any) {
    console.error('GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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