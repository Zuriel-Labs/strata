// OpenAPI data is untrusted. Resolve local pointers only; never fetch a reference.
export const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const GROUPS = {
  workspaces: 'Workspaces and collections', collections: 'Workspaces and collections',
  boards: 'Boards and labels', lists: 'Lists', cards: 'Cards and collaboration',
  'automation-rules': 'Automation', notifications: 'Notifications',
  auth: 'Account and navigation', me: 'Account and navigation', state: 'Account and navigation',
  admin: 'Administration and membership', connections: 'Connections and service accounts',
  oauth: 'OAuth and discovery', 'content-operations': 'Copy, move and delete',
};
export const fragment = (method, path) => '#op-' + method.toLowerCase() + '-' + encodeURIComponent(path);
export const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
export const entries = value => record(value) ? Object.entries(value) : [];
export const label = (value, fallback = 'Not documented') => typeof value === 'string' && value.trim() ? value : fallback;

export function resolve(document, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('#/')) return undefined;
  let current = document;
  try {
    for (const segment of decodeURIComponent(pointer.slice(2)).split('/')) {
      const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
      if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
      current = current[key];
    }
  } catch { return undefined; }
  return current;
}

export function indexContract(document) {
  if (!record(document) || !/^3\.1\.\d+$/.test(document.openapi)
    || !record(document.info) || !label(document.info.version, '') || !record(document.paths)) {
    throw new Error('invalid-contract');
  }
  const gaps = new Set();
  if (document.webhooks) gaps.add('Webhooks are outside the operation index.');
  const operations = [];
  for (const [path, item] of Object.entries(document.paths)) {
    if (!path.startsWith('/') || !record(item)) throw new Error('invalid-path');
    if (item.$ref) gaps.add('Path item references are not expanded. Consult the OpenAPI JSON.');
    for (const method of METHODS) {
      if (!Object.hasOwn(item, method)) continue;
      const data = item[method];
      if (!record(data)) throw new Error('invalid-operation');
      const tags = strings(data.tags);
      const tag = tags.find(name => Object.hasOwn(GROUPS, name));
      const scopes = strings(data['x-required-scopes']);
      const actions = strings(data['x-key-actions']);
      const security = data.security ?? document.security;
      const id = fragment(method, path);
      if (data.callbacks) gaps.add('Callbacks are not indexed. Consult the OpenAPI JSON.');
      if (!record(data.responses)) gaps.add('One or more operations do not specify responses.');
      operations.push({
        id, path, method: method.toUpperCase(), data, scopes, actions, security,
        title: label(data.summary, label(data.operationId, method.toUpperCase() + ' ' + path)),
        group: tag ? GROUPS[tag] : 'Other operations',
        parameters: [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(data.parameters) ? data.parameters : [])],
        search: [method, path, data.summary, data.operationId, data.description, ...tags, ...scopes, ...actions,
          data['x-action-policy'], data['x-role-policy'], data['x-resource-policy'], data['x-ownership-policy'],
          ...(Array.isArray(security) ? security.flatMap(option => entries(option).flatMap(([name, values]) => [name, ...strings(values)])) : []),
        ].filter(value => typeof value === 'string').join(' ').toLowerCase(),
      });
    }
  }
  operations.sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return { operations, gaps: [...gaps] };
}
