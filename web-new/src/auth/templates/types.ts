// web-new/src/auth/templates/types.ts
//
// Contract between pages (SigninPage / SignupPage / ForgotPasswordPage) and
// the layout templates that wrap them. Pages compose the slots; templates
// arrange them.

import type { ComponentType, ReactNode } from "react";
import type { AuthApplication } from "../api/types";

export type TemplateVariant = "signin" | "signup" | "forgot";

export type TemplateCategory =
  | "saas"
  | "consumer"
  | "developer"
  | "enterprise"
  | "china";

/**
 * Slots a template receives. `content` is required; everything else is
 * optional. Pages own the inner layout of `content` (form, providers, links,
 * error banners); templates own the outer shell (branding position,
 * background, panels, mobile behavior).
 */
export interface TemplateSlots {
  topBar?: ReactNode;
  branding?: ReactNode;
  content: ReactNode;
  htmlInjection?: ReactNode;
}

export interface TemplateProps {
  variant: TemplateVariant;
  application: AuthApplication;
  theme: "light" | "dark";
  slots: TemplateSlots;
  options: Record<string, unknown>;
}

export type TemplateComponent = ComponentType<TemplateProps>;

export interface TemplateMeta {
  /** Unique template id stored in `Application.template`. kebab-case. */
  id: string;
  name: { en: string; zh: string };
  description: { en: string; zh: string };
  /** Public path to a thumbnail for the admin gallery picker. */
  preview: string;
  category: TemplateCategory;
  /** Seed for `Application.templateOptions` when this template is selected. */
  defaultOptions: Record<string, unknown>;
}

export interface TemplateEntry {
  meta: TemplateMeta;
  Component: TemplateComponent;
}
