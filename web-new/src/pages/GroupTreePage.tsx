import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Users, ChevronRight, ChevronDown, Grip, Eye, ArrowLeft } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import DataTable, { type Column } from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import * as GroupBackend from "../backend/GroupBackend";
import * as UserBackend from "../backend/UserBackend";
import type { Group } from "../backend/GroupBackend";
import type { User } from "../backend/UserBackend";

export default function GroupTreePage() {
  const { organizationName, groupName: urlGroupName } = useParams<{ organizationName: string; groupName?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();

  const [treeData, setTreeData] = useState<Group[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [selectedGroup, setSelectedGroup] = useState<string>(urlGroupName ?? "");

  // User list state
  const [users, setUsers] = useState<User[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userLoading, setUserLoading] = useState(false);
  const pageSize = 10;

  // Fetch tree data
  const fetchTree = useCallback(async () => {
    if (!organizationName) return;
    try {
      const res = await GroupBackend.getGroups({ owner: organizationName, withTree: true });
      if (res.status === "ok" && res.data) {
        setTreeData(res.data);
        // Expand all by default
        const allKeys = new Set<string>();
        const collectKeys = (nodes: Group[]) => {
          nodes.forEach((n) => {
            allKeys.add(n.key || n.name);
            if (n.children?.length) collectKeys(n.children);
          });
        };
        collectKeys(res.data);
        setExpandedKeys(allKeys);
      }
    } catch (e) {
      console.error(e);
    }
  }, [organizationName]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!organizationName) return;
    setUserLoading(true);
    try {
      const res = await UserBackend.getUsers({
        owner: organizationName,
        groupName: selectedGroup || "",
        p: userPage,
        pageSize,
      });
      if (res.status === "ok") {
        setUsers(res.data ?? []);
        setUserTotal(res.data2 as number ?? 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUserLoading(false);
    }
  }, [organizationName, selectedGroup, userPage]);

  useEffect(() => { fetchTree(); }, [fetchTree]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);


  const handleSelectGroup = (groupKey: string) => {
    if (groupKey === selectedGroup) {
      setSelectedGroup("");
      setUserPage(1);
      window.history.replaceState(null, "", `/trees/${organizationName}`);
    } else {
      setSelectedGroup(groupKey);
      setUserPage(1);
      window.history.replaceState(null, "", `/trees/${organizationName}/${groupKey}`);
    }
  };

  const handleShowAll = () => {
    setSelectedGroup("");
    setUserPage(1);
    window.history.replaceState(null, "", `/trees/${organizationName}`);
  };

  const handleAddGroup = async (parentId?: string) => {
    const newGroup = GroupBackend.newGroup(organizationName!);
    newGroup.parentId = parentId || organizationName!;
    const res = await GroupBackend.addGroup(newGroup);
    if (res.status === "ok") {
      navigate(`/groups/${organizationName}/${newGroup.name}`, { state: { mode: "add" } });
    } else {
      modal.toast(res.msg || t("common.addFailed" as any), "error");
    }
  };

  const handleDeleteGroup = (group: Group) => {
    if (group.children?.length > 0) {
      modal.toast(t("groupTree.cannotDeleteWithChildren" as any), "error");
      return;
    }
    modal.showConfirm(`${t("common.confirmDelete")} [${group.title || group.displayName || group.name}]`, async () => {
      const res = await GroupBackend.deleteGroup({ owner: group.owner || organizationName!, name: group.key || group.name } as Group);
      if (res.status === "ok") {
        modal.toast(t("common.deleteSuccess" as any));
        if (selectedGroup === (group.key || group.name)) {
          navigate(`/trees/${organizationName}`);
        }
        fetchTree();
      } else {
        const msg = res.msg || "";
        if (msg.toLowerCase().includes("has users")) {
          modal.toast(t("groupTree.groupHasUsers" as any), "error");
        } else {
          modal.toast(msg || t("common.deleteFailed" as any), "error");
        }
      }
    });
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // User table columns
  const userColumns: Column<User>[] = [
    {
      key: "name",
      title: t("col.name" as any),
      width: "120px",
      render: (_, r) => (
        <Link to={`/users/${r.owner}/${r.name}`} className="font-mono font-medium text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.name}
        </Link>
      ),
    },
    { key: "displayName", title: t("col.displayName" as any) },
    { key: "email", title: t("col.email" as any), render: (_, r) => <span className="text-[12px] text-text-secondary">{r.email || "—"}</span> },
    { key: "phone", title: t("col.phone" as any), render: (_, r) => <span className="text-[12px] text-text-secondary">{r.phone || "—"}</span> },
    {
      key: "isAdmin",
      title: t("col.isAdmin" as any),
      width: "80px",
      render: (_, r) => <StatusBadge status={r.isAdmin ? "active" : "inactive"} label={r.isAdmin ? "ON" : "OFF"} />,
    },
    {
      key: "isForbidden",
      title: t("col.isForbidden" as any),
      width: "80px",
      render: (_, r) => <StatusBadge status={r.isForbidden ? "error" : "inactive"} label={r.isForbidden ? "ON" : "OFF"} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/organizations")} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-2 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t("groupTree.title" as any)}</h1>
            <p className="text-[13px] text-text-muted mt-0.5">{organizationName}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-4" style={{ minHeight: "500px" }}>
        {/* Left: Tree */}
        <div className="w-[280px] shrink-0 rounded-xl border border-border bg-surface-1 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border-subtle bg-surface-2/30 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-text-primary">{t("groupTree.groups" as any)}</span>
            <div className="flex items-center gap-1">
              <button onClick={handleShowAll} className="rounded p-1 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title={t("groupTree.showAll" as any)}>
                <Eye size={14} />
              </button>
              <button onClick={() => handleAddGroup()} className="rounded p-1 text-text-muted hover:text-accent hover:bg-accent/10 transition-colors" title={t("common.add")}>
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {treeData.length === 0 ? (
              <div className="py-8 text-center text-[12px] text-text-muted">{t("common.noData")}</div>
            ) : (
              treeData.map((node) => (
                <TreeNode
                  key={node.key || node.name}
                  node={node}
                  depth={0}
                  selectedKey={selectedGroup}
                  expandedKeys={expandedKeys}
                  onSelect={handleSelectGroup}
                  onToggle={toggleExpand}
                  onAdd={handleAddGroup}
                  onEdit={(g) => navigate(`/groups/${organizationName}/${g.key || g.name}`)}
                  onDelete={handleDeleteGroup}
                  t={t}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Users */}
        <div className="flex-1 min-w-0">
          <DataTable
            columns={userColumns}
            data={users}
            rowKey="name"
            loading={userLoading}
            page={userPage}
            pageSize={pageSize}
            total={userTotal}
            onPageChange={setUserPage}
            emptyText={t("common.noData")}
          />
        </div>
      </div>
    </div>
  );
}

// ── Tree Node Component ──

function TreeNode({
  node,
  depth,
  selectedKey,
  expandedKeys,
  onSelect,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  t,
}: {
  node: Group;
  depth: number;
  selectedKey: string;
  expandedKeys: Set<string>;
  onSelect: (key: string) => void;
  onToggle: (key: string) => void;
  onAdd: (parentId: string) => void;
  onEdit: (group: Group) => void;
  onDelete: (group: Group) => void;
  t: (key: string) => string;
}) {
  const key = node.key || node.name;
  const hasChildren = node.children?.length > 0;
  const isExpanded = expandedKeys.has(key);
  const isSelected = selectedKey === key;
  const isPhysical = node.type === "Physical";

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
          isSelected ? "bg-accent/10 text-accent" : "text-text-primary hover:bg-surface-2"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(key)}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(key); }}
          className={`rounded p-0.5 transition-colors ${hasChildren ? "text-text-muted hover:text-text-primary" : "text-transparent"}`}
        >
          {hasChildren ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
        </button>

        {/* Icon */}
        {isPhysical ? <Users size={13} className="shrink-0 text-text-muted" /> : <Grip size={13} className="shrink-0 text-text-muted" />}

        {/* Label */}
        <span className="flex-1 text-[12px] font-medium truncate">{node.title || node.displayName || node.name}</span>

        {/* Actions (visible on hover or selected) */}
        {isSelected && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onAdd(key); }} className="rounded p-0.5 text-text-muted hover:text-accent transition-colors" title={t("common.add")}>
              <Plus size={12} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onEdit(node); }} className="rounded p-0.5 text-text-muted hover:text-warning transition-colors" title={t("common.edit")}>
              <Pencil size={12} />
            </button>
            {!hasChildren && (
              <button onClick={(e) => { e.stopPropagation(); onDelete(node); }} className="rounded p-0.5 text-text-muted hover:text-danger transition-colors" title={t("common.delete")}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.key || child.name}
              node={child}
              depth={depth + 1}
              selectedKey={selectedKey}
              expandedKeys={expandedKeys}
              onSelect={onSelect}
              onToggle={onToggle}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
