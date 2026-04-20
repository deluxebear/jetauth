import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import { useSidebar } from "./SidebarContext";
import { useOrganization } from "./OrganizationContext";
import { useTheme } from "./theme";
import * as OrgBackend from "./backend/OrganizationBackend";
import AuthShell from "./auth/AuthShell";
import AuthCallback from "./auth/AuthCallback";
import WalletLoginPage from "./auth/WalletLoginPage";
import TelegramLoginPage from "./auth/TelegramLoginPage";
import MfaSetup from "./pages/MfaSetup";
import MfaVerify from "./pages/MfaVerify";
import EnableMfaNotification from "./components/EnableMfaNotification";
import Dashboard from "./pages/Dashboard";
import GenericListPage from "./components/GenericListPage";
import GenericEditPage from "./components/GenericEditPage";
// Identity
import OrganizationListPage from "./pages/OrganizationListPage";
import OrganizationEditPage from "./pages/OrganizationEditPage";
import GroupListPage from "./pages/GroupListPage";
import GroupEditPage from "./pages/GroupEditPage";
import UserListPage from "./pages/UserListPage";
import UserEditPage from "./pages/UserEditPage";
import InvitationListPage from "./pages/InvitationListPage";
import InvitationEditPage from "./pages/InvitationEditPage";
// Authentication
import UserHomePage from "./pages/UserHomePage";
import ApplicationListPage from "./pages/ApplicationListPage";
import ApplicationEditPage from "./pages/ApplicationEditPage";
import ProviderListPage from "./pages/ProviderListPage";
import ProviderEditPage from "./pages/ProviderEditPage";
import ResourceListPage from "./pages/ResourceListPage";
import CertListPage from "./pages/CertListPage";
import CertEditPage from "./pages/CertEditPage";
import KeyListPage from "./pages/KeyListPage";
import KeyEditPage from "./pages/KeyEditPage";
// Authorization
import AuthorizationPage from "./pages/AuthorizationPage";
import AppAuthorizationPage from "./pages/AppAuthorizationPage";
import BizRoleEditPage from "./pages/BizRoleEditPage";
import BizPermissionEditPage from "./pages/BizPermissionEditPage";
import RoleListPage from "./pages/RoleListPage";
import RoleEditPage from "./pages/RoleEditPage";
import PermissionListPage from "./pages/PermissionListPage";
import PermissionEditPage from "./pages/PermissionEditPage";
import ModelListPage from "./pages/ModelListPage";
import ModelEditPage from "./pages/ModelEditPage";
import AdapterListPage from "./pages/AdapterListPage";
import AdapterEditPage from "./pages/AdapterEditPage";
import EnforcerListPage from "./pages/EnforcerListPage";
import EnforcerEditPage from "./pages/EnforcerEditPage";
// LLM AI
import AgentListPage from "./pages/AgentListPage";
import AgentEditPage from "./pages/AgentEditPage";
import ServerListPage from "./pages/ServerListPage";
import ServerEditPage from "./pages/ServerEditPage";
import ServerStorePage from "./pages/ServerStorePage";
import EntryListPage from "./pages/EntryListPage";
import EntryEditPage from "./pages/EntryEditPage";
import SiteListPage from "./pages/SiteListPage";
import SiteEditPage from "./pages/SiteEditPage";
import RuleListPage from "./pages/RuleListPage";
import RuleEditPage from "./pages/RuleEditPage";
// Audit
import TokenListPage from "./pages/TokenListPage";
import TokenEditPage from "./pages/TokenEditPage";
import SessionListPage from "./pages/SessionListPage";
import RecordListPage from "./pages/RecordListPage";
import VerificationListPage from "./pages/VerificationListPage";
// Business
import ProductStorePage from "./pages/ProductStorePage";
import ProductBuyPage from "./pages/ProductBuyPage";
import ProductListPage from "./pages/ProductListPage";
import ProductEditPage from "./pages/ProductEditPage";
import CartPage from "./pages/CartPage";
import OrderPayPage from "./pages/OrderPayPage";
import PaymentResultPage from "./pages/PaymentResultPage";
import PlanListPage from "./pages/PlanListPage";
import PlanEditPage from "./pages/PlanEditPage";
import PricingListPage from "./pages/PricingListPage";
import PricingEditPage from "./pages/PricingEditPage";
import SubscriptionListPage from "./pages/SubscriptionListPage";
import SubscriptionEditPage from "./pages/SubscriptionEditPage";
import PaymentListPage from "./pages/PaymentListPage";
import PaymentEditPage from "./pages/PaymentEditPage";
import TransactionListPage from "./pages/TransactionListPage";
import TransactionEditPage from "./pages/TransactionEditPage";
import OrderListPage from "./pages/OrderListPage";
import OrderEditPage from "./pages/OrderEditPage";
// Admin
import SyncerListPage from "./pages/SyncerListPage";
import SyncerEditPage from "./pages/SyncerEditPage";
import WebhookListPage from "./pages/WebhookListPage";
import WebhookEditPage from "./pages/WebhookEditPage";
import WebhookEventListPage from "./pages/WebhookEventListPage";
import FormListPage from "./pages/FormListPage";
import FormEditPage from "./pages/FormEditPage";
import TicketListPage from "./pages/TicketListPage";
import TicketEditPage from "./pages/TicketEditPage";

import LdapEditPage from "./pages/LdapEditPage";
import LdapSyncPage from "./pages/LdapSyncPage";
import GroupTreePage from "./pages/GroupTreePage";
import SystemInfoPage from "./pages/SystemInfoPage";
import SwaggerPage from "./pages/SwaggerPage";
import { entityConfigs } from "./pages/entities/entityConfigs";
import { getAccount, login as apiLogin, logout as apiLogout } from "./api/client";
import { isLocalAdmin, isGlobalAdmin } from "./utils/auth";

interface User {
  owner: string;
  name: string;
  displayName: string;
  avatar: string;
  isAdmin: boolean;
  [key: string]: unknown;
}

function Layout({
  children,
  user,
  onLogout,
}: {
  children: ReactNode;
  user: User;
  onLogout: () => void;
}) {
  const { width } = useSidebar();
  const { selectedOrg, isAll } = useOrganization();
  const { applyOrgTheme, clearOrgTheme } = useTheme();

  const isAdmin = user.owner === "built-in" || user.isAdmin;

  useEffect(() => {
    if (!isAdmin) {
      // Non-admin users: always apply their own org's theme
      const orgData = JSON.parse(localStorage.getItem("organizationData") ?? "null");
      if (orgData?.themeData?.isEnabled) {
        applyOrgTheme(orgData.themeData);
      }
      return () => clearOrgTheme();
    }
    // Admin users: follow org selector
    if (isAll) {
      clearOrgTheme();
      return;
    }
    OrgBackend.getOrganization("admin", selectedOrg).then((res) => {
      if (res.status === "ok" && res.data) {
        const td = (res.data as any).themeData;
        if (td?.isEnabled) {
          applyOrgTheme(td);
        } else {
          clearOrgTheme();
        }
      }
    });
    return () => clearOrgTheme();
  }, [selectedOrg, isAll, isAdmin, applyOrgTheme, clearOrgTheme]);

  return (
    <div className="min-h-screen bg-surface-0">
      <Sidebar account={user} />
      <motion.div
        animate={{ marginLeft: width }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="min-h-screen flex flex-col"
      >
        <Header user={user} onLogout={onLogout} />
        <main className="flex-1 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [_loginError, setLoginError] = useState("");
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [loginThemeData] = useState<any>(null);
  const [loginOrgBranding] = useState<{ logo?: string; logoDark?: string; favicon?: string; displayName?: string } | null>(null);
  const [mfaState, setMfaState] = useState<{
    type: "setup" | "verify";
    mfaType?: string;
    mfaProps?: any[];
    loginForm: { application: string; organization: string; username: string; encryptedPassword: string };
  } | null>(null);
  const navigate = useNavigate();

  const applyAccountData = useCallback((res: any) => {
    if (res?.status !== "ok" || !res.data) return false;
    setUser(res.data);
    localStorage.setItem("account", JSON.stringify(res.data));
    if (res.data2) {
      localStorage.setItem("organizationData", JSON.stringify(res.data2));
      if (res.data2.favicon) {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = res.data2.favicon + (res.data2.favicon.includes("?") ? "&" : "?") + "t=" + Date.now();
      }
      if (res.data2.displayName) {
        document.title = res.data2.displayName;
      }
    }
    window.dispatchEvent(new Event("accountChanged"));
    return true;
  }, []);

  // Skip auth bootstrap when:
  // - ?preview / ?previewConfig → rendered in the admin preview iframe
  // - ?asGuest → admin opened the real login page in a new tab for a visual
  //   smoke test; without this flag the existing admin session would redirect
  //   "/login/:org/:app" to "/".
  const isPreviewMode =
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).has("preview") ||
      new URLSearchParams(window.location.search).has("previewConfig") ||
      new URLSearchParams(window.location.search).has("asGuest"));

  useEffect(() => {
    if (isPreviewMode) {
      setLoading(false);
      return;
    }
    getAccount()
      .then((res: any) => { applyAccountData(res); })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Theme is fetched by Login component via onOrganizationChange callback
  }, [isPreviewMode]);

  const handleLogout = async () => {
    const userOrg = user?.owner;
    try {
      await apiLogout();
    } catch {}
    localStorage.removeItem("account");
    localStorage.removeItem("organizationData");
    localStorage.removeItem("selectedOrganization");
    // Hard redirect to org login page — React Router can't handle this
    // because the logged-in route's "*" catch-all intercepts before user state clears
    window.location.href = userOrg && userOrg !== "built-in" ? `/login/${userOrg}` : "/login";
  };

  const handleMfaSetupComplete = async () => {
    if (!mfaState) return;
    try {
      const res: any = await apiLogin({
        application: mfaState.loginForm.application,
        organization: mfaState.loginForm.organization,
        username: mfaState.loginForm.username,
        password: mfaState.loginForm.encryptedPassword,
        signinMethod: "Password",
        type: "login",
      });
      if (res?.status === "ok") {
        if (res.data === "NextMfa") {
          setMfaState({
            type: "verify",
            mfaProps: res.data2 || [],
            loginForm: mfaState.loginForm,
          });
          navigate(`/mfa/verify?mfaType=${res.data2?.[0]?.mfaType || "app"}`);
        } else if (res.data !== "RequiredMfa") {
          setMfaState(null);
          const acc: any = await getAccount();
          if (applyAccountData(acc)) navigate("/");
        }
      } else {
        setLoginError(res?.msg || "Login failed after MFA setup");
        setMfaState(null);
        navigate("/login");
      }
    } catch {
      setMfaState(null);
      navigate("/login");
    }
  };

  const handleMfaVerified = async () => {
    setMfaState(null);
    try {
      const acc: any = await getAccount();
      if (applyAccountData(acc)) {
        navigate("/");
      } else {
        // getAccount might fail if session isn't fully established yet, retry once
        await new Promise(r => setTimeout(r, 500));
        const retry: any = await getAccount();
        if (applyAccountData(retry)) {
          navigate("/");
        } else {
          setLoginError("Login failed after MFA verification");
          navigate("/login");
        }
      }
    } catch {
      setLoginError("Login failed after MFA verification");
      navigate("/login");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <span className="text-[13px] text-text-muted font-mono">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/callback" element={<AuthCallback />} />
        <Route path="/auth/wallet/:type" element={<WalletLoginPage />} />
        <Route path="/auth/telegram-login" element={<TelegramLoginPage />} />
        <Route path="/login/:organizationName/:applicationName" element={<AuthShell mode="signin" />} />
        <Route path="/login/:organizationName" element={<AuthShell mode="signin" />} />
        <Route path="/login" element={<AuthShell mode="signin" />} />
        <Route path="/signup/:applicationName" element={<AuthShell mode="signup" />} />
        <Route path="/signup" element={<AuthShell mode="signup" />} />
        <Route path="/forget/:applicationName" element={<AuthShell mode="forget" />} />
        <Route path="/forget" element={<AuthShell mode="forget" />} />
        <Route path="/mfa/setup" element={
          mfaState?.type === "setup" ? (
            <MfaSetup
              mfaType={mfaState.mfaType || "app"}
              owner={mfaState.loginForm.organization}
              name={mfaState.loginForm.username}
              organization={mfaState.loginForm.organization}
              application={mfaState.loginForm.application}
              encryptedPassword={mfaState.loginForm.encryptedPassword}
              themeData={loginThemeData}
              orgBranding={loginOrgBranding}
              onComplete={handleMfaSetupComplete}
            />
          ) : <Navigate to="/login" replace />
        } />
        <Route path="/mfa/verify" element={
          mfaState?.type === "verify" ? (
            <MfaVerify
              mfaProps={mfaState.mfaProps || []}
              loginForm={{ application: mfaState.loginForm.application, organization: mfaState.loginForm.organization }}
              themeData={loginThemeData}
              orgBranding={loginOrgBranding}
              onVerified={handleMfaVerified}
              onError={(msg) => setLoginError(msg)}
            />
          ) : <Navigate to="/login" replace />
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Custom list page overrides
  const customListPages: Record<string, React.ReactNode> = {
    // Identity
    organizations: <OrganizationListPage />,
    groups: <GroupListPage />,
    users: <UserListPage />,
    invitations: <InvitationListPage />,
    // Authentication
    applications: <ApplicationListPage />,
    providers: <ProviderListPage />,
    resources: <ResourceListPage />,
    certs: <CertListPage />,
    keys: <KeyListPage />,
    // Authorization
    roles: <RoleListPage />,
    permissions: <PermissionListPage />,
    models: <ModelListPage />,
    adapters: <AdapterListPage />,
    enforcers: <EnforcerListPage />,
    // LLM AI
    agents: <AgentListPage />,
    servers: <ServerListPage />,
    entries: <EntryListPage />,
    sites: <SiteListPage />,
    rules: <RuleListPage />,
    // Audit
    tokens: <TokenListPage />,
    sessions: <SessionListPage />,
    records: <RecordListPage />,
    verifications: <VerificationListPage />,
    // Business
    products: <ProductListPage />,
    plans: <PlanListPage />,
    pricings: <PricingListPage />,
    subscriptions: <SubscriptionListPage />,
    payments: <PaymentListPage />,
    transactions: <TransactionListPage />,
    orders: <OrderListPage />,
    // Admin
    syncers: <SyncerListPage />,
    webhooks: <WebhookListPage />,
    "webhook-events": <WebhookEventListPage />,
    forms: <FormListPage />,
    tickets: <TicketListPage />,
  };

  // Generate routes from entity configs
  const entityRoutes = Object.entries(entityConfigs).flatMap(([key, cfg]) => {
    const routes = [
      <Route
        key={`${key}-list`}
        path={`/${cfg.entityTypePlural}`}
        element={
          customListPages[key] ?? (
            <GenericListPage
              entityType={cfg.entityTypePlural}
              titleKey={cfg.titleKey}
              subtitleKey={cfg.subtitleKey}
              addButtonKey={cfg.addButtonKey}
              columns={cfg.listColumns}
              canAdd={cfg.canAdd}
              canDelete={cfg.canDelete}
            />
          )
        }
      />,
    ];

    if (!cfg.listOnly) {
      // Use custom pages for complex entities
      const customEditPages: Record<string, React.ReactNode> = {
        // Identity
        organizations: <OrganizationEditPage />,
        groups: <GroupEditPage />,
        users: <UserEditPage />,
        invitations: <InvitationEditPage />,
        // Authentication
        applications: <ApplicationEditPage />,
        providers: <ProviderEditPage />,
        certs: <CertEditPage />,
        keys: <KeyEditPage />,
        // Authorization
        roles: <RoleEditPage />,
        permissions: <PermissionEditPage />,
        models: <ModelEditPage />,
        adapters: <AdapterEditPage />,
        enforcers: <EnforcerEditPage />,
        // LLM AI
        agents: <AgentEditPage />,
        servers: <ServerEditPage />,
        entries: <EntryEditPage />,
        sites: <SiteEditPage />,
        rules: <RuleEditPage />,
        // Audit
        tokens: <TokenEditPage />,
        // Business
        products: <ProductEditPage />,
        plans: <PlanEditPage />,
        pricings: <PricingEditPage />,
        subscriptions: <SubscriptionEditPage />,
        payments: <PaymentEditPage />,
        transactions: <TransactionEditPage />,
        orders: <OrderEditPage />,
        // Admin
        syncers: <SyncerEditPage />,
        webhooks: <WebhookEditPage />,
        forms: <FormEditPage />,
        tickets: <TicketEditPage />,
      };

      const editElement = customEditPages[key] ?? (
        <GenericEditPage
          entityType={cfg.entityType}
          entityTypePlural={cfg.entityTypePlural}
          titleKey={cfg.titleKey}
          fields={cfg.editFields}
        />
      );

      routes.push(
        <Route
          key={`${key}-edit`}
          path={`/${cfg.entityTypePlural}/:owner/:name`}
          element={editElement}
        />
      );
    }

    return routes;
  });

  const isAdmin = isLocalAdmin(user);

  const mfaAccount = user ? {
    ...user,
    organization: JSON.parse(localStorage.getItem("organizationData") ?? "null") ?? undefined,
  } : null;

  // Non-admin users: app list home + own profile
  if (!isAdmin) {
    return (
      <Layout user={user} onLogout={handleLogout}>
        <EnableMfaNotification account={mfaAccount as any} justLoggedIn={justLoggedIn} onDismiss={() => setJustLoggedIn(false)} />
        <Routes>
          <Route path="/" element={<UserHomePage userOrg={user.owner} />} />
          <Route path="/users/:owner/:name" element={<UserEditPage />} />
          <Route path="/mfa/setup" element={(() => {
            const orgData = JSON.parse(localStorage.getItem("organizationData") ?? "null");
            return (
              <MfaSetup
                mfaType={new URLSearchParams(window.location.search).get("mfaType") || "app"}
                owner={user.owner}
                name={user.name}
                organization={user.owner}
                application=""
                encryptedPassword=""
                themeData={orgData?.themeData}
                orgBranding={orgData ? { logo: orgData.logo, logoDark: orgData.logoDark, displayName: orgData.displayName } : null}
                onComplete={async () => {
                  const acc: any = await getAccount();
                  applyAccountData(acc);
                  navigate("/");
                }}
              />
            );
          })()} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout}>
      <EnableMfaNotification account={mfaAccount as any} justLoggedIn={justLoggedIn} onDismiss={() => setJustLoggedIn(false)} />
      <Routes>
        <Route path="/" element={
          isGlobalAdmin(user)
            ? <Dashboard />
            : <Navigate to={`/users?owner=${encodeURIComponent(user.owner)}`} replace />
        } />
        <Route path="/authorization" element={<AuthorizationPage />} />
        <Route path="/authorization/:owner/:appName" element={<AppAuthorizationPage />} />
        <Route path="/authorization/:owner/:appName/roles/new" element={<BizRoleEditPage />} />
        <Route path="/authorization/:owner/:appName/roles/:name" element={<BizRoleEditPage />} />
        <Route path="/authorization/:owner/:appName/permissions/new" element={<BizPermissionEditPage />} />
        <Route path="/authorization/:owner/:appName/permissions/:name" element={<BizPermissionEditPage />} />
        {entityRoutes}
        <Route path="/server-store" element={<ServerStorePage />} />
        <Route path="/product-store" element={<ProductStorePage />} />
        <Route path="/products/:owner/:name/buy" element={<ProductBuyPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/orders/:owner/:name/pay" element={<OrderPayPage />} />
        <Route path="/payments/:owner/:name/result" element={<PaymentResultPage />} />
        <Route path="/trees/:organizationName/:groupName" element={<GroupTreePage />} />
        <Route path="/trees/:organizationName" element={<GroupTreePage />} />
        <Route path="/ldap/sync/:owner/:id" element={<LdapSyncPage />} />
        <Route path="/ldap/:owner/:id" element={<LdapEditPage />} />
        <Route path="/sysinfo" element={isGlobalAdmin(user) ? <SystemInfoPage /> : <Navigate to="/" replace />} />
        <Route path="/swagger" element={isGlobalAdmin(user) ? <SwaggerPage /> : <Navigate to="/" replace />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
