import { useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAppState, useDispatch } from '../store';
import { useAuth } from '../lib/auth-context';
import { createWorkspace, updateWorkspace } from '../services/admin';
import { createBoardApi, updateBoardApi } from '../services/data';
import { useSharedBoardStar } from '../hooks/use-shared-board-star';
import type { AutomationRule, Board, Workspace } from '../types';
import { createAutomationRuleApi, updateAutomationRuleApi, deleteAutomationRuleApi } from '../services/data';
import {
  actionLabels,
  automationRuleToForm,
  buildAutomationRuleInput,
  createDefaultAutomationForm,
  supportedActions,
  supportedTriggers,
  triggerLabels,
} from './automation-rule-form';
import { ArchiveItems } from './ArchiveItems';
import { ContentOperationDialog } from './ContentOperationDialog';
import { CollectionManager } from './CollectionManager';
import { LifecycleButton } from './LifecycleControls';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';

type NavTab = 'workspaces' | 'boards' | 'automations' | 'archive';
type DeleteTarget = { kind: 'workspace'; id: string; name: string };

export function NavigationOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useAppState();
  const auth = useAuth();
  const isSystemAdmin = Boolean(auth.session?.permissions.isSystemAdmin);
  const canManageCurrentWorkspace = auth.canManageWorkspace(state.currentWorkspaceId);
  const canManageCurrentBoard = auth.canManageBoard(state.currentBoardId);
  const canManageAnyAutomation = state.boards.some(board => auth.canManageAutomation(board.id));
  const canOpenNavigation = isSystemAdmin || canManageCurrentWorkspace || canManageCurrentBoard || canManageAnyAutomation;
  const [newBoardName, setNewBoardName] = useState('');
  const [addingBoard, setAddingBoard] = useState(false);
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [activeTab, setActiveTab] = useState<NavTab>('workspaces');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(state.currentWorkspaceId);
  const [selectedAutomationBoardId, setSelectedAutomationBoardId] = useState<string | null>(state.currentBoardId);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const tabs = useMemo<{ key: NavTab; label: string; icon: React.ReactNode }[]>(() => [
    ...(canOpenNavigation ? [{ key: 'workspaces' as const, label: 'Workspaces', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> }] : []),
    ...(canOpenNavigation ? [{ key: 'boards' as const, label: 'Boards', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }] : []),
    ...(isSystemAdmin || canManageCurrentWorkspace || canManageAnyAutomation ? [{ key: 'automations' as const, label: 'Automations', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> }] : []),
    ...(isSystemAdmin || canManageCurrentWorkspace || canManageCurrentBoard ? [{ key: 'archive' as const, label: 'Archive', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg> }] : []),
  ], [canManageAnyAutomation, canManageCurrentBoard, canManageCurrentWorkspace, canOpenNavigation, isSystemAdmin]);
  const defaultTab = tabs[0]?.key ?? 'boards';
  const visibleActiveTab = tabs.some(tab => tab.key === activeTab) ? activeTab : defaultTab;

  if (!open || !canOpenNavigation) return null;

  const boardWorkspaceOptions = state.workspaces.filter(workspace => auth.canManageWorkspace(workspace.id) || state.boards.some(board => board.workspaceId === workspace.id && auth.canManageBoard(board.id)));
  const selectedWorkspace = boardWorkspaceOptions.find(workspace => workspace.id === selectedWorkspaceId)
    ?? boardWorkspaceOptions.find(workspace => workspace.id === state.currentWorkspaceId)
    ?? boardWorkspaceOptions[0]
    ?? state.workspaces.find(workspace => workspace.id === selectedWorkspaceId)
    ?? state.workspaces.find(workspace => workspace.id === state.currentWorkspaceId);
  const boards = state.boards.filter(board => board.workspaceId === selectedWorkspace?.id);
  const canManageWorkspace = auth.canManageWorkspace(selectedWorkspace?.id ?? null);
  const boardColors = ['#6366f1', '#0891b2', '#059669', '#ea580c', '#dc2626', '#7c3aed', '#be185d'];

  return (
    <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent showCloseButton={false} data-testid="management-dialog" className="h-[min(42rem,85dvh)] max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl rounded-2xl flex flex-col overflow-hidden p-0 gap-0" style={{ background: 'var(--modal-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
        <DialogDescription className="sr-only">Manage workspace and board lifecycle, collections, automations and archives.</DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <DialogTitle className="text-sm font-bold">Management</DialogTitle>
          <button aria-label="Close navigation" className="w-8 h-8 rounded-md flex items-center justify-center text-sm transition-colors" style={{ color: 'var(--text-muted)', background: 'var(--active-bg)' }} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-4 shrink-0 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              className="flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors"
              style={{
                borderColor: visibleActiveTab === tab.key ? 'var(--accent)' : 'transparent',
                color: visibleActiveTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {visibleActiveTab === 'workspaces' && (
            <WorkspacesContent
              addingWorkspace={addingWorkspace}
              setAddingWorkspace={setAddingWorkspace}
              newWorkspaceName={newWorkspaceName}
              setNewWorkspaceName={setNewWorkspaceName}
              onRequestDeleteWorkspace={workspace => {
                setSelectedWorkspaceId(workspace.id);
                setDeleteTarget({ kind: 'workspace', id: workspace.id, name: workspace.name });
              }}
            />
          )}

          {visibleActiveTab === 'boards' && (
            <BoardsContent
              boards={boards}
              currentWs={selectedWorkspace}
              addingBoard={addingBoard}
              setAddingBoard={setAddingBoard}
              newBoardName={newBoardName}
              setNewBoardName={setNewBoardName}
              boardColors={boardColors}
              workspaceOptions={boardWorkspaceOptions}
              selectedWorkspaceId={selectedWorkspace?.id ?? null}
              onSelectWorkspace={workspaceId => setSelectedWorkspaceId(workspaceId)}
              canManageWorkspace={canManageWorkspace}
            />
          )}

          {visibleActiveTab === 'automations' && (
            <AutomationsContent
              selectedWorkspaceId={selectedWorkspace?.id ?? null}
              setSelectedWorkspaceId={setSelectedWorkspaceId}
              selectedBoardId={selectedAutomationBoardId}
              setSelectedBoardId={setSelectedAutomationBoardId}
            />
          )}

          {visibleActiveTab === 'archive' && (
            <ArchiveContent />
          )}
        </div>
      </DialogContent>
      {deleteTarget && <ContentOperationDialog kind="delete" resourceType={deleteTarget.kind} sourceId={deleteTarget.id} onClose={() => setDeleteTarget(null)} />}
    </Dialog>
  );
}

/* ── Workspaces Tab ── */

function WorkspacesContent({
  addingWorkspace, setAddingWorkspace, newWorkspaceName, setNewWorkspaceName, onRequestDeleteWorkspace,
}: {
  addingWorkspace: boolean; setAddingWorkspace: (v: boolean) => void;
  newWorkspaceName: string; setNewWorkspaceName: (v: string) => void;
  onRequestDeleteWorkspace: (workspace: Workspace) => void;
}) {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [workspaceRenameDraft, setWorkspaceRenameDraft] = useState('');
  const [workspaceRenameError, setWorkspaceRenameError] = useState<{ id: string; message: string } | null>(null);
  const [workspaceRenameSavingId, setWorkspaceRenameSavingId] = useState<string | null>(null);
  const workspaceCreateSubmitRef = useRef(false);
  const workspaceRenameSubmitRef = useRef(false);

  const resetWorkspaceDraft = () => {
    setAddingWorkspace(false);
    setNewWorkspaceName('');
    setWorkspaceError(null);
  };

  const resetWorkspaceRename = () => {
    setEditingWorkspaceId(null);
    setWorkspaceRenameDraft('');
    setWorkspaceRenameError(null);
    setWorkspaceRenameSavingId(null);
  };

  const beginWorkspaceRename = (workspace: Workspace) => {
    if (!auth.canManageWorkspace(workspace.id)) return;
    resetWorkspaceDraft();
    setEditingWorkspaceId(workspace.id);
    setWorkspaceRenameDraft(workspace.name);
    setWorkspaceRenameError(null);
  };

  const submitWorkspaceRename = async (workspace: Workspace) => {
    if (workspaceRenameSubmitRef.current || editingWorkspaceId !== workspace.id) return;

    const name = workspaceRenameDraft.trim();
    if (!name || name === workspace.name) {
      resetWorkspaceRename();
      return;
    }

    workspaceRenameSubmitRef.current = true;
    setWorkspaceRenameSavingId(workspace.id);
    setWorkspaceRenameError(null);

    try {
      const result = await updateWorkspace(workspace.id, { name });
      dispatch({
        type: 'UPDATE_WORKSPACE_FROM_API',
        payload: {
          ...result,
          memberIds: workspace.memberIds,
        },
      });
      resetWorkspaceRename();
    } catch (error) {
      setWorkspaceRenameError({ id: workspace.id, message: error instanceof Error ? error.message : 'Unable to rename workspace.' });
      setWorkspaceRenameSavingId(null);
    } finally {
      workspaceRenameSubmitRef.current = false;
    }
  };

  const submitWorkspaceDraft = async () => {
    if (workspaceCreateSubmitRef.current) return;

    const name = newWorkspaceName.trim();
    if (!name) {
      resetWorkspaceDraft();
      return;
    }

    workspaceCreateSubmitRef.current = true;
    setWorkspaceError(null);

    try {
      const result = await createWorkspace({ name, description: '', visibility: 'private' });
      dispatch({ type: 'ADD_WORKSPACE', payload: { id: result.id, name: result.name, description: result.description, memberIds: [], visibility: result.visibility as 'private' | 'workspace' | 'public' } });
      resetWorkspaceDraft();
      await auth.refresh();
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Unable to create workspace.');
    } finally {
      workspaceCreateSubmitRef.current = false;
    }
  };

  return (
    <div className="space-y-2">
      {state.workspaces.map(w => {
        const canEdit = auth.canManageWorkspace(w.id);
        const isEditing = editingWorkspaceId === w.id;
        return (
          <div key={w.id} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {isEditing ? (
                <div className="flex min-h-[52px] flex-1 items-center gap-3 rounded-xl border px-4" style={{ background: 'var(--card-bg)', borderColor: 'var(--accent)' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#6366f1' }}>
                    {(workspaceRenameDraft.trim() || w.name).charAt(0)}
                  </div>
                  <input
                    autoFocus
                    value={workspaceRenameDraft}
                    onChange={event => setWorkspaceRenameDraft(event.target.value)}
                    onBlur={() => {
                      void submitWorkspaceRename(w);
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void submitWorkspaceRename(w);
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        resetWorkspaceRename();
                      }
                    }}
                    placeholder="Workspace name…"
                    className="min-h-[44px] flex-1 bg-transparent text-sm font-semibold outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => beginWorkspaceRename(w)}
                  disabled={!canEdit || w.lifecycleState === 'closed'}
                  className="flex min-h-[52px] flex-1 items-center gap-3 rounded-xl px-4 text-left transition-all hover:bg-white/10 hover:ring-1 hover:ring-white/15 disabled:cursor-default disabled:opacity-80"
                  style={{
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid transparent',
                  }}
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: '#6366f1' }}>
                    {w.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{w.name}</p>
                    {w.description && <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{w.description}</p>}
                  </div>
                </button>
              )}
              {canEdit && <LifecycleButton kind="workspace" id={w.id} />}
              {canEdit && w.lifecycleState === 'closed' && (
                <button
                  type="button"
                  aria-label={`Delete workspace ${w.name}`}
                  onClick={() => onRequestDeleteWorkspace(w)}
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)' }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {workspaceRenameError?.id === w.id && <p className="pl-4 text-xs" style={{ color: '#ffb4b4' }}>{workspaceRenameError.message}</p>}
            {workspaceRenameSavingId === w.id && <p className="pl-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>Saving workspace name…</p>}
          </div>
        );
      })}

      {auth.session?.permissions.isSystemAdmin && !addingWorkspace && (
        <button
          onClick={() => {
            resetWorkspaceRename();
            setAddingWorkspace(true);
          }}
          className="w-full px-4 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-medium border border-dashed transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          + Create workspace
        </button>
      )}

      {addingWorkspace && (
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
          <input
            autoFocus
            value={newWorkspaceName}
            onChange={e => setNewWorkspaceName(e.target.value)}
            onBlur={() => {
              void submitWorkspaceDraft();
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitWorkspaceDraft();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                resetWorkspaceDraft();
              }
            }}
            placeholder="Workspace name…"
            className="w-full px-3 min-h-[44px] text-sm rounded-lg border outline-none"
            style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          {workspaceError && <p className="text-xs" style={{ color: '#ffb4b4' }}>{workspaceError}</p>}
        </div>
      )}
    </div>
  );
}

/* ── Boards Tab ── */

function BoardsContent({
  boards, currentWs, addingBoard, setAddingBoard, newBoardName, setNewBoardName, boardColors, workspaceOptions, selectedWorkspaceId, onSelectWorkspace, canManageWorkspace,
}: {
  boards: Board[];
  currentWs: Workspace | undefined;
  addingBoard: boolean; setAddingBoard: (v: boolean) => void;
  newBoardName: string; setNewBoardName: (v: string) => void;
  boardColors: string[];
  workspaceOptions: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  canManageWorkspace: boolean;
}) {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const sharedStar = useSharedBoardStar();
  const [boardRenameDraft, setBoardRenameDraft] = useState('');
  const [boardRenameError, setBoardRenameError] = useState<{ id: string; message: string } | null>(null);
  const [boardRenameSavingId, setBoardRenameSavingId] = useState<string | null>(null);
  const boardRenameSubmitRef = useRef(false);

  const starred = boards.filter(b => b.starred);
  const unstarred = boards.filter(b => !b.starred);

  const resetBoardRename = () => {
    setEditingBoardId(null);
    setBoardRenameDraft('');
    setBoardRenameError(null);
    setBoardRenameSavingId(null);
  };

  const beginBoardRename = (board: Board) => {
    if (!auth.canManageBoard(board.id)) return;
    setAddingBoard(false);
    setNewBoardName('');
    setEditingBoardId(board.id);
    setBoardRenameDraft(board.title);
    setBoardRenameError(null);
  };

  const submitBoardRename = async (board: Board) => {
    if (boardRenameSubmitRef.current || editingBoardId !== board.id) return;

    const title = boardRenameDraft.trim();
    if (!title || title === board.title) {
      resetBoardRename();
      return;
    }

    boardRenameSubmitRef.current = true;
    setBoardRenameSavingId(board.id);
    setBoardRenameError(null);

    try {
      const result = await updateBoardApi(board.id, { title });
      dispatch({ type: 'UPDATE_BOARD_FROM_API', payload: result });
      resetBoardRename();
    } catch (error) {
      setBoardRenameError({ id: board.id, message: error instanceof Error ? error.message : 'Unable to rename board.' });
      setBoardRenameSavingId(null);
    } finally {
      boardRenameSubmitRef.current = false;
    }
  };

  return (
    <div className="space-y-4">
      {currentWs && <CollectionManager key={currentWs.id} workspaceId={currentWs.id} />}
      {currentWs && (
        <p className="text-sm font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>
          Workspace:{' '}
          {workspaceOptions.length > 1 ? (
            <select
              aria-label="Board workspace"
              value={selectedWorkspaceId ?? currentWs.id}
              onChange={event => onSelectWorkspace(event.target.value)}
              className="min-h-[40px] rounded-md border px-3 text-sm font-semibold outline-none"
              style={{ background: '#2a2d36', borderColor: 'transparent', color: 'var(--text-primary)' }}
            >
              {workspaceOptions.map(workspace => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          ) : (
            <span style={{ color: '#f4f6fb' }}>{currentWs.name}</span>
          )}
        </p>
      )}

      {starred.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>★ Shared stars</p>
          <div className="space-y-1">
            {starred.map(b => (
              <BoardRow
                key={b.id}
                board={b}
                isCurrent={state.currentBoardId === b.id}
                canEdit={auth.canManageBoard(b.id)}
                isEditing={editingBoardId === b.id}
                draftTitle={editingBoardId === b.id ? boardRenameDraft : b.title}
                renameError={boardRenameError?.id === b.id ? boardRenameError.message : null}
                renameSaving={boardRenameSavingId === b.id}
                onDraftTitleChange={setBoardRenameDraft}
                onStartEdit={() => beginBoardRename(b)}
                onSubmitEdit={() => {
                  void submitBoardRename(b);
                }}
                onCancelEdit={resetBoardRename}
                starPending={sharedStar.pending}
                onToggleStar={() => { void sharedStar.toggle(b.id); }}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        {starred.length > 0 && <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>All Boards</p>}
        <div className="space-y-1">
          {unstarred.map(b => (
            <BoardRow
              key={b.id}
              board={b}
              isCurrent={state.currentBoardId === b.id}
              canEdit={auth.canManageBoard(b.id)}
              isEditing={editingBoardId === b.id}
              draftTitle={editingBoardId === b.id ? boardRenameDraft : b.title}
              renameError={boardRenameError?.id === b.id ? boardRenameError.message : null}
              renameSaving={boardRenameSavingId === b.id}
              onDraftTitleChange={setBoardRenameDraft}
              onStartEdit={() => beginBoardRename(b)}
              onSubmitEdit={() => {
                void submitBoardRename(b);
              }}
              onCancelEdit={resetBoardRename}
              starPending={sharedStar.pending}
              onToggleStar={() => { void sharedStar.toggle(b.id); }}
            />
          ))}
        </div>
      </div>

      {canManageWorkspace && !addingBoard && (
        <button
          onClick={() => setAddingBoard(true)}
          className="w-full px-4 min-h-[44px] flex items-center justify-center rounded-xl text-xs font-medium border border-dashed transition-colors"
          style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
        >
          + Add board
        </button>
      )}

      {addingBoard && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)' }}>
          <input
            autoFocus
            value={newBoardName}
            onChange={e => setNewBoardName(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && newBoardName.trim() && currentWs?.id) {
                const title = newBoardName.trim();
                const color = boardColors[Math.floor(Math.random() * boardColors.length)];
                const board = await createBoardApi({ workspaceId: currentWs.id, title, color });
                dispatch({ type: 'ADD_BOARD_FROM_API', payload: board });
                setNewBoardName('');
                setAddingBoard(false);
              }
              if (e.key === 'Escape') { setAddingBoard(false); setNewBoardName(''); }
            }}
            placeholder="Board name…"
            className="w-full px-3 min-h-[44px] text-sm rounded-lg border outline-none"
            style={{ background: 'var(--input-bg)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
      )}
    </div>
  );
}

function BoardRow({
  board,
  isCurrent,
  canEdit,
  isEditing,
  draftTitle,
  renameError,
  renameSaving,
  onDraftTitleChange,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onToggleStar,
  starPending,
}: {
  board: Board;
  isCurrent: boolean;
  canEdit: boolean;
  isEditing: boolean;
  draftTitle: string;
  renameError: string | null;
  renameSaving: boolean;
  onDraftTitleChange: (value: string) => void;
  onStartEdit: () => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  onToggleStar: () => void;
  starPending: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center group">
        {isEditing ? (
          <div className="flex flex-1 items-center gap-3 rounded-lg border px-3" style={{ background: 'var(--card-bg)', borderColor: 'var(--accent)' }}>
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: board.color }} />
            <input
              autoFocus
              value={draftTitle}
              onChange={event => onDraftTitleChange(event.target.value)}
              onBlur={onSubmitEdit}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSubmitEdit();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onCancelEdit();
                }
              }}
              placeholder="Board name…"
              className="min-h-[44px] flex-1 bg-transparent text-sm font-semibold outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            disabled={!canEdit || board.lifecycleState === 'closed'}
            className="flex-1 flex items-center gap-3 px-3 min-h-[44px] rounded-lg text-sm text-left transition-all hover:bg-white/10 hover:ring-1 hover:ring-white/15 disabled:cursor-default disabled:opacity-80"
            style={{
              background: 'transparent',
              color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: board.color }} />
            <span className="truncate">{board.title}</span>
          </button>
        )}
        {canEdit && <button
          type="button"
          aria-label={`${board.starred ? 'Unstar' : 'Star'} ${board.title}`}
          title="Shared board star"
          disabled={starPending}
          onClick={event => { event.stopPropagation(); onToggleStar(); }}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-8 h-8 rounded-md flex items-center justify-center text-sm transition-opacity"
          style={{ color: board.starred ? '#eab308' : 'var(--text-muted)' }}
        >
          {board.starred ? '★' : '☆'}
        </button>}
      </div>
      {renameError && <p className="pl-3 text-xs" style={{ color: '#ffb4b4' }}>{renameError}</p>}
      {renameSaving && <p className="pl-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>Saving board name…</p>}
    </div>
  );
}

/* ── Automations Tab ── */

function AutomationsContent({ selectedWorkspaceId, setSelectedWorkspaceId, selectedBoardId, setSelectedBoardId }: {
  selectedWorkspaceId: string | null;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  selectedBoardId: string | null;
  setSelectedBoardId: (boardId: string | null) => void;
}) {
  const state = useAppState();
  const dispatch = useDispatch();
  const auth = useAuth();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(createDefaultAutomationForm);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const workspaceOptions = state.workspaces.filter(workspace => auth.canManageWorkspace(workspace.id)
    || state.boards.some(board => board.workspaceId === workspace.id && auth.canManageAutomation(board.id)));
  const workspaceId = workspaceOptions.some(workspace => workspace.id === selectedWorkspaceId)
    ? selectedWorkspaceId
    : workspaceOptions[0]?.id ?? null;
  const manageableBoards = state.boards
    .filter(board => board.workspaceId === workspaceId && auth.canManageAutomation(board.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  const boardId = manageableBoards.some(board => board.id === selectedBoardId) ? selectedBoardId : manageableBoards[0]?.id ?? null;

  const scopeControls = (
    <div className="mb-3 grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
        <span>Workspace</span>
        <select
          aria-label="Automation workspace"
          value={workspaceId ?? ''}
          onChange={event => {
            const nextWorkspaceId = event.target.value;
            setSelectedWorkspaceId(nextWorkspaceId);
            const nextBoard = state.boards
              .filter(board => board.workspaceId === nextWorkspaceId && auth.canManageAutomation(board.id))
              .sort((left, right) => left.title.localeCompare(right.title))[0];
            setSelectedBoardId(nextBoard?.id ?? null);
            setAdding(false);
            setEditingRuleId(null);
            setError(null);
            setForm(createDefaultAutomationForm());
          }}
          className="block min-h-[44px] w-full rounded-md border px-3 text-sm font-semibold outline-none"
          style={{ background: '#2a2d36', borderColor: 'transparent', color: 'var(--text-primary)' }}
          disabled={workspaceOptions.length === 0}
        >
          {workspaceOptions.length === 0 && <option value="">No manageable workspaces</option>}
          {workspaceOptions.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
        <span>Board</span>
        <select
          aria-label="Automation board"
          value={boardId ?? ''}
          onChange={event => {
            setSelectedBoardId(event.target.value || null);
            setAdding(false);
            setEditingRuleId(null);
            setError(null);
            setForm(createDefaultAutomationForm());
          }}
          className="block min-h-[44px] w-full rounded-md border px-3 text-sm font-semibold outline-none"
          style={{ background: '#2a2d36', borderColor: 'transparent', color: 'var(--text-primary)' }}
          disabled={manageableBoards.length === 0}
        >
          {manageableBoards.length === 0 && <option value="">No manageable boards</option>}
          {manageableBoards.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
        </select>
      </label>
    </div>
  );

  if (!boardId) return <div>{scopeControls}<p className="text-xs" style={{ color: 'var(--text-muted)' }}>This workspace has no boards you can manage for automations.</p></div>;

  const rules = state.automationRules.filter(r => r.boardId === boardId);
  const lists = state.lists.filter(l => l.boardId === boardId && !l.archived).sort((a, b) => a.position - b.position);
  const board = manageableBoards.find(candidate => candidate.id === boardId) ?? null;

  const handleSave = async () => {
    if (!boardId || saving) return;
    setError(null);
    const { input, error: validationError } = buildAutomationRuleInput(boardId, form);
    if (!input) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      if (editingRuleId) {
        const updates = {
          name: input.name,
          trigger: input.trigger,
          triggerConfig: input.triggerConfig,
          conditions: input.conditions,
          action: input.action,
          actionConfig: input.actionConfig,
          enabled: input.enabled,
        };
        const rule = await updateAutomationRuleApi(editingRuleId, updates);
        dispatch({ type: 'UPDATE_AUTOMATION_RULE', payload: rule });
      } else {
        const rule = await createAutomationRuleApi(input);
        dispatch({ type: 'ADD_AUTOMATION_RULE_FROM_API', payload: rule });
      }
      setForm(createDefaultAutomationForm());
      setAdding(false);
      setEditingRuleId(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${editingRuleId ? 'update' : 'create'} automation rule.`);
    } finally {
      setSaving(false);
    }
  };

  const describeConditions = (rule: AutomationRule) => {
    const parts: string[] = [];
    const list = lists.find(candidate => candidate.id === rule.conditions.listId);
    const label = board?.labels.find(candidate => candidate.id === rule.conditions.labelId);
    parts.push(`Lists: ${list ? list.title : 'Any list'}`);
    parts.push(`Labels: ${label ? label.name : 'Any labels'}`);
    return parts.join(' • ');
  };

  const describeSchedule = (rule: AutomationRule) => {
    if (rule.trigger === 'date_time' && rule.triggerConfig.runAt) return new Date(rule.triggerConfig.runAt).toLocaleString();
    if (rule.trigger === 'weekday') return `${(rule.triggerConfig.weekdays ?? []).join(', ')} @ ${rule.triggerConfig.time ?? '--:--'}`;
    if (rule.trigger === 'monthly') return `Day ${rule.triggerConfig.dayOfMonth ?? '-'} @ ${rule.triggerConfig.time ?? '--:--'}`;
    if (rule.trigger === 'heartbeat') return `Every ${rule.triggerConfig.intervalValue ?? '-'} ${rule.triggerConfig.intervalUnit ?? ''}`;
    return '';
  };

  return (
    <div className="space-y-3">
      {scopeControls}
      {rules.map(rule => {
        const triggerList = state.lists.find(l => l.id === rule.triggerConfig.toListId);
        const actionUser = state.users.find(u => u.id === rule.actionConfig.memberId);
        const actionLabel = board?.labels.find(l => l.id === rule.actionConfig.labelId);
        const actionList = state.lists.find(l => l.id === rule.actionConfig.listId);
        return (
          <div key={rule.id} className="rounded-lg p-3 border" style={{ borderColor: 'var(--border)', background: 'var(--card-bg)', opacity: rule.enabled ? 1 : 0.5 }}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{rule.name}</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Edit automation ${rule.name}`}
                  onClick={() => {
                    setError(null);
                    setForm(automationRuleToForm(rule));
                    setEditingRuleId(rule.id);
                    setAdding(true);
                  }}
                  className="min-h-[44px] rounded px-2 text-xs font-medium"
                  style={{ color: 'var(--accent)', background: 'var(--active-bg)' }}
                >
                  Edit
                </button>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={rule.enabled} onChange={() => { dispatch({ type: 'UPDATE_AUTOMATION_RULE', payload: { id: rule.id, enabled: !rule.enabled } }); updateAutomationRuleApi(rule.id, { enabled: !rule.enabled }); }} className="sr-only peer" />
                  <div className="w-7 h-4 rounded-full peer" style={{ background: rule.enabled ? 'var(--accent)' : 'var(--border)' }}><div className="w-3 h-3 rounded-full absolute top-[2px] transition-all" style={{ background: '#fff', left: rule.enabled ? '14px' : '2px' }} /></div>
                </label>
                <button onClick={() => { dispatch({ type: 'DELETE_AUTOMATION_RULE', payload: rule.id }); deleteAutomationRuleApi(rule.id); }} className="w-7 h-7 rounded flex items-center justify-center text-xs" style={{ color: '#ef4444', background: 'var(--active-bg)' }}>✕</button>
              </div>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              <strong>When:</strong> {triggerLabels[rule.trigger]}{triggerList ? ` → "${triggerList.title}"` : ''}<br />
              {describeSchedule(rule) && <><strong>Schedule:</strong> {describeSchedule(rule)}<br /></>}
              <strong>Conditions:</strong> {describeConditions(rule)}<br />
              <strong>Then:</strong> {actionLabels[rule.action]}
              {actionUser && ` → ${actionUser.name}`}
              {actionLabel && ` → ${actionLabel.name}`}
              {actionList && ` → "${actionList.title}"`}
            </p>
          </div>
        );
      })}

      {rules.length === 0 && !adding && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No automation rules yet. Create one to automate repetitive actions.</p>}

      {adding ? (
        <div className="rounded-lg p-3 border space-y-2" style={{ borderColor: 'var(--accent)', background: 'var(--card-bg)' }}>
          {error && <p className="text-xs" style={{ color: '#ffb4b4' }}>{error}</p>}
          <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Rule name…" className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent outline-none" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Trigger</label>
            <select value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value as AutomationRule['trigger'] })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {supportedTriggers.map(trigger => <option key={trigger} value={trigger}>{triggerLabels[trigger]}</option>)}
            </select>
          </div>
          {form.trigger === 'card_moved' && (
            <select value={form.triggerListId} onChange={e => setForm({ ...form, triggerListId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Any list</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          )}
          {form.trigger === 'date_time' && (
            <input type="datetime-local" value={form.scheduleDateTime} onChange={e => setForm({ ...form, scheduleDateTime: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
          )}
          {form.trigger === 'weekday' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setForm(current => ({
                      ...current,
                      scheduleWeekdays: current.scheduleWeekdays.includes(index)
                        ? current.scheduleWeekdays.filter(value => value !== index)
                        : [...current.scheduleWeekdays, index],
                    }))}
                    className="min-h-[44px] rounded-md px-3 text-xs font-medium"
                    style={{ background: form.scheduleWeekdays.includes(index) ? 'var(--accent)' : 'var(--active-bg)', color: form.scheduleWeekdays.includes(index) ? '#fff' : 'var(--text-secondary)' }}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <input type="time" value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
          )}
          {form.trigger === 'monthly' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="number" min="1" max="31" value={form.scheduleDayOfMonth} onChange={e => setForm({ ...form, scheduleDayOfMonth: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              <input type="time" value={form.scheduleTime} onChange={e => setForm({ ...form, scheduleTime: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
            </div>
          )}
          {form.trigger === 'heartbeat' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="number" min="1" value={form.scheduleIntervalValue} onChange={e => setForm({ ...form, scheduleIntervalValue: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              <select value={form.scheduleIntervalUnit} onChange={e => setForm({ ...form, scheduleIntervalUnit: e.target.value as 'minutes' | 'hours' })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Lists</label>
            <select value={form.conditionListId} onChange={e => setForm({ ...form, conditionListId: e.target.value })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Any list</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Labels</label>
            <select value={form.conditionLabelId} onChange={e => setForm({ ...form, conditionLabelId: e.target.value })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Any labels</option>
              {board?.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Action</label>
            <select value={form.action} onChange={e => setForm({ ...form, action: e.target.value as AutomationRule['action'] })} className="w-full mt-0.5 px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              {supportedActions.map(action => <option key={action} value={action}>{actionLabels[action]}</option>)}
            </select>
          </div>
          {form.action === 'assign_member' && (
            <select value={form.actionMemberId} onChange={e => setForm({ ...form, actionMemberId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Select member…</option>
              {state.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          {form.action === 'add_label' && (
            <select value={form.actionLabelId} onChange={e => setForm({ ...form, actionLabelId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Select label…</option>
              {board?.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {form.action === 'move_to_list' && (
            <select value={form.actionListId} onChange={e => setForm({ ...form, actionListId: e.target.value })} className="w-full px-3 min-h-[44px] text-xs rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Select list…</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          )}
          <div className="flex gap-1 pt-1">
            <button onClick={() => void handleSave()} disabled={saving} className="px-3 min-h-[44px] rounded text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" style={{ background: 'var(--accent)' }}>{saving ? (editingRuleId ? 'Saving…' : 'Creating…') : (editingRuleId ? 'Save Changes' : 'Create Rule')}</button>
            <button onClick={() => { setAdding(false); setEditingRuleId(null); setError(null); setForm(createDefaultAutomationForm()); }} className="px-3 min-h-[44px] text-xs" style={{ color: 'var(--text-muted)' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setError(null); setEditingRuleId(null); setForm(createDefaultAutomationForm()); setAdding(true); }} className="w-full px-3 min-h-[44px] flex items-center justify-center rounded-lg text-xs font-medium border border-dashed transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
          + Create automation rule
        </button>
      )}
    </div>
  );
}

/* ── Archive Tab ── */

function ArchiveContent() {
  return <ArchiveItems />;
}
