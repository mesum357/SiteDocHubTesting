import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { ROLE_LABELS, STATUS_LABELS, type UserRole, type UserStatus } from "@/lib/permissions";
import { Shield, User, Loader2, ArrowLeft, Check, X, Clock, Trash2, ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
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

  const handleStatusChange = async (userId: string, newStatus: UserStatus) => {
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", userId);

    if (error) {
      toast.error(`Failed to ${newStatus} user`);
    } else {
      toast.success(`User ${newStatus} successfully`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      );
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This will only remove their profile, not their login account.")) return;

    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) {
      toast.error("Failed to delete user profile");
    } else {
      toast.success("User profile deleted successfully");
      setUsers((prev) => prev.filter((u) => u.id !== userId));
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
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
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
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-elevated/50 px-2.5 py-1 text-xs font-medium text-ink">
                          {ROLE_LABELS[u.role]}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                          u.status === 'approved' ? 'bg-green-500/10 text-green-500' :
                          u.status === 'rejected' ? 'bg-red-500/10 text-red-500' :
                          u.status === 'banned' ? 'bg-red-500/10 text-red-500' :
                          'bg-amber-500/10 text-amber-500'
                        }`}>
                          {u.status === 'approved' && <Check className="h-3 w-3" />}
                          {u.status === 'rejected' && <X className="h-3 w-3" />}
                          {u.status === 'banned' && <ShieldAlert className="h-3 w-3" />}
                          {u.status === 'pending' && <Clock className="h-3 w-3" />}
                          {STATUS_LABELS[u.status]}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {/* Pending Users: Approve or Reject */}
                          {u.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleStatusChange(u.id, 'approved')}
                                className="rounded-lg border border-hairline bg-surface p-2 text-green-500 hover:bg-green-500/10 transition-colors"
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(u.id, 'rejected')}
                                className="rounded-lg border border-hairline bg-surface p-2 text-red-500 hover:bg-red-500/10 transition-colors"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}

                          {/* Approved Users: Ban or Delete */}
                          {u.status === 'approved' && u.id !== myUserId && (
                            <>
                              <button
                                onClick={() => handleStatusChange(u.id, 'banned')}
                                className="rounded-lg border border-hairline bg-surface p-2 text-red-500 hover:bg-red-500/10 transition-colors"
                                title="Ban User"
                              >
                                <ShieldAlert className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="rounded-lg border border-hairline bg-surface p-2 text-ink-secondary hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                title="Delete User"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}

                          {/* Rejected or Banned Users: Can Approve again or Delete */}
                          {(u.status === 'rejected' || u.status === 'banned') && (
                            <>
                              <button
                                onClick={() => handleStatusChange(u.id, 'approved')}
                                className="rounded-lg border border-hairline bg-surface p-2 text-green-500 hover:bg-green-500/10 transition-colors"
                                title="Re-Approve"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="rounded-lg border border-hairline bg-surface p-2 text-ink-secondary hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                title="Delete User"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
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
