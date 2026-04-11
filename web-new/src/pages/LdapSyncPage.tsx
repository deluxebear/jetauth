import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, RefreshCw, Pencil, LogOut } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as LdapBackend from "../backend/LdapBackend";
import type { LdapUser, Ldap } from "../backend/LdapBackend";

export default function LdapSyncPage() {
  const { owner, id } = useParams<{ owner: string; id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const [ldap, setLdap] = useState<Ldap | null>(null);
  const [users, setUsers] = useState<LdapUser[]>([]);
  const [existUuids, setExistUuids] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!owner || !id) return;
    setLoading(true);
    try {
      const [ldapRes, usersRes] = await Promise.all([
        LdapBackend.getLdap(owner, id),
        LdapBackend.getLdapUsers(owner, id),
      ]);
      if (ldapRes.status === "ok" && ldapRes.data) {
        setLdap(ldapRes.data);
      }
      if (usersRes.status === "ok" && usersRes.data) {
        setUsers(usersRes.data.users ?? []);
        setExistUuids(usersRes.data.existUuids ?? []);
      } else {
        modal.toast(usersRes.msg || t("ldap.sync.fetchFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e.message || "Failed to fetch LDAP users", "error");
    } finally {
      setLoading(false);
    }
  }, [owner, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isSynced = (user: LdapUser) => existUuids.includes(user.uuid);

  const toggleSelect = (uuid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid); else next.add(uuid);
      return next;
    });
  };

  const toggleAll = () => {
    const unsyncedUuids = users.filter((u) => !isSynced(u)).map((u) => u.uuid);
    if (unsyncedUuids.every((u) => selected.has(u))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unsyncedUuids));
    }
  };

  const handleSync = async () => {
    const toSync = users.filter((u) => selected.has(u.uuid));
    if (toSync.length === 0) return;

    modal.showConfirm(
      `${t("ldap.sync.confirmSync" as any)} ${toSync.length} ${t("ldap.sync.users" as any)}?`,
      async () => {
        setSyncing(true);
        try {
          const res = await LdapBackend.syncLdapUsers(owner!, id!, toSync);
          if (res.status === "ok") {
            const data = res.data;
            const existCount = data?.exist?.length ?? 0;
            const failedCount = data?.failed?.length ?? 0;
            const successCount = toSync.length - existCount - failedCount;

            let msg = `${t("ldap.sync.synced" as any)}: ${successCount}`;
            if (existCount > 0) msg += `, ${t("ldap.sync.existed" as any)}: ${existCount}`;
            if (failedCount > 0) msg += `, ${t("ldap.sync.failed" as any)}: ${failedCount}`;

            modal.toast(msg, failedCount > 0 ? "error" : "success");
            setSelected(new Set());
            // Refresh
            fetchData();
          } else {
            modal.toast(res.msg || t("ldap.sync.syncFailed" as any), "error");
          }
        } catch (e: any) {
          modal.toast(e.message || t("ldap.sync.syncFailed" as any), "error");
        } finally {
          setSyncing(false);
        }
      }
    );
  };

  const unsyncedCount = users.filter((u) => !isSynced(u)).length;
  const allUnsyncedSelected = unsyncedCount > 0 && users.filter((u) => !isSynced(u)).every((u) => selected.has(u.uuid));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("ldap.sync.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{ldap?.serverName ?? `${owner}/${id}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSync} disabled={syncing || selected.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {syncing ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <RefreshCw size={14} />}
            {t("common.sync" as any)} ({selected.size})
          </button>
          <Link to={`/ldap/${owner}/${id}`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            <Pencil size={14} /> {t("ldap.sync.editLdap" as any)}
          </Link>
          <button onClick={() => navigate(`/organizations/admin/${owner}`)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            <LogOut size={14} /> {t("common.saveAndExit")}
          </button>
        </div>
      </div>

      {/* Users table */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-1 px-5 py-12 text-center text-[13px] text-text-muted">
          {t("ldap.sync.noUsers" as any)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-text-primary">
              {t("ldap.sync.ldapUsers" as any)} ({users.length})
              {unsyncedCount > 0 && <span className="text-text-muted font-normal ml-2">· {unsyncedCount} {t("ldap.sync.unsynced" as any)}</span>}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface-2/30">
                  <th className="px-3 py-2 w-10">
                    <input type="checkbox" checked={allUnsyncedSelected} onChange={toggleAll}
                      className="rounded border-border" disabled={unsyncedCount === 0} />
                  </th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">CN</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">UID</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">UID Number</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Group ID</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Email</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Phone</th>
                  <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Address</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const synced = isSynced(user);
                  return (
                    <tr key={user.uuid} className={`border-b border-border-subtle hover:bg-surface-2/30 ${synced ? "opacity-60" : ""}`}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={selected.has(user.uuid)} onChange={() => toggleSelect(user.uuid)}
                          disabled={synced} className="rounded border-border" />
                      </td>
                      <td className="px-3 py-1.5 text-[13px]">
                        <div className="flex items-center gap-2">
                          {user.cn}
                          {synced ? (
                            <span className="inline-flex items-center rounded-full bg-success/15 border border-success/20 px-1.5 py-0.5 text-[10px] font-medium text-success">{t("ldap.sync.syncedTag" as any)}</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-warning/15 border border-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">{t("ldap.sync.unsyncedTag" as any)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-[13px] font-mono">
                        {synced ? (
                          <Link to={`/users/${owner}/${user.uid}`} className="text-accent hover:underline">{user.uid}</Link>
                        ) : (
                          user.uid
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-[13px] font-mono text-text-secondary">{user.uidNumber}</td>
                      <td className="px-3 py-1.5 text-[13px] text-text-secondary">{user.groupId || user.gidNumber}</td>
                      <td className="px-3 py-1.5 text-[13px] text-text-secondary">{user.email}</td>
                      <td className="px-3 py-1.5 text-[13px] text-text-secondary">{user.mobile}</td>
                      <td className="px-3 py-1.5 text-[13px] text-text-secondary truncate max-w-[150px]">{user.address}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
}
