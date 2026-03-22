import { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * Validate a NextRequest JSON body against a Zod schema.
 *
 * @returns `{ data }` on success, or `{ error, status }` on failure.
 */
export async function validateRequestBody<T>(
  req: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ data: T } | { error: string; status: number }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: 'Invalid JSON', status: 400 };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { error: message, status: 400 };
  }

  return { data: result.data };
}
