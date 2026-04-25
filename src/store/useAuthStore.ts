import { create } from "zustand";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import type { UserRole, UserStatus } from "@/lib/permissions";

interface AuthState {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  status: UserStatus | null;
  initialized: boolean;
  
  initialize: () => void;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  role: null,
  status: null,
  initialized: false,

  initialize: () => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null });
      if (session?.user) {
        get().refreshRole();
      } else {
        set({ initialized: true });
      }
    });

    // 2. Listen to auth changes
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
      if (session?.user) {
        get().refreshRole();
      } else {
        set({ role: null, status: null, initialized: true });
      }
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  refreshRole: async () => {
    const user = get().user;
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();
      
      if (!error && data) {
        set({ 
          role: data.role as UserRole,
          status: (data.status || 'approved') as UserStatus 
        });
      }
    } catch (err) {
      console.error("[SiteDocHB] Failed to fetch user role:", err);
    } finally {
      set({ initialized: true });
    }
  },
}));
