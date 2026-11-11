import type { z } from 'zod';
import * as card from '../routes/card-routes';
import * as board from '../routes/board-routes';
import * as list from '../routes/list-routes';
import * as workspace from '../routes/bootstrap-routes';
import * as admin from '../routes/admin-routes';
import * as auth from '../routes/auth-routes';
import * as automation from '../routes/automation-routes';
import * as presentation from '../routes/presentation-routes';
import * as lifecycle from '../routes/lifecycle-routes';
import * as invitation from '../routes/invitation-routes';
import * as navigation from '../routes/navigation-routes';
import { commitSchema, operationSchema } from '../content/operation-contract';
import type { ApiScope } from './contract';

export interface ApiOperation { method: string; path: string; scopes: ApiScope[]; body?: z.ZodType; query?: z.ZodType; summary: string; platform?: boolean }
const operations: ApiOperation[] = [];
function add(method: string, path: string, scope: ApiScope | ApiScope[], summary: string, body?: z.ZodType, query?: z.ZodType, platform = false) {
  operations.push({ method, path, scopes: Array.isArray(scope) ? scope : [scope], summary, body, query, platform });
}
add('GET','/state',['content:read','account:read'],'Read scoped application state');
add('GET','/me','account:read','Read own account without application content');
add('GET','/workspaces/bootstrap',['content:read','account:read'],'Read scoped Web UI bootstrap');
add('GET','/auth/session',['content:read','account:read'],'Read scoped user and application state');
for (const kind of ['workspaces','boards','lists','cards','automation-rules','notifications']) {
  add('GET',`/${kind}`,'content:read',`List authorized ${kind} with cursor pagination`);
  add('GET',`/${kind}/:id`,'content:read',`Read an authorized ${kind} resource`);
}
add('POST','/workspaces','content:manage','Create workspace (System Admin)',workspace.workspaceSchema,undefined,true);
add('PATCH','/workspaces/:workspaceId','content:manage','Rename workspace',workspace.updateWorkspaceSchema);
add('DELETE','/workspaces/:workspaceId','content:manage','Request workspace deletion (requires content-operation preview)');
add('POST','/boards','content:manage','Create board',board.createBoardSchema);
add('PATCH','/boards/:boardId','content:manage','Update board',board.updateBoardSchema);
add('DELETE','/boards/:boardId','content:manage','Request board deletion (requires content-operation preview)');
add('PATCH','/boards/:boardId/star','account:write','Toggle board star');
add('PUT','/boards/:boardId/labels','content:manage','Replace board label definitions with revision precondition',board.updateBoardLabelsSchema);
add('POST','/lists','content:manage','Create list',list.createListSchema);
add('PATCH','/lists/:listId','content:manage','Rename list',list.updateListSchema);
add('POST','/lists/:listId/sort','content:manage','Sort list cards',list.sortListSchema);
add('POST','/lists/:listId/move','content:manage','Reorder list',list.moveListSchema);
for (const action of ['archive','restore']) add('POST',`/lists/:listId/${action}`,'content:manage',`${action} list and its cards`);
add('DELETE','/lists/:listId','content:manage','Request list deletion (requires content-operation preview)');
add('POST','/cards','content:write','Create card',card.createCardSchema);
add('PATCH','/cards/:cardId','content:write','Edit card, description, labels, members, dates, checklists, attachments or archive state',card.updateCardSchema);
add('POST','/cards/:cardId/move','content:write','Move card',card.moveCardSchema);
add('POST','/cards/:cardId/duplicate','content:write','Duplicate card',card.duplicateCardSchema);
add('POST','/cards/:cardId/comments','content:write','Add comment',card.commentMutationSchema);
add('PATCH','/cards/:cardId/comments/:commentId','content:write','Edit own comment',card.commentMutationSchema);
add('DELETE','/cards/:cardId/comments/:commentId','content:write','Delete comment under current application policy');
add('DELETE','/cards/:cardId','content:manage','Request card deletion (requires content-operation preview)');
add('POST','/automation-rules','content:manage','Create automation',automation.createRuleSchema);
add('PATCH','/automation-rules/:ruleId','content:manage','Edit automation',automation.updateRuleSchema);
add('DELETE','/automation-rules/:ruleId','content:manage','Delete automation');
add('POST','/notifications/:notificationId/read','account:write','Mark own notification read');
add('POST','/notifications/read-all','account:write','Mark all in-scope notifications read');
add('GET','/auth/navigation','content:read','Read recent or starred authorized boards',undefined,navigation.navigationQuery);
add('PUT','/auth/navigation/boards/:boardId/visit','account:write','Record personal board visit');
add('PUT','/auth/navigation/boards/:boardId/star','account:write','Set personal board star',navigation.starBody);
add('PATCH','/auth/profile','account:write','Update own profile',auth.profileUpdateSchema);
add('PATCH','/auth/preferences','account:write','Update own theme and authorized defaults',auth.preferencesUpdateSchema);
add('POST','/auth/logout','account:write','Revoke current API connection');
add('POST','/auth/password/change','account:security','Change own password with current-password verification; revokes API connections',auth.passwordChangeSchema);
add('POST','/auth/recovery-key/generate','account:security','Generate own recovery key');
add('POST','/auth/board-invitations/accept','account:write','Accept invitation within approved resources',invitation.acceptBody);
add('GET','/admin/users','administration:read','List authorized users with bounded pages',undefined,admin.pageSchema);
add('GET','/admin/audit','administration:read','Read platform audit log',undefined,undefined,true);
add('GET','/admin/users/:userId','administration:read','Read authorized user detail');
add('GET','/admin/resources','administration:read','List manageable workspace or board resources',undefined,admin.resourceSchema);
add('POST','/admin/users','administration:write','Create user (System Admin)',admin.userSchema,undefined,true);
add('PATCH','/admin/users/:userId','administration:write','Update account and assignments (System Admin)',admin.userPatchSchema,undefined,true);
add('DELETE','/admin/users/:userId','administration:write','Delete user with explicit DELETE confirmation (System Admin)',undefined,undefined,true);
add('POST','/admin/users/:userId/generate-recovery-key','administration:write','Generate account recovery key (System Admin)',undefined,undefined,true);
add('PATCH','/admin/settings/label-policy','administration:write','Update platform label limit (System Admin)',admin.labelPolicySchema,undefined,true);
for (const suffix of ['members','eligible-users']) add('GET',`/admin/boards/:boardId/${suffix}`,'administration:read',`List board ${suffix}`,undefined,admin.pageSchema);
add('PUT','/admin/boards/:boardId/members/:userId','administration:write','Assign board membership',admin.membershipSchema);
add('DELETE','/admin/boards/:boardId/members/:userId','administration:write','Remove board membership');
add('GET','/admin/boards/:boardId/invitations','administration:read','List pending board invitations',undefined,invitation.invitationQuery);
add('POST','/admin/boards/:boardId/invitations','administration:write','Issue short-lived board invitation',invitation.invitationBody);
add('DELETE','/admin/boards/:boardId/invitations/:invitationId','administration:write','Revoke board invitation');
for (const kind of ['workspaces','boards']) for (const action of ['close','reopen']) add('POST',`/${kind}/:id/${action}`,'content:manage',`${action} ${kind} using current revision`,lifecycle.revisionSchema);
add('PUT','/boards/:id/template','content:manage','Convert board/template with current revision',lifecycle.templateSchema);
add('POST','/content-operations/preview','content:write','Preview copy, move or deletion with impact and plan hash',operationSchema);
add('POST','/content-operations','content:write','Commit reviewed copy, move or typed-confirmed deletion with Idempotency-Key',commitSchema);
add('GET','/workspaces/:id/collections','content:read','List authorized board collections',undefined,presentation.collectionQuerySchema);
add('POST','/workspaces/:id/collections','content:manage','Create collection',presentation.nameSchema);
add('PATCH','/collections/:id','content:manage','Rename collection with revision',presentation.nameSchema.extend({ expectedRevision: lifecycle.revisionSchema.shape.expectedRevision }));
add('DELETE','/collections/:id','content:manage','Delete collection with revision',presentation.revisionSchema);
for (const method of ['PUT','DELETE']) add(method,'/collections/:id/boards/:boardId','content:manage','Change collection board membership');
add('PATCH','/lists/:id/presentation','content:manage','Set list color with current revision',presentation.colorSchema);
add('PUT','/auth/list-preferences/:id','account:write','Set own collapsed-list preference',presentation.preferenceSchema);
export const API_OPERATIONS: readonly ApiOperation[] = operations;
export function matchOperation(method: string, path: string) {
  for (const operation of API_OPERATIONS) {
    if (operation.method !== (method === 'HEAD' ? 'GET' : method)) continue;
    const names: string[] = [];
    const pattern = operation.path.split('/').map(part => { if (!part.startsWith(':')) return part; names.push(part.slice(1)); return '([^/]+)'; }).join('/');
    const match = path.match(new RegExp(`^${pattern}/?$`));
    if (match) return { operation, params: Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index+1])])) };
  }
  return null;
}
