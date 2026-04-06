'use client';

import { useState, useEffect } from 'react';

interface Bounty {
  id: string;
  taskDescription: string;
  taskType: string;
  rewardUsdc: number;
  status: string;
  deadlineTs: number;
  winnerFid?: number;
  settlementTxHash?: string;
}

export default function BountyBoard() {
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBounties = async () => {
    try {
      const res = await fetch('/api/bounties');
      const data = await res.json();
      setBounties(data.bounties || []);
    } catch (error) {
      console.error('Failed to fetch bounties:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBounties();
    const interval = setInterval(fetchBounties, 15000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800';
      case 'assigned': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'expired': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDeadline = (deadlineTs: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = deadlineTs - now;
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / 3600);
    if (hours < 1) return `${Math.floor(diff / 60)}m left`;
    return `${hours}h left`;
  };

  if (loading) {
    return <div className="text-gray-500">Loading bounties...</div>;
  }

  if (bounties.length === 0) {
    return <div className="text-gray-500">No bounties yet. Be the first to post one!</div>;
  }

  return (
    <div className="space-y-3">
      {bounties.map((bounty) => (
        <div key={bounty.id} className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(bounty.status)}`}>
              {bounty.status.toUpperCase()}
            </span>
            <span className="text-sm font-medium text-green-600">{bounty.rewardUsdc} USDC</span>
          </div>
          <p className="text-sm text-gray-800 mb-2">{bounty.taskDescription}</p>
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>{bounty.taskType}</span>
            <span>{formatDeadline(bounty.deadlineTs)}</span>
          </div>
          {bounty.settlementTxHash && (
            <a
              href={`https://basescan.org/tx/${bounty.settlementTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline mt-2 block"
            >
              View on Basescan →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
