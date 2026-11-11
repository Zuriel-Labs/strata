import { useEffect, useState } from 'react';
import { CONNECTION_SCOPES, createConnection, fetchConnections, fetchConnectionCatalog, registerClient, revokeConnection, type Connection, type ConnectionCatalog } from '../services/connections';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { KeyWizard } from './KeyWizard';

export function ConnectionsPanel({onPendingChange,onKeys,onApps}:{
  onPendingChange:(pending:boolean)=>void;onKeys:()=>void;onApps:()=>void;
}) {
  return <section className="p-4 sm:p-5" aria-label="API Token Generator">
    <KeyWizard submit={createConnection} onDone={onKeys} onBusy={onPendingChange} links={<nav aria-label="API access" className="flex flex-wrap justify-center gap-1 border-t pt-2">
      <Button type="button" variant="ghost" onClick={onKeys}>Manage API keys</Button>
      <Button type="button" variant="ghost" onClick={onApps}>Approved Apps</Button>
    </nav>}/>
  </section>;
}

export function ConnectionList({kind,onCreate}:{kind:'keys'|'apps';onCreate:()=>void}) {
  const [items,setItems]=useState<Connection[]|null>(null);
  const [catalog,setCatalog]=useState<ConnectionCatalog|null>(null);
  const [error,setError]=useState('');
  const [revokeId,setRevokeId]=useState('');
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  const [registration,setRegistration]=useState(false);
  useEffect(()=>{
    let live=true;
    void fetchConnections().then(result=>{if(live)setItems(result.items)}).catch(()=>{if(live)setError('Could not load access.')});
    void fetchConnectionCatalog().then(result=>{if(live)setCatalog(result)}).catch(()=>{});
    return()=>{live=false};
  },[retry]);
  async function revoke(id:string) {
    setBusy(true);setError('');
    try{await revokeConnection(id);setItems(list=>list?.map(item=>item.id===id?{...item,revokedAt:new Date().toISOString()}:item)??null);setRevokeId('')}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not revoke access.')}
    finally{setBusy(false)}
  }
  if(registration)return <RegisterApp onBack={()=>setRegistration(false)}/>;
  const visible=items?.filter(item=>kind==='keys'?item.kind==='pat':item.kind!=='pat');
  return <section className="space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button className="min-h-11" onClick={kind==='keys'?onCreate:()=>setRegistration(true)}>{kind==='keys'?'Create API key':'Register an app'}</Button>
      <a className="inline-flex min-h-11 items-center text-sm underline" href="/api/docs" target="_blank" rel="noreferrer">API guide</a>
    </div>
    {error&&<div role="alert" className="text-sm">{error}{!items&&<Button variant="ghost" onClick={()=>{setError('');setRetry(value=>value+1)}}>Retry</Button>}</div>}
    {!items&&!error&&<p role="status">Loading…</p>}
    {visible?.length===0&&<p className="text-sm">{kind==='keys'?'No API keys yet.':'No approved apps yet.'}</p>}
    {!!visible?.length&&<ul className="space-y-2">{visible.map(item=>{
      const state=item.revokedAt?'Revoked':Date.parse(item.expiresAt)<=Date.now()?'Expired':'Active';
      return <li key={item.id} className="space-y-2 rounded-xl border p-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="break-all font-semibold">{item.name}</h3><span>{state}</span></div>
        <details><summary className="flex min-h-11 cursor-pointer items-center">Access details</summary>
          <dl className="space-y-1">
            <div><dt className="font-semibold">Permissions</dt><dd>{(item.actions?.map(id=>catalog?.actions.find(action=>action.id===id)?.label??id)??item.scopes.map(scope=>CONNECTION_SCOPES[scope])).join(', ')}</dd></div>
            <div><dt className="font-semibold">Resources</dt><dd>{item.resources.map(id=>catalog?.resources.find(resource=>resource.id===id)?.label??id).join(', ')}</dd></div>
            <div><dt className="font-semibold">Expires</dt><dd>{new Date(item.expiresAt).toLocaleString()}</dd></div>
            <div><dt className="font-semibold">Last used</dt><dd>{item.lastUsedAt?new Date(item.lastUsedAt).toLocaleString():'Never'}</dd></div>
          </dl>
        </details>
        {state==='Active'&&(revokeId===item.id?<div className="space-y-2"><p>Revoke access for {item.name}?</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={busy} onClick={()=>void revoke(item.id)}>Confirm revocation</Button><Button variant="outline" disabled={busy} onClick={()=>setRevokeId('')}>Cancel</Button></div></div>:<Button className="min-h-11" variant="outline" disabled={busy} onClick={()=>setRevokeId(item.id)}>Revoke {item.name}</Button>)}
      </li>;
    })}</ul>}
  </section>;
}

function RegisterApp({onBack}:{onBack:()=>void}){
  const [name,setName]=useState('');
  const [redirect,setRedirect]=useState('');
  const [id,setId]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  return <form className="space-y-4 p-4 sm:p-5" onSubmit={event=>{
    event.preventDefault();if(busy)return;
    setBusy(true);setError('');
    void registerClient(name,[redirect]).then(result=>setId(result.client.id)).catch(cause=>setError(cause instanceof Error?cause.message:'Could not register the app.')).finally(()=>setBusy(false));
  }}>
    <h3 className="font-semibold">Register an interactive app</h3>
    {id?<p role="status" className="break-all text-sm">Client ID: <code>{id}</code></p>:<>
      <label className="block text-sm">App name<Input required autoComplete="off" maxLength={100} value={name} onChange={event=>setName(event.target.value)} className="mt-2 min-h-11"/></label>
      <label className="block text-sm">Callback URL<Input required type="url" spellCheck={false} autoComplete="off" value={redirect} onChange={event=>setRedirect(event.target.value)} className="mt-2 min-h-11"/></label>
    </>}
    {error&&<p role="alert" className="text-sm">{error}</p>}
    <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onBack}>Back</Button>{!id&&<Button type="submit" disabled={busy}>Register app</Button>}</div>
  </form>;
}
