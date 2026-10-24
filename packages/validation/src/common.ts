import { z } from 'zod';

/** Record IDs in URLs and bodies are always UUIDs, never names or phone numbers. */
export const uuidSchema = z.uuid();
