import { useEffect, useState } from 'react';
import { createServiceKey, fetchServiceAccounts, revokeServiceKey, transferServiceAccount, type ServiceAccount } from '../services/connections';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { KeyWizard } from './KeyWizard';

export function ServiceAccountsPanel(){
  const [accounts,setAccounts]=useState<ServiceAccount[]|null>(null);
  const [wizard,setWizard]=useState<ServiceAccount|'new'|null>(null);
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
    <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Service Accounts</h3><Button className="min-h-11" onClick={()=>setWizard('new')}>New service account</Button></header>
    {error&&<div role="alert" className="text-sm">{error} <Button variant="ghost" onClick={()=>{setError('');setRetry(value=>value+1)}}>Retry</Button></div>}
    {!accounts&&!error&&<p role="status">Loading service accounts…</p>}
    {accounts?.length===0&&<p className="text-sm">No service accounts yet.</p>}
    {!!accounts?.length&&<ul className="space-y-2">{accounts.map(account=>{
      const active=account.key&&!account.key.revokedAt&&Date.parse(account.key.expiresAt)>Date.now();
      return <li key={account.id} className="space-y-2 rounded-xl border p-3 text-sm">
        <h4 className="break-all font-semibold">{account.name}</h4>
        <p>{active?'Active key':account.key?.revokedAt?'Key revoked':account.key?'Key expired':'No key issued'}</p>
        {account.key&&<p>Expires {new Date(account.key.expiresAt).toLocaleDateString()} · Last used {account.key.lastUsedAt?new Date(account.key.lastUsedAt).toLocaleString():'never'}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>setWizard(account)}>{active?'Replace key':'Create key'}</Button>
          {active&&<Button variant="outline" onClick={()=>setChange({account,action:'revoke'})}>Revoke key</Button>}
          <Button variant="outline" onClick={()=>{setUsername('');setChange({account,action:'transfer'})}}>Transfer ownership</Button>
        </div>
      </li>;
    })}</ul>}
  </section>;
}
