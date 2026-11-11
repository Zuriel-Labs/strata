import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchConnectionCatalog, type ConnectionCatalog, type KeyInput, type ServiceAccount } from '../services/connections';
import { Button } from './ui/button';
import { Input } from './ui/input';

const stages = ['Name', 'Resources', 'Permissions', 'Expiration', 'Review'];
export const optionClass = 'mt-2 min-h-11 w-full rounded-md border bg-background px-3 text-sm';
const choose = (values:string[], id:string) => values.includes(id) ? values.filter(value=>value!==id) : [...values,id];

export function KeyWizard({account,service=false,submit,onDone,onBusy,links}:{
  account?:ServiceAccount; service?:boolean; submit:(input:KeyInput)=>Promise<{token:string}>;
  onDone:()=>void; onBusy?:(busy:boolean)=>void; links?:ReactNode;
}) {
  const [step,setStep]=useState(account?1:0);
  const [name,setName]=useState(account?.name??'');
  const [resources,setResources]=useState(account?.resources??[]);
  const [actions,setActions]=useState(account?.actions??[]);
  const [preset,setPreset]=useState('');
  const [days,setDays]=useState(7);
  const [query,setQuery]=useState('');
  const [group,setGroup]=useState('');
  const [catalog,setCatalog]=useState<ConnectionCatalog|null>(null);
  const [loadAttempt,setLoadAttempt]=useState(0);
  const [loadError,setLoadError]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [token,setToken]=useState('');
  const [copyStatus,setCopyStatus]=useState('');
  const heading=useRef<HTMLHeadingElement>(null);
  const keyField=useRef<HTMLTextAreaElement>(null);
  const pending=useRef(false);
  useEffect(()=>{
    let live=true;
    void fetchConnectionCatalog(service,account?.id).then(result=>{if(live)setCatalog(result)}).catch(()=>{if(live)setLoadError(true)});
    return()=>{live=false};
  },[service,account?.id,loadAttempt]);
  useEffect(()=>{heading.current?.focus()},[step,token]);
  const available=catalog?.resources.filter(item=>resources.includes(item.id))??[];
  const eligible=catalog?.actions.filter(action=>available.length>0&&available.every(item=>item.actions.includes(action.id)))??[];
  const selected=eligible.filter(action=>actions.includes(action.id));
  const levels=catalog?.levels??[];
  const groups=levels.filter(level=>eligible.some(item=>item.level===level));
  const filtered=eligible.filter(item=>(!group||group===item.level)&&item.label.toLowerCase().includes(query.trim().toLowerCase()));
  const allShownSelected=filtered.length>0&&filtered.every(item=>actions.includes(item.id));
  const ready=name.trim()&&resources.length>0&&resources.length===available.length&&selected.length>0&&selected.length===actions.length;
  function go(next:number){setError('');setQuery('');setGroup('');setStep(next)}
  function toggleResource(id:string){
    const next=resources.includes(id)?resources.filter(item=>item!==id):id==='account'||id==='platform'?[id]:[...resources.filter(item=>item!=='account'&&item!=='platform'),id];
    setResources(next);
    setPreset('');
    setActions(previous=>previous.filter(action=>next.length>0&&next.every(value=>catalog?.resources.find(item=>item.id===value)?.actions.includes(action))));
  }
  function applyPreset(level:string){
    setPreset(level);
    if(!level)return;
    const included=level==='Account'?['Account']:levels.slice(0,levels.indexOf(level)+1).filter(item=>item!=='Account');
    setActions(eligible.filter(item=>included.includes(item.level)).map(item=>item.id));
    setQuery('');setGroup('');
  }
  function toggleShown(){
    const shown=filtered.map(item=>item.id);
    setPreset('');
    setActions(previous=>allShownSelected?previous.filter(id=>!shown.includes(id)):[...new Set([...previous,...shown])]);
  }
  async function save(){
    if(!ready||pending.current)return;
    pending.current=true;setBusy(true);onBusy?.(true);setError('');
    try{setToken((await submit({name:name.trim(),resources,actions,expiresInDays:days,confirmation:'CREATE'})).token)}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not create the key.')}
    finally{pending.current=false;setBusy(false);onBusy?.(false)}
  }
  async function copyKey(){
    try{
      await navigator.clipboard.writeText(token);
      setCopyStatus('API key copied.');
    }catch{
      keyField.current?.focus();
      keyField.current?.select();
      setCopyStatus('Clipboard unavailable. Copy the selected key manually.');
    }
  }
  if(token)return <section className="space-y-4" aria-labelledby="new-key-title">
    <h3 id="new-key-title" ref={heading} tabIndex={-1} className="text-lg font-semibold">Save your API key</h3>
    <p className="text-sm">Shown once. Store it in a credential manager.</p>
    <label className="block text-sm">New API key<textarea ref={keyField} name="new-api-key" autoComplete="off" spellCheck={false} className="mt-2 w-full rounded-md border bg-background p-2 font-mono text-xs" readOnly value={token} rows={3}/></label>
    <div className="space-y-2">
      <Button type="button" variant="outline" className="min-h-11 w-full border-[color:var(--border-light)] bg-[var(--bg-active)] font-semibold hover:bg-[var(--bg-hover)]" onClick={()=>void copyKey()}>Copy API key</Button>
      <p role="status" className={copyStatus?'text-sm':'sr-only'}>{copyStatus}</p>
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={onDone}>I saved the key</Button>
    </div>
  </section>;
  const canContinue=step===0?Boolean(name.trim()):step===1?resources.length>0&&resources.length===available.length:step===2?selected.length>0&&selected.length===actions.length:step===3?Boolean(catalog):Boolean(ready);
  const first=account?1:0;
  return <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(!canContinue||busy)return;if(step===4)void save();else go(step+1)}}>
    <div><p className="text-xs" style={{color:'var(--text-muted)'}}>Step {step-first+1} of {stages.length-first}</p><h3 ref={heading} tabIndex={-1} className="text-lg font-semibold">{stages[step]}</h3></div>
    {step===0&&<label className="block text-sm">{service?'Service account name':'Key name'}<Input name="connection-name" className="mt-2 min-h-11" placeholder={service?'e.g. Board assistant':'e.g. Weekly report'} autoComplete="off" required maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label>}
    {step===1&&<div className="space-y-2">
      {!catalog&&!loadError&&<p role="status">Loading resources…</p>}
      {loadError&&<div role="alert">Could not load resources. <Button type="button" variant="outline" onClick={()=>{setLoadError(false);setLoadAttempt(value=>value+1)}}>Retry</Button></div>}
      {catalog&&<><label className="block text-sm">Find a resource<Input className="mt-2 min-h-11" type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
        <p className="text-xs" role="status">{resources.length} selected</p>
        <fieldset className="max-h-52 overflow-y-auto rounded-md border px-2"><legend className="sr-only">Resources</legend>
          {catalog.resources.filter(item=>item.label.toLowerCase().includes(query.trim().toLowerCase())).map(item=><label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-2 border-b px-2 text-sm last:border-0"><input type="checkbox" checked={resources.includes(item.id)} onChange={()=>toggleResource(item.id)}/><span className="break-words">{item.label}</span></label>)}
          {!catalog.resources.some(item=>item.label.toLowerCase().includes(query.trim().toLowerCase()))&&<p className="p-2 text-sm">No matching resources.</p>}
        </fieldset>
        {resources.length!==available.length&&<Button variant="outline" type="button" onClick={()=>{setResources(available.map(item=>item.id));setActions([]);setPreset('')}}>Clear unavailable resources</Button>}</>}
    </div>}
    {step===2&&<div className="space-y-2">
      {groups.length>0&&<label className="block text-sm">Role preset<select className={optionClass} value={preset} onChange={event=>applyPreset(event.target.value)}><option value="">Custom</option>{groups.map(level=><option key={level}>{level}</option>)}</select></label>}
      <label className="block text-sm">Find a permission<Input className="mt-2 min-h-11" type="search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      {groups.length>1&&<label className="block text-sm">Access level<select className={optionClass} value={group} onChange={event=>setGroup(event.target.value)}><option value="">All levels</option>{groups.map(level=><option key={level}>{level}</option>)}</select></label>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" role="status">{selected.length} selected</p>
        <Button className="min-h-11" type="button" variant="outline" disabled={!filtered.length} onClick={toggleShown}>{allShownSelected?'Clear shown':'Select all shown'}</Button>
      </div>
      <fieldset className="max-h-56 overflow-y-auto rounded-md border px-2"><legend className="sr-only">Permissions</legend>
        {filtered.map(item=><label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-2 border-b px-2 text-sm last:border-0"><input type="checkbox" checked={actions.includes(item.id)} onChange={()=>{setPreset('');setActions(previous=>choose(previous,item.id))}}/><span>{item.label}</span></label>)}
        {!filtered.length&&<p className="p-2 text-sm">No matching permissions.</p>}
      </fieldset>
      {actions.length!==selected.length&&<Button variant="outline" type="button" onClick={()=>{setPreset('');setActions(selected.map(item=>item.id))}}>Clear unavailable permissions</Button>}
    </div>}
    {step===3&&<label className="block text-sm">Expires after<select name="expiry-days" className={optionClass} value={days} onChange={event=>setDays(Number(event.target.value))}>{catalog?.expiries.map(day=><option key={day} value={day}>{day} {day===1?'day':'days'}</option>)}</select></label>}
    {step===4&&<dl className="max-h-56 space-y-3 overflow-y-auto rounded-md border p-3 text-sm">
      <div><dt className="font-semibold">Name</dt><dd className="break-words">{name.trim()}</dd></div>
      <div><dt className="font-semibold">Resources</dt><dd>{available.map(item=>item.label).join(', ')}</dd></div>
      <div><dt className="font-semibold">Permissions</dt><dd><ul className="list-inside list-disc">{selected.map(item=><li key={item.id}>{item.label}</li>)}</ul></dd></div>
      <div><dt className="font-semibold">Expiration</dt><dd>{days} {days===1?'day':'days'}</dd></div>
    </dl>}
    {step===4&&account?.key&&<p className="text-sm">The previous key stops working when the new key is created.</p>}
    {error&&<p role="alert" className="text-sm">{error}</p>}
    <div className="flex gap-2">
      {step>first&&<Button className="min-h-11" type="button" variant="outline" disabled={busy} onClick={()=>go(step-1)}>Back</Button>}
      <Button className="min-h-11 flex-1" disabled={!canContinue||busy} type="submit">{step===4?(busy?'Creating…':account?(account.key?'Replace API key':'Create API key'):service?'Create service account':'Create API key'):'Continue'}</Button>
    </div>
    {step===first&&links}
  </form>;
}
