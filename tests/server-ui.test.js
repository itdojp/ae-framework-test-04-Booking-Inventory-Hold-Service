import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './helpers/server-harness.js';

test('server ui: /ui と静的アセットを配信できる', async () => {
  const port = 5000 + Math.floor(Math.random() * 100);
  const stateFile = path.join(os.tmpdir(), `bi-ui-${process.pid}-${Date.now()}.json`);
  const server = await startServer({ port, stateFile });

  try {
    const htmlRes = await fetch(`${server.baseUrl}/ui`);
    assert.equal(htmlRes.status, 200);
    assert.match(htmlRes.headers.get('content-type') ?? '', /text\/html/);
    const html = await htmlRes.text();
    assert.match(html, /Operations Console/);

    const jsRes = await fetch(`${server.baseUrl}/ui/app.js`);
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('content-type') ?? '', /application\/javascript/);

    const cssRes = await fetch(`${server.baseUrl}/ui/styles.css`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('content-type') ?? '', /text\/css/);
  } finally {
    await server.stop();
  }
});
