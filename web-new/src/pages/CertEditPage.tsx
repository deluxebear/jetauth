import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, Copy, Download, LogOut} from "lucide-react";
import { FormField, FormSection, inputClass, monoInputClass } from "../components/FormSection";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as CertBackend from "../backend/CertBackend";
import type { Cert } from "../backend/CertBackend";
import { friendlyError } from "../utils/errorHelper";
import SimpleSelect from "../components/SimpleSelect";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";

const SCOPE_OPTIONS = [{ id: "JWT", name: "JWT" }];
const TYPE_OPTIONS = [
  { id: "x509", name: "x509" },
  { id: "SSL", name: "SSL" },
  { id: "Payment", name: "Payment" },
];

const NON_SSL_ALGORITHMS = [
  { id: "RS256", name: "RS256 (RSA + SHA256)" },
  { id: "RS384", name: "RS384 (RSA + SHA384)" },
  { id: "RS512", name: "RS512 (RSA + SHA512)" },
  { id: "ES256", name: "ES256 (ECDSA using P-256 + SHA256)" },
  { id: "ES384", name: "ES384 (ECDSA using P-384 + SHA384)" },
  { id: "ES512", name: "ES512 (ECDSA using P-521 + SHA512)" },
  { id: "PS256", name: "PS256 (RSASSA-PSS using SHA256)" },
  { id: "PS384", name: "PS384 (RSASSA-PSS using SHA384)" },
  { id: "PS512", name: "PS512 (RSASSA-PSS using SHA512)" },
];

const SSL_ALGORITHMS = [
  { id: "RSA", name: "RSA" },
  { id: "ECC", name: "ECC" },
];

const BIT_SIZE_OPTIONS = [
  { id: 1024, name: "1024" },
  { id: 2048, name: "2048" },
  { id: 4096, name: "4096" },
];

const SSL_PROVIDERS = [
  { id: "GoDaddy", name: "GoDaddy" },
  { id: "Aliyun", name: "Aliyun" },
];

export default function CertEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const [cert, setCert] = useState<Cert | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");

  const { entity, loading, invalidate: _invalidate, invalidateList } = useEntityEdit<Cert>({
    queryKey: "cert",
    owner,
    name,
    fetchFn: CertBackend.getCert,
  });

  useEffect(() => {
    if (entity) { setCert(entity); setOriginalJson(JSON.stringify(entity)); }
  }, [entity]);

  const isDirty = !!cert && originalJson !== "" && JSON.stringify(cert) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading || !cert) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const set = (key: string, val: unknown) => {
    setCert((prev) => prev ? { ...prev, [key]: val } : prev);
  };

  const handleTypeChange = (newType: string) => {
    if (newType === "SSL") {
      set("type", "SSL");
      set("cryptoAlgorithm", "RSA");
      set("certificate", "");
      set("privateKey", "");
    } else {
      set("type", newType);
      set("provider", "");
      set("account", "");
      set("accessKey", "");
      set("accessSecret", "");
      set("certificate", "");
      set("privateKey", "");
      set("expireTime", "");
      set("domainExpireTime", "");
    }
  };

  const handleAlgorithmChange = (algo: string) => {
    set("cryptoAlgorithm", algo);
    if (algo.startsWith("ES")) {
      set("bitSize", 0);
    } else if (![1024, 2048, 4096].includes(cert.bitSize)) {
      set("bitSize", 2048);
    }
    set("certificate", "");
    set("privateKey", "");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await CertBackend.updateCert(owner!, name!, cert);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(cert));
        setIsAddMode(false);
        invalidateList();
        if (cert.name !== name) {
          navigate(`/certs/${cert.owner}/${cert.name}`, { replace: true });
        }
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = await CertBackend.updateCert(owner!, name!, cert);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/certs");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = async () => {
    if (isAddMode) {
      await CertBackend.deleteCert(cert);
      invalidateList();
    }
    navigate("/certs");
  };

  const handleDelete = () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await CertBackend.deleteCert(cert);
        if (res.status === "ok") {
          invalidateList();
          navigate("/certs");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e) {
        console.error(e);
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isSSL = cert.type === "SSL";
  const isECDSA = cert.cryptoAlgorithm.startsWith("ES");
  const showBitSize = !isECDSA && !isSSL;
  const algorithmOptions = isSSL ? SSL_ALGORITHMS : NON_SSL_ALGORITHMS;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{isAddMode ? t("common.add") : t("common.edit")} {t("certs.title" as any)}</h1>
            <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} /> {t("common.delete")}
          </button>
                    <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Basic Info */}
      <FormSection title={t("certs.section.basic" as any)}>
        <FormField label={t("field.owner")}>
          <input value={cert.owner} disabled className={inputClass} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input value={cert.name} onChange={(e) => set("name", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input value={cert.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
        </FormField>
      </FormSection>

      {/* Type & Algorithm */}
      <FormSection title={t("certs.section.algorithm" as any)}>
        <FormField label={t("certs.field.scope" as any)}>
          <SimpleSelect value={cert.scope} options={SCOPE_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => set("scope", v)} />
        </FormField>
        <FormField label={t("field.type")}>
          <SimpleSelect value={cert.type} options={TYPE_OPTIONS.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => handleTypeChange(v)} />
        </FormField>
        <FormField label={t("certs.field.cryptoAlgorithm" as any)}>
          <SimpleSelect value={cert.cryptoAlgorithm} options={algorithmOptions.map((o) => ({ value: o.id, label: o.name }))} onChange={(v) => handleAlgorithmChange(v)} />
        </FormField>
        {showBitSize && (
          <FormField label={t("certs.field.bitSize" as any)}>
            <SimpleSelect value={String(cert.bitSize)} options={BIT_SIZE_OPTIONS.map((o) => ({ value: String(o.id), label: o.name }))} onChange={(v) => { set("bitSize", Number(v)); set("certificate", ""); set("privateKey", ""); }} />
          </FormField>
        )}
        {!isSSL && (
          <FormField label={t("certs.field.expireInYears" as any)}>
            <input type="number" value={cert.expireInYears} onChange={(e) => set("expireInYears", Number(e.target.value))} className={monoInputClass} />
          </FormField>
        )}
      </FormSection>

      {/* SSL-specific fields */}
      {isSSL && (
        <FormSection title={t("certs.section.ssl" as any)}>
          <FormField label={t("certs.field.expireTime" as any)}>
            <input value={cert.expireTime ? new Date(cert.expireTime).toLocaleString() : "—"} disabled className={inputClass} />
          </FormField>
          <FormField label={t("certs.field.domainExpire" as any)}>
            <input value={cert.domainExpireTime ? new Date(cert.domainExpireTime).toLocaleString() : "—"} disabled className={inputClass} />
          </FormField>
          <FormField label={t("col.provider" as any)}>
            <SimpleSelect value={cert.provider} options={[
              { value: "", label: t("common.none" as any) },
              ...SSL_PROVIDERS.map((o) => ({ value: o.id, label: o.name })),
            ]} onChange={(v) => set("provider", v)} />
          </FormField>
          <FormField label={t("certs.field.account" as any)}>
            <input value={cert.account} onChange={(e) => set("account", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("certs.field.accessKey" as any)}>
            <input value={cert.accessKey} onChange={(e) => set("accessKey", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("certs.field.accessSecret" as any)}>
            <input type="password" value={cert.accessSecret} onChange={(e) => set("accessSecret", e.target.value)} className={inputClass} />
          </FormField>
        </FormSection>
      )}

      {/* Certificate & Private Key */}
      <FormSection title={t("certs.section.keys" as any)}>
        <FormField label={t("certs.field.certificate" as any)} span="full">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => copyToClipboard(cert.certificate)}
              disabled={!cert.certificate}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Copy size={12} /> {t("certs.copyCert" as any)}
            </button>
            <button
              onClick={() => downloadFile(cert.certificate, "token_jwt_key.pem")}
              disabled={!cert.certificate}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Download size={12} /> {t("certs.downloadCert" as any)}
            </button>
          </div>
          <textarea
            value={cert.certificate}
            onChange={(e) => set("certificate", e.target.value)}
            rows={12}
            className={`${monoInputClass} text-[11px]`}
          />
        </FormField>
        <FormField label={t("certs.field.privateKey" as any)} span="full">
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => copyToClipboard(cert.privateKey)}
              disabled={!cert.privateKey}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Copy size={12} /> {t("certs.copyKey" as any)}
            </button>
            <button
              onClick={() => downloadFile(cert.privateKey, "token_jwt_key.key")}
              disabled={!cert.privateKey}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <Download size={12} /> {t("certs.downloadKey" as any)}
            </button>
          </div>
          <textarea
            value={cert.privateKey}
            onChange={(e) => set("privateKey", e.target.value)}
            rows={12}
            className={`${monoInputClass} text-[11px]`}
          />
        </FormField>
      </FormSection>
    </motion.div>
  );
}
