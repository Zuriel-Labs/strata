import { useEffect, useRef, useState } from 'react';
import { CONNECTION_SCOPES, decideConsent, inspectConsent, type ConsentRequest } from '../services/connections';
import { useAuth } from '../lib/auth-context';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ConnectionConsent() {
  const {session}=useAuth();
  const resourceName=(resource:string)=>resource==='platform'?'Entire platform':resource==='account'?'Your account':resource.startsWith('board:')?session?.appState.boards.find(board=>board.id===resource.slice(6))?.title??'Unavailable board':session?.appState.workspaces.find(workspace=>workspace.id===resource.slice(10))?.name??'Unavailable workspace';
  const [query] = useState(()=>new URLSearchParams(window.location.search));
  const [code,setCode] = useState(query.get('user_code')??'');
  const [pending,setPending] = useState<ConsentRequest|null>(null);
  const [confirmed,setConfirmed] = useState(false);
  const [busy,setBusy] = useState(Boolean(query.get('request_id')));
  const reviewHeading=useRef<HTMLHeadingElement>(null);
  const [error,setError] = useState<string|null>(null);
  const [outcome,setOutcome] = useState<string|null>(null);
  useEffect(()=>{
    const id=query.get('request_id');if(!id)return;
    let active=true;
    void inspectConsent({request_id:id}).then(result=>{if(active)setPending(result.request);}).catch(failure=>{if(active)setError(failure instanceof Error?failure.message:'Request unavailable.');}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[query]);
  useEffect(()=>{if(pending)reviewHeading.current?.focus();},[pending]);
  async function review(){setBusy(true);setError(null);try{setPending((await inspectConsent({user_code:code})).request);setConfirmed(false);}catch(failure){setError(failure instanceof Error?failure.message:'Request unavailable.');}finally{setBusy(false);}}
  async function decide(decision:'approve'|'deny'){
    if(!pending)return;setBusy(true);setError(null);
    try{const result=await decideConsent(pending.id,decision,pending.userCode??undefined);setPending(null);setOutcome(decision==='approve'?'Connection approved. Return to your client.':'Connection denied. Return to your client.');if(result.redirectUri)window.location.assign(result.redirectUri);}
    catch(failure){setError(failure instanceof Error?failure.message:'Unable to complete approval.');}finally{setBusy(false);}
  }
  return <main data-theme={session?.user.themePreference??'dark'} className="min-h-[100dvh] overflow-y-auto px-4 py-8" style={{background:'var(--bg)',color:'var(--text-primary)'}}>
    <div className="mx-auto max-w-lg space-y-5 rounded-2xl border p-5 sm:p-8" style={{background:'var(--modal-bg)',borderColor:'var(--border)'}}>
      <h1 className="text-2xl font-semibold">Connect a client to Strata</h1>
      <p className="text-sm" style={{color:'var(--text-secondary)'}}>Only continue if you started this request on a device you control. Strata never asks you to share your password with a client.</p>
      {error&&<p role="alert" className="rounded-lg border p-3">{error}</p>}
      {busy&&<p role="status">Checking request…</p>}
      {outcome?<p role="status">{outcome}</p>:pending?<>
        <h2 ref={reviewHeading} tabIndex={-1} className="break-words text-xl font-semibold">{pending.name}</h2>
        {pending.userCode&&<p className="rounded-xl border p-4 text-center font-mono text-2xl tracking-widest" aria-label="Matching verification code">{pending.userCode}</p>}
        <section><h3 className="font-semibold">Requested permissions</h3><ul className="list-inside list-disc text-sm">{pending.scopes.map(scope=><li key={scope}>{CONNECTION_SCOPES[scope]}</li>)}</ul></section>
        <section><h3 className="font-semibold">Resource boundaries</h3><ul className="list-inside list-disc break-all text-sm">{pending.resources.map(resource=><li key={resource}>{resourceName(resource)} <span className="font-mono text-xs">({resource})</span></li>)}</ul></section>
        <p className="text-sm">Approval request expires {new Date(pending.expiresAt).toLocaleString()}. Connection expires no later than {new Date(pending.connectionExpiresAt).toLocaleString()}.</p>
        {pending.redirectUri&&<p className="break-all text-sm">Return to: {pending.redirectUri}</p>}
        <label className="flex min-h-[44px] items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{pending.userCode?'The code matches my client, and I approve these permissions and resources.':'I started this request and approve these permissions, resources and callback.'}</label>
        <div className="flex flex-wrap gap-3"><Button className="min-h-[44px]" disabled={busy||!confirmed} onClick={()=>void decide('approve')}>Approve connection</Button><Button className="min-h-[44px]" variant="outline" disabled={busy} onClick={()=>void decide('deny')}>Deny connection</Button></div>
      </>:<form className="space-y-3" onSubmit={event=>{event.preventDefault();void review();}}>
        <label className="block text-sm">Verification code<Input name="verification-code" spellCheck={false} autoComplete="off" autoCapitalize="characters" maxLength={32} required value={code} onChange={event=>setCode(event.target.value)} className="mt-2 font-mono"/></label>
        <Button className="min-h-[44px]" type="submit" disabled={busy}>{busy?'Checking…':'Review request'}</Button>
      </form>}
      <a href="/" className="inline-block min-h-[44px] py-2 text-sm underline">Return to Strata</a>
    </div>
  </main>;
}
