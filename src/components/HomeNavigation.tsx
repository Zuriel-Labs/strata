import { useState } from 'react';
import { House } from 'lucide-react';
import { BoardHome } from './BoardHome';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';

export function HomeNavigation() {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button aria-label="Open Home" title="Home" className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2" style={{ color: 'var(--text-secondary)', background: 'var(--active-bg)' }}><House size={16} /></button>
    </DialogTrigger>
    <DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto p-4" style={{ width: 'calc(100vw - 2rem)', background: 'var(--modal-bg)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
      <DialogTitle>Home</DialogTitle>
      <DialogDescription>Browse accessible boards, your recent visits and personal stars.</DialogDescription>
      <BoardHome onOpen={() => setOpen(false)} />
    </DialogContent>
  </Dialog>;
}
