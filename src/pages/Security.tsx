import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster as Sonner } from "@/components/ui/sonner";

export default function Security() {
  const user = useAuthStore((s) => s.user);
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? "");
  const [currentPasswordForName, setCurrentPasswordForName] = useState("");
  const [newEmail, setNewEmail] = useState(user?.email ?? "");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const reauthenticate = async (password: string) => {
    if (!user?.email) throw new Error("No authenticated email found.");
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (error) throw new Error("Current password is incorrect.");
  };

  const handleNameUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (!currentPasswordForName) {
      toast.error("Enter your password to change name.");
      return;
    }
    setSavingName(true);
    try {
      await reauthenticate(currentPasswordForName);
      const nextName = fullName.trim();
      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: nextName },
      });
      if (authErr) throw authErr;

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ full_name: nextName })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      toast.success("Name updated.");
      setCurrentPasswordForName("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update name.";
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  };

  const handleEmailUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newEmail.trim()) {
      toast.error("Email cannot be empty.");
      return;
    }
    if (!currentPasswordForEmail) {
      toast.error("Enter your current password to change email.");
      return;
    }
    setSavingEmail(true);
    try {
      await reauthenticate(currentPasswordForEmail);
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast.success("Email update requested. Please verify your new email.");
      setCurrentPasswordForEmail("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update email.";
      toast.error(message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPasswordForPassword) {
      toast.error("Enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      await reauthenticate(currentPasswordForPassword);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated.");
      setCurrentPasswordForPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update password.";
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-base text-ink">
      <header className="glass sticky top-0 z-30 flex h-14 items-center border-b border-hairline px-4 md:h-16">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-medium text-ink-secondary transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Back to App
        </Link>
        <div className="mx-auto flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" />
          <h1 className="font-display font-medium">Security</h1>
        </div>
        <div className="w-24" />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 md:p-6">
        <section className="rounded-xl border border-hairline bg-surface p-4 md:p-5">
          <h2 className="font-display text-base text-ink">Change Name</h2>
          <p className="mt-1 text-xs text-ink-secondary">Password is required to update your display name.</p>
          <form className="mt-4 space-y-3" onSubmit={handleNameUpdate}>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-base border-hairline text-ink"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currentPasswordForName">Current password</Label>
              <Input
                id="currentPasswordForName"
                type="password"
                value={currentPasswordForName}
                onChange={(e) => setCurrentPasswordForName(e.target.value)}
                className="bg-base border-hairline text-ink"
              />
            </div>
            <Button type="submit" disabled={savingName}>
              {savingName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update Name
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-hairline bg-surface p-4 md:p-5">
          <h2 className="font-display text-base text-ink">Change Email</h2>
          <p className="mt-1 text-xs text-ink-secondary">Password is required. Supabase may ask email confirmation.</p>
          <form className="mt-4 space-y-3" onSubmit={handleEmailUpdate}>
            <div className="space-y-1.5">
              <Label htmlFor="newEmail">New email</Label>
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="bg-base border-hairline text-ink"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currentPasswordForEmail">Current password</Label>
              <Input
                id="currentPasswordForEmail"
                type="password"
                value={currentPasswordForEmail}
                onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                className="bg-base border-hairline text-ink"
              />
            </div>
            <Button type="submit" disabled={savingEmail}>
              {savingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update Email
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-hairline bg-surface p-4 md:p-5">
          <h2 className="font-display text-base text-ink">Change Password</h2>
          <p className="mt-1 text-xs text-ink-secondary">Enter current password, then set a new one.</p>
          <form className="mt-4 space-y-3" onSubmit={handlePasswordUpdate}>
            <div className="space-y-1.5">
              <Label htmlFor="currentPasswordForPassword">Current password</Label>
              <Input
                id="currentPasswordForPassword"
                type="password"
                value={currentPasswordForPassword}
                onChange={(e) => setCurrentPasswordForPassword(e.target.value)}
                className="bg-base border-hairline text-ink"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-base border-hairline text-ink"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-base border-hairline text-ink"
              />
            </div>
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update Password
            </Button>
          </form>
        </section>
      </main>

      <Sonner
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "!bg-elevated !border-hairline !text-ink !font-sans",
          },
        }}
      />
    </div>
  );
}

