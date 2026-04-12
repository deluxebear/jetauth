import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import { useSidebar } from "./SidebarContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
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
import ProductListPage from "./pages/ProductListPage";
import ProductEditPage from "./pages/ProductEditPage";
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
  const [loginError, setLoginError] = useState("");
  const [loginOrgs, setLoginOrgs] = useState<{ name: string; displayName: string }[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getAccount()
      .then((res: any) => {
        if (res?.status === "ok" && res.data) {
          setUser(res.data);
          localStorage.setItem("account", JSON.stringify(res.data));
          if (res.data2) {
            localStorage.setItem("organizationData", JSON.stringify(res.data2));
            // Dynamic favicon from organization settings
            if (res.data2.favicon) {
              const link = document.querySelector("link[rel='icon']") as HTMLLinkElement
                || document.createElement("link");
              link.rel = "icon";
              link.href = res.data2.favicon;
              document.head.appendChild(link);
            }
            // Dynamic page title from organization displayName
            if (res.data2.displayName) {
              document.title = res.data2.displayName;
            }
          }
          window.dispatchEvent(new Event("accountChanged"));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch organizations for login page org selector (may fail if not authenticated — that's ok)
    import("./backend/OrganizationBackend").then((OrgBackend) => {
      OrgBackend.getOrganizationNames("admin").then((res: any) => {
        if (res.status === "ok" && Array.isArray(res.data)) {
          setLoginOrgs(res.data);
        }
      }).catch(() => { /* Not authenticated yet, will show default built-in org */ });
    });
  }, []);

  const handleLogin = async (username: string, password: string, organization = "built-in") => {
    setLoginError("");
    try {
      let application = "app-built-in";
      let obfuscatorType = "";
      let obfuscatorKey = "";

      // Fetch default application to get app name + org obfuscator config
      try {
        const res = await fetch(`/api/get-default-application?id=admin/${organization}`, { credentials: "include" }).then(r => r.json());
        if (res.status === "ok" && res.data) {
          if (res.data.name) application = res.data.name;
          if (res.data.organizationObj) {
            obfuscatorType = res.data.organizationObj.passwordObfuscatorType || "";
            obfuscatorKey = res.data.organizationObj.passwordObfuscatorKey || "";
          }
        }
      } catch { /* fallback to plain */ }

      // Encrypt password if org uses AES/DES obfuscation
      const { encryptPassword } = await import("./utils/obfuscator");
      const encryptedPassword = encryptPassword(obfuscatorType, obfuscatorKey, password);

      const res: any = await apiLogin({
        application,
        organization,
        username,
        password: encryptedPassword,
        signinMethod: "Password",
        type: "login",
      });
      if (res?.status === "ok") {
        const acc: any = await getAccount();
        if (acc?.status === "ok" && acc.data) {
          setUser(acc.data);
          localStorage.setItem("account", JSON.stringify(acc.data));
          window.dispatchEvent(new Event("accountChanged"));
          navigate("/");
        }
      } else {
        setLoginError(res?.msg || "Login failed");
      }
    } catch (e: any) {
      setLoginError(e.message || "Network error");
    }
  };

  const handleLogout = async () => {
    try {
      await apiLogout();
    } catch {}
    setUser(null);
    localStorage.removeItem("account");
    window.dispatchEvent(new Event("accountChanged"));
    navigate("/login");
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
        <Route path="/login" element={<Login onLogin={handleLogin} error={loginError} organizations={loginOrgs} />} />
        <Route path="/signup/:applicationName" element={<Signup />} />
        <Route path="/signup" element={<Signup />} />
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

  // Non-admin users: app list home + own profile
  if (!isAdmin) {
    return (
      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<UserHomePage userOrg={user.owner} />} />
          <Route path="/users/:owner/:name" element={<UserEditPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {entityRoutes}
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
