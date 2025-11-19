import * as crypto from 'crypto';
import { detectStyle, Style } from '../code/utils/style';
import { isReservedKeyword } from '../code/utils/reserved';

const BASE32_CHARS = 'abcdefghijklmnopqrstuvwxyz234567';
const LETTERS_ONLY = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS_ONLY = '0123456789';

/**
 * Analyze identifier pattern: letters only, numbers only, or mixed
 */
function analyzePattern(identifier: string): 'letters' | 'numbers' | 'mixed' {
  const hasLetters = /[a-zA-Z]/.test(identifier);
  const hasNumbers = /[0-9]/.test(identifier);
  
  if (hasLetters && hasNumbers) {
    return 'mixed';
  } else if (hasLetters) {
    return 'letters';
  } else if (hasNumbers) {
    return 'numbers';
  }
  // Default to letters if no pattern detected
  return 'letters';
}

/**
 * Convert HMAC-SHA256 to Base32 (first 12 chars, lowercase)
 */
export function hmac32(secret: string, message: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(message);
  const hash = hmac.digest();
  
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (let i = 0; i < Math.min(8, hash.length); i++) {
    value = (value << 8) | hash[i];
    bits += 8;
    
    while (bits >= 5) {
      result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  
  return result.substring(0, 12);
}

/**
 * Generate token core matching the pattern of the original identifier
 */
function generatePatternedCore(secret: string, message: string, pattern: 'letters' | 'numbers' | 'mixed', length: number = 12): string {
  let result = '';
  let charSet: string;
  
  switch (pattern) {
    case 'letters':
      charSet = LETTERS_ONLY;
      break;
    case 'numbers':
      charSet = NUMBERS_ONLY;
      break;
    case 'mixed':
      // Use Base32 which has both letters and numbers
      charSet = BASE32_CHARS;
      break;
  }
  
  // Generate enough characters by repeatedly hashing if needed
  let hashIndex = 0;
  
  while (result.length < length) {
    // Create hash with index to get different bytes if needed
    const hmac = crypto.createHmac('sha256', secret);
    const hashMessage = hashIndex === 0 ? message : `${message}|${hashIndex}`;
    hmac.update(hashMessage);
    const hash = hmac.digest();
    
    // Use bytes from hash to generate characters
    for (let i = 0; i < hash.length && result.length < length; i++) {
      const byte = hash[i];
      
      if (pattern === 'numbers') {
        // For numbers, use modulo 10
        result += charSet[byte % 10];
      } else {
        // For letters or mixed, use modulo charset length
        result += charSet[byte % charSet.length];
      }
    }
    
    hashIndex++;
    
    // Safety limit to prevent infinite loop
    if (hashIndex > 100) {
      break;
    }
  }
  
  return result.substring(0, length);
}

/**
 * Convert core string to camelCase (split into words and capitalize each word after the first)
 */
function toCamelCase(core: string, wordLength: number = 4): string {
  if (core.length === 0) return core;
  
  let result = '';
  let i = 0;
  let isFirstWord = true;
  
  while (i < core.length) {
    const chunk = core.substring(i, Math.min(i + wordLength, core.length));
    if (isFirstWord) {
      result += chunk.toLowerCase();
      isFirstWord = false;
    } else {
      // Capitalize first letter of subsequent words
      result += chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase();
    }
    i += wordLength;
  }
  
  return result;
}

/**
 * Render opaque token according to style template
 */
export function renderOpaque(core: string, style: Style): string {
  switch (style) {
    case Style.CAMEL:
      // Convert to camelCase: first word lowercase, subsequent words capitalized
      return 'v' + toCamelCase(core);
    case Style.PASCAL:
      // Convert to PascalCase: first letter of each word capitalized
      const pascalCore = toCamelCase(core);
      return 'V' + pascalCore.charAt(0).toUpperCase() + pascalCore.slice(1);
    case Style.SNAKE:
      return 'v_' + core;
    case Style.SCREAMING_SNAKE:
      return 'V_' + core.toUpperCase();
    case Style.UNKNOWN:
    default:
      return 'v' + core;
  }
}

/**
 * Ensure token starts with [A-Za-z_]
 */
function ensureValidStart(token: string): string {
  if (/^[A-Za-z_]/.test(token)) {
    return token;
  }
  return 'v' + token;
}

/**
 * Check if token contains any substring of original (case-insensitive)
 */
function containsOriginal(token: string, original: string): boolean {
  const tokenLower = token.toLowerCase();
  const originalLower = original.toLowerCase();
  
  // Check all possible substrings of original
  for (let i = 0; i < originalLower.length; i++) {
    for (let j = i + 1; j <= originalLower.length; j++) {
      const substr = originalLower.substring(i, j);
      if (substr.length >= 3 && tokenLower.includes(substr)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Generate opaque, deterministic token for an identifier
 */
export function opaqueIdentToken(
  original: string,
  lang: string,
  namespace: string,
  secret: string,
  existingTokens: Set<string> = new Set()
): string {
  let attempt = 0;
  let token: string;
  let core: string;
  
  // Analyze the pattern of the original identifier
  const pattern = analyzePattern(original);
  
  do {
    // Build message: namespace|language|original|attempt
    const message = attempt === 0 
      ? `${namespace}|${lang}|${original}`
      : `${namespace}|${lang}|${original}|${attempt}`;
    
    // Generate core matching the pattern
    core = generatePatternedCore(secret, message, pattern, 12);
    
    // Detect style and render
    const style = detectStyle(original);
    token = renderOpaque(core, style);
    
    // Ensure valid start (must start with letter or underscore)
    // For numbers-only identifiers, we need to add a prefix
    if (pattern === 'numbers') {
      // Numbers-only identifiers need a letter prefix for valid JS identifier
      token = 'v' + token;
    } else {
      token = ensureValidStart(token);
    }
    
    // Check for original substring (case-insensitive)
    if (containsOriginal(token, original)) {
      attempt++;
      continue;
    }
    
    // Check reserved keywords
    if (isReservedKeyword(token, lang)) {
      // Append _x or incrementing suffix
      let suffix = '_x';
      let counter = 1;
      while (existingTokens.has(token + suffix) || isReservedKeyword(token + suffix, lang)) {
        suffix = `_${counter}`;
        counter++;
      }
      token = token + suffix;
    }
    
    // Check collision with existing tokens
    if (existingTokens.has(token)) {
      let suffix = '_x';
      let counter = 1;
      while (existingTokens.has(token + suffix)) {
        suffix = `_${counter}`;
        counter++;
      }
      token = token + suffix;
    }
    
    // Final check for original
    if (containsOriginal(token, original)) {
      attempt++;
      continue;
    }
    
    break;
  } while (attempt < 10); // Safety limit
  
  return token;
}

/**
 * Generate token for text words (plain format)
 */
export function opaqueWordToken(
  original: string,
  namespace: string,
  secret: string,
  existingTokens: Set<string> = new Set()
): string {
  let attempt = 0;
  let token: string;
  
  do {
    const message = attempt === 0
      ? `WORD|${namespace}|${original}`
      : `WORD|${namespace}|${original}|${attempt}`;
    
    const core = hmac32(secret, message);
    token = `MASKWORD_${core.toUpperCase()}`;
    
    // Check for original substring
    if (containsOriginal(token, original)) {
      attempt++;
      continue;
    }
    
    // Check collision
    if (existingTokens.has(token)) {
      let suffix = '_x';
      let counter = 1;
      while (existingTokens.has(token + suffix)) {
        suffix = `_${counter}`;
        counter++;
      }
      token = token + suffix;
    }
    
    break;
  } while (attempt < 10);
  
  return token;
}

/**
 * Generate email-format token (user@domain.com)
 */
export function opaqueEmailToken(
  original: string,
  namespace: string,
  secret: string,
  existingTokens: Set<string> = new Set()
): string {
  let attempt = 0;
  let token: string;
  
  do {
    const message = attempt === 0
      ? `EMAIL|${namespace}|${original}`
      : `EMAIL|${namespace}|${original}|${attempt}`;
    
    // Generate random username part (5-10 chars)
    const userCore = generatePatternedCore(secret, `${message}|user`, 'letters', 8);
    const username = userCore.substring(0, 8).toLowerCase();
    
    // Generate random domain part (5-10 chars)
    const domainCore = generatePatternedCore(secret, `${message}|domain`, 'letters', 8);
    const domain = domainCore.substring(0, 8).toLowerCase();
    
    // Generate random TLD (2-4 chars)
    const tldCore = generatePatternedCore(secret, `${message}|tld`, 'letters', 3);
    const tld = tldCore.substring(0, 3).toLowerCase();
    
    token = `${username}@${domain}.${tld}`;
    
    // Check for original substring
    if (containsOriginal(token, original)) {
      attempt++;
      continue;
    }
    
    // Check collision
    if (existingTokens.has(token)) {
      // Append a number to make it unique
      let suffix = '1';
      let counter = 2;
      while (existingTokens.has(token + suffix)) {
        suffix = String(counter);
        counter++;
        if (counter > 100) break;
      }
      token = token.replace(/@/, `+${suffix}@`);
    }
    
    break;
  } while (attempt < 10);
  
  return token;
}

/**
 * Generate URL-format token (https://example.com/path)
 */
export function opaqueUrlToken(
  original: string,
  namespace: string,
  secret: string,
  existingTokens: Set<string> = new Set()
): string {
  let attempt = 0;
  let token: string;
  
  do {
    const message = attempt === 0
      ? `URL|${namespace}|${original}`
      : `URL|${namespace}|${original}|${attempt}`;
    
    // Detect protocol from original
    const protocolMatch = original.match(/^(https?|ftp):\/\//i);
    const protocol = protocolMatch ? protocolMatch[1].toLowerCase() : 'https';
    
    // Generate random domain (5-12 chars)
    const domainCore = generatePatternedCore(secret, `${message}|domain`, 'letters', 10);
    const domain = domainCore.substring(0, 10).toLowerCase();
    
    // Generate random TLD (2-4 chars)
    const tldCore = generatePatternedCore(secret, `${message}|tld`, 'letters', 3);
    const tld = tldCore.substring(0, 3).toLowerCase();
    
    // Generate optional path (0-3 segments)
    const pathCore = generatePatternedCore(secret, `${message}|path`, 'letters', 6);
    const pathSegments = pathCore.substring(0, 6).toLowerCase();
    const path = pathSegments.length > 0 ? `/${pathSegments}` : '';
    
    token = `${protocol}://${domain}.${tld}${path}`;
    
    // Check for original substring
    if (containsOriginal(token, original)) {
      attempt++;
      continue;
    }
    
    // Check collision
    if (existingTokens.has(token)) {
      // Append a path segment to make it unique
      const uniqueCore = generatePatternedCore(secret, `${message}|unique`, 'letters', 4);
      token = `${token}/${uniqueCore.substring(0, 4).toLowerCase()}`;
    }
    
    break;
  } while (attempt < 10);
  
  return token;
}

/**
 * Generate UUID-format token (preserves hyphen format)
 */
export function opaqueUuidToken(
  original: string,
  namespace: string,
  secret: string,
  existingTokens: Set<string> = new Set()
): string {
  let attempt = 0;
  let token: string;
  
  do {
    const message = attempt === 0
      ? `UUID|${namespace}|${original}`
      : `UUID|${namespace}|${original}|${attempt}`;
    
    // Check if original has hyphens
    const hasHyphens = original.includes('-');
    
    // Generate hex characters (0-9a-f)
    const hexChars = '0123456789abcdef';
    
    if (hasHyphens) {
      // Standard UUID format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      let part1 = '';
      let part2 = '';
      let part3 = '';
      let part4 = '';
      let part5 = '';
      
      // Generate 8 hex chars for part1
      const hash1 = crypto.createHmac('sha256', secret);
      hash1.update(`${message}|1`);
      const bytes1 = hash1.digest();
      for (let i = 0; i < 8; i++) {
        part1 += hexChars[bytes1[i] % 16];
      }
      
      // Generate 4 hex chars for part2
      const hash2 = crypto.createHmac('sha256', secret);
      hash2.update(`${message}|2`);
      const bytes2 = hash2.digest();
      for (let i = 0; i < 4; i++) {
        part2 += hexChars[bytes2[i] % 16];
      }
      
      // Generate 3 hex chars for part3 (version 4, so starts with '4')
      const hash3 = crypto.createHmac('sha256', secret);
      hash3.update(`${message}|3`);
      const bytes3 = hash3.digest();
      part3 = '4';
      for (let i = 0; i < 3; i++) {
        part3 += hexChars[bytes3[i] % 16];
      }
      
      // Generate 4 hex chars for part4 (variant bits: 8, 9, a, or b)
      const hash4 = crypto.createHmac('sha256', secret);
      hash4.update(`${message}|4`);
      const bytes4 = hash4.digest();
      const variantChars = '89ab';
      part4 = variantChars[bytes4[0] % 4];
      for (let i = 1; i < 4; i++) {
        part4 += hexChars[bytes4[i] % 16];
      }
      
      // Generate 12 hex chars for part5
      const hash5 = crypto.createHmac('sha256', secret);
      hash5.update(`${message}|5`);
      const bytes5 = hash5.digest();
      for (let i = 0; i < 12; i++) {
        part5 += hexChars[bytes5[i % bytes5.length] % 16];
      }
      
      token = `${part1}-${part2}-${part3}-${part4}-${part5}`;
    } else {
      // No-hyphen format: 32 hex chars
      const hash = crypto.createHmac('sha256', secret);
      hash.update(message);
      const bytes = hash.digest();
      token = '';
      for (let i = 0; i < 32; i++) {
        token += hexChars[bytes[i % bytes.length] % 16];
      }
    }
    
    // Check for original substring
    if (containsOriginal(token, original)) {
      attempt++;
      continue;
    }
    
    // Check collision
    if (existingTokens.has(token)) {
      // Modify last character (increment hex value)
      const lastChar = token[token.length - 1];
      const lastIndex = hexChars.indexOf(lastChar);
      const nextIndex = (lastIndex + 1) % 16;
      token = token.slice(0, -1) + hexChars[nextIndex];
    }
    
    break;
  } while (attempt < 10);
  
  return token;
}

/**
 * Generate phone-format token (preserves format style)
 */
export function opaquePhoneToken(
  original: string,
  namespace: string,
  secret: string,
  existingTokens: Set<string> = new Set()
): string {
  let attempt = 0;
  let token: string;
  
  do {
    const message = attempt === 0
      ? `PHONE|${namespace}|${original}`
      : `PHONE|${namespace}|${original}|${attempt}`;
    
    // Detect format style from original
    const hasCountryCode = /^\+?1/.test(original);
    const hasParentheses = original.includes('(');
    const hasDashes = original.includes('-');
    const hasDots = original.includes('.');
    const hasSpaces = original.includes(' ');
    
    // Generate area code (3 digits)
    const areaCodeCore = generatePatternedCore(secret, `${message}|area`, 'numbers', 3);
    const areaCode = areaCodeCore.substring(0, 3);
    
    // Generate exchange (3 digits)
    const exchangeCore = generatePatternedCore(secret, `${message}|exchange`, 'numbers', 3);
    const exchange = exchangeCore.substring(0, 3);
    
    // Generate number (4 digits)
    const numberCore = generatePatternedCore(secret, `${message}|number`, 'numbers', 4);
    const number = numberCore.substring(0, 4);
    
    // Build token based on original format
    let formattedArea: string;
    let formattedExchange: string;
    let formattedNumber: string;
    
    if (hasParentheses) {
      formattedArea = `(${areaCode})`;
      formattedExchange = hasSpaces ? ` ${exchange}` : exchange;
      formattedNumber = hasDashes ? `-${number}` : (hasSpaces ? ` ${number}` : number);
    } else if (hasDashes) {
      formattedArea = areaCode;
      formattedExchange = `-${exchange}`;
      formattedNumber = `-${number}`;
    } else if (hasDots) {
      formattedArea = areaCode;
      formattedExchange = `.${exchange}`;
      formattedNumber = `.${number}`;
    } else if (hasSpaces) {
      formattedArea = areaCode;
      formattedExchange = ` ${exchange}`;
      formattedNumber = ` ${number}`;
    } else {
      formattedArea = areaCode;
      formattedExchange = exchange;
      formattedNumber = number;
    }
    
    // Add country code if present in original
    const countryCode = hasCountryCode ? (original.startsWith('+') ? '+1' : '1') : '';
    const separator = hasCountryCode && !hasParentheses ? (hasDashes ? '-' : (hasDots ? '.' : ' ')) : '';
    
    token = countryCode + (countryCode ? separator : '') + formattedArea + formattedExchange + formattedNumber;
    
    // Check for original substring
    if (containsOriginal(token, original)) {
      attempt++;
      continue;
    }
    
    // Check collision
    if (existingTokens.has(token)) {
      // Modify last digit (find last numeric character)
      let lastDigitIndex = -1;
      for (let i = token.length - 1; i >= 0; i--) {
        if (/\d/.test(token[i])) {
          lastDigitIndex = i;
          break;
        }
      }
      if (lastDigitIndex >= 0) {
        const lastDigit = parseInt(token[lastDigitIndex]);
        const nextDigit = (lastDigit + 1) % 10;
        token = token.slice(0, lastDigitIndex) + nextDigit + token.slice(lastDigitIndex + 1);
      } else {
        // If no digit found, append '1'
        token = token + '1';
      }
    }
    
    break;
  } while (attempt < 10);
  
  return token;
}

/**
 * Generate numeric-only token for numeric values (integers and decimals)
 */
export function opaqueNumericToken(
  original: string,
  namespace: string,
  secret: string,
  existingTokens: Set<string> = new Set()
): string {
  let attempt = 0;
  let token: string;
  
  // Check if original has a decimal point
  const hasDecimal = original.includes('.');
  const isNegative = original.startsWith('-');
  
  do {
    const message = attempt === 0
      ? `NUM|${namespace}|${original}`
      : `NUM|${namespace}|${original}|${attempt}`;
    
    // Generate numeric-only core
    const core = generatePatternedCore(secret, message, 'numbers', 12);
    
    // Build token: preserve sign and decimal structure
    if (hasDecimal) {
      // For decimals, split into integer and decimal parts
      const parts = original.replace(/^-/, '').split('.');
      const intPart = parts[0];
      const decPart = parts[1] || '';
      
      // Generate integer part with similar length
      const intLength = Math.max(1, intPart.length);
      const intCore = generatePatternedCore(secret, `${message}|int`, 'numbers', intLength);
      
      // Generate decimal part with similar length
      const decLength = Math.max(1, decPart.length);
      const decCore = generatePatternedCore(secret, `${message}|dec`, 'numbers', decLength);
      
      token = (isNegative ? '-' : '') + intCore + '.' + decCore;
    } else {
      // For integers, preserve length and sign
      const intLength = Math.max(1, original.replace(/^-/, '').length);
      const intCore = generatePatternedCore(secret, message, 'numbers', intLength);
      token = (isNegative ? '-' : '') + intCore;
    }
    
    // Check collision
    if (existingTokens.has(token)) {
      // For collisions, append a digit
      let suffix = '0';
      let counter = 1;
      while (existingTokens.has(token + suffix)) {
        suffix = String(counter % 10);
        counter++;
        if (counter > 100) break; // Safety limit
      }
      token = token + suffix;
    }
    
    break;
  } while (attempt < 10);
  
  return token;
}

