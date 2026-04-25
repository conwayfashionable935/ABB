import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

function getRedisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  };
}

function deriveWalletAddress(fid: number): string {
  const seed = `user_${fid}_wallet`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  return '0x' + Math.abs(hash).toString(16).padStart(40, '0').slice(-40);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, username } = body;

    if (!fid) {
      return NextResponse.json({ error: 'fid required' }, { status: 400 });
    }

    const walletAddress = deriveWalletAddress(fid);
    
    const redisConfig = getRedisConfig();
    if (redisConfig.url && redisConfig.token) {
      const redis = new Redis({ url: redisConfig.url, token: redisConfig.token });
      await redis.hset(`user:${fid}`, {
        address: walletAddress,
        username: username || '',
        lastLogin: Date.now(),
      });
    }

    return NextResponse.json({
      user: {
        id: `user_${fid}`,
        fid,
        username,
        wallet: {
          address: walletAddress,
          id: walletAddress,
        },
      },
      walletAddress,
    });
  } catch (error) {
    console.error('[privy-login] Error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}