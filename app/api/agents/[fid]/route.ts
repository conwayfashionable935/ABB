import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { fid: string } }
) {
  const fid = parseInt(params.fid);
  
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
  }

  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
    const agentData = await redis.hgetall(`agent:${fid}`);
    
    if (!agentData || Object.keys(agentData).length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    
    return NextResponse.json({ agent: agentData });
  } catch (error) {
    console.error('[api/agents/[fid]] error:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}