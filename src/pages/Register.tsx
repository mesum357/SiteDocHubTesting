import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { Camera, Loader2 } from "lucide-react";
import { ROLES } from "@/lib/permissions";

export default function Register() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<string>(ROLES.FIELD_WORKER);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match");
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setErrorMsg("Password is too weak. It must be at least 6 characters long.");
      toast.error("Password is too weak. It must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          requested_role: role,
        },
      },
    });

    if (error) {
      setErrorMsg(error.message);
      toast.error(error.message);
    } else if (data.user && !data.session) {
      const msg = "Registration successful! Please check your email to verify your account.";
      setSuccessMsg(msg);
      toast.success(msg);
      // Optional: keep them on page to read the message instead of immediate navigate
      // navigate("/login");
    } else {
      const msg = "Registration successful! You can now log in.";
      setSuccessMsg(msg);
      toast.success(msg);
      setTimeout(() => navigate("/login"), 1500);
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
          <p className="text-sm text-ink-soft">Apply as worker</p>
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

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-base border-hairline text-ink"
                placeholder="John Doe"
              />
            </div>
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
              <Label>Worker Type</Label>
              <RadioGroup value={role} onValueChange={setRole} className="flex flex-col space-y-2 mt-2">
                <div className="flex items-center space-x-2 rounded-lg border border-hairline p-3">
                  <RadioGroupItem value={ROLES.FIELD_WORKER} id="r1" />
                  <Label htmlFor="r1" className="cursor-pointer">Job Worker (Field)</Label>
                </div>
                <div className="flex items-center space-x-2 rounded-lg border border-hairline p-3">
                  <RadioGroupItem value={ROLES.OFFICE_STAFF} id="r2" />
                  <Label htmlFor="r2" className="cursor-pointer">Office Worker</Label>
                </div>
              </RadioGroup>
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-base border-hairline text-ink"
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button type="submit" className="w-full bg-accent hover:bg-accent/90" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Register
          </Button>
        </form>

        <div className="text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
