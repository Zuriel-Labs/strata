import { entries, fragment, indexContract, label, record, resolve } from './contract.js';

const $ = id => document.getElementById(id);
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = String(text);
  if (className) element.className = className;
  return element;
};
const link = (href, text) => {
  const element = make('a', text);
  element.href = href;
  return element;
};
const fold = (title, content, open = false) => {
  const element = make('details');
  element.open = open;
  element.append(make('summary', title), content);
  return element;
};
const json = data => JSON.stringify(data, null, 2);
const line = (parent, key, value) => {
  const p = make('p');
  p.append(make('strong', key + ': '), document.createTextNode(value));
  parent.append(p);
};
function sample(title, value) {
  const box = make('div', undefined, 'sample');
  const head = make('div', undefined, 'sample-head');
  const button = make('button', 'Copy');
  button.type = 'button';
  button.setAttribute('aria-label', 'Copy ' + title);
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      $('announcer').textContent = title + ' copied.';
    } catch { $('announcer').textContent = 'Copy unavailable. Select and copy the text.'; }
  };
  head.append(make('strong', title), button);
  const pre = make('pre');
  pre.append(make('code', value));
  box.append(head, pre);
  return box;
}

function schemaNode(document, schema, name, required, trail = [], depth = 0) {
  if (typeof schema === 'boolean') return make('p', name + (schema ? ': any value' : ': no value allowed'));
  if (!record(schema)) return make('p', name + ': Not documented');
  const body = make('div', undefined, 'schema-body');
  const heading = name + (required === undefined ? '' : required ? ' · required' : ' · optional')
    + (schema.type ? ' · ' + [].concat(schema.type).join(' or ') : '');
  if (schema.description) body.append(make('p', schema.description));
  if (schema.readOnly) body.append(make('p', 'Read only'));
  if (schema.writeOnly) body.append(make('p', 'Write only'));
  if (depth >= 9) {
    body.append(make('p', 'Further nesting: see the OpenAPI JSON.'));
    return fold(heading, body);
  }
  if (schema.$ref) {
    const target = resolve(document, schema.$ref);
    body.append(make('p', 'Reference: ' + schema.$ref));
    if (trail.includes(schema.$ref)) body.append(make('p', 'Recursive reference. See the OpenAPI JSON.'));
    else if (target === undefined) body.append(make('p', 'Unresolved or external reference. No external fetch was made.'));
    else body.append(schemaNode(document, target, 'Referenced schema', undefined, [...trail, schema.$ref], depth + 1));
  }
  const child = (sub, childName, needed) => body.append(schemaNode(document, sub, childName, needed, trail, depth + 1));
  for (const [key, sub] of entries(schema.properties)) child(sub, key, Array.isArray(schema.required) && schema.required.includes(key));
  for (const key of ['items', 'additionalProperties', 'propertyNames', 'not', 'contains', 'if', 'then', 'else']) {
    if (Object.hasOwn(schema, key)) child(schema[key], key);
  }
  for (const key of ['anyOf', 'allOf', 'oneOf', 'prefixItems']) {
    if (Array.isArray(schema[key])) {
      body.append(make('p', { anyOf: 'Any listed variant', allOf: 'All listed variants', oneOf: 'Exactly one listed variant', prefixItems: 'Tuple items' }[key]));
      schema[key].forEach((sub, i) => child(sub, 'Variant ' + (i + 1)));
    }
  }
  const constraints = [
    'format', 'const', 'enum', 'default', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
    'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties', 'pattern', 'multipleOf', 'uniqueItems',
  ];
  for (const key of constraints) if (Object.hasOwn(schema, key)) line(body, key, json(schema[key]));
  const handled = new Set([...constraints, '$ref', '$schema', '$defs', 'title', 'description', 'readOnly', 'writeOnly', 'type',
    'properties', 'required', 'items', 'additionalProperties', 'propertyNames', 'not', 'contains', 'if', 'then', 'else',
    'anyOf', 'allOf', 'oneOf', 'prefixItems']);
  const other = Object.keys(schema).filter(key => !handled.has(key));
  if (other.length) line(body, 'See OpenAPI JSON for', other.join(', '));
  if (!body.childNodes.length) body.append(make('p', 'No additional constraints documented.'));
  return fold(heading, body, depth === 0);
}

function component(document, value) {
  const seen = new Set();
  while (record(value) && value.$ref) {
    if (seen.has(value.$ref)) return undefined;
    seen.add(value.$ref);
    value = resolve(document, value.$ref);
  }
  return record(value) ? value : undefined;
}
function content(document, parent, variants, kind) {
  for (const [type, details] of entries(variants)) {
    const body = make('div');
    if (details?.schema !== undefined) body.append(schemaNode(document, details.schema, 'Schema'));
    else body.append(make('p', 'Schema: Not documented.'));
    if (Object.hasOwn(details ?? {}, 'example')) body.append(sample('Synthetic ' + kind + ' example', json(details.example)));
    for (const [name, value] of entries(details?.examples)) {
      const example = component(document, value);
      if (Object.hasOwn(example ?? {}, 'value')) body.append(sample('Synthetic example: ' + name, json(example.value)));
      else body.append(make('p', 'Example ' + name + ' has no local inline value.'));
    }
    if (!Object.hasOwn(details ?? {}, 'example') && !entries(details?.examples).length)
      body.append(make('p', 'No verified synthetic ' + kind + ' example is published for this media type.'));
    parent.append(fold(type, body, true));
  }
}

function showAuth(spec, operation, parent) {
  const security = operation.security;
  const choices = make('ul');
  if (!Array.isArray(security)) parent.append(make('p', 'HTTP authentication: Not documented.'));
  else if (!security.length) parent.append(make('p', 'No prior HTTP credential. Inputs, client or account checks may still apply.'));
  else {
    for (const choice of security) {
      const names = entries(choice).map(([name, scopes]) => {
        const scheme = component(spec, spec.components?.securitySchemes?.[name]);
        const type = name === 'browserSession' ? 'Browser session only'
          : name === 'bearerAuth' ? 'Bearer — personal API key, service account key or OAuth access token (subject to policy)'
          : name + (scheme?.type ? ' (' + scheme.type + ')' : '');
        return type + (Array.isArray(scopes) && scopes.length ? ': ' + scopes.join(', ') : '');
      });
      choices.append(make('li', names.join(' AND ') || 'No prior HTTP credential'));
    }
    parent.append(make('p', 'Accepted alternatives:'), choices);
  }
  line(parent, 'Required connection scopes', Array.isArray(operation.data['x-required-scopes']) ? operation.scopes.join(', ') || 'None' : 'Not documented');
  line(parent, 'Connection actions', Array.isArray(operation.data['x-key-actions']) ? operation.actions.join(', ') || 'None' : 'Not documented');
  if (operation.data['x-action-policy']) parent.append(make('p', operation.data['x-action-policy']));
  line(parent, 'Required role', label(operation.data['x-role-policy']));
  line(parent, 'Resource restrictions', label(operation.data['x-resource-policy']));
  line(parent, 'Ownership and membership', label(operation.data['x-ownership-policy']));
  parent.append(link('#permissions', 'How scopes, actions and roles work'));
}
function params(spec, operation, parent) {
  const effective = new Map();
  let unresolved = 0;
  for (const raw of operation.parameters) {
    const parameter = component(spec, raw);
    if (!parameter) { unresolved++; continue; }
    effective.set(parameter.in + ':' + parameter.name, parameter);
  }
  for (const parameter of effective.values()) {
    const box = make('div');
    if (parameter.description) box.append(make('p', parameter.description));
    const style = parameter.style ?? ({ query: 'form', cookie: 'form', path: 'simple', header: 'simple' })[parameter.in];
    if (style) line(box, 'Serialization', style + ' · explode ' + (parameter.explode ?? (style === 'form')));
    if (parameter.allowReserved) box.append(make('p', 'Reserved characters allowed.'));
    if (parameter.schema !== undefined) box.append(schemaNode(spec, parameter.schema, 'Value'));
    if (parameter.content) content(spec, box, parameter.content, 'parameter');
    parent.append(fold(label(parameter.name) + ' · ' + label(parameter.in) + ' · ' + (parameter.required ? 'required' : 'optional'), box));
  }
  if (unresolved) parent.append(make('p', unresolved + ' parameter reference(s) could not be resolved.'));
  if (!effective.size && !unresolved) parent.append(make('p', 'No parameters documented.'));
}

function requestTemplate(operation, body) {
  // Keep external URLs and contract strings out of the shell, except known
  // method/URL/header syntax and a single-quoted JSON literal.
  if (!Array.isArray(operation.security) || operation.security.some(choice =>
    !record(choice) || Object.keys(choice).some(name => name !== 'bearerAuth'))) return null;
  const bearer = operation.security.some(choice => Object.hasOwn(choice, 'bearerAuth'));
  if ( !/^\/(?:[A-Za-z0-9._/-]|\{\w+\})+$/.test(operation.path)) return null;
  const shell = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const url = location.origin + operation.path.replace(/\{(\w+)\}/g, (_, key) => 'YOUR_' + key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase());
  const parts = ['curl --request ' + operation.method, '--url ' + shell(url), "--header 'Accept: application/json'"];
  if (bearer) parts.push("--header 'Authorization: Bearer YOUR_API_KEY'");
  const media = body?.content?.['application/json'];
  if (body?.required && !Object.hasOwn(media ?? {}, 'example')) return null;
  // Required query/headers cannot be silently omitted from a curl example.
  if (operation.parameters.some(raw => !record(raw) || raw.$ref || (raw.required && raw.in !== 'path'))) return null;
  if (Object.hasOwn(media ?? {}, 'example')) parts.push("--header 'Content-Type: application/json'", '--data ' + shell(JSON.stringify(media.example)));
  return parts.join(' ' + String.fromCharCode(92) + '\n  ');
}

document.documentElement.classList.add('js');
const theme = $('theme');
theme.hidden = false;
theme.onclick = () => {
  const light = document.documentElement.dataset.theme === 'light';
  document.documentElement.dataset.theme = light ? 'dark' : 'light';
  theme.textContent = light ? 'Light theme' : 'Dark theme';
};

const mobile = matchMedia('(max-width: 48rem)');
function showIndex(open) {
  $('toggle-index').setAttribute('aria-expanded', String(open));
  $('toggle-index').textContent = open ? 'Hide operation index' : 'Show operation index';
  $('index-body').classList.toggle('mobile-open', open);
}
$('toggle-index').onclick = () => showIndex($('toggle-index').getAttribute('aria-expanded') !== 'true');

let spec;
let indexed = [];
let byId = new Map();
function renderOperation(operation) {
  const { data } = operation;
  const detail = $('operation');
  detail.replaceChildren();
  const head = make('div', undefined, 'operation-head');
  head.append(make('p', operation.group + ' / API ' + spec.info.version, 'eyebrow'));
  const title = make('h2', operation.title);
  title.tabIndex = -1;
  head.append(title, make('p', operation.method + ' ' + operation.path, 'operation-path'), link(operation.id, 'Link to this operation'));
  if (data.deprecated) head.append(make('p', 'Deprecated', 'notice'));
  if (data.description) head.append(make('p', data.description));
  detail.append(head);
  const section = name => {
    const element = make('section', undefined, 'operation-section');
    element.append(make('h3', name));
    detail.append(element);
    return element;
  };
  showAuth(spec, operation, section('Authentication and access'));
  params(spec, operation, section('Parameters'));
  const request = section('Request body');
  const body = component(spec, data.requestBody);
  if (body) {
    request.append(make('p', body.required ? 'Required' : 'Optional'));
    if (body.description) request.append(make('p', body.description));
    content(spec, request, body.content, 'request');
  } else request.append(make('p', data.requestBody ? 'Request body reference could not be resolved.' : 'No request body documented.'));
  const curl = requestTemplate(operation, body);
  if (curl) {
    if (!['GET','HEAD','OPTIONS'].includes(operation.method)) request.append(make('p', 'Review write effects before using this template.'));
    request.append(sample('Request template · replace placeholders', curl));
  }
  else request.append(make('p', 'No verified curl template. Use the documented parameters and content types, or the Strata UI for browser session flows.'));
  const responses = section('Responses');
  for (const [status, raw] of entries(data.responses)) {
    const res = component(spec, raw);
    const result = make('div');
    result.append(make('p', label(res?.description)));
    for (const [name, rawHeader] of entries(res?.headers)) {
      const header = component(spec, rawHeader);
      const box = make('div');
      if (header?.description) box.append(make('p', header.description));
      if (header?.schema !== undefined) box.append(schemaNode(spec, header.schema, 'Value'));
      else if (header?.content) content(spec, box, header.content, 'header');
      else box.append(make('p', 'Not documented'));
      result.append(fold(name, box));
    }
    if (entries(res?.content).length) content(spec, result, res.content, 'response');
    else result.append(make('p', /^(204|304)$/.test(status) ? 'No response body.' : 'Response body: Not documented.'));
    if (entries(res?.links).length) result.append(make('p', 'OpenAPI links: ' + entries(res.links).map(([key]) => key).join(', ') + '. See OpenAPI JSON for targets.'));
    responses.append(fold(status + ' · ' + label(res?.description), result, /^2/.test(status)));
  }
  if (!entries(data.responses).length) responses.append(make('p', 'No response statuses documented.'));
  const related = Array.isArray(data['x-related-operations']) ? data['x-related-operations'] : [];
  const links = related.filter(pair => Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'string'))
    .map(([method, path]) => byId.get(fragment(method, path))).filter(Boolean);
  if (links.length) {
    const list = make('ul');
    for (const item of links) {
      const row = make('li');
      row.append(link(item.id, item.method + ' ' + item.path));
      list.append(row);
    }
    section('Related operations').append(list);
  }
  return title;
}

function renderIndex() {
  const query = $('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const method = $('method').value, group = $('area').value;
  const active = location.hash;
  const groups = new Map();
  let count = 0;
  for (const item of indexed) {
    if (method && item.method !== method || group && item.group !== group || !query.every(term => item.search.includes(term))) continue;
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
    count++;
  }
  const previouslyOpen = new Set([...$('groups').querySelectorAll('details[open]')].map(el => el.dataset.group));
  const focused = document.activeElement?.dataset?.operation ?? document.activeElement?.closest('details')?.dataset?.group;
  const nodes = [];
  let restore;
  for (const [name, items] of groups) {
    const list = make('ul');
    for (const item of items) {
      const row = make('li');
      const a = link(item.id, '');
      a.dataset.operation = item.id;
      if (item.id === active) a.setAttribute('aria-current', 'location');
      if (item.id === focused) restore = a;
      a.append(make('span', item.method, 'method'), make('span', item.title));
      row.append(a);
      list.append(row);
    }
    const groupNode = fold(name + ' (' + items.length + ')', list,
      !!(query.length || method || group || items.some(item => item.id === active) || previouslyOpen.has(name)));
    groupNode.dataset.group = name;
    if (name === focused) restore = groupNode.querySelector('summary');
    nodes.push(groupNode);
  }
  $('groups').replaceChildren(...nodes);
  restore?.focus({ preventScroll: true });
  $('results').textContent = count ? count + ' of ' + indexed.length + ' operations' : 'No operations match. Clear the filters or try another search.';
}
function navigate(focus) {
  const hash = location.hash;
  const item = byId.get(hash);
  const detail = $('operation');
  detail.hidden = !item && !hash.startsWith('#op-');
  $('guides').hidden = !detail.hidden;
  if (hash === '#operations' && mobile.matches) {
    showIndex(true);
    if (focus) $('search').focus({ preventScroll: true });
  }
  if (item) {
    if (mobile.matches) showIndex(false);
    const heading = renderOperation(item);
    if (focus) { heading.focus({ preventScroll: true }); detail.scrollIntoView({ block: 'start' }); }
  } else if (!detail.hidden) {
    const heading = make('h2', 'Operation unavailable in this contract');
    heading.tabIndex = -1;
    detail.replaceChildren(heading, link('#operations', 'Browse operations'));
    if (focus) heading.focus();
  } else if (focus && hash) {
    // Only guide IDs authored in the page; contract data never supplies a selector.
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }
  renderIndex();
}
async function load() {
  $('filters').hidden = true;
  $('retry').hidden = true;
  $('gaps').hidden = true;
  $('groups').replaceChildren();
  $('results').textContent = 'Loading this deployment’s OpenAPI contract…';
  $('identity').textContent = '';
  $('operation').replaceChildren();
  $('operation').hidden = true;
  $('guides').hidden = false;
  try {
    const response = await fetch('/api/v1/openapi.json', { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) {
      $('results').textContent = response.status === 401 || response.status === 403
        ? 'This deployment denied access to its OpenAPI contract.' : 'OpenAPI contract unavailable.';
      $('retry').hidden = false;
      return;
    }
    let parsed;
    try {
      spec = await response.json();
      parsed = indexContract(spec);
    } catch {
      $('results').textContent = 'Invalid or unsupported OpenAPI contract.';
      $('retry').hidden = false;
      return;
    }
    indexed = parsed.operations;
    byId = new Map(indexed.map(item => [item.id, item]));
    if (!indexed.length) {
      $('results').textContent = 'This contract lists no supported operations.';
      $('retry').hidden = false;
      return;
    }
    const digest = response.headers.get('X-Strata-Contract-SHA256');
    $('identity').textContent = 'API ' + spec.info.version + ' · OpenAPI ' + spec.openapi
      + (/^[0-9a-f]{64}$/.test(digest ?? '') ? ' · SHA-256 ' + digest : ' · Contract identity not documented');
    if (parsed.gaps.length) {
      $('gaps').textContent = parsed.gaps.join(' ');
      $('gaps').hidden = false;
    }
    for (const [id, values] of [['method', indexed.map(item => item.method)], ['area', indexed.map(item => item.group)]]) {
      const select = $(id);
      select.length = 1;
      for (const value of [...new Set(values)].sort()) {
        const option = make('option', value);
        option.value = value;
        select.append(option);
      }
    }
    $('filters').hidden = false;
    navigate(true);
  } catch {
    $('results').textContent = 'Could not load the OpenAPI contract. Check your connection and retry.';
    $('retry').hidden = false;
  }
}
$('filters').addEventListener('submit', event => event.preventDefault());
$('filters').addEventListener('input', renderIndex);
$('clear').onclick = () => {
  $('filters').reset();
  renderIndex();
  $('search').focus();
};
$('retry').onclick = load;
window.addEventListener('hashchange', () => {
  if (!$('filters').hidden) navigate(true);
});
load();
