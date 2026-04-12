import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";
import * as AppBackend from "../backend/ApplicationBackend";
import type { Application } from "../backend/ApplicationBackend";

interface UserHomePageProps {
  userOrg: string;
}

export default function UserHomePage({ userOrg }: UserHomePageProps) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AppBackend.getApplicationsByOrganization({ owner: "admin", organization: userOrg })
      .then((res) => {
        if (res.status === "ok" && Array.isArray(res.data)) {
          setApps(res.data);
        }
      })
      .finally(() => setLoading(false));
  }, [userOrg]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-text-muted text-[14px]">{t("common.noData")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {apps.map((app) => (
          <a
            key={app.name}
            href={app.homepageUrl || "#"}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col items-center gap-4 rounded-xl border border-border bg-surface-1 p-6 hover:border-accent/40 hover:shadow-lg transition-all"
          >
            {app.logo ? (
              <img src={app.logo} alt={app.displayName || app.name} className="h-16 max-w-[180px] object-contain" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-accent/10 flex items-center justify-center text-accent text-2xl font-bold">
                {(app.displayName || app.name)[0]}
              </div>
            )}
            <span className="text-[14px] font-medium text-text-primary group-hover:text-accent transition-colors">
              {app.displayName || app.name}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
