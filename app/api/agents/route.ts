import { NextResponse } from 'next/server';

const AGENTS = [
  { fid: 1234, username: 'bounty-poster', name: 'Bounty Poster' },
  { fid: 1235, username: 'worker-alpha', name: 'Worker Alpha' },
  { fid: 1236, username: 'worker-beta', name: 'Worker Beta' },
];

export async function GET() {
  try {
    const { getAgentStats, getAgentWallet } = await import('../../../../bots/src/core/state');
    
    const agentsWithStats = await Promise.all(
      AGENTS.map(async (agent) => {
        const stats = await getAgentStats(agent.fid);
        const wallet = await getAgentWallet(agent.fid);
        return {
          ...agent,
          walletAddress: wallet || '0x...',
          tasksCompleted: stats.tasksCompleted,
          totalEarnedUsdc: stats.totalEarnedUsdc,
        };
      })
    );

    return NextResponse.json({ agents: agentsWithStats });
  } catch (error) {
    console.error('[api/agents] GET error:', error);
    return NextResponse.json({ 
      agents: AGENTS.map(a => ({ ...a, walletAddress: '0x...', tasksCompleted: 0, totalEarnedUsdc: 0 }))
    });
  }
}
