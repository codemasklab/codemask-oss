/**
 * Reserved keywords per language
 */

const JS_TS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
  'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'enum', 'implements', 'interface', 'let', 'package', 'private', 'protected',
  'public', 'static', 'true', 'false', 'null', 'undefined', 'async', 'await',
  'abstract', 'as', 'assert', 'boolean', 'byte', 'char', 'double', 'float',
  'from', 'get', 'of', 'set', 'symbol', 'type', 'use'
]);

const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield'
]);

/**
 * Check if a token is a reserved keyword for the given language
 */
export function isReservedKeyword(token: string, lang: string): boolean {
  const normalized = token.toLowerCase();
  
  if (lang === 'javascript' || lang === 'typescript' || lang === 'js' || lang === 'ts') {
    return JS_TS_KEYWORDS.has(normalized);
  }
  
  if (lang === 'python' || lang === 'py') {
    return PYTHON_KEYWORDS.has(normalized.toLowerCase()) || PYTHON_KEYWORDS.has(token);
  }
  
  // Default: check JS/TS as fallback
  return JS_TS_KEYWORDS.has(normalized);
}

