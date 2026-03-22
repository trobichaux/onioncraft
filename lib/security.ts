const DEFAULT_MAX_LENGTH = 1000;
const HTML_TAG_RE = /<[^>]*>/g;

/**
 * Sanitize a user-input string to prevent stored XSS.
 * Strips HTML tags, trims whitespace, enforces max length.
 */
export function sanitizeString(
  input: string,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string {
  return input.replace(HTML_TAG_RE, '').trim().slice(0, maxLength);
}

/**
 * Validate that a partition key doesn't allow cross-user data access.
 * Returns true only when the key matches the user's own ID or 'shared'.
 */
export function validatePartitionKey(
  userId: string,
  partitionKey: string,
): boolean {
  return partitionKey === userId || partitionKey === 'shared';
}

const MIN_KEY_LENGTH_FOR_MASK = 12;

/**
 * Mask an API key for safe logging.
 * Shows first 4 + last 4 characters; keys shorter than 12 chars become "****".
 */
export function maskApiKey(key: string): string {
  if (key.length < MIN_KEY_LENGTH_FOR_MASK) {
    return '****';
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
