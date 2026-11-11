import type Database from 'better-sqlite3';
import type { AuthContextValue } from '../types';
import { canAccessBoard, canAccessWorkspace, canEditBoardCards, canManageBoard, canManageWorkspace, isSystemAdmin } from '../rbac/permissions';
import { API_OPERATIONS, type ApiOperation } from './operations';
import { ApiAuthorizationError, type ApiScope } from './contract';

export const ACCESS_LEVELS = ['Account', 'Viewer', 'Basic User', 'Board Admin', 'Workspace Admin', 'System Admin'] as const;
type Level = typeof ACCESS_LEVELS[number];
export interface Action { id: string; label: string; level: Level; personal: boolean; resourceBound?: boolean; scopes: ApiScope[] }
interface Resource { id: string; label: string; level: Level }

const cardFields = [
  ['title','Rename card',['title']],
  ['description','Edit card description',['description','descriptionDocument']],
  ['assignees','Assign card members',['memberIds']],
  ['labels','Set card labels',['labelIds']],
  ['checklists','Edit checklists',['checklists']],
  ['due','Set due date',['dueDate']],
  ['due_status','Mark due date complete',['dueDateComplete']],
  ['attachments','Edit attachments',['attachments']],
  ['watch','Change card watch state',['watching']],
  ['archive','Archive or restore card',['archived']],
] as const;
const userFields = [
  ['profile','Edit user profile',['name','initials','color']],
  ['username','Change username',['username']],
  ['status','Activate or disable user',['active']],
  ['platform_role','Change system role',['platformRole']],
  ['workspace_admins','Assign workspace admins',['workspaceAdminWorkspaceIds']],
  ['board_admins','Assign board admins',['boardAdminBoardIds']],
  ['memberships','Set user board memberships',['boardMemberships']],
] as const;
const patchCard = (op:ApiOperation) => op.method === 'PATCH' && op.path === '/cards/:cardId';
const patchUser = (op:ApiOperation) => op.method === 'PATCH' && op.path === '/admin/users/:userId';
const createUser = (op:ApiOperation) => op.method === 'POST' && op.path === '/admin/users';
const contentOp = (op:ApiOperation) => op.path === '/content-operations' || op.path === '/content-operations/preview';
const routeId = (op:ApiOperation) => `${op.method} ${op.path}`;
const createUserExtras = new Set(['status','platform_role','workspace_admins','board_admins','memberships']);

export function actionIds(operation: ApiOperation, body: Record<string, unknown>) {
  if (contentOp(operation)) {
    const kind = typeof body.kind === 'string' ? body.kind : '';
    return [`content:${kind === 'delete' ? `delete_${body.resourceType}` : kind}`];
  }
  if (patchCard(operation)) return cardFields.filter(([, ,fields])=>fields.some(key=>Object.hasOwn(body,key))).map(([id])=>`card:${id}`);
  if (patchUser(operation)) return userFields.filter(([, ,fields])=>fields.some(key=>Object.hasOwn(body,key))).map(([id])=>`admin:user_${id}`);
  if (createUser(operation)) {
    const extra = userFields.filter(([id,, fields])=>createUserExtras.has(id) && fields.some(key=>key==='active' ? body.active===false : key==='platformRole' ? body.platformRole==='system_admin' : Array.isArray(body[key]) && body[key].length>0));
    return [routeId(operation),...extra.map(([id])=>`admin:user_${id}`)];
  }
  return [routeId(operation)];
}

export function documentedActions(operation:ApiOperation) {
  if (contentOp(operation)) return actionCatalog().filter(item=>item.id.startsWith('content:')).map(item=>item.id);
  if (patchCard(operation)) return cardFields.map(([id])=>`card:${id}`);
  if (patchUser(operation)) return userFields.map(([id])=>`admin:user_${id}`);
  if (createUser(operation)) return [routeId(operation),...userFields.filter(([id])=>createUserExtras.has(id)).map(([id])=>`admin:user_${id}`)];
  return [routeId(operation)];
}

const shortLabels:Record<string,string> = {
  'GET /me':'Read account',
  'GET /state':'Read application snapshot',
  'GET /auth/session':'Read session snapshot',
  'GET /workspaces/bootstrap':'Read workspace snapshot',
  'PATCH /auth/profile':'Edit profile',
  'PATCH /auth/preferences':'Edit preferences',
  'POST /auth/password/change':'Change password',
  'POST /auth/recovery-key/generate':'Generate recovery key',
  'PATCH /boards/:boardId/star':'Toggle shared board star',
  'PUT /auth/navigation/boards/:boardId/star':'Set personal board star',
  'GET /auth/navigation':'Read recent and starred boards',
};
function action(operation: ApiOperation): Action {
  const { method, path, scopes, summary, platform } = operation;
  const resourceBound = path.includes('/notifications') || path.startsWith('/auth/') && path.endsWith('/star') || path.startsWith('/auth/navigation') || path.startsWith('/auth/list-preferences') || path.includes('/board-invitations/accept');
  const personal = resourceBound || path === '/me' || path.startsWith('/auth/') && path !== '/auth/session';
  const workspace = method !== 'GET' && (/^\/workspaces\//.test(path) || /^\/collections\//.test(path) || path === '/boards' || path === '/workspaces/:id/collections');
  const level = platform ? 'System Admin' : personal && !resourceBound ? 'Account' : workspace ? 'Workspace Admin'
    : path === '/boards/:boardId/star' || scopes.some(scope => scope === 'content:manage' || scope.startsWith('administration:')) ? 'Board Admin'
    : method !== 'GET' ? 'Basic User' : 'Viewer';
  const id=routeId(operation);
  const collection = path.match(/^\/(workspaces|boards|lists|cards|automation-rules|notifications)(\/:id)?$/);
  const plural = collection?.[1].replace('-', ' ');
  const label = shortLabels[id] ?? (method==='GET' && plural ? collection?.[2] ? `Read ${plural.slice(0,-1)}` : `List ${plural}` : summary.replace(/ \(.*\)$/, '').replace(/ with (current revision|revision precondition|bounded pages)$/, ''));
  return { id, label, level, personal, resourceBound, scopes };
}

export function actionCatalog(): Action[] {
  return [
    ...API_OPERATIONS.filter(op => !contentOp(op) && !patchCard(op) && !patchUser(op)).map(action),
    ...cardFields.map(([id,label]):Action=>({ id:`card:${id}`, label, level:id==='archive'?'Board Admin':'Basic User', personal:false, scopes:id==='archive'?['content:write','content:manage']:['content:write'] })),
    ...userFields.map(([id,label]):Action=>({ id:`admin:user_${id}`, label, level:'System Admin', personal:false, scopes:['administration:write'] })),
    ...(['board','list','card','workspace'] as const).flatMap(resource =>
      (resource === 'workspace' ? ['delete'] : ['copy','move','delete']).map(verb => ({
        id: `content:${verb === 'delete' ? `delete_${resource}` : `${resource}_${verb}`}`,
        label: `${verb[0].toUpperCase()}${verb.slice(1)} ${resource}s`,
        level: resource === 'workspace' || resource === 'board' && verb !== 'delete' ? 'Workspace Admin' as const : verb === 'delete' || resource !== 'card' ? 'Board Admin' as const : 'Basic User' as const,
        personal:false, scopes: verb === 'delete' || resource !== 'card' ? ['content:write','content:manage'] as ApiScope[] : ['content:write'] as ApiScope[],
      }))),
  ];
}

export function resourceCatalog(db: Database.Database, actor: AuthContextValue, service: boolean): Resource[] {
  const system = isSystemAdmin(actor);
  const workspaces = db.prepare('SELECT id, name FROM workspaces ORDER BY name, id').all() as { id:string; name:string }[];
  const boards = db.prepare('SELECT b.id, b.title, w.name workspace FROM boards b JOIN workspaces w ON b.workspace_id=w.id ORDER BY w.name, b.title, b.id').all() as { id:string; title:string; workspace:string }[];
  return [
    ...(!service ? [{ id:'account',label:'My account',level:'Account' as const }] : []),
    ...(system ? [{ id:'platform',label:'Entire platform',level:'System Admin' as const }] : []),
    ...workspaces.filter(item => service ? canManageWorkspace(actor,item.id) : canAccessWorkspace(actor,item.id)).map(item => ({
      id:`workspace:${item.id}`,label:`Workspace: ${item.name}`,level:canManageWorkspace(actor,item.id) ? 'Workspace Admin' as const : 'Viewer' as const,
    })),
    ...boards.filter(item => service ? canManageBoard(db,actor,item.id) : canAccessBoard(db,actor,item.id)).map(item => ({
      id:`board:${item.id}`,label:`${item.workspace} / ${item.title}`,level:canManageBoard(db,actor,item.id) ? 'Board Admin' as const : canEditBoardCards(db,actor,item.id) ? 'Basic User' as const : 'Viewer' as const,
    })),
  ];
}

export function permitsAction(resource: Resource, action: Action) {
  return action.personal && !action.resourceBound
    ? resource.id === 'account' || resource.id === 'platform'
    : resource.id !== 'account' && ACCESS_LEVELS.indexOf(resource.level) >= ACCESS_LEVELS.indexOf(action.level);
}

export function verifyActions(db: Database.Database, actor: AuthContextValue, ids: string[], resources: string[], service: boolean) {
  const actions = new Map(actionCatalog().map(item => [item.id,item]));
  const options = new Map(resourceCatalog(db,actor,service).map(item => [item.id,item]));
  if (resources.length > 1 && resources.some(id => id === 'account' || id === 'platform')) throw new ApiAuthorizationError(400,'RESOURCE_INVALID','Select My account or Entire platform by itself.');
  const selected = ids.map(id => actions.get(id));
  if (selected.some(item => !item || service && item.personal || resources.some(id => !options.has(id) || !permitsAction(options.get(id)!,item)))) {
    throw new ApiAuthorizationError(403,'GRANT_FORBIDDEN','Some permissions are unavailable for these resources.');
  }
  return [...new Set(selected.flatMap(item => item!.scopes))];
}
