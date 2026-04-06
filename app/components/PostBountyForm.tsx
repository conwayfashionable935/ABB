'use client';

import { useState } from 'react';

interface PostBountyFormProps {
  onSuccess?: (castHash: string) => void;
}

export default function PostBountyForm({ onSuccess }: PostBountyFormProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [taskType, setTaskType] = useState<'translate' | 'summarize' | 'onchain_lookup'>('translate');
  const [rewardUsdc, setRewardUsdc] = useState(1);
  const [deadlineHours, setDeadlineHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [castUrl, setCastUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setCastUrl('');

    try {
      const res = await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskDescription,
          taskType,
          rewardUsdc,
          deadlineHours,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to post bounty');
      }

      if (data.castHash) {
        setCastUrl(`https://warpcast.com/~/concentration?hash=${data.castHash}`);
        onSuccess?.(data.castHash);
      }

      setTaskDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="mb-3">
        <label className="block text-xs text-gray-500 mb-1">Task Description</label>
        <textarea
          value={taskDescription}
          onChange={(e) => setTaskDescription(e.target.value)}
          className="w-full border rounded p-2 text-sm"
          rows={3}
          placeholder="Describe the task..."
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Task Type</label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as typeof taskType)}
            className="w-full border rounded p-2 text-sm"
          >
            <option value="translate">Translate</option>
            <option value="summarize">Summarize</option>
            <option value="onchain_lookup">On-chain Lookup</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Reward (USDC)</label>
          <input
            type="number"
            value={rewardUsdc}
            onChange={(e) => setRewardUsdc(parseFloat(e.target.value))}
            className="w-full border rounded p-2 text-sm"
            min={0.5}
            max={10}
            step={0.5}
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Deadline</label>
        <select
          value={deadlineHours}
          onChange={(e) => setDeadlineHours(parseInt(e.target.value))}
          className="w-full border rounded p-2 text-sm"
        >
          <option value={2}>2 hours</option>
          <option value={6}>6 hours</option>
          <option value={12}>12 hours</option>
          <option value={24}>24 hours</option>
        </select>
      </div>

      {error && <div className="text-red-500 text-sm mb-3">{error}</div>}

      {castUrl && (
        <a
          href={castUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 text-sm hover:underline mb-3 block"
        >
          View cast on Warpcast →
        </a>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-500 text-white rounded py-2 text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Posting...' : 'Post Bounty'}
      </button>
    </form>
  );
}
