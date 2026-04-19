import type { FieldSchema } from "./useSignupSchema";
import type { AuthApplication, ResolvedProvider } from "../api/types";
import TextField from "./fields/TextField";
import EmailField from "./fields/EmailField";
import PhoneField from "./fields/PhoneField";
import PasswordField from "./fields/PasswordField";
import ConfirmPasswordField from "./fields/ConfirmPasswordField";
import SelectField from "./fields/SelectField";
import CheckboxField from "./fields/CheckboxField";
import DateField from "./fields/DateField";
import AgreementField from "./fields/AgreementField";
import ProvidersField from "./fields/ProvidersField";

export interface FieldProps {
  schema: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  disabled?: boolean;
  context?: {
    termsOfUse?: string;
    /**
     * Resolved provider list threaded down from AuthShell → SignupPage so
     * the ProvidersField can render branded OAuth buttons. Empty or
     * undefined = render nothing (ProvidersField handles this).
     */
    providers?: ResolvedProvider[];
    /** Application — needed by ProvidersField to build OAuth authorize URLs. */
    application?: AuthApplication;
    /** Optional OAuth redirect_uri passthrough from URL params. */
    redirectUri?: string;
    /** Optional OAuth state passthrough from URL params. */
    state?: string;
  };
}

export default function DynamicField(props: FieldProps) {
  const body = (() => {
    switch (props.schema.type) {
      case "email":
        return <EmailField {...props} />;
      case "phone":
        return <PhoneField {...props} />;
      case "password":
        return <PasswordField {...props} />;
      case "confirm-password":
        return <ConfirmPasswordField {...props} />;
      case "select":
        return <SelectField {...props} />;
      case "checkbox":
        return <CheckboxField {...props} />;
      case "date":
        return <DateField {...props} />;
      case "agreement":
        return <AgreementField {...props} />;
      case "providers":
        return <ProvidersField {...props} />;
      case "invitation-code":
      case "text":
      default:
        return <TextField {...props} />;
    }
  })();

  if (body === null) return null;

  // Per-item scope for customCss aggregated in AuthShell. The wrapper is
  // transparent for layout; its single purpose is the data attribute so
  // admin-provided `signupItems[].customCss` can target this field.
  return (
    <div
      data-signupitem={String(props.schema.name ?? "").replace(/\s+/g, "-").toLowerCase()}
    >
      {body}
    </div>
  );
}
