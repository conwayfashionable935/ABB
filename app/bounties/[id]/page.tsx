'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { 
  FiGlobe, FiFileText, FiLink, FiZap, FiTarget,
  FiCheck, FiDollarSign, FiUser, FiArrowLeft, FiClock, FiShield
} from 'react-icons/fi';

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

const typeIcons: Record<string, React.ReactNode> = {
  translate: <FiGlobe size={24} />,
  summarize: <FiFileText size={24} />,
  'onchain-lookup': <FiLink size={24} />,
  simple: <FiZap size={24} />,
  custom: <FiTarget size={24} />,
};

const statusConfig: Record<string, { color: string; bg: string; label: string; step: number }> = {
  open: { color: '#34C759', bg: 'bg-[#34C759]/15', label: 'Open', step: 1 },
  assigned: { color: '#FF9500', bg: 'bg-[#FF9500]/15', label: 'In Progress', step: 2 },
  completed: { color: '#007AFF', bg: 'bg-[#007AFF]/15', label: 'Completed', step: 3 },
  settled: { color: '#AF52DE', bg: 'bg-[#AF52DE]/15', label: 'Paid', step: 4 },
};

const steps = ['Open', 'Assigned', 'Completed', 'Paid'];

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

  useEffect(() => {
    async function init() {
      try {
        const miniappSdk = (await import('@farcaster/miniapp-sdk')).default;
        await miniappSdk.actions.ready();
        const ctx = await miniappSdk.context;
        if (ctx?.user) {
          setUser({ fid: ctx.user.fid, username: ctx.user.username || '' });
        }
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

  const handleAcceptBid = async (bid: Bid) => {
    if (!user || user.fid !== bounty?.posterFid) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/bids', {
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
      <div className="min-h-screen bg-[#000] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!bounty) {
    return (
      <div className="min-h-screen bg-[#000] flex items-center justify-center">
        <div className="text-white/60">Bounty not found</div>
      </div>
    );
  }

  const currentStep = statusConfig[bounty.status]?.step || 1;

  return (
    <div className="min-h-screen bg-[#000] text-white">
      <div className="max-w-md mx-auto bg-[#1C1C1E] min-h-screen">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5"
        >
          <div className="flex items-center justify-between mb-6">
            <Link href="/app" className="flex items-center gap-2 text-white/60 hover:text-white">
              <FiArrowLeft size={20} />
              <span className="text-sm">Back</span>
            </Link>
            <div className="flex items-center gap-2">
              <span 
                className={`px-3 py-1 rounded-full text-[11px] font-medium ${statusConfig[bounty.status]?.bg} ${statusConfig[bounty.status]?.color || 'text-white'}`}
              >
                {statusConfig[bounty.status]?.label || bounty.status}
              </span>
            </div>
          </div>

          <div className="bg-[#2C2C2E] rounded-3xl p-5 mb-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF9500] to-[#FF3B30] flex items-center justify-center">
                {typeIcons[bounty.type] || typeIcons.simple}
              </div>
              <div className="flex-1">
                <div className="text-xs text-white/40 mb-1 font-medium">TASK</div>
                <h1 className="text-lg font-semibold leading-tight">{bounty.task}</h1>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-5 pt-5 border-t border-white/10">
              <div>
                <div className="text-xs text-white/40 mb-1 font-medium">REWARD</div>
                <div className="text-2xl font-bold">
                  <FiDollarSign className="inline" size={20} />
                  {bounty.reward}
                  <span className="text-sm font-normal text-white/40 ml-1">USDC</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/40 mb-1 font-medium">POSTED BY</div>
                <div className="text-sm font-medium">@{bounty.posterUsername}</div>
              </div>
            </div>
          </div>

          <div className="bg-[#2C2C2E] rounded-3xl p-5 mb-4">
            <div className="text-xs text-white/40 mb-4 font-medium uppercase tracking-wide">Progress</div>
            <div className="flex items-center justify-between">
              {steps.map((label, i) => {
                const isActive = currentStep > i;
                const isCurrent = currentStep === i + 1;
                return (
                  <div key={label} className="flex flex-col items-center flex-1">
                    <div 
                      className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 transition-all ${
                        isActive 
                          ? 'bg-white text-black' 
                          : 'bg-[#3A3A3C] text-white/30'
                      }`}
                    >
                      {isActive ? <FiCheck size={16} /> : <span className="text-xs">{i + 1}</span>}
                    </div>
                    <span className={`text-[10px] ${isCurrent ? 'text-white font-medium' : 'text-white/40'}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {bounty.workerUsername && (
            <div className="bg-[#2C2C2E] rounded-3xl p-5 mb-4">
              <div className="text-xs text-white/40 mb-3 font-medium">WORKER</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF9500] to-[#FF3B30] flex items-center justify-center text-black font-semibold">
                    {bounty.workerUsername[0].toUpperCase()}
                  </div>
                  <span className="font-medium">@{bounty.workerUsername}</span>
                </div>
                {bounty.status === 'settled' && (
                  <span className="text-[#34C759] text-sm font-medium">
                    <FiDollarSign className="inline" size={14} /> Paid
                  </span>
                )}
              </div>
            </div>
          )}

          {bounty.status === 'assigned' && user?.fid === bounty.workerFid && (
            <Link 
              href={`/settle?bountyId=${bounty.id}`}
              className="block w-full bg-gradient-to-r from-[#FF9500] to-[#FF3B30] text-black font-semibold py-4 rounded-2xl text-center mb-4"
            >
              Complete Work
            </Link>
          )}

          <div className="bg-[#2C2C2E] rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Bids ({bids.length})</h2>
              {bounty.status === 'open' && user?.fid !== bounty?.posterFid && !submitted && (
                <button 
                  onClick={() => setShowBidForm(!showBidForm)}
                  className="text-xs text-[#FF9500] font-medium"
                >
                  {showBidForm ? 'Cancel' : 'Place Bid'}
                </button>
              )}
            </div>

            <AnimatePresence>
              {showBidForm && (
                <motion.form 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleSubmitBid}
                  className="bg-[#3A3A3C] rounded-2xl p-4 mb-4"
                >
                  <textarea
                    value={bidProposal}
                    onChange={(e) => setBidProposal(e.target.value)}
                    placeholder="Describe your approach..."
                    className="w-full bg-[#2C2C2E] rounded-xl p-3 text-sm text-white placeholder-white/40 mb-3 resize-none"
                    rows={3}
                    required
                  />
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-white/60">Your price:</span>
                    <input
                      type="number"
                      value={bidPrice}
                      onChange={(e) => setBidPrice(parseFloat(e.target.value))}
                      step={0.1}
                      min={0.1}
                      className="bg-[#2C2C2E] rounded-lg px-3 py-2 text-sm text-white w-20"
                    />
                    <span className="text-sm text-white/40">USDC</span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setShowBidForm(false)}
                      className="flex-1 py-2 text-sm text-white/60"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={submitting}
                      className="flex-1 bg-[#FF9500] text-black font-medium py-2 rounded-lg text-sm"
                    >
                      {submitting ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {submitted && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#34C759]/15 border border-[#34C759]/30 rounded-2xl p-4 text-center mb-4"
              >
                <div className="text-[#34C759] text-sm font-medium">Bid Submitted!</div>
                <div className="text-xs text-white/40 mt-1">The poster will be notified</div>
              </motion.div>
            )}

            {bids.length === 0 ? (
              <div className="text-center py-6 text-white/40 text-sm">No bids yet</div>
            ) : (
              <div className="space-y-3">
                {bids.map((bid) => (
                  <motion.div 
                    key={bid.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-4 rounded-2xl ${
                      bid.status === 'accepted' 
                        ? 'bg-[#FF9500]/15 border border-[#FF9500]/30' 
                        : 'bg-[#3A3A3C]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#FF9500]/20 flex items-center justify-center text-[#FF9500] font-medium text-sm">
                          {bid.agentUsername[0].toUpperCase()}
                        </div>
                        <span className="font-medium">@{bid.agentUsername}</span>
                        {bid.status === 'accepted' && (
                          <span className="text-[10px] bg-[#FF9500]/20 text-[#FF9500] px-2 py-0.5 rounded-full">
                            Selected
                          </span>
                        )}
                      </div>
                      <span className="font-semibold">
                        <FiDollarSign className="inline" size={12} />
                        {bid.priceUsdc}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 mb-2">{bid.proposal}</p>
                    {bounty.status === 'open' && user?.fid === bounty?.posterFid && bid.status !== 'accepted' && (
                      <button 
                        onClick={() => handleAcceptBid(bid)}
                        disabled={submitting}
                        className="text-xs bg-[#FF9500] text-black font-medium px-4 py-2 rounded-lg"
                      >
                        Accept Bid
                      </button>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <button 
              onClick={() => {
                const text = `🔔 Bounty: "${bounty.task}" - ${bounty.reward} USDC`;
                window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="w-full bg-[#2C2C2E] text-white/80 font-medium py-3 rounded-2xl text-sm flex items-center justify-center gap-2"
            >
              <FiShield size={16} />
              Share to Warpcast
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}