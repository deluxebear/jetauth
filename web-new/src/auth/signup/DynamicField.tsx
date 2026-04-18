import type { FieldSchema } from "./useSignupSchema";
import TextField from "./fields/TextField";
import EmailField from "./fields/EmailField";
import PhoneField from "./fields/PhoneField";
import PasswordField from "./fields/PasswordField";
import ConfirmPasswordField from "./fields/ConfirmPasswordField";
import SelectField from "./fields/SelectField";
import CheckboxField from "./fields/CheckboxField";
import DateField from "./fields/DateField";
import AgreementField from "./fields/AgreementField";

export interface FieldProps {
  schema: FieldSchema;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
  disabled?: boolean;
  context?: { termsOfUse?: string };
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
        // ProvidersRow handles this case — DynamicField renders nothing
        return null;
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
