import { apiRequest } from './api';
export const CONNECTION_SCOPES = {
  'content:read':'Read content','content:write':'Edit cards and comments','content:manage':'Manage boards and workspaces',
  'administration:read':'Read administration','administration:write':'Manage administration',
  'account:read':'Read account','account:write':'Edit account','account:security':'Change account security',
} as const;
export type ConnectionScope = keyof typeof CONNECTION_SCOPES;
export interface Connection { id:string;name:string;kind:'pat'|'device'|'code';scopes:ConnectionScope[];resources:string[];actions?:string[]|null;createdAt:string;expiresAt:string;lastUsedAt:string|null;revokedAt:string|null }
export interface ConsentRequest { id:string;kind:'device'|'code';name:string;clientId:string;scopes:ConnectionScope[];resources:string[];expiresAt:string;connectionExpiresAt:string;userCode:string|null;redirectUri:string|null }
const intent = {'X-Strata-Intent':'connections'};
export const fetchConnections = () => apiRequest<{items:Connection[]}>('/api/connections');
export interface KeyInput {name:string;actions:string[];resources:string[];expiresInDays:number;confirmation:'CREATE'}
export interface ConnectionCatalog { resources:{id:string;label:string;actions:string[]}[]; actions:{id:string;label:string;level:string}[]; levels:string[]; expiries:number[] }
export interface ServiceAccount { id:string;name:string;resources:string[];actions:string[];key:Pick<Connection,'expiresAt'|'lastUsedAt'|'revokedAt'>|null }
export const fetchConnectionCatalog = (service=false) => apiRequest<ConnectionCatalog>(`/api/connections/catalog${service?'?service=1':''}`);
export const createConnection = (input:KeyInput) => apiRequest<{connection:Connection;token:string}>('/api/connections',{method:'POST',headers:intent,body:JSON.stringify(input)});
export const revokeConnection = (id:string) => apiRequest<void>(`/api/connections/${encodeURIComponent(id)}`,{method:'DELETE',headers:intent});
export const inspectConsent = (query:{user_code:string}|{request_id:string}) => apiRequest<{request:ConsentRequest}>(`/api/connections/requests?${new URLSearchParams(query)}`);
export const decideConsent = (id:string,decision:'approve'|'deny',userCode?:string) => apiRequest<{status:string;redirectUri?:string}>(`/api/connections/requests/${encodeURIComponent(id)}/decision`,{method:'POST',headers:intent,body:JSON.stringify({decision,userCode,confirmation:true})});
export const registerClient = (name:string,redirectUris:string[]) => apiRequest<{client:{id:string;name:string;redirectUris:string[]}}>('/api/connections/clients',{method:'POST',headers:intent,body:JSON.stringify({name,redirectUris})});

const servicePath = '/api/connections/service-accounts';
export const fetchServiceAccounts = () => apiRequest<{items:ServiceAccount[]}>(servicePath);
export const createServiceKey = (input:KeyInput,id?:string) => apiRequest<{account:ServiceAccount;token:string}>(id ? `${servicePath}/${encodeURIComponent(id)}/key` : servicePath,{method:'POST',headers:intent,body:JSON.stringify(input)});
export const revokeServiceKey = (id:string) => apiRequest<void>(`${servicePath}/${encodeURIComponent(id)}/key`,{method:'DELETE',headers:intent});
export const transferServiceAccount = (id:string,username:string) => apiRequest<void>(`${servicePath}/${encodeURIComponent(id)}/transfer`,{method:'POST',headers:intent,body:JSON.stringify({username,confirmation:'TRANSFER'})});
