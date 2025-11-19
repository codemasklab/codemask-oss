/**
 * Replace text using byte ranges (right-to-left to avoid index drift)
 */

export interface Range {
  start: number;
  end: number;
  replacement: string;
}

/**
 * Replace multiple ranges in text, sorted by start position (descending)
 * to avoid index drift
 * Also validates and removes overlapping ranges (keeps the first one encountered)
 */
export function replaceRanges(text: string, ranges: Range[]): string {
  if (ranges.length === 0) {
    return text;
  }
  
  // Sort by start position descending
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  
  // Remove overlapping ranges
  // When ranges overlap, prefer the longer one (more specific match)
  // If lengths are equal, prefer the one that starts earlier (leftmost)
  // First, sort by length (longest first), then by start position (ascending)
  // This ensures longer ranges are processed first
  const sortedByLength = [...sorted].sort((a, b) => {
    const aLength = a.end - a.start;
    const bLength = b.end - b.start;
    if (bLength !== aLength) {
      return bLength - aLength; // Longer first
    }
    return a.start - b.start; // Then by start position (earlier first)
  });
  
  const validRanges: Range[] = [];
  for (let i = 0; i < sortedByLength.length; i++) {
    const current = sortedByLength[i];
    const currentLength = current.end - current.start;
    let shouldAdd = true;
    
    // Check if this range overlaps with any already added range
    // Since we process longer ranges first, if there's an overlap, the existing one is longer or equal
    for (let j = 0; j < validRanges.length; j++) {
      const existing = validRanges[j];
      
      // Check for overlap: ranges overlap if they share any character
      // current.start < existing.end && current.end > existing.start
      if (current.start < existing.end && current.end > existing.start) {
        // They overlap - since we process longer ranges first, existing is longer or equal
        // Skip the current one
        shouldAdd = false;
        break;
      }
    }
    
    if (shouldAdd) {
      validRanges.push(current);
    }
  }
  
  // Now re-sort validRanges by start position descending for right-to-left replacement
  validRanges.sort((a, b) => b.start - a.start);
  
  // Validate ranges are within text bounds
  const validatedRanges = validRanges.filter(r => {
    return r.start >= 0 && r.end <= text.length && r.start <= r.end;
  });
  
  let result = text;
  
  for (const range of validatedRanges) {
    const before = result.substring(0, range.start);
    const after = result.substring(range.end);
    result = before + range.replacement + after;
  }
  
  return result;
}

/**
 * Find all occurrences of a string in text and return ranges
 */
export function findAllRanges(text: string, search: string, wholeWord: boolean = false): Range[] {
  const ranges: Range[] = [];
  let startIndex = 0;
  
  while (true) {
    const index = text.indexOf(search, startIndex);
    if (index === -1) break;
    
    const endIndex = index + search.length;
    
    // Check whole word boundaries if required
    if (wholeWord) {
      const before = index > 0 ? text[index - 1] : ' ';
      const after = endIndex < text.length ? text[endIndex] : ' ';
      const wordBoundaryRegex = /[^a-zA-Z0-9_]/;
      
      if (!wordBoundaryRegex.test(before) || !wordBoundaryRegex.test(after)) {
        startIndex = index + 1;
        continue;
      }
    }
    
    ranges.push({
      start: index,
      end: endIndex,
      replacement: '' // Will be set by caller
    });
    
    startIndex = index + 1;
  }
  
  return ranges;
}

