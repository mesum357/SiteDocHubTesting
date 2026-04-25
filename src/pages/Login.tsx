import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Camera, Loader2 } from "lucide-react";

export default function Login() {
  const { session } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // If already logged in, go to home
  if (session) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      toast.error(error.message);
    } else if (data?.user) {
      // Check if user is approved
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", data.user.id)
        .single();
        
      if (profileError || !profile || profile.status !== 'approved') {
        await supabase.auth.signOut();
        let msg = "Your account is still pending admin approval. Please wait for verification.";
        
        if (profile?.status === 'rejected') {
          msg = "Your account application has been rejected. Please contact support.";
        } else if (profile?.status === 'banned') {
          msg = "Your account has been banned. Please contact support.";
        } else if (profileError || !profile) {
          msg = "User profile not found. Please contact support.";
        }
        
        setErrorMsg(msg);
        toast.error(msg);
      } else {
        setSuccessMsg("Welcome back!");
        toast.success("Welcome back!");
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base p-4 text-ink">
      <div className="w-full max-w-md space-y-8 rounded-xl border border-hairline bg-surface p-8 shadow-xl">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-base font-bold shadow-lg shadow-accent/20">
            <Camera size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-white">
            Sitedochub
          </h1>
          <p className="text-sm text-ink-soft">Sign in to your account</p>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-500">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-base border-hairline text-ink"
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-base border-hairline text-ink"
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sign In
          </Button>
        </form>

        <div className="text-center text-sm text-ink-soft">
          Need an account?{" "}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Apply as a worker
          </Link>
        </div>
      </div>
    </div>
  );
}
