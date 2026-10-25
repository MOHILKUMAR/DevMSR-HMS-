import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument, serializeOpenApi } from './openapi-document.js';

const committedSpec = new URL('../../../../docs/openapi.json', import.meta.url);

describe('OpenAPI contract', () => {
  it('docs/openapi.json matches the routes (run pnpm api:spec after changing a route)', async () => {
    const generated = serializeOpenApi(await generateOpenApiDocument());
    expect(readFileSync(committedSpec, 'utf8').replace(/\r\n/g, '\n')).toBe(generated);
  });

  it('documents the permission, CSRF header and error body of every operation', async () => {
    const document = await generateOpenApiDocument();
    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const op = operation as { 'x-permission'?: string; parameters?: { name: string }[]; responses: Record<string, unknown> };
        expect(op['x-permission'], `${method} ${path}`).toBeDefined();
        expect(op.responses['default'], `${method} ${path}`).toBeDefined();
        if (method !== 'get') {
          expect(op.parameters?.map((p) => p.name), `${method} ${path}`).toContain('X-CSRF-Token');
        }
      }
    }
  });
});
