import { useCallback, useEffect, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, RefreshCw, Trash2, Pencil, UserCheck, Download, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import DataTable, { type Column, useTablePrefs, ColumnsMenu } from "../components/DataTable";
import { BulkDeleteBar } from "../components/BulkDeleteBar";
import { useBulkDelete } from "../hooks/useBulkDelete";
import StatusBadge from "../components/StatusBadge";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityList } from "../hooks/useEntityList";
import { useOrganization } from "../OrganizationContext";
import * as UserBackend from "../backend/UserBackend";
import type { User } from "../backend/UserBackend";

export default function UserListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const modal = useModal();
  const { selectedOrg, setSelectedOrg, isAll, getNewEntityOwner } = useOrganization();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState<Record<string, unknown>[]>([]);
  const [uploadColumns, setUploadColumns] = useState<string[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userFilter, setUserFilter] = useState<"active" | "deleted" | "all">("active");

  // Switch org context when navigated with ?owner=xxx
  useEffect(() => {
    const ownerParam = searchParams.get("owner");
    if (ownerParam && ownerParam !== selectedOrg) {
      setSelectedOrg(ownerParam);
    }
  }, [searchParams]);

  // Original: "All" → getGlobalUsers(), specific org → getUsers(orgName)
  const fetchFn = useCallback(async (params: Parameters<typeof UserBackend.getUsers>[0]) => {
    const res = isAll
      ? await UserBackend.getGlobalUsers(params)
      : await UserBackend.getUsers({ ...params, owner: selectedOrg });
    if (res.status === "ok" && Array.isArray(res.data)) {
      if (userFilter === "active") {
        res.data = res.data.filter((u: any) => !u.isDeleted);
      } else if (userFilter === "deleted") {
        res.data = res.data.filter((u: any) => u.isDeleted);
      }
    }
    return res;
  }, [isAll, selectedOrg, userFilter]);

  const list = useEntityList<User>({
    queryKey: "users",
    fetchFn,
    owner: isAll ? "global" : selectedOrg,
    extraKeys: [userFilter],
  });
  const prefs = useTablePrefs({ persistKey: "list:users" });
  const bulkDelete = useBulkDelete<User>(UserBackend.deleteUser, list.refetch);

  // Deferred create: navigate to the edit page in "new" mode without
  // calling /api/add-user. The actual POST happens when the admin clicks
  // Save on the edit page. Prior behavior pre-created a placeholder user
  // (`user_abc123`) on every click, leaving junk rows whenever someone
  // closed the tab without saving.
  const handleAdd = () => {
    navigate(`/users/${getNewEntityOwner()}/new`, { state: { mode: "add" } });
  };

  const handleDelete = (record: User, e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.name === "admin" && record.owner === "built-in") {
      modal.toast("Cannot delete built-in admin user", "error");
      return;
    }
    modal.showConfirm(`${t("common.confirmDelete")} [${record.displayName || record.name}]`, async () => {
      const res = await UserBackend.deleteUser(record);
      if (res.status === "ok") list.refetch();
      else modal.toast(res.msg || t("common.deleteFailed" as any), "error");
    });
  };

  const handleImpersonate = (record: User, e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.isDeleted) {
      modal.toast(t("users.impersonate.deletedUser" as any), "error");
      return;
    }
    if (record.isForbidden) {
      modal.toast(t("users.impersonate.forbiddenUser" as any), "error");
      return;
    }
    modal.showConfirm(`${t("users.impersonate.confirm" as any)} "${record.owner}/${record.name}"?`, async () => {
      const res: any = await UserBackend.impersonateUser(record.owner, record.name);
      if (res.status === "ok") {
        window.location.href = "/";
      } else {
        const { friendlyError } = await import("../utils/errorHelper");
        modal.toast(friendlyError(res.msg, t) || t("users.impersonate.failed" as any), "error");
      }
    });
  };

  const boolCol = (val: unknown) => <StatusBadge status={val ? "active" : "inactive"} label={val ? t("common.yes") : t("common.no")} />;
  const textCol = (val: unknown) => <span className="text-text-secondary text-[12px]">{String(val || "—")}</span>;

  const USER_FIELDS = [
    "owner", "name", "password", "display_name", "id", "type", "email", "phone", "country_code",
    "is_admin", "homepage", "birthday", "gender", "password_type", "password_salt", "external_id", "avatar", "first_name", "last_name",
    "avatar_type", "permanent_avatar", "email_verified", "region", "location", "address",
    "affiliation", "title", "id_card_type", "id_card", "real_name", "is_verified", "bio", "tag", "language",
    "education", "score", "karma", "ranking", "balance", "balance_credit", "balance_currency", "currency", "is_default_avatar", "is_online",
    "is_forbidden", "is_deleted", "signup_application", "register_type", "register_source", "hash", "pre_hash", "access_token",
    "created_ip", "last_signin_time", "last_signin_ip", "github", "google", "qq", "wechat", "facebook", "dingtalk",
    "weibo", "gitee", "linkedin", "wecom", "lark", "gitlab", "adfs", "baidu", "alipay", "casdoor", "infoflow", "apple",
    "azuread", "azureadb2c", "slack", "steam", "bilibili", "okta", "douyin", "kwai", "line", "amazon", "auth0",
    "battlenet", "bitbucket", "box", "cloudfoundry", "dailymotion", "deezer", "digitalocean", "discord", "dropbox",
    "eveonline", "fitbit", "gitea", "heroku", "influxcloud", "instagram", "intercom", "kakao", "lastfm", "mailru",
    "meetup", "microsoftonline", "naver", "nextcloud", "onedrive", "oura", "patreon", "paypal", "salesforce", "shopify",
    "soundcloud", "spotify", "strava", "stripe", "tiktok", "tumblr", "twitch", "twitter", "typetalk", "uber", "vk",
    "wepay", "xero", "yahoo", "yammer", "yandex", "zoom", "metamask", "web3onboard", "custom", "webauthnCredentials",
    "preferred_mfa_type", "recovery_codes", "totp_secret", "mfa_phone_enabled", "mfa_email_enabled", "invitation",
    "invitation_code", "face_ids", "ldap", "properties", "roles", "permissions", "groups", "last_change_password_time",
    "last_signin_wrong_time", "signin_wrong_times", "managedAccounts", "mfaAccounts", "mfaItems", "need_update_password",
    "created_time", "updated_time", "deleted_time", "ip_whitelist",
  ];

  // Translate field name to "DisplayLabel#field_name" format (matching original)
  const getUserColumnLabel = (field: string): string => {
    // Try i18n key first
    const i18nKey = `userField.${field}`;
    const translated = t(i18nKey as any);
    if (translated !== i18nKey) return `${translated}#${field}`;

    // Fallback: auto-generate label from field name
    const SPECIAL: Record<string, string> = {
      webauthnCredentials: "WebAuthn credentials",
      region: "Country/Region",
      mfaAccounts: "MFA accounts",
      mfaItems: "MFA items",
      face_ids: "Face ID",
      managedAccounts: "Managed accounts",
      owner: "Organization",
    };
    let label = SPECIAL[field];
    if (!label) {
      label = field.toLowerCase().split("_").join(" ");
      label = label.charAt(0).toUpperCase() + label.slice(1);
      label = label.replace("ip", "IP").replace("Ip", "IP").replace("Id", "ID").replace("id", "ID");
    }
    return `${label}#${field}`;
  };

  const handleDownloadTemplate = () => {
    const row: Record<string, null> = {};
    USER_FIELDS.forEach((f) => { row[getUserColumnLabel(f)] = null; });
    const ws = XLSX.utils.json_to_sheet([row]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "import-user.xlsx", { compression: true });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        if (!wb.SheetNames?.length) { modal.toast(t("users.upload.noSheets" as any), "error"); return; }
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
        const cols = Object.keys(json[0] ?? {});
        setUploadData(json);
        setUploadColumns(cols);
        setUploadFile(file);
        setShowUploadModal(true);
      } catch (err: any) {
        modal.toast(err.message || t("users.upload.parseFailed" as any), "error");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleUploadConfirm = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch("/api/upload-users", { method: "POST", body: formData, credentials: "include" }).then((r) => r.json());
      if (res.status === "ok") {
        modal.toast(t("users.upload.success" as any));
        list.refetch();
      } else {
        modal.toast(res.msg || t("users.upload.failed" as any), "error");
      }
    } catch (err: any) {
      modal.toast(err.message || t("users.upload.failed" as any), "error");
    } finally {
      setUploading(false);
      setShowUploadModal(false);
      setUploadData([]);
      setUploadColumns([]);
      setUploadFile(null);
    }
  };

  const columns: Column<User>[] = [
    {
      key: "owner", title: t("col.organization" as any), sortable: true, filterable: true, fixed: "left" as const, width: "120px",
      render: (_, r) => <Link to={`/organizations/admin/${r.owner}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.owner}</Link>,
    },
    {
      key: "signupApplication", title: t("col.signupApp" as any), sortable: true, filterable: true, fixed: "left" as const, width: "120px",
      render: (_, r) => r.signupApplication
        ? <Link to={`/applications/${r.owner}/${r.signupApplication}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{String(r.signupApplication)}</Link>
        : <span className="text-text-muted text-[12px]">—</span>,
    },
    {
      key: "name", title: t("col.name" as any), sortable: true, filterable: true, fixed: "left" as const, width: "110px",
      render: (_, r) => <Link to={`/users/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{r.name}</Link>,
    },
    {
      key: "createdTime", title: t("col.created" as any), sortable: true, width: "160px",
      render: (_, r) => <span className="text-[12px] text-text-muted font-mono">{r.createdTime ? new Date(r.createdTime).toLocaleString() : "—"}</span>,
    },
    { key: "displayName", title: t("col.displayName" as any), sortable: true, filterable: true, width: "130px" },
    {
      key: "avatar", title: t("col.avatar" as any), width: "80px",
      render: (_, r) => r.avatar
        ? <img src={r.avatar} alt="" className="h-8 w-8 rounded-full object-cover border border-border" referrerPolicy="no-referrer" />
        : <div className="h-8 w-8 rounded-full bg-surface-3 flex items-center justify-center text-[10px] font-bold text-text-muted">{String(r.displayName ?? r.name ?? "?")[0]}</div>,
    },
    {
      key: "email", title: t("col.email" as any), sortable: true, filterable: true, width: "160px",
      render: (_, r) => r.email ? <a href={`mailto:${r.email}`} className="text-accent hover:underline text-[12px]" onClick={(e) => e.stopPropagation()}>{r.email}</a> : <span className="text-text-muted text-[12px]">—</span>,
    },
    { key: "phone", title: t("col.phone" as any), sortable: true, filterable: true, width: "120px", render: (_, r) => textCol(r.phone) },
    { key: "affiliation", title: t("col.affiliation" as any), sortable: true, filterable: true, width: "140px", render: (_, r) => textCol(r.affiliation) },
    { key: "realName", title: t("col.realName" as any), sortable: true, filterable: true, width: "120px", render: (_, r) => textCol(r.realName) },
    { key: "isVerified", title: t("col.isVerified" as any), sortable: true, width: "120px", render: (_, r) => boolCol(r.isVerified) },
    { key: "region", title: t("col.region" as any), sortable: true, filterable: true, width: "140px", render: (_, r) => textCol(r.region) },
    { key: "type", title: t("col.userType" as any), sortable: true, filterable: true, width: "120px", render: (_, r) => textCol(r.type) },
    { key: "tag", title: t("col.tag" as any), sortable: true, filterable: true, width: "110px", render: (_, r) => textCol(r.tag) },
    { key: "registerType", title: t("col.registerType" as any), sortable: true, filterable: true, width: "150px", render: (_, r) => textCol(r.registerType) },
    { key: "registerSource", title: t("col.registerSource" as any), sortable: true, filterable: true, width: "150px", render: (_, r) => textCol(r.registerSource) },
    { key: "balance", title: t("col.balance" as any), sortable: true, width: "120px", render: (_, r) => <span className="font-mono text-[12px] text-text-muted">{String(r.balance ?? "—")}</span> },
    { key: "balanceCredit", title: t("col.balanceCredit" as any), sortable: true, width: "120px", render: (_, r) => <span className="font-mono text-[12px] text-text-muted">{String(r.balanceCredit ?? "—")}</span> },
    { key: "balanceCurrency", title: t("col.balanceCurrency" as any), sortable: true, width: "140px", render: (_, r) => textCol(r.balanceCurrency) },
    { key: "isAdmin", title: t("col.admin" as any), sortable: true, width: "120px", render: (_, r) => boolCol(r.isAdmin) },
    { key: "isForbidden", title: t("col.forbidden" as any), sortable: true, width: "110px", render: (_, r) => boolCol(r.isForbidden) },
    { key: "isDeleted", title: t("col.deleted" as any), sortable: true, width: "110px", render: (_, r) => boolCol(r.isDeleted) },
    {
      key: "__actions",
      fixed: "right" as const,
      title: t("common.action" as any),
      width: "120px",
      render: (_, r) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => handleImpersonate(r, e)}
            className="rounded p-1.5 text-text-muted hover:text-success hover:bg-success/10 transition-colors"
            title={t("users.impersonate.title" as any)}
          >
            <UserCheck size={14} />
          </button>
          <Link to={`/users/${r.owner}/${r.name}`} className="rounded p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 transition-colors" onClick={(e) => e.stopPropagation()}>
            <Pencil size={14} />
          </Link>
          <button
            onClick={(e) => handleDelete(r, e)}
            disabled={r.name === "admin" && r.owner === "built-in"}
            className="rounded p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("users.title" as any)}</h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            {t("users.subtitle" as any)}
            {!isAll && <span className="ml-2 font-mono text-accent">({selectedOrg})</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter: Active / Deleted / All */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {([
              { key: "active", label: t("users.filter.active" as any) },
              { key: "deleted", label: t("users.filter.deleted" as any) },
              { key: "all", label: t("users.filter.all" as any) },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setUserFilter(key)}
                className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${userFilter === key ? "bg-accent text-white" : "text-text-secondary hover:bg-surface-2"}`}>
                {label}
              </button>
            ))}
          </div>
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }} onClick={list.refetch} className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors">
            <RefreshCw size={15} />
          </motion.button>
          <ColumnsMenu columns={columns} hidden={prefs.hidden} onToggle={prefs.toggleHidden} onResetWidths={prefs.resetWidths} />
          <button onClick={handleAdd} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors">
            <Plus size={15} />
            {t("users.addUser" as any)}
          </button>
          <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
            <Download size={15} />
            {t("users.downloadTemplate" as any)}
          </button>
          <label className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors cursor-pointer">
            <Upload size={15} />
            {t("users.uploadXlsx" as any)}
            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileSelect} className="hidden" />
          </label>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={list.items}
        rowKey="name"
        loading={list.loading}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onSort={list.handleSort}
        onFilter={list.handleFilter}
        emptyText={t("common.noData")}
        hidden={prefs.hidden}
        widths={prefs.widths}
        onWidthChange={prefs.setWidth}
        resizable
        selectable
        bulkActions={({ selected, clear }) => (
          <BulkDeleteBar selected={selected} clear={clear} onDelete={bulkDelete} />
        )}
      />

      {/* Upload Preview Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => { setShowUploadModal(false); setUploadData([]); setUploadColumns([]); setUploadFile(null); }}>
          <div onClick={(e) => e.stopPropagation()} className="bg-surface-1 rounded-xl border border-border shadow-xl w-[90vw] max-h-[80vh] flex flex-col">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-text-primary">{t("users.uploadXlsx" as any)} ({uploadData.length} {t("users.upload.rows" as any)})</h3>
              <button onClick={() => { setShowUploadModal(false); setUploadData([]); setUploadColumns([]); setUploadFile(null); }}
                className="text-text-muted hover:text-text-primary transition-colors text-[18px]">×</button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left border-collapse" style={{ minWidth: "max-content" }}>
                <thead>
                  <tr className="border-b border-border bg-surface-2/50">
                    {uploadColumns.map((col) => (
                      <th key={col} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadData.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className="border-b border-border-subtle">
                      {uploadColumns.map((col) => (
                        <td key={col} className="px-3 py-1.5 text-[12px] text-text-primary whitespace-nowrap">{row[col] != null ? String(row[col]) : ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setShowUploadModal(false); setUploadData([]); setUploadColumns([]); setUploadFile(null); }}
                className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">{t("common.cancel")}</button>
              <button onClick={handleUploadConfirm} disabled={uploading}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {uploading ? t("users.upload.uploading" as any) : t("users.upload.confirmUpload" as any)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
