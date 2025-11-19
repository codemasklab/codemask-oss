import { Range, replaceRanges } from './utils/ranges';
import { autoMask as pythonAutoMask, selectMask as pythonSelectMask } from './languages/python';
import { maskSelectedWords } from '../text/text_mask';

export interface MaskOptions {
  namespace: string;
  secret: string;
  language?: string;
  includeProperties?: boolean;
}

export interface MaskResult {
  masked: string;
  ranges: Range[];
}

/**
 * Code masking engine - Open Source version (Python and Text only)
 */
export class CodeMaskingEngine {
  /**
   * Auto-mask all identifiers in code
   */
  static async autoMask(
    code: string,
    options: MaskOptions
  ): Promise<MaskResult> {
    const lang = options.language || 'python';
    
    if (lang === 'python' || lang === 'py') {
      const result = await pythonAutoMask(
        code,
        options.namespace,
        options.secret,
        options.includeProperties ?? true
      );
      
      // Apply ranges
      result.masked = replaceRanges(code, result.ranges);
      return result;
    }
    
    throw new Error(`Language ${lang} not supported in open source version. Only Python is supported.`);
  }

  /**
   * Mask selected identifiers
   */
  static async selectMask(
    code: string,
    selected: string[],
    options: MaskOptions
  ): Promise<MaskResult> {
    const lang = options.language || 'python';
    
    if (lang === 'python' || lang === 'py') {
      const result = await pythonSelectMask(
        code,
        selected,
        options.namespace,
        options.secret
      );
      
      // Apply ranges
      result.masked = replaceRanges(code, result.ranges);
      return result;
    }
    
    throw new Error(`Language ${lang} not supported in open source version. Only Python is supported.`);
  }

  /**
   * Get symbol list for UI
   */
  static async getSymbols(code: string, lang?: string, includeProperties: boolean = true): Promise<string[]> {
    const language = lang || 'python';
    
    if (language === 'python' || language === 'py') {
      const { getSymbolList } = await import('./languages/python');
      // getSymbolList uses excludeProperties, so invert the boolean
      return await getSymbolList(code, !includeProperties);
    }
    
    return [];
  }
}
