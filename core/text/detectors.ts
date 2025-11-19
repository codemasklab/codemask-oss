/**
 * Pattern detectors for sensitive text patterns
 */

export interface DetectedMatch {
  text: string;
  type: 'email' | 'url' | 'uuid' | 'phone';
  start: number;
  end: number;
}

// Email regex (RFC 5322 simplified)
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

// URL regex (http/https/ftp)
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+|ftp:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

// UUID regex (v4 format with and without hyphens)
// Standard format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
// No-hyphen format: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (32 hex chars)
const UUID_REGEX = /\b(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{32})\b/gi;

// Phone regex (various formats)
const PHONE_REGEX = /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;

/**
 * Detect emails in text
 */
export function detectEmails(text: string): DetectedMatch[] {
  const matches: DetectedMatch[] = [];
  let match;
  
  EMAIL_REGEX.lastIndex = 0;
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    matches.push({
      text: match[0],
      type: 'email',
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  return matches;
}

/**
 * Detect URLs in text
 */
export function detectUrls(text: string): DetectedMatch[] {
  const matches: DetectedMatch[] = [];
  let match;
  
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    matches.push({
      text: match[0],
      type: 'url',
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  return matches;
}

/**
 * Detect UUIDs in text
 */
export function detectUuids(text: string): DetectedMatch[] {
  const matches: DetectedMatch[] = [];
  let match;
  
  UUID_REGEX.lastIndex = 0;
  while ((match = UUID_REGEX.exec(text)) !== null) {
    matches.push({
      text: match[0],
      type: 'uuid',
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  return matches;
}

/**
 * Detect phone numbers in text
 */
export function detectPhones(text: string): DetectedMatch[] {
  const matches: DetectedMatch[] = [];
  let match;
  
  PHONE_REGEX.lastIndex = 0;
  while ((match = PHONE_REGEX.exec(text)) !== null) {
    matches.push({
      text: match[0],
      type: 'phone',
      start: match.index,
      end: match.index + match[0].length
    });
  }
  
  return matches;
}

/**
 * Run all detectors
 */
export function detectAll(text: string): DetectedMatch[] {
  const all = [
    ...detectEmails(text),
    ...detectUrls(text),
    ...detectUuids(text),
    ...detectPhones(text)
  ];
  
  // Sort by start position
  return all.sort((a, b) => a.start - b.start);
}

