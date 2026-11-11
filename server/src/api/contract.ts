import { z } from 'zod';

export const SCOPES = ['content:read', 'content:write', 'content:manage', 'administration:read', 'administration:write', 'account:read', 'account:write', 'account:security'] as const;
export type ApiScope = typeof SCOPES[number];
export const scopeSchema = z.array(z.enum(SCOPES)).min(1).max(SCOPES.length).refine(values => new Set(values).size === values.length);
export const resourceSchema = z.array(z.string().max(220).regex(/^(platform|account|(?:workspace|board):[^\s:]+)$/)).min(1).max(100).refine(values => new Set(values).size === values.length);
export const KEY_EXPIRIES = [1, 7, 30, 60, 90, 180] as const;
export const actionSchema = z.array(z.string().min(1).max(150)).min(1).max(150).refine(values => new Set(values).size === values.length);
export const keySchema = z.object({ name: z.string().trim().min(1).max(100), actions: actionSchema, resources: resourceSchema, expiresInDays: z.union(KEY_EXPIRIES.map(day => z.literal(day))), confirmation: z.literal('CREATE') }).strict();
export const grantSchema = z.object({ name: z.string().trim().min(1).max(100), scopes: scopeSchema, resources: resourceSchema, expiresInDays: z.number().int().min(1).max(90), confirmation: z.literal('CREATE') }).strict();
export type GrantInput = z.infer<typeof grantSchema>;
export interface AuthorityCeiling {
  system: boolean;
  workspaceAdmins: string[];
  boardAdmins: string[];
  memberships: { boardId: string; role: 'member' | 'observer' }[];
}
export interface ApiGrant {
  id: string; userId: string; name: string; kind: 'pat' | 'device' | 'code'; clientId: string | null;
  scopes: ApiScope[]; resources: string[]; actions: string[] | null; serviceAccountId: string | null; authority: AuthorityCeiling;
  expiresAt: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
}
export interface ApiCredential extends ApiGrant { tokenId: string }
export class ApiAuthorizationError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
