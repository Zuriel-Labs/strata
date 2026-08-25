import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AdminAssignmentPicker } from './AdminAssignmentPicker';
import type { AdminResourcePage } from '../types';

function Harness({loadPage}:{loadPage:(input:{query:string;page:number})=>Promise<AdminResourcePage>}) {
  const [ids,setIds]=useState<string[]>(['b1']);
  return <AdminAssignmentPicker label="Board access" description="Choose Boards" selectedIds={ids} onChange={setIds} loadPage={loadPage}/>;
}

describe('AdminAssignmentPicker',()=>{
  it('searches bounded pages and retains selections that are off the current page',async()=>{
    const loadPage=vi.fn(async({query,page}:{query:string;page:number})=>({
      items: query ? [{id:'b2',name:'Results',kind:'board' as const,workspaceId:'w1',workspaceName:'Acme'}] : [{id:'b1',name:'Platform',kind:'board' as const,workspaceId:'w1',workspaceName:'Acme'}],
      page:{page,pageSize:25,total:50,totalPages:2},
    }));
    const user=userEvent.setup(); render(<Harness loadPage={loadPage}/>);
    expect(await screen.findByRole('button',{name:/Acme \/ Platform/})).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search Board access'),'result');
    await waitFor(()=>expect(screen.getByText('Acme / Results')).toBeInTheDocument());
    expect(screen.getByRole('button',{name:/Acme \/ Platform/})).toBeInTheDocument();
    await user.click(screen.getByLabelText('Acme / Results'));
    expect(screen.getByRole('button',{name:/Acme \/ Results/})).toBeInTheDocument();
  });
});
