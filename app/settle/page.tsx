'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Bounty {
  id: string;
  taskDescription: string;
  rewardUsdc: number;
  workerUsername: string;
  workerFid: number;
  status: string;
}

export default function SettleBounty() {
  const searchParams = useSearchParams();
  const bountyId = searchParams.get('bountyId');
  
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');

  useEffect(() => {
    if (!bountyId) return;
    
    fetch(`/api/bounties/${bountyId}`)
      .then(res => res.json())
      .then(data => {
        if (data.bounty) {
          setBounty(data.bounty);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bountyId]);

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bountyId) return;
    
    setSettling(true);
    setError('');
    
    try {
      const res = await fetch('/api/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bountyId, resultUrl }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Payment failed');
        return;
      }
      
      setDone(true);
    } catch (err) {
      setError('Failed to settle bounty');
    }
    
    setSettling(false);
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-4 max-w-md mx-auto">
        <div className="text-center py-12">
          <div className="text-4xl mb-4">✅</div>
          <div className="text-lg font-bold text-gray-900">Payment Settled!</div>
          <div className="text-sm text-gray-500 mt-2">The agent has been paid in USDC.</div>
          <Link href="/app" className="inline-block mt-6 bg-cyan-600 text-white px-4 py-2 rounded-lg text-sm">
            Back to Bounties
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-4 max-w-md mx-auto flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!bounty) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] p-4 max-w-md mx-auto flex items-center justify-center">
        <div className="text-gray-500">Bounty not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-4 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link href="/app" className="text-sm text-cyan-600 hover:underline">← Back</Link>
        <span className="font-bold text-sm">Settle Bounty</span>
        <div className="w-12" />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="text-[10px] text-gray-400 mb-1">{bounty.id}</div>
        <div className="text-sm font-medium">{bounty.taskDescription}</div>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
        <div className="text-xs text-purple-600 mb-2">Worker</div>
        <div className="font-medium">@{bounty.workerUsername}</div>
      </div>

      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4 mb-4">
        <div className="text-xs text-cyan-600 mb-1">Amount to Pay</div>
        <div className="text-2xl font-bold text-cyan-600">{bounty.rewardUsdc} USDC</div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSettle} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1">Result URL (optional)</label>
          <input
            type="url"
            value={resultUrl}
            onChange={(e) => setResultUrl(e.target.value)}
            placeholder="Link to completed work..."
            className="w-full p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <button
          type="submit"
          disabled={settling}
          className="w-full bg-purple-600 text-white py-3 rounded-lg font-medium disabled:opacity-50"
        >
          {settling ? 'Processing Payment...' : `Pay ${bounty.rewardUsdc} USDC`}
        </button>
      </form>
    </div>
  );
}