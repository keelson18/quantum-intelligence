import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UserRole } from '../lib/types';

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: UserRole;
  signUp: (data: SignUpData) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>('user');

  const loadRole = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    setRole((data?.role as UserRole) ?? 'user');
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        loadRole(data.session.user.id).finally(() => { if (mounted) setLoading(false); });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        loadRole(sess.user.id);
      } else {
        setRole('user');
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadRole]);

  const signUp = async ({ email, password, firstName, lastName, phone }: SignUpData) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message ?? 'Sign up failed' };
    if (!data.user) return { error: 'Sign up failed — no user returned' };

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id, first_name: firstName, last_name: lastName, phone, email,
    });
    if (profileError) {
      return { error: profileError.message ?? 'Account created, but profile save failed' };
    }

    // Roles are privileged: only verified server code may write them.
    try {
      await claimDefaultRole({ data: undefined });
    } catch (err) {
      console.warn('Default role assignment deferred', err);
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? (error.message ?? 'Sign in failed') : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole('user');
  };

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading, role, signUp, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
