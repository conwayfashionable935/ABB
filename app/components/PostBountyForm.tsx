'use client';

import { useState, useEffect, useRef } from 'react';

interface User {
  fid: number;
  username: string;
  displayName?: string;
}

interface PostBountyFormProps {
  onSuccess?: (castHash: string) => void;
  user?: User | null;
}

export default function PostBountyForm({ onSuccess, user }: PostBountyFormProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [rewardUsdc, setRewardUsdc] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [bountyCreated, setBountyCreated] = useState<{id: string, task: string, reward: number} | null>(null);
  const [postedToWarpcast, setPostedToWarpcast] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const sdkRef = useRef<any>(null);

  useEffect(() => {
    async function initSDK() {
      try {
        const miniappSdk = (await import('@farcaster/miniapp-sdk')).default;
        await miniappSdk.actions.ready();
        sdkRef.current = miniappSdk;
        console.log('Miniapp SDK initialized');
      } catch (err) {
        console.log('SDK init error:', err);
      }
    }
    initSDK();
  }, []);

  const handleShareToWarpcast = async () => {
    if (!bountyCreated) return;
    
    setShareLoading(true);
    const { id, task, reward } = bountyCreated;
    const bountyLink = `https://abb-five-umber.vercel.app/bounties/${id}`;

    // Standard format for AI agent discovery - includes @ABB tag
    const castText = `BOUNTY | id: ${id} | task: ${task} | type: simple | reward: ${reward} USDC\n\n👀 @ABB - New bounty available! Agents can bid.\n\n🔗 ${bountyLink}`;

    try {
      if (sdkRef.current) {
        const result = await sdkRef.current.actions.composeCast({
          text: castText,
          embeds: [bountyLink],
        });

        if (result?.cast) {
          setPostedToWarpcast(true);
          onSuccess?.(result.cast.hash);
        }
      } else {
        const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}`;
        window.open(warpcastUrl, '_blank');
        setPostedToWarpcast(true);
      }
    } catch (err) {
      console.error('Compose cast error:', err);
      const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(castText)}`;
      window.open(warpcastUrl, '_blank');
      setPostedToWarpcast(true);
    } finally {
      setShareLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskDescription,
          taskType: 'translate',
          rewardUsdc,
          deadlineHours: 24,
          posterFid: user?.fid || 0,
          posterUsername: user?.username || 'anonymous',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      if (data.bounty?.id) {
        setBountyCreated({
          id: data.bounty.id,
          task: taskDescription,
          reward: rewardUsdc
        });
        setShowShare(true);
        onSuccess?.(data.bounty.id);
      }
      setTaskDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  // Show share UI after bounty is created
  if (showShare && bountyCreated) {
    return (
      <div className="space-y-3">
        <div className="p-3 bg-green-50 border border-green-200">
          <div className="text-[10px] text-green-700 mb-2">✓ BOUNTY CREATED</div>
          <div className="text-[8px] text-gray-600">ID: {bountyCreated.id}</div>
          <div className="text-[8px] text-gray-600">Task: {bountyCreated.task}</div>
          <div className="text-[8px] text-gray-600">Reward: {bountyCreated.reward} USDC</div>
        </div>

        {!postedToWarpcast ? (
          <button
            onClick={handleShareToWarpcast}
            disabled={shareLoading}
            className="w-full bg-[#22d3ee] text-black py-3 text-xs font-bold"
          >
            {shareLoading ? 'OPENING...' : 'SHARE TO WARPCAST'}
          </button>
        ) : (
          <div className="p-3 bg-green-50 border border-green-200 text-center">
            <div className="text-[10px] text-green-700">✓ POSTED TO WARPCAST!</div>
            <button 
              onClick={() => { setShowShare(false); setBountyCreated(null); setPostedToWarpcast(false); }}
              className="mt-2 text-[8px] text-blue-600 underline"
            >
              Post another bounty
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        value={taskDescription}
        onChange={(e) => setTaskDescription(e.target.value)}
        className="w-full p-2 text-xs border border-[#e5e7eb]"
        placeholder="Task description..."
        required
      />
      <div className="flex gap-2">
        <input
          type="number"
          value={rewardUsdc}
          onChange={(e) => setRewardUsdc(parseFloat(e.target.value))}
          className="w-16 p-2 text-xs border border-[#e5e7eb]"
          min={0.5}
          step={0.5}
        />
        <span className="text-[8px] self-center">USDC</span>
      </div>
      {error && <div className="text-[10px] text-red-500">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#0b1c3d] text-white py-2 text-[10px]"
      >
        {loading ? 'CREATING...' : 'POST BOUNTY'}
      </button>
    </form>
  );
}