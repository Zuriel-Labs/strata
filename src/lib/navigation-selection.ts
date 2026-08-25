interface WorkspaceLike { id: string }
interface BoardLike { id: string; workspaceId: string }

interface ReconcileNavigationSelectionInput {
  workspaces: WorkspaceLike[];
  boards: BoardLike[];
  workspaceId: string | null;
  boardId: string | null;
  preserveNullBoard?: boolean;
  selectFirstBoard?: boolean;
}

export function reconcileNavigationSelection({ workspaces, boards, workspaceId, boardId, preserveNullBoard = false, selectFirstBoard = false }: ReconcileNavigationSelectionInput) {
  const currentWorkspaceId = workspaces.some(workspace => workspace.id === workspaceId) ? workspaceId : null;
  if (!currentWorkspaceId) return { currentWorkspaceId: null, currentBoardId: null };
  const matchingBoard = boards.find(board => board.id === boardId && board.workspaceId === currentWorkspaceId) ?? null;
  if (matchingBoard) return { currentWorkspaceId, currentBoardId: matchingBoard.id };
  if (boardId === null && preserveNullBoard) return { currentWorkspaceId, currentBoardId: null };
  const firstBoard = selectFirstBoard ? boards.find(board => board.workspaceId === currentWorkspaceId) ?? null : null;
  return { currentWorkspaceId, currentBoardId: firstBoard?.id ?? null };
}
