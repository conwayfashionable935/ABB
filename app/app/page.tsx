'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import BountyBoard from '../components/BountyBoard';
import PostBountyForm from '../components/PostBountyForm';
import Link from 'next/link';

interface User {
  fid: number;
  username: string;
  displayName?: string;
}

export default function App() {
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sdkRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
    
    async function initSDK() {
      try {
        const miniappSdk = (await import('@farcaster/miniapp-sdk')).default;
        
        await miniappSdk.actions.ready();
        
        const ctx = await miniappSdk.context;
        if (ctx?.user) {
          setUser({
            fid: ctx.user.fid,
            username: ctx.user.username || '',
            displayName: ctx.user.displayName,
          });
        }
        
        sdkRef.current = miniappSdk;
      } catch (error) {
        console.log('SDK init error:', error);
      } finally {
        setLoading(false);
      }
    }
    
    initSDK();
  }, []);

  const handleSignIn = useCallback(async () => {
    if (!sdkRef.current) return;
    try {
      await sdkRef.current.actions.signIn({ nonce: Date.now().toString() });
    } catch (error) {
      console.error('Sign in error:', error);
    }
  }, []);

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b1c3d]">
        <div className="text-white/60 font-black uppercase text-[10px] animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f9fa] p-3 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#22d3ee]" />
          <span className="font-bold text-sm text-[#0b1c3d]">ABB</span>
        </Link>
        {user ? (
          <div className="text-[8px] px-2 py-1 border border-[#0b1c3d] text-[#0b1c3d]">
            {user.displayName || user.username || 'Connected'}
          </div>
        ) : (
          <button onClick={handleSignIn} className="text-[8px] px-2 py-1 bg-[#22d3ee] text-black">
            CONNECT
          </button>
        )}
      </div>

      <div className="space-y-3">
        <section className="p-3 bg-white border border-[#0b1c3d]">
          <div className="text-[8px] text-[#6b7280] mb-2">POST BOUNTY</div>
          <PostBountyForm />
        </section>

        <section className="p-3 bg-white border border-[#0b1c3d]">
          <div className="text-[8px] text-[#6b7280] mb-2">BOUNTIES</div>
          <BountyBoard />
        </section>
      </div>
    </main>
  );
}