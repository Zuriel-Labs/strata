import { render,screen,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConnectionList, ConnectionsPanel } from './ConnectionsPanel';

const expiries=[1,7,30,60,90,180];
const catalog={expiries,levels:['Account','Viewer','Basic User','Board Admin','Workspace Admin','System Admin'],
  resources:[{id:'board:b1',label:'Team board',actions:['GET /cards','POST /cards','card:title']},
    {id:'platform',label:'Entire platform',actions:['GET /cards','POST /cards','card:title','card:archive','PATCH /workspaces/:id','GET /admin/audit','GET /me']},
    {id:'account',label:'My account',actions:['GET /me']}],
  actions:[{id:'GET /cards',label:'List cards',level:'Viewer'},{id:'POST /cards',label:'Create card',level:'Basic User'},
    {id:'card:title',label:'Rename card',level:'Basic User'},{id:'card:archive',label:'Archive card',level:'Board Admin'},
    {id:'PATCH /workspaces/:id',label:'Rename workspace',level:'Workspace Admin'},{id:'GET /admin/audit',label:'Read audit log',level:'System Admin'},
    {id:'GET /me',label:'Read own account',level:'Account'}]};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const next=()=>screen.getByRole('button',{name:'Continue'});
function Flow(){
  const [view,setView]=useState<'wizard'|'keys'|'apps'>('wizard');
  return view==='wizard'?<ConnectionsPanel onPendingChange={()=>{}} onKeys={()=>setView('keys')} onApps={()=>setView('apps')}/>:<ConnectionList kind={view} onCreate={()=>setView('wizard')}/>;
}
afterEach(()=>vi.unstubAllGlobals());

it('walks one step at a time, keeps choices on Back, and forgets the displayed key',async()=>{
  const calls:RequestInit[]=[];
  const items=[{id:'g1',name:'First key',kind:'pat',scopes:['content:read'],resources:['board:b1'],expiresAt:'2099-01-01',lastUsedAt:null,revokedAt:null},
    {id:'g2',name:'Build script',kind:'pat',actions:['GET /cards'],resources:['board:b1'],expiresAt:'2099-01-01',lastUsedAt:null,revokedAt:null},
    {id:'g3',name:'Approved agent',kind:'device',scopes:['content:read'],resources:['board:b1'],expiresAt:'2099-01-01',lastUsedAt:null,revokedAt:null}];
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
    if(init?.method==='POST'){calls.push(init);return json({token:'synthetic-test-token',connection:{id:'g2'}},201);}
    return url.includes('/catalog')?json(catalog):json({items});
  }));
  const user=userEvent.setup();render(<Flow/>);
  expect(next()).toBeDisabled();
  expect(screen.queryByRole('group',{name:'Permissions'})).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Key name'),'Build script');
  await user.click(next());
  expect(screen.getByRole('heading',{name:'Resources'})).toHaveFocus();
  await user.click(await screen.findByLabelText('Team board'));
  await user.click(next());
  expect(screen.queryByLabelText('Read own account')).not.toBeInTheDocument();
  expect(next()).toBeDisabled();
  await user.click(screen.getByLabelText('List cards'));
  await user.click(next());
  const expiry=screen.getByLabelText('Expires after');
  expect(within(expiry).getAllByRole('option').map(option=>Number((option as HTMLOptionElement).value))).toEqual(expiries);
  await user.selectOptions(expiry,'180');
  await user.click(screen.getByRole('button',{name:'Back'}));
  expect(screen.getByLabelText('List cards')).toBeChecked();
  await user.click(next());
  expect(screen.getByLabelText('Expires after')).toHaveValue('180');
  await user.click(next());
  expect(screen.getByRole('heading',{name:'Review'})).toHaveFocus();
  expect(calls).toHaveLength(0);
  await user.click(screen.getByRole('button',{name:'Create API key'}));
  const keyField=await screen.findByLabelText<HTMLTextAreaElement>('New API key');
  expect(keyField).toHaveValue('synthetic-test-token');
  const copy=vi.spyOn(navigator.clipboard,'writeText').mockRejectedValueOnce(new Error('Clipboard blocked'));
  const copyButton=screen.getByRole('button',{name:'Copy API key'});
  await user.click(copyButton);
  expect(screen.getByRole('status')).toHaveTextContent('Copy the selected key manually.');
  expect(keyField).toHaveFocus();
  expect([keyField.selectionStart,keyField.selectionEnd]).toEqual([0,keyField.value.length]);
  await user.click(copyButton);
  expect(copy).toHaveBeenLastCalledWith('synthetic-test-token');
  expect(screen.getByRole('status')).toHaveTextContent('API key copied.');
  copy.mockRestore();
  expect(JSON.parse(String(calls[0].body))).toEqual({name:'Build script',actions:['GET /cards'],resources:['board:b1'],expiresInDays:180,confirmation:'CREATE'});
  expect(calls[0].headers).toMatchObject({'X-Strata-Intent':'connections'});
  await user.click(screen.getByRole('button',{name:'I saved the key'}));
  expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Copy API key'})).not.toBeInTheDocument();
  expect(await screen.findByText('First key')).toBeVisible();
  expect(screen.getByText('Build script')).toBeVisible();
  expect(screen.queryByText('Approved agent')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Create API key'}));
  await user.click(screen.getByRole('button',{name:'Approved Apps'}));
  expect(await screen.findByText('Approved agent')).toBeVisible();
  expect(screen.queryByText('Build script')).not.toBeInTheDocument();
});

it('shows an error and retry on the resource step',async()=>{
  const fetch=vi.fn().mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(json(catalog));
  vi.stubGlobal('fetch',fetch);
  const user=userEvent.setup();render(<Flow/>);
  await user.type(screen.getByLabelText('Key name'),'Build script');
  await user.click(next());
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load resources.');
  await user.click(screen.getByRole('button',{name:'Retry'}));
  expect(await screen.findByLabelText('Team board')).toBeVisible();
});

it('filters key rows and revokes only after confirming the active key action',async()=>{
  const active={id:'active',name:'Build script',kind:'pat',scopes:['content:read'],resources:['board:b1'],expiresAt:'2099-01-01',lastUsedAt:null,revokedAt:null};
  const items=[active,{...active,id:'expired',name:'Old script',expiresAt:'2000-01-01'},
    {...active,id:'revoked',name:'Old report',revokedAt:'2020-01-01'}];
  const revoke=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
    if(init?.method==='DELETE'){revoke(url);return new Response(null,{status:204});}
    return url.includes('/catalog')?json(catalog):json({items});
  }));
  const user=userEvent.setup();render(<ConnectionList kind="keys" onCreate={()=>{}}/>);
  expect(screen.getByRole('link',{name:'API Docs'})).toHaveAttribute('href','/api/docs');
  const filter=await screen.findByRole('searchbox',{name:'Filter keys by name'});
  expect(screen.queryByRole('button',{name:'Revoke Old script'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Revoke Old report'})).not.toBeInTheDocument();
  await user.type(filter,'SCRIPT');
  expect(screen.getByText('Old script')).toBeVisible();
  expect(screen.queryByText('Old report')).not.toBeInTheDocument();
  await user.clear(filter);
  await user.type(filter,'missing');
  expect(screen.getByRole('status')).toHaveTextContent('No matching keys.');
  await user.clear(filter);
  const row=screen.getByRole('button',{name:'Build script, Active'});
  expect(row).toHaveAttribute('aria-expanded','false');
  await user.click(row);
  expect(screen.getByText('Read content')).toBeVisible();
  await user.click(row);
  await user.click(screen.getByRole('button',{name:'Revoke Build script'}));
  expect(row).toHaveAttribute('aria-expanded','false');
  expect(revoke).not.toHaveBeenCalled();
  const confirm=()=>screen.getByRole('button',{name:'Confirm revocation of Build script'});
  expect(confirm()).toHaveFocus();
  await user.click(row);
  expect(screen.queryByRole('button',{name:'Confirm revocation of Build script'})).not.toBeInTheDocument();
  await user.click(row);
  await user.click(screen.getByRole('button',{name:'Revoke Build script'}));
  await user.click(confirm());
  expect(revoke).toHaveBeenCalledExactlyOnceWith('/api/connections/active');
  expect(await screen.findByRole('button',{name:'Build script, Revoked'})).toBeVisible();
  expect(screen.queryByRole('button',{name:/^(Revoke |Confirm revocation of )/})).not.toBeInTheDocument();
});

it('selects or clears only permissions shown by both filters',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json(catalog)));
  const user=userEvent.setup();render(<Flow/>);
  await user.type(screen.getByLabelText('Key name'),'Filtered key');
  await user.click(next());
  await user.click(await screen.findByLabelText('Entire platform'));
  await user.click(next());
  await user.click(screen.getByLabelText('List cards'));
  const search=screen.getByLabelText('Find a permission');
  await user.type(search,'card');
  await user.selectOptions(screen.getByLabelText('Access level'),'Basic User');
  await user.click(screen.getByRole('button',{name:'Select all shown'}));
  expect(screen.getByRole('status')).toHaveTextContent('3 selected');
  expect(screen.getByLabelText('Create card')).toBeChecked();
  expect(screen.getByLabelText('Rename card')).toBeChecked();
  await user.click(screen.getByRole('button',{name:'Clear shown'}));
  expect(screen.getByRole('status')).toHaveTextContent('1 selected');
  await user.type(search,'zz');
  expect(screen.getByRole('button',{name:'Select all shown'})).toBeDisabled();
  await user.click(next());await user.click(next());
  expect(screen.getByText('List cards')).toBeVisible();
  expect(screen.queryByText('Create card')).not.toBeInTheDocument();
});

it('fills cumulative role permissions, keeps account permissions separate, and prunes on resource change',async()=>{
  const fetch=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?json({token:'synthetic-test-token'},201):json(catalog));
  vi.stubGlobal('fetch',fetch);
  const user=userEvent.setup();render(<Flow/>);
  await user.type(screen.getByLabelText('Key name'),'Preset key');
  await user.click(next());
  await user.click(await screen.findByLabelText('Entire platform'));
  await user.click(next());
  const role=()=>screen.getByLabelText('Role preset');
  expect(role()).toHaveValue('');
  await user.selectOptions(role(),'System Admin');
  expect(screen.getByRole('status')).toHaveTextContent('6 selected');
  expect(screen.getByLabelText('Read own account')).not.toBeChecked();
  await user.selectOptions(role(),'Board Admin');
  expect(screen.getByLabelText('List cards')).toBeChecked();
  expect(screen.getByLabelText('Rename card')).toBeChecked();
  expect(screen.getByLabelText('Archive card')).toBeChecked();
  expect(screen.getByLabelText('Rename workspace')).not.toBeChecked();
  expect(screen.getByLabelText('Read audit log')).not.toBeChecked();
  await user.click(screen.getByLabelText('Rename card'));
  expect(role()).toHaveValue('');
  await user.click(screen.getByRole('button',{name:'Back'}));
  await user.click(screen.getByLabelText('Team board'));
  await user.click(next());
  expect(within(role()).getAllByRole('option').map(item=>item.textContent)).toEqual(['Custom','Viewer','Basic User']);
  expect(screen.getByRole('status')).toHaveTextContent('2 selected');
  await user.type(screen.getByLabelText('Find a permission'),'rename');
  await user.selectOptions(role(),'Basic User');
  expect(screen.getByLabelText('Find a permission')).toHaveValue('');
  await user.click(next());await user.click(next());
  await user.click(screen.getByRole('button',{name:'Create API key'}));
  await screen.findByLabelText('New API key');
  expect(JSON.parse(String(fetch.mock.calls.find(([,init])=>init?.method==='POST')?.[1]?.body))).toMatchObject({
    actions:['GET /cards','POST /cards','card:title'],resources:['board:b1'],
  });
});
