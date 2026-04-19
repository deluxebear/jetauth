import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTheme } from "../../theme";
import { useTranslation } from "../../i18n";
import { api } from "../../api/client";
import BrandingLayer from "../shell/BrandingLayer";
import TopBar from "../shell/TopBar";
import SafeHtml from "../shell/SafeHtml";
import DynamicField from "./DynamicField";
import { buildSignupSchema, type FieldSchema } from "./useSignupSchema";
import { useSigninItemVisibility } from "../items/useSigninItemVisibility";
import type { AuthApplication } from "../api/types";

interface SignupPageProps {
  application: AuthApplication;
}

/**
 * Data-driven signup orchestrator. Reads `application.signupItems` via
 * buildSignupSchema, renders each step with DynamicField, validates on
 * Next + Submit. On success → full page reload to / (matches SigninPage).
 */
export default function SignupPage({ application }: SignupPageProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const schema = useMemo(
    () => buildSignupSchema(application.signupItems, 6),
    [application.signupItems]
  );

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState("");

  // Logo visibility on signup page follows the same signinItems config
  // ("Logo" row). Keeping a single source of truth simplifies admin UX —
  // there's no separate signupItem for Logo.
  const signinItemVis = useSigninItemVisibility(application.signinItems);

  const orgName =
    application.organizationObj?.name ?? application.organization ?? "built-in";
  const orgDisplay =
    application.displayName ||
    application.organizationObj?.displayName ||
    application.name;
  const orgLogo =
    theme === "dark" && application.organizationObj?.logoDark
      ? application.organizationObj.logoDark
      : application.organizationObj?.logo ?? application.logo;

  const stepFields = schema.steps[currentStep] ?? [];
  const isLastStep = currentStep === schema.steps.length - 1;
  const termsOfUse = (application as any).termsOfUse as string | undefined;

  const validateField = (field: FieldSchema, value: unknown): string | null => {
    if (field.required) {
      if (value === undefined || value === null || value === "") {
        const msg = field.validationMessage?.en ?? t("auth.signup.requiredError");
        return msg.replace("{label}", field.label);
      }
      if (field.type === "agreement" && value !== true) {
        return field.validationMessage?.en ?? t("auth.signup.requiredError").replace("{label}", field.label);
      }
    }
    if (field.regex && typeof value === "string" && value.length > 0) {
      if (!field.regex.test(value)) {
        const msg = field.validationMessage?.en ?? t("auth.signup.invalidError");
        return msg.replace("{label}", field.label);
      }
    }
    if (field.type === "confirm-password") {
      const passwordField = Object.entries(values).find(([k]) => k.toLowerCase() === "password");
      if (passwordField && passwordField[1] !== value) {
        return t("auth.signup.confirmMismatch");
      }
    }
    return null;
  };

  const validateCurrentStep = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of stepFields) {
      const v = values[field.name];
      const err = validateField(field, v);
      if (err) newErrors[field.name] = err;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = (e: FormEvent) => {
    e.preventDefault();
    if (!validateCurrentStep()) return;
    if (isLastStep) {
      void doSubmit();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(Math.max(0, currentStep - 1));
  };

  const doSubmit = async () => {
    setSubmitting(true);
    setGlobalError("");
    // Build the AuthForm-shaped body the backend expects.
    // Map common field names; pass everything else through.
    const body: Record<string, unknown> = {
      application: application.name,
      organization: orgName,
      clientId: application.name,
    };
    for (const [key, val] of Object.entries(values)) {
      // Normalize common field-name casing to backend-expected keys.
      const lk = key.toLowerCase();
      if (lk === "id") body.username = val; // ID field sometimes maps to username
      else if (lk === "username") body.username = val;
      else if (lk === "password") body.password = val;
      else if (lk === "confirm password") body.password2 = val;
      else if (lk === "email") body.email = val;
      else if (lk === "phone") body.phone = val;
      else if (lk === "first name") body.firstName = val;
      else if (lk === "last name") body.lastName = val;
      else if (lk === "display name") body.name = val;
      else if (lk === "affiliation") body.affiliation = val;
      else if (lk === "country/region") body.region = val;
      else if (lk === "id card") body.idCard = val;
      else if (lk === "invitation code") body.invitationCode = val;
      else if (lk === "agreement") body.agreement = val;
      else body[key] = val; // pass through custom fields
    }
    try {
      const res = await api.post<{ status: string; msg?: string }>("/api/signup", body);
      if (res.status !== "ok") {
        setGlobalError(res.msg ?? "signup failed");
        setSubmitting(false);
        return;
      }
      // Backend sets a session on success — full page reload to land on /
      window.location.href = "/";
    } catch (e: unknown) {
      setGlobalError((e as Error).message ?? "network error");
      setSubmitting(false);
    }
  };

  const updateValue = (name: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [name]: v }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen flex relative">
      <TopBar />
      <div className="w-full flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <BrandingLayer
              logo={orgLogo}
              logoDark={application.organizationObj?.logoDark}
              favicon={application.organizationObj?.favicon ?? application.favicon}
              displayName={orgDisplay}
              title={application.title}
              theme={theme}
              hideLogo={!signinItemVis.isVisible("Logo")}
            />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-1">
            {t("auth.signup.title")}
          </h1>
          <p className="text-[13px] text-text-muted mb-6">
            {t("auth.signup.subtitle")}
          </p>

          {schema.hasVisibleStepBreak && (
            <p className="text-[12px] text-text-muted mb-4">
              {t("auth.signup.stepOf")
                .replace("{current}", String(currentStep + 1))
                .replace("{total}", String(schema.steps.length))}
            </p>
          )}

          {globalError && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
              {globalError}
            </div>
          )}

          <form
            onSubmit={handleNext}
            className="space-y-4"
            data-cfg-section="signup"
            data-cfg-field="signupItems"
          >
            {stepFields.map((field) => (
              <DynamicField
                key={field.name}
                schema={field}
                value={values[field.name]}
                onChange={(v) => updateValue(field.name, v)}
                error={errors[field.name]}
                disabled={submitting}
                context={{ termsOfUse }}
              />
            ))}

            <div className="flex gap-2 pt-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={submitting}
                  className="flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-4 py-2.5 text-[14px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors"
                >
                  <ArrowLeft size={16} />
                  {t("auth.signup.backButton")}
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="group flex-1 flex items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    {isLastStep ? t("auth.signup.submitButton") : t("auth.signup.nextButton")}
                  </>
                ) : (
                  <>
                    {isLastStep ? t("auth.signup.submitButton") : t("auth.signup.nextButton")}
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-[12px] text-text-muted">
            {t("auth.signup.haveAccount")}{" "}
            <a href={`/login/${orgName}/${application.name}`} className="text-accent hover:underline">
              {t("auth.signup.signinLink")}
            </a>
          </p>

          <SafeHtml html={application.signupHtml ?? ""} className="auth-page-html" />
        </div>
      </div>
    </div>
  );
}
