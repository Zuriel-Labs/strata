import { useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { acceptBoardInvitation } from '../services/invitations';
import { ApiError } from '../services/api';
import { Button } from './ui/button';

export function AcceptBoardInvitation() {
  const { refresh } = useAuth();
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function accept() {
    if (pending) return;
    setPending(true); setError(null); setNotice(null);
    try {
      const result = await acceptBoardInvitation(token.trim());
      setToken('');
      await refresh();
      setNotice(result.alreadyAccepted ? 'Invitation already accepted. Existing access retained.' : `Invitation accepted as ${result.membershipRole}. Open All boards to find it.`);
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 404 ? 'Invitation unavailable. Ask its issuer for a new code.'
        : failure instanceof ApiError && failure.status === 409 ? 'You already belong to this board. Existing access is unchanged.' : 'Unable to accept invitation. Retry when connected.');
      if (failure instanceof ApiError && failure.status === 401) await refresh();
    } finally { setPending(false); }
  }
  return <form aria-label="Accept a board invitation" className="space-y-3 border-t pt-4" onSubmit={event => { event.preventDefault(); void accept(); }}>
    <h3 className="font-semibold">Join a board</h3>
    <p id="invitation-help" className="text-sm opacity-70">Paste a code issued to your existing account. Codes expire within seven days.</p>
    <label className="block text-sm">Invitation code<input type="password" autoComplete="off" spellCheck={false} required pattern="bi_[a-f0-9]{64}" maxLength={67} aria-describedby="invitation-help" value={token} disabled={pending} onChange={event => setToken(event.target.value)} className="block w-full mt-1 border rounded p-2 bg-background" /></label>
    <div className="flex flex-wrap gap-2"><Button disabled={pending || !token.trim()}>{pending ? 'Accepting…' : 'Accept invitation'}</Button>{token && <Button type="button" variant="outline" disabled={pending} onClick={() => setToken('')}>Clear code</Button>}</div>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <p role="alert" className="text-sm">{error}</p>}
  </form>;
}
