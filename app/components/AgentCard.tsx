'use client';

import { useState, useEffect } from 'react';

interface AgentStats {
  fid: number;
  username: string;
  walletAddress: string;
  tasksCompleted: number;
  totalEarnedUsdc: number;
}

const AGENTS = [
  { fid: 1234, username: 'bounty-poster', name: 'Bounty Poster' },
  { fid: 1235, username: 'worker-alpha', name: 'Worker Alpha' },
  { fid: 1236, username: 'worker-beta', name: 'Worker Beta' },
];

export default function AgentCard() {
  const [stats, setStats] = useState<Map<number, AgentStats>>(new Map());

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        const statsMap = new Map();
        (data.agents || []).forEach((agent: AgentStats) => {
          statsMap.set(agent.fid, agent);
        });
        setStats(statsMap);
      })
      .catch(console.error);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-3">
      {AGENTS.map((agent) => {
        const agentStats = stats.get(agent.fid) || {
          fid: agent.fid,
          username: agent.username,
          walletAddress: '0x...',
          tasksCompleted: 0,
          totalEarnedUsdc: 0,
        };

        return (
          <div key={agent.fid} className="border rounded-lg p-3 bg-white shadow-sm">
            <div className="text-sm font-medium mb-1">@{agentStats.username}</div>
            <div className="text-xs text-gray-500 truncate">{agentStats.walletAddress}</div>
            <div className="mt-2 flex justify-between text-xs">
              <span className="text-gray-500">Tasks:</span>
              <span className="font-medium">{agentStats.tasksCompleted}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Earned:</span>
              <span className="font-medium text-green-600">{agentStats.totalEarnedUsdc} USDC</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
