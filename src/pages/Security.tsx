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
import { createClient } from "@supabase/supabase-js";

function isLocalhostOrigin(origin: string) {
  return (
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("0.0.0.0")
  );
}

function getEmailRedirectTo() {
  const explicit = import.meta.env.VITE_AUTH_REDIRECT_TO as string | undefined;
  if (explicit && explicit.trim()) return explicit.trim();

  const origin = window.location.origin;
  // Many Supabase projects reject redirect_to values not in Auth settings.
  // In dev, localhost origins are often NOT allow-listed, causing a 400.
  if (isLocalhostOrigin(origin)) return undefined;
  return origin;
}

function getErrMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: string }).message;
    if (msg && typeof msg === "string") return msg;
  }
  return fallback;
}

function getErrCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const anyErr = err as Record<string, unknown>;
  const code =
    (typeof anyErr.code === "string" && anyErr.code) ||
    (typeof anyErr.error_code === "string" && anyErr.error_code);
  return code || undefined;
}

async function assertWritableStorage() {
  if (!("storage" in navigator) || !navigator.storage?.estimate) return;
  const estimate = await navigator.storage.estimate();
  const quota = estimate.quota ?? 0;
  const usage = estimate.usage ?? 0;
  // Keep a small safety buffer so auth/session writes don't fail.
  const free = quota - usage;
  const minFreeBytes = 8 * 1024 * 1024; // 8MB
  if (quota > 0 && free < minFreeBytes) {
    throw new Error(
      "Device/browser storage is full. Free some space and retry account updates."
    );
  }
}

function toUserFriendlyError(err: unknown, fallback: string) {
  const raw = getErrMessage(err, fallback);
  const lower = raw.toLowerCase();
  const code = getErrCode(err);

  if (
    lower.includes("file_error_no_space") ||
    lower.includes("no_space") ||
    lower.includes("quota")
  ) {
    return "Your browser storage is full. Free up storage and try again.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Current password is incorrect.";
  }
  if (lower.includes("same as the old password")) {
    return "New password must be different from your current password.";
  }
  if (lower.includes("new email address should be different")) {
    return "New email must be different from your current email.";
  }
  if (
    code === "email_address_invalid" ||
    (lower.includes("email address") && lower.includes("is invalid"))
  ) {
    return (
      "Supabase rejected this email address. This is usually caused by Auth settings " +
      "(domain allowlist, SMTP configuration, or strict email validation) rather than a typing mistake. " +
      "Try a different email domain or update Supabase Auth settings."
    );
  }

  return raw;
}

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

    // IMPORTANT: verify password using an ephemeral, in-memory client so we don't
    // disrupt the active session or depend on browser storage for session writes.
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const supabaseKey =
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
      (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase is not configured (missing env vars).");
    }

    const randomId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());

    const ephemeral = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        // Use a unique storage key so Supabase doesn't warn about multiple clients
        // competing over the same key (even though we don't persist).
        storageKey: `SiteDocHB-reauth-${randomId}`,
      },
    });

    const { error } = await ephemeral.auth.signInWithPassword({
      email: user.email,
      password: password,
    });
    if (error) throw error;
  };

  const handleNameUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!navigator.onLine) {
      toast.error("You must be online to update account settings.");
      return;
    }
    if (!fullName.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (!currentPasswordForName) {
      toast.error("Enter your password to change name.");
      return;
    }
    const nextName = fullName.trim();
    const currentName = (user.user_metadata?.full_name as string | undefined)?.trim() ?? "";
    if (nextName === currentName) {
      toast.info("Name is unchanged.");
      return;
    }
    setSavingName(true);
    try {
      await assertWritableStorage();
      await reauthenticate(currentPasswordForName);
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
      const message = toUserFriendlyError(err, "Failed to update name.");
      toast.error(message);
    } finally {
      setSavingName(false);
    }
  };

  const handleEmailUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!navigator.onLine) {
      toast.error("You must be online to change email.");
      return;
    }
    if (!newEmail.trim()) {
      toast.error("Email cannot be empty.");
      return;
    }
    if (!currentPasswordForEmail) {
      toast.error("Enter your current password to change email.");
      return;
    }
    const normalizedEmail = newEmail.trim().toLowerCase();
    const currentEmail = (user.email ?? "").toLowerCase();
    if (normalizedEmail === currentEmail) {
      toast.info("New email is the same as current email.");
      return;
    }
    setSavingEmail(true);
    try {
      await assertWritableStorage();
      await reauthenticate(currentPasswordForEmail);
      const emailRedirectTo = getEmailRedirectTo();
      const { error } = emailRedirectTo
        ? await supabase.auth.updateUser(
            { email: normalizedEmail },
            { emailRedirectTo }
          )
        : await supabase.auth.updateUser({ email: normalizedEmail });
      if (error) throw error;
      toast.success("Email update requested. Please verify your new email.");
      setCurrentPasswordForEmail("");
      setNewEmail(normalizedEmail);
    } catch (err: unknown) {
      const message = toUserFriendlyError(err, "Failed to update email.");
      toast.error(message);
    } finally {
      setSavingEmail(false);
    }
  };

  const handlePasswordUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      toast.error("You must be online to change password.");
      return;
    }
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
    if (newPassword === currentPasswordForPassword) {
      toast.error("New password must be different from current password.");
      return;
    }
    setSavingPassword(true);
    try {
      await assertWritableStorage();
      await reauthenticate(currentPasswordForPassword);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Password updated.");
      setCurrentPasswordForPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const message = toUserFriendlyError(err, "Failed to update password.");

      // Some Supabase Auth configs require an additional reauthentication nonce for password updates.
      // If that's enabled, the browser SDK cannot satisfy it directly; fall back to reset-email flow.
      if (/reauth|current password required|update requires reauthentication/i.test(message)) {
        try {
          const email = user?.email;
          if (!email) throw new Error("No authenticated email found.");
          const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/security`,
          });
          if (resetErr) throw resetErr;
          toast.success("Password reset email sent. Open it to set a new password.");
        } catch (resetFlowErr: unknown) {
          toast.error(toUserFriendlyError(resetFlowErr, message));
        }
      } else {
        toast.error(message);
      }
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

