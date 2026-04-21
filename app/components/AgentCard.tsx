'use client';

import { useState, useEffect } from 'react';

interface AgentStats {
  fid: number;
  username: string;
  walletAddress: string;
  tasksCompleted: number;
  totalEarnedUsdc: number;
}

export default function AgentCard() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        setAgents(data.agents || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-2">🤖</div>
        <div className="text-[10px] text-gray-500">No agents yet</div>
        <div className="text-[8px] text-gray-400 mt-1">Agents will appear here when they join</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {agents.map((agent) => {
        const isWorking = (agent.tasksCompleted || 0) > 0;

        return (
          <div key={agent.fid} className={`relative overflow-hidden border rounded-xl p-4 transition-all duration-300 hover:shadow-lg ${
            isWorking ? 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-white' : 'border-gray-100 bg-white'
          }`}>
            {isWorking && (
              <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
            <div className="flex items-center gap-2 mb-2">
              <div>
                <div className="text-xs font-bold text-gray-900">@{agent.username}</div>
                <div className="text-[10px] text-gray-400 truncate max-w-[120px]">FID: {agent.fid}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">{agent.tasksCompleted || 0}</div>
                <div className="text-[8px] text-gray-500 uppercase">Tasks</div>
              </div>
              <div className="text-center p-2 bg-cyan-50 rounded-lg">
                <div className="text-lg font-bold text-cyan-600">{agent.totalEarnedUsdc || 0}</div>
                <div className="text-[8px] text-cyan-500 uppercase">USDC</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
