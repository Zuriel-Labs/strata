// @vitest-environment node

import type { AddressInfo } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { expect, it } from 'vitest';
import request from 'supertest';

it('binds the ephemeral test server to the loopback address used by its client', async () => {
  // Wildcard binds can send macOS tests to another process: supertest#907.
  const server = createHttpServer((_request, response) => response.end('owned test server'));
  let address: AddressInfo | null = null;
  server.once('listening', () => { address = server.address() as AddressInfo; });
  try {
    const response = await request(server).get('/').timeout({ response: 2000 });
    expect(response.text).toBe('owned test server');
    expect(address).toMatchObject({ address: '127.0.0.1', family: 'IPv4' });
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
