import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { ROLE_LABELS, type UserRole } from "@/lib/permissions";
import { Shield, User, Loader2, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const myUserId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load users");
    } else {
      setUsers(data as Profile[]);
    }
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (error) {
      toast.error("Failed to update role");
    } else {
      toast.success("Role updated successfully");
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-base text-ink">
      <header className="glass sticky top-0 z-30 flex h-14 md:h-16 items-center border-b border-hairline px-4">
        <Link to="/" className="flex items-center gap-2 text-sm font-medium text-ink-secondary hover:text-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to App
        </Link>
        <div className="mx-auto flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent" />
          <span className="font-display font-medium">User Management</span>
        </div>
        <div className="w-24" /> {/* Spacer for centering */}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <div className="rounded-xl border border-hairline bg-surface shadow-sm">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline text-ink-secondary">
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-hairline/50 hover:bg-elevated/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-medium text-ink">{u.full_name}</div>
                            <div className="font-mono-data text-xs text-ink-secondary">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={u.role}
                          disabled={u.id === myUserId}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="rounded-md border border-hairline bg-elevated px-2 py-1.5 text-xs font-medium text-ink outline-none transition-colors focus:border-accent disabled:opacity-50"
                        >
                          {Object.entries(ROLE_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4 font-mono-data text-xs text-ink-secondary">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
