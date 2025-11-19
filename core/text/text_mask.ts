import { findAllRanges, Range, replaceRanges } from '../code/utils/ranges';
import { opaqueWordToken, opaqueEmailToken, opaqueUrlToken, opaqueUuidToken, opaquePhoneToken, opaqueNumericToken } from '../mapping/token';
import { remember } from '../mapping/store';
import { detectEmails, detectUrls, detectUuids, detectPhones } from './detectors';

/**
 * Mask selected words in text (whole-word matching)
 */
export async function maskSelectedWords(
  text: string,
  selected: string[],
  namespace: string,
  secret: string,
  caseSensitive: boolean = false
): Promise<string> {
  if (selected.length === 0) {
    return text;
  }
  
  const ranges: Range[] = [];
  const existingTokens = new Set<string>();
  
  // Sort selected items by length (longest first) to prioritize longer matches
  // This ensures that if a URL contains a UUID, the full URL is masked first
  const sortedSelected = [...selected].sort((a, b) => b.length - a.length);
  
  // Detect all identifier types in the text once
  const allEmails = detectEmails(text);
  const allUrls = detectUrls(text);
  const allUuids = detectUuids(text);
  const allPhones = detectPhones(text);
  
  // Create maps for quick lookup
  const emailMap = new Map<string, boolean>();
  const urlMap = new Map<string, boolean>();
  const uuidMap = new Map<string, boolean>();
  const phoneMap = new Map<string, boolean>();
  
  allEmails.forEach(m => emailMap.set(m.text, true));
  allUrls.forEach(m => urlMap.set(m.text, true));
  allUuids.forEach(m => uuidMap.set(m.text, true));
  allPhones.forEach(m => phoneMap.set(m.text, true));
  
  for (const word of sortedSelected) {
    // Determine the type of identifier
    let identifierType: 'email' | 'url' | 'uuid' | 'phone' | 'numeric' | 'word' = 'word';
    
    // Check if it's a numeric value (integer or decimal, with optional negative sign)
    const isNumeric = /^-?\d+(\.\d+)?$/.test(word.trim());
    
    if (emailMap.has(word)) {
      identifierType = 'email';
    } else if (urlMap.has(word)) {
      identifierType = 'url';
    } else if (uuidMap.has(word)) {
      identifierType = 'uuid';
    } else if (phoneMap.has(word)) {
      identifierType = 'phone';
    } else if (isNumeric) {
      identifierType = 'numeric';
    }
    
    // Get or create token (once per word) using appropriate token generator
    let token: string;
    if (identifierType === 'email') {
      token = await remember('EMAIL', namespace, word, () => {
        return opaqueEmailToken(word, namespace, secret, existingTokens);
      });
    } else if (identifierType === 'url') {
      token = await remember('URL', namespace, word, () => {
        return opaqueUrlToken(word, namespace, secret, existingTokens);
      });
    } else if (identifierType === 'uuid') {
      token = await remember('UUID', namespace, word, () => {
        return opaqueUuidToken(word, namespace, secret, existingTokens);
      });
    } else if (identifierType === 'phone') {
      token = await remember('PHONE', namespace, word, () => {
        return opaquePhoneToken(word, namespace, secret, existingTokens);
      });
    } else if (identifierType === 'numeric') {
      token = await remember('NUM', namespace, word, () => {
        return opaqueNumericToken(word, namespace, secret, existingTokens);
      });
    } else {
      token = await remember('WORD', namespace, word, () => {
        return opaqueWordToken(word, namespace, secret, existingTokens);
      });
    }
    
    existingTokens.add(token);
    
    // Find all whole-word occurrences
    let searchIndex = 0;
    while (true) {
      let index: number;
      if (caseSensitive) {
        index = text.indexOf(word, searchIndex);
      } else {
        const lowerText = text.toLowerCase();
        const lowerWord = word.toLowerCase();
        index = lowerText.indexOf(lowerWord, searchIndex);
      }
      
      if (index === -1) break;
      
      const endIndex = index + word.length;
      
      // Check whole word boundaries
      const before = index > 0 ? text[index - 1] : ' ';
      const after = endIndex < text.length ? text[endIndex] : ' ';
      const isWordBoundary = /[^a-zA-Z0-9_]/.test(before) && /[^a-zA-Z0-9_]/.test(after);
      
      if (isWordBoundary) {
        // Check if this range overlaps with any existing range
        // If it does, and the existing range is longer, skip this one
        // If this range is longer, we'll handle it in replaceRanges
        let shouldAdd = true;
        for (const existingRange of ranges) {
          // Check if ranges overlap
          if (index < existingRange.end && endIndex > existingRange.start) {
            // They overlap - prefer the longer one
            const existingLength = existingRange.end - existingRange.start;
            const currentLength = endIndex - index;
            if (existingLength >= currentLength) {
              // Existing range is longer or equal, skip this one
              shouldAdd = false;
              break;
            }
            // Current range is longer - we'll add it and replaceRanges will handle removing the shorter one
          }
        }
        
        if (shouldAdd) {
          ranges.push({
            start: index,
            end: endIndex,
            replacement: token
          });
        }
      }
      
      searchIndex = index + 1;
    }
  }
  
  // Apply replacements right-to-left
  // replaceRanges will handle any remaining overlaps by preferring longer ranges
  return replaceRanges(text, ranges);
}

/**
 * Unmask text by replacing tokens with originals
 */
export async function unmaskText(
  text: string,
  tokenToOriginal: Map<string, string>
): Promise<string> {
  let result = text;
  const ranges: Range[] = [];
  
  // Find all token occurrences
  for (const [token, original] of tokenToOriginal.entries()) {
    const tokenRanges = findAllRanges(result, token, false);
    for (const range of tokenRanges) {
      ranges.push({
        start: range.start,
        end: range.end,
        replacement: original
      });
    }
  }
  
  return replaceRanges(result, ranges);
}

