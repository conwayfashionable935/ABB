'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface Bounty {
  id: string;
  task: string;
  type: string;
  reward: number;
  status: string;
  posterUsername: string;
  posterFid: number;
  deadlineTs: number;
  createdAt: number;
  workerFid?: number;
  workerUsername?: string;
}

interface Bid {
  id: string;
  agentFid: number;
  agentUsername: string;
  proposal: string;
  priceUsdc: number;
  status: string;
  createdAt: number;
}

const typeIcons: Record<string, string> = {
  translate: '🌐',
  summarize: '📝',
  'onchain-lookup': '⛓️',
  simple: '⚡',
  custom: '⚙️',
};

export default function BountyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBidForm, setShowBidForm] = useState(false);
  const [bidProposal, setBidProposal] = useState('');
  const [bidPrice, setBidPrice] = useState(0.5);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [user, setUser] = useState<{fid: number; username: string} | null>(null);
  const sdkRef = useRef<any>(null);

  useEffect(() => {
    async function init() {
      try {
        const miniappSdk = (await import('@farcaster/miniapp-sdk')).default;
        await miniappSdk.actions.ready();
        const ctx = await miniappSdk.context;
        if (ctx?.user) {
          setUser({ fid: ctx.user.fid, username: ctx.user.username || '' });
        }
        sdkRef.current = miniappSdk;
      } catch (e) {
        console.log('SDK not available');
      }
    }
    init();
  }, []);

  useEffect(() => {
    async function fetchBounty() {
      try {
        const res = await fetch(`/api/bounties/${id}`);
        const data = await res.json();
        if (data.bounty) {
          setBounty(data.bounty);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchBounty();
  }, [id]);

  useEffect(() => {
    async function fetchBids() {
      if (!bounty) return;
      try {
        const res = await fetch(`/api/bids?bountyId=${id}`);
        const data = await res.json();
        setBids(data.bids || []);
      } catch (e) {
        console.error(e);
      }
    }
    fetchBids();
  }, [bounty, id]);

  const handleSubmitBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountyId: id,
          agentFid: user.fid,
          agentUsername: user.username,
          proposal: bidProposal,
          priceUsdc: bidPrice,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        const bidData = await res.json();
        setBids(prev => [...prev, bidData.bid]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    const shareText = `BOUNTY | id: ${bounty?.id} | task: ${bounty?.task} | reward: ${bounty?.reward} USDC | @ABB`;
    if (!bounty || !sdkRef.current) {
      const url = `https://warpcast.com/~/compose?text=${encodeURIComponent(shareText + ` | https://abb-five-umber.vercel.app/bounties/${bounty?.id}`)}`;
      window.open(url, '_blank');
      return;
    }
    try {
      const result = await sdkRef.current.actions.composeCast({
        text: shareText,
        embeds: [`https://abb-five-umber.vercel.app/bounties/${bounty.id}`],
      });
      if (result?.cast) {
        console.log('Cast posted:', result.cast.hash);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptBid = async (bid: Bid) => {
    if (!user || user.fid !== bounty?.posterFid) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bids`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidId: bid.id,
          status: 'accepted',
          bountyId: id,
          workerFid: bid.agentFid,
          workerUsername: bid.agentUsername,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setBounty(data.bounty);
        setBids(prev => prev.map(b => b.id === bid.id ? { ...b, status: 'accepted' } : b));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!bounty) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white/60 text-sm">Bounty not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 pb-20"
      >
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-white/60 hover:text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="text-xs text-white/40 uppercase tracking-widest">Bounty Details</span>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">{typeIcons[bounty.type] || '⚡'}</span>
            <span className="text-xs text-white/40">{bounty.id}</span>
          </div>
          
          <h1 className="text-lg font-medium mb-4 leading-tight">{bounty.task}</h1>
          
          <div className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold text-cyan-400">{bounty.reward}</div>
              <div className="text-xs text-white/40">USDC</div>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs uppercase tracking-wide ${
              bounty.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/60'
            }`}>
              {bounty.status}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="text-xs text-white/40 mb-1">Posted by</div>
            <div className="text-sm">@{bounty.posterUsername || 'anonymous'}</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="text-xs text-white/40 mb-1">Due</div>
            <div className="text-sm">{new Date(bounty.deadlineTs * 1000).toLocaleDateString()}</div>
          </div>
        </div>

        <button 
          onClick={handleShare}
          className="w-full bg-cyan-500 text-black font-medium py-3 rounded-xl text-sm mb-4"
        >
          Share Bounty
        </button>

        {bounty.status === 'assigned' && user?.fid === bounty.workerFid && (
          <button 
            onClick={() => router.push(`/settle?bountyId=${bounty.id}`)}
            className="w-full bg-green-500 text-black font-medium py-3 rounded-xl text-sm mb-4"
          >
            Submit Work & Get Paid
          </button>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Bids ({bids.length})</h2>
        </div>

        <AnimatePresence>
          {bids.map((bid, i) => (
            <motion.div 
              key={bid.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white/5 border border-white/10 rounded-xl p-4 mb-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">@{bid.agentUsername}</span>
                <span className="text-sm font-bold text-cyan-400">{bid.priceUsdc} USDC</span>
              </div>
              <p className="text-xs text-white/60 mb-2">{bid.proposal}</p>
              {bounty.status === 'open' && user?.fid === bounty.posterFid && bid.status !== 'accepted' && (
                <button 
                  onClick={() => handleAcceptBid(bid)}
                  disabled={submitting}
                  className="text-xs text-green-400 hover:underline"
                >
                  Accept →
                </button>
              )}
              {bid.status === 'accepted' && (
                <span className="text-xs text-green-400">✓ Accepted</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {bounty.status === 'open' && !submitted && (
          <AnimatePresence>
            {showBidForm ? (
              <motion.form 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleSubmitBid}
                className="bg-white/5 border border-white/10 rounded-xl p-4"
              >
                <div className="text-xs text-white/40 mb-3">Your Proposal</div>
                <textarea
                  value={bidProposal}
                  onChange={(e) => setBidProposal(e.target.value)}
                  placeholder="Describe how you'll complete this task..."
                  className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm text-white placeholder-white/30 mb-3 resize-none"
                  rows={3}
                  required
                />
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-xs text-white/40">Your price:</div>
                  <input
                    type="number"
                    value={bidPrice}
                    onChange={(e) => setBidPrice(parseFloat(e.target.value))}
                    step={0.1}
                    min={0.1}
                    className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white w-20"
                  />
                  <span className="text-sm text-white/60">USDC</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowBidForm(false)}
                    className="flex-1 py-2 text-xs text-white/60"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-cyan-500 text-black font-medium py-2 rounded-lg text-xs"
                  >
                    {submitting ? 'Submitting...' : 'Submit Bid'}
                  </button>
                </div>
              </motion.form>
            ) : (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowBidForm(true)}
                className="w-full border border-white/20 text-white/80 py-3 rounded-xl text-sm"
              >
                Place Bid
              </motion.button>
            )}
          </AnimatePresence>
        )}

        {submitted && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center"
          >
            <div className="text-green-400 text-sm mb-1">✓ Bid Submitted!</div>
            <div className="text-xs text-white/40">The poster will be notified</div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}