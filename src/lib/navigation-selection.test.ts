import { describe, expect, it } from 'vitest';
import { reconcileNavigationSelection } from './navigation-selection';

const workspaces = [{ id: 'w1' }, { id: 'w2' }];
const boards = [{ id: 'b1', workspaceId: 'w1' }, { id: 'b2', workspaceId: 'w1' }];

describe('reconcileNavigationSelection', () => {
  it('preserves an intentional null board in a valid empty workspace', () => {
    expect(reconcileNavigationSelection({ workspaces, boards, workspaceId: 'w2', boardId: null, preserveNullBoard: true }))
      .toEqual({ currentWorkspaceId: 'w2', currentBoardId: null });
  });

  it('never pairs a board with another workspace', () => {
    expect(reconcileNavigationSelection({ workspaces, boards, workspaceId: 'w2', boardId: 'b1' }))
      .toEqual({ currentWorkspaceId: 'w2', currentBoardId: null });
  });

  it('selects the first board only when requested for an explicit workspace change', () => {
    expect(reconcileNavigationSelection({ workspaces, boards, workspaceId: 'w1', boardId: null, selectFirstBoard: true }))
      .toEqual({ currentWorkspaceId: 'w1', currentBoardId: 'b1' });
  });

  it('clears both selections when the selected workspace is no longer accessible', () => {
    expect(reconcileNavigationSelection({ workspaces, boards, workspaceId: 'deleted', boardId: 'b1', selectFirstBoard: true }))
      .toEqual({ currentWorkspaceId: null, currentBoardId: null });
  });

  it('preserves an accessible matching workspace and board pair', () => {
    expect(reconcileNavigationSelection({ workspaces, boards, workspaceId: 'w1', boardId: 'b2' }))
      .toEqual({ currentWorkspaceId: 'w1', currentBoardId: 'b2' });
  });
});
