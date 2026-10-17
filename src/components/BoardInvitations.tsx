import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { fetchEligibleBoardUsers } from '../services/admin';
import { createBoardInvitation, fetchBoardInvitations, revokeBoardInvitation } from '../services/invitations';
import { Button } from './ui/button';

export function BoardInvitations({ boardId }: { boardId: string }) {
  const { canManageBoard, refresh } = useAuth();
  const allowed = canManageBoard(boardId);
  const [query, setQuery] = useState('');
  const [accountPage, setAccountPage] = useState(1);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ accounts: Awaited<ReturnType<typeof fetchEligibleBoardUsers>>; invitations: Awaited<ReturnType<typeof fetchBoardInvitations>> } | null>(null);
  const [recipient, setRecipient] = useState('');
  const [role, setRole] = useState<'member' | 'observer'>('member');
  const [days, setDays] = useState('1');
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void Promise.all([fetchEligibleBoardUsers(boardId, { query, page: accountPage, pageSize: 20 }), fetchBoardInvitations(boardId, page)])
      .then(([accounts, invitations]) => { if (!cancelled) setData({ accounts, invitations }); })
      .catch(() => { if (!cancelled) setError('Unable to load invitations. Retry when connected.'); });
    return () => { cancelled = true; };
  }, [allowed, boardId, query, accountPage, page, revision]);
  function reload() { setData(null); setError(null); setRevision(value => value + 1); }
  async function create() {
    if (pending || token || !recipient) return;
    setPending(true); setError(null); setNotice(null);
    try {
      const result = await createBoardInvitation(boardId, recipient, role, new Date(Date.now() + Number(days) * 86400000).toISOString());
      setToken(result.token); reload();
    } catch { setError('Unable to create invitation. Confirm the account is eligible and retry.'); await refresh(); }
    finally { setPending(false); }
  }
  async function revoke(id: string) {
    if (pending) return;
    setPending(true); setError(null); setNotice(null);
    try { await revokeBoardInvitation(boardId, id); reload(); setNotice('Invitation revoked. Existing membership is unchanged.'); }
    catch { setError('Unable to revoke invitation. Retry when connected.'); await refresh(); }
    finally { setPending(false); }
  }
  if (!allowed) return null;
  const inputClass = 'mt-1 block min-h-11 w-full min-w-0 rounded border bg-background p-2';
  return <section aria-label="Board invitations" className="personal-navigation space-y-4 rounded-xl border p-4">
    <h3 className="font-bold">Board invitations</h3>
    <p className="text-sm text-muted-foreground">Invite an existing active account. Share its one-time code privately. Invitations never grant administration.</p>
    <form aria-label="Create board invitation" className="space-y-3" onSubmit={event => { event.preventDefault(); void create(); }}>
      <label className="block text-sm">Search invitation recipients<input className={inputClass} value={query} disabled={pending} onChange={event => { setQuery(event.target.value); setAccountPage(1); setRecipient(''); setData(null); }} /></label>
      <label className="block text-sm">Invitation recipient<select aria-label="Invitation recipient" required className={inputClass} value={recipient} disabled={pending || !data} onChange={event => setRecipient(event.target.value)}><option value="">Select an account…</option>{data?.accounts.items.map(person => <option key={person.id} value={person.id}>{person.name} (@{person.username})</option>)}</select></label>
      {data && <div className="flex flex-wrap items-center gap-2 text-sm"><Button type="button" variant="outline" disabled={pending || accountPage === 1} onClick={() => { setAccountPage(value => value - 1); setRecipient(''); setData(null); }}>Previous accounts</Button><span>Accounts page {accountPage} of {data.accounts.page.totalPages}</span><Button type="button" variant="outline" disabled={pending || accountPage >= data.accounts.page.totalPages} onClick={() => { setAccountPage(value => value + 1); setRecipient(''); setData(null); }}>Next accounts</Button>{!data.accounts.items.length && <span>No eligible accounts.</span>}</div>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Invitation role<select aria-label="Invitation role" className={inputClass} value={role} disabled={pending} onChange={event => setRole(event.target.value as 'member' | 'observer')}><option value="member">Member</option><option value="observer">Observer (read only)</option></select></label><label className="block text-sm">Expires in<select aria-label="Expires in" className={inputClass} value={days} disabled={pending} onChange={event => setDays(event.target.value)}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option></select></label></div>
      <Button type="submit" disabled={pending || !recipient || Boolean(token)}>Create invitation</Button>
    </form>
    {token && <div className="space-y-2 rounded border p-3"><p className="text-sm">Copy now. This code cannot be retrieved after dismissal. The recipient pastes it in Home → Join a board.</p><label className="block text-sm">One-time board invitation code<textarea readOnly autoComplete="off" spellCheck={false} className={inputClass} value={token} onFocus={event => event.target.select()} /></label><Button type="button" variant="outline" onClick={() => setToken(null)}>Dismiss code</Button></div>}
    <h4 className="font-semibold">Pending invitations</h4>
    {!data && !error && <p role="status">Loading invitations…</p>}
    {data && <><ul className="space-y-2">{data.invitations.items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"><span className="min-w-0 break-words text-sm">{item.targetName ?? item.targetUserId}{item.targetUsername ? ` (@${item.targetUsername})` : ''} · {item.role} · Expires {new Date(item.expiresAt).toLocaleString()}</span><Button type="button" variant="outline" disabled={pending} aria-label={`Revoke invitation for ${item.targetUsername ?? item.targetUserId}`} onClick={() => void revoke(item.id)}>Revoke</Button></li>)}</ul>{!data.invitations.items.length && <p className="text-sm">No pending invitations.</p>}<div className="flex flex-wrap items-center gap-2 text-sm"><Button type="button" variant="outline" disabled={pending || page === 1} onClick={() => { setPage(value => value - 1); setData(null); }}>Previous invitations</Button><span>Invitations page {page} of {data.invitations.page.totalPages}</span><Button type="button" variant="outline" disabled={pending || page >= data.invitations.page.totalPages} onClick={() => { setPage(value => value + 1); setData(null); }}>Next invitations</Button></div></>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {error && <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button type="button" variant="outline" disabled={pending} onClick={reload}>Retry invitations</Button></div>}
  </section>;
}
