import { render,screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionConsent } from './ConnectionConsent';
vi.mock('../lib/auth-context',()=>({useAuth:()=>({session:{appState:{boards:[{id:'b1',title:'Team board'}],workspaces:[]},user:{themePreference:'dark'}}})}));
afterEach(()=>{vi.unstubAllGlobals();window.history.replaceState({},'','/');});
it('shows the matching code and resource name before explicit approval',async()=>{
  window.history.replaceState({},'','/connect?user_code=BCDF-GHJK');
  const decisions:RequestInit[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
    if(init?.method==='POST'){decisions.push(init);return new Response(JSON.stringify({status:'approved'}),{headers:{'Content-Type':'application/json'}});}
    return new Response(JSON.stringify({request:{id:'r1',kind:'device',name:'Strata CLI',scopes:['content:read'],resources:['board:b1'],userCode:'BCDF-GHJK',expiresAt:'2030-01-01T00:00:00Z',connectionExpiresAt:'2030-01-30T00:00:00Z'}}),{headers:{'Content-Type':'application/json'}});
  }));
  const user=userEvent.setup();render(<ConnectionConsent/>);
  await user.click(screen.getByRole('button',{name:'Review request'}));
  await screen.findByText('BCDF-GHJK');
  expect(screen.getByText(/Team board/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Approve connection'})).toBeDisabled();
  await user.click(screen.getByLabelText(/The code matches/));
  await user.click(screen.getByRole('button',{name:'Approve connection'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Connection approved.');
  expect(JSON.parse(String(decisions[0].body))).toMatchObject({decision:'approve',userCode:'BCDF-GHJK',confirmation:true});
});
