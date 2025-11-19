// Use require to avoid import issues
const fs = require('fs');
import { Range } from '../utils/ranges';
import { opaqueIdentToken, opaqueWordToken, opaqueNumericToken } from '../../mapping/token';
import { remember } from '../../mapping/store';

// Dynamic import for web-tree-sitter to handle ESM/CommonJS
let Parser: any = null;
let ParserModule: any = null;

export async function getParser(): Promise<any> {
  if (!ParserModule) {
    try {
      // Try dynamic import first (for ESM)
      ParserModule = await import('web-tree-sitter');
      // web-tree-sitter exports Parser as a named export
      Parser = ParserModule.Parser || ParserModule.default;
    } catch (e: any) {
      // Fallback to require (for CommonJS)
      try {
        ParserModule = require('web-tree-sitter');
        Parser = ParserModule.Parser || ParserModule.default;
      } catch (e2: any) {
        throw new Error(`Failed to load web-tree-sitter: ${e.message || e2.message}`);
      }
    }
    
    // Final check - Parser should have init() static method
    if (!Parser || typeof Parser.init !== 'function') {
      const available = ParserModule ? Object.keys(ParserModule).join(', ') : 'none';
      throw new Error(`Failed to load web-tree-sitter Parser class. Parser.init is not a function. Available exports: ${available}`);
    }
  }
  return Parser;
}

// Type imports (only for TypeScript)
export type Language = any;
export type SyntaxNode = {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  children: (SyntaxNode | null)[];
  rootNode?: SyntaxNode;
};

/**
 * Get path to grammar WASM file
 */
export function getGrammarWasmPath(filename: string): string {
  // Ensure filename is a string primitive
  const filenameStr = String(filename);
  if (!filenameStr || filenameStr.length === 0) {
    throw new Error(`getGrammarWasmPath: filename must be a non-empty string`);
  }
  
  // Get project root - ensure it's a string primitive
  const cwdRaw = process.cwd();
  const cwd = String(cwdRaw);
  if (!cwd || typeof cwd !== 'string') {
    throw new Error(`process.cwd() returned invalid value: ${typeof cwdRaw}`);
  }
  
  // Build paths using string operations only (avoid path module completely)
  const sep = process.platform === 'win32' ? '\\' : '/';
  
  // Construct paths as primitive strings
  const path1 = cwd + sep + 'app' + sep + 'grammars' + sep + filenameStr;
  const path2 = cwd + sep + 'dist' + sep + 'app' + sep + 'grammars' + sep + filenameStr;
  const searchPaths = [path1, path2];
  
  // Try each path
  for (let i = 0; i < searchPaths.length; i++) {
    const wasmPathRaw = searchPaths[i];
    
    // Convert to primitive string
    let wasmPath: string;
    try {
      wasmPath = String(wasmPathRaw);
      
      // Validate it's actually a string
      if (typeof wasmPath !== 'string') {
        continue;
      }
      
      // Normalize path separators
      const normalized = wasmPath.replace(/[\/\\]+/g, sep);
      const finalPath = String(normalized);
      
      // Final validation before fs operations
      if (typeof finalPath !== 'string' || finalPath.length === 0) {
        continue;
      }
      
      // Check if file exists - use the validated string
      try {
        // Extra validation right before fs.existsSync
        if (typeof finalPath !== 'string') {
          throw new Error(`Path validation failed: expected string, got ${typeof finalPath}`);
        }
        if (fs.existsSync(finalPath)) {
          const stats = fs.statSync(finalPath);
          if (stats.isFile()) {
            // Return as primitive string - ensure it's definitely a string
            const returnPath = String(finalPath);
            if (typeof returnPath !== 'string') {
              throw new Error(`Failed to create return path string: ${typeof returnPath}`);
            }
            return returnPath;
          }
        }
      } catch (e: any) {
        // File doesn't exist or other error - continue to next path
        continue;
      }
    } catch (e: any) {
      // Skip invalid paths
      continue;
    }
  }
  
  // If not found, return empty string
  return '';
}

/**
 * Load language from WASM file
 */
export async function loadLanguageFromWasm(filename: string): Promise<Language> {
  try {
    // Validate filename first
    if (typeof filename !== 'string') {
      throw new Error(`loadLanguageFromWasm: filename must be a string, got ${typeof filename}`);
    }
    
    // Import the module directly to access Language class (same as original Python code)
    const ParserModule = await import('web-tree-sitter').catch(() => require('web-tree-sitter'));
    const LanguageClass = ParserModule.Language;
    
    if (!LanguageClass || typeof LanguageClass.load !== 'function') {
      throw new Error('Language.load is not available. Make sure web-tree-sitter is properly installed.');
    }
    
    const wasmPathResult = getGrammarWasmPath(filename);
    
    if (!wasmPathResult || wasmPathResult.length === 0) {
      throw new Error(`WASM file not found: ${filename}`);
    }
    
    const finalPath = String(wasmPathResult);
    
    // In Node.js environment, Language.load() can accept a file path directly
    try {
      const language = await LanguageClass.load(finalPath);
      return language;
    } catch (e: any) {
      // Fallback: read and compile WASM manually
      const fs = require('fs');
      const wasmBytes = fs.readFileSync(finalPath);
      const arrayBuffer = new ArrayBuffer(wasmBytes.length);
      new Uint8Array(arrayBuffer).set(wasmBytes);
      const wasmModule = await WebAssembly.compile(arrayBuffer);
      const language = await LanguageClass.load(wasmModule);
      return language;
    }
  } catch (error: any) {
    console.error(`[loadLanguageFromWasm] Error type: ${typeof error}, message: ${error.message}`);
    // Re-throw with more context
    throw new Error(`loadLanguageFromWasm failed for ${filename}: ${error.message}`);
  }
}

/**
 * Language configuration interface
 */
export interface LanguageConfig {
  /** WASM filename (e.g., 'tree-sitter-python.wasm') */
  wasmFilename: string;
  /** Language name for token generation (e.g., 'python', 'javascript') */
  languageName: string;
  /** Built-in keywords/identifiers to exclude from masking */
  builtins: Set<string>;
  /** Node types that represent identifiers */
  identifierNodeTypes: string[];
  /** Function to check if a node is an identifier we want to mask */
  isIdentifierNode?: (node: SyntaxNode) => boolean;
  /** Function to extract identifier text from a node */
  extractIdentifierText?: (node: SyntaxNode) => string | null;
  /** Function to check if a node represents a property (for includeProperties option) */
  isPropertyNode?: (node: SyntaxNode) => boolean;
  /** Function to get start/end indices for masking (for nodes that need special handling) */
  getMaskIndices?: (node: SyntaxNode) => { start: number; end: number } | null;
}

/**
 * Initialize parser and load language
 */
export async function initializeLanguage(
  config: LanguageConfig
): Promise<{ parser: any; language: Language }> {
  const P = await getParser();
  await P.init();
  const parserInstance = new P();
  
  const language = await loadLanguageFromWasm(config.wasmFilename);
  if (!language || typeof language !== 'object') {
    throw new Error(`Failed to load ${config.languageName} language from WASM.`);
  }
  
  return { parser: parserInstance, language };
}

/**
 * Default identifier node checker
 */
export function defaultIsIdentifierNode(
  node: SyntaxNode,
  identifierNodeTypes: string[]
): boolean {
  return identifierNodeTypes.includes(node.type);
}

/**
 * Default identifier text extractor
 */
export function defaultExtractIdentifierText(node: SyntaxNode): string | null {
  return node.text || null;
}

/**
 * Extract the actual identifier node from a parent node (for function/class/attribute)
 * Returns the node that should be stored in the identifiers map, and the parent type for property detection
 */
function extractIdentifierNode(node: SyntaxNode, config: LanguageConfig): { node: SyntaxNode; parentType?: string } | null {
  // If extractIdentifierText is customized, we need to find the actual child node
  if (config.extractIdentifierText) {
    // For Bash function_definition: handle first since it uses 'word' type, not 'identifier'
    // Tree-sitter-bash structure: function_definition -> [identifier/word (name), '(', ')', ...]
    if (config.languageName === 'bash' && node.type === 'function_definition') {
      const extractedName = config.extractIdentifierText(node);
      if (extractedName) {
        // Find the child whose text matches the extracted function name
        for (const child of node.children || []) {
          if (!child) continue;
          // Bash uses 'identifier', 'word', or 'variable_name' for function names
          if (child.type === 'identifier' || child.type === 'word' || child.type === 'variable_name') {
            const childText = child.text || '';
            if (childText.toLowerCase() === extractedName.toLowerCase()) {
              return { node: child };
            }
          }
        }
      }
      // Fallback: look for first identifier/word child (before parentheses)
      for (const child of node.children || []) {
        if (!child) continue;
        // Skip keywords like 'function'
        if (child.type === 'keyword' && child.text === 'function') {
          continue;
        }
        // Find the identifier/word before '('
        if (child.type === 'identifier' || child.type === 'word' || child.type === 'variable_name') {
          // Skip if it's a keyword
          if (child.text === 'function' || child.text === 'if' || child.text === 'then' || child.text === 'else') {
            continue;
          }
          return { node: child };
        }
        // If we hit '(', we've passed the function name
        if (child.text === '(' || child.type === '(') {
          break;
        }
      }
      return null;
    }
    
    // For function/method/class declarations, the name is in a child identifier node
    // Note: Java uses 'class_declaration' while Python uses 'class_definition'
    // Go uses 'function_declaration' while Python uses 'function_definition'
    // C++ uses 'class_specifier' and 'struct_specifier'
    // Rust uses 'function_item', 'struct_item', 'enum_item', 'trait_item', 'impl_item', 'mod_item'
    // Ruby uses 'class' and 'module' (with 'constant' child for class name)
    // PHP uses 'function_definition', 'class_definition', 'method_definition', 'method_declaration', 'interface_definition', 'trait_definition'
    if (node.type === 'function_definition' || node.type === 'function_declaration' || node.type === 'function_item' ||
        node.type === 'class_definition' || node.type === 'class_declaration' || node.type === 'class_specifier' ||
        node.type === 'struct_specifier' || node.type === 'struct_item' ||
        node.type === 'namespace_definition' ||
        node.type === 'method_declaration' || node.type === 'method_definition' ||
        node.type === 'interface_declaration' || node.type === 'interface_definition' ||
        node.type === 'trait_definition' ||
        node.type === 'enum_item' || node.type === 'trait_item' || node.type === 'impl_item' || node.type === 'mod_item' ||
        node.type === 'type_declaration' || node.type === 'type_spec' ||
        node.type === 'class' || node.type === 'module' || node.type === 'method') {
      // Find the identifier child (could be 'identifier', 'type_identifier', 'constant', 'field_identifier', or 'name')
      // For Ruby, class names are 'constant' nodes
      // For PHP, method/class names are in 'name' nodes
      const isPHP = config.languageName === 'php';
      
      // For PHP, use extractIdentifierText to find the correct child
      if (isPHP && config.extractIdentifierText) {
        const extractedName = config.extractIdentifierText(node);
        if (extractedName) {
          // Find the child whose text matches the extracted name
          for (const child of node.children || []) {
            if (!child) continue;
            // PHP uses 'name' node type for function/class names
            if (child.type === 'name' || child.type === 'identifier') {
              const childText = child.text || '';
              const cleanChildText = childText.startsWith('$') ? childText.slice(1) : childText;
              if (cleanChildText.toLowerCase() === extractedName.toLowerCase()) {
                return { node: child };
              }
            }
          }
        }
        
        // Fallback: Look for 'name' node type first (PHP standard)
        for (const child of node.children || []) {
          if (!child) continue;
          if (child.type === 'name') {
            const childText = child.text || '';
            const cleanChildText = childText.startsWith('$') ? childText.slice(1) : childText;
            // Skip keywords
            if (!['function', 'class', 'interface', 'trait', 'public', 'private', 'protected', 'static', 'abstract', 'final'].includes(cleanChildText.toLowerCase())) {
              return { node: child };
            }
          }
        }
        
        // Fallback: Look for identifier after keywords
        let foundKeyword = false;
        for (const child of node.children || []) {
          if (!child) continue;
          // Track if we've seen a keyword
          if (child.type === 'keyword' || 
              (child.text && ['function', 'class', 'interface', 'trait', 'public', 'private', 'protected', 'static', 'abstract', 'final'].includes(child.text.toLowerCase()))) {
            foundKeyword = true;
            continue;
          }
          // After finding a keyword, look for identifier or name
          if (foundKeyword && (child.type === 'identifier' || child.type === 'name')) {
            const childText = child.text || '';
            const cleanChildText = childText.startsWith('$') ? childText.slice(1) : childText;
            // Skip if it's still a keyword
            if (!['function', 'class', 'interface', 'trait', 'public', 'private', 'protected', 'static', 'abstract', 'final'].includes(cleanChildText.toLowerCase())) {
              return { node: child };
            }
          }
        }
      } else {
        // For non-PHP languages, use standard logic
        for (const child of node.children || []) {
          if (child && (child.type === 'identifier' || child.type === 'type_identifier' || child.type === 'field_identifier' || child.type === 'constant' || child.type === 'name')) {
            return { node: child };
          }
        }
      }
      
      return null;
    }
    
    // For formal_parameter (Java/Python/PHP) and parameter (Rust), find the identifier child (the parameter name)
    if (node.type === 'formal_parameter' || node.type === 'parameter') {
      for (const child of node.children || []) {
        if (child && (child.type === 'identifier' || child.type === 'variable_name')) {
          return { node: child };
        }
      }
      return null;
    }
    
    // For field_declaration, variable_declarator, var_declaration, const_declaration, parameter_declaration, property_declaration, variable_name, find the identifier child
    if (node.type === 'field_declaration' || node.type === 'variable_declarator' ||
        node.type === 'var_declaration' || node.type === 'const_declaration' || node.type === 'parameter_declaration' ||
        node.type === 'property_declaration' || node.type === 'variable_name') {
      for (const child of node.children || []) {
        if (child && (child.type === 'identifier' || child.type === 'variable_name')) {
          return { node: child };
        }
      }
      // For variable_name, the node itself might be the identifier
      if (node.type === 'variable_name') {
        return { node };
      }
      return null;
    }
    
    // For scoped_identifier (like System.out or std::make_unique), get the last identifier child
    if (node.type === 'scoped_identifier') {
      const identifierChildren = (node.children || []).filter(c => c !== null && (c.type === 'identifier' || c.type === 'type_identifier')) as SyntaxNode[];
      if (identifierChildren.length > 0) {
        const lastChild = identifierChildren[identifierChildren.length - 1];
        return { node: lastChild };
      }
      return null;
    }
    
    // For field_identifier (C++ member variables in initializer lists)
    if (node.type === 'field_identifier') {
      return { node }; // Return the node itself since it's already the identifier
    }
    
    // For type_identifier (C++ types in inheritance, templates, etc.)
    if (node.type === 'type_identifier') {
      return { node }; // Return the node itself since it's already the identifier
    }
    
    // For constant (Ruby class names, etc.)
    if (node.type === 'constant') {
      return { node }; // Return the node itself since it's already the identifier
    }
    
    // For attributes like obj.attr, collect the attribute name (child node)
    // But we need to remember it came from an attribute node for property detection
    if (node.type === 'attribute') {
      // Skip the first child (object), only collect the attribute name
      for (const child of node.children || []) {
        if (child && child.type === 'identifier' && child !== node.children?.[0]) {
          // Store the child node, but mark it as coming from an attribute parent
          // We'll need to attach this info somehow...
          // Actually, we can store a wrapper or check if the node's parent in the tree is attribute
          // For now, let's attach a property to the node object
          return { node: child, parentType: 'attribute' }; // Return the child identifier node, but remember parent type
        }
      }
      return null;
    }
    
    // For PHP method calls: $obj->methodName()
    // Tree-sitter-php structure: member_call_expression -> [object, "->", name, arguments]
    if (config.languageName === 'php' && (node.type === 'member_call_expression' || node.type === 'method_call')) {
      if (config.extractIdentifierText) {
        const extractedName = config.extractIdentifierText(node);
        if (extractedName) {
          // Find the child whose text matches the extracted method name
          let foundArrow = false;
          for (const child of node.children || []) {
            if (!child) continue;
            
            // Look for "->" operator
            if (child.text === '->' || child.type === '->') {
              foundArrow = true;
              continue;
            }
            
            // After finding "->", the next name/identifier is the method name
            if (foundArrow && (child.type === 'name' || child.type === 'identifier')) {
              const childText = child.text || '';
              const cleanChildText = childText.startsWith('$') ? childText.slice(1) : childText;
              if (cleanChildText.toLowerCase() === extractedName.toLowerCase()) {
                return { node: child };
              }
            }
          }
        }
      }
      return null;
    }
    
    // For function calls: functionName() or \Namespace\functionName()
    if (config.languageName === 'php' && (node.type === 'call_expression' || node.type === 'scoped_call_expression')) {
      if (config.extractIdentifierText) {
        const extractedName = config.extractIdentifierText(node);
        if (extractedName) {
          // Find the child whose text matches the extracted function name
          for (const child of node.children || []) {
            if (!child) continue;
            
            if (child.type === 'name' || child.type === 'identifier') {
              const childText = child.text || '';
              const cleanChildText = childText.startsWith('$') ? childText.slice(1) : childText;
              if (cleanChildText.toLowerCase() === extractedName.toLowerCase()) {
                return { node: child };
              }
            }
            
            // For scoped calls, check qualified_name
            if (child.type === 'qualified_name') {
              const parts = child.text.split('\\');
              const lastPart = parts[parts.length - 1];
              if (lastPart.toLowerCase() === extractedName.toLowerCase()) {
                return { node: child };
              }
            }
          }
        }
      }
      return null;
    }
  }
  
  // For regular identifiers, return the node itself
  return { node };
}

/**
 * Collect identifiers from AST
 */
export function collectIdentifiers(
  node: SyntaxNode,
  identifiers: Map<string, SyntaxNode[]>,
  config: LanguageConfig,
  skipChildren: Set<SyntaxNode> = new Set()
): void {
  if (!node) return;
  
  const isIdentifierNode = config.isIdentifierNode || 
    ((n: SyntaxNode) => defaultIsIdentifierNode(n, config.identifierNodeTypes));
  const extractText = config.extractIdentifierText || defaultExtractIdentifierText;
  
  if (isIdentifierNode(node)) {
    const text = extractText(node);
    if (text && text.length > 0) {
      // Check builtins case-insensitively
      const textLower = text.toLowerCase();
      if (config.builtins.has(textLower)) {
        // Skip this built-in keyword/identifier
        // Continue recursing into children (don't collect it)
      } else {
        // Extract the actual identifier node (child node for function/class/attribute)
        const extracted = extractIdentifierNode(node, config);
        if (!extracted) {
          // If we couldn't extract a child node, continue recursing
          // (this handles cases where extractIdentifierText returns null)
        } else {
          const identifierNode = extracted.node;
          
          // Skip if this node was already collected (prevents duplicate collection)
          if (skipChildren.has(identifierNode)) {
            // Continue recursing but don't collect this node again
          } else {
            // Mark this node as collected so we don't collect it again when recursing
            skipChildren.add(identifierNode);
            
            // Attach parent type info to the node for property detection
            if (extracted.parentType) {
              (identifierNode as any).__parentType = extracted.parentType;
            }
            // Use lowercase as key for case-insensitive matching, but preserve original text in node
            const key = textLower;
            if (!identifiers.has(key)) {
              identifiers.set(key, []);
            }
            // Store the identifier node (child node for function/class/attribute, or node itself for regular identifiers)
            identifiers.get(key)!.push(identifierNode);
          }
        }
      }
    }
  }
  
  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      if (child !== null) {
        collectIdentifiers(child, identifiers, config, skipChildren);
      }
    }
  }
}

/**
 * Parse code and collect identifiers
 */
export async function parseAndCollect(
  code: string,
  config: LanguageConfig
): Promise<{
  identifiers: Map<string, SyntaxNode[]>;
  parser: any;
}> {
  const { parser, language } = await initializeLanguage(config);
  parser.setLanguage(language);
  
  const tree = parser.parse(code);
  const identifiers = new Map<string, SyntaxNode[]>();
  const skipChildren = new Set<SyntaxNode>();
  
  collectIdentifiers(tree.rootNode, identifiers, config, skipChildren);
  
  return { identifiers, parser };
}

/**
 * Auto-mask all identifiers in code
 */
export async function autoMask(
  code: string,
  namespace: string,
  secret: string,
  config: LanguageConfig,
  includeProperties: boolean = true
): Promise<{ masked: string; ranges: Range[] }> {
  const { identifiers } = await parseAndCollect(code, config);
  const ranges: Range[] = [];
  const existingTokens = new Set<string>();
  
  // Process identifiers
  for (const [key, nodes] of identifiers.entries()) {
    if (nodes.length === 0) continue;
    
    // Get the original text from the first node (preserves casing)
    const original = nodes[0].text || key;
    
    // Skip built-ins (case-insensitive check)
    if (config.builtins.has(original.toLowerCase())) {
      continue;
    }
    
    // Sanity check: skip if text is too long (likely a code block, not an identifier)
    if (original.length > 100 || original.includes('\n') || original.includes('\r') || original.includes('{') || original.includes('}')) {
      continue;
    }
    
    // Skip properties if not including them
    if (!includeProperties && config.isPropertyNode) {
      // Check if nodes came from attribute parents (stored via __parentType)
      // or if the node itself is a property node
      const isOnlyProperty = nodes.every(n => {
        // Check if node has parent type marker (from attribute extraction)
        if ((n as any).__parentType === 'attribute') {
          return true;
        }
        // Otherwise check using the config's isPropertyNode function
        return config.isPropertyNode!(n);
      });
      if (isOnlyProperty) {
        continue;
      }
    }
    
    // For PHP and Ruby variables, we need to handle prefixes specially
    // PHP: $variable
    // Ruby: @instance_var, @@class_var, $global_var
    const isPHP = config.languageName === 'php';
    const isRuby = config.languageName === 'ruby';
    
    // Extract prefix and identifier without prefix
    let prefix = '';
    let identifierWithoutPrefix = original;
    
    if (isPHP && original.startsWith('$')) {
      prefix = '$';
      identifierWithoutPrefix = original.slice(1);
    } else if (isRuby) {
      if (original.startsWith('@@')) {
        prefix = '@@';
        identifierWithoutPrefix = original.slice(2);
      } else if (original.startsWith('@')) {
        prefix = '@';
        identifierWithoutPrefix = original.slice(1);
      } else if (original.startsWith('$')) {
        prefix = '$';
        identifierWithoutPrefix = original.slice(1);
      }
    }
    
    // Get or create token (generate from identifier without prefix)
    const token = await remember('IDENT', namespace, identifierWithoutPrefix, () => {
      return opaqueIdentToken(identifierWithoutPrefix, config.languageName, namespace, secret, existingTokens);
    });
    
    existingTokens.add(token);
    
    // Create ranges for all occurrences
    for (const node of nodes) {
      let startIndex = node.startIndex;
      let endIndex = node.endIndex;
      
      // Use custom mask indices if provided
      if (config.getMaskIndices) {
        const indices = config.getMaskIndices(node);
        if (indices) {
          startIndex = indices.start;
          endIndex = indices.end;
        }
      }
      
      // Check if the code at this position has the prefix
      let replacement = token;
      if (prefix) {
        // Check if the code actually has the prefix at this position
        const prefixLength = prefix.length;
        const codeAtPosition = code.substring(startIndex, Math.min(startIndex + prefixLength, code.length));
        if (codeAtPosition === prefix) {
          // The prefix is part of the variable, so prepend it to the replacement token
          replacement = `${prefix}${token}`;
        }
      }
      
      ranges.push({
        start: startIndex,
        end: endIndex,
        replacement: replacement
      });
    }
  }
  
  return { masked: code, ranges };
}

/**
 * Select-to-mask: mask only selected identifiers and string literals
 */
export async function selectMask(
  code: string,
  selected: string[],
  namespace: string,
  secret: string,
  config: LanguageConfig
): Promise<{ masked: string; ranges: Range[] }> {
  if (selected.length === 0) {
    return { masked: code, ranges: [] };
  }
  
  const { identifiers } = await parseAndCollect(code, config);
  const ranges: Range[] = [];
  const existingTokens = new Set<string>();
  const selectedSet = new Set(selected.map(s => s.toLowerCase()));
  
  // Separate identifiers from string literals and numeric values
  const stringLiteralsToMask: string[] = [];
  const numericValuesToMask: string[] = [];
  const nonStringLiterals: string[] = [];
  
  for (const item of selected) {
    // Check if it's a string literal (starts and ends with quotes)
    const isStringLiteral = (item.startsWith('"') && item.endsWith('"')) ||
                           (item.startsWith("'") && item.endsWith("'")) ||
                           (item.startsWith('`') && item.endsWith('`'));
    
    if (isStringLiteral) {
      stringLiteralsToMask.push(item);
    } else {
      // Check if it's a numeric value (integer or decimal)
      const isNumeric = /^-?\d+(\.\d+)?$/.test(item.trim());
      if (isNumeric) {
        numericValuesToMask.push(item.trim());
      } else {
        nonStringLiterals.push(item);
      }
    }
  }
  
  // Track which items were successfully masked as identifiers
  const successfullyMaskedIdentifiers = new Set<string>();
  
  // Mask identifiers
  for (const [key, nodes] of identifiers.entries()) {
    if (nodes.length === 0) continue;
    
    // Get the original text from the first node (preserves casing)
    const original = nodes[0].text || key;
    
    if (!selectedSet.has(key)) {
      continue;
    }
    
    // For PHP and Ruby variables, we need to handle prefixes specially
    // PHP: $variable
    // Ruby: @instance_var, @@class_var, $global_var
    const isPHP = config.languageName === 'php';
    const isRuby = config.languageName === 'ruby';
    
    // Extract prefix and identifier without prefix
    let prefix = '';
    let identifierWithoutPrefix = original;
    
    if (isPHP && original.startsWith('$')) {
      prefix = '$';
      identifierWithoutPrefix = original.slice(1);
    } else if (isRuby) {
      if (original.startsWith('@@')) {
        prefix = '@@';
        identifierWithoutPrefix = original.slice(2);
      } else if (original.startsWith('@')) {
        prefix = '@';
        identifierWithoutPrefix = original.slice(1);
      } else if (original.startsWith('$')) {
        prefix = '$';
        identifierWithoutPrefix = original.slice(1);
      }
    }
    
    // Get or create token (generate from identifier without prefix)
    const token = await remember('IDENT', namespace, identifierWithoutPrefix, () => {
      return opaqueIdentToken(identifierWithoutPrefix, config.languageName, namespace, secret, existingTokens);
    });
    
    existingTokens.add(token);
    
    // Create ranges for all occurrences
    for (const node of nodes) {
      let startIndex = node.startIndex;
      let endIndex = node.endIndex;
      
      // Use custom mask indices if provided
      if (config.getMaskIndices) {
        const indices = config.getMaskIndices(node);
        if (indices) {
          startIndex = indices.start;
          endIndex = indices.end;
        }
      }
      
      // Check if the code at this position has the prefix
      let replacement = token;
      if (prefix) {
        // Check if the code actually has the prefix at this position
        const prefixLength = prefix.length;
        const codeAtPosition = code.substring(startIndex, Math.min(startIndex + prefixLength, code.length));
        if (codeAtPosition === prefix) {
          // The prefix is part of the variable, so prepend it to the replacement token
          replacement = `${prefix}${token}`;
        }
      }
      
      ranges.push({
        start: startIndex,
        end: endIndex,
        replacement: replacement
      });
    }
    
    // Mark this identifier as successfully masked
    successfullyMaskedIdentifiers.add(key);
  }
  
  // Mask string literals (find exact matches in code)
  for (const stringLiteral of stringLiteralsToMask) {
    // Get or create token for the string value (without quotes for token generation)
    const stringValue = stringLiteral.slice(1, -1); // Remove quotes
    const token = await remember('WORD', namespace, stringValue, () => {
      return opaqueWordToken(stringValue, namespace, secret, existingTokens);
    });
    
    existingTokens.add(token);
    
    // Find all occurrences of this string literal (exact match)
    // Preserve the original quote style
    const quoteChar = stringLiteral[0];
    let searchIndex = 0;
    while (true) {
      const index = code.indexOf(stringLiteral, searchIndex);
      if (index === -1) break;
      
      ranges.push({
        start: index,
        end: index + stringLiteral.length,
        replacement: `${quoteChar}${token}${quoteChar}` // Replace with masked token, preserving quote style
      });
      
      searchIndex = index + 1;
    }
  }
  
  // Mask numeric values
  for (const numericValue of numericValuesToMask) {
    // Get or create token for the numeric value (numeric-only token)
    const token = await remember('NUM', namespace, numericValue, () => {
      return opaqueNumericToken(numericValue, namespace, secret, existingTokens);
    });
    
    existingTokens.add(token);
    
    // Find all occurrences of this numeric value as a standalone number
    // Use word boundaries to match whole numbers, not parts of other numbers or identifiers
    const escapedNumeric = numericValue.replace(/\./g, '\\.');
    const numericRegex = new RegExp(`\\b${escapedNumeric}\\b`, 'g');
    
    let match;
    const matches: Array<{ start: number; end: number }> = [];
    while ((match = numericRegex.exec(code)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
    }
    
    // Add ranges in reverse order to avoid index shifting issues
    for (let i = matches.length - 1; i >= 0; i--) {
      const { start, end } = matches[i];
      ranges.push({
        start,
        end,
        replacement: token
      });
    }
  }
  
  // Handle identifiers that weren't found by AST parser but exist in code
  // These are items that weren't string literals, weren't numeric, and weren't successfully masked as identifiers
  const identifiersToMask = nonStringLiterals.filter(item => {
    return !successfullyMaskedIdentifiers.has(item.toLowerCase());
  });
  
  for (const identifier of identifiersToMask) {
    // For PHP and Ruby, detect if the identifier already has a prefix
    // PHP: $variable
    // Ruby: @instance_var, @@class_var, $global_var
    const isPHP = config.languageName === 'php';
    const isRuby = config.languageName === 'ruby';
    
    // Extract prefix and identifier without prefix
    let detectedPrefix = '';
    let identifierWithoutPrefix = identifier;
    
    if (isPHP && identifier.startsWith('$')) {
      detectedPrefix = '$';
      identifierWithoutPrefix = identifier.slice(1);
    } else if (isRuby) {
      if (identifier.startsWith('@@')) {
        detectedPrefix = '@@';
        identifierWithoutPrefix = identifier.slice(2);
      } else if (identifier.startsWith('@')) {
        detectedPrefix = '@';
        identifierWithoutPrefix = identifier.slice(1);
      } else if (identifier.startsWith('$')) {
        detectedPrefix = '$';
        identifierWithoutPrefix = identifier.slice(1);
      }
    }
    
    // Escape special regex characters for the identifier without prefix
    const escapedIdentifier = identifierWithoutPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns: Array<{ pattern: string; prefix: string }> = [];
    
    // Always search for the identifier without prefix (in case it appears without prefix in code)
    patterns.push({
      pattern: `(?:^|[^a-zA-Z0-9_])${escapedIdentifier}(?:[^a-zA-Z0-9_]|$)`,
      prefix: ''
    });
    
    // If identifier has a prefix, search for it with prefix
    if (detectedPrefix) {
      // Escape special regex characters in the prefix
      const escapedPrefix = detectedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push({
        pattern: `${escapedPrefix}${escapedIdentifier}(?:[^a-zA-Z0-9_]|$)`,
        prefix: detectedPrefix
      });
    }
    
    // For PHP, also search for $identifier pattern if identifier doesn't already have $
    if (isPHP && !detectedPrefix) {
      patterns.push({
        pattern: `\\$${escapedIdentifier}(?:[^a-zA-Z0-9_]|$)`,
        prefix: '$'
      });
    }
    
    // For Ruby, search for @identifier, @@identifier, and $identifier patterns if identifier doesn't already have prefix
    if (isRuby && !detectedPrefix) {
      patterns.push({
        pattern: `@${escapedIdentifier}(?:[^a-zA-Z0-9_]|$)`,
        prefix: '@'
      });
      patterns.push({
        pattern: `@@${escapedIdentifier}(?:[^a-zA-Z0-9_]|$)`,
        prefix: '@@'
      });
      patterns.push({
        pattern: `\\$${escapedIdentifier}(?:[^a-zA-Z0-9_]|$)`,
        prefix: '$'
      });
    }
    
    // Get or create token for the identifier WITHOUT prefix (for consistency)
    const token = await remember('IDENT', namespace, identifierWithoutPrefix, () => {
      return opaqueIdentToken(identifierWithoutPrefix, config.languageName, namespace, secret, existingTokens);
    });
    
    existingTokens.add(token);
    
    // Find all occurrences as identifiers
    const matches: Array<{ start: number; end: number; prefix: string }> = [];
    for (const { pattern, prefix } of patterns) {
      const identifierRegex = new RegExp(pattern, 'g');
      let match;
      while ((match = identifierRegex.exec(code)) !== null) {
        // Extract the actual identifier position
        let matchStart = match.index;
        let matchEnd = matchStart + match[0].length;
        
        // Account for leading non-identifier char
        if (match[0].match(/^[^a-zA-Z0-9_$@]/)) {
          matchStart += 1;
        }
        // Account for prefix
        if (prefix) {
          if (match[0].startsWith(prefix)) {
            // matchStart is already at the prefix, matchEnd needs adjustment
            matchEnd = matchStart + prefix.length + identifierWithoutPrefix.length;
          }
        } else {
          // For non-prefixed pattern, adjust end to exclude trailing non-identifier char
          matchEnd = matchStart + identifierWithoutPrefix.length;
        }
        
        matches.push({ start: matchStart, end: matchEnd, prefix });
      }
    }
    
    // Remove duplicate matches (same position)
    const uniqueMatches = new Map<string, { start: number; end: number; prefix: string }>();
    for (const match of matches) {
      const key = `${match.start}-${match.end}`;
      if (!uniqueMatches.has(key)) {
        uniqueMatches.set(key, match);
      }
    }
    
    // Add ranges in reverse order to avoid index shifting issues
    const sortedMatches = Array.from(uniqueMatches.values()).sort((a, b) => b.start - a.start);
    for (const { start, end, prefix } of sortedMatches) {
      ranges.push({
        start,
        end,
        replacement: prefix ? `${prefix}${token}` : token // Preserve prefix for PHP/Ruby variables
      });
    }
    
    // Mark as successfully masked so we don't try to mask it again as a string value
    // Use the identifier without prefix for tracking (case-insensitive)
    successfullyMaskedIdentifiers.add(identifierWithoutPrefix.toLowerCase());
    // Also mark the original identifier if it had a prefix
    if (detectedPrefix) {
      successfullyMaskedIdentifiers.add(identifier.toLowerCase());
    }
  }
  
  // Handle items that are string values without quotes
  // These are items that weren't string literals, weren't numeric, and weren't successfully masked as identifiers
  const stringValuesToMask = nonStringLiterals.filter(item => {
    return !successfullyMaskedIdentifiers.has(item.toLowerCase());
  });
  
  for (const stringValue of stringValuesToMask) {
    // Check if this value exists inside any string literal (any quote style)
    const escapedValue = stringValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quotePatterns = [
      { quote: '"', pattern: `"${escapedValue}"` },
      { quote: "'", pattern: `'${escapedValue}'` },
      { quote: '`', pattern: `\`${escapedValue}\`` }
    ];
    
    // Get or create token for the string value
    const token = await remember('WORD', namespace, stringValue, () => {
      return opaqueWordToken(stringValue, namespace, secret, existingTokens);
    });
    
    existingTokens.add(token);
    
    // Find all occurrences with any quote style
    for (const { quote, pattern } of quotePatterns) {
      let searchIndex = 0;
      while (true) {
        const index = code.indexOf(pattern, searchIndex);
        if (index === -1) break;
        
        ranges.push({
          start: index,
          end: index + pattern.length,
          replacement: `${quote}${token}${quote}` // Replace with masked token, preserving quote style
        });
        
        searchIndex = index + 1;
      }
    }
  }
  
  return { masked: code, ranges };
}

/**
 * Get list of all identifiers found in code (for UI symbol panel)
 * Filters out built-in globals and optionally property identifiers
 */
export async function getSymbolList(
  code: string,
  config: LanguageConfig,
  excludeProperties: boolean = true
): Promise<string[]> {
  const { identifiers } = await parseAndCollect(code, config);
  const filtered: string[] = [];
  
  for (const [key, nodes] of identifiers.entries()) {
    if (nodes.length === 0) continue;
    
    // Get the original text from the first node (preserves casing)
    const name = nodes[0].text || key;
    
    // Skip built-in globals (case-insensitive check)
    if (config.builtins.has(name.toLowerCase())) {
      continue;
    }
    
    // Sanity check: skip if text is too long or contains code structure (likely a code block, not an identifier)
    if (name.length > 100 || name.includes('\n') || name.includes('\r') || name.includes('{') || name.includes('}') || name.includes(';')) {
      continue;
    }
    
    // Optionally exclude property identifiers
    if (excludeProperties && config.isPropertyNode) {
      // Check if nodes came from attribute parents (stored via __parentType)
      // or if the node itself is a property node
      const isOnlyProperty = nodes.every(n => {
        // Check if node has parent type marker (from attribute extraction)
        if ((n as any).__parentType === 'attribute') {
          return true;
        }
        // Otherwise check using the config's isPropertyNode function
        return config.isPropertyNode!(n);
      });
      if (isOnlyProperty) {
        continue;
      }
    }
    
    filtered.push(name);
  }
  
  return filtered.sort();
}

