import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { hasNickname, type Profile } from '@/lib/auth/types';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  hasNickname: boolean;
  requestOtp: (args: { email: string }) => Promise<{ error: string | null }>;
  verifyOtp: (args: {
    email: string;
    token: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  saveNickname: (args: { nickname: string }) => Promise<{ error: string | null }>;
  setDebugLogging: (args: {
    enabled: boolean;
  }) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Loads session + profile and exposes email OTP auth helpers.
 */
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(function subscribeToAuth() {
    let isMounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }
      setSession(data.session);
      if (data.session?.user.id) {
        await loadProfile(data.session.user.id, isMounted);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    }

    void bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      function handleAuthChange(_event, nextSession) {
        setSession(nextSession);
        if (nextSession?.user.id) {
          void loadProfile(nextSession.user.id, true);
        } else {
          setProfile(null);
          setIsLoading(false);
        }
      },
    );

    async function loadProfile(userId: string, allowSetState: boolean) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nickname, is_team, debug_logging')
        .eq('id', userId)
        .maybeSingle();

      if (!allowSetState) {
        return;
      }

      if (error) {
        console.warn('Failed to load profile', error.message);
        setProfile(null);
      } else {
        setProfile((data as Profile | null) ?? null);
      }
      setIsLoading(false);
    }

    return function cleanup() {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function requestOtp(args: { email: string }) {
    const email = args.email.trim().toLowerCase();
    if (!email) {
      return { error: 'Enter your email address.' };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // Empty nickname so new accounts hit profile setup (trigger coalesce keeps '').
        data: { nickname: '' },
      },
    });

    return { error: error?.message ?? null };
  }

  async function verifyOtp(args: { email: string; token: string }) {
    const email = args.email.trim().toLowerCase();
    const token = args.token.trim();
    if (!email || !token) {
      return { error: 'Enter the email and the code from your inbox.' };
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    const userId = session?.user.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, is_team, debug_logging')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Failed to refresh profile', error.message);
      return;
    }

    setProfile((data as Profile | null) ?? null);
  }

  async function saveNickname(args: { nickname: string }) {
    const userId = session?.user.id;
    if (!userId) {
      return { error: 'Not signed in.' };
    }

    const nickname = args.nickname.trim();
    if (nickname.length < 2) {
      return { error: 'Nickname needs at least 2 characters.' };
    }
    if (nickname.length > 24) {
      return { error: 'Nickname must be 24 characters or fewer.' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ nickname })
      .eq('id', userId)
      .select('id, nickname, is_team, debug_logging')
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    setProfile((data as Profile | null) ?? null);
    return { error: null };
  }

  async function setDebugLogging(args: { enabled: boolean }) {
    const userId = session?.user.id;
    if (!userId) {
      return { error: 'Not signed in.' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ debug_logging: args.enabled })
      .eq('id', userId)
      .select('id, nickname, is_team, debug_logging')
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    setProfile((data as Profile | null) ?? null);
    return { error: null };
  }

  const value: AuthContextValue = {
    session,
    profile,
    isLoading,
    hasNickname: hasNickname(profile),
    requestOtp,
    verifyOtp,
    signOut,
    saveNickname,
    setDebugLogging,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Auth session, profile, and email OTP helpers. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
