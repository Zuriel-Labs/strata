import { useEffect, useState } from 'react';
import { createServiceKey, fetchConnectionCatalog, fetchServiceAccounts, revokeServiceKey, setServiceAssignments, transferServiceAccount, type ConnectionCatalog, type ServiceAccount } from '../services/connections';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { KeyWizard } from './KeyWizard';

export function ServiceAccountsPanel(){
  const [accounts,setAccounts]=useState<ServiceAccount[]|null>(null);
  const [wizard,setWizard]=useState<ServiceAccount|'new'|null>(null);
  const [assigning,setAssigning]=useState<ServiceAccount|null>(null);
  const [change,setChange]=useState<{account:ServiceAccount;action:'revoke'|'transfer'}|null>(null);
  const [username,setUsername]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let live=true;
    void fetchServiceAccounts().then(result=>{if(live)setAccounts(result.items)}).catch(()=>{if(live)setError('Could not load service accounts.')});
    return()=>{live=false};
  },[retry]);
  async function saveChange(){
    if(!change||busy)return;
    setBusy(true);setError('');
    try{
      const {account,action}=change;
      if(action==='transfer'){
        await transferServiceAccount(account.id,username.trim());
        setAccounts(list=>list?.filter(item=>item.id!==account.id)??null);
      }else{
        await revokeServiceKey(account.id);
        setAccounts(list=>list?.map(item=>item.id===account.id&&item.key?{...item,key:{...item.key,revokedAt:new Date().toISOString()}}:item)??null);
      }
      setChange(null);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not save the change.')}
    finally{setBusy(false)}
  }
  if(assigning)return <ServiceAssignments account={assigning} onClose={()=>setAssigning(null)} onSaved={updated=>{setAccounts(list=>list?.map(account=>account.id===updated.id?updated:account)??null);setAssigning(null)}}/>;
  if(wizard){
    const account=wizard==='new'?undefined:wizard;
    return <section className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{account?(account.key?'Replace service key':'Create service key'):'New service account'}</h3><Button disabled={busy} variant="ghost" onClick={()=>setWizard(null)}>Cancel</Button></div>
      <KeyWizard service account={account} submit={input=>createServiceKey(input,account?.id)} onBusy={setBusy} onDone={()=>{setWizard(null);setRetry(value=>value+1)}}/>
    </section>;
  }
  if(change)return <form className="mx-auto max-w-md space-y-4" onSubmit={event=>{event.preventDefault();void saveChange()}}>
    <h3 className="font-semibold">{change.action==='transfer'?'Transfer ownership':'Revoke key'}: {change.account.name}</h3>
    {change.action==='transfer'&&<label className="block text-sm">New owner’s username<Input className="mt-2 min-h-11" maxLength={100} required value={username} onChange={event=>setUsername(event.target.value)}/></label>}
    <p className="text-sm">{change.action==='transfer'?'The old key stops working. The new owner reviews access before creating a key.':'The service account stays, but this key stops working immediately.'}</p>
    {error&&<p role="alert" className="text-sm">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={()=>{setChange(null);setError('')}}>Cancel</Button><Button type="submit" variant="destructive" disabled={busy||change.action==='transfer'&&!username.trim()}>{change.action==='transfer'?'Confirm transfer':'Confirm revocation'}</Button></div>
  </form>;
  return <section className="mx-auto max-w-2xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Service Accounts</h3><Button variant="outline" className="min-h-11 border-[color:var(--border-light)] bg-[var(--bg-active)] font-semibold hover:bg-[var(--bg-hover)]" onClick={()=>setWizard('new')}>New service account</Button></header>
    {error&&<div role="alert" className="text-sm">{error} <Button variant="ghost" onClick={()=>{setError('');setRetry(value=>value+1)}}>Retry</Button></div>}
    {!accounts&&!error&&<p role="status">Loading service accounts…</p>}
    {accounts?.length===0&&<p className="text-sm">No service accounts yet.</p>}
    {!!accounts?.length&&<ul className="space-y-2">{accounts.map(account=>{
      const active=account.key&&!account.key.revokedAt&&Date.parse(account.key.expiresAt)>Date.now();
      return <li key={account.id} className="space-y-2 rounded-xl border p-3 text-sm">
        <h4 className="break-all font-semibold">{account.name}</h4>
        <p className="break-all">@{account.username} <span className="text-xs">· Service account</span></p>
        <p>{active?'Active key':account.key?.revokedAt?'Key revoked':account.key?'Key expired':'No key issued'}</p>
        {account.key&&<p>Expires {new Date(account.key.expiresAt).toLocaleDateString()} · Last used {account.key.lastUsedAt?new Date(account.key.lastUsedAt).toLocaleString():'never'}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>setWizard(account)}>{active?'Replace key':'Create key'}</Button>
          <Button variant="outline" onClick={()=>setAssigning(account)}>Edit assignments</Button>
          {active&&<Button variant="outline" onClick={()=>setChange({account,action:'revoke'})}>Revoke key</Button>}
          <Button variant="outline" onClick={()=>{setUsername('');setChange({account,action:'transfer'})}}>Transfer ownership</Button>
        </div>
      </li>;
    })}</ul>}
  </section>;
}

function ServiceAssignments({account,onClose,onSaved}:{account:ServiceAccount;onClose:()=>void;onSaved:(account:ServiceAccount)=>void}){
  const [resources,setResources]=useState(account.assignments);
  const [options,setOptions]=useState<ConnectionCatalog['resources']|null>(null);
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    void fetchConnectionCatalog(true).then(result=>{if(active)setOptions(result.resources)}).catch(()=>{if(active)setError('Could not load assignments. Close and try again.')});
    return()=>{active=false};
  },[]);
  const choices=options?.filter(item=>item.label.toLowerCase().includes(search.trim().toLowerCase()))??[];
  const unavailable=resources.filter(id=>options&&!options.some(item=>item.id===id));
  function toggle(id:string){
    setResources(current=>current.includes(id)?current.filter(value=>value!==id):id==='platform'?[id]:[...current.filter(value=>value!=='platform'),id]);
  }
  async function save(){
    if(busy||!options||unavailable.length)return;
    setBusy(true);setError('');
    try{onSaved((await setServiceAssignments(account.id,resources)).account)}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not save assignments.');setBusy(false)}
  }
  return <form className="mx-auto max-w-md space-y-4" onSubmit={event=>{event.preventDefault();void save()}}>
    <h3 className="font-semibold">Edit assignments: {account.name}</h3>
    <p className="text-sm">Choose where this account can administer. Add it as a member or observer under Board Members.</p>
    <label className="block text-sm">Find a workspace or board<Input type="search" className="mt-2 min-h-11" value={search} onChange={event=>setSearch(event.target.value)}/></label>
    {!options&&!error&&<p role="status">Loading assignments…</p>}
    {options&&<fieldset disabled={busy} className="max-h-52 overflow-y-auto rounded-md border px-2"><legend className="sr-only">Administrative assignments</legend>
      {choices.map(item=><label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm"><input type="checkbox" checked={resources.includes(item.id)} onChange={()=>toggle(item.id)}/>{item.label}</label>)}
      {!choices.length&&<p className="p-2 text-sm">No matching resources.</p>}
    </fieldset>}
    {!!unavailable.length&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setResources(current=>current.filter(id=>!unavailable.includes(id)))}>Remove unavailable assignments</Button>}
    {account.key&&!account.key.revokedAt&&<p className="text-sm">Changing assignments revokes the current key.</p>}
    {error&&<p role="alert" className="text-sm">{error}</p>}
    <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy||!options||!!unavailable.length}>Save assignments</Button></div>
  </form>;
}
