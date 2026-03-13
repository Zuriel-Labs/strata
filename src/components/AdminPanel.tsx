import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { AdminDirectoryResponse, AdminUserRecord } from '../types';
import { useAuth } from '../lib/auth-context';
import { createManagedUser, fetchAdminDirectory, resetManagedUserPassword, updateManagedUser, type ManagedUserInput } from '../services/admin';

const workspaceRoleOptions = ['', 'workspace_admin', 'member', 'guest'] as const;
const boardRoleOptions = ['', 'board_admin', 'member', 'observer', 'guest'] as const;

function deriveForm(user?: AdminUserRecord | null): ManagedUserInput {
  return {
    name: user?.name ?? '',
    initials: user?.initials ?? '',
    color: user?.color ?? '#6366f1',
    email: user?.email ?? '',
    platformRole: user?.platformRole ?? 'user',
    active: user?.active ?? true,
    workspaceMemberships: user?.workspaceMemberships.map(membership => ({ workspaceId: membership.workspaceId, role: membership.role })) ?? [],
    boardMemberships: user?.boardMemberships.map(membership => ({ boardId: membership.boardId, role: membership.role })) ?? [],
  };
}

export function AdminPanel() {
  const { adminOpen, setAdminOpen, refresh, setAccessDenied, session } = useAuth();
  const [directory, setDirectory] = useState<AdminDirectoryResponse | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [form, setForm] = useState<ManagedUserInput>(deriveForm());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminOpen) return;
    void fetchAdminDirectory()
      .then(result => {
        setDirectory(result);
        setError(null);
        setSelectedUserId(result.users[0]?.id ?? null);
      })
      .catch(requestError => {
        const nextMessage = requestError instanceof Error ? requestError.message : 'Unable to load admin data.';
        setError(nextMessage);
        setAccessDenied(nextMessage);
      });
  }, [adminOpen, setAccessDenied]);

  const selectedUser = useMemo(() => directory?.users.find(user => user.id === selectedUserId) ?? null, [directory, selectedUserId]);

  useEffect(() => {
    setForm(deriveForm(selectedUser));
  }, [selectedUser]);

  if (!adminOpen || !session?.permissions.isSystemAdmin) return null;

  async function reloadDirectory() {
    const result = await fetchAdminDirectory();
    setDirectory(result);
    await refresh();
  }

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
    const result = await createManagedUser(form);
    setMessage(`Created user. Temporary password: ${result.temporaryPassword}`);
    setForm(deriveForm());
    await reloadDirectory();
  }

  async function handleSave() {
    if (!selectedUser) return;
    await updateManagedUser(selectedUser.id, form);
    setMessage('User updated.');
    await reloadDirectory();
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    const result = await resetManagedUserPassword(selectedUser.id);
    setMessage(`Temporary password for ${selectedUser.email}: ${result.temporaryPassword}`);
    await reloadDirectory();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" style={{ background: 'rgba(6, 9, 14, 0.55)' }}>
      <div className="h-full w-full max-w-6xl border-l grid grid-cols-[280px_1fr]" style={{ background: '#11161d', borderColor: '#26313c' }}>
        <div className="border-r p-4 overflow-y-auto" style={{ borderColor: '#26313c' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em]" style={{ color: '#8ca1af' }}>Admin</p>
              <h2 className="text-lg font-bold" style={{ color: '#edf2f7' }}>Users</h2>
            </div>
            <button className="text-sm underline" style={{ color: '#e2a56a' }} onClick={() => setAdminOpen(false)}>Close</button>
          </div>
          {directory?.users.map(user => (
            <button key={user.id} className="w-full text-left rounded-xl px-3 py-2 mb-2" style={{ background: selectedUserId === user.id ? '#1a2732' : '#16202a', color: '#edf2f7' }} onClick={() => setSelectedUserId(user.id)}>
              <p className="font-semibold">{user.name}</p>
              <p className="text-xs" style={{ color: '#9bb1c0' }}>{user.email}</p>
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto" style={{ color: '#edf2f7' }}>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border p-4" style={{ borderColor: '#26313c', background: '#16202a' }}>
              <h3 className="text-sm font-bold mb-4">Create user</h3>
              <UserForm form={form} setForm={setForm} directory={directory} updateWorkspaceMembership={updateWorkspaceMembership} updateBoardMembership={updateBoardMembership} />
              <button className="mt-4 rounded-xl px-4 py-2 font-semibold" style={{ background: '#e2a56a', color: '#132530' }} onClick={() => void handleCreate()}>
                Create user
              </button>
            </section>

            <section className="rounded-2xl border p-4" style={{ borderColor: '#26313c', background: '#16202a' }}>
              <h3 className="text-sm font-bold mb-4">Edit selected user</h3>
              {selectedUser ? (
                <>
                  <UserForm form={form} setForm={setForm} directory={directory} updateWorkspaceMembership={updateWorkspaceMembership} updateBoardMembership={updateBoardMembership} />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#5aa7ff', color: '#0b1822' }} onClick={() => void handleSave()}>
                      Save changes
                    </button>
                    <button className="rounded-xl px-4 py-2 font-semibold" style={{ background: '#f59e0b', color: '#0b1822' }} onClick={() => void handleResetPassword()}>
                      Reset password
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm" style={{ color: '#9bb1c0' }}>Select a user to edit.</p>
              )}
            </section>
          </div>

          <section className="rounded-2xl border p-4 mt-6" style={{ borderColor: '#26313c', background: '#16202a' }}>
            <h3 className="text-sm font-bold mb-4">Recent audit events</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {directory?.auditEvents.map(event => (
                <div key={event.id} className="rounded-xl px-3 py-2" style={{ background: '#11161d' }}>
                  <p className="text-sm font-medium">{event.action}</p>
                  <p className="text-xs" style={{ color: '#9bb1c0' }}>{event.outcome} · {new Date(event.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>

          {(message || error) && <p className="mt-4 text-sm" style={{ color: error ? '#ffb4b4' : '#d9f99d' }}>{error || message}</p>}
        </div>
      </div>
    </div>
  );
}

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
      <input value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} placeholder="Email" className="w-full rounded-xl px-3 py-2" style={{ background: '#11161d' }} />
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
