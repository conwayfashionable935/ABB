import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

function getRedisConfig() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL?.trim(),
    token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  };
}

async function getRedis() {
  const config = getRedisConfig();
  if (!config.url || !config.token) return null;
  return new Redis({ url: config.url, token: config.token });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { fid, amountUsdc, txHash } = body;

  if (!fid || !amountUsdc) {
    return NextResponse.json({ error: 'fid and amountUsdc required' }, { status: 400 });
  }

  if (!txHash) {
    return NextResponse.json({ error: 'txHash required for verification' }, { status: 400 });
  }

  const redis = await getRedis();
  if (!redis) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }

  const existingTx = await redis.get(`deposit:tx:${txHash}`);
  if (existingTx) {
    return NextResponse.json({ error: 'Deposit already recorded', existing: true }, { status: 400 });
  }

  await redis.hincrby(`user:${fid}`, 'depositedUsdc', amountUsdc);
  await redis.set(`deposit:tx:${txHash}`, JSON.stringify({ fid, amountUsdc, timestamp: Date.now() }));

  return NextResponse.json({
    success: true,
    fid,
    amountUsdc,
    txHash,
    message: 'Deposit recorded',
  });
}