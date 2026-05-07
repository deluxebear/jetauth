import { useState } from "react";
import { useTranslation } from "../i18n";
import { useModal } from "./Modal";
import * as BizBackend from "../backend/BizBackend";

interface Props {
  appId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function BizAssertionEditor({ appId, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const modal = useModal();
  const [user, setUser] = useState("");
  const [relation, setRelation] = useState("");
  const [object, setObject] = useState("");
  const [expected, setExpected] = useState(true);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!user.trim() || !relation.trim() || !object.trim()) {
      modal.toast(t("rebac.assertions.allFieldsRequired"), "error"); return;
    }
    setSaving(true);
    try {
      const res = await BizBackend.addBizAssertion(appId, {
        user: user.trim(), relation: relation.trim(), object: object.trim(),
        expected, description: description.trim(),
      });
      if (res.status === "ok") {
        modal.toast(t("rebac.assertions.saved"), "success");
        onSaved();
      } else {
        modal.toast(res.msg || t("rebac.common.error"), "error");
      }
    } finally { setSaving(false); }
  };

  return (
    <div role="dialog" aria-modal className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface-1 rounded-xl border border-border p-5 w-[480px] max-w-[90vw] flex flex-col gap-3">
        <h3 className="text-[15px] font-semibold">{t("rebac.assertions.addTitle")}</h3>

        <Field label="USER" value={user} onChange={setUser} placeholder="user:alice" />
        <Field label="RELATION" value={relation} onChange={setRelation} placeholder="viewer" />
        <Field label="OBJECT" value={object} onChange={setObject} placeholder="document:r1" />
        <Field label={t("rebac.assertions.descriptionLabel")} value={description} onChange={setDescription} placeholder="" />

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={expected} onChange={(e) => setExpected(e.target.checked)} />
          {t("rebac.assertions.expectedAllow")}
        </label>

        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} disabled={saving}
            className="px-3 py-1.5 rounded-md border border-border text-[13px]">
            {t("rebac.common.cancel")}
          </button>
          <button onClick={() => void submit()} disabled={saving}
            className="px-3 py-1.5 rounded-md bg-accent text-white text-[13px]">
            {t("rebac.common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase text-text-muted">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-1.5 rounded-md border border-border bg-surface-2 text-[13px] mt-1"
      />
    </div>
  );
}
