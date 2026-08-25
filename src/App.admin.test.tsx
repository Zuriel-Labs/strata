import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { initialState } from './store';

const now = '2026-08-25T12:00:00.000Z';
function session(systemAdmin = true) {
  return {
    status:'authenticated', user:{id:systemAdmin?'u1':'u2',name:systemAdmin?'System Admin':'Workspace Admin',initials:'SA',color:'#6366f1',themePreference:'dark',username:systemAdmin?'admin':'alex',platformRole:systemAdmin?'system_admin':'user',mustChangePassword:false},
    permissions:{isSystemAdmin:systemAdmin,workspaceAdminGrants:systemAdmin?[]:[{id:'wag1',userId:'u2',workspaceId:'w1',grantedByUserId:'u1',createdAt:now}],boardAdminGrants:[],boardMemberships:[],derivedWorkspaceIds:[]},
    appState:{...initialState,currentUserId:systemAdmin?'u1':'u2'},
  };
}
const directory = {
  users:[{id:'u1',name:'System Admin',initials:'SA',color:'#6366f1',username:'admin',platformRole:'system_admin',active:true,mustChangePassword:false,createdAt:now,updatedAt:now,counts:{workspaceAdminGrants:0,boardAdminGrants:0,boardMemberships:0,derivedWorkspaces:0}}],
  page:{page:1,pageSize:25,total:1,totalPages:1},
  actorCapabilities:{canCreateUsers:true,canManageAccess:true,canViewAudit:true},auditEvents:[],
};
const resources = {items:[{id:'w1',name:'Acme Engineering',kind:'workspace',workspaceId:null,workspaceName:null},{id:'b1',name:'Platform Sprint 24',kind:'board',workspaceId:'w1',workspaceName:'Acme Engineering'}],page:{page:1,pageSize:25,total:2,totalPages:1}};

function mockApi(systemAdmin = true) {
  const fetchMock = vi.fn(async (input:RequestInfo|URL) => {
    const path=String(input);
    if(path.endsWith('/api/auth/session'))return Response.json(session(systemAdmin));
    if(path.includes('/api/admin/users?'))return Response.json(systemAdmin?directory:{...directory,actorCapabilities:{canCreateUsers:false,canManageAccess:false,canViewAudit:false}});
    if(path.includes('/api/admin/resources?'))return Response.json(resources);
    if(path.includes('/api/admin/boards/')&&path.includes('/members?'))return Response.json({items:[],page:{page:1,pageSize:25,total:0,totalPages:1}});
    if(path.includes('/eligible-users?'))return Response.json({items:[],page:{page:1,pageSize:25,total:0,totalPages:1}});
    if(path.includes('/api/boards/b1/labels'))return Response.json({boardId:'b1',labels:[]});
    return new Response(null,{status:404});
  });
  vi.stubGlobal('fetch',fetchMock); return fetchMock;
}

describe('layered administration UI',()=>{
  beforeEach(()=>mockApi(true));

  it('shows independent scalable access and membership controls to System Administrators',async()=>{
    const user=userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('button',{name:'Open admin panel'}));
    expect(await screen.findByRole('heading',{name:'Access & Membership'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Create User'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Board Members'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Audit Log'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Create User'}));
    expect(screen.getByText('Workspace Administrator access')).toBeInTheDocument();
    expect(screen.getByText('Board Administrator access')).toBeInTheDocument();
    expect(screen.getByText('Member on Boards')).toBeInTheDocument();
    expect(screen.getByText('Observer on Boards')).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Search…')).toHaveLength(4);
  });

  it('lets scoped administrators manage Board members without exposing account or audit escalation',async()=>{
    mockApi(false);
    const user=userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole('button',{name:'Open admin panel'}));
    expect(await screen.findByRole('heading',{name:'Access & Membership'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Create User'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Audit Log'})).not.toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Board Members'}));
    await waitFor(()=>expect(screen.getByLabelText('Board')).toBeInTheDocument());
  });
});
