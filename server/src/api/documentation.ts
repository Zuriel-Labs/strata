import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { API_OPERATIONS, type ApiOperation } from './operations';
import { SCOPES, grantSchema, keySchema, KEY_EXPIRIES, serviceAssignmentsSchema } from './contract';
import { publicOrigin, clientSchema, decisionSchema } from './oauth-routes';
import { bootstrapSchema, loginSchema, recoveryConsumeSchema } from '../routes/auth-routes';
import { documentedActions } from './actions';
import { requireTls } from './rate-limit';

const string = { type:'string' };
const boolean = { type:'boolean' };
const integer = { type:'integer' };
const nullableString = { type:['string','null'] };
const ref = (name:string) => ({ $ref:`#/components/schemas/${name}` });
const array = (items:object) => ({ type:'array',items });
const object = (properties:Record<string,object>, required=Object.keys(properties)) => ({ type:'object',properties,required });
const resourceNames:Record<string,string> = {workspaces:'Workspace',boards:'Board',lists:'List',cards:'Card','automation-rules':'AutomationRule',notifications:'Notification'};
const page = (items:object) => object({items:array(items),nextCursor:nullableString});
const auditEvents = array(object({id:string,actor_user_id:nullableString,target_user_id:nullableString,scope_type:string,scope_id:nullableString,action:string,outcome:{enum:['success','failure']},metadata_json:string,created_at:string}));
const schemas = {
  Error:object({code:string,message:string}),
  OAuthError:object({error:string,error_description:string}),
  User:object({id:string,name:string,initials:string,color:string,username:string,platformRole:{enum:['user','system_admin']},themePreference:{enum:['dark','light']},mustChangePassword:boolean,defaultWorkspaceId:nullableString,defaultBoardId:nullableString}),
  Person:object({id:string,name:string,initials:string,color:string,username:string,boardIds:array(string)},['id','name','initials','color','username']),
  Permissions:object({isSystemAdmin:boolean,workspaceAdminGrants:array(object({workspaceId:string})),boardAdminGrants:array(object({boardId:string})),boardMemberships:array(object({boardId:string,role:{enum:['member','observer']}})),derivedWorkspaceIds:array(string)}),
  Workspace:object({id:string,name:string,description:string,memberIds:array(string),visibility:{enum:['private','workspace','public']},revision:integer,lifecycleState:{enum:['active','closed']}},['id','name','description','visibility']),
  Board:object({id:string,title:string,workspaceId:string,color:string,visibility:{enum:['private','workspace','public']},starred:boolean,labels:array(ref('Label')),labelsRevision:integer,revision:integer,lifecycleState:{enum:['active','closed']},isTemplate:boolean}),
  Label:object({id:string,name:string,color:string}),
  List:object({id:string,title:string,boardId:string,position:integer,archived:boolean,revision:integer,color:nullableString,collapsed:boolean},['id','title','boardId','position','archived']),
  Checklist:object({id:string,title:string,items:array(object({id:string,text:string,completed:boolean}))}),
  RichTextDocument:{type:'object',description:'Tiptap JSON document; supported nodes: doc, paragraph, text, heading (level 2 or 3), bulletList, orderedList, listItem, blockquote, codeBlock, hardBreak, horizontalRule. Marks: bold, italic, strike, code and validated http/https/mailto link. Server applies the same normalization and limits as the Web UI.',properties:{type:{const:'doc'},content:{type:'array',items:{type:'object'}}},required:['type']},
  Card:object({id:string,title:string,description:string,descriptionDocument:ref('RichTextDocument'),boardId:string,listId:string,position:integer,revision:integer,memberIds:array(string),labelIds:array(string),checklists:array(ref('Checklist')),dueDate:nullableString,dueDateComplete:boolean,comments:array(object({id:string,userId:string,text:string,createdAt:string})),activity:array(object({id:string,userId:string,action:string,createdAt:string})),attachments:array(object({id:string,name:string,kind:{enum:['file','link']},url:string,size:integer,mimeType:string,createdAt:string},['id','name','kind','createdAt'])),watching:boolean,archived:boolean,createdAt:string},['id','title','description','descriptionDocument','boardId','listId','position','memberIds','labelIds','checklists','dueDate','dueDateComplete','comments','activity','attachments','watching','archived','createdAt']),
  AutomationRule:object({id:string,boardId:string,name:string,trigger:{enum:['card_moved','card_created','checklist_complete','due_date_reached','date_time','weekday','monthly','heartbeat']},triggerConfig:{type:'object'},conditions:object({listId:nullableString,labelId:nullableString}),action:{enum:['assign_member','add_label','move_to_list','mark_due_complete']},actionConfig:{type:'object',additionalProperties:string},enabled:boolean,lastRunAt:nullableString}),
  Notification:object({id:string,userId:string,cardId:string,boardId:string,message:string,read:boolean,createdAt:string}),
  State:object({status:{const:'authenticated'},user:ref('User'),permissions:ref('Permissions'),appState:object({users:array(ref('Person')),workspaces:array(ref('Workspace')),boards:array(ref('Board')),lists:array(ref('List')),cards:array(ref('Card')),automationRules:array(ref('AutomationRule')),notifications:array(ref('Notification'))})}),
  PageMeta:object({page:integer,pageSize:integer,total:integer,totalPages:integer}),
  AdminUser:object({id:string,name:string,initials:string,color:string,username:string,platformRole:{enum:['user','system_admin']},active:boolean,mustChangePassword:boolean,createdAt:string,updatedAt:string,workspaceAdminGrants:array(object({workspaceId:string})),boardAdminGrants:array(object({boardId:string})),boardMemberships:array(object({boardId:string,role:{enum:['member','observer']}})),derivedWorkspaceIds:array(string),counts:object({workspaceAdminGrants:integer,boardAdminGrants:integer,boardMemberships:integer,derivedWorkspaces:integer})},['id','name','initials','color','username','platformRole','active','mustChangePassword','createdAt','updatedAt']),
  Collection:object({id:string,workspaceId:string,name:string,revision:integer,boardIds:array(string)},['id','workspaceId','name','revision']),
  Invitation:object({id:string,boardId:string,targetUserId:string,role:{enum:['member','observer']},expiresAt:string,status:{const:'pending'},targetName:string,targetUsername:string,issuerUserId:string,createdAt:string},['id','boardId','targetUserId','role','expiresAt','status']),
  ResourceChoice:object({id:string,name:string,kind:{enum:['workspace','board']},workspaceId:nullableString,workspaceName:nullableString}),
  OperationPreview:object({planHash:string,sourceRevision:integer,destinationRevision:{type:['integer','null']},counts:{type:'object',additionalProperties:integer},warnings:array(string),unresolvedMappings:array(object({kind:{enum:['label','member']},sourceId:string})),audience:{type:'object'},expiresAt:string},['planHash','sourceRevision','destinationRevision','counts','warnings','unresolvedMappings','expiresAt']),
  OperationResult:object({operationId:string,resultIds:array(string),createdCardIds:array(string),counts:{type:'object',additionalProperties:integer},resources:array({type:'object'}),replayed:boolean}),
  Connection:object({id:string,userId:string,name:string,kind:{enum:['pat','device','code']},clientId:nullableString,scopes:array({enum:SCOPES}),resources:array(string),actions:{anyOf:[array(string),{type:'null'}]},serviceAccountId:nullableString,createdAt:string,expiresAt:string,lastUsedAt:nullableString,revokedAt:nullableString}),
  Token:object({access_token:string,token_type:{const:'Bearer'},expires_in:integer,refresh_token:string,scope:string,resource:string,connection_id:string}),
};
function inputSchema(value:z.ZodType) { return z.toJSONSchema(value,{io:'input',unrepresentable:'any'}); }
function responseSchema(operation:ApiOperation):object {
  const {path,method}=operation;
  const paged=(items:object)=>object({items:array(items),page:ref('PageMeta')});
  if(['/state','/auth/session','/workspaces/bootstrap'].includes(path)) return ref('State');
  if(path==='/me') return object({user:ref('User'),permissions:ref('Permissions')});
  if(path==='/content-operations') return ref('OperationResult');
  if(path==='/content-operations/preview') return ref('OperationPreview');
  if(path==='/workspaces/:id/collections') return method==='GET'?page(ref('Collection')):ref('Collection');
  if(path==='/collections/:id') return ref('Collection');
  if(path==='/auth/navigation') return page(object({boardId:string,workspaceId:string,title:string,color:string,starred:boolean,lastVisitedAt:nullableString}));
  if(path==='/auth/list-preferences/:id') return object({listId:string,collapsed:boolean});
  if(path.endsWith('/star')) return path.startsWith('/auth/')?object({boardId:string,starred:boolean}):object({starred:boolean});
  if(path==='/auth/profile' || path==='/auth/preferences') return object({user:ref('User')});
  if(path==='/auth/recovery-key/generate' || path.endsWith('/generate-recovery-key')) return object({recoveryKey:string});
  if(path==='/auth/board-invitations/accept') return object({boardId:string,membershipRole:{enum:['member','observer']},alreadyAccepted:boolean});
  if(path==='/admin/audit') return object({auditEvents});
  if(path==='/admin/users') return method==='GET'?object({users:array(ref('AdminUser')),page:ref('PageMeta'),actorCapabilities:object({canCreateUsers:boolean,canManageAccess:boolean,canViewAudit:boolean,canManageSystemSettings:boolean}),auditEvents}):object({user:ref('AdminUser'),inviteToken:string});
  if(path==='/admin/users/:userId') return method==='DELETE'?object({deletedUserId:string,username:string,removedCardAssignments:integer,remediatedAutomationRules:integer}):object({user:ref('AdminUser')});
  if(path==='/admin/resources') return object({items:array(ref('ResourceChoice')),selectedItems:array(ref('ResourceChoice')),page:ref('PageMeta')});
  if(path==='/admin/settings/label-policy') return object({maxLabelsPerBoard:integer,boardsAboveLimit:integer});
  if(path.endsWith('/invitations')) return method==='GET'?paged(ref('Invitation')):object({invitation:ref('Invitation'),token:string});
  if(path.endsWith('/members') || path.endsWith('/eligible-users')) return paged(object({id:string,name:string,username:string,initials:string,color:string,role:{enum:['member','observer']},serviceAccount:{const:true}},['id','name','username','initials','color']));
  if(path==='/admin/boards/:boardId/members/:userId') return method==='PUT'?object({membership:object({id:string,userId:string,boardId:string,role:{enum:['member','observer']},createdAt:string})}):object({userId:string,boardId:string,derivedWorkspaceIds:array(string)});
  if(/\/(close|reopen)$/.test(path)) return object({id:string,lifecycleState:{enum:['active','closed']},revision:integer});
  if(path==='/boards/:id/template') return ref('Board');
  if(path==='/boards/:boardId/labels') return object({boardId:string,labels:array(ref('Label')),labelsRevision:integer,maxLabelsPerBoard:integer});
  if(path==='/lists/:listId/sort') return object({listId:string,direction:{enum:['asc','desc']},cards:array(ref('Card'))});
  if(/\/lists\/:[^/]+\/(archive|restore|move)$/.test(path) || path.startsWith('/notifications/')) return object({success:{const:true}});
  if(path==='/lists/:id/presentation') return ref('List');
  const parts=path.split('/').filter(Boolean), resource=resourceNames[parts[0]];
  if(resource && method==='GET') return parts.length===1?page(ref(resource)):ref(resource);
  if(path.startsWith('/cards')) return ref('Card');
  if(path==='/boards' || path==='/boards/:boardId') return ref('Board');
  if(path==='/lists' || path==='/lists/:listId') return ref('List');
  if(path==='/workspaces' || path==='/workspaces/:workspaceId') return ref('Workspace');
  if(path.startsWith('/automation-rules')) return ref('AutomationRule');
  throw new Error(`Missing API response contract: ${method} ${path}`);
}
function successStatus(operation:ApiOperation) {
  const {method,path}=operation;
  if(method==='DELETE' && /^\/(cards|lists|boards|workspaces)\/:[^/]+$/.test(path)) return null;
  if(path==='/auth/logout' || path==='/auth/password/change' || path==='/notifications/read-all' || path.endsWith('/visit') || (method==='DELETE' && (path.startsWith('/automation-rules/') || path.startsWith('/collections/') || path.endsWith('/:invitationId'))) || path==='/collections/:id/boards/:boardId') return '204';
  if(method==='POST' && (['/cards','/boards','/lists','/workspaces','/automation-rules','/admin/users','/workspaces/:id/collections'].includes(path) || path.endsWith('/comments') || path.endsWith('/duplicate') || path.endsWith('/invitations'))) return '201';
  return '200';
}
const rateResponse={description:'Application rate window exceeded. Wait Retry-After seconds and use backoff with jitter.',headers:{'Retry-After':{schema:{type:'integer',minimum:1}}},content:{'application/json':{schema:object({code:{const:'RATE_LIMITED'},error:{const:'slow_down'},message:string},['code','message'])}}};
const oauthErrorResponse={description:'Invalid OAuth request or client.',content:{'application/json':{schema:ref('OAuthError')}}};
const browserAuthError={description:'Browser account request failed.',content:{'application/json':{schema:object({message:string,code:string},['message'])}}};
const exampleBodies: Record<string, unknown> = {
  'PUT /auth/list-preferences/:id': { collapsed:false },
  'PUT /auth/navigation/boards/:boardId/star': { starred:true },
  'POST /workspaces': { name:'Example workspace', description:'Synthetic example', visibility:'private' },
  'POST /workspaces/:id/collections': { name:'Example collection' },
};
const workflows = {
  preview: ['POST','/api/v1/content-operations/preview'],
  commit: ['POST','/api/v1/content-operations'],
};
const errorResponse={description:'Safe error. Inspect code; do not retry a write blindly.',content:{'application/json':{schema:ref('Error')}}};
export function createOpenApi() {
  const paths:Record<string,Record<string,unknown>>={};
  for(const operation of API_OPERATIONS) {
    const parameters:object[]=[];
    for(const match of operation.path.matchAll(/:(\w+)/g)) parameters.push({name:match[1],in:'path',required:true,schema:string,description:'Resource identifier from an authorized Strata response.'});
    if(operation.query) {
      const json=inputSchema(operation.query);
      for(const [name,schema] of Object.entries(json.properties ?? {})) parameters.push({name,in:'query',required:json.required?.includes(name)??false,schema});
    } else if(operation.method==='GET' && /^\/(workspaces|boards|lists|cards|automation-rules|notifications)$/.test(operation.path)) {
      for(const [name,schema,description] of [
        ['limit',{type:'integer',minimum:1,maximum:100,default:25},'Maximum items in one page.'],
        ['cursor',{type:'string',maxLength:2000},'Pass nextCursor from the previous page with the same filters and connection.'],
        ['boardId',{type:'string',maxLength:200},'Filter rows with this board ID. Use for lists, cards, automation and notifications.'],
        ['workspaceId',{type:'string',maxLength:200},'Filter rows with this workspace ID or an authorized board in that workspace. Use for boards or their children.'],
      ] as const) parameters.push({name,in:'query',schema,description});
    }
    if(operation.path==='/content-operations' && operation.method==='POST') parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',format:'uuid'},description:'Unique per approved connection and request. Reuse only with identical request and plan. A different connection cannot replay this receipt.'});
    const pathKey=`/api/v1${operation.path.replace(/:(\w+)/g,'{$1}')}`;
    const success=successStatus(operation);
    const noContent=success==='204';
    const readPage=operation.method==='GET' && /^\/(workspaces|boards|lists|cards|automation-rules|notifications)$/.test(operation.path);
    const responses:Record<string,unknown>={ ...(success?{[success]:{description:'Success under current application authorization.',...(noContent?{}:{content:{'application/json':{schema:responseSchema(operation),...(readPage?{example:{items:[],nextCursor:null}}:{})}}})}}:{}),'400':errorResponse,'401':{...errorResponse,description:'Missing, expired or revoked credential. Reauthenticate; never use browser cookies as API fallback.',headers:{'WWW-Authenticate':{schema:string}}},'403':{...errorResponse,description:'Scope, approved resource boundary or current RBAC denies access. Reapproval may be required.'},'404':errorResponse,'409':{...errorResponse,description:'Revision, plan, lifecycle or idempotency conflict. Reload state and preview again.'},'429':rateResponse,'500':{...errorResponse,description:'Server failure. Reconcile state before retrying a non-idempotent write.'}};
    if(operation.path==='/content-operations') responses['201']=responses['200'];
    if(!success) responses['409']={...errorResponse,description:'PREVIEW_REQUIRED after lifecycle checks. Use a fresh preview and reviewed commit for permanent deletion.'};
    const body=operation.body?inputSchema(operation.body):operation.method==='DELETE' && operation.path==='/admin/users/:userId'?object({confirmation:{const:'DELETE'}}):null;
    const example = exampleBodies[`${operation.method} ${operation.path}`];
    if(example !== undefined && !operation.body?.safeParse(example).success) throw new Error(`Invalid documentation example for ${pathKey}`);
    const contentOperation=operation.path.startsWith('/content-operations');
    const conditional=contentOperation || operation.method==='PATCH' && ['/cards/:cardId','/admin/users/:userId'].includes(operation.path) || operation.method==='POST' && operation.path==='/admin/users';
    const write=operation.method!=='GET';
    const workspaceAdmin=operation.path==='/workspaces/:workspaceId' || operation.path.startsWith('/collections/')
      || operation.method==='POST' && ['/workspaces/:id/collections','/boards'].includes(operation.path);
    const boardAdmin=write && (operation.path.startsWith('/lists') || operation.path.startsWith('/automation-rules')
      || operation.path.startsWith('/boards/') && !operation.path.endsWith('/star') && !operation.path.endsWith('/template')
      && !/\/(close|reopen)$/.test(operation.path) || operation.method==='DELETE' && operation.path.startsWith('/cards/'));
    const cardEdit=write && operation.path.startsWith('/cards') && operation.method!=='DELETE';
    const role=operation.platform?'Current System Admin':workspaceAdmin?'Workspace Admin for the owning workspace, or System Admin'
      :boardAdmin?'Board Admin for the affected board, Workspace Admin for its workspace, or System Admin'
      :cardEdit?'Board editor: a board member on a non-template board, or an administrator with authority over the board.':undefined;
    const ownership=operation.path==='/me'?'Only the calling user. Personal account actions are unavailable to service accounts.'
      :operation.method==='PATCH' && operation.path.endsWith('/comments/:commentId')?'Only the comment author may edit it.'
      :'The application rechecks current membership, roles and applicable domain policy.';
    const related=contentOperation ? [operation.path.endsWith('/preview')?workflows.commit:workflows.preview] : !success ? [workflows.preview,workflows.commit] : readPage && operation.path==='/boards' ? [['GET','/api/v1/workspaces'],['GET','/api/v1/cards']] : undefined;
    (paths[pathKey]??={})[operation.method.toLowerCase()]={
      summary:operation.summary,
      ...(readPage?{description:'Items are ordered by ID. Follow nextCursor until null; keep the same filters and connection.'}:{}),
      operationId:`${operation.method.toLowerCase()}_${operation.path.replace(/[^\w]+/g,'_')}`,
      tags:[operation.path.split('/')[1]],
      security:[{bearerAuth:[]}],parameters,
      'x-required-scopes':operation.scopes,'x-key-actions':documentedActions(operation),
      ...(conditional?{'x-action-policy':contentOperation?'The operation kind and resource determine the action and may require content:manage as well as content:write.':operation.path==='/cards/:cardId'?'Actions depend on the fields submitted. The archived field also requires content:manage.':'The actions required depend on the fields and values submitted.'}:{}),
      ...(role?{'x-role-policy':role}:{}),
      'x-resource-policy':operation.platform?'Platform approval required.':operation.path==='/me'?'Account-only approval is sufficient.':'The approved resource and issuance authority ceiling both apply.',
      'x-ownership-policy':ownership,
      ...(related?{'x-related-operations':related}:{}),
      ...(body?{requestBody:{required:true,content:{'application/json':{schema:body,...(example===undefined?{}:{example})}}}}:{}),
      responses,
    };
  }
  paths['/.well-known/oauth-authorization-server']={get:{summary:'Discover the OAuth authorization server',tags:['oauth'],security:[],responses:{'200':{description:'Public discovery metadata for this deployment.',content:{'application/json':{schema:object({
    issuer:string,authorization_endpoint:string,device_authorization_endpoint:string,token_endpoint:string,revocation_endpoint:string,
    response_types_supported:array(string),grant_types_supported:array(string),code_challenge_methods_supported:array(string),
    token_endpoint_auth_methods_supported:array(string),scopes_supported:array(string),
  })}}}}}};
  const oauthBody=(properties:Record<string,object>)=>({required:true,content:{'application/x-www-form-urlencoded':{schema:object(properties)}}});
  paths['/api/oauth/device/authorization']={post:{summary:'Begin public-client Device Authorization',security:[],requestBody:oauthBody({client_id:string,scope:string,resource:string}),responses:{'200':{description:'Display user_code and verification_uri. Poll only after interval seconds.',content:{'application/json':{schema:object({device_code:string,user_code:string,verification_uri:string,verification_uri_complete:string,expires_in:integer,interval:integer})}}},'400':oauthErrorResponse,'429':rateResponse}}};
  paths['/api/oauth/token']={post:{summary:'Redeem device/code or rotate refresh token',security:[],requestBody:{required:true,content:{'application/x-www-form-urlencoded':{schema:{oneOf:[object({grant_type:{const:'urn:ietf:params:oauth:grant-type:device_code'},client_id:string,device_code:string}),object({grant_type:{const:'authorization_code'},client_id:string,code:string,redirect_uri:string,code_verifier:{type:'string',minLength:43,maxLength:128}}),object({grant_type:{const:'refresh_token'},client_id:string,refresh_token:string})]}}}},responses:{'200':{description:'Store securely. Access ≤600 seconds; refresh rotation preserves grant expiry.',content:{'application/json':{schema:ref('Token')}}},'400':{description:'authorization_pending: continue after interval; slow_down: add 5 seconds to every subsequent interval; access_denied/expired_token/invalid_grant: stop. Refresh reuse revokes the entire family.',content:{'application/json':{schema:ref('OAuthError')}}},'429':rateResponse}}};
  paths['/api/oauth/authorize']={get:{summary:'Begin public-client authorization code flow with S256 PKCE',security:[],parameters:Object.entries({client_id:string,response_type:{const:'code'},redirect_uri:{type:'string',format:'uri'},scope:string,resource:string,state:{type:'string',minLength:16,maxLength:512},code_challenge:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$'},code_challenge_method:{const:'S256'}}).map(([name,schema])=>({name,in:'query',required:true,schema})),responses:{'303':{description:'Continue to browser approval. Exact pre-registered redirect, state and S256 verifier are mandatory.',headers:{Location:{schema:string,description:'Relative Strata approval page.'}}},'400':oauthErrorResponse,'429':rateResponse}}};
  for(const [suffix,properties] of Object.entries<Record<string,object>>({revoke:{client_id:string,token:string},'device/cancel':{client_id:string,device_code:string}})) paths[`/api/oauth/${suffix}`]={post:{summary:suffix==='revoke'?'Revoke the connection using a bound token':'Cancel a device request and any issued connection',security:[],requestBody:oauthBody(properties),responses:{[suffix==='revoke'?'200':'204']:{description:'Idempotent success',...(suffix==='revoke'?{content:{'application/json':{schema:object({}),example:{}}}}:{})},'400':oauthErrorResponse,'429':rateResponse}}};
  paths['/api/connections']={get:{summary:'Browser only: list own connection metadata (no secret)',security:[{browserSession:[]}],responses:{'200':{description:'Latest connections, active first; maximum 200.',content:{'application/json':{schema:object({items:array(ref('Connection'))})}}}}},post:{summary:'Browser only: create an explicitly approved PAT',security:[{browserSession:[]}],parameters:[{name:'X-Strata-Intent',in:'header',required:true,schema:{const:'connections'}}],requestBody:{required:true,content:{'application/json':{schema:{oneOf:[inputSchema(keySchema),inputSchema(grantSchema)]}}}},responses:{'201':{description:'One-time secret. Copy to protected storage; never log it.',content:{'application/json':{schema:object({connection:ref('Connection'),token:string})}}},'403':errorResponse}}};
  const browserErrors={'400':browserAuthError,'401':browserAuthError,'403':browserAuthError,'404':browserAuthError,'409':browserAuthError,'429':rateResponse};
  const browserSecurity=[{browserSession:[]}];
  const intent={name:'X-Strata-Intent',in:'header',required:true,schema:{const:'connections'}};
  const idParameter={name:'id',in:'path',required:true,schema:string};
  const jsonBody=(schema:object)=>({required:true,content:{'application/json':{schema}}});
  const jsonSuccess=(schema:object)=>({description:'Success',content:{'application/json':{schema}}});
  const client=object({id:string,name:string,redirectUris:array(string)},['id','name','redirectUris']);
  const serviceAccount=object({id:string,name:string,username:string,ownerUserId:string,assignments:array(string),resources:array(string),actions:array(string),key:{anyOf:[object({expiresAt:string,lastUsedAt:nullableString,revokedAt:nullableString}),{type:'null'}]}});
  const serviceKeyResponse=jsonSuccess(object({account:serviceAccount,token:string}));
  paths['/api/connections/catalog']={get:{summary:'Browser only: available resources, actions and expiration choices',security:browserSecurity,parameters:[{name:'service',in:'query',schema:{const:'1'}},{name:'serviceAccount',in:'query',schema:string,description:'Owned service account ID. Limits choices to its current assignments and owner authority.'}],responses:{'200':jsonSuccess(object({resources:array(object({id:string,label:string,actions:array(string)})),actions:array(object({id:string,label:string,level:string})),levels:{...array(string),description:'Access levels in ascending order for role presets. Account permissions form a separate preset.'},expiries:array({enum:KEY_EXPIRIES})})),...browserErrors}}};
  paths['/api/connections/service-accounts']={
    get:{summary:'Browser only: list owned service accounts',security:browserSecurity,responses:{'200':jsonSuccess(object({items:array(serviceAccount)})),...browserErrors}},
    post:{summary:'Browser only: create a service account and its first key',security:browserSecurity,parameters:[intent],requestBody:jsonBody(inputSchema(keySchema)),responses:{'201':serviceKeyResponse,...browserErrors}},
  };
  paths['/api/connections/service-accounts/{id}/key']={
    post:{summary:'Browser only: replace a service key with explicit access and expiry',security:browserSecurity,parameters:[idParameter,intent],requestBody:jsonBody(inputSchema(keySchema)),responses:{'201':serviceKeyResponse,...browserErrors}},
    delete:{summary:'Browser only: revoke the active service key',security:browserSecurity,parameters:[idParameter,intent],responses:{'204':{description:'Revoked'},...browserErrors}},
  };
  paths['/api/connections/service-accounts/{id}/assignments']={put:{summary:'Browser only: replace service account administrative assignments and revoke its key if changed',security:browserSecurity,parameters:[idParameter,intent],requestBody:jsonBody(inputSchema(serviceAssignmentsSchema)),responses:{'200':jsonSuccess(object({account:serviceAccount})),...browserErrors}}};
  paths['/api/connections/service-accounts/{id}/transfer']={post:{summary:'Browser only: transfer to an active administrator; revoke previous key',security:browserSecurity,parameters:[idParameter,intent],requestBody:jsonBody(object({username:string,confirmation:{const:'TRANSFER'}})),responses:{'204':{description:'Ownership transferred'},...browserErrors}}};
  paths['/api/connections/{id}']={delete:{summary:'Browser only: revoke own connection and every token in its family',security:browserSecurity,parameters:[idParameter,intent],responses:{'204':{description:'Revoked'},...browserErrors}}};
  paths['/api/connections/clients']={
    get:{summary:'Browser only: list own public clients (maximum 100)',security:browserSecurity,responses:{'200':jsonSuccess(object({items:array(client)})),...browserErrors}},
    post:{summary:'Browser only: register exact public-client callbacks',security:browserSecurity,parameters:[intent],requestBody:jsonBody(inputSchema(clientSchema)),responses:{'201':jsonSuccess(object({client})),...browserErrors}},
  };
  const consent=object({id:string,kind:{enum:['device','code']},clientId:string,name:string,scopes:array({enum:SCOPES}),resources:array(string),expiresAt:string,connectionExpiresAt:string,userCode:nullableString,redirectUri:nullableString});
  paths['/api/connections/requests']={get:{summary:'Browser only: inspect a pending request using exactly one user_code or request_id',security:browserSecurity,parameters:['user_code','request_id'].map(name=>({name,in:'query',schema:string})),responses:{'200':jsonSuccess(object({request:consent})),...browserErrors}}};
  paths['/api/connections/requests/{id}/decision']={post:{summary:'Browser only: explicitly approve or deny once; device flow requires its matching code',security:browserSecurity,parameters:[idParameter,intent],requestBody:jsonBody(inputSchema(decisionSchema)),responses:{'200':jsonSuccess(object({status:{enum:['approved','denied']},redirectUri:string},['status'])),...browserErrors}}};
  paths['/api/auth/needs-bootstrap']={get:{summary:'Browser account lifecycle: inspect initial setup; not an agent credential flow',security:[],responses:{'200':jsonSuccess(object({needsBootstrap:boolean}))}}};
  for(const [path,schema,status] of [['bootstrap',bootstrapSchema,'201'],['login',loginSchema,'200'],['recovery-key/consume',recoveryConsumeSchema,'200']] as const) {
    paths[`/api/auth/${path}`]={post:{summary:`Browser account lifecycle: ${path}; agents must use Device Authorization or PKCE`,security:[],requestBody:jsonBody(inputSchema(schema)),responses:{[status]:jsonSuccess(path==='recovery-key/consume'?object({newRecoveryKey:string}):ref('State')),...(path==='recovery-key/consume'?{'400':browserAuthError,'401':browserAuthError,'500':browserAuthError}:path==='bootstrap'?{'400':browserAuthError,'409':browserAuthError,'500':browserAuthError}:{'400':browserAuthError,'401':browserAuthError})}}};
  }
  for (const [route, methods] of Object.entries(paths)) {
    if (route.startsWith('/api/v1/')) continue;
    for (const [method, value] of Object.entries(methods)) {
      const doc=value as Record<string,unknown>;
      doc.tags=[route.includes('/oauth')||route.startsWith('/.well-known')?'oauth':route.startsWith('/api/connections')?'connections':'auth'];
      if (route.startsWith('/api/connections')) {
        doc['x-required-scopes']=[];
        doc['x-key-actions']=[];
        doc['x-resource-policy']='Bearer credentials cannot call this endpoint. Browser mutations require X-Strata-Intent and reject cross-origin submissions.';
        doc['x-ownership-policy']=route.includes('/requests')?'Requires a pending approval request. A matching device code is required for device decisions.':'Browser operations apply to the signed-in account’s own connections, registrations or service accounts.';
        if (route.includes('/service-accounts')) doc['x-role-policy']=route.endsWith('/transfer')?'Current administrator; recipient must also be an active administrator.':'Current System, Workspace or Board Admin.';
        if(route==='/api/connections' && method==='post') doc.responses={...browserErrors,...(doc.responses as object)};
      }
    }
  }
  return {openapi:'3.1.0',info:{title:'Strata supported API',version:'1.0.0',description:'Version 1 reuses Web UI validation, RBAC, lifecycle and audit behavior. Scopes never override roles. Each request reloads live authority and intersects its issuance ceiling. See /api/docs for setup, resource semantics, secure storage and retry guidance.'},servers:[{url:'/'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'Opaque PAT or OAuth access token'},browserSession:{type:'apiKey',in:'cookie',name:process.env.STRATA_SESSION_COOKIE??'strata_session',description:'Browser-only management; never provide cookie sessions to agents.'}},schemas}};
}
export function createApiDocumentationRoutes() {
  const router=Router();
  const contract=JSON.stringify(createOpenApi());
  const contractId=createHash('sha256').update(contract).digest('hex');
  router.get('/api/v1/openapi.json',requireTls,(_request,response)=>response.set('X-Strata-Contract-SHA256',contractId).type('json').send(contract));
  router.get('/.well-known/oauth-authorization-server',requireTls,(request,response)=>{
    const issuer=publicOrigin(request);
    response.json({issuer,authorization_endpoint:`${issuer}/api/oauth/authorize`,device_authorization_endpoint:`${issuer}/api/oauth/device/authorization`,token_endpoint:`${issuer}/api/oauth/token`,revocation_endpoint:`${issuer}/api/oauth/revoke`,response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token','urn:ietf:params:oauth:grant-type:device_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:SCOPES});
  });
  const root=fs.existsSync(path.resolve('dist/api.html'))?'dist':'public';
  const serve=(file:string)=>(_request:Request,response:Response)=>{
    response.set({'Cache-Control':'no-cache','Referrer-Policy':'no-referrer'}).sendFile(path.resolve(root,file));
  };
  router.get('/api/docs',serve('api.html'));
  for(const asset of ['style.css','reference.js','contract.js']) router.get(`/api/docs/${asset}`,serve(`api-reference/${asset}`));
  return router;
}
