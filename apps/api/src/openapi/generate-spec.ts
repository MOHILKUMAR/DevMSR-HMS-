// `pnpm api:spec` runs this after `nest build`: node dist/openapi/generate-spec.js <output.json>
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateOpenApiDocument, serializeOpenApi } from './openapi-document.js';

const output = process.argv[2];
if (output === undefined) {
  throw new Error('Usage: node dist/openapi/generate-spec.js <output.json>');
}
const document = await generateOpenApiDocument();
writeFileSync(resolve(output), serializeOpenApi(document));
process.stdout.write(`Wrote ${String(Object.keys(document.paths).length)} paths to ${output}\n`);
