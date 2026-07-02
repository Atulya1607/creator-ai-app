import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api, User, setToken } from '@/src/api';
import { storage } from '@/src/utils/storage';

const TOKEN_KEY = 'creator_ai_token';

type Ctx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const tok = await storage.getItem<string | null>(TOKEN_KEY, null);
      if (tok && typeof tok === 'string') {
        const u = await api.me();
        setUser(u);
      }
    } catch {
      await setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const signIn = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await setToken(r.token);
    setUser(r.user);
  };

  const signUp = async (email: string, password: string, name: string) => {
    const r = await api.signup(email, password, name);
    await setToken(r.token);
    setUser(r.user);
  };

  const signOut = async () => {
    await setToken(null);
    setUser(null);
  };

  const refresh = async () => {
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      // ignore
    }
  };

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut, refresh, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}
