import { useTranslation } from "../i18n";

export default function SwaggerPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 -m-6">
      <div className="px-6 pt-6">
        <h1 className="text-xl font-bold tracking-tight">{t("swagger.title" as any)}</h1>
        <p className="text-[13px] text-text-muted mt-0.5">{t("swagger.subtitle" as any)}</p>
      </div>
      <iframe
        src="/swagger"
        title="Swagger API Documentation"
        className="w-full border-t border-border"
        style={{ height: "calc(100vh - 140px)" }}
      />
    </div>
  );
}
