import { AsyncLocalStorage } from 'node:async_hooks';
export const apiRequestContext = new AsyncLocalStorage<{ credentialId: string; operationId: string; serviceAccountId?: string; serviceAccountName?: string }>();
