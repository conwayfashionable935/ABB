import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

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

function deriveWalletAddress(fid: number): string {
  const seed = `user_${fid}_deposit`;
  const hash = seed.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const address = '0x' + Math.abs(hash).toString(16).padStart(64, '0').slice(-40);
  return address;
}

async function getBalanceFromChain(address: string): Promise<number> {
  try {
    const axios = (await import('axios')).default;
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia.g.alchemy.com/v2/Ef456717OSoAY5b4ZMI10';
    
    const response = await axios.post(rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{
        to: USDC_ADDRESS,
        data: `0x70a08231000000000000000000000000${address.replace('0x', '')}`
      }, 'latest'],
      id: 1,
    }, { timeout: 10000 });
    
    const balanceHex = response.data?.result;
    if (!balanceHex || balanceHex === '0x') return 0;
    return parseInt(balanceHex, 16) / 1_000_000;
  } catch (error) {
    console.error('[wallet] Error getting balance:', error);
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fid = searchParams.get('fid');
  
  if (!fid) {
    return NextResponse.json({ error: 'fid required' }, { status: 400 });
  }
  
  const fidNum = parseInt(fid, 10);
  if (isNaN(fidNum)) {
    return NextResponse.json({ error: 'invalid fid' }, { status: 400 });
  }
  
  const address = deriveWalletAddress(fidNum);
  const balance = await getBalanceFromChain(address);
  
  const redis = await getRedis();
  let depositedUsdc = 0;
  if (redis) {
    const depositRecord = await redis.hget(`user:${fidNum}`, 'depositedUsdc');
    depositedUsdc = typeof depositRecord === 'number' ? depositRecord : 0;
  }
  
  return NextResponse.json({
    fid: fidNum,
    address,
    balance,
    depositedUsdc,
    network: 'base-sepolia',
    token: 'USDC',
    depositToken: USDC_ADDRESS,
  });
}