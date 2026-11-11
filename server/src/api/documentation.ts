import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { API_OPERATIONS, type ApiOperation } from './operations';
import { SCOPES, grantSchema, keySchema, KEY_EXPIRIES } from './contract';
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
  if(path.endsWith('/members') || path.endsWith('/eligible-users')) return paged(object({id:string,name:string,username:string,initials:string,color:string,role:{enum:['member','observer']}},['id','name','username','initials','color']));
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
const errorResponse={description:'Safe error. Inspect code; do not retry a write blindly.',content:{'application/json':{schema:ref('Error')}}};
export function createOpenApi() {
  const paths:Record<string,Record<string,unknown>>={};
  for(const operation of API_OPERATIONS) {
    const parameters:object[]=[];
    for(const match of operation.path.matchAll(/:(\w+)/g)) parameters.push({name:match[1],in:'path',required:true,schema:string});
    if(operation.query) {
      const json=inputSchema(operation.query);
      for(const [name,schema] of Object.entries(json.properties ?? {})) parameters.push({name,in:'query',required:json.required?.includes(name)??false,schema});
    } else if(operation.method==='GET' && /^\/(workspaces|boards|lists|cards|automation-rules|notifications)$/.test(operation.path)) {
      for(const [name,schema] of Object.entries({limit:{type:'integer',minimum:1,maximum:100,default:25},cursor:{type:'string',maxLength:2000},boardId:string,workspaceId:string})) parameters.push({name,in:'query',schema});
    }
    if(operation.path==='/content-operations' && operation.method==='POST') parameters.push({name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',format:'uuid'},description:'Unique per approved connection and request. Reuse only with identical request and plan. A different connection cannot replay this receipt.'});
    const pathKey=`/api/v1${operation.path.replace(/:(\w+)/g,'{$1}')}`;
    const success=successStatus(operation);
    const noContent=success==='204';
    const responses:Record<string,unknown>={ ...(success?{[success]:{description:'Success under current application authorization.',...(noContent?{}:{content:{'application/json':{schema:responseSchema(operation)}}})}}:{}),'400':errorResponse,'401':{...errorResponse,description:'Missing, expired or revoked credential. Reauthenticate; never use browser cookies as API fallback.',headers:{'WWW-Authenticate':{schema:string}}},'403':{...errorResponse,description:'Scope, approved resource boundary or current RBAC denies access. Reapproval may be required.'},'404':errorResponse,'409':{...errorResponse,description:'Revision, plan, lifecycle or idempotency conflict. Reload state and preview again.'},'429':{...errorResponse,description:'Rate limit exceeded. Wait Retry-After seconds and use backoff with jitter.',headers:{'Retry-After':{schema:{type:'integer',minimum:1}}}},'500':{...errorResponse,description:'Server failure. Reconcile state before retrying a non-idempotent write.'}};
    if(operation.path==='/content-operations') responses['201']=responses['200'];
    const body=operation.body?inputSchema(operation.body):operation.method==='DELETE' && operation.path==='/admin/users/:userId'?object({confirmation:{const:'DELETE'}}):null;
    (paths[pathKey]??={})[operation.method.toLowerCase()]={summary:operation.summary,operationId:`${operation.method.toLowerCase()}_${operation.path.replace(/[^\w]+/g,'_')}`,tags:[operation.path.split('/')[1]],security:[{bearerAuth:[]}],parameters,'x-required-scopes':operation.scopes,'x-key-actions':documentedActions(operation),'x-resource-policy':operation.platform?'platform and current System Admin':'Approved resources intersect current membership, roles and issuance authority ceiling.',...(body?{requestBody:{required:true,content:{'application/json':{schema:body}}}}:{}),responses};
  }
  const oauthBody=(properties:Record<string,object>)=>({required:true,content:{'application/x-www-form-urlencoded':{schema:object(properties)}}});
  paths['/api/oauth/device/authorization']={post:{summary:'Begin public-client Device Authorization',security:[],requestBody:oauthBody({client_id:string,scope:string,resource:string}),responses:{'200':{description:'Display user_code and verification_uri. Poll only after interval seconds.',content:{'application/json':{schema:object({device_code:string,user_code:string,verification_uri:string,verification_uri_complete:string,expires_in:integer,interval:integer})}}},'400':{description:'OAuth error'},'429':errorResponse}}};
  paths['/api/oauth/token']={post:{summary:'Redeem device/code or rotate refresh token',security:[],requestBody:{required:true,content:{'application/x-www-form-urlencoded':{schema:{oneOf:[object({grant_type:{const:'urn:ietf:params:oauth:grant-type:device_code'},client_id:string,device_code:string}),object({grant_type:{const:'authorization_code'},client_id:string,code:string,redirect_uri:string,code_verifier:{type:'string',minLength:43,maxLength:128}}),object({grant_type:{const:'refresh_token'},client_id:string,refresh_token:string})]}}}},responses:{'200':{description:'Store securely. Access ≤600 seconds; refresh rotation preserves grant expiry.',content:{'application/json':{schema:ref('Token')}}},'400':{description:'authorization_pending: continue after interval; slow_down: add 5 seconds to every subsequent interval; access_denied/expired_token/invalid_grant: stop. Refresh reuse revokes the entire family.',content:{'application/json':{schema:ref('OAuthError')}}},'429':errorResponse}}};
  paths['/api/oauth/authorize']={get:{summary:'Begin public-client authorization code flow with S256 PKCE',security:[],parameters:Object.entries({client_id:string,response_type:{const:'code'},redirect_uri:{type:'string',format:'uri'},scope:string,resource:string,state:{type:'string',minLength:16,maxLength:512},code_challenge:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$'},code_challenge_method:{const:'S256'}}).map(([name,schema])=>({name,in:'query',required:true,schema})),responses:{'303':{description:'Continue to browser approval. Exact pre-registered redirect, state and S256 verifier are mandatory.'},'400':errorResponse}}};
  for(const [suffix,properties] of Object.entries<Record<string,object>>({revoke:{client_id:string,token:string},'device/cancel':{client_id:string,device_code:string}})) paths[`/api/oauth/${suffix}`]={post:{summary:suffix==='revoke'?'Revoke the connection using a bound token':'Cancel a device request and any issued connection',security:[],requestBody:oauthBody(properties),responses:{[suffix==='revoke'?'200':'204']:{description:'Idempotent success'},'400':errorResponse}}};
  paths['/api/connections']={get:{summary:'Browser only: list own connection metadata (no secret)',security:[{browserSession:[]}],responses:{'200':{description:'Latest connections, active first; maximum 200.',content:{'application/json':{schema:object({items:array(ref('Connection'))})}}}}},post:{summary:'Browser only: create an explicitly approved PAT',security:[{browserSession:[]}],parameters:[{name:'X-Strata-Intent',in:'header',required:true,schema:{const:'connections'}}],requestBody:{required:true,content:{'application/json':{schema:{oneOf:[inputSchema(keySchema),inputSchema(grantSchema)]}}}},responses:{'201':{description:'One-time secret. Copy to protected storage; never log it.',content:{'application/json':{schema:object({connection:ref('Connection'),token:string})}}},'403':errorResponse}}};
  const browserErrors={'400':errorResponse,'401':errorResponse,'403':errorResponse,'404':errorResponse,'409':errorResponse,'429':{...errorResponse,headers:{'Retry-After':{schema:integer}}}};
  const browserSecurity=[{browserSession:[]}];
  const intent={name:'X-Strata-Intent',in:'header',required:true,schema:{const:'connections'}};
  const idParameter={name:'id',in:'path',required:true,schema:string};
  const jsonBody=(schema:object)=>({required:true,content:{'application/json':{schema}}});
  const jsonSuccess=(schema:object)=>({description:'Success',content:{'application/json':{schema}}});
  const client=object({id:string,name:string,redirectUris:array(string)},['id','name','redirectUris']);
  const serviceAccount=object({id:string,name:string,resources:array(string),actions:array(string),key:{anyOf:[object({expiresAt:string,lastUsedAt:nullableString,revokedAt:nullableString}),{type:'null'}]}});
  const serviceKeyResponse=jsonSuccess(object({account:serviceAccount,token:string}));
  paths['/api/connections/catalog']={get:{summary:'Browser only: available resources, actions and expiration choices',security:browserSecurity,parameters:[{name:'service',in:'query',schema:{const:'1'}}],responses:{'200':jsonSuccess(object({resources:array(object({id:string,label:string,actions:array(string)})),actions:array(object({id:string,label:string,level:string})),expiries:array({enum:KEY_EXPIRIES})})),...browserErrors}}};
  paths['/api/connections/service-accounts']={
    get:{summary:'Browser only: list owned service accounts',security:browserSecurity,responses:{'200':jsonSuccess(object({items:array(serviceAccount)})),...browserErrors}},
    post:{summary:'Browser only: create a service account and its first key',security:browserSecurity,parameters:[intent],requestBody:jsonBody(inputSchema(keySchema)),responses:{'201':serviceKeyResponse,...browserErrors}},
  };
  paths['/api/connections/service-accounts/{id}/key']={
    post:{summary:'Browser only: replace a service key with explicit access and expiry',security:browserSecurity,parameters:[idParameter,intent],requestBody:jsonBody(inputSchema(keySchema)),responses:{'201':serviceKeyResponse,...browserErrors}},
    delete:{summary:'Browser only: revoke the active service key',security:browserSecurity,parameters:[idParameter,intent],responses:{'204':{description:'Revoked'},...browserErrors}},
  };
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
    paths[`/api/auth/${path}`]={post:{summary:`Browser account lifecycle: ${path}; agents must use Device Authorization or PKCE`,security:[],requestBody:jsonBody(inputSchema(schema)),responses:{[status]:jsonSuccess(ref('State')),'400':errorResponse,'401':errorResponse,'409':errorResponse}}};
  }
  return {openapi:'3.1.0',info:{title:'Strata supported API',version:'1.0.0',description:'Version 1 reuses Web UI validation, RBAC, lifecycle and audit behavior. Scopes never override roles. Each request reloads live authority and intersects its issuance ceiling. See /api/docs for setup, resource semantics, secure storage and retry guidance.'},servers:[{url:'/'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',bearerFormat:'Opaque PAT or OAuth access token'},browserSession:{type:'apiKey',in:'cookie',name:process.env.STRATA_SESSION_COOKIE??'strata_session',description:'Browser-only management; never provide cookie sessions to agents.'}},schemas}};
}
export function createApiDocumentationRoutes() {
  const router=Router();
  router.get('/api/v1/openapi.json',requireTls,(_request,response)=>response.json(createOpenApi()));
  router.get('/.well-known/oauth-authorization-server',requireTls,(request,response)=>{
    const issuer=publicOrigin(request);
    response.json({issuer,authorization_endpoint:`${issuer}/api/oauth/authorize`,device_authorization_endpoint:`${issuer}/api/oauth/device/authorization`,token_endpoint:`${issuer}/api/oauth/token`,revocation_endpoint:`${issuer}/api/oauth/revoke`,response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token','urn:ietf:params:oauth:grant-type:device_code'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:SCOPES});
  });
  router.get('/api/docs',(_request,response)=>{
    const built=path.resolve('dist/api.html');
    response.sendFile(fs.existsSync(built)?built:path.resolve('public/api.html'));
  });
  return router;
}
