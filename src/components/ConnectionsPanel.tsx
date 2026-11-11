import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { CONNECTION_SCOPES, createConnection, fetchConnections, registerClient, revokeConnection, type Connection, type ConnectionScope } from '../services/connections';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ConnectionsPanel({onPendingChange}:{onPendingChange?:(pending:boolean)=>void}) {
  const {session} = useAuth();
  const [items,setItems] = useState<Connection[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [name,setName] = useState('');
  const [scopes,setScopes] = useState<ConnectionScope[]>(['content:read']);
  const [resources,setResources] = useState<string[]>([]);
  const [days,setDays] = useState(7);
  const [approved,setApproved] = useState(false);
  const [token,setToken] = useState<string|null>(null);
  const [revokeId,setRevokeId] = useState<string|null>(null);
  const [clientName,setClientName] = useState('');
  const [redirectUri,setRedirectUri] = useState('');
  const [clientId,setClientId] = useState<string|null>(null);
  useEffect(()=>{
    let active=true;
    void fetchConnections().then(result=>{if(active)setItems(result.items);}).catch(failure=>{if(active)setError(failure instanceof Error?failure.message:'Unable to load connections.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  async function reload(){setLoading(true);setError(null);try{setItems((await fetchConnections()).items);}catch(failure){setError(failure instanceof Error?failure.message:'Unable to load connections.');}finally{setLoading(false);}}
  async function perform(action:()=>Promise<void>){setBusy(true);onPendingChange?.(true);setError(null);try{await action();}catch(failure){setError(failure instanceof Error?failure.message:'Unable to save connection.');}finally{setBusy(false);onPendingChange?.(false);}}
  function toggleResource(value:string){setApproved(false);setResources(previous=>previous.includes(value)?previous.filter(item=>item!==value):value==='account'?['account']:[...previous.filter(item=>item!=='account'),value]);}
  const resourceOptions = [
    {value:'account',label:'My account only (account permissions)'},
    ...(session?.permissions?.isSystemAdmin?[{value:'platform',label:'Entire platform (System Admin)'}]:[]),
    ...(session?.appState.workspaces??[]).map(item=>({value:`workspace:${item.id}`,label:`Workspace: ${item.name}`})),
    ...(session?.appState.boards??[]).map(item=>({value:`board:${item.id}`,label:item.title})),
  ];
  const resourceLabel = (value:string)=>resourceOptions.find(item=>item.value===value)?.label??value;
  return <section className="space-y-5 p-4 sm:p-5" aria-label="API connections">
    <p className="text-sm" style={{color:'var(--text-secondary)'}}>Approve only the access your client needs. Your current Strata permissions always apply.</p>
    <a className="inline-block min-h-[44px] py-2 underline" href="/api/docs" target="_blank" rel="noreferrer">API documentation and agent setup</a>
    {error&&<div role="alert" className="rounded-xl border p-3"><p>{error}</p><Button variant="outline" onClick={()=>void reload()} disabled={busy}>Retry connections</Button></div>}
    {token&&<div className="space-y-3 rounded-xl border p-3">
      <p role="status" className="font-semibold">Save your new key now</p><p className="text-sm">Shown once. Store it in your credential manager. Never put it in prompts, URLs, logs or source code.</p>
      <label className="block text-sm">New API key<textarea name="new-api-key" autoComplete="off" spellCheck={false} className="mt-2 w-full break-all rounded border p-2 font-mono text-xs" style={{background:'var(--input-bg)'}} readOnly value={token} rows={4}/></label>
      <Button variant="outline" onClick={()=>setToken(null)}>I saved the key</Button>
    </div>}
    <form onSubmit={event=>{event.preventDefault();if(!approved||busy)return;void perform(async()=>{const created=await createConnection({name,scopes,resources,expiresInDays:days,confirmation:'CREATE'});setToken(created.token);setName('');setApproved(false);setItems((await fetchConnections()).items);});}} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4"><legend className="text-base font-semibold">Create a personal API key</legend>
        <label className="block text-sm">Connection name<Input name="connection-name" autoComplete="off" maxLength={100} required value={name} onChange={event=>{setName(event.target.value);setApproved(false);}} className="mt-2"/></label>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Permissions</legend>
          {(Object.entries(CONNECTION_SCOPES) as [ConnectionScope,string][]).map(([scope,label])=><label key={scope} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={scopes.includes(scope)} onChange={()=>{setApproved(false);setScopes(previous=>previous.includes(scope)?previous.filter(item=>item!==scope):[...previous,scope]);}}/>{label}</label>)}
        </fieldset>
        <fieldset><legend className="mb-2 text-sm font-semibold">Resources</legend><div className="max-h-52 overflow-y-auto rounded-xl border p-2">
          {resourceOptions.map(item=><label key={item.value} className="flex min-h-[44px] cursor-pointer items-center gap-3 break-words text-sm"><input type="checkbox" checked={resources.includes(item.value)} onChange={()=>toggleResource(item.value)}/><span className="min-w-0">{item.label}</span></label>)}
        </div></fieldset>
        <label className="block text-sm">Expires after (days)<Input name="expiry-days" type="number" min={1} max={90} required value={days} onChange={event=>{setDays(Number(event.target.value));setApproved(false);}} className="mt-2"/></label>
        <label className="flex min-h-[44px] items-start gap-3 text-sm"><input type="checkbox" checked={approved} onChange={event=>setApproved(event.target.checked)} className="mt-1"/>I approve these permissions and resources for this connection.</label>
        <Button type="submit" className="min-h-[44px] w-full" disabled={busy||!approved||!name.trim()||!scopes.length||!resources.length||Boolean(token)}>Create API key</Button>
      </fieldset>
    </form>
    <section aria-label="Approved connections" className="space-y-3"><h3 className="text-base font-semibold">Approved connections</h3>
      {loading?<p role="status">Loading connections…</p>:items.length===0?<p className="text-sm">No approved connections.</p>:<ul className="max-h-96 space-y-3 overflow-y-auto">
        {items.map(item=>{const inactive=Boolean(item.revokedAt)||Date.parse(item.expiresAt)<=Date.now();return <li key={item.id} style={{contentVisibility:'auto',containIntrinsicSize:'auto 280px'}} className="space-y-2 rounded-xl border p-3 text-sm">
          <p className="break-words font-semibold">{item.name}</p><p>{inactive?item.revokedAt?'Revoked':'Expired':item.kind==='pat'?'API key':'Agent connection'}</p>
          <p className="break-words">Permissions: {item.scopes.map(scope=>CONNECTION_SCOPES[scope]).join(', ')}</p>
          <p className="break-words">Resources: {item.resources.map(resourceLabel).join(', ')}</p>
          <p>Expires: {new Date(item.expiresAt).toLocaleString()}</p><p>Last used: {item.lastUsedAt?new Date(item.lastUsedAt).toLocaleString():'Never'}</p>
          {!inactive&&(revokeId===item.id?<div className="space-y-2"><p>Revoke {item.name}? Its access stops immediately.</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={busy} onClick={()=>void perform(async()=>{await revokeConnection(item.id);setRevokeId(null);setItems((await fetchConnections()).items);})}>Confirm revocation</Button><Button variant="outline" disabled={busy} onClick={()=>setRevokeId(null)}>Cancel revocation</Button></div></div>:<Button variant="outline" disabled={busy} onClick={()=>setRevokeId(item.id)}>Revoke {item.name}</Button>)}
        </li>;})}
      </ul>}
    </section>
    <details className="rounded-xl border p-3"><summary className="min-h-[44px] cursor-pointer py-2 font-semibold">Register an interactive client</summary>
      <p className="mb-3 text-sm">For Authorization Code with PKCE. Use an exact HTTPS or loopback callback. Public clients need no shared secret.</p>
      <form className="space-y-3" onSubmit={event=>{event.preventDefault();void perform(async()=>{const result=await registerClient(clientName,[redirectUri]);setClientId(result.client.id);});}}>
        <label className="block text-sm">Client name<Input name="client-name" autoComplete="off" required maxLength={100} value={clientName} onChange={event=>setClientName(event.target.value)}/></label>
        <label className="block text-sm">Redirect URI<Input name="redirect-uri" spellCheck={false} autoComplete="off" required type="url" value={redirectUri} onChange={event=>setRedirectUri(event.target.value)}/></label>
        <Button disabled={busy} type="submit">Register client</Button>
      </form>
      {clientId&&<p role="status" className="mt-3 break-all text-sm">Client ID: <code>{clientId}</code></p>}
    </details>
  </section>;
}
