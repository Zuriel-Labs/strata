import { render,screen,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ConnectionList, ConnectionsPanel } from './ConnectionsPanel';

const expiries=[1,7,30,60,90,180];
const catalog={expiries,resources:[{id:'board:b1',label:'Team board',actions:['GET /cards','POST /cards']},{id:'account',label:'My account',actions:['GET /me']}],
  actions:[{id:'GET /cards',label:'List cards',level:'Viewer'},{id:'POST /cards',label:'Create card',level:'Basic User'},{id:'GET /me',label:'Read own account',level:'Account'}]};
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
  expect(await screen.findByLabelText('New API key')).toHaveValue('synthetic-test-token');
  expect(JSON.parse(String(calls[0].body))).toEqual({name:'Build script',actions:['GET /cards'],resources:['board:b1'],expiresInDays:180,confirmation:'CREATE'});
  expect(calls[0].headers).toMatchObject({'X-Strata-Intent':'connections'});
  await user.click(screen.getByRole('button',{name:'I saved the key'}));
  expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument();
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
