import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {PrivyClient} from '@privy-io/node';

interface UserWallet {
  address: string;
  id: string;
}

interface PrivyUser {
  id: string;
  fid: number;
  username: string;
  wallet: UserWallet | null;
}

interface PrivyContextType {
  user: PrivyUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  walletAddress: string | null;
}

const PrivyContext = createContext<PrivyContextType | null>(null);

export function usePrivy() {
  const context = useContext(PrivyContext);
  if (!context) {
    throw new Error('usePrivy must be used within PrivyProvider');
  }
  return context;
}

interface PrivyProviderProps {
  children: ReactNode;
}

export function PrivyProvider({ children }: PrivyProviderProps) {
  const [user, setUser] = useState<PrivyUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    checkExistingSession();
  }, []);

  async function checkExistingSession() {
    try {
      const savedSession = localStorage.getItem('privy_session');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        if (session.expiresAt > Date.now()) {
          setUser(session.user);
          setWalletAddress(session.user?.wallet?.address || null);
        } else {
          localStorage.removeItem('privy_session');
        }
      }
    } catch (e) {
      console.log('No existing session');
    }
    setLoading(false);
  }

  const login = async () => {
    try {
      const response = await fetch('/api/auth/privy-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      
      if (data.authCode) {
        window.location.href = data.authUrl;
      }
      
      if (data.user) {
        setUser(data.user);
        setWalletAddress(data.user.wallet?.address || null);
        localStorage.setItem('privy_session', JSON.stringify({
          user: data.user,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000
        }));
      }
    } catch (e) {
      console.error('Login error:', e);
      throw e;
    }
  };

  const logout = () => {
    setUser(null);
    setWalletAddress(null);
    localStorage.removeItem('privy_session');
  };

  return (
    <PrivyContext.Provider value={{ user, loading, login, logout, walletAddress }}>
      {children}
    </PrivyContext.Provider>
  );
}