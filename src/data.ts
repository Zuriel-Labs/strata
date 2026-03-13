import type { User, Workspace, Board, List, Card, Label, AutomationRule, Notification } from './types';

let _id = 100;
const uid = () => `id_${++_id}`;

export const USERS: User[] = [
  { id: 'u1', name: 'You', initials: 'YO', color: '#6366f1', email: 'you@company.io' },
  { id: 'u2', name: 'Alex Chen', initials: 'AC', color: '#0891b2', email: 'alex@company.io' },
  { id: 'u3', name: 'Priya Sharma', initials: 'PS', color: '#c026d3', email: 'priya@company.io' },
  { id: 'u4', name: 'Marcus Johnson', initials: 'MJ', color: '#ea580c', email: 'marcus@company.io' },
];

const defaultLabels: Label[] = [
  { id: 'lb1', name: 'Urgent', color: '#ef4444' },
  { id: 'lb2', name: 'Frontend', color: '#3b82f6' },
  { id: 'lb3', name: 'Backend', color: '#22c55e' },
  { id: 'lb4', name: 'Bug', color: '#f97316' },
  { id: 'lb5', name: 'Feature', color: '#a855f7' },
  { id: 'lb6', name: 'Design', color: '#ec4899' },
];

export const WORKSPACES: Workspace[] = [
  { id: 'w1', name: 'Acme Engineering', description: 'Product & platform engineering team', memberIds: ['u1', 'u2', 'u3', 'u4'], visibility: 'private' },
  { id: 'w2', name: 'Marketing', description: 'Campaigns and brand ops', memberIds: ['u1', 'u3'], visibility: 'workspace' },
];

export const BOARDS: Board[] = [
  { id: 'b1', title: 'Platform Sprint 24', workspaceId: 'w1', visibility: 'workspace', color: '#6366f1', starred: true, labels: defaultLabels },
  { id: 'b2', title: 'Bug Tracker', workspaceId: 'w1', visibility: 'private', color: '#ef4444', starred: false, labels: defaultLabels },
  { id: 'b3', title: 'Q1 Campaign Plan', workspaceId: 'w2', visibility: 'workspace', color: '#0891b2', starred: false, labels: defaultLabels },
];

export const LISTS: List[] = [
  { id: 'l1', title: 'Backlog', boardId: 'b1', position: 0, archived: false },
  { id: 'l2', title: 'To Do', boardId: 'b1', position: 1, archived: false },
  { id: 'l3', title: 'In Progress', boardId: 'b1', position: 2, archived: false },
  { id: 'l4', title: 'In Review', boardId: 'b1', position: 3, archived: false },
  { id: 'l5', title: 'Done', boardId: 'b1', position: 4, archived: false },
  { id: 'l6', title: 'New', boardId: 'b2', position: 0, archived: false },
  { id: 'l7', title: 'Investigating', boardId: 'b2', position: 1, archived: false },
  { id: 'l8', title: 'Fix in Progress', boardId: 'b2', position: 2, archived: false },
  { id: 'l9', title: 'Resolved', boardId: 'b2', position: 3, archived: false },
  { id: 'l10', title: 'Ideas', boardId: 'b3', position: 0, archived: false },
  { id: 'l11', title: 'Planned', boardId: 'b3', position: 1, archived: false },
  { id: 'l12', title: 'Active', boardId: 'b3', position: 2, archived: false },
  { id: 'l13', title: 'Complete', boardId: 'b3', position: 3, archived: false },
];

const now = new Date().toISOString();
const daysFromNow = (d: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString();
};

export const CARDS: Card[] = [
  {
    id: 'c1', title: 'Set up CI/CD pipeline for monorepo', description: 'Configure GitHub Actions for the new monorepo structure. Need separate workflows for each package.', listId: 'l3', boardId: 'b1', position: 0,
    memberIds: ['u1', 'u2'], labelIds: ['lb3', 'lb5'], dueDate: daysFromNow(3), dueDateComplete: false, watching: true, archived: false, createdAt: now, attachments: [],
    checklists: [{ id: 'ck1', title: 'Pipeline Steps', items: [{ id: 'ci1', text: 'Lint & typecheck', completed: true }, { id: 'ci2', text: 'Unit tests', completed: true }, { id: 'ci3', text: 'Integration tests', completed: false }, { id: 'ci4', text: 'Deploy to staging', completed: false }] }],
    comments: [{ id: 'cm1', userId: 'u2', text: 'I pushed an initial workflow file — can you review?', createdAt: daysFromNow(-1) }],
    activity: [{ id: 'a1', userId: 'u1', action: 'moved this card to In Progress', createdAt: daysFromNow(-2) }],
  },
  {
    id: 'c2', title: 'Design new dashboard layout', description: 'Create wireframes and high-fidelity mockups for the analytics dashboard redesign.', listId: 'l3', boardId: 'b1', position: 1,
    memberIds: ['u3'], labelIds: ['lb6', 'lb5'], dueDate: daysFromNow(5), dueDateComplete: false, watching: false, archived: false, createdAt: now, attachments: ['dashboard-v2.fig'],
    checklists: [{ id: 'ck2', title: 'Deliverables', items: [{ id: 'ci5', text: 'Wireframes', completed: true }, { id: 'ci6', text: 'Component inventory', completed: false }, { id: 'ci7', text: 'Hi-fi mockups', completed: false }] }],
    comments: [], activity: [],
  },
  {
    id: 'c3', title: 'Implement OAuth2 login flow', description: 'Add Google and GitHub OAuth providers. Use PKCE flow for SPA.', listId: 'l2', boardId: 'b1', position: 0,
    memberIds: ['u1'], labelIds: ['lb2', 'lb3'], dueDate: daysFromNow(7), dueDateComplete: false, watching: true, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  {
    id: 'c4', title: 'Write API rate-limiting middleware', description: 'Token bucket algorithm. 100 req/min for free tier, 1000 for paid.', listId: 'l2', boardId: 'b1', position: 1,
    memberIds: ['u4'], labelIds: ['lb3'], dueDate: null, dueDateComplete: false, watching: false, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  {
    id: 'c5', title: 'Evaluate state management options', description: 'Compare Zustand, Jotai, and Redux Toolkit for our needs.', listId: 'l1', boardId: 'b1', position: 0,
    memberIds: [], labelIds: ['lb2'], dueDate: null, dueDateComplete: false, watching: false, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  {
    id: 'c6', title: 'Migrate to Node 20 LTS', description: '', listId: 'l1', boardId: 'b1', position: 1,
    memberIds: [], labelIds: ['lb3'], dueDate: null, dueDateComplete: false, watching: false, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  {
    id: 'c7', title: 'Review PR #482 – Auth refactor', description: 'Large refactor touching session management. Needs thorough review.', listId: 'l4', boardId: 'b1', position: 0,
    memberIds: ['u2', 'u4'], labelIds: ['lb3', 'lb1'], dueDate: daysFromNow(1), dueDateComplete: false, watching: true, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [{ id: 'cm2', userId: 'u4', text: 'Left some comments on the token refresh logic.', createdAt: daysFromNow(-1) }], activity: [],
  },
  {
    id: 'c8', title: 'Ship onboarding wizard v2', description: 'Released to 100% of users.', listId: 'l5', boardId: 'b1', position: 0,
    memberIds: ['u1', 'u3'], labelIds: ['lb2', 'lb5'], dueDate: daysFromNow(-3), dueDateComplete: true, watching: false, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  // Bug Tracker board
  {
    id: 'c9', title: 'Login fails on Safari 17', description: 'Users report blank screen after OAuth redirect on Safari 17.2+', listId: 'l7', boardId: 'b2', position: 0,
    memberIds: ['u1'], labelIds: ['lb4', 'lb1'], dueDate: daysFromNow(1), dueDateComplete: false, watching: true, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  {
    id: 'c10', title: 'Memory leak in chart component', description: 'Canvas elements not cleaned up on unmount. ~50MB leak after 10 navigations.', listId: 'l6', boardId: 'b2', position: 0,
    memberIds: [], labelIds: ['lb4', 'lb2'], dueDate: null, dueDateComplete: false, watching: false, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  // Marketing board
  {
    id: 'c11', title: 'Launch blog post: "State of DevTools 2025"', description: 'Need final copy review and social assets.', listId: 'l11', boardId: 'b3', position: 0,
    memberIds: ['u3'], labelIds: ['lb5'], dueDate: daysFromNow(10), dueDateComplete: false, watching: false, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
  {
    id: 'c12', title: 'Design conference booth graphics', description: '', listId: 'l10', boardId: 'b3', position: 0,
    memberIds: [], labelIds: ['lb6'], dueDate: null, dueDateComplete: false, watching: false, archived: false, createdAt: now, attachments: [],
    checklists: [], comments: [], activity: [],
  },
];

export const AUTOMATION_RULES: AutomationRule[] = [
  {
    id: 'ar1', boardId: 'b1', name: 'Auto-assign reviewer on review', trigger: 'card_moved', triggerConfig: { toListId: 'l4' },
    action: 'assign_member', actionConfig: { memberId: 'u2' }, enabled: true,
  },
  {
    id: 'ar2', boardId: 'b1', name: 'Mark due date complete on Done', trigger: 'card_moved', triggerConfig: { toListId: 'l5' },
    action: 'mark_due_complete', actionConfig: {}, enabled: true,
  },
];

export const NOTIFICATIONS: Notification[] = [
  { id: 'n1', userId: 'u1', cardId: 'c1', boardId: 'b1', message: 'Alex Chen commented on "Set up CI/CD pipeline"', read: false, createdAt: daysFromNow(-1) },
  { id: 'n2', userId: 'u1', cardId: 'c7', boardId: 'b1', message: 'Marcus Johnson commented on "Review PR #482"', read: false, createdAt: daysFromNow(-1) },
  { id: 'n3', userId: 'u1', cardId: 'c8', boardId: 'b1', message: '"Ship onboarding wizard v2" is due soon', read: true, createdAt: daysFromNow(-4) },
];

export { uid };
