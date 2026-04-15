import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Save, ArrowLeft, Trash2, LogOut, ExternalLink, Copy, ChevronDown, ShieldCheck, Bell, HardDrive, CreditCard, Wallet, MessageSquare, Smartphone, Key, Globe, Link, Settings } from "lucide-react";
import { FormField, FormSection, Switch, inputClass, monoInputClass } from "../components/FormSection";
import SimpleSelect from "../components/SimpleSelect";
import SingleSearchSelect from "../components/SingleSearchSelect";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useOrganization } from "../OrganizationContext";
import * as ProvBackend from "../backend/ProviderBackend";
import type { Provider } from "../backend/ProviderBackend";
import { friendlyError } from "../utils/errorHelper";
import SaveButton from "../components/SaveButton";
import UnsavedBanner from "../components/UnsavedBanner";
import { useUnsavedWarning } from "../hooks/useUnsavedWarning";
import { useTheme } from "../theme";

// ── Category & Type constants (matching original) ──

const CATEGORIES = [
  "Captcha", "Email", "Face ID", "ID Verification", "Log",
  "MFA", "Notification", "OAuth", "Payment", "SAML",
  "SMS", "Storage", "Web3",
];

const TYPE_BY_CATEGORY: Record<string, string[]> = {
  OAuth: [
    "ADFS", "Alipay", "Amazon", "Apple", "Auth0", "AzureAD", "AzureADB2C",
    "Baidu", "BattleNet", "Bilibili", "Bitbucket", "Casdoor",
    "DingTalk", "Discord", "Douyin", "Dropbox",
    "Facebook", "Gitea", "Gitee", "GitHub", "GitLab", "Google",
    "Infoflow", "Instagram", "Kakao", "Lark", "Line", "LinkedIn",
    "Naver", "Okta", "PayPal", "QQ", "Slack", "Spotify", "Steam",
    "Telegram", "TikTok", "Twitter", "VK", "WeChat", "WeCom", "Weibo", "Zoom",
    "Custom",
  ],
  Email: ["Azure ACS", "Default", "Mailtrap", "Resend", "SendGrid", "SUBMAIL", "Custom HTTP Email"],
  SMS: [
    "Aliyun SMS", "Amazon SNS", "Azure ACS", "Baidu Cloud SMS",
    "Huawei Cloud SMS", "Infobip SMS", "Mock SMS", "Msg91 SMS",
    "OSON SMS", "SmsBao SMS", "SUBMAIL SMS", "Tencent Cloud SMS",
    "Twilio SMS", "UCloud SMS", "Volc Engine SMS",
    "Custom HTTP SMS",
  ],
  Storage: [
    "Aliyun OSS", "AWS S3", "Azure Blob", "CUCloud OSS",
    "Google Cloud Storage", "Local File System", "MinIO",
    "Qiniu Cloud Kodo", "Synology", "Tencent Cloud COS",
  ],
  SAML: ["Aliyun IDaaS", "Keycloak", "Custom"],
  Payment: ["Adyen", "AirWallex", "Alipay", "Balance", "Dummy", "FastSpring", "GC", "Lemon Squeezy", "Paddle", "PayPal", "Polar", "Stripe", "WeChat Pay"],
  Captcha: ["Aliyun Captcha", "Cloudflare Turnstile", "Default", "GEETEST", "hCaptcha", "reCAPTCHA v2", "reCAPTCHA v3"],
  Web3: ["MetaMask", "Web3Onboard"],
  Notification: [
    "Bark", "Discord", "DingTalk", "Google Chat", "Lark", "Line",
    "Matrix", "Microsoft Teams", "Pushbullet", "Pushover",
    "Reddit", "Rocket Chat", "Slack", "Telegram", "Twitter",
    "Viber", "WeCom", "Webpush",
    "Custom HTTP",
  ],
  "Face ID": ["Alibaba Cloud Facebody"],
  MFA: ["RADIUS"],
  "ID Verification": ["Alibaba Cloud", "Jumio"],
  Log: ["Agent", "JetAuth Permission Log", "SELinux Log", "System Log"],
};

const DEFAULT_TYPE_FOR_CATEGORY: Record<string, string> = {
  OAuth: "Google", Email: "Default", SMS: "Twilio SMS", Storage: "AWS S3",
  SAML: "Keycloak", Payment: "PayPal", Captcha: "Default", Web3: "MetaMask",
  Notification: "Telegram", "Face ID": "Alibaba Cloud Facebody", MFA: "RADIUS",
  "ID Verification": "Jumio", Log: "JetAuth Permission Log",
};

// SubType options
const SUBTYPES: Record<string, string[]> = {
  WeCom: ["Internal", "Third-party"],
  Infoflow: ["Internal", "Third-party"],
  WeChat: ["Web", "Mobile"],
  Agent: ["OpenClaw"],
};

// ── Dynamic label helpers ──

function getClientIdLabel(cat: string, type: string, t: (k: string) => string): string {
  if (cat === "OAuth" && type === "Apple") return t("providers.label.serviceIdIdentifier" as any);
  if (cat === "Email") return t("providers.label.username" as any);
  if (cat === "SMS") {
    if (["Volc Engine SMS", "Amazon SNS", "Baidu Cloud SMS"].includes(type)) return t("providers.label.accessKey" as any);
    if (type === "Huawei Cloud SMS") return t("providers.label.appKey" as any);
    if (type === "UCloud SMS") return t("providers.label.publicKey" as any);
    if (["Msg91 SMS", "Infobip SMS", "OSON SMS"].includes(type)) return t("providers.label.senderId" as any);
    return t("providers.field.clientId");
  }
  if (cat === "Captcha") {
    if (type === "Aliyun Captcha") return t("providers.label.accessKey" as any);
    return t("providers.label.siteKey" as any);
  }
  return t("providers.field.clientId");
}

function getClientSecretLabel(cat: string, type: string, t: (k: string) => string): string {
  if (cat === "OAuth" && type === "Apple") return t("providers.label.teamId" as any);
  if (cat === "Storage" && type === "Google Cloud Storage") return t("providers.label.serviceAccountJson" as any);
  if (cat === "Email") {
    if (["Azure ACS", "SendGrid", "Resend"].includes(type)) return t("providers.label.secretKey" as any);
    return t("providers.label.password" as any);
  }
  if (cat === "SMS") {
    if (["Volc Engine SMS", "Amazon SNS", "Baidu Cloud SMS", "OSON SMS"].includes(type)) return t("providers.label.secretAccessKey" as any);
    if (type === "Huawei Cloud SMS") return t("providers.label.appSecret" as any);
    if (type === "UCloud SMS") return t("providers.label.privateKey" as any);
    if (type === "Msg91 SMS") return t("providers.label.authKey" as any);
    if (type === "Infobip SMS") return t("providers.label.apiKey" as any);
    return t("providers.field.clientSecret");
  }
  if (cat === "Captcha") {
    if (type === "Aliyun Captcha") return t("providers.label.secretAccessKey" as any);
    return t("providers.label.secretKey" as any);
  }
  if (cat === "Notification") {
    if (["Line", "Telegram", "Bark", "DingTalk", "Discord", "Slack", "Pushover", "Pushbullet"].includes(type)) return t("providers.label.secretKey" as any);
    if (["Lark", "Microsoft Teams", "WeCom"].includes(type)) return t("providers.field.endpoint" as any);
    return t("providers.field.clientSecret");
  }
  return t("providers.field.clientSecret");
}

function shouldHideCredentials(cat: string, type: string): boolean {
  if (cat === "Captcha" && type === "Default") return true;
  if (cat === "Web3") return true;
  if (cat === "MFA") return true;
  if (cat === "Log") return true;
  if (cat === "Storage" && type === "Local File System") return true;
  if (cat === "SMS" && type === "Custom HTTP SMS") return true;
  if (cat === "Email" && type === "Custom HTTP Email") return true;
  if (cat === "Notification" && ["Google Chat", "Custom HTTP", "Balance"].includes(type)) return true;
  if (cat === "Payment" && ["Dummy", "Balance"].includes(type)) return true;
  return false;
}

function shouldShowClientId2(cat: string, type: string): boolean {
  if (cat === "Email") return true;
  return ["WeChat", "Apple", "Aliyun Captcha", "WeChat Pay", "Twitter", "Reddit", "CUCloud", "Adyen"].includes(type);
}

function getClientId2Label(cat: string, type: string, t: (k: string) => string): string {
  if (cat === "OAuth" && type === "Apple") return t("providers.label.keyId" as any);
  if (cat === "Email") return t("providers.label.fromAddress" as any);
  if (type === "Aliyun Captcha") return t("providers.label.scene" as any);
  if (type === "WeChat Pay" || type === "CUCloud") return t("providers.label.appId" as any);
  if (type === "Adyen") return t("providers.label.merchantAccount" as any);
  return t("providers.label.clientId2" as any);
}

function getClientSecret2Label(cat: string, type: string, t: (k: string) => string): string {
  if (cat === "OAuth" && type === "Apple") return t("providers.label.keyText" as any);
  if (cat === "Email") return t("providers.label.fromName" as any);
  if (type === "Aliyun Captcha") return t("providers.label.appKey" as any);
  return t("providers.label.clientSecret2" as any);
}

function shouldHideClientSecret2(cat: string, type: string): boolean {
  if (type === "WeChat Pay" || type === "CUCloud" || type === "Adyen") return true;
  if (cat === "Email" && type === "Azure ACS") return true;
  return false;
}

function getAppIdLabel(cat: string, type: string): string | null {
  // OAuth
  if (type === "WeCom") return "Agent ID";
  if (type === "Infoflow") return "Agent ID";
  if (type === "AzureADB2C") return "User Flow";
  // SMS
  if (type === "Twilio SMS" || type === "Azure ACS") return "Sender Number";
  if (type === "Tencent Cloud SMS") return "App ID";
  if (type === "Volc Engine SMS") return "SMS Account";
  if (type === "Huawei Cloud SMS") return "Channel No.";
  if (type === "Amazon SNS") return "Region";
  if (type === "Baidu Cloud SMS") return "Endpoint";
  if (type === "Infobip SMS") return "Base URL";
  if (type === "UCloud SMS") return "Project Id";
  // Email
  if (cat === "Email" && type === "SUBMAIL") return "App ID";
  // Notification
  if (type === "Viber") return "Domain";
  if (["Line", "Matrix", "Rocket Chat"].includes(type)) return "App Key";
  return null;
}

// ── Provider official website URLs ──

const PROVIDER_URLS: Record<string, string> = {
  // OAuth
  Google: "https://console.cloud.google.com/apis/credentials", GitHub: "https://github.com/settings/developers",
  Facebook: "https://developers.facebook.com/apps", Twitter: "https://developer.twitter.com/en/portal",
  LinkedIn: "https://www.linkedin.com/developers/apps", Apple: "https://developer.apple.com/account",
  WeChat: "https://open.weixin.qq.com", DingTalk: "https://open-dev.dingtalk.com",
  Lark: "https://open.larksuite.com", GitLab: "https://gitlab.com/-/profile/applications",
  Baidu: "https://developer.baidu.com/console", Alipay: "https://open.alipay.com",
  Slack: "https://api.slack.com/apps", Okta: "https://developer.okta.com",
  Discord: "https://discord.com/developers/applications", Spotify: "https://developer.spotify.com/dashboard",
  Telegram: "https://core.telegram.org/bots", Auth0: "https://manage.auth0.com",
  AzureAD: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps",
  AzureADB2C: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps",
  ADFS: "https://docs.microsoft.com/en-us/windows-server/identity/ad-fs/ad-fs-overview",
  PayPal: "https://developer.paypal.com/developer/applications", Stripe: "https://dashboard.stripe.com/apikeys",
  Gitea: "https://gitea.com", Gitee: "https://gitee.com/oauth/applications",
  Bitbucket: "https://bitbucket.org/account/settings/app-passwords",
  Instagram: "https://developers.facebook.com/apps", Line: "https://developers.line.biz/console",
  Amazon: "https://developer.amazon.com/loginwithamazon/console", Zoom: "https://marketplace.zoom.us",
  QQ: "https://connect.qq.com", WeCom: "https://work.weixin.qq.com",
  Steam: "https://steamcommunity.com/dev/apikey", VK: "https://vk.com/apps?act=manage",
  MetaMask: "https://metamask.io", TikTok: "https://developers.tiktok.com",
  BattleNet: "https://develop.battle.net", Kakao: "https://developers.kakao.com",
  Naver: "https://developers.naver.com", Bilibili: "https://open.bilibili.com",
  // Captcha
  "reCAPTCHA v2": "https://www.google.com/recaptcha/admin", "reCAPTCHA v3": "https://www.google.com/recaptcha/admin",
  hCaptcha: "https://dashboard.hcaptcha.com", "Cloudflare Turnstile": "https://dash.cloudflare.com",
  "Aliyun Captcha": "https://www.alibabacloud.com/product/captcha", GEETEST: "https://www.geetest.com",
  "Azure ACS": "https://azure.microsoft.com/en-us/products/communication-services",
  // Email
  SendGrid: "https://app.sendgrid.com", Mailtrap: "https://mailtrap.io", Resend: "https://resend.com",
  // SMS
  "Aliyun SMS": "https://dysms.console.aliyun.com", "Tencent Cloud SMS": "https://console.cloud.tencent.com/smsv2",
  "Twilio SMS": "https://www.twilio.com/console", "Amazon SNS": "https://console.aws.amazon.com/sns",
  "Huawei Cloud SMS": "https://www.huaweicloud.com/product/msgsms.html",
  "Baidu Cloud SMS": "https://cloud.baidu.com/product/sms.html",
  "Infobip SMS": "https://portal.infobip.com",
  "Msg91 SMS": "https://msg91.com",
  "OSON SMS": "https://oson.uz",
  "SmsBao SMS": "https://www.smsbao.com",
  "SUBMAIL SMS": "https://www.mysubmail.com",
  "UCloud SMS": "https://www.ucloud.cn/site/product/usms.html",
  "Volc Engine SMS": "https://console.volcengine.com/sms",
  // Storage
  "AWS S3": "https://s3.console.aws.amazon.com", MinIO: "https://min.io",
  "Aliyun OSS": "https://oss.console.aliyun.com", "Tencent Cloud COS": "https://console.cloud.tencent.com/cos",
  "Azure Blob": "https://portal.azure.com", "Google Cloud Storage": "https://console.cloud.google.com/storage",
  Synology: "https://www.synology.com",
  // SAML
  Keycloak: "https://www.keycloak.org", "Aliyun IDaaS": "https://www.alibabacloud.com/product/idaas",
  // Payment
  "WeChat Pay": "https://pay.weixin.qq.com", Stripe: "https://dashboard.stripe.com/apikeys",
  Balance: "https://www.getbalance.com/",
  AirWallex: "https://www.airwallex.com", Polar: "https://polar.sh", Paddle: "https://www.paddle.com",
  GC: "https://ww3.gcpay.com/", FastSpring: "https://fastspring.com", "Lemon Squeezy": "https://www.lemonsqueezy.com", Adyen: "https://www.adyen.com",
  // Notification
  Bark: "https://bark.day.app/#/?id=bark",
  "Microsoft Teams": "https://dev.teams.microsoft.com", Pushover: "https://pushover.net",
  "Google Chat": "https://chat.google.com", Reddit: "https://www.reddit.com/prefs/apps",
  Matrix: "https://matrix.org", Viber: "https://www.viber.com",
  // Web3
  Web3Onboard: "https://onboard.blocknative.com",
  // ID Verification
  Jumio: "https://www.jumio.com",
  "Alibaba Cloud": "https://www.alibabacloud.com",
  "Alibaba Cloud Facebody": "https://www.alibabacloud.com/product/China-facebody",
};

// ── Provider logo URL (Simple Icons CDN — SVG, theme-aware) ──

// Map provider types to Simple Icons slugs
const PROVIDER_ICON_SLUGS: Record<string, string> = {
  // OAuth
  Google: "google", GitHub: "github", Facebook: "facebook", Twitter: "x",
  LinkedIn: "linkedin", Apple: "apple", WeChat: "wechat", DingTalk: "dingtalk",
  Weibo: "sinaweibo", GitLab: "gitlab", Baidu: "baidu", Alipay: "alipay",
  Slack: "slack", Steam: "steam", Bilibili: "bilibili", Okta: "okta",
  Discord: "discord", Dropbox: "dropbox", Instagram: "instagram",
  Spotify: "spotify", Telegram: "telegram", TikTok: "tiktok",
  Amazon: "amazon", Auth0: "auth0", Bitbucket: "bitbucket",
  Gitea: "gitea", PayPal: "paypal", Stripe: "stripe", Zoom: "zoom",
  Line: "line", Kakao: "kakaotalk", VK: "vk", Naver: "naver",
  AzureAD: "microsoftazure", AzureADB2C: "microsoftazure",
  ADFS: "microsoft", Lark: "lark", Douyin: "tiktok",
  Gitee: "gitee", BattleNet: "battledotnet", WeCom: "wechat",
  // Captcha
  "reCAPTCHA v2": "google", "reCAPTCHA v3": "google",
  hCaptcha: "hcaptcha", "Cloudflare Turnstile": "cloudflare",
  "Aliyun Captcha": "alibabacloud",
  // Email
  SendGrid: "sendgrid", Mailtrap: "mailtrap", Resend: "resend",
  // SMS
  "Aliyun SMS": "alibabacloud", "Tencent Cloud SMS": "tencentqq",
  "Twilio SMS": "twilio", "Amazon SNS": "amazonaws",
  "Azure ACS": "microsoftazure",
  "Huawei Cloud SMS": "huawei", "Baidu Cloud SMS": "baidu",
  // Storage
  "AWS S3": "amazons3", MinIO: "minio", "Aliyun OSS": "alibabacloud",
  "Tencent Cloud COS": "tencentqq", "Azure Blob": "microsoftazure",
  "Google Cloud Storage": "googlecloud", Synology: "synology",
  // SAML
  "Aliyun IDaaS": "alibabacloud", Keycloak: "keycloak",
  // Payment
  Alipay: "alipay", "WeChat Pay": "wechat",
  // Notification
  "Microsoft Teams": "microsoftteams", Pushover: "pushover",
  "Google Chat": "googlechat", Matrix: "matrix", Reddit: "reddit",
  // Web3
  MetaMask: "metamask", Web3Onboard: "web3dotjs",
  // ID Verification
  "Alibaba Cloud": "alibabacloud",
};

// Fallback slugs by category (used when type has no specific icon)
const CATEGORY_ICON_SLUGS: Record<string, string> = {
  Email: "gmail",
  Log: "logstash",
  MFA: "authelia",
  "Face ID": "alibabacloud",
  "ID Verification": "keycdn",
};

// Local brand icons (from /img/brand/) or lucide icons
const LOCAL_ICONS: Record<string, string> = {
  // Captcha
  "Captcha:Default": "local:shield",
  "Captcha:GEETEST": "brand:geetest.svg",
  "Captcha:hCaptcha": "brand:hcaptcha.svg",
  // OAuth
  "OAuth:Infoflow": "brand:infoflow.png",
  "OAuth:Casdoor": "brand:casdoor.png",
  "OAuth:QQ": "brand:QQ.svg",
  "OAuth:AzureAD": "brand:azure.svg",
  "OAuth:AzureADB2C": "brand:azure.svg",
  "OAuth:Slack": "brand:slack-icon.svg",
  "OAuth:Lark": "brand:lark.svg",
  "OAuth:DingTalk": "brand:dingtalk.svg",
  "OAuth:LinkedIn": "brand:linkedin.png",
  "OAuth:Amazon": "brand:amazon-web-services.svg",
  "OAuth:ADFS": "brand:azure.svg",
  "OAuth:Custom": "local:settings",
  // Email
  "Email:SUBMAIL": "brand:submail.svg",
  "Email:SendGrid": "brand:sendgrid.svg",
  // SMS
  "SMS:SUBMAIL SMS": "brand:submail.svg",
  "SMS:Tencent Cloud SMS": "brand:tencent-cloud.png",
  "SMS:Twilio SMS": "brand:twilio.png",
  "SMS:Amazon SNS": "brand:amazon-sns.png",
  "SMS:Volc Engine SMS": "brand:volcengine.png",
  "SMS:UCloud SMS": "brand:ucloud.png",
  "SMS:Infobip SMS": "brand:infobip.png",
  "SMS:OSON SMS": "local:messageSquare",
  "SMS:SmsBao SMS": "brand:smsbao.png",
  "SMS:Msg91 SMS": "brand:msg91.png",
  "SMS:Mock SMS": "local:smartphone",
  "SMS:Custom HTTP SMS": "local:messageSquare",
  "SMS:Azure ACS": "brand:azure.svg",
  "Email:Azure ACS": "brand:azure.svg",
  "Storage:Azure Blob": "brand:azure.svg",
  // Storage
  "Storage:Local File System": "local:hardDrive",
  "Storage:Qiniu Cloud Kodo": "brand:qiniu.png",
  "Storage:Tencent Cloud COS": "brand:tencent-cloud.png",
  "Storage:Casdoor": "brand:casdoor.png",
  "Storage:CUCloud OSS": "brand:cucloud.png",
  "Storage:AWS S3": "brand:amazon-web-services.svg",
  // SAML
  "SAML:Custom": "local:key",
  // Payment
  "Payment:Dummy": "local:creditCard",
  "Payment:Balance": "brand:balance.png",
  "Payment:GC": "brand:gcpay.png",
  "Payment:AirWallex": "brand:airwallex.png",
  "Payment:Polar": "brand:polar.png",
  "Payment:Paddle": "brand:paddle.png",
  "Payment:FastSpring": "brand:fastspring.png",
  "Payment:Lemon Squeezy": "brand:lemonsqueezy.png",
  "Payment:Adyen": "brand:adyen.png",
  "Payment:Casdoor": "brand:casdoor.png",
  // Notification
  "Notification:Microsoft Teams": "brand:microsoft-teams-icon.svg",
  "Notification:Pushover": "brand:pushover.svg",
  "Notification:Bark": "brand:bark.png",
  "Notification:Pushbullet": "brand:pushbullet_1.svg",
  "Notification:Webpush": "brand:webpush.svg",
  "Notification:Rocket Chat": "brand:rocket-chat.svg",
  "Notification:Viber": "brand:viber.svg",
  "Notification:WeCom": "brand:wecom.svg",
  "Notification:DingTalk": "brand:dingtalk.svg",
  "Notification:Lark": "brand:lark.svg",
  "Notification:Slack": "brand:slack-icon.svg",
  "Notification:Custom HTTP": "local:globe",
  // Web3
  "Web3:MetaMask": "brand:metamask.png",
  "Web3:Web3Onboard": "local:link",
  // ID Verification
  "ID Verification:Jumio": "brand:jumio.png",
  // Email Custom
  "Email:Custom HTTP Email": "local:globe",
};

function getProviderLogoUrl(category: string, type: string, isDark: boolean): string {
  // Check local icons first
  const localKey = `${category}:${type}`;
  if (LOCAL_ICONS[localKey]) return LOCAL_ICONS[localKey];
  // Custom types have no icon
  if (type.startsWith("Custom")) return "";
  // Try direct type match first
  let slug = PROVIDER_ICON_SLUGS[type];
  // Fallback to category icon
  if (!slug) slug = CATEGORY_ICON_SLUGS[category] ?? "";
  if (!slug) return "";
  // Simple Icons CDN: returns SVG with specified color
  const color = isDark ? "white" : "";
  return color ? `https://cdn.simpleicons.org/${slug}/${color}` : `https://cdn.simpleicons.org/${slug}`;
}

// ── Default email templates ──

const DEFAULT_EMAIL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verification Code Email</title>
<style>
    body { font-family: Arial, sans-serif; }
    .email-container { width: 600px; margin: 0 auto; }
    .header { text-align: center; }
    .code { font-size: 24px; margin: 20px 0; text-align: center; }
    .footer { font-size: 12px; text-align: center; margin-top: 50px; }
    .footer a { color: #000; text-decoration: none; }
</style>
</head>
<body>
<div class="email-container">
  <div class="header">
        <h3>JetAuth</h3>
        <img src="/img/logo.png" alt="JetAuth Logo" width="300">
    </div>
    <p><strong>%{user.friendlyName}</strong>, here is your verification code</p>
    <p>Use this code for your transaction. It's valid for 5 minutes</p>
    <div class="code">
        %s
    </div>
    <reset-link>
      <div class="link">
         Or click this <a href="%link">link</a> to reset
      </div>
    </reset-link>
    <p>Thanks</p>
    <p>JetAuth Team</p>
    <hr>
    <div class="footer">
        <p>JetAuth Identity & Access Management</p>
    </div>
</div>
</body>
</html>`;

const DEFAULT_EMAIL_TEXT = `You have requested a verification code at JetAuth. Here is your code: %s, please enter in 5 minutes. <reset-link>Or click %link to reset</reset-link>`;

const DEFAULT_INVITATION_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Invitation Code Email</title>
<style>
    body { font-family: Arial, sans-serif; }
    .email-container { width: 600px; margin: 0 auto; }
    .header { text-align: center; }
    .code { font-size: 24px; margin: 20px 0; text-align: center; }
    .footer { font-size: 12px; text-align: center; margin-top: 50px; }
    .footer a { color: #000; text-decoration: none; }
</style>
</head>
<body>
<div class="email-container">
  <div class="header">
        <h3>JetAuth</h3>
        <img src="/img/logo.png" alt="JetAuth Logo" width="300">
    </div>
    <p>You have been invited to join JetAuth</p>
    <div class="code">
        %code
    </div>
    <reset-link>
      <div class="link">
         Or click this <a href="%link">link</a> to signup
      </div>
    </reset-link>
    <p>Thanks</p>
    <p>JetAuth Team</p>
    <hr>
    <div class="footer">
        <p>JetAuth Identity & Access Management</p>
    </div>
</div>
</body>
</html>`;

const DEFAULT_INVITATION_TEXT = `You have been invited to join JetAuth. Here is your invitation code: %s, please enter in 5 minutes. Or click %link to signup`;

// ── Mapping fields ──

const OAUTH_MAPPING_FIELDS = [
  "id", "username", "displayName", "email", "avatarUrl", "phone",
  "countryCode", "firstName", "lastName", "region", "location", "affiliation", "title",
];

const OAUTH_MAPPING_REQUIRED = ["id", "username", "displayName"];

// ══════════════════════════════════════════

export default function ProviderEditPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const isNew = !name || name === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const [isAddMode, setIsAddMode] = useState((location.state as any)?.mode === "add");
  const { t } = useTranslation();
  const modal = useModal();
  const { orgOptions, isGlobalAdmin } = useOrganization();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [prov, setProv] = useState<Record<string, unknown>>({
    owner: "admin",
    category: "OAuth",
    type: "Google",
    method: "Normal",
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); } }, [saved]);
  const [originalJson, setOriginalJson] = useState("");
  const [nameAutoGen, setNameAutoGen] = useState(isAddMode);
  const [displayNameAutoGen, setDisplayNameAutoGen] = useState(isAddMode);
  const [samlMetadataUrl, setSamlMetadataUrl] = useState("");
  const [samlMetadataLoading, setSamlMetadataLoading] = useState(false);
  const [captchaPreviewOpen, setCaptchaPreviewOpen] = useState(false);
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ["providers"] });

  const fetchData = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await ProvBackend.getProvider(owner!, name!);
      if (res.status === "ok" && res.data) { setProv(res.data); setOriginalJson(JSON.stringify(res.data)); }
    } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    finally { setLoading(false); }
  }, [owner, name, isNew]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: string, val: unknown) => setProv((p) => ({ ...p, [key]: val }));
  const category = String(prov.category ?? "OAuth");
  const type = String(prov.type ?? "");

  // Auto-generate name/displayName when category or type changes
  const autoGenNames = (cat: string, typ: string, subTyp?: string) => {
    const parts = [cat, typ, subTyp].filter(Boolean).join("_").toLowerCase().replace(/\s+/g, "_");
    if (nameAutoGen) set("name", `provider_${parts}`);
    if (displayNameAutoGen) set("displayName", [cat, typ, subTyp].filter(Boolean).join(" "));
  };

  const handleCategoryChange = (newCat: string) => {
    const newType = DEFAULT_TYPE_FOR_CATEGORY[newCat] ?? "";
    const updates: Record<string, unknown> = { category: newCat, type: newType };

    // Category-specific defaults
    if (newCat === "Email") {
      Object.assign(updates, {
        host: "smtp.example.com", port: 465, sslMode: "Auto",
        title: "JetAuth Verification Code",
        content: DEFAULT_EMAIL_HTML,
        metadata: DEFAULT_INVITATION_HTML,
      });
    } else if (newCat === "MFA") {
      Object.assign(updates, { host: "", port: 1812 });
    } else if (newCat === "Log") {
      Object.assign(updates, { host: "", port: 0, title: "", state: "Enabled" });
    } else if (newCat === "ID Verification") {
      Object.assign(updates, { endpoint: "" });
    }

    setProv((p) => ({ ...p, ...updates }));
    autoGenNames(newCat, newType);
  };

  const handleTypeChange = (newType: string) => {
    const updates: Record<string, unknown> = { type: newType };

    // Type-specific defaults
    if (category === "OAuth" && newType === "Custom") {
      Object.assign(updates, {
        customAuthUrl: "https://door.casdoor.com/login/oauth/authorize",
        scopes: "openid profile email",
        customTokenUrl: "https://door.casdoor.com/api/login/oauth/access_token",
        customUserInfoUrl: "https://door.casdoor.com/api/userinfo",
      });
    } else if (category === "Storage" && newType === "Local File System") {
      Object.assign(updates, { domain: window.location.origin });
    } else if (category === "SMS" && newType === "Custom HTTP SMS") {
      Object.assign(updates, { endpoint: "https://example.com/send-custom-http-sms", method: "GET", title: "code" });
    } else if (category === "Email" && newType === "Custom HTTP Email") {
      Object.assign(updates, { endpoint: "https://example.com/send-custom-http-email", method: "POST" });
    } else if (category === "Notification" && newType === "Custom HTTP") {
      Object.assign(updates, { method: "GET", title: "" });
    }

    setProv((p) => ({ ...p, ...updates }));
    autoGenNames(category, newType);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = isNew
        ? await ProvBackend.addProvider(prov as Provider)
        : await ProvBackend.updateProvider(owner!, name!, prov as Provider);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        setSaved(true);
        setOriginalJson(JSON.stringify(prov));
        setIsAddMode(false);
        invalidateList();
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) { modal.toast(e?.message || t("common.saveFailed" as any), "error"); }
    finally { setSaving(false); }
  };

  const handleSaveAndExit = async () => {
    setSaving(true);
    try {
      const res = isNew
        ? await ProvBackend.addProvider(prov as Provider)
        : await ProvBackend.updateProvider(owner!, name!, prov as Provider);
      if (res.status === "ok") {
        modal.toast(t("common.saveSuccess" as any));
        invalidateList();
        navigate("/providers");
      } else {
        modal.toast(friendlyError(res.msg, t) || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    } finally { setSaving(false); }
  };

  const handleBack = async () => {
    if (isAddMode) {
      await ProvBackend.deleteProvider(prov as Provider);
      invalidateList();
    }
    navigate("/providers");
  };

  const handleDelete = async () => {
    modal.showConfirm(t("common.confirmDelete"), async () => {
      try {
        const res = await ProvBackend.deleteProvider(prov as Provider);
        if (res.status === "ok") {
          invalidateList();
          navigate("/providers");
        } else {
          modal.toast(res.msg || t("common.deleteFailed" as any), "error");
        }
      } catch (e: any) {
        modal.toast(e?.message || t("common.deleteFailed" as any), "error");
      }
    });
  };

  const isDirty = originalJson !== "" && JSON.stringify(prov) !== originalJson;
  const showBanner = useUnsavedWarning({ isAddMode, isDirty });

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /></div>;
  }

  // ── Computed flags ──
  const hideCredentials = shouldHideCredentials(category, type);
  const showClientId2 = shouldShowClientId2(category, type);
  const showSubType = !!SUBTYPES[type];
  const appIdLabel = getAppIdLabel(category, type);
  const isOAuthLike = category === "OAuth" || category === "Web3" || category === "SAML";
  const isCustomOAuth = category === "OAuth" && type === "Custom";

  // ── Category-specific fields ──
  const renderCredentials = () => {
    if (hideCredentials) return null;
    return (
      <FormSection title={t("providers.section.credentials" as any)}>
        <FormField label={getClientIdLabel(category, type, t)}>
          <input value={String(prov.clientId ?? "")} onChange={(e) => set("clientId", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={getClientSecretLabel(category, type, t)}>
          <input value={String(prov.clientSecret ?? "")} onChange={(e) => set("clientSecret", e.target.value)} type="password" className={monoInputClass} />
        </FormField>
        {showClientId2 && (
          <>
            <FormField label={getClientId2Label(category, type, t)}>
              <input value={String(prov.clientId2 ?? "")} onChange={(e) => set("clientId2", e.target.value)} className={monoInputClass} />
            </FormField>
            {!shouldHideClientSecret2(category, type) && (
              <FormField label={getClientSecret2Label(category, type, t)}>
                {category === "OAuth" && type === "Apple" ? (
                  <textarea value={String(prov.clientSecret2 ?? "")} onChange={(e) => set("clientSecret2", e.target.value)} rows={4} className={`${monoInputClass} text-[11px]`} />
                ) : (
                  <input value={String(prov.clientSecret2 ?? "")} onChange={(e) => set("clientSecret2", e.target.value)} className={monoInputClass} />
                )}
              </FormField>
            )}
          </>
        )}
        {appIdLabel && (
          <FormField label={appIdLabel}>
            <input value={String(prov.appId ?? "")} onChange={(e) => set("appId", e.target.value)} className={monoInputClass} />
          </FormField>
        )}
      </FormSection>
    );
  };

  const renderOAuthFields = () => (
    <>
      {isCustomOAuth && (
        <>
          <FormSection title={t("providers.section.customOAuth" as any)}>
            <FormField label={t("providers.field.customAuthUrl" as any)} span="full">
              <input value={String(prov.customAuthUrl ?? "")} onChange={(e) => set("customAuthUrl", e.target.value)} className={inputClass} placeholder="https://example.com/oauth/authorize" />
            </FormField>
            <FormField label={t("providers.field.customTokenUrl" as any)} span="full">
              <input value={String(prov.customTokenUrl ?? "")} onChange={(e) => set("customTokenUrl", e.target.value)} className={inputClass} placeholder="https://example.com/oauth/token" />
            </FormField>
            <FormField label={t("providers.field.scopes" as any)} span="full">
              <input value={String(prov.scopes ?? "")} onChange={(e) => set("scopes", e.target.value)} className={inputClass} placeholder="openid profile email" />
            </FormField>
            <FormField label={t("providers.field.customUserInfoUrl" as any)} span="full">
              <input value={String(prov.customUserInfoUrl ?? "")} onChange={(e) => set("customUserInfoUrl", e.target.value)} className={inputClass} placeholder="https://example.com/api/userinfo" />
            </FormField>
            <FormField label={t("providers.field.customLogoutUrl" as any)} span="full">
              <input value={String(prov.customLogoutUrl ?? "")} onChange={(e) => set("customLogoutUrl", e.target.value)} className={inputClass} />
            </FormField>
            <FormField label={t("providers.field.enablePkce" as any)}>
              <Switch checked={!!prov.enablePkce} onChange={(v) => set("enablePkce", v)} />
            </FormField>
          </FormSection>
          <FormSection title={t("providers.section.userMapping" as any)}>
            {OAUTH_MAPPING_FIELDS.map((field) => (
              <FormField key={field} label={t(`providers.mapping.${field}` as any)} required={OAUTH_MAPPING_REQUIRED.includes(field)}>
                <input
                  value={String((prov.userMapping as any)?.[field] ?? "")}
                  onChange={(e) => set("userMapping", { ...(prov.userMapping as any ?? {}), [field]: e.target.value })}
                  className={monoInputClass}
                  placeholder={field}
                />
              </FormField>
            ))}
          </FormSection>
          <FormSection title={t("providers.field.customLogo" as any)}>
            <FormField label={t("providers.field.customLogo" as any)} span="full">
              <input value={String(prov.customLogo ?? "")} onChange={(e) => set("customLogo", e.target.value)} className={inputClass} />
            </FormField>
          </FormSection>
        </>
      )}
    </>
  );

  const sendTestEmail = async (testSmtp = false) => {
    const emailForm = {
      title: prov.title,
      content: prov.content,
      sender: prov.displayName,
      receivers: testSmtp ? ["TestSmtpServer"] : [String(prov.receiver ?? "")],
      provider: prov.name,
      providerObject: prov,
      owner: prov.owner,
      name: prov.name,
    };
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify(emailForm),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.status === "ok") {
        modal.toast(testSmtp ? t("providers.email.smtpSuccess" as any) : t("providers.email.sendSuccess" as any));
      } else {
        modal.toast(data.msg || t("common.saveFailed" as any), "error");
      }
    } catch (e: any) {
      modal.toast(e?.message || t("common.saveFailed" as any), "error");
    }
  };

  const renderEmailFields = () => (
    <>
      {type === "Custom HTTP Email" ? (
        <>
          <FormSection title={t("providers.section.emailConfig" as any)}>
            <FormField label={t("providers.field.endpoint")} span="full">
              <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder="https://example.com/send-email" />
            </FormField>
            <FormField label={t("providers.field.method" as any)}>
              <SimpleSelect value={String(prov.method ?? "POST")} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} onChange={(v) => set("method", v)} />
            </FormField>
          </FormSection>
          <FormSection title={t("providers.section.httpHeaders" as any)}>
            <FormField label="" span="full">
              <HttpHeadersEditor
                headers={(prov.httpHeaders as Record<string, string>) ?? {}}
                onChange={(h) => set("httpHeaders", h)}
              />
            </FormField>
          </FormSection>
          <FormSection title={t("providers.section.emailMapping" as any)}>
            {["fromName", "fromAddress", "toAddress", "subject", "content"].map((field) => (
              <FormField key={field} label={t(`providers.emailMapping.${field}` as any)}>
                <input
                  value={String((prov.userMapping as any)?.[field] ?? "")}
                  onChange={(e) => set("userMapping", { ...(prov.userMapping as any ?? {}), [field]: e.target.value })}
                  className={monoInputClass}
                  placeholder={field}
                />
              </FormField>
            ))}
          </FormSection>
        </>
      ) : (
        <FormSection title={t("providers.section.emailConfig" as any)}>
          {type !== "Resend" && (
            <FormField label={t("providers.field.host")}>
              <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} placeholder={t("help.placeholder.smtpHost" as any)} />
            </FormField>
          )}
          {!["Azure ACS", "SendGrid", "Resend"].includes(type) && (
            <>
              <FormField label={t("providers.field.port")}>
                <input type="number" value={String(prov.port ?? 465)} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
              </FormField>
              <FormField label={t("providers.field.sslMode" as any)}>
                <SimpleSelect value={String(prov.sslMode ?? "Auto")} options={[
                  { value: "Auto", label: t("providers.sslMode.auto" as any) },
                  { value: "Enable", label: t("providers.state.enabled" as any) },
                  { value: "Disable", label: t("providers.state.disabled" as any) },
                ]} onChange={(v) => set("sslMode", v)} />
              </FormField>
            </>
          )}
          <FormField label={t("providers.field.enableProxy" as any)}>
            <Switch checked={!!prov.enableProxy} onChange={(v) => set("enableProxy", v)} />
          </FormField>
          <FormField label={t("providers.field.emailTitle" as any)} span="full">
            <input value={String(prov.title ?? "")} onChange={(e) => set("title", e.target.value)} className={inputClass} />
          </FormField>
        </FormSection>
      )}

      {/* Email Content — editor + preview */}
      <FormSection title={t("providers.field.emailContent" as any)}>
        <div className="col-span-2 space-y-2">
          <div className="flex gap-2">
            <button onClick={() => set("content", DEFAULT_EMAIL_TEXT)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("providers.email.resetText" as any)}
            </button>
            <button onClick={() => set("content", DEFAULT_EMAIL_HTML)} className="rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
              {t("providers.email.resetHtml" as any)}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea value={String(prov.content ?? "")} onChange={(e) => set("content", e.target.value)} rows={12} className={`${monoInputClass} text-[11px]`} />
            <div className="rounded-lg border border-border bg-white p-3 overflow-auto max-h-[300px]">
              <div dangerouslySetInnerHTML={{ __html: String(prov.content ?? "").replace(/%s/g, "123456").replace(/%\{user\.friendlyName\}/g, "User") }} />
            </div>
          </div>
        </div>
      </FormSection>

      {/* Invitation Email Content — editor + preview */}
      <FormSection title={t("providers.email.invitationContent" as any)}>
        <div className="col-span-2 space-y-2">
          <div className="flex gap-2">
            <button onClick={() => set("metadata", DEFAULT_INVITATION_TEXT)} className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors">
              {t("providers.email.resetText" as any)}
            </button>
            <button onClick={() => set("metadata", DEFAULT_INVITATION_HTML)} className="rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
              {t("providers.email.resetHtml" as any)}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <textarea value={String(prov.metadata ?? "")} onChange={(e) => set("metadata", e.target.value)} rows={12} className={`${monoInputClass} text-[11px]`} />
            <div className="rounded-lg border border-border bg-white p-3 overflow-auto max-h-[300px]">
              <div dangerouslySetInnerHTML={{ __html: String(prov.metadata ?? "").replace(/%code/g, "123456").replace(/%s/g, "123456") }} />
            </div>
          </div>
        </div>
      </FormSection>

      {/* Test Email */}
      <FormSection title={t("providers.email.testEmail" as any)}>
        <FormField label={t("providers.field.receiver" as any)} span="full">
          <div className="flex gap-2 items-center">
            <input value={String(prov.receiver ?? "")} onChange={(e) => set("receiver", e.target.value)} className={`${inputClass} flex-1`} placeholder={t("providers.help.testReceiver" as any)} />
            {!["Azure ACS", "SendGrid", "Resend"].includes(type) && (
              <button onClick={() => sendTestEmail(true)} className="rounded-lg border border-border px-3 py-2 text-[12px] font-medium text-text-secondary hover:bg-surface-2 transition-colors whitespace-nowrap">
                {t("providers.email.testSmtp" as any)}
              </button>
            )}
            <button
              onClick={() => sendTestEmail(false)}
              disabled={!prov.receiver || !String(prov.receiver).includes("@")}
              className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {t("providers.email.sendTest" as any)}
            </button>
          </div>
        </FormField>
      </FormSection>
    </>
  );

  const renderSmsFields = () => (
    <FormSection title={t("providers.section.smsConfig" as any)}>
      {type === "Mock SMS" && (
        <div className="col-span-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-[12px] text-amber-800 whitespace-pre-line leading-relaxed">
          {t("providers.sms.mockNotice" as any)}
        </div>
      )}
      {type === "Custom HTTP SMS" ? (
        <>
          <FormField label={t("providers.field.endpoint")} span="full">
            <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder="https://example.com/send-sms" />
          </FormField>
          <FormField label={t("providers.field.method" as any)}>
            <SimpleSelect value={String(prov.method ?? "GET")} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} onChange={(v) => set("method", v)} />
          </FormField>
          <FormField label={t("providers.field.enableProxy" as any)}>
            <Switch checked={!!prov.enableProxy} onChange={(v) => set("enableProxy", v)} />
          </FormField>
          {/* HTTP Headers */}
          <FormField label={t("providers.section.httpHeaders" as any)} span="full">
            <HttpHeadersEditor
              headers={(prov.httpHeaders as Record<string, string>) ?? {}}
              onChange={(h) => set("httpHeaders", h)}
            />
          </FormField>
          {/* SMS mapping fields */}
          {["phoneNumber", "content"].map((field) => (
            <FormField key={field} label={t(`providers.smsMapping.${field}` as any)}>
              <input
                value={String((prov.userMapping as any)?.[field] ?? "")}
                onChange={(e) => set("userMapping", { ...(prov.userMapping as any ?? {}), [field]: e.target.value })}
                className={monoInputClass}
                placeholder={field}
              />
            </FormField>
          ))}
        </>
      ) : (
        <>
          <FormField label={t("providers.field.signName" as any)}>
            <input value={String(prov.signName ?? "")} onChange={(e) => set("signName", e.target.value)} className={inputClass} />
          </FormField>
          <FormField label={t("providers.field.templateCode" as any)}>
            <input value={String(prov.templateCode ?? "")} onChange={(e) => set("templateCode", e.target.value)} className={monoInputClass} />
          </FormField>
        </>
      )}
    </FormSection>
  );

  const renderStorageFields = () => (
    <FormSection title={t("providers.section.storageConfig" as any)}>
      <FormField label={t("providers.field.endpoint")}>
        <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder={t("help.placeholder.s3Endpoint" as any)} />
      </FormField>
      {type !== "Local File System" && (
        <FormField label={t("providers.field.intranetEndpoint" as any)}>
          <input value={String(prov.intranetEndpoint ?? "")} onChange={(e) => set("intranetEndpoint", e.target.value)} className={inputClass} />
        </FormField>
      )}
      <FormField label={t("providers.field.bucket")}>
        <input value={String(prov.bucket ?? "")} onChange={(e) => set("bucket", e.target.value)} className={monoInputClass} />
      </FormField>
      <FormField label={t("providers.field.pathPrefix" as any)}>
        <input value={String(prov.pathPrefix ?? "")} onChange={(e) => set("pathPrefix", e.target.value)} className={monoInputClass} placeholder="e.g., /uploads" />
      </FormField>
      <FormField label={t("providers.field.domain")} help={t("help.customDomain" as any)}>
        <input value={String(prov.domain ?? "")} onChange={(e) => set("domain", e.target.value)} className={inputClass} />
      </FormField>
      <FormField label={t("providers.field.region")}>
        <input value={String(prov.region ?? "")} onChange={(e) => set("region", e.target.value)} className={monoInputClass} placeholder={t("help.placeholder.s3Region" as any)} />
      </FormField>
    </FormSection>
  );

  const fetchSamlMetadataFromUrl = async () => {
    if (!samlMetadataUrl) return;
    setSamlMetadataLoading(true);
    try {
      const res = await fetch(samlMetadataUrl);
      if (!res.ok) throw new Error("Failed to fetch");
      const xml = await res.text();
      set("metadata", xml);
      modal.toast(t("common.saveSuccess" as any));
    } catch (e: any) {
      modal.toast(e?.message || "Failed to fetch metadata", "error");
    } finally { setSamlMetadataLoading(false); }
  };

  const parseSamlMetadata = () => {
    try {
      const rawXml = String(prov.metadata ?? "").replace(/\n/g, "");
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawXml, "text/xml");
      const cert = doc.querySelector("X509Certificate")?.textContent?.replace(/\s/g, "") ?? "";
      const endpoint = doc.querySelector("SingleSignOnService")?.getAttribute("Location") ?? "";
      const issuerUrl = doc.querySelector("EntityDescriptor")?.getAttribute("entityID") ?? "";
      set("idP", cert);
      set("endpoint", endpoint);
      set("issuerUrl", issuerUrl);
      modal.toast(t("providers.saml.parseSuccess" as any));
    } catch {
      modal.toast(t("providers.saml.parseFailed" as any), "error");
    }
  };

  const spAcsUrl = `${window.location.origin}/api/acs`;

  const renderSamlFields = () => (
    <>
      <FormSection title={t("providers.section.samlConfig" as any)}>
        <FormField label={t("providers.field.enableSignAuthnRequest" as any)}>
          <Switch checked={!!prov.enableSignAuthnRequest} onChange={(v) => set("enableSignAuthnRequest", v)} />
        </FormField>
        <FormField label={t("providers.field.emailRegex" as any)}>
          <input value={String(prov.emailRegex ?? "")} onChange={(e) => set("emailRegex", e.target.value)} className={monoInputClass} placeholder="e.g., ^.*@example\\.com$" />
        </FormField>
      </FormSection>
      <FormSection title={t("providers.section.samlMetadata" as any)}>
        {/* Metadata URL fetch */}
        <FormField label={t("providers.saml.metadataUrl" as any)} span="full">
          <div className="flex gap-2">
            <input value={samlMetadataUrl} onChange={(e) => setSamlMetadataUrl(e.target.value)} className={`${inputClass} flex-1`} placeholder="https://idp.example.com/metadata" />
            <button
              onClick={fetchSamlMetadataFromUrl}
              disabled={samlMetadataLoading || !samlMetadataUrl}
              className="rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {samlMetadataLoading ? t("common.loading" as any) : t("providers.saml.request" as any)}
            </button>
          </div>
        </FormField>
        {/* Metadata XML */}
        <FormField label={t("providers.field.metadata" as any)} span="full">
          <textarea value={String(prov.metadata ?? "")} onChange={(e) => set("metadata", e.target.value)} rows={6} className={`${monoInputClass} text-[11px]`} placeholder="Paste SAML metadata XML here..." />
        </FormField>
        <div className="col-span-2">
          <button onClick={parseSamlMetadata} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors">
            {t("providers.saml.parse" as any)}
          </button>
        </div>
        {/* Parsed fields */}
        <FormField label={t("providers.field.endpoint")} span="full">
          <input value={String(prov.endpoint ?? "")} onChange={(e) => set("endpoint", e.target.value)} className={inputClass} placeholder="SAML 2.0 Endpoint (HTTP)" />
        </FormField>
        <FormField label={t("providers.field.idpCert" as any)} span="full">
          <input value={String(prov.idP ?? "")} onChange={(e) => set("idP", e.target.value)} className={monoInputClass} />
        </FormField>
        <FormField label={t("providers.field.issuerUrl" as any)} span="full">
          <input value={String(prov.issuerUrl ?? "")} onChange={(e) => set("issuerUrl", e.target.value)} className={inputClass} />
        </FormField>
        {/* SP ACS URL (readonly + copy) */}
        <FormField label={t("providers.saml.spAcsUrl" as any)} span="full">
          <div className="flex gap-2">
            <input value={spAcsUrl} readOnly className={`${inputClass} flex-1 bg-surface-2 cursor-default`} />
            <button onClick={() => { navigator.clipboard.writeText(spAcsUrl); modal.toast(t("common.copySuccess" as any)); }} className="rounded-lg border border-border p-2 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <Copy size={14} />
            </button>
          </div>
        </FormField>
        {/* SP Entity ID (readonly + copy) */}
        <FormField label={t("providers.saml.spEntityId" as any)} span="full">
          <div className="flex gap-2">
            <input value={spAcsUrl} readOnly className={`${inputClass} flex-1 bg-surface-2 cursor-default`} />
            <button onClick={() => { navigator.clipboard.writeText(spAcsUrl); modal.toast(t("common.copySuccess" as any)); }} className="rounded-lg border border-border p-2 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
              <Copy size={14} />
            </button>
          </div>
        </FormField>
      </FormSection>
    </>
  );

  const renderPaymentFields = () => (
    <FormSection title={t("providers.section.paymentConfig" as any)}>
      {/* Dummy — info notice */}
      {type === "Dummy" && (
        <div className="col-span-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-[12px] text-amber-800 whitespace-pre-line leading-relaxed">
          {t("providers.payment.dummyNotice" as any)}
        </div>
      )}
      {/* Cert — Alipay, WeChat Pay */}
      {["Alipay", "WeChat Pay"].includes(type) && (
        <FormField label={t("providers.field.cert" as any)}>
          <input value={String(prov.cert ?? "")} onChange={(e) => set("cert", e.target.value)} className={monoInputClass} />
        </FormField>
      )}
      {/* Root cert — Alipay only (stored in metadata) */}
      {type === "Alipay" && (
        <FormField label={t("providers.payment.rootCert" as any)}>
          <input value={String(prov.metadata ?? "")} onChange={(e) => set("metadata", e.target.value)} className={monoInputClass} />
        </FormField>
      )}
      {/* Host — GC, FastSpring */}
      {["GC", "FastSpring"].includes(type) && (
        <FormField label={t("providers.field.host")} help={t("help.webhookUrl" as any)}>
          <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} />
        </FormField>
      )}
    </FormSection>
  );

  const loadCaptchaPreview = async () => {
    try {
      const res = await fetch(`/api/get-captcha?applicationId=${prov.owner}/${encodeURIComponent(String(prov.name))}&isCurrentProvider=true`);
      const json = await res.json();
      const captcha = json.data ?? json; // API wraps in { status, data: {...} }
      if (captcha.type === "Default") {
        setCaptchaImg(captcha.captchaImage);
        setCaptchaId(captcha.captchaId);
        setCaptchaInput("");
        setCaptchaPreviewOpen(true);
      } else if (captcha.type && captcha.type !== "none") {
        // Third-party captcha — show notice
        modal.toast(t("providers.captcha.thirdPartyNotice" as any));
      }
    } catch (e: any) {
      modal.toast(e?.message || "Failed to load captcha", "error");
    }
  };

  const verifyCaptchaPreview = async () => {
    try {
      const form = new FormData();
      form.append("captchaType", String(prov.type));
      form.append("captchaToken", captchaInput);
      form.append("clientSecret", captchaId);
      form.append("applicationId", `${prov.owner}/${prov.name}`);
      const res = await fetch("/api/verify-captcha", { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      if (data.status === "ok" && data.data === true) {
        modal.toast(t("providers.captcha.verifySuccess" as any));
        setCaptchaPreviewOpen(false);
      } else {
        modal.toast(data.msg || t("providers.captcha.verifyFailed" as any), "error");
        loadCaptchaPreview(); // Reload on failure
      }
    } catch {
      modal.toast(t("providers.captcha.verifyFailed" as any), "error");
    }
  };

  const renderCaptchaFields = () => {
    const isPreviewDisabled = () => {
      if (type === "Default") return false;
      if (!prov.clientId || !prov.clientSecret) return true;
      if (type === "Aliyun Captcha" && (!prov.subType || !prov.clientId2 || !prov.clientSecret2)) return true;
      return false;
    };

    return (
      <FormSection>
        <FormField label={t("providers.captcha.preview" as any)} help={t("providers.captcha.previewHelp" as any)} span="full">
          <div className="space-y-3">
            <button
              onClick={loadCaptchaPreview}
              disabled={isPreviewDisabled()}
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {t("providers.captcha.preview" as any)}
            </button>
            {/* Default captcha preview inline */}
            {captchaPreviewOpen && captchaImg && (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 p-4">
                <div className="space-y-2">
                  <img
                    src={`data:image/png;base64,${captchaImg}`}
                    alt="captcha"
                    onClick={loadCaptchaPreview}
                    className="h-[50px] w-[200px] rounded border border-border cursor-pointer object-contain bg-white"
                  />
                  <p className="text-[11px] text-text-muted">{t("providers.captcha.clickRefresh" as any)}</p>
                </div>
                <div className="flex gap-2">
                  <input
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") verifyCaptchaPreview(); }}
                    placeholder={t("providers.captcha.inputCode" as any)}
                    maxLength={5}
                    className={`${monoInputClass} w-28 text-center text-lg tracking-widest`}
                  />
                  <button
                    onClick={verifyCaptchaPreview}
                    disabled={!/^\d{5}$/.test(captchaInput)}
                    className="rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {t("providers.captcha.verify" as any)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </FormField>
      </FormSection>
    );
  };

  const renderNotificationFields = () => (
    <FormSection title={t("providers.section.notificationConfig" as any)}>
      <FormField label={t("providers.field.receiver" as any)} span="full">
        <input
          value={String(prov.receiver ?? "")}
          onChange={(e) => set("receiver", e.target.value)}
          className={inputClass}
          placeholder={["Telegram", "Pushover", "Pushbullet", "Slack", "Discord", "Line"].includes(type) ? "Chat ID" : "Endpoint"}
        />
      </FormField>
    </FormSection>
  );

  const renderMfaFields = () => (
    <FormSection title={t("providers.section.mfaConfig" as any)}>
      <FormField label={t("providers.field.host")}>
        <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} placeholder="RADIUS server host" />
      </FormField>
      <FormField label={t("providers.field.port")}>
        <input type="number" value={String(prov.port ?? 1812)} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
      </FormField>
    </FormSection>
  );

  const renderLogFields = () => (
    <FormSection title={t("providers.section.logConfig" as any)}>
      <FormField label={t("providers.field.host")}>
        <input value={String(prov.host ?? "")} onChange={(e) => set("host", e.target.value)} className={inputClass} />
      </FormField>
      <FormField label={t("providers.field.port")}>
        <input type="number" value={String(prov.port ?? 0)} onChange={(e) => set("port", Number(e.target.value))} className={monoInputClass} />
      </FormField>
      <FormField label={t("providers.field.state" as any)}>
        <SimpleSelect value={String(prov.state ?? "Enabled")} options={[{ value: "Enabled", label: t("providers.state.enabled" as any) }, { value: "Disabled", label: t("providers.state.disabled" as any) }]} onChange={(v) => set("state", v)} />
      </FormField>
    </FormSection>
  );

  const renderCategorySpecificFields = () => {
    switch (category) {
      case "OAuth": return renderOAuthFields();
      case "Email": return renderEmailFields();
      case "SMS": return renderSmsFields();
      case "Storage": return renderStorageFields();
      case "SAML": return renderSamlFields();
      case "Payment": return renderPaymentFields();
      case "Captcha": return renderCaptchaFields();
      case "Web3": return (
        <FormSection title={t("providers.section.config" as any)}>
          <FormField label={t("providers.field.enableSignUp" as any)}>
            <Switch checked={!!prov.enableSignUp} onChange={(v) => set("enableSignUp", v)} />
          </FormField>
        </FormSection>
      );
      case "Notification": return renderNotificationFields();
      case "MFA": return renderMfaFields();
      case "Log": return renderLogFields();
      default: return null;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isAddMode ? t("common.add") : t("common.edit")} {t("providers.title")}
            </h1>
            {!isNew && <p className="text-[13px] text-text-muted font-mono mt-0.5">{owner}/{name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button onClick={handleDelete} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 transition-colors">
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          )}
          <SaveButton onClick={handleSave} saving={saving} saved={saved} label={t("common.save")} />
          <button onClick={handleSaveAndExit} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors">
            {saving ? <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <LogOut size={14} />}
            {t("common.saveAndExit" as any)}
          </button>
        </div>
      </div>

      {showBanner && <UnsavedBanner isAddMode={isAddMode} />}

      {/* Basic info */}
      <FormSection title={t("field.name")}>
        <FormField label={t("field.owner")}>
          <SimpleSelect value={String(prov.owner ?? "")} options={[{ value: "admin", label: "admin" }, ...orgOptions.map((o) => ({ value: o.name, label: o.displayName || o.name }))]} onChange={(v) => set("owner", v)} disabled={!isGlobalAdmin} />
        </FormField>
        <FormField label={t("field.name")} required>
          <input
            value={String(prov.name ?? "")}
            onChange={(e) => { set("name", e.target.value); setNameAutoGen(false); }}
            className={monoInputClass}
          />
        </FormField>
        <FormField label={t("field.displayName")}>
          <input
            value={String(prov.displayName ?? "")}
            onChange={(e) => { set("displayName", e.target.value); setDisplayNameAutoGen(false); }}
            className={inputClass}
          />
        </FormField>
        <FormField label={t("providers.field.category")}>
          <SimpleSelect
            value={category}
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            onChange={handleCategoryChange}
          />
        </FormField>
        <FormField label={t("field.type")}>
          <ProviderTypeSelect
            category={category}
            value={type}
            options={TYPE_BY_CATEGORY[category] ?? []}
            onChange={handleTypeChange}
            placeholder={t("common.search" as any)}
            isDark={theme === "dark"}
          />
          {PROVIDER_URLS[type] && (
            <a
              href={PROVIDER_URLS[type]}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-text-muted hover:text-accent transition-colors"
            >
              <ExternalLink size={11} />
              <span>{t("providers.officialSite" as any)}</span>
              <span className="opacity-50 font-mono truncate max-w-[200px]">{PROVIDER_URLS[type].replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
            </a>
          )}
        </FormField>
        {showSubType && (
          <FormField label={t("providers.field.subType" as any)}>
            <SimpleSelect
              value={String(prov.subType ?? "")}
              options={(SUBTYPES[type] ?? []).map((s) => ({ value: s, label: s }))}
              onChange={(v) => { set("subType", v); autoGenNames(category, type, v); }}
            />
          </FormField>
        )}
        {/* OAuth: Email regex */}
        {category === "OAuth" && (
          <FormField label={t("providers.field.emailRegex" as any)} help={t("providers.help.emailRegex" as any)}>
            <input value={String(prov.emailRegex ?? "")} onChange={(e) => set("emailRegex", e.target.value)} className={monoInputClass} placeholder="e.g., ^.*@example\\.com$" />
          </FormField>
        )}
        {/* WeCom-specific: method, scope, use id as name */}
        {type === "WeCom" && (
          <>
            <FormField label={t("providers.field.method" as any)}>
              <SimpleSelect value={String(prov.method ?? "Normal")} options={[{ value: "Normal", label: "Normal" }, { value: "Silent", label: "Silent" }]} onChange={(v) => set("method", v)} />
            </FormField>
            <FormField label={t("providers.field.scopes" as any)}>
              <SimpleSelect value={String(prov.scopes ?? "snsapi_userinfo")} options={[{ value: "snsapi_userinfo", label: "snsapi_userinfo" }, { value: "snsapi_privateinfo", label: "snsapi_privateinfo" }]} onChange={(v) => set("scopes", v)} />
            </FormField>
            <FormField label={t("providers.field.useIdAsName" as any)}>
              <Switch checked={!!prov.disableSsl} onChange={(v) => set("disableSsl", v)} />
            </FormField>
          </>
        )}
      </FormSection>

      {/* Credentials (conditional) */}
      {renderCredentials()}

      {/* Category-specific sections */}
      {renderCategorySpecificFields()}

      {/* Provider URL — after all category fields, hidden for Log */}
      {category !== "Log" && (
        <FormSection>
          <FormField label={t("providers.field.providerUrl")} help={t("providers.help.providerUrl" as any)} span="full">
            <div className="flex gap-2">
              <input value={String(prov.providerUrl ?? "")} onChange={(e) => set("providerUrl", e.target.value)} className={`${inputClass} flex-1`} />
              {prov.providerUrl && (
                <a href={String(prov.providerUrl)} target="_blank" rel="noreferrer" className="rounded-lg border border-border p-2 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </FormField>
        </FormSection>
      )}
    </motion.div>
  );
}

// ── HTTP Headers key-value editor ──
function HttpHeadersEditor({ headers, onChange }: {
  headers: Record<string, string>;
  onChange: (h: Record<string, string>) => void;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(headers);

  return (
    <div className="space-y-2">
      {entries.map(([key, value], i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={key}
            onChange={(e) => {
              const next = { ...headers };
              delete next[key];
              next[e.target.value] = value;
              onChange(next);
            }}
            placeholder="Header name"
            className={`${inputClass} !py-1 !text-[12px] flex-1`}
          />
          <input
            value={value}
            onChange={(e) => onChange({ ...headers, [key]: e.target.value })}
            placeholder="Header value"
            className={`${inputClass} !py-1 !text-[12px] flex-1`}
          />
          <button
            onClick={() => { const next = { ...headers }; delete next[key]; onChange(next); }}
            className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange({ ...headers, "": "" })}
        className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:bg-accent-hover transition-colors"
      >
        {t("common.add")}
      </button>
    </div>
  );
}

// ── Provider icon renderer ──
const LUCIDE_ICONS: Record<string, React.FC<{ size: number; className: string }>> = {
  shield: ShieldCheck, bell: Bell, hardDrive: HardDrive, creditCard: CreditCard,
  wallet: Wallet, messageSquare: MessageSquare, smartphone: Smartphone,
  key: Key, globe: Globe, link: Link, settings: Settings,
};

function ProviderIcon({ url, isDark }: { url: string; isDark?: boolean }) {
  if (!url) return null;
  // Lucide local icons
  if (url.startsWith("local:")) {
    const iconName = url.slice(6);
    const Icon = LUCIDE_ICONS[iconName];
    if (Icon) return <Icon size={16} className={`${isDark ? "text-white" : "text-accent"} shrink-0`} />;
    return null;
  }
  // Local brand SVG files
  if (url.startsWith("brand:")) {
    const file = url.slice(6);
    return <img src={`/img/brand/${file}`} alt="" className="h-4 w-4 object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />;
  }
  // External CDN URL
  return <img src={url} alt="" className="h-4 w-4 object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />;
}

// ── Provider type select with logos ──
function ProviderTypeSelect({ category, value, options, onChange, placeholder, isDark }: {
  category: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  isDark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const logoUrl = getProviderLogoUrl(category, value, !!isDark);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(!open)}
        className={`flex items-center rounded-lg border bg-surface-2 px-2.5 py-2 min-h-[38px] cursor-pointer transition-colors ${open ? "border-accent ring-1 ring-accent/30" : "border-border"}`}
      >
        {open ? (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
          />
        ) : (
          <span className="flex items-center gap-2 text-[13px] flex-1 text-text-primary">
            <ProviderIcon url={logoUrl} isDark={isDark} />
            {value || "—"}
          </span>
        )}
        <ChevronDown size={14} className={`text-text-muted shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-[60] mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-[var(--shadow-elevated)]">
          {filtered.map((opt) => {
            const optLogo = getProviderLogoUrl(category, opt, !!isDark);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); setSearch(""); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors ${
                  opt === value ? "text-accent bg-accent/5 font-medium" : "text-text-primary hover:bg-surface-2"
                }`}
              >
                <ProviderIcon url={optLogo} isDark={isDark} />
                {opt}
              </button>
            );
          })}
          {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-text-muted">No results</div>}
        </div>
      )}
    </div>
  );
}
