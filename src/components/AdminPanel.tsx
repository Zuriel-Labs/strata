import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { AdminDirectoryResponse, AdminUserRecord } from '../types';
import { useAuth } from '../lib/auth-context';
import { createManagedUser, deleteManagedUser as deleteManagedUserRequest, fetchAdminDirectory, generateRecoveryKeyForUser, updateManagedUser, type ManagedUserInput } from '../services/admin';

const workspaceRoleOptions = ['', 'workspace_admin', 'member'] as const;
const boardRoleOptions = ['', 'board_admin', 'member', 'observer'] as const;

type AdminTab = 'edit-users' | 'create-user' | 'audit';
type DeleteFlowStep = 'warning' | 'confirm';

function deriveForm(user?: AdminUserRecord | null): ManagedUserInput {
  return {
    name: user?.name ?? '',
    initials: user?.initials ?? '',
    color: user?.color ?? '#6366f1',
    username: user?.username ?? '',
    platformRole: user?.platformRole ?? 'user',
    active: user?.active ?? true,
    workspaceMemberships: user?.workspaceMemberships.map(membership => ({ workspaceId: membership.workspaceId, role: membership.role })) ?? [],
    boardMemberships: user?.boardMemberships.map(membership => ({ boardId: membership.boardId, role: membership.role })) ?? [],
  };
}

function emptyForm(): ManagedUserInput {
  return {
    name: '',
    initials: '',
    color: '#6366f1',
    username: '',
    platformRole: 'user',
    active: true,
    workspaceMemberships: [],
    boardMemberships: [],
  };
}

export function AdminPanel() {
  const { adminOpen, setAdminOpen, refresh, setAccessDenied, session } = useAuth();
  const [directory, setDirectory] = useState<AdminDirectoryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('edit-users');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminOpen) return;
    void fetchAdminDirectory()
      .then(result => {
        setDirectory(result);
        setError(null);
      })
      .catch(requestError => {
        const nextMessage = requestError instanceof Error ? requestError.message : 'Unable to load admin data.';
        setError(nextMessage);
        setAccessDenied(nextMessage);
      });
  }, [adminOpen, setAccessDenied]);

  if (!adminOpen || !session?.permissions.isSystemAdmin) return null;

  async function reloadDirectory() {
    const result = await fetchAdminDirectory();
    setDirectory(result);
    await refresh();
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'edit-users', label: 'Edit Users' },
    { key: 'create-user', label: 'Create User' },
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(6, 9, 14, 0.55)' }} onClick={e => { if (e.target === e.currentTarget) setAdminOpen(false); }}>
      <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl border flex flex-col" style={{ background: '#11161d', borderColor: '#26313c' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#26313c' }}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em]" style={{ color: '#8ca1af' }}>Admin</p>
            <h2 className="text-lg font-bold" style={{ color: '#edf2f7' }}>User Management</h2>
          </div>
          <button className="text-sm underline" style={{ color: '#e2a56a' }} onClick={() => setAdminOpen(false)}>Close</button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b px-4" style={{ borderColor: '#26313c' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              className="px-4 py-3 text-sm font-semibold border-b-2 transition-colors"
              style={{
                borderColor: activeTab === tab.key ? '#e2a56a' : 'transparent',
                color: activeTab === tab.key ? '#edf2f7' : '#8ca1af',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6" style={{ color: '#edf2f7' }}>
          {error && <p className="mb-4 text-sm" style={{ color: '#ffb4b4' }}>{error}</p>}

          {activeTab === 'edit-users' && (
            <EditUsersTab directory={directory} reloadDirectory={reloadDirectory} />
          )}

          {activeTab === 'create-user' && (
            <CreateUserTab directory={directory} reloadDirectory={reloadDirectory} onCreated={() => setActiveTab('edit-users')} />
          )}

          {activeTab === 'audit' && (
            <AuditTab directory={directory} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Edit Users Tab ── */

function EditUsersTab({ directory, reloadDirectory }: { directory: AdminDirectoryResponse | null; reloadDirectory: () => Promise<void> }) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(directory?.users[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteFlowStep, setDeleteFlowStep] = useState<DeleteFlowStep | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletePending, setDeletePending] = useState(false);

  const selectedUser = useMemo(() => directory?.users.find(user => user.id === selectedUserId) ?? null, [directory, selectedUserId]);
  const [form, setForm] = useState<ManagedUserInput>(deriveForm(selectedUser));

  function resetDeleteFlow() {
    setDeleteFlowStep(null);
    setDeleteConfirmation('');
    setDeletePending(false);
  }

  useEffect(() => {
    setForm(deriveForm(selectedUser));
  }, [selectedUser]);

  useEffect(() => {
    if (!directory?.users.length) {
      if (selectedUserId) setSelectedUserId(null);
      return;
    }
    if (!selectedUserId || !directory.users.some(user => user.id === selectedUserId)) {
      setSelectedUserId(directory.users[0]?.id ?? null);
    }
  }, [directory, selectedUserId]);

  useEffect(() => {
    setActionError(null);
    resetDeleteFlow();
  }, [selectedUserId]);

  function updateWorkspaceMembership(workspaceId: string, role: string) {
    setForm(current => ({
      ...current,
      workspaceMemberships: role
        ? [...current.workspaceMemberships.filter(item => item.workspaceId !== workspaceId), { workspaceId, role }]
        : current.workspaceMemberships.filter(item => item.workspaceId !== workspaceId),
    }));
  }

  function updateBoardMembership(boardId: string, role: string) {
    setForm(current => ({
      ...current,
      boardMemberships: role
        ? [...current.boardMemberships.filter(item => item.boardId !== boardId), { boardId, role }]
        : current.boardMemberships.filter(item => item.boardId !== boardId),
    }));
  }

  async function handleSave() {
    if (!selectedUser) return;
    await updateManagedUser(selectedUser.id, form);
    setActionError(null);
    setMessage('User updated.');
    await reloadDirectory();
  }

  async function handleGenerateRecoveryKey() {
    if (!selectedUser) return;
    const result = await generateRecoveryKeyForUser(selectedUser.id);
    setRecoveryKey(result.recoveryKey);
    setCopied(false);
  }

  function closeRecoveryKeyOverlay() {
    setRecoveryKey(null);
    setCopied(false);
  }

  async function handleDeleteUser() {
    if (!selectedUser || deleteConfirmation !== 'DELETE' || deletePending) return;

    setDeletePending(true);

    try {
      const result = await deleteManagedUserRequest(selectedUser.id);
      resetDeleteFlow();
      setActionError(null);
      setMessage(`Deleted ${result.username}.`);
      closeRecoveryKeyOverlay();
      setSelectedUserId(null);
      await reloadDirectory();
    } catch (error) {
      resetDeleteFlow();
      setMessage(null);
      setActionError(error instanceof Error ? error.message : 'Unable to delete user.');
    }
  }

  return (
    <div>
      <div className="rounded-2xl border p-4" style={{ borderColor: '#26313c', background: '#16202a' }}>
        {directory?.users.length ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-bold whitespace-nowrap">Editing:</span>
              <select
                aria-label="Select user to edit"
                value={selectedUserId ?? ''}
                onChange={e => setSelectedUserId(e.target.value)}
                className="text-sm font-bold rounded-lg px-2 py-1.5 outline-none cursor-pointer flex-1 min-w-0"
                style={{ background: '#1a2732', color: '#edf2f7', border: '1px solid #26313c' }}
              >
                {directory.users.map(user => (
                  <option key={user.id} value={user.id}>{user.name} ({user.username})</option>
                ))}
              </select>
            </div>

            {selectedUser && (
              <>
                <UserForm form={form} setForm={setForm} directory={directory} updateWorkspaceMembership={updateWorkspaceMembership} updateBoardMembership={updateBoardMembership} />
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <div className="flex flex-wrap gap-3">
                    <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#5aa7ff', color: '#0b1822' }} onClick={() => void handleSave()}>
                      Save changes
                    </button>
                    <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#f59e0b', color: '#0b1822' }} onClick={() => void handleGenerateRecoveryKey()}>
                      Generate recovery key
                    </button>
                  </div>
                  <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#dc2626', color: '#fff5f5' }} onClick={() => { setActionError(null); setMessage(null); setDeleteFlowStep('warning'); }}>
                    Delete User
                  </button>
                </div>
                {message && <p className="mt-4 text-sm" style={{ color: '#d9f99d' }}>{message}</p>}
                {actionError && <p className="mt-4 text-sm" style={{ color: '#ffb4b4' }}>{actionError}</p>}
              </>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: '#9bb1c0' }}>No users found.</p>
        )}
      </div>

      {/* Recovery Key Overlay */}
      {recoveryKey && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(6, 9, 14, 0.7)' }} onClick={e => { if (e.target === e.currentTarget) closeRecoveryKeyOverlay(); }}>
          <div className="w-full max-w-md rounded-2xl border p-6" style={{ borderColor: '#26313c', background: '#16202a' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: '#edf2f7' }}>Recovery Key for {selectedUser.name}</h3>
              <button className="text-sm underline" style={{ color: '#e2a56a' }} onClick={closeRecoveryKeyOverlay}>Close</button>
            </div>
            <p className="text-xs mb-3" style={{ color: '#9bb1c0' }}>
              Give this key to the user so they can reset their password via &quot;Forgot password?&quot; on the login screen. This key can only be used once.
            </p>
            <div className="rounded-xl p-3 mb-4" style={{ background: '#11161d' }}>
              <code className="block break-all select-all text-xs" style={{ color: '#edf2f7' }}>{recoveryKey}</code>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ background: copied ? '#22c55e' : '#5aa7ff', color: '#0b1822' }}
                onClick={() => { void navigator.clipboard.writeText(recoveryKey); setCopied(true); }}
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
              <button className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: '#26313c', color: '#edf2f7' }} onClick={closeRecoveryKeyOverlay}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteFlowStep && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(6, 9, 14, 0.7)' }} onClick={event => { if (event.target === event.currentTarget) resetDeleteFlow(); }}>
          <div className="w-full max-w-md rounded-2xl border p-6" style={{ borderColor: '#26313c', background: '#16202a' }}>
            {deleteFlowStep === 'warning' ? (
              <>
                <h3 className="text-base font-bold" style={{ color: '#edf2f7' }}>Delete User</h3>
                <p className="mt-3 text-sm leading-6" style={{ color: '#cbd5e1' }}>
                  User {selectedUser.username} will be removed from Strata. This cannot be undone. Are you sure?
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#5aa7ff', color: '#0b1822' }} onClick={resetDeleteFlow}>
                    Nevermind
                  </button>
                  <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#dc2626', color: '#fff5f5' }} onClick={() => setDeleteFlowStep('confirm')}>
                    YES
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold" style={{ color: '#edf2f7' }}>Final confirmation</h3>
                <p className="mt-3 text-sm leading-6" style={{ color: '#cbd5e1' }}>
                  Type <strong>DELETE</strong> to confirm permanent removal of {selectedUser.username}.
                </p>
                <input
                  value={deleteConfirmation}
                  onChange={event => setDeleteConfirmation(event.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="mt-4 w-full rounded-xl px-3 py-2"
                  style={{ background: '#11161d', color: '#edf2f7' }}
                />
                <div className="mt-6 flex justify-end gap-3">
                  <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#5aa7ff', color: '#0b1822' }} onClick={resetDeleteFlow}>
                    CANCEL
                  </button>
                  <button
                    className="rounded-xl px-4 py-2 font-semibold disabled:cursor-not-allowed"
                    style={{ background: deleteConfirmation === 'DELETE' ? '#dc2626' : '#7f1d1d', color: '#fff5f5', opacity: deletePending ? 0.75 : 1 }}
                    onClick={() => void handleDeleteUser()}
                    disabled={deleteConfirmation !== 'DELETE' || deletePending}
                  >
                    {deletePending ? 'BOOM...' : 'BOOM'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Create User Tab ── */

function CreateUserTab({ directory, reloadDirectory, onCreated }: { directory: AdminDirectoryResponse | null; reloadDirectory: () => Promise<void>; onCreated: () => void }) {
  const [form, setForm] = useState<ManagedUserInput>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function updateWorkspaceMembership(workspaceId: string, role: string) {
    setForm(current => ({
      ...current,
      workspaceMemberships: role
        ? [...current.workspaceMemberships.filter(item => item.workspaceId !== workspaceId), { workspaceId, role }]
        : current.workspaceMemberships.filter(item => item.workspaceId !== workspaceId),
    }));
  }

  function updateBoardMembership(boardId: string, role: string) {
    setForm(current => ({
      ...current,
      boardMemberships: role
        ? [...current.boardMemberships.filter(item => item.boardId !== boardId), { boardId, role }]
        : current.boardMemberships.filter(item => item.boardId !== boardId),
    }));
  }

  async function handleCreate() {
    setError(null);
    try {
      const result = await createManagedUser(form);
      const link = `${window.location.origin}/invite/${encodeURIComponent(result.user.username)}/${result.inviteToken}`;
      setInviteLink(link);
      setCreatedUsername(result.user.username);
      setCopied(false);
      setForm(emptyForm());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user.');
    }
  }

  async function closeInviteOverlay() {
    setInviteLink(null);
    setCreatedUsername(null);
    setCopied(false);
    await reloadDirectory();
    onCreated();
  }

  return (
    <div className="max-w-xl">
      <div className="rounded-2xl border p-4" style={{ borderColor: '#26313c', background: '#16202a' }}>
        <h3 className="text-sm font-bold mb-4">New user</h3>
        <UserForm form={form} setForm={setForm} directory={directory} updateWorkspaceMembership={updateWorkspaceMembership} updateBoardMembership={updateBoardMembership} />
        <div className="mt-4 flex gap-3">
          <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#e2a56a', color: '#132530' }} onClick={() => void handleCreate()}>
            Create user
          </button>
        </div>
        {error && <p className="mt-4 text-sm" style={{ color: '#ffb4b4' }}>{error}</p>}
      </div>

      {/* Invite Link Overlay */}
      {inviteLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(6, 9, 14, 0.7)' }} onClick={e => { if (e.target === e.currentTarget) closeInviteOverlay(); }}>
          <div className="w-full max-w-lg rounded-2xl border p-6" style={{ borderColor: '#26313c', background: '#16202a' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: '#edf2f7' }}>Invite Link for {createdUsername}</h3>
              <button className="text-sm underline" style={{ color: '#e2a56a' }} onClick={closeInviteOverlay}>Close</button>
            </div>
            <p className="text-xs mb-3" style={{ color: '#9bb1c0' }}>
              Send this invite link to the new user. When they open it, they will set their password and receive a recovery key to keep safe.
            </p>
            <div className="rounded-xl p-3 mb-4" style={{ background: '#11161d' }}>
              <code className="block break-all select-all text-xs" style={{ color: '#edf2f7' }}>{inviteLink}</code>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ background: copied ? '#22c55e' : '#5aa7ff', color: '#0b1822' }}
                onClick={() => { void navigator.clipboard.writeText(inviteLink); setCopied(true); }}
              >
                {copied ? 'Copied!' : 'Copy to clipboard'}
              </button>
              <button className="rounded-xl px-4 py-2 text-xs font-semibold" style={{ background: '#26313c', color: '#edf2f7' }} onClick={closeInviteOverlay}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Audit Tab ── */

function AuditTab({ directory }: { directory: AdminDirectoryResponse | null }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: '#26313c', background: '#16202a' }}>
      <h3 className="text-sm font-bold mb-4">Recent audit events</h3>
      <div className="space-y-2 max-h-[70vh] overflow-y-auto">
        {directory?.auditEvents.length === 0 && (
          <p className="text-sm" style={{ color: '#9bb1c0' }}>No audit events recorded yet.</p>
        )}
        {directory?.auditEvents.map(event => (
          <div key={event.id} className="rounded-xl px-3 py-2" style={{ background: '#11161d' }}>
            <p className="text-sm font-medium">{event.action}</p>
            <p className="text-xs" style={{ color: '#9bb1c0' }}>{event.outcome} · {new Date(event.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shared User Form ── */

function UserForm({
  form,
  setForm,
  directory,
  updateWorkspaceMembership,
  updateBoardMembership,
}: {
  form: ManagedUserInput;
  setForm: Dispatch<SetStateAction<ManagedUserInput>>;
  directory: AdminDirectoryResponse | null;
  updateWorkspaceMembership: (workspaceId: string, role: string) => void;
  updateBoardMembership: (boardId: string, role: string) => void;
}) {
  return (
    <div className="space-y-3">
      <input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Name" className="w-full rounded-xl px-3 py-2" style={{ background: '#11161d' }} />
      <div className="grid gap-3 grid-cols-2">
        <input value={form.initials} onChange={event => setForm(current => ({ ...current, initials: event.target.value }))} placeholder="Initials" className="rounded-xl px-3 py-2" style={{ background: '#11161d' }} />
        <input value={form.color} onChange={event => setForm(current => ({ ...current, color: event.target.value }))} placeholder="#6366f1" className="rounded-xl px-3 py-2" style={{ background: '#11161d' }} />
      </div>
      <input value={form.username} onChange={event => setForm(current => ({ ...current, username: event.target.value }))} placeholder="Username" className="w-full rounded-xl px-3 py-2" style={{ background: '#11161d' }} />
      <div className="grid gap-3 grid-cols-2">
        <select value={form.platformRole} onChange={event => setForm(current => ({ ...current, platformRole: event.target.value as ManagedUserInput['platformRole'] }))} className="rounded-xl px-3 py-2" style={{ background: '#11161d' }}>
          <option value="user">user</option>
          <option value="system_admin">system_admin</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={event => setForm(current => ({ ...current, active: event.target.checked }))} /> Active
        </label>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: '#9bb1c0' }}>Workspace membership</p>
        <div className="space-y-2">
          {directory?.workspaces.map(workspace => (
            <div key={workspace.id} className="grid grid-cols-[1fr_180px] gap-3 items-center">
              <span className="text-sm">{workspace.name}</span>
              <select className="rounded-xl px-3 py-2" style={{ background: '#11161d' }} value={form.workspaceMemberships.find(item => item.workspaceId === workspace.id)?.role ?? ''} onChange={event => updateWorkspaceMembership(workspace.id, event.target.value)}>
                {workspaceRoleOptions.map(option => <option key={option || 'none'} value={option}>{option || 'none'}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: '#9bb1c0' }}>Board membership</p>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {directory?.boards.map(board => (
            <div key={board.id} className="grid grid-cols-[1fr_180px] gap-3 items-center">
              <span className="text-sm">{board.title}</span>
              <select className="rounded-xl px-3 py-2" style={{ background: '#11161d' }} value={form.boardMemberships.find(item => item.boardId === board.id)?.role ?? ''} onChange={event => updateBoardMembership(board.id, event.target.value)}>
                {boardRoleOptions.map(option => <option key={option || 'none'} value={option}>{option || 'none'}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
