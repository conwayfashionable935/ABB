import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function getBountyFromRedis(id: string): Promise<any | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    const data = await redis.get(`bounty:${id}`);
    return data ? JSON.parse(data as string) : null;
  } catch (error) {
    console.error('[api/settle] Redis error:', error);
    return null;
  }
}

async function updateBountyInRedis(bounty: any): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    await redis.set(`bounty:${bounty.id}`, JSON.stringify(bounty));
  } catch (error) {
    console.error('[api/settle] Update error:', error);
  }
}

async function updateAgentStats(agentFid: number, amountUsdc: number): Promise<void> {
  if (!process.env.UPSTASH_REDIS_REST_URL) return;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    await redis.hincrby(`agent:stats:${agentFid}`, 'tasksCompleted', 1);
    await redis.hincrbyfloat(`agent:stats:${agentFid}`, 'totalEarnedUsdc', amountUsdc);
  } catch (error) {
    console.error('[api/settle] Agent stats error:', error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bountyId, resultUrl } = body;

    if (!bountyId) {
      return NextResponse.json({ error: 'bountyId required' }, { status: 400 });
    }

    const bounty = await getBountyFromRedis(bountyId);
    if (!bounty) {
      return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
    }

    if (bounty.status !== 'assigned') {
      return NextResponse.json({ error: 'Bounty must be assigned before settling' }, { status: 400 });
    }

    if (!process.env.BASE_RPC_URL || !process.env.BOUNTY_BOARD_PRIVATE_KEY) {
      return NextResponse.json({ 
        error: 'Payment not configured',
        message: 'Add BASE_RPC_URL and BOUNTY_BOARD_PRIVATE_KEY to env' 
      }, { status: 503 });
    }

    try {
      const { createPaymaster } = await import('@x402/evm');
      
      const paymaster = createPaymaster({
        entrypoint: '0x5FF137D4b8FDa2fB5E2D41f8c2e74e7d3E3E6d7Ac',
        rpc: process.env.BASE_RPC_URL!,
        privateKey: process.env.BOUNTY_BOARD_PRIVATE_KEY!,
      });

      const price = await paymaster.quote({
        beneficiary: bounty.workerUsername,
        fallsBackFee: bounty.priceUsdc,
      });

      bounty.status = 'settled';
      bounty.resultUrl = resultUrl || '';
      bounty.paidAmountUsdc = bounty.priceUsdc;
      bounty.settledAt = Math.floor(Date.now() / 1000);
      await updateBountyInRedis(bounty);

      await updateAgentStats(bounty.workerFid, bounty.priceUsdc);

      return NextResponse.json({ 
        bounty,
        payment: {
          beneficiary: bounty.workerUsername,
          amountUsdc: bounty.priceUsdc,
          quote: price,
        },
      });
    } catch (x402Error) {
      console.error('[api/settle] x402 error:', x402Error);
      return NextResponse.json({ 
        error: 'Payment failed',
        details: x402Error instanceof Error ? x402Error.message : 'Unknown error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[api/settle] POST error:', error);
    return NextResponse.json({ error: 'Failed to settle bounty' }, { status: 500 });
  }
}