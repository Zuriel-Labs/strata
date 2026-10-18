import { apiRequest } from './api';
export interface BoardCollection { id: string; workspaceId: string; name: string; revision: number; boardIds: string[] }
export function fetchCollections(workspaceId: string, cursor?: string) { return apiRequest<{ items: BoardCollection[]; nextCursor: string | null }>(`/api/workspaces/${workspaceId}/collections${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`); }
export function createCollection(workspaceId: string, name: string) { return apiRequest<BoardCollection>(`/api/workspaces/${workspaceId}/collections`, { method: 'POST', body: JSON.stringify({ name }) }); }
export function renameCollection(collection: BoardCollection, name: string) { return apiRequest(`/api/collections/${collection.id}`, { method: 'PATCH', body: JSON.stringify({ name, expectedRevision: collection.revision }) }); }
export function removeCollection(collection: BoardCollection) { return apiRequest(`/api/collections/${collection.id}`, { method: 'DELETE', body: JSON.stringify({ expectedRevision: collection.revision }) }); }
export function setCollectionBoard(collectionId: string, boardId: string, included: boolean) { return apiRequest(`/api/collections/${collectionId}/boards/${boardId}`, { method: included ? 'PUT' : 'DELETE', body: '{}' }); }
