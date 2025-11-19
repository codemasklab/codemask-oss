/**
 * Identifier naming style detection
 */
export enum Style {
  CAMEL,
  PASCAL,
  SNAKE,
  SCREAMING_SNAKE,
  UNKNOWN
}

/**
 * Detect the naming style of an identifier
 */
export function detectStyle(identifier: string): Style {
  if (!identifier || identifier.length === 0) {
    return Style.UNKNOWN;
  }
  
  // SCREAMING_SNAKE: all caps with underscores
  if (/^[A-Z_][A-Z0-9_]*$/.test(identifier) && identifier.includes('_')) {
    return Style.SCREAMING_SNAKE;
  }
  
  // SNAKE: lowercase with underscores
  if (/^[a-z_][a-z0-9_]*$/.test(identifier) && identifier.includes('_')) {
    return Style.SNAKE;
  }
  
  // PASCAL: starts with uppercase, no underscores (or only internal)
  if (/^[A-Z][a-zA-Z0-9]*$/.test(identifier)) {
    return Style.PASCAL;
  }
  
  // CAMEL: starts with lowercase, contains uppercase
  if (/^[a-z][a-zA-Z0-9]*$/.test(identifier) && /[A-Z]/.test(identifier)) {
    return Style.CAMEL;
  }
  
  // Default to camel if starts lowercase
  if (/^[a-z]/.test(identifier)) {
    return Style.CAMEL;
  }
  
  return Style.UNKNOWN;
}

