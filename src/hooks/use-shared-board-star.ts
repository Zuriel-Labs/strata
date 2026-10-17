import { useRef, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { useDispatch } from '../store';
import { toggleBoardStarApi } from '../services/data';
import { toast } from './use-toast';

export function useSharedBoardStar() {
  const auth = useAuth();
  const dispatch = useDispatch();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  async function toggle(boardId: string) {
    if (busy.current || !auth.canManageBoard(boardId)) return;
    busy.current = true;
    setPending(true);
    try {
      const result = await toggleBoardStarApi(boardId);
      dispatch({ type: 'SET_BOARD_STAR', payload: { boardId, starred: result.starred } });
    } catch (error) {
      toast({ title: 'Shared star was not saved', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return { toggle, pending };
}
