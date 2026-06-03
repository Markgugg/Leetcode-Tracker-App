import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  init: () => Promise<void>;
  signOut: () => Promise<void>;
}

let _authSub: { unsubscribe: () => void } | null = null;

export const useAuth = create<AuthState>((set) => ({
  session: null,
  loading: true,
  init: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      set({ session: data.session, loading: false });
    } catch {
      set({ loading: false });
    }
    _authSub?.unsubscribe();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });
    _authSub = subscription;
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null });
  },
}));
