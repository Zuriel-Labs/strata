import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionsPanel } from './ConnectionsPanel';
vi.mock('../lib/auth-context',()=>({useAuth:()=>({session:{user:{id:'u2'},permissions:{isSystemAdmin:false},appState:{boards:[{id:'b1',title:'Team board'}],workspaces:[{id:'w1',name:'Team workspace'}]}}})}));
afterEach(()=>vi.unstubAllGlobals());
it('requires deliberate permission approval and forgets the one-time token',async()=>{
  const calls:RequestInit[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
    if(init?.method==='POST'){calls.push(init);return new Response(JSON.stringify({token:'synthetic-test-token',connection:{id:'g1'}}),{status:201,headers:{'Content-Type':'application/json'}});}
    return new Response(JSON.stringify({items:[]}),{headers:{'Content-Type':'application/json'}});
  }));
  const user=userEvent.setup();render(<ConnectionsPanel/>);
  await screen.findByText('No approved connections.');
  await user.type(screen.getByLabelText('Connection name'),'Build script');
  await user.click(screen.getByLabelText('Team board'));
  expect(screen.getByRole('button',{name:'Create API key'})).toBeDisabled();
  await user.click(screen.getByLabelText(/I approve these permissions/));
  await user.click(screen.getByRole('button',{name:'Create API key'}));
  await screen.findByLabelText('New API key');
  expect(JSON.parse(String(calls[0].body))).toMatchObject({name:'Build script',resources:['board:b1'],confirmation:'CREATE'});
  expect(calls[0].headers).toMatchObject({'X-Strata-Intent':'connections'});
  await user.click(screen.getByRole('button',{name:'I saved the key'}));
  expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument();
});
it('shows a recoverable loading failure',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Network unavailable');}));render(<ConnectionsPanel/>);
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable'));
  expect(screen.getByRole('button',{name:'Retry connections'})).toBeEnabled();
});
