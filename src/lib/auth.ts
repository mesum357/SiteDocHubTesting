import { supabase } from "./supabaseClient";

/**
 * Send a magic link to the given email address.
 * The user will receive an OTP email and be redirected back to the app.
 */
export async function signInWithEmail(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}

/**
 * Sign the current user out and clear the session.
 */
export async function signOut() {
  return supabase.auth.signOut();
}

/**
 * Get the current authenticated user's role from the profiles table.
 * Returns null if not authenticated or profile not found.
 */
export async function getMyRole(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role ?? null;
}

/**
 * Admin-only: update another user's role.
 * RLS on the profiles table enforces that only admins can do this.
 */
export async function setUserRole(userId: string, role: string) {
  return supabase.from("profiles").update({ role }).eq("id", userId);
}
