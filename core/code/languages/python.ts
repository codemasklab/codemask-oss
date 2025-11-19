import { Range } from '../utils/ranges';
import {
  LanguageConfig,
  autoMask as baseAutoMask,
  selectMask as baseSelectMask,
  getSymbolList as baseGetSymbolList
} from './tree_sitter_base';
import type { SyntaxNode } from './tree_sitter_base';

/**
 * Common built-in Python identifiers to exclude from masking
 */
const PYTHON_BUILTINS = new Set([
  // Python built-in functions
  'print', 'len', 'range', 'str', 'int', 'float', 'bool', 'list', 'dict', 'tuple', 'set',
  'type', 'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'delattr',
  'abs', 'all', 'any', 'bin', 'chr', 'ord', 'dict', 'dir', 'divmod', 'enumerate',
  'eval', 'exec', 'filter', 'format', 'frozenset', 'globals', 'locals', 'hash',
  'hex', 'id', 'input', 'isinstance', 'issubclass', 'iter', 'len', 'list', 'map',
  'max', 'min', 'next', 'oct', 'open', 'ord', 'pow', 'print', 'range', 'repr',
  'reversed', 'round', 'set', 'slice', 'sorted', 'str', 'sum', 'tuple', 'type',
  'vars', 'zip', '__import__',
  // Python built-in types
  'object', 'type', 'bool', 'int', 'float', 'complex', 'str', 'bytes', 'bytearray',
  'list', 'tuple', 'dict', 'set', 'frozenset',
  // Python built-in constants
  'None', 'True', 'False', 'Ellipsis', 'NotImplemented',
  // Common standard library
  'sys', 'os', 'json', 're', 'math', 'random', 'datetime', 'time', 'collections',
  'itertools', 'functools', 'operator', 'pathlib', 'urllib', 'http', 'socket',
  // Common properties/methods
  'self', 'cls', '__init__', '__str__', '__repr__', '__len__', '__getitem__',
  '__setitem__', '__delitem__', '__iter__', '__next__', '__enter__', '__exit__'
]);

/**
 * Python language configuration
 * This preserves the exact logic from the original python.ts file
 */
const PYTHON_CONFIG: LanguageConfig = {
  wasmFilename: 'tree-sitter-python.wasm',
  languageName: 'python',
  builtins: PYTHON_BUILTINS,
  identifierNodeTypes: [
    'identifier',
    'function_definition',
    'class_definition',
    'attribute',
    'parameter',
    'typed_parameter',
    'typed_default_parameter'
  ],
  isIdentifierNode: (node: SyntaxNode): boolean => {
    // Exact same logic as original collectIdentifiers
    const identifierTypes = [
      'identifier',
      'function_definition',
      'class_definition',
      'attribute',
      'parameter',
      'typed_parameter',
      'typed_default_parameter'
    ];
    return identifierTypes.includes(node.type);
  },
  extractIdentifierText: (node: SyntaxNode): string | null => {
    // Exact same logic as original collectIdentifiers
    // For function_definition and class_definition, the name is in a child node
    if (node.type === 'function_definition' || node.type === 'class_definition') {
      // Find the identifier child
      for (const child of node.children || []) {
        if (child && child.type === 'identifier') {
          const name = child.text;
          if (name && name.length > 0) {
            return name; // Return original text
          }
        }
      }
      return null;
    }
    
    // For attributes like obj.attr, collect the attribute name
    if (node.type === 'attribute') {
      // For attributes like obj.attr, collect the attribute name
      // Skip the first child (object), only collect the attribute name
      // This matches: child !== node.children?.[0]
      for (const child of node.children || []) {
        if (child && child.type === 'identifier' && child !== node.children?.[0]) {
          const name = child.text;
          if (name && name.length > 0) {
            return name; // Return original text
          }
        }
      }
      return null;
    }
    
    // Regular identifier
    const name = node.text;
    if (name && name.length > 0) {
      return name; // Return original text
    }
    return null;
  },
  isPropertyNode: (node: SyntaxNode): boolean => {
    // Exact same logic: properties are attribute nodes
    return node.type === 'attribute';
  },
  getMaskIndices: (node: SyntaxNode): { start: number; end: number } | null => {
    // For regular nodes, use their own indices (return null to use default)
    // The base will use node.startIndex and node.endIndex by default
    return null;
  }
};

/**
 * Auto-mask all identifiers in Python code
 * Preserves exact behavior from original python.ts
 */
export async function autoMask(
  code: string,
  namespace: string,
  secret: string,
  includeProperties: boolean = true
): Promise<{ masked: string; ranges: Range[] }> {
  return baseAutoMask(code, namespace, secret, PYTHON_CONFIG, includeProperties);
}

/**
 * Select-to-mask: mask only selected identifiers and string literals
 * Preserves exact behavior from original python.ts
 */
export async function selectMask(
  code: string,
  selected: string[],
  namespace: string,
  secret: string
): Promise<{ masked: string; ranges: Range[] }> {
  return baseSelectMask(code, selected, namespace, secret, PYTHON_CONFIG);
}

/**
 * Get list of all identifiers found in code (for UI symbol panel)
 * Preserves exact behavior from original python.ts
 */
export async function getSymbolList(code: string, excludeProperties: boolean = true): Promise<string[]> {
  return baseGetSymbolList(code, PYTHON_CONFIG, excludeProperties);
}
