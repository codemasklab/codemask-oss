// Monaco Editor - VS Code's editor
// Monaco is loaded via AMD loader in HTML, so we access it via global
declare const monaco: typeof import('monaco-editor');

// Type definitions - extend Window interface
interface Window {
  electronAPI: {
    codeAutoMask: (code: string, namespace: string, language?: string, includeProperties?: boolean) => Promise<string>;
    codeSelectMask: (code: string, selected: string[], namespace: string, language?: string) => Promise<string>;
    codeSymbols: (code: string, language?: string, includeProperties?: boolean) => Promise<string[]>;
    textMaskSelected: (text: string, selected: string[], namespace: string, caseSensitive?: boolean) => Promise<string>;
    textDetect: (text: string) => Promise<Array<{ text: string; type: string; start: number; end: number }>>;
    unmask: (text: string, namespace: string) => Promise<string>;
    wipeMapping: (namespace?: string | null) => Promise<boolean>;
    getAllNamespaces: () => Promise<string[]>;
    fileSave: (content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    fileSaveAs: (content: string) => Promise<{ success: boolean; path?: string; error?: string }>;
    fileOpen: () => Promise<{ success: boolean; content?: string; path?: string; error?: string }>;
    onFileOpened: (callback: (content: string, filePath: string) => void) => void;
    onFileSave: (callback: () => void) => void;
    onFileSaveAs: (callback: () => void) => void;
    onViewSelectNamespace: (callback: () => void) => void;
  };
}

type Mode = 'code' | 'text';

// State (will be managed per-tab)
let currentMode: Mode = 'code';
let selectedItems: Set<string> = new Set();
let symbols: string[] = [];
let isWindowMaximized = false; // Track window maximize state for drag handling
let isRestoring = false; // Flag to prevent double-restore when clicking restore button

// Monaco Editor instances
let inputEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let outputEditor: monaco.editor.IStandaloneCodeEditor | null = null;
let inputModel: monaco.editor.ITextModel | null = null;
let outputModel: monaco.editor.ITextModel | null = null;

// Search state
let currentSearchTerm: string = '';
let inputSearchMatches: monaco.Range[] = [];
let outputSearchMatches: monaco.Range[] = [];
let inputCurrentMatchIndex: number = -1;
let outputCurrentMatchIndex: number = -1;
let inputSearchDecorations: string[] = [];
let outputSearchDecorations: string[] = [];

// DOM elements - will be initialized in bindDom()
let inputTextContainer: HTMLElement;
let outputTextContainer: HTMLElement;
let inputFallback: HTMLTextAreaElement | null = null;
let outputFallback: HTMLTextAreaElement | null = null;
let modeCodeBtn: HTMLButtonElement;
let modeTextBtn: HTMLButtonElement;
let namespaceInput: HTMLInputElement;
let namespaceList: HTMLDataListElement;
let refreshNamespacesBtn: HTMLButtonElement;
let namespaceSelectorOverlay: HTMLElement;
let namespaceSelectorList: HTMLElement;
let namespaceSelectorFilter: HTMLInputElement;
let namespaceSelectorSelectBtn: HTMLButtonElement;
let namespaceSelectorCancelBtn: HTMLButtonElement;
let namespaceSelectorCloseBtn: HTMLElement;
let selectedNamespaceInSelector: string | null = null;
let wipeBtn: HTMLButtonElement;
let autoMaskBtn: HTMLButtonElement;
let maskSelectedBtn: HTMLButtonElement;
let textMaskBtn: HTMLButtonElement;
let unmaskBtn: HTMLButtonElement;
let copyBtn: HTMLButtonElement;
let selectedCount: HTMLElement;
let selectedChips: HTMLElement;
let symbolsList: HTMLElement;
let symbolsPanel: HTMLElement;
let codeActions: HTMLElement;
let textActions: HTMLElement;
let includeProperties: HTMLInputElement;
let detectEmailBtn: HTMLButtonElement;
let detectUrlBtn: HTMLButtonElement;
let detectUuidBtn: HTMLButtonElement;
let detectPhoneBtn: HTMLButtonElement;
let copyNoteBtn: HTMLButtonElement;
let arrowRight: HTMLElement;
let languageSelector: HTMLElement;
let languageSelect: HTMLSelectElement;
let clearSelectedBtn: HTMLButtonElement;

// Context menu
let contextMenu: HTMLElement | null = null;
let contextMenuVisible = false;

// Map language names to Monaco language IDs (Open Source version - Python only)
function getMonacoLanguage(lang?: string): string {
  switch (lang?.toLowerCase()) {
    case 'python':
    case 'py':
      return 'python';
    default:
      return 'plaintext';
  }
}

// Helper functions to maintain compatibility with textarea API
const inputText = {
  get value() {
    if (inputEditor) {
      return inputEditor.getValue();
    } else if (inputModel) {
      return inputModel.getValue();
    } else if (inputFallback) {
      return inputFallback.value;
    }
    return '';
  },
  set value(text: string) {
    const valueToSet = text || '';
    console.log('Setting inputText.value, length:', valueToSet.length, 'content:', JSON.stringify(valueToSet.substring(0, 50)));
    
    // If Monaco editor exists, use it (it's bound to the model)
    if (inputEditor) {
      inputEditor.setValue(valueToSet);
      console.log('Set on inputEditor, verifying:', inputEditor.getValue().length);
    } else if (inputModel) {
      // If only model exists (editor not yet created)
      inputModel.setValue(valueToSet);
      console.log('Set on inputModel');
    } else if (inputFallback) {
      // Fallback to textarea
      inputFallback.value = valueToSet;
      console.log('Set on inputFallback');
    }
  },
  get selectionStart() {
    if (inputEditor) {
      const selection = inputEditor.getSelection();
      return selection ? selection.getStartPosition().column - 1 : 0;
    }
    // Fallback for textarea
    const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
    return textarea?.selectionStart || 0;
  },
  get selectionEnd() {
    if (inputEditor) {
      const selection = inputEditor.getSelection();
      return selection ? selection.getEndPosition().column - 1 : 0;
    }
    // Fallback for textarea
    const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
    return textarea?.selectionEnd || 0;
  },
  setSelectionRange(start: number, end: number) {
    if (inputEditor && inputModel) {
      const startPos = inputModel.getPositionAt(start);
      const endPos = inputModel.getPositionAt(end);
      inputEditor.setSelection({
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column
      });
    } else {
      // Fallback for textarea
      const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
      if (textarea) {
        textarea.setSelectionRange(start, end);
      }
    }
  },
  focus() {
    inputEditor?.focus();
    const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
    textarea?.focus();
  },
  addEventListener(event: string, handler: EventListener) {
    if (inputEditor) {
      if (event === 'input') {
        inputEditor.onDidChangeModelContent(() => {
          handler(new Event('input'));
        });
      }
    } else {
      const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
      textarea?.addEventListener(event, handler);
    }
  },
  dispatchEvent(event: Event) {
    if (inputEditor && event.type === 'input') {
      // Trigger update
      updateSymbols();
      renderSelectedChips();
    }
    const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
    textarea?.dispatchEvent(event);
  }
};

const outputText = {
  get value() {
    if (outputEditor) {
      return outputEditor.getValue();
    } else if (outputModel) {
      return outputModel.getValue();
    } else if (outputFallback) {
      return outputFallback.value;
    }
    return '';
  },
  set value(text: string) {
    // Set on model first (if using Monaco with model)
    if (outputModel) {
      outputModel.setValue(text || '');
    }
    // Also set on editor directly (Monaco editor)
    if (outputEditor) {
      outputEditor.setValue(text || '');
    }
    // Fallback to textarea if Monaco isn't available
    if (outputFallback && !outputEditor && !outputModel) {
      outputFallback.value = text || '';
    }
  }
};

// Bind DOM elements
function bindDom() {
  inputTextContainer = document.getElementById('input-text') as HTMLElement;
  outputTextContainer = document.getElementById('output-text') as HTMLElement;
  modeCodeBtn = document.getElementById('mode-code') as HTMLButtonElement;
  modeTextBtn = document.getElementById('mode-text') as HTMLButtonElement;
  namespaceInput = document.getElementById('namespace') as HTMLInputElement;
  namespaceList = document.getElementById('namespace-list') as HTMLDataListElement;
  refreshNamespacesBtn = document.getElementById('refresh-namespaces-btn') as HTMLButtonElement;
  namespaceSelectorOverlay = document.getElementById('namespace-selector-overlay') as HTMLElement;
  namespaceSelectorList = document.getElementById('namespace-selector-list') as HTMLElement;
  namespaceSelectorFilter = document.getElementById('namespace-selector-filter') as HTMLInputElement;
  namespaceSelectorSelectBtn = document.getElementById('namespace-selector-select') as HTMLButtonElement;
  namespaceSelectorCancelBtn = document.getElementById('namespace-selector-cancel') as HTMLButtonElement;
  namespaceSelectorCloseBtn = document.getElementById('namespace-selector-close') as HTMLElement;
  wipeBtn = document.getElementById('wipe-btn') as HTMLButtonElement;
  autoMaskBtn = document.getElementById('auto-mask-btn') as HTMLButtonElement;
  maskSelectedBtn = document.getElementById('mask-selected-btn') as HTMLButtonElement;
  textMaskBtn = document.getElementById('text-mask-btn') as HTMLButtonElement;
  unmaskBtn = document.getElementById('unmask-btn') as HTMLButtonElement;
  copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
  selectedCount = document.getElementById('selected-count') as HTMLElement;
  selectedChips = document.getElementById('selected-chips') as HTMLElement;
  symbolsList = document.getElementById('symbols-list') as HTMLElement;
  symbolsPanel = document.getElementById('symbols-panel') as HTMLElement;
  codeActions = document.getElementById('code-actions') as HTMLElement;
  textActions = document.getElementById('text-actions') as HTMLElement;
  includeProperties = document.getElementById('include-properties') as HTMLInputElement;
  detectEmailBtn = document.getElementById('detect-email-btn') as HTMLButtonElement;
  detectUrlBtn = document.getElementById('detect-url-btn') as HTMLButtonElement;
  detectUuidBtn = document.getElementById('detect-uuid-btn') as HTMLButtonElement;
  detectPhoneBtn = document.getElementById('detect-phone-btn') as HTMLButtonElement;
  copyNoteBtn = document.getElementById('copy-note-btn') as HTMLButtonElement;
  arrowRight = document.getElementById('arrow-right') as HTMLElement;
  languageSelector = document.getElementById('language-selector') as HTMLElement;
  languageSelect = document.getElementById('language-select') as HTMLSelectElement;
  clearSelectedBtn = document.getElementById('clear-selected-btn') as HTMLButtonElement;
}

// Titlebar status message elements
let titlebarStatus: HTMLElement | null = null;
let titlebarStatusSpinner: HTMLElement | null = null;
let titlebarStatusText: HTMLElement | null = null;

// Initialize status message elements
function initStatusMessage() {
  titlebarStatus = document.getElementById('titlebar-status');
  titlebarStatusSpinner = document.getElementById('titlebar-status-spinner');
  titlebarStatusText = document.getElementById('titlebar-status-text');
}

// Show status message
function showStatusMessage(text: string, showSpinner: boolean = false) {
  if (!titlebarStatus || !titlebarStatusText) return;
  
  titlebarStatusText.textContent = text;
  if (titlebarStatusSpinner) {
    titlebarStatusSpinner.style.display = showSpinner ? 'inline-block' : 'none';
  }
  titlebarStatus.style.display = 'flex';
}

// Hide status message
function hideStatusMessage() {
  if (titlebarStatus) {
    titlebarStatus.style.display = 'none';
  }
  if (titlebarStatusSpinner) {
    titlebarStatusSpinner.style.display = 'none';
  }
}

// Get selected text from Monaco editor or textarea
function getSelectedText(): string {
  if (inputEditor) {
    const selection = inputEditor.getSelection();
    if (selection && !selection.isEmpty()) {
      const text = inputModel?.getValueInRange(selection) || '';
      return text;
    }
  }
  // Fallback for textarea
  const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    return textarea.value.substring(start, end);
  }
  return '';
}

// Get language from selector (Open Source version - Python only)
function getLanguage(): string {
  return languageSelect.value || 'python';
}

// Detect language from file extension (Open Source version - Python only)
function detectLanguageFromExtension(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  
  // Map file extensions to language codes (Python only)
  const extensionMap: { [key: string]: string } = {
    // Python
    'py': 'python',
    'pyw': 'python',
    'pyi': 'python'
    // Text files (.txt) will return null, keeping current mode/language
  };
  
  return extensionMap[ext] || null;
}

// Get namespace
function getNamespace(): string {
  return namespaceInput.value || 'default';
}

// Function to load file content into the UI
function loadFileContent(content: string, filePath: string) {
  console.log('loadFileContent called, content length:', content.length);
  console.log('File content preview (first 200 chars):', content.substring(0, 200));
  
  // Normalize line endings (Windows \r\n to Unix \n)
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Save current tab state before loading new file
  if (activeTabId) {
    saveCurrentTabState();
  }
  
  // Parse the saved format
  let namespace = getNamespace(); // Default to current namespace
  let mode: Mode = 'code'; // Default to code mode for backward compatibility
  let input = '';
  let output = '';
  
  // Check if file has markers
  const hasNamespace = content.startsWith('===NAMESPACE===');
  const hasMode = content.includes('===MODE===');
  const hasInput = content.includes('===INPUT===');
  const hasOutput = content.includes('===OUTPUT===');
  
  console.log('Format detection:', { hasNamespace, hasMode, hasInput, hasOutput });
  
  if (hasNamespace && hasInput && hasOutput) {
    // New format: ===NAMESPACE===\n<ns>\n===MODE===\n<mode>\n===INPUT===\n<input>\n\n===OUTPUT===\n<output>
    // Extract namespace (single line after ===NAMESPACE===)
    const nsMatch = content.match(/===NAMESPACE===\n([^\n]+)/);
    if (nsMatch) {
      namespace = nsMatch[1].trim() || 'default';
    }
    
    // Extract mode (single line after ===MODE===) if present
    if (hasMode) {
      const modeMatch = content.match(/===MODE===\n([^\n]+)/);
      if (modeMatch) {
        const modeValue = modeMatch[1].trim();
        if (modeValue === 'code' || modeValue === 'text') {
          mode = modeValue as Mode;
        }
      }
    }
    
    // Extract input and output using indexOf (more reliable than regex)
    const inputMarker = '===INPUT===\n';
    const outputMarker = '\n\n===OUTPUT===\n';
    const inputIdx = content.indexOf(inputMarker);
    const outputIdx = content.indexOf(outputMarker);
    
    console.log('Parsing markers:', { 
      inputIdx, 
      outputIdx, 
      inputMarkerLength: inputMarker.length,
      outputMarkerLength: outputMarker.length,
      contentLength: content.length
    });
    
    if (inputIdx !== -1 && outputIdx !== -1 && outputIdx > inputIdx) {
      const inputStart = inputIdx + inputMarker.length;
      input = content.substring(inputStart, outputIdx);
      const outputStart = outputIdx + outputMarker.length;
      output = content.substring(outputStart);
      
      // Trim trailing newlines from input (but preserve content)
      // The input might have a trailing newline before the \n\n separator
      input = input.replace(/\n+$/, '');
      
      console.log('Extracted:', { 
        inputStart, 
        inputEnd: outputIdx, 
        outputStart,
        inputRaw: JSON.stringify(content.substring(inputStart, outputIdx)),
        inputAfterTrim: JSON.stringify(input),
        inputLength: input.length,
        outputLength: output.length
      });
    } else {
      console.error('Failed to find markers:', { inputIdx, outputIdx });
      // Try regex as fallback
      const formatMatch = content.match(/===INPUT===\n([\s\S]*?)\n\n===OUTPUT===\n([\s\S]*)$/);
      if (formatMatch) {
        input = formatMatch[1].replace(/\n+$/, '');
        output = formatMatch[2] || '';
        console.log('Used regex fallback:', { inputLength: input.length, outputLength: output.length });
      }
    }
    
    console.log('Final parsed values:', { 
      namespace, 
      mode,
      inputLength: input.length, 
      outputLength: output.length, 
      inputPreview: input.substring(0, 100),
      inputJSON: JSON.stringify(input),
      hasInput: input.length > 0,
      hasOutput: output.length > 0
    });
    
    namespaceInput.value = namespace;
    
    // Restore the mode before setting values (this ensures correct syntax highlighting)
    setMode(mode);
    
    // Set values and ensure they're applied
    // Wait a bit to ensure Monaco is ready, or set immediately if fallback is being used
    const setValues = () => {
      console.log('About to set values - input:', JSON.stringify(input), 'Monaco ready:', !!inputEditor);
      inputText.value = input;
      outputText.value = output;
      
      // Force Monaco layout update if editor exists
      if (inputEditor) {
        inputEditor.layout();
        // Also try to focus to ensure it's rendered
        inputEditor.focus();
      }
      if (outputEditor) {
        outputEditor.layout();
      }
      
      // Verify values were set - wait a moment for Monaco to update
      setTimeout(() => {
        const verifyInput = inputText.value;
        const verifyOutput = outputText.value;
        console.log('After setting (delayed check) - Input length:', verifyInput.length, 'Output length:', verifyOutput.length, 'Input content:', JSON.stringify(verifyInput));
        
        // If value wasn't set correctly, try again
        if (verifyInput !== input && input.length > 0) {
          console.warn('Value mismatch! Expected:', JSON.stringify(input), 'Got:', JSON.stringify(verifyInput));
          // Try setting again
          if (inputEditor) {
            inputEditor.setValue(input);
            inputEditor.layout();
          } else if (inputFallback) {
            inputFallback.value = input;
          }
        }
        
        // Force update tab state immediately
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId);
          if (tab) {
            tab.input = input;
            tab.output = output;
            tab.namespace = namespace;
          }
        }
        
        // Update symbols if in code mode
        if (currentMode === 'code') {
          updateSymbols();
        }
      }, 100);
    };
    
    // If Monaco isn't ready, wait a bit longer
    if (!inputEditor && !inputFallback) {
      // Monaco might still be loading, wait a bit
      setTimeout(setValues, 100);
    } else {
      // Monaco is ready or fallback is available, set immediately
      setValues();
    }
  } else if (hasInput && hasOutput) {
    // Old format: ===INPUT===\n<input>\n\n===OUTPUT===\n<output>
    const inputStart = content.indexOf('===INPUT===\n') + '===INPUT===\n'.length;
    const outputStart = content.indexOf('===OUTPUT===\n') + '===OUTPUT===\n'.length;
    const inputEnd = content.lastIndexOf('\n\n===OUTPUT===');
    
    if (inputEnd >= inputStart) {
      input = content.substring(inputStart, inputEnd);
    } else {
      input = '';
    }
    output = content.substring(outputStart);
    
    inputText.value = input;
    outputText.value = output;
  } else if (hasInput && !hasOutput) {
    // Very old format: only INPUT marker
    const inputMatch = content.match(/===INPUT===\n([\s\S]*)$/);
    if (inputMatch) {
      input = inputMatch[1];
      inputText.value = input;
      outputText.value = '';
    }
  } else {
    // Plain text file (no markers)
    inputText.value = content;
    outputText.value = '';
  }
  
  // Save namespace to current tab state
  if (activeTabId) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      tab.namespace = getNamespace();
    }
  }
  
  // Auto-detect language from file extension
  const detectedLang = detectLanguageFromExtension(filePath);
  if (detectedLang) {
    languageSelect.value = detectedLang;
    updateEditorLanguage();
  }
  
  // Update tab title with filename (without extension)
  if (activeTabId) {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
      const fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
      tab.title = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
      renderTabs();
    }
  }
  
  // Update tab state
  if (activeTabId) {
    saveCurrentTabState();
  }
  
  // Update symbols if in code mode (after a small delay to ensure values are set)
  if (currentMode === 'code') {
    setTimeout(() => {
      updateSymbols();
    }, 150);
  }
}

// Load and populate namespaces list
async function loadNamespaces() {
  try {
    const namespaces = await window.electronAPI.getAllNamespaces();
    
    // Clear existing options
    namespaceList.innerHTML = '';
    
    // Add each namespace as an option
    for (const ns of namespaces) {
      const option = document.createElement('option');
      option.value = ns;
      namespaceList.appendChild(option);
    }
    
    // If current namespace is not in the list, add it
    const currentNs = getNamespace();
    if (currentNs && !namespaces.includes(currentNs)) {
      const option = document.createElement('option');
      option.value = currentNs;
      namespaceList.appendChild(option);
    }
  } catch (e) {
    console.error('Error loading namespaces:', e);
  }
}

// Show namespace selector modal
async function showNamespaceSelector() {
  try {
    const namespaces = await window.electronAPI.getAllNamespaces();
    const currentNs = getNamespace();
    selectedNamespaceInSelector = currentNs;
    
    // Clear and populate the list
    namespaceSelectorList.innerHTML = '';
    
    if (namespaces.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'namespace-list-empty';
      emptyMsg.innerHTML = '<strong>No mapping groups found</strong><span>Create a new one by typing a name in the Mapping Group field.</span>';
      namespaceSelectorList.appendChild(emptyMsg);
    } else {
      // Add "default" if it doesn't exist
      const allNamespaces = namespaces.includes('default') ? namespaces : ['default', ...namespaces];
      
      for (const ns of allNamespaces) {
        const item = document.createElement('div');
        item.className = 'namespace-list-item';
        if (ns === currentNs) {
          item.classList.add('selected');
        }
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'namespace-list-item-name';
        nameSpan.textContent = ns;
        
        const checkSpan = document.createElement('span');
        checkSpan.className = 'namespace-list-item-check';
        checkSpan.textContent = '✓';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'namespace-list-item-delete';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = `Delete mapping group "${ns}"`;
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation(); // Prevent selection when clicking delete
          
          const confirmed = await showConfirmDialog(
            'Delete Mapping Group',
            `Are you sure you want to delete the mapping group "${ns}"? This will permanently delete all mappings for this group. This action cannot be undone.`,
            'Delete',
            'Cancel'
          );
          
          if (confirmed) {
            try {
              // Check if this is the current namespace before deleting
              const currentNs = getNamespace();
              const wasCurrent = currentNs === ns;
              
              await window.electronAPI.wipeMapping(ns);
              
              // If the deleted namespace was the current one, switch to default
              if (wasCurrent) {
                namespaceInput.value = 'default';
                saveCurrentTabState();
              }
              
              // Reload namespaces and refresh the list
              await loadNamespaces();
              await showNamespaceSelector(); // Refresh the selector
            } catch (error) {
              console.error('Error deleting namespace:', error);
              await showAlertDialog('Error', 'Failed to delete mapping group: ' + (error as Error).message);
            }
          }
        });
        
        const rightContainer = document.createElement('div');
        rightContainer.className = 'namespace-list-item-right';
        rightContainer.appendChild(checkSpan);
        rightContainer.appendChild(deleteBtn);
        
        item.appendChild(nameSpan);
        item.appendChild(rightContainer);
        
        item.addEventListener('click', (e) => {
          // Don't select if clicking on delete button
          if ((e.target as HTMLElement).closest('.namespace-list-item-delete')) {
            return;
          }
          
          // Remove selected class from all items
          namespaceSelectorList.querySelectorAll('.namespace-list-item').forEach(i => {
            i.classList.remove('selected');
          });
          // Add selected class to clicked item
          item.classList.add('selected');
          selectedNamespaceInSelector = ns;
          namespaceSelectorSelectBtn.disabled = false;
        });
        
        namespaceSelectorList.appendChild(item);
      }
    }
    
    // Clear filter
    namespaceSelectorFilter.value = '';
    
    // Enable/disable select button
    namespaceSelectorSelectBtn.disabled = currentNs === selectedNamespaceInSelector;
    
    // Show modal
    namespaceSelectorOverlay.classList.remove('hidden');
    namespaceSelectorFilter.focus();
    
  } catch (e) {
    console.error('Error showing namespace selector:', e);
    await showAlertDialog('Error', 'Failed to load mapping groups: ' + (e as Error).message);
  }
}

// Hide namespace selector modal
function hideNamespaceSelector() {
  namespaceSelectorOverlay.classList.add('hidden');
  selectedNamespaceInSelector = null;
  namespaceSelectorFilter.value = '';
}

// Initialize Monaco editors
function initializeEditors() {
  // Check if containers exist
  if (!inputTextContainer || !outputTextContainer) {
    console.error('Monaco containers not found');
    createTextareaFallback();
    return;
  }

  // Remove any existing textareas if they exist (from previous failed attempts)
  const existingTextarea = document.getElementById('input-text-fallback');
  if (existingTextarea) {
    existingTextarea.remove();
    const outputTextarea = document.getElementById('output-text-fallback');
    if (outputTextarea) {
      outputTextarea.remove();
    }
    // Clear containers
    inputTextContainer.innerHTML = '';
    outputTextContainer.innerHTML = '';
  }

  try {
    // Configure Monaco to use VS Code dark theme
    monaco.editor.setTheme('vs-dark');

    // Get initial language based on current mode
    // In text mode, use plaintext; in code mode, use the selected language
    const monacoLang = currentMode === 'text' ? 'plaintext' : getMonacoLanguage(getLanguage());

    // Create models
    inputModel = monaco.editor.createModel('', monacoLang);
    outputModel = monaco.editor.createModel('', monacoLang);

    // Create input editor
    inputEditor = monaco.editor.create(inputTextContainer, {
      model: inputModel,
      theme: 'vs-dark',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      readOnly: false,
      contextmenu: false // Disable Monaco's default context menu
    });

    // Create output editor (read-only)
    outputEditor = monaco.editor.create(outputTextContainer, {
      model: outputModel,
      theme: 'vs-dark',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: 'on',
      wordWrap: 'on',
      readOnly: true,
      contextmenu: false // Disable Monaco's default context menu
    });

    // Listen for content changes
    inputEditor.onDidChangeModelContent(() => {
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.input = inputText.value;
        }
      }
      updateSymbols();
      renderSelectedChips();
      
      // Re-run search if there's an active search term (preserve current match position)
      if (currentSearchTerm && inputModel) {
        searchInEditor(inputEditor, inputModel, currentSearchTerm, true, true);
      }
    });

    // Scroll synchronization
    let isScrolling = false;
    inputEditor.onDidScrollChange((e) => {
      if (!isScrolling && outputEditor && e.scrollTop !== undefined) {
        isScrolling = true;
        outputEditor.setScrollTop(e.scrollTop);
        outputEditor.setScrollLeft(e.scrollLeft || 0);
        isScrolling = false;
      }
    });

    outputEditor.onDidScrollChange((e) => {
      if (!isScrolling && inputEditor && e.scrollTop !== undefined) {
        isScrolling = true;
        inputEditor.setScrollTop(e.scrollTop);
        inputEditor.setScrollLeft(e.scrollLeft || 0);
        isScrolling = false;
      }
    });
    
    // Listen for content changes in output editor (even though it's read-only, content can change programmatically)
    outputEditor.onDidChangeModelContent(() => {
      // Re-run search if there's an active search term (preserve current match position)
      if (currentSearchTerm && outputModel) {
        searchInEditor(outputEditor, outputModel, currentSearchTerm, false, true);
      }
    });

    // Focus the input editor after a short delay
    setTimeout(() => {
      inputEditor?.focus();
    }, 100);

    // Add click handler to focus editor when container is clicked
    inputTextContainer.addEventListener('click', (e) => {
      if (inputEditor && e.target === inputTextContainer) {
        inputEditor.focus();
      }
    });

    // Set up context menu after a short delay to ensure Monaco is fully initialized
    // This prevents errors like "getModifierState is not a function"
    setTimeout(() => {
      setupContextMenu();
      // Set initial mode after Monaco is fully ready
      setMode('code');
    }, 200);
    console.log('✅ Monaco Editor initialized successfully');
  } catch (error) {
    console.error('❌ Monaco Editor failed to load:', error);
    console.error('Error details:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name
    });
    console.log('📝 Falling back to textareas - app will still work but without syntax highlighting');
    // Fallback: create textareas if Monaco fails to load
    createTextareaFallback();
  }
}

// Fallback to textareas if Monaco fails
function createTextareaFallback() {
  // Don't create if already created
  if (document.getElementById('input-text-fallback')) {
    return;
  }

  console.log('✅ Textarea fallback activated - app is now functional');
  const inputTextarea = document.createElement('textarea');
  inputTextarea.id = 'input-text-fallback';
  inputTextarea.className = 'textarea-fallback';
  inputTextarea.placeholder = 'Paste your code or text here...';
  inputTextContainer.innerHTML = '';
  inputTextContainer.appendChild(inputTextarea);

  const outputTextarea = document.createElement('textarea');
  outputTextarea.id = 'output-text-fallback';
  outputTextarea.className = 'textarea-fallback';
  outputTextarea.readOnly = true;
  outputTextarea.placeholder = 'Masked output will appear here...';
  outputTextContainer.innerHTML = '';
  outputTextContainer.appendChild(outputTextarea);

  // Assign to global variables
  inputFallback = inputTextarea;
  outputFallback = outputTextarea;

  // Note: We don't need to redefine the getters/setters since they already check for inputFallback/outputFallback

  // At this point, inputFallback and outputFallback are guaranteed to be non-null
  if (inputFallback) {
    inputFallback.addEventListener('input', () => {
      updateSymbols();
      renderSelectedChips();
    });
  }

  // Scroll sync for textareas
  if (inputFallback && outputFallback) {
    let isScrolling = false;
    inputFallback.addEventListener('scroll', () => {
      if (!isScrolling && outputFallback) {
        isScrolling = true;
        outputFallback.scrollTop = inputFallback.scrollTop;
        outputFallback.scrollLeft = inputFallback.scrollLeft;
        isScrolling = false;
      }
    });

    outputFallback.addEventListener('scroll', () => {
      if (!isScrolling && inputFallback) {
        isScrolling = true;
        inputFallback.scrollTop = outputFallback.scrollTop;
        inputFallback.scrollLeft = outputFallback.scrollLeft;
        isScrolling = false;
      }
    });
  }

  if (inputFallback) {
    setupContextMenuForTextarea(inputFallback);
  }
}

// Bind all event listeners - call this after DOM is ready
function bindEvents() {
  // Titlebar search functionality
  const titlebarSearch = document.getElementById('titlebar-search') as HTMLInputElement;
  const titlebarSearchClear = document.getElementById('titlebar-search-clear') as HTMLButtonElement;
  
  if (titlebarSearch && titlebarSearchClear) {
    // Show/hide clear button based on input
    titlebarSearch.addEventListener('input', () => {
      if (titlebarSearch.value.length > 0) {
        titlebarSearchClear.style.display = 'flex';
      } else {
        titlebarSearchClear.style.display = 'none';
      }
    });
    
    // Clear search when clicking clear button
    titlebarSearchClear.addEventListener('click', () => {
      clearSearch();
      titlebarSearch.value = '';
      titlebarSearchClear.style.display = 'none';
      titlebarSearch.focus();
    });
    
    // Handle search
    titlebarSearch.addEventListener('input', () => {
      const searchTerm = titlebarSearch.value;
      performSearch(searchTerm);
    });
    
    titlebarSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSearch();
        titlebarSearch.value = '';
        titlebarSearchClear.style.display = 'none';
        titlebarSearch.blur();
      }
    });
  }
  
  // Mode buttons
  modeCodeBtn.addEventListener('click', () => {
    setMode('code');
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) tab.mode = 'code';
    }
  });
  modeTextBtn.addEventListener('click', () => {
    setMode('text');
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) tab.mode = 'text';
    }
  });

  // Language selector
  languageSelect.addEventListener('change', () => {
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) tab.language = getLanguage();
    }
    if (currentMode === 'code') {
      updateEditorLanguage();
      updateSymbols();
    }
  });

  // Include properties checkbox
  includeProperties.addEventListener('change', () => {
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) tab.includeProperties = includeProperties.checked;
    }
    if (currentMode === 'code') {
      updateSymbols();
    }
  });

  // Clear selected items
  clearSelectedBtn.addEventListener('click', () => {
    selectedItems.clear();
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        tab.selectedItems.clear();
      }
    }
    updateSelectedCount();
  });

  // Auto-mask
  autoMaskBtn.addEventListener('click', async () => {
    const code = inputText.value;
    if (!code) return;
    
    try {
      const includeProps = includeProperties.checked;
      const masked = await window.electronAPI.codeAutoMask(code, getNamespace(), getLanguage(), includeProps);
      outputText.value = masked;
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.output = outputText.value;
        }
      }
    } catch (e) {
      console.error('Error auto-masking:', e);
      alert('Error: ' + (e as Error).message);
    }
  });

  // Mask selected (code)
  maskSelectedBtn.addEventListener('click', async () => {
    const code = inputText.value;
    if (!code || selectedItems.size === 0) return;
    
    try {
      const selected = Array.from(selectedItems);
      const masked = await window.electronAPI.codeSelectMask(code, selected, getNamespace(), getLanguage());
      outputText.value = masked;
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.output = outputText.value;
        }
      }
    } catch (e) {
      console.error('Error masking selected:', e);
      alert('Error: ' + (e as Error).message);
    }
  });

  // Mask selected (text)
  textMaskBtn.addEventListener('click', async () => {
    const text = inputText.value;
    if (!text || selectedItems.size === 0) return;
    
    try {
      const selected = Array.from(selectedItems);
      const masked = await window.electronAPI.textMaskSelected(text, selected, getNamespace(), false);
      outputText.value = masked;
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.output = outputText.value;
        }
      }
    } catch (e) {
      console.error('Error masking text:', e);
      alert('Error: ' + (e as Error).message);
    }
  });

  // Unmask
  unmaskBtn.addEventListener('click', async () => {
    // Prioritize input field (where user pastes new masked code)
    const text = inputText.value || outputText.value;
    if (!text) return;
    
    try {
      const unmasked = await window.electronAPI.unmask(text, getNamespace());
      outputText.value = unmasked;
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.output = outputText.value;
        }
      }
    } catch (e) {
      console.error('Error unmasking:', e);
      alert('Error: ' + (e as Error).message);
    }
  });

  // Copy
  copyBtn.addEventListener('click', async () => {
    const text = outputText.value;
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        // Visual feedback
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = original;
        }, 1000);
      } catch (e) {
        console.error('Error copying:', e);
        await showAlertDialog('Error', 'Error copying to clipboard');
      }
    }
  });

  // Refresh namespaces list
  refreshNamespacesBtn.addEventListener('click', async () => {
    await loadNamespaces();
  });

  // Namespace selector modal
  namespaceSelectorSelectBtn.addEventListener('click', () => {
    if (selectedNamespaceInSelector) {
      namespaceInput.value = selectedNamespaceInSelector;
      // Save to current tab
      saveCurrentTabState();
      hideNamespaceSelector();
    }
  });

  namespaceSelectorCancelBtn.addEventListener('click', () => {
    hideNamespaceSelector();
  });

  namespaceSelectorCloseBtn.addEventListener('click', () => {
    hideNamespaceSelector();
  });

  // Close modal when clicking overlay (but not when clicking inside modal)
  namespaceSelectorOverlay.addEventListener('click', (e) => {
    if (e.target === namespaceSelectorOverlay) {
      hideNamespaceSelector();
    }
  });

  // Prevent modal from closing when clicking inside
  const namespaceSelectorModal = namespaceSelectorOverlay.querySelector('.namespace-selector-modal');
  if (namespaceSelectorModal) {
    namespaceSelectorModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Close modal on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !namespaceSelectorOverlay.classList.contains('hidden')) {
      hideNamespaceSelector();
    }
  });

  // Filter namespaces in selector
  namespaceSelectorFilter.addEventListener('input', (e) => {
    const filter = (e.target as HTMLInputElement).value.toLowerCase();
    const items = namespaceSelectorList.querySelectorAll('.namespace-list-item');
    
    items.forEach((item) => {
      const name = item.querySelector('.namespace-list-item-name')?.textContent?.toLowerCase() || '';
      if (name.includes(filter)) {
        (item as HTMLElement).style.display = '';
      } else {
        (item as HTMLElement).style.display = 'none';
      }
    });
  });

  // Listen for menu item click
  window.electronAPI.onViewSelectNamespace(() => {
    showNamespaceSelector();
  });

  // Wipe mapping
  wipeBtn.addEventListener('click', async () => {
    // Save current tab state to get the namespace
    saveCurrentTabState();
    
    const currentNamespace = getNamespace();
    const namespaceLabel = currentNamespace === 'default' ? 'default mapping group' : `mapping group "${currentNamespace}"`;
    
    const confirmed = await showConfirmDialog(
      'Wipe Mappings',
      `Are you sure you want to wipe all mappings for the ${namespaceLabel}? This action cannot be undone.`,
      'Wipe',
      'Cancel'
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      // Show "Clearing..." message with spinner
      showStatusMessage('Clearing...', true);
      
      await window.electronAPI.wipeMapping(currentNamespace);
      await loadNamespaces(); // Reload namespaces list after wiping
      
      // Show "Cleared" message briefly (2 seconds)
      showStatusMessage('Cleared', false);
      setTimeout(() => {
        hideStatusMessage();
      }, 2000);
    } catch (e) {
      console.error('Error wiping mapping:', e);
      // Hide status message on error
      hideStatusMessage();
      await showAlertDialog('Error', 'Error: ' + (e as Error).message);
    }
  });

  // Detect buttons
  async function addDetections(type: string) {
    const text = inputText.value;
    if (!text) return;
    
    try {
      const detections = await window.electronAPI.textDetect(text);
      const filtered = detections.filter(d => d.type === type);
      filtered.forEach(d => {
        selectedItems.add(d.text);
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId);
          if (tab) tab.selectedItems.add(d.text);
        }
      });
      updateSelectedCount();
    } catch (e) {
      console.error('Error detecting:', e);
      await showAlertDialog('Error', 'Error: ' + (e as Error).message);
    }
  }

  detectEmailBtn.addEventListener('click', () => addDetections('email'));
  detectUrlBtn.addEventListener('click', () => addDetections('url'));
  detectUuidBtn.addEventListener('click', () => addDetections('uuid'));
  detectPhoneBtn.addEventListener('click', () => addDetections('phone'));

  // Copy note
  copyNoteBtn.addEventListener('click', () => {
    const note = 'This code/text contains placeholder identifiers like v6g9j2r41m5qk. Do not rename or modify them.';
    navigator.clipboard.writeText(note).then(() => {
      const original = copyNoteBtn.textContent;
      copyNoteBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyNoteBtn.textContent = original;
      }, 1000);
    });
  });

  // Arrow click - move all symbols to selected items
  if (arrowRight) {
    arrowRight.addEventListener('click', () => {
      console.log('Arrow clicked, symbols:', symbols);
      const beforeCount = selectedItems.size;
      symbols.forEach(symbol => {
        selectedItems.add(symbol);
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId);
          if (tab) tab.selectedItems.add(symbol);
        }
      });
      const afterCount = selectedItems.size;
      console.log('Selected items before:', beforeCount, 'after:', afterCount);
      updateSelectedCount();
    });
  } else {
    console.error('arrowRight element not found');
  }

  // Titlebar controls
  const titlebarMinimize = document.getElementById('titlebar-minimize');
  const titlebarMaximize = document.getElementById('titlebar-maximize');
  const titlebarClose = document.getElementById('titlebar-close');

  if (titlebarMinimize) {
    titlebarMinimize.addEventListener('click', () => {
      window.electronAPI.windowMinimize();
    });
  }

  if (titlebarMaximize) {
    // Handle mousedown to set flag early and prevent drag region handler from interfering
    titlebarMaximize.addEventListener('mousedown', (e) => {
      // Only set flag if window is maximized (to prevent drag handler from restoring)
      // If window is not maximized, we don't need the flag
      if (isWindowMaximized) {
        isRestoring = true;
        console.log('[BUTTON] mousedown - set isRestoring = true (window is maximized)');
      }
      // Stop both propagation and immediate propagation to completely block other handlers
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true); // Use capture phase to catch it first
    
    titlebarMaximize.addEventListener('click', (e) => {
      console.log('[BUTTON] Restore/Maximize button clicked');
      console.log('[BUTTON] Current state - isWindowMaximized:', isWindowMaximized, 'isRestoring:', isRestoring);
      
      // CRITICAL: Clear isRestoring if window is not maximized
      // This prevents stale flag from causing issues
      if (!isWindowMaximized && isRestoring) {
        console.log('[BUTTON] Window not maximized but isRestoring is true - clearing flag');
        isRestoring = false;
      }
      
      // Only set isRestoring if window is maximized (we're about to restore)
      // Don't set it if window is not maximized (we're about to maximize)
      if (isWindowMaximized && !isRestoring) {
        isRestoring = true;
        console.log('[BUTTON] Set isRestoring = true (about to restore)');
      }
      
      // Stop propagation
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.electronAPI.windowMaximize();
      console.log('[BUTTON] Called windowMaximize()');
      // Flag will be reset by maximize/unmaximize event handlers
    }, true); // Use capture phase

    // Listen for window maximize/unmaximize events to update icon
    window.electronAPI.onWindowMaximized(() => {
      console.log('[EVENT] Window maximized event received');
      isWindowMaximized = true;
      isRestoring = false; // Reset flag when maximized
      updateMaximizeButtonIcon(true);
      console.log('[EVENT] Updated state - isWindowMaximized:', isWindowMaximized, 'isRestoring:', isRestoring);
      
      // Ensure titlebar and tab bar are visible after maximize
      requestAnimationFrame(() => {
        // Ensure titlebar is visible
        const titlebar = document.querySelector('.titlebar') as HTMLElement;
        if (titlebar) {
          titlebar.style.display = 'flex';
          titlebar.style.visibility = 'visible';
          titlebar.style.opacity = '1';
          titlebar.style.zIndex = '1000';
          console.log('[EVENT] Titlebar visibility ensured after maximize');
        }
        
        // Ensure tab bar is visible
        const tabBar = document.getElementById('tab-bar');
        if (tabBar) {
          tabBar.style.display = 'flex';
          tabBar.style.visibility = 'visible';
          tabBar.style.opacity = '1';
          console.log('[EVENT] Tab bar visibility ensured after maximize');
        }
      });
    });

    window.electronAPI.onWindowUnmaximized(() => {
      console.log('[EVENT] Window unmaximized event received');
      isWindowMaximized = false;
      // Reset flag immediately - the restore is complete
      isRestoring = false;
      updateMaximizeButtonIcon(false);
      console.log('[EVENT] Updated state - isWindowMaximized:', isWindowMaximized, 'isRestoring:', isRestoring);
      
      // Force a small delay to ensure UI is responsive after restore
      // This prevents any potential freeze from rapid state changes
      // Use requestAnimationFrame to ensure UI updates before allowing interaction
      requestAnimationFrame(() => {
        // Ensure drag region is still functional
        // Force a reflow to ensure the window is ready for interaction
        void document.body.offsetHeight; // Force reflow
        
        // CRITICAL: Ensure tab bar is visible after restore
        const tabBar = document.getElementById('tab-bar');
        if (tabBar) {
          // Remove any inline styles that might hide it
          tabBar.style.display = 'flex';
          tabBar.style.visibility = 'visible';
          tabBar.style.opacity = '1';
          tabBar.style.height = '36px';
          tabBar.style.position = 'relative';
          tabBar.style.zIndex = '1';
          // Force a reflow to ensure it's rendered
          void tabBar.offsetHeight;
          console.log('[EVENT] Tab bar visibility ensured after restore');
        } else {
          console.error('[EVENT] Tab bar element not found!');
        }
        
        // Ensure pointer events are enabled (in case something disabled them)
        document.body.style.pointerEvents = 'auto';
        const dragRegion = document.querySelector('.titlebar-drag-region') as HTMLElement;
        if (dragRegion) {
          dragRegion.style.pointerEvents = 'auto';
          // Ensure drag region CSS is still applied
          dragRegion.style.setProperty('-webkit-app-region', 'drag', 'important');
        }
        
        // CRITICAL: Ensure titlebar is visible after restore
        const titlebar = document.querySelector('.titlebar') as HTMLElement;
        if (titlebar) {
          titlebar.style.display = 'flex';
          titlebar.style.visibility = 'visible';
          titlebar.style.opacity = '1';
          titlebar.style.zIndex = '1000';
          // Force a reflow to ensure it's rendered
          void titlebar.offsetHeight;
          console.log('[EVENT] Titlebar visibility ensured after restore');
        } else {
          console.error('[EVENT] Titlebar element not found!');
        }
        
        console.log('[EVENT] UI should be responsive now');
        
        // Additional check after a brief delay
        setTimeout(() => {
          // Try to focus the window content to ensure it can receive keyboard events
          const activeElement = document.activeElement;
          if (activeElement && activeElement !== document.body) {
            (activeElement as HTMLElement).blur();
          }
          document.body.focus();
          console.log('[EVENT] Attempted to focus body element');
          
          // CRITICAL: Force a relayout to fix mouse coordinate offset issue
          // This ensures clickable areas match visual elements
          void document.body.offsetHeight; // Force reflow
          // Trigger a resize event to ensure layout is correct
          window.dispatchEvent(new Event('resize'));
          console.log('[EVENT] Forced relayout to fix mouse coordinate offset');
        }, 50);
      });
    });
  }

  if (titlebarClose) {
    titlebarClose.addEventListener('click', () => {
      window.electronAPI.windowClose();
    });
  }

  // Double-click on titlebar drag region to toggle maximize/restore
  // Also handle dragging: if window is maximized, restore it first when dragging starts
  const titlebarDragRegion = document.querySelector('.titlebar-drag-region');
  if (titlebarDragRegion) {
    // Handle double-click for maximize/restore
    titlebarDragRegion.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      
      // Ignore double-clicks on buttons/controls inside the titlebar
      if (target.closest('#titlebar-minimize, #titlebar-maximize, #titlebar-close, .menu-item')) {
        return;
      }
      
      console.log('[DBLCLICK] Double-click on titlebar');
      console.log('[DBLCLICK] Current state - isWindowMaximized:', isWindowMaximized);
      
      // Prevent OS from handling the double-click, but don't block other handlers
      e.preventDefault();
      e.stopPropagation();
      // Don't use stopImmediatePropagation() - it blocks other event handlers
      
      // Use our custom maximize logic which ensures full screen coverage
      // The main.ts maximize event listener will also apply correction if OS handles it
      window.electronAPI.windowMaximize();
      console.log('[DBLCLICK] Called windowMaximize()');
    });
    
    // Handle dragging: restore window if maximized when user starts dragging
    // This is critical - dragging a maximized window must restore it first
    // Use capture phase false (bubble phase) so button handlers run first
    titlebarDragRegion.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      
      // CRITICAL: Ignore clicks on buttons/controls inside the titlebar
      // Check multiple ways to be absolutely sure we don't interfere with buttons
      const isButton = target.closest('#titlebar-minimize, #titlebar-maximize, #titlebar-close, .menu-item, .titlebar-controls, .titlebar-button') ||
                      target.tagName === 'BUTTON' ||
                      target.closest('button') ||
                      target.closest('.titlebar-button');
      
      if (isButton) {
        // Completely ignore this event if it's from a button - return immediately
        return;
      }
      
      // If window is maximized, restore it first before allowing drag
      // This prevents the freeze issue where dragging a maximized window doesn't work
      if (isWindowMaximized && !isRestoring) {
        console.log('[DRAG] Dragging maximized window - restoring first');
        console.log('[DRAG] isWindowMaximized:', isWindowMaximized, 'isRestoring:', isRestoring);
        // Set flag to prevent other handlers from interfering
        isRestoring = true;
        // Restore the window first (windowMaximize toggles, so it will restore)
        // The restore happens synchronously in the main process, so drag will work immediately after
        window.electronAPI.windowMaximize();
        console.log('[DRAG] Called windowMaximize() to restore');
        // Flag will be reset by unmaximize event handler
        // Note: We don't prevent default here - we want Electron's native drag to work
        // after the restore completes. The restore is synchronous, so it should work.
        // Use a small delay to ensure restore completes before allowing drag
        setTimeout(() => {
          isRestoring = false;
          console.log('[DRAG] Cleared isRestoring flag - drag should work now');
        }, 50);
      }
      // If not maximized, let Electron's native drag handle it normally
      // CRITICAL: Don't prevent default or stop propagation - we need Electron's native drag to work
    }, false); // Use bubble phase (false) so button handlers in capture phase run first
  }

  // Hide context menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (contextMenuVisible && contextMenu && !contextMenu.contains(e.target as Node)) {
      hideContextMenu();
    }
    // Hide output context menu when clicking elsewhere
    if (outputContextMenu && !outputContextMenu.contains(e.target as Node)) {
      hideOutputContextMenu();
    }
    // Hide tab context menu when clicking elsewhere
    if (tabContextMenu && !tabContextMenu.contains(e.target as Node)) {
      hideTabContextMenu();
    }
  });

  // Hide context menu on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && contextMenuVisible) {
      hideContextMenu();
    }
  });

  // File operations listeners
  window.electronAPI.onFileOpened((content: string, filePath: string) => {
    loadFileContent(content, filePath);
  });

  window.electronAPI.onFileSave(() => {
    saveFile(false);
  });

  window.electronAPI.onFileSaveAs(() => {
    saveFile(true);
  });

  window.electronAPI.onFileNew(() => {
    // Create a new tab
    createNewTab();
  });

  // Help menu listeners
  window.electronAPI.onHelpAbout(() => {
    showAboutDialog();
  });

  window.electronAPI.onHelpRestart(async () => {
    const confirmed = await showConfirmDialog(
      'Restart to Update',
      'This will restart the application. Any unsaved changes will be lost. Continue?',
      'Restart',
      'Cancel'
    );
    if (confirmed) {
      window.electronAPI.helpRestart();
    }
  });

  // Edit menu listeners
  window.electronAPI.onEditCut(() => {
    performCut();
  });

  window.electronAPI.onEditCopy(() => {
    performCopy();
  });

  window.electronAPI.onEditPaste(() => {
    performPaste();
  });

  window.electronAPI.onEditDelete(() => {
    performDelete();
  });

  window.electronAPI.onEditUndo(() => {
    performUndo();
  });

  window.electronAPI.onEditRedo(() => {
    performRedo();
  });

  window.electronAPI.onEditClearInput(() => {
    inputText.value = '';
    // Save to current tab
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        tab.input = '';
      }
    }
    // Update symbols if in code mode
    if (currentMode === 'code') {
      updateSymbols();
    }
  });

  window.electronAPI.onEditClearOutput(() => {
    outputText.value = '';
    // Save to current tab
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        tab.output = '';
      }
    }
  });

  // Menu bar handlers
  setupMenuBar();
  
  // Tab system handlers
  setupTabs();
  
  // Create initial tab
  createNewTab();
}

// Tab system state
interface TabState {
  id: string;
  title: string;
  input: string;
  output: string;
  selectedItems: Set<string>;
  symbols: string[];
  mode: Mode;
  language: string;
  namespace: string;
  includeProperties: boolean;
}

// Tab system variables
let tabs: TabState[] = [];
let activeTabId: string | null = null;
let tabCounter = 1;

// Tab system functions
function setupTabs() {
  const tabAddButton = document.getElementById('tab-add-button');
  if (tabAddButton) {
    tabAddButton.addEventListener('click', () => {
      createNewTab();
    });
  }

  // Also wire IPC shortcuts for next/previous tab
  window.electronAPI.onViewNextTab?.(() => {
    goToNextTab();
  });
  window.electronAPI.onViewPreviousTab?.(() => {
    goToPreviousTab();
  });
  
  // Recalculate tabs on window resize
  let resizeTimeout: number | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
    resizeTimeout = window.setTimeout(() => {
      renderTabs();
    }, 100);
  });
  window.electronAPI.onViewSetLanguage?.((lang: string) => {
    if (lang === 'plaintext') {
      // Switch to Text mode
      setMode('text');
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) tab.mode = 'text';
      }
      return;
    }
    // Switch to Code mode with selected language
    setMode('code');
    if (languageSelect) {
      languageSelect.value = lang;
    }
    if (activeTabId) {
      const tab = tabs.find(t => t.id === activeTabId);
      if (tab) {
        tab.mode = 'code';
        tab.language = lang;
      }
    }
    updateEditorLanguage();
  });
}

function createNewTab(): string {
  const tabId = `tab-${tabCounter++}`;
  const tabTitle = tabs.length === 0 ? 'Untitled' : `Untitled ${tabCounter - 1}`;
  
  const newTab: TabState = {
    id: tabId,
    title: tabTitle,
    input: '',
    output: '',
    selectedItems: new Set(),
    symbols: [],
    mode: 'code',
    language: 'python', // Open Source version - Python only
    namespace: 'default',
    includeProperties: true
  };
  
  tabs.push(newTab);
  renderTabs();
  switchToTab(tabId);
  
  return tabId;
}

function switchToTab(tabId: string) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  // Save current tab state before switching
  if (activeTabId) {
    saveCurrentTabState();
  }
  
  // Switch to new tab
  activeTabId = tabId;
  
  // Load tab state
  loadTabState(tab);
  
  // Update UI
  renderTabs();
  updateUIFromState();
}

// Navigate to next/previous tab helpers
function goToNextTab() {
  if (!activeTabId || tabs.length === 0) return;
  const index = tabs.findIndex(t => t.id === activeTabId);
  if (index === -1) return;
  const nextIndex = (index + 1) % tabs.length;
  switchToTab(tabs[nextIndex].id);
}

function goToPreviousTab() {
  if (!activeTabId || tabs.length === 0) return;
  const index = tabs.findIndex(t => t.id === activeTabId);
  if (index === -1) return;
  const prevIndex = (index - 1 + tabs.length) % tabs.length;
  switchToTab(tabs[prevIndex].id);
}
function closeTab(tabId: string) {
  if (tabs.length <= 1) {
    // Don't allow closing the last tab - just clear it instead
    const tab = tabs[0];
    if (tab) {
      tab.input = '';
      tab.output = '';
      tab.selectedItems.clear();
      tab.symbols = [];
      loadTabState(tab);
      updateUIFromState();
    }
    return;
  }
  
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;
  
  tabs.splice(tabIndex, 1);
  
  // If we closed the active tab, switch to another one
  if (activeTabId === tabId) {
    if (tabIndex > 0) {
      switchToTab(tabs[tabIndex - 1].id);
    } else if (tabs.length > 0) {
      switchToTab(tabs[0].id);
    } else {
      activeTabId = null;
    }
  }
  
  renderTabs();
}

function saveCurrentTabState() {
  if (!activeTabId) return;
  
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  
  tab.input = inputText.value;
  tab.output = outputText.value;
  tab.selectedItems = new Set(selectedItems);
  tab.symbols = [...symbols];
  tab.mode = currentMode;
  tab.language = getLanguage();
  tab.namespace = getNamespace();
  tab.includeProperties = includeProperties.checked;
  
  // Tab title remains as "Untitled" until file is saved or manually renamed
  // This follows the standard approach used by VS Code and other editors
}

function loadTabState(tab: TabState) {
  inputText.value = tab.input;
  outputText.value = tab.output;
  selectedItems = new Set(tab.selectedItems);
  symbols = [...tab.symbols];
  currentMode = tab.mode;
  languageSelect.value = tab.language;
  namespaceInput.value = tab.namespace;
  includeProperties.checked = tab.includeProperties;
}

function updateUIFromState() {
  setMode(currentMode);
  updateSelectedCount();
  renderSymbols();
  renderSelectedChips();
  updateEditorLanguage();
  if (currentMode === 'code') {
    updateSymbols();
  }
}

// Tab context menu
let tabContextMenu: HTMLElement | null = null;
let tabContextMenuTabId: string | null = null;

function createTabContextMenu() {
  if (tabContextMenu) return tabContextMenu;
  
  tabContextMenu = document.createElement('div');
  tabContextMenu.id = 'tab-context-menu';
  tabContextMenu.className = 'context-menu hidden';
  tabContextMenu.innerHTML = `
    <button id="tab-context-rename" class="context-menu-item">Rename</button>
    <div class="context-menu-separator"></div>
    <button id="tab-context-save-as" class="context-menu-item">Save As</button>
    <div class="context-menu-separator"></div>
    <button id="tab-context-delete" class="context-menu-item">Delete</button>
    <div class="context-menu-separator"></div>
    <button id="tab-context-close" class="context-menu-item">Close</button>
  `;
  document.body.appendChild(tabContextMenu);
  
  // Handle Rename
  const renameBtn = document.getElementById('tab-context-rename');
  if (renameBtn) {
    renameBtn.addEventListener('click', () => {
      if (tabContextMenuTabId) {
        renameTab(tabContextMenuTabId);
      }
      hideTabContextMenu();
    });
  }
  
  // Handle Save As
  const saveAsBtn = document.getElementById('tab-context-save-as');
  if (saveAsBtn) {
    saveAsBtn.addEventListener('click', async () => {
      if (tabContextMenuTabId) {
        await saveTabAs(tabContextMenuTabId);
      }
      hideTabContextMenu();
    });
  }
  
  // Handle Delete
  const deleteBtn = document.getElementById('tab-context-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (tabContextMenuTabId) {
        closeTab(tabContextMenuTabId);
      }
      hideTabContextMenu();
    });
  }
  
  // Handle Close
  const closeBtn = document.getElementById('tab-context-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (tabContextMenuTabId) {
        closeTab(tabContextMenuTabId);
      }
      hideTabContextMenu();
    });
  }
  
  return tabContextMenu;
}

function showTabContextMenu(x: number, y: number, tabId: string) {
  if (!tabContextMenu) {
    createTabContextMenu();
  }
  if (!tabContextMenu) return;
  
  tabContextMenuTabId = tabId;
  tabContextMenu.style.left = `${x}px`;
  tabContextMenu.style.top = `${y}px`;
  tabContextMenu.style.zIndex = '10001';
  tabContextMenu.classList.remove('hidden');
}

function hideTabContextMenu() {
  if (tabContextMenu) {
    tabContextMenu.classList.add('hidden');
    tabContextMenuTabId = null;
  }
}

async function renameTab(tabId: string) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  const newName = await showPromptDialog('Rename Tab', 'Enter new tab name:', tab.title);
  if (newName !== null && newName.trim().length > 0) {
    tab.title = newName.trim();
    renderTabs();
  }
}

async function saveTabAs(tabId: string) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  // Save current tab state
  if (activeTabId === tabId) {
    saveCurrentTabState();
  }
  
  // Save both input and output
  const content = `===INPUT===\n${tab.input}\n\n===OUTPUT===\n${tab.output}`;
  
  try {
    const result = await window.electronAPI.fileSaveAs(content);
    if (result.success) {
      // Update tab title with filename if saved successfully
      if (result.path) {
        const fileName = result.path.split(/[/\\]/).pop() || 'Untitled';
        tab.title = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
        renderTabs();
      }
      await showAlertDialog('Success', `File saved successfully: ${result.path}`);
    } else {
      await showAlertDialog('Error', `Error saving file: ${result.error}`);
    }
  } catch (e) {
    console.error('Error saving file:', e);
    await showAlertDialog('Error', 'Error: ' + (e as Error).message);
  }
}

function renderTabs() {
  const tabsContainer = document.getElementById('tabs-container');
  const tabBar = document.getElementById('tab-bar');
  if (!tabsContainer || !tabBar) return;
  
  // Get the add button before clearing
  const addButton = document.getElementById('tab-add-button');
  const existingDropdown = document.getElementById('tab-dropdown-button');
  
  // Clear container
  tabsContainer.innerHTML = '';
  
  // Remove existing dropdown if present
  if (existingDropdown) {
    existingDropdown.remove();
  }
  
  // Create tab context menu if it doesn't exist
  createTabContextMenu();
  
  if (tabs.length === 0) {
    // Re-add the add button if no tabs
    if (addButton) {
      tabsContainer.appendChild(addButton);
    } else {
      const newAddButton = document.createElement('button');
      newAddButton.className = 'tab-add-button';
      newAddButton.id = 'tab-add-button';
      newAddButton.title = 'New Tab';
      newAddButton.textContent = '+';
      newAddButton.addEventListener('click', () => {
        createNewTab();
      });
      tabsContainer.appendChild(newAddButton);
    }
    return;
  }
  
  // Calculate available width for tabs
  const tabBarRect = tabBar.getBoundingClientRect();
  const addButtonWidth = 32; // Width of add button
  const dropdownButtonWidth = 32; // Width of dropdown button
  const padding = 0; // Any padding/margins
  
  // Temporarily add add button to measure
  const tempAddButton = document.createElement('button');
  tempAddButton.className = 'tab-add-button';
  tempAddButton.style.visibility = 'hidden';
  tempAddButton.style.position = 'absolute';
  tabsContainer.appendChild(tempAddButton);
  const addBtnWidth = tempAddButton.offsetWidth;
  tempAddButton.remove();
  
  const availableWidth = tabBarRect.width - addBtnWidth - padding;
  
  // Create all tab elements first (but don't append yet)
  const tabElements: Array<{ element: HTMLElement; width: number; tab: TabState }> = [];
  
  tabs.forEach(tab => {
    const tabElement = document.createElement('button');
    tabElement.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
    tabElement.dataset.tabId = tab.id;
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'tab-title';
    titleSpan.textContent = tab.title;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    
    tabElement.appendChild(titleSpan);
    tabElement.appendChild(closeBtn);
    
    tabElement.addEventListener('click', () => {
      switchToTab(tab.id);
    });
    
    // Right-click context menu
    tabElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTabContextMenu(e.pageX, e.pageY, tab.id);
    });
    
    // Measure tab width
    tabElement.style.visibility = 'hidden';
    tabElement.style.position = 'absolute';
    tabsContainer.appendChild(tabElement);
    const tabWidth = tabElement.offsetWidth;
    tabElement.remove();
    tabElement.style.visibility = '';
    tabElement.style.position = '';
    
    tabElements.push({ element: tabElement, width: tabWidth, tab });
  });
  
  // Calculate how many tabs can fit
  // First, ensure active tab is visible if possible
  const activeTabIndex = activeTabId ? tabElements.findIndex(te => te.tab.id === activeTabId) : -1;
  
  let totalWidth = 0;
  let visibleCount = 0;
  const hiddenTabs: TabState[] = [];
  const visibleIndices = new Set<number>();
  
  // If we have an active tab and it's not the last one, we need to ensure it's visible
  // Strategy: Start from the right and work backwards, but ensure active tab is included
  if (activeTabIndex >= 0 && activeTabIndex < tabElements.length - 1) {
    // Start from active tab and work rightwards first
    const activeTab = tabElements[activeTabIndex];
    totalWidth = activeTab.width;
    visibleCount = 1;
    
    visibleIndices.add(activeTabIndex);
    
    // Add tabs to the right of active tab
    for (let i = activeTabIndex + 1; i < tabElements.length; i++) {
      const { width } = tabElements[i];
      const dropdownNeeded = hiddenTabs.length > 0 || (totalWidth + width > availableWidth);
      const dropdownSpace = dropdownNeeded ? dropdownButtonWidth : 0;
      
      if (totalWidth + width + dropdownSpace <= availableWidth) {
        totalWidth += width;
        visibleIndices.add(i);
      } else {
        break;
      }
    }
    
    // If there's still space, add tabs to the left of active tab
    for (let i = activeTabIndex - 1; i >= 0; i--) {
      const { width } = tabElements[i];
      const dropdownNeeded = hiddenTabs.length > 0 || (totalWidth + width > availableWidth);
      const dropdownSpace = dropdownNeeded ? dropdownButtonWidth : 0;
      
      if (totalWidth + width + dropdownSpace <= availableWidth) {
        totalWidth += width;
        visibleIndices.add(i);
      } else {
        break;
      }
    }
    
    // Collect hidden tabs
    for (let i = 0; i < tabElements.length; i++) {
      if (!visibleIndices.has(i)) {
        hiddenTabs.push(tabElements[i].tab);
      }
    }
  } else {
    // No active tab or active tab is last - use simple right-to-left strategy
    for (let i = tabElements.length - 1; i >= 0; i--) {
      const { width, tab } = tabElements[i];
      const neededWidth = totalWidth + width;
      const dropdownNeeded = hiddenTabs.length > 0 || (neededWidth > availableWidth && visibleCount > 0);
      const dropdownSpace = dropdownNeeded ? dropdownButtonWidth : 0;
      
      if (neededWidth + dropdownSpace <= availableWidth) {
        totalWidth += width;
        visibleCount++;
        visibleIndices.add(i);
      } else {
        hiddenTabs.unshift(tab);
      }
    }
    hiddenTabs.reverse();
  }
  
  // Render visible tabs in order (left to right)
  for (let i = 0; i < tabElements.length; i++) {
    if (visibleIndices.has(i)) {
      tabsContainer.appendChild(tabElements[i].element);
    }
  }
  
  // Add dropdown button if there are hidden tabs
  if (hiddenTabs.length > 0) {
    const dropdownButton = document.createElement('button');
    dropdownButton.className = 'tab-dropdown-button';
    dropdownButton.id = 'tab-dropdown-button';
    dropdownButton.title = `${hiddenTabs.length} more tab${hiddenTabs.length > 1 ? 's' : ''}`;
    dropdownButton.innerHTML = '▼';
    dropdownButton.addEventListener('click', (e) => {
      e.stopPropagation();
      showTabDropdown(dropdownButton, hiddenTabs);
    });
    tabsContainer.appendChild(dropdownButton);
  }
  
  // Re-add the add button after all tabs
  if (addButton) {
    tabsContainer.appendChild(addButton);
  } else {
    const newAddButton = document.createElement('button');
    newAddButton.className = 'tab-add-button';
    newAddButton.id = 'tab-add-button';
    newAddButton.title = 'New Tab';
    newAddButton.textContent = '+';
    newAddButton.addEventListener('click', () => {
      createNewTab();
    });
    tabsContainer.appendChild(newAddButton);
  }
}

// Show dropdown menu for hidden tabs
function showTabDropdown(button: HTMLElement, hiddenTabs: TabState[]) {
  // Remove existing dropdown if present
  const existingDropdown = document.getElementById('tab-dropdown-menu');
  if (existingDropdown) {
    existingDropdown.remove();
  }
  
  const dropdown = document.createElement('div');
  dropdown.className = 'tab-dropdown-menu';
  dropdown.id = 'tab-dropdown-menu';
  
  hiddenTabs.forEach(tab => {
    const item = document.createElement('button');
    item.className = `tab-dropdown-item ${tab.id === activeTabId ? 'active' : ''}`;
    item.textContent = tab.title;
    item.title = tab.title;
    item.addEventListener('click', () => {
      switchToTab(tab.id);
      dropdown.remove();
    });
    dropdown.appendChild(item);
  });
  
  document.body.appendChild(dropdown);
  
  // Position dropdown below the button
  const buttonRect = button.getBoundingClientRect();
  dropdown.style.left = `${buttonRect.left}px`;
  dropdown.style.top = `${buttonRect.bottom}px`;
  
  // Close dropdown when clicking outside
  const closeDropdown = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node) && e.target !== button) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
    }
  };
  
  // Use setTimeout to avoid immediate close
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 0);
}

// Setup menu bar functionality
function setupMenuBar() {
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    const titlebarMenu = document.getElementById('titlebar-menu');
    if (titlebarMenu && !titlebarMenu.contains(e.target as Node)) {
      const activeItems = document.querySelectorAll('.menu-item.active');
      activeItems.forEach(item => item.classList.remove('active'));
    }
  });

  // File menu
  const menuFile = document.getElementById('menu-file');
  const dropdownFile = document.getElementById('dropdown-file');
  if (menuFile && dropdownFile) {
    menuFile.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = menuFile.closest('.menu-item')?.classList.contains('active');
      document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
      if (!isActive) {
        menuFile.closest('.menu-item')?.classList.add('active');
      }
    });

    document.getElementById('menu-new-window')?.addEventListener('click', () => {
      // Create a new tab
      createNewTab();
      closeAllMenus();
    });

    document.getElementById('menu-open')?.addEventListener('click', async () => {
      console.log('Menu Open clicked');
      const result = await window.electronAPI.fileOpen();
      console.log('File open result:', { success: result?.success, hasContent: !!result?.content, contentLength: result?.content?.length, path: result?.path, error: result?.error });
      if (result && result.success && result.content && result.path) {
        // Load the file content into the UI
        console.log('Calling loadFileContent with content length:', result.content.length);
        loadFileContent(result.content, result.path);
      } else if (result && !result.success && result.error && result.error !== 'Cancelled') {
        // Show error if file opening failed (but not if user cancelled)
        await showAlertDialog('Error', `Failed to open file: ${result.error}`);
      }
      closeAllMenus();
    });

    document.getElementById('menu-save')?.addEventListener('click', () => {
      window.electronAPI.onFileSave(() => saveFile(false));
      saveFile(false);
      closeAllMenus();
    });

    document.getElementById('menu-save-as')?.addEventListener('click', () => {
      saveFile(true);
      closeAllMenus();
    });
  }

  // Edit menu
  const menuEdit = document.getElementById('menu-edit');
  if (menuEdit) {
    menuEdit.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = menuEdit.closest('.menu-item')?.classList.contains('active');
      document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
      if (!isActive) {
        menuEdit.closest('.menu-item')?.classList.add('active');
      }
    });

    document.getElementById('menu-cut')?.addEventListener('click', async () => {
      await performCut();
      closeAllMenus();
    });

    document.getElementById('menu-copy')?.addEventListener('click', async () => {
      await performCopy();
      closeAllMenus();
    });

    document.getElementById('menu-paste')?.addEventListener('click', async () => {
      await performPaste();
      closeAllMenus();
    });

    document.getElementById('menu-delete')?.addEventListener('click', () => {
      performDelete();
      closeAllMenus();
    });

    document.getElementById('menu-undo')?.addEventListener('click', () => {
      performUndo();
      closeAllMenus();
    });

    document.getElementById('menu-redo')?.addEventListener('click', () => {
      performRedo();
      closeAllMenus();
    });

    document.getElementById('menu-clear-input')?.addEventListener('click', () => {
      inputText.value = '';
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.input = '';
        }
      }
      // Update symbols if in code mode
      if (currentMode === 'code') {
        updateSymbols();
      }
      closeAllMenus();
    });

    document.getElementById('menu-clear-output')?.addEventListener('click', () => {
      outputText.value = '';
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.output = '';
        }
      }
      closeAllMenus();
    });
  }

  // View menu
  const menuView = document.getElementById('menu-view');
  if (menuView) {
    menuView.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = menuView.closest('.menu-item')?.classList.contains('active');
      document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
      if (!isActive) {
        menuView.closest('.menu-item')?.classList.add('active');
      }
    });

    document.getElementById('menu-view-select-namespace')?.addEventListener('click', () => {
      showNamespaceSelector();
      closeAllMenus();
    });

    document.getElementById('menu-dev-tools')?.addEventListener('click', () => {
      // Toggle dev tools via IPC
      window.electronAPI.toggleDevTools?.();
      closeAllMenus();
    });

    // Language submenu (hover to open, like Notepad)
    const languageItem = document.getElementById('menu-language');
    const languageContainer = languageItem?.closest('.menu-submenu-container') as HTMLElement | null;
    const languageSubmenu = document.getElementById('submenu-language');
    if (languageItem && languageContainer && languageSubmenu) {
      const openSubmenu = () => {
        languageContainer.classList.add('open');
        (languageItem as HTMLElement).classList.add('open');
      };
      const closeSubmenu = () => {
        languageContainer.classList.remove('open');
        (languageItem as HTMLElement).classList.remove('open');
      };
      languageItem.addEventListener('mouseenter', openSubmenu);
      languageSubmenu.addEventListener('mouseenter', openSubmenu);
      languageItem.addEventListener('mouseleave', (e) => {
        const to = (e.relatedTarget as Node) || null;
        if (!languageSubmenu.contains(to)) {
          closeSubmenu();
        }
      });
      languageSubmenu.addEventListener('mouseleave', () => {
        closeSubmenu();
      });
      // Close submenu when leaving the main dropdown
      const dropdownView = document.getElementById('dropdown-view');
      dropdownView?.addEventListener('mouseleave', () => {
        closeSubmenu();
      });
    }

    // Language menu handlers (custom titlebar)
    const setLang = (lang: string) => {
      if (lang === 'plaintext') {
        // Plain Text maps to Text mode in the UI
        setMode('text');
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId);
          if (tab) tab.mode = 'text';
        }
        return;
      }
      // Any other language implies Code mode
      setMode('code');
      if (languageSelect) {
        languageSelect.value = lang;
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId);
          if (tab) tab.language = lang;
        }
        updateEditorLanguage();
      }
    };
    // Open Source version - Python and Plain Text only
    document.getElementById('menu-lang-python')?.addEventListener('click', () => { setLang('python'); closeAllMenus(); });
    document.getElementById('menu-lang-plaintext')?.addEventListener('click', () => { setLang('plaintext'); closeAllMenus(); });

    // Next / Previous tab
    document.getElementById('menu-view-next-tab')?.addEventListener('click', () => {
      goToNextTab();
      closeAllMenus();
    });
    document.getElementById('menu-view-prev-tab')?.addEventListener('click', () => {
      goToPreviousTab();
      closeAllMenus();
    });
  }

  // Window menu
  const menuWindow = document.getElementById('menu-window');
  if (menuWindow) {
    menuWindow.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = menuWindow.closest('.menu-item')?.classList.contains('active');
      document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
      if (!isActive) {
        menuWindow.closest('.menu-item')?.classList.add('active');
      }
    });

    document.getElementById('menu-window-new')?.addEventListener('click', () => {
      // Trigger new window via IPC
      window.electronAPI.newWindow?.();
      closeAllMenus();
    });

    document.getElementById('menu-window-close')?.addEventListener('click', () => {
      window.electronAPI.windowClose();
      closeAllMenus();
    });
  }

  // Help menu
  const menuHelp = document.getElementById('menu-help');
  if (menuHelp) {
    menuHelp.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = menuHelp.closest('.menu-item')?.classList.contains('active');
      document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
      if (!isActive) {
        menuHelp.closest('.menu-item')?.classList.add('active');
      }
    });

    document.getElementById('menu-help-about')?.addEventListener('click', () => {
      showAboutDialog();
      closeAllMenus();
    });

    document.getElementById('menu-help-restart')?.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog(
        'Restart to Update',
        'This will restart the application. Any unsaved changes will be lost. Continue?',
        'Restart',
        'Cancel'
      );
      if (confirmed) {
        window.electronAPI.helpRestart();
      }
      closeAllMenus();
    });

    document.getElementById('menu-help-manual')?.addEventListener('click', () => {
      window.electronAPI.helpOpenManual();
      closeAllMenus();
    });
  }
}

function closeAllMenus() {
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
}

// Edit operations (called from context menu and main menu)
async function performCut() {
  const selected = getSelectedText();
  if (selected && selected.length > 0) {
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(selected);
      
      // Delete selection
      if (inputEditor && inputModel) {
        const selection = inputEditor.getSelection();
        if (selection && !selection.isEmpty()) {
          const range = new monaco.Range(
            selection.startLineNumber,
            selection.startColumn,
            selection.endLineNumber,
            selection.endColumn
          );
          const edit = {
            range: range,
            text: ''
          };
          inputEditor.executeEdits('cut', [edit]);
        }
      } else {
        // Fallback for textarea
        const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const text = textarea.value;
          const newText = text.substring(0, start) + text.substring(end);
          textarea.value = newText;
          textarea.setSelectionRange(start, start);
          textarea.focus();
          textarea.dispatchEvent(new Event('input'));
        }
      }
    } catch (e) {
      console.error('Error cutting:', e);
      // Fallback
      if (inputEditor) {
        inputEditor.trigger('cut', 'editor.action.clipboardCutAction', {});
      } else {
        const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
        textarea?.focus();
        document.execCommand('cut');
      }
    }
  }
}

async function performCopy() {
  const selected = getSelectedText();
  if (selected && selected.length > 0) {
    try {
      await navigator.clipboard.writeText(selected);
    } catch (e) {
      console.error('Error copying:', e);
      // Fallback
      if (inputEditor) {
        inputEditor.trigger('copy', 'editor.action.clipboardCopyAction', {});
      } else {
        const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
        textarea?.focus();
        document.execCommand('copy');
      }
    }
  }
}

async function performPaste() {
  try {
    const clipboardText = await navigator.clipboard.readText();
    if (clipboardText && inputEditor && inputModel) {
      const selection = inputEditor.getSelection();
      if (selection) {
        const range = new monaco.Range(
          selection.startLineNumber,
          selection.startColumn,
          selection.endLineNumber,
          selection.endColumn
        );
        const edit = {
          range: range,
          text: clipboardText
        };
        inputEditor.executeEdits('paste', [edit]);
      } else {
        inputEditor.trigger('paste', 'editor.action.clipboardPasteAction', {});
      }
    } else if (clipboardText) {
      // Fallback for textarea
      const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const newText = text.substring(0, start) + clipboardText + text.substring(end);
        textarea.value = newText;
        const newPosition = start + clipboardText.length;
        textarea.setSelectionRange(newPosition, newPosition);
        textarea.focus();
        textarea.dispatchEvent(new Event('input'));
      }
    }
  } catch (e) {
    console.error('Error pasting:', e);
    // Fallback for browsers that don't support clipboard API
    if (inputEditor) {
      inputEditor.focus();
      inputEditor.trigger('paste', 'editor.action.clipboardPasteAction', {});
    } else {
      const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
      textarea?.focus();
      document.execCommand('paste');
    }
  }
}

function performUndo() {
  if (inputEditor) {
    inputEditor.trigger('keyboard', 'undo', {});
  } else {
    // Fallback for textarea
    const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      document.execCommand('undo');
    }
  }
}

function performRedo() {
  if (inputEditor) {
    inputEditor.trigger('keyboard', 'redo', {});
  } else {
    // Fallback for textarea
    const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      document.execCommand('redo');
    }
  }
}

function performDelete() {
  const selected = getSelectedText();
  if (selected && selected.length > 0) {
    if (inputEditor && inputModel) {
      const selection = inputEditor.getSelection();
      if (selection && !selection.isEmpty()) {
        const range = new monaco.Range(
          selection.startLineNumber,
          selection.startColumn,
          selection.endLineNumber,
          selection.endColumn
        );
        const edit = {
          range: range,
          text: ''
        };
        inputEditor.executeEdits('delete', [edit]);
      }
    } else {
      // Fallback for textarea
      const textarea = document.getElementById('input-text-fallback') as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const newText = text.substring(0, start) + text.substring(end);
        textarea.value = newText;
        textarea.setSelectionRange(start, start);
        textarea.focus();
        textarea.dispatchEvent(new Event('input'));
      }
    }
  }
}

// Context menu for right-click

let outputContextMenu: HTMLElement | null = null;

function createContextMenu() {
  if (contextMenu) return contextMenu;
  
  contextMenu = document.createElement('div');
  contextMenu.id = 'context-menu';
  contextMenu.className = 'context-menu hidden';
  contextMenu.innerHTML = `
    <button id="context-add-item" class="context-menu-item">Add to Selected Items</button>
    <div class="context-menu-separator"></div>
    <button id="context-cut" class="context-menu-item">Cut</button>
    <button id="context-copy" class="context-menu-item">Copy</button>
    <button id="context-paste" class="context-menu-item">Paste</button>
    <button id="context-delete" class="context-menu-item">Delete</button>
    <div class="context-menu-separator"></div>
    <button id="context-clear" class="context-menu-item">Clear</button>
    <div class="context-menu-separator"></div>
    <button id="context-close" class="context-menu-item">Close</button>
  `;
  document.body.appendChild(contextMenu);
  
  // Create output context menu
  outputContextMenu = document.createElement('div');
  outputContextMenu.id = 'output-context-menu';
  outputContextMenu.className = 'context-menu hidden';
  outputContextMenu.innerHTML = `
    <button id="output-context-copy" class="context-menu-item">Copy</button>
    <div class="context-menu-separator"></div>
    <button id="output-context-clear" class="context-menu-item">Clear</button>
    <div class="context-menu-separator"></div>
    <button id="output-context-close" class="context-menu-item">Close</button>
  `;
  document.body.appendChild(outputContextMenu);
  
  // Handle output context menu actions
  const outputCopyBtn = document.getElementById('output-context-copy');
  if (outputCopyBtn) {
    outputCopyBtn.addEventListener('click', async () => {
      const text = outputText.value;
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
          hideOutputContextMenu();
        } catch (e) {
          console.error('Error copying:', e);
        }
      }
    });
  }
  
  const outputClearBtn = document.getElementById('output-context-clear');
  if (outputClearBtn) {
    outputClearBtn.addEventListener('click', () => {
      outputText.value = '';
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.output = '';
        }
      }
      hideOutputContextMenu();
    });
  }
  
  const outputCloseBtn = document.getElementById('output-context-close');
  if (outputCloseBtn) {
    outputCloseBtn.addEventListener('click', () => {
      hideOutputContextMenu();
    });
  }
  
  // Handle Add to Selected Items
  const addBtn = document.getElementById('context-add-item');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const selected = getSelectedText();
      if (selected && selected.length > 0) {
        if (currentMode === 'code') {
          // In code mode, normalize string literals to prevent duplicates
          // Check if it's a string literal (with quotes)
          const isStringLiteral = (selected.startsWith('"') && selected.endsWith('"')) ||
                                 (selected.startsWith("'") && selected.endsWith("'")) ||
                                 (selected.startsWith('`') && selected.endsWith('`'));
          
          if (isStringLiteral) {
            // Extract the value without quotes
            const unquotedValue = selected.slice(1, -1);
            // Check if unquoted version already exists
            const hasUnquoted = Array.from(selectedItems).some(item => {
              // Check if item is the unquoted value or matches it as a string literal
              return item === unquotedValue || 
                     (item.startsWith('"') && item.endsWith('"') && item.slice(1, -1) === unquotedValue) ||
                     (item.startsWith("'") && item.endsWith("'") && item.slice(1, -1) === unquotedValue) ||
                     (item.startsWith('`') && item.endsWith('`') && item.slice(1, -1) === unquotedValue);
            });
            
            if (hasUnquoted) {
              // Remove the unquoted version and add the quoted one (prefer quoted)
              selectedItems.delete(unquotedValue);
              selectedItems.add(selected);
              if (activeTabId) {
                const tab = tabs.find(t => t.id === activeTabId);
                if (tab) {
                  tab.selectedItems.delete(unquotedValue);
                  tab.selectedItems.add(selected);
                }
              }
            } else if (!selectedItems.has(selected)) {
              selectedItems.add(selected);
              if (activeTabId) {
                const tab = tabs.find(t => t.id === activeTabId);
                if (tab) tab.selectedItems.add(selected);
              }
            }
          } else {
            // Not a string literal - check if a quoted version exists
            const hasQuoted = Array.from(selectedItems).some(item => {
              const isQuoted = (item.startsWith('"') && item.endsWith('"')) ||
                              (item.startsWith("'") && item.endsWith("'")) ||
                              (item.startsWith('`') && item.endsWith('`'));
              if (isQuoted) {
                return item.slice(1, -1) === selected;
              }
              return false;
            });
            
            if (hasQuoted) {
              // Quoted version already exists, don't add unquoted
              // (keep the quoted one as it's more specific)
            } else if (!selectedItems.has(selected)) {
              selectedItems.add(selected);
              if (activeTabId) {
                const tab = tabs.find(t => t.id === activeTabId);
                if (tab) tab.selectedItems.add(selected);
              }
            }
          }
          updateSelectedCount();
        } else if (currentMode === 'text') {
          // In text mode, extract clean word
          const words = selected.split(/\s+/).filter(w => w.length > 0);
          if (words.length === 1) {
            const word = words[0].replace(/[^\w]/g, '');
            if (word.length > 0 && !selectedItems.has(word)) {
              selectedItems.add(word);
              if (activeTabId) {
                const tab = tabs.find(t => t.id === activeTabId);
                if (tab) tab.selectedItems.add(word);
              }
              updateSelectedCount();
            }
          }
        }
      }
      hideContextMenu();
    });
  }
  
  // Handle Cut
  const cutBtn = document.getElementById('context-cut');
  if (cutBtn) {
    cutBtn.addEventListener('click', async () => {
      await performCut();
      hideContextMenu();
    });
  }
  
  // Handle Copy
  const contextCopyBtn = document.getElementById('context-copy');
  if (contextCopyBtn) {
    contextCopyBtn.addEventListener('click', async () => {
      await performCopy();
      hideContextMenu();
    });
  }
  
  // Handle Paste
  const pasteBtn = document.getElementById('context-paste');
  if (pasteBtn) {
    pasteBtn.addEventListener('click', async () => {
      await performPaste();
      hideContextMenu();
    });
  }
  
  // Handle Delete
  const deleteBtn = document.getElementById('context-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      performDelete();
      hideContextMenu();
    });
  }
  
  // Handle Clear
  const clearBtn = document.getElementById('context-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      inputText.value = '';
      // Save to current tab
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          tab.input = '';
        }
      }
      // Update symbols if in code mode
      if (currentMode === 'code') {
        updateSymbols();
      }
      hideContextMenu();
    });
  }
  
  // Handle Close
  const closeBtn = document.getElementById('context-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideContextMenu();
    });
  }
  
  return contextMenu;
}

function showContextMenu(x: number, y: number) {
  if (!contextMenu) {
    createContextMenu();
  }
  if (!contextMenu) {
    console.error('Failed to create context menu');
    return;
  }
  
  console.log('Showing context menu at:', x, y);
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.zIndex = '10000'; // Ensure it's on top
  contextMenu.classList.remove('hidden');
  contextMenuVisible = true;
  
  // Update button states based on selection
  const selected = getSelectedText();
  console.log('Selected text:', selected);
  const hasSelection = selected && selected.length > 0;
  
  const addBtn = document.getElementById('context-add-item') as HTMLButtonElement;
  if (addBtn) {
    if (hasSelection) {
      addBtn.disabled = false;
      addBtn.textContent = selectedItems.has(selected) 
        ? 'Already in Selected Items' 
        : 'Add to Selected Items';
    } else {
      addBtn.disabled = true;
      addBtn.textContent = 'Add to Selected Items';
    }
  }
  
  // Enable/disable Cut, Copy, Delete based on selection
  const contextCutBtn = document.getElementById('context-cut') as HTMLButtonElement;
  const contextCopyBtn = document.getElementById('context-copy') as HTMLButtonElement;
  const contextDeleteBtn = document.getElementById('context-delete') as HTMLButtonElement;
  
  if (contextCutBtn) contextCutBtn.disabled = !hasSelection;
  if (contextCopyBtn) contextCopyBtn.disabled = !hasSelection;
  if (contextDeleteBtn) contextDeleteBtn.disabled = !hasSelection;
  
  // Show/hide Clear button based on whether input has text
  const contextClearBtn = document.getElementById('context-clear') as HTMLButtonElement;
  if (contextClearBtn) {
    const hasInput = inputText.value.trim().length > 0;
    contextClearBtn.style.display = hasInput ? 'block' : 'none';
  }
  
  console.log('Context menu visible:', !contextMenu.classList.contains('hidden'));
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.classList.add('hidden');
    contextMenuVisible = false;
  }
}

function showOutputContextMenu(x: number, y: number) {
  if (!outputContextMenu) {
    createContextMenu();
  }
  if (!outputContextMenu) {
    console.error('Failed to create output context menu');
    return;
  }
  
  // Check if output has text
  const hasOutput = outputText.value.trim().length > 0;
  const clearBtn = document.getElementById('output-context-clear') as HTMLButtonElement;
  if (clearBtn) {
    clearBtn.style.display = hasOutput ? 'block' : 'none';
  }
  
  // Update Copy button state
  const outputCopyBtn = document.getElementById('output-context-copy') as HTMLButtonElement;
  if (outputCopyBtn) {
    outputCopyBtn.disabled = !hasOutput;
  }
  
  outputContextMenu.style.left = `${x}px`;
  outputContextMenu.style.top = `${y}px`;
  outputContextMenu.style.zIndex = '10000';
  outputContextMenu.classList.remove('hidden');
}

function hideOutputContextMenu() {
  if (outputContextMenu) {
    outputContextMenu.classList.add('hidden');
  }
}

// Handle right-click on input editor (set up after initialization)
function setupContextMenu() {
  if (inputEditor) {
    // Create the context menu if it doesn't exist
    createContextMenu();
    
    // Monaco Editor: use onContextMenu event which fires after preventing default
    const container = inputEditor.getContainerDomNode();
    
    // Add event listener to the container with capture phase to catch it before Monaco
    // Ensure we're working with a proper DOM event
    container.addEventListener('contextmenu', (e: Event) => {
      if (!(e instanceof MouseEvent)) return;
      e.preventDefault();
      e.stopPropagation();
      console.log('Context menu triggered at:', e.pageX, e.pageY);
      showContextMenu(e.pageX, e.pageY);
    }, true); // Use capture phase
    
    // Also listen on the editor's DOM element
    const editorDom = inputEditor.getDomNode();
    if (editorDom) {
      editorDom.addEventListener('contextmenu', (e: Event) => {
        if (!(e instanceof MouseEvent)) return;
        e.preventDefault();
        e.stopPropagation();
        console.log('Context menu triggered on editor DOM at:', e.pageX, e.pageY);
        showContextMenu(e.pageX, e.pageY);
      }, true);
    }
  }
  
  // Set up output context menu
  if (outputEditor) {
    const outputContainer = outputEditor.getContainerDomNode();
    
    outputContainer.addEventListener('contextmenu', (e: Event) => {
      if (!(e instanceof MouseEvent)) return;
      e.preventDefault();
      e.stopPropagation();
      showOutputContextMenu(e.pageX, e.pageY);
    }, true);
    
    const outputEditorDom = outputEditor.getDomNode();
    if (outputEditorDom) {
      outputEditorDom.addEventListener('contextmenu', (e: Event) => {
        if (!(e instanceof MouseEvent)) return;
        e.preventDefault();
        e.stopPropagation();
        showOutputContextMenu(e.pageX, e.pageY);
      }, true);
    }
  }
}

// Handle right-click on textarea fallback
function setupContextMenuForTextarea(textarea: HTMLTextAreaElement) {
  textarea.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    showContextMenu(e.pageX, e.pageY);
  });
  
  // Also set up output textarea context menu
  const outputTextarea = document.getElementById('output-text-fallback') as HTMLTextAreaElement;
  if (outputTextarea) {
    outputTextarea.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      showOutputContextMenu(e.pageX, e.pageY);
    });
  }
}

// Update editor language when language selector changes
function updateEditorLanguage() {
  if (!inputEditor || !outputEditor || !inputModel || !outputModel) return;
  
  // In text mode, always use plaintext; in code mode, use the selected language
  const monacoLang = currentMode === 'text' ? 'plaintext' : getMonacoLanguage(getLanguage());
  
  // Update models with new language
  monaco.editor.setModelLanguage(inputModel, monacoLang);
  monaco.editor.setModelLanguage(outputModel, monacoLang);
}

// Modern Dialog Functions
function showAlertDialog(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalFooter = document.getElementById('modal-footer');
    const modalClose = document.getElementById('modal-close');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');

    if (!overlay || !modalTitle || !modalMessage || !modalFooter) return;

    modalTitle.textContent = title;
    // Support HTML content in message
    if (message.includes('<')) {
      modalMessage.innerHTML = message;
    } else {
      modalMessage.textContent = message;
    }
    
    // Hide cancel button for alert
    if (modalCancel) modalCancel.style.display = 'none';
    if (modalConfirm) {
      modalConfirm.textContent = 'OK';
      // Remove old handlers and add new one
      const newConfirm = modalConfirm.cloneNode(true) as HTMLButtonElement;
      modalConfirm.parentNode?.replaceChild(newConfirm, modalConfirm);
      newConfirm.addEventListener('click', () => {
        overlay.classList.add('hidden');
        resolve();
      });
    }

    if (modalClose) {
      // Remove old handlers and add new one
      const newClose = modalClose.cloneNode(true) as HTMLButtonElement;
      modalClose.parentNode?.replaceChild(newClose, modalClose);
      newClose.addEventListener('click', () => {
        overlay.classList.add('hidden');
        resolve();
      });
    }

    // Close on overlay click (not on modal content)
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
        resolve();
      }
    };
    
    // Prevent modal from closing when clicking inside
    const modal = overlay.querySelector('.modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Close on ESC key
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        overlay.classList.add('hidden');
        document.removeEventListener('keydown', escHandler);
        resolve();
      }
    };
    document.addEventListener('keydown', escHandler);

    overlay.classList.remove('hidden');
  });
}

async function showAboutDialog() {
  try {
    const appInfo = await window.electronAPI.helpAbout();
    const appName = appInfo.name || 'CodeMaskLab';
    const version = appInfo.version || '1.0.0';
    const description = appInfo.description || 'A desktop application for masking sensitive identifiers and text before sending content to LLMs, with reversible token generation.';
    
    const aboutMessage = `
      <div style="text-align: center; padding: 10px 0;">
        <h2 style="margin: 0 0 10px 0; color: #ffffff; font-size: 20px;">${appName}</h2>
        <p style="margin: 5px 0; color: #d4d4d4;">Version ${version}</p>
        <p style="margin: 15px 0 5px 0; color: #d4d4d4; font-size: 13px;">
          ${description}
        </p>
        <p style="margin: 10px 0 0 0; color: #888; font-size: 12px;">
          © ${new Date().getFullYear()} CodeMaskLab
        </p>
      </div>
    `;
    
    await showAlertDialog('About', aboutMessage);
  } catch (e) {
    console.error('Error showing About dialog:', e);
    await showAlertDialog('About', 'CodeMaskLab\nVersion 1.0.0');
  }
}

function showPromptDialog(
  title: string,
  message: string,
  defaultValue: string = ''
): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalFooter = document.getElementById('modal-footer');
    const modalClose = document.getElementById('modal-close');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');

    if (!overlay || !modalTitle || !modalMessage || !modalFooter) return;

    modalTitle.textContent = title;
    modalMessage.innerHTML = `<label style="display: block; margin-bottom: 8px;">${message}</label><input type="text" id="prompt-input" value="${defaultValue.replace(/"/g, '&quot;')}" style="width: 100%; padding: 8px; background: #3e3e42; border: 1px solid #555; color: #d4d4d4; border-radius: 3px; font-size: 13px; font-family: inherit;" autofocus>`;
    
    // Show both buttons for prompt
    if (modalCancel) modalCancel.style.display = 'block';
    if (modalConfirm) modalConfirm.textContent = 'OK';
    if (modalCancel) modalCancel.textContent = 'Cancel';

    let escHandler: ((e: KeyboardEvent) => void) | null = null;
    
    const closeModal = (result: string | null) => {
      overlay.classList.add('hidden');
      overlay.onclick = null;
      if (escHandler) {
        document.removeEventListener('keydown', escHandler);
      }
      resolve(result);
    };

    if (modalConfirm) {
      // Remove old handlers and add new one
      const newConfirm = modalConfirm.cloneNode(true) as HTMLButtonElement;
      modalConfirm.parentNode?.replaceChild(newConfirm, modalConfirm);
      newConfirm.addEventListener('click', () => {
        const input = document.getElementById('prompt-input') as HTMLInputElement;
        closeModal(input ? input.value : null);
      });
    }

    if (modalCancel) {
      // Remove old handlers and add new one
      const newCancel = modalCancel.cloneNode(true) as HTMLButtonElement;
      modalCancel.parentNode?.replaceChild(newCancel, modalCancel);
      newCancel.addEventListener('click', () => closeModal(null));
    }

    if (modalClose) {
      // Remove old handlers and add new one
      const newClose = modalClose.cloneNode(true) as HTMLButtonElement;
      modalClose.parentNode?.replaceChild(newClose, modalClose);
      newClose.addEventListener('click', () => closeModal(null));
    }

    // Close on overlay click (not on modal content)
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closeModal(null);
      }
    };
    
    // Prevent modal from closing when clicking inside
    const modal = overlay.querySelector('.modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Close on ESC key
    escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal(null);
      } else if (e.key === 'Enter') {
        const input = document.getElementById('prompt-input') as HTMLInputElement;
        if (input) {
          closeModal(input.value);
        }
      }
    };
    document.addEventListener('keydown', escHandler);

    overlay.classList.remove('hidden');
    
    // Focus the input after a short delay to ensure it's rendered
    setTimeout(() => {
      const input = document.getElementById('prompt-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  });
}

function showConfirmDialog(
  title: string, 
  message: string, 
  confirmText: string = 'Confirm', 
  cancelText: string = 'Cancel'
): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalFooter = document.getElementById('modal-footer');
    const modalClose = document.getElementById('modal-close');
    const modalConfirm = document.getElementById('modal-confirm');
    const modalCancel = document.getElementById('modal-cancel');

    if (!overlay || !modalTitle || !modalMessage || !modalFooter) return;

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    // Show both buttons for confirm
    if (modalCancel) modalCancel.style.display = 'block';
    if (modalConfirm) modalConfirm.textContent = confirmText;
    if (modalCancel) modalCancel.textContent = cancelText;

    let escHandler: ((e: KeyboardEvent) => void) | null = null;
    
    const closeModal = (result: boolean) => {
      overlay.classList.add('hidden');
      overlay.onclick = null;
      if (escHandler) {
        document.removeEventListener('keydown', escHandler);
      }
      resolve(result);
    };

    if (modalConfirm) {
      // Remove old handlers and add new one
      const newConfirm = modalConfirm.cloneNode(true) as HTMLButtonElement;
      modalConfirm.parentNode?.replaceChild(newConfirm, modalConfirm);
      newConfirm.addEventListener('click', () => closeModal(true));
    }

    if (modalCancel) {
      // Remove old handlers and add new one
      const newCancel = modalCancel.cloneNode(true) as HTMLButtonElement;
      modalCancel.parentNode?.replaceChild(newCancel, modalCancel);
      newCancel.addEventListener('click', () => closeModal(false));
    }

    if (modalClose) {
      // Remove old handlers and add new one
      const newClose = modalClose.cloneNode(true) as HTMLButtonElement;
      modalClose.parentNode?.replaceChild(newClose, modalClose);
      newClose.addEventListener('click', () => closeModal(false));
    }

    // Close on overlay click (not on modal content)
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closeModal(false);
      }
    };
    
    // Prevent modal from closing when clicking inside
    const modal = overlay.querySelector('.modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Close on ESC key
    escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal(false);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Ensure confirmation dialog appears on top of namespace selector
    overlay.style.zIndex = '100001';
    
    overlay.classList.remove('hidden');
  });
}

// File operations
async function saveFile(saveAs: boolean = false) {
  // Save namespace, mode, input, and output with markers
  const namespace = getNamespace();
  const mode = currentMode;
  const content = `===NAMESPACE===\n${namespace}\n===MODE===\n${mode}\n===INPUT===\n${inputText.value}\n\n===OUTPUT===\n${outputText.value}`;
  
  // Show "Saving..." status with spinner
  showStatusMessage('Saving...', true);
  
  try {
    const result = saveAs 
      ? await window.electronAPI.fileSaveAs(content)
      : await window.electronAPI.fileSave(content);
    
    if (result.success) {
      // Show "Saved!" message briefly (2 seconds)
      showStatusMessage('Saved!', false);
      setTimeout(() => {
        hideStatusMessage();
      }, 2000);
    } else {
      // Hide status message if save failed or was cancelled
      hideStatusMessage();
      
      // Only show error dialog if not cancelled
      if (result.error && result.error !== 'Cancelled') {
        await showAlertDialog('Error', `Error saving file: ${result.error}`);
      }
      // Silently return if cancelled
    }
  } catch (e) {
    // Hide status message on error
    hideStatusMessage();
    console.error('Error saving file:', e);
    await showAlertDialog('Error', 'Error: ' + (e as Error).message);
  }
}

// Mode switching
function setMode(mode: Mode) {
  currentMode = mode;
  
  if (mode === 'code') {
    modeCodeBtn.classList.add('active');
    modeTextBtn.classList.remove('active');
    codeActions.style.display = 'flex';
    textActions.style.display = 'none';
    languageSelector.style.display = 'block';
    symbolsPanel.style.display = 'block';
    // Update editor language to selected code language
    updateEditorLanguage();
    updateSymbols();
  } else {
    modeCodeBtn.classList.remove('active');
    modeTextBtn.classList.add('active');
    codeActions.style.display = 'none';
    textActions.style.display = 'flex';
    languageSelector.style.display = 'none';
    symbolsPanel.style.display = 'none';
    symbols = [];
    renderSymbols();
    // Update editor language to plaintext for text mode
    if (inputModel && outputModel) {
      monaco.editor.setModelLanguage(inputModel, 'plaintext');
      monaco.editor.setModelLanguage(outputModel, 'plaintext');
    }
  }
  
  renderSelectedChips();
}

// Update symbols list
async function updateSymbols() {
  if (currentMode !== 'code') return;
  
  const code = inputText.value;
  if (!code) {
    symbols = [];
    renderSymbols();
    return;
  }
  
  try {
    const includeProps = includeProperties.checked;
    const lang = getLanguage();
    const symbolList = await window.electronAPI.codeSymbols(code, lang, includeProps);
    symbols = symbolList;
    renderSymbols();
  } catch (e) {
    console.error('Error fetching symbols:', e);
    symbols = [];
    renderSymbols();
  }
}

// Render symbols list
function renderSymbols() {
  symbolsList.innerHTML = '';
  
  if (symbols.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-message';
    
    const code = inputText.value.trim();
    if (!code) {
      emptyMsg.textContent = 'Enter code in the input area above to see detected identifiers';
    } else {
      emptyMsg.innerHTML = `
        <div style="text-align: center; line-height: 1.6;">
          <strong>No identifiers detected</strong><br>
          <span style="font-size: 11px; color: #888;">
            Make sure you've selected the correct language from the dropdown above.
          </span>
        </div>
      `;
    }
    
    symbolsList.appendChild(emptyMsg);
    return;
  }
  
  symbols.forEach(symbol => {
    const item = document.createElement('div');
    item.className = 'symbol-item';
    item.textContent = symbol;
    item.addEventListener('click', () => {
      if (selectedItems.has(symbol)) {
        selectedItems.delete(symbol);
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId);
          if (tab) tab.selectedItems.delete(symbol);
        }
      } else {
        selectedItems.add(symbol);
        if (activeTabId) {
          const tab = tabs.find(t => t.id === activeTabId);
          if (tab) tab.selectedItems.add(symbol);
        }
      }
      updateSelectedCount();
    });
    symbolsList.appendChild(item);
  });
}

// Render selected items as chips
function renderSelectedChips() {
  selectedChips.innerHTML = '';
  
  if (selectedItems.size === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'empty-message';
    if (currentMode === 'text') {
      emptyMsg.textContent = 'Select text in the input area and add it here using the right-click menu, or use the detection buttons. Selected items will be masked when you click "Mask Selected".';
    } else {
      emptyMsg.textContent = 'Click identifiers on the left or use the arrow to add them here. Selected items will be masked when you click "Mask Selected".';
    }
    selectedChips.appendChild(emptyMsg);
    return;
  }
  
  // Check if items exist in code/text (for warning icons)
  const code = inputText.value;
  const symbolsSet = new Set(symbols);
  
  selectedItems.forEach(item => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    
    // Check if item will be maskable
    let willMask = false;
    
    if (currentMode === 'text') {
      // In text mode, use flexible text search
      // Text masking uses whole-word matching, but we'll check if the item exists in the text
      const normalizedItem = item.trim();
      const normalizedCode = code;
      
      // Try exact match first (case-sensitive)
      if (normalizedCode.includes(normalizedItem)) {
        willMask = true;
      } else {
        // Try case-insensitive match
        const lowerItem = normalizedItem.toLowerCase();
        const lowerCode = normalizedCode.toLowerCase();
        if (lowerCode.includes(lowerItem)) {
          willMask = true;
        } else {
          // For phone numbers, try matching without the + prefix
          // e.g., "1 (555) 234-7890" should match "+1 (555) 234-7890"
          if (/^\+?\d/.test(normalizedItem)) {
            // Remove leading + and try again
            const withoutPlus = normalizedItem.replace(/^\+/, '');
            if (normalizedCode.includes(withoutPlus) || lowerCode.includes(withoutPlus.toLowerCase())) {
              willMask = true;
            }
          }
          
          // For URLs, emails, UUIDs - check if the core part exists
          // e.g., if item is "example.com" and code has "https://example.com", it should match
          if (!willMask) {
            // Extract core parts (remove protocol, query params, etc.)
            const urlMatch = normalizedItem.match(/^(?:https?:\/\/)?([^\/\?#]+)/);
            if (urlMatch && urlMatch[1]) {
              const coreDomain = urlMatch[1];
              if (normalizedCode.includes(coreDomain) || lowerCode.includes(coreDomain.toLowerCase())) {
                willMask = true;
              }
            }
          }
        }
      }
    } else {
      // Code mode: use existing logic
      const isStringLiteral = (item.startsWith('"') && item.endsWith('"')) ||
                             (item.startsWith("'") && item.endsWith("'")) ||
                             (item.startsWith('`') && item.endsWith('`'));
      const isNumeric = /^-?\d+(\.\d+)?$/.test(item);
      
      if (isStringLiteral) {
        const unquoted = item.slice(1, -1);
        const quoteChar = item[0];
        // Check if the exact string literal exists in code (with quotes)
        // Also check for the unquoted value within any quote type
        const exactMatch = code.includes(item);
        const unquotedInQuotes = code.includes(`"${unquoted}"`) || 
                                 code.includes(`'${unquoted}'`) || 
                                 code.includes(`\`${unquoted}\``);
        // Also check if unquoted value exists (might be part of a larger string)
        const unquotedExists = code.includes(unquoted);
        willMask = exactMatch || unquotedInQuotes || unquotedExists;
      } else if (isNumeric) {
        // Check for numeric value with word boundaries
        const regex = new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        willMask = regex.test(code);
      } else {
        // Check if it's in symbols list or exists in code
        willMask = symbolsSet.has(item) || itemExistsInCode(item, code, symbols);
        
        // Also check if it exists as a string literal value (even if not selected with quotes)
        if (!willMask) {
          const asStringLiteral = code.includes(`"${item}"`) || 
                                 code.includes(`'${item}'`) || 
                                 code.includes(`\`${item}\``);
          if (asStringLiteral) {
            willMask = true;
          }
        }
        
        // Warn if item is too short (likely a substring) and not a complete identifier
        if (willMask && item.length <= 3 && !symbolsSet.has(item)) {
          // Very short items (1-3 chars) that aren't in symbols list are likely substrings
          const isValidIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(item);
          if (isValidIdentifier) {
            // Check if this short item is part of a longer identifier or string in the code
            // Look for patterns like "sk-..." or identifiers starting with "sk"
            const isSubstringOfIdentifier = Array.from(symbolsSet).some(symbol => 
              symbol.length > item.length && 
              (symbol.startsWith(item) || symbol.includes(item + '-') || symbol.includes(item + '_'))
            );
            // Also check if it's part of a string literal
            const isSubstringOfString = code.match(new RegExp(`["'\`][^"'\`]*${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"'\`]*["'\`]`));
            if (isSubstringOfIdentifier || isSubstringOfString) {
              willMask = false; // Show warning for substring selections
            }
          }
        }
      }
    }
    
    if (!willMask) {
      const warning = document.createElement('span');
      warning.className = 'chip-warning';
      warning.textContent = ' ⚠️';
      warning.title = 'This item may not be masked (not found in ' + (currentMode === 'text' ? 'text' : 'code') + ')';
      chip.appendChild(warning);
    }
    
    const text = document.createElement('span');
    text.textContent = item;
    chip.appendChild(text);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'chip-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedItems.delete(item);
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) tab.selectedItems.delete(item);
      }
      updateSelectedCount();
    });
    chip.appendChild(removeBtn);
    
    selectedChips.appendChild(chip);
  });
}

// Check if item exists in code (helper for warning icons)
function itemExistsInCode(item: string, code: string, symbols: string[]): boolean {
  // First check if it's in the symbols list
  if (symbols.includes(item)) {
    return true;
  }
  
  // For identifiers, try regex search with word boundaries
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(item)) {
    const regex = new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return regex.test(code);
  }
  
  return false;
}

// Update selected count
function updateSelectedCount() {
  selectedCount.textContent = selectedItems.size.toString();
  renderSelectedChips();
  
  // Disable "Mask Selected" button if no items selected
  maskSelectedBtn.disabled = selectedItems.size === 0;
  textMaskBtn.disabled = selectedItems.size === 0;
}

// Update maximize button icon based on window state
function updateMaximizeButtonIcon(isMaximized: boolean) {
  const titlebarMaximize = document.getElementById('titlebar-maximize');
  if (!titlebarMaximize) return;
  
  const svg = titlebarMaximize.querySelector('svg');
  if (!svg) return;
  
  if (isMaximized) {
    // Restore icon (two overlapping squares)
    svg.innerHTML = `
      <path d="M 3,1 L 11,1 L 11,9 M 1,3 L 9,3 L 9,11 L 1,11 Z" fill="none" stroke="currentColor" stroke-width="1"/>
    `;
    titlebarMaximize.setAttribute('title', 'Restore');
  } else {
    // Maximize icon (single square)
    svg.innerHTML = `
      <path d="M 1,1 L 11,1 L 11,11 L 1,11 Z" fill="none" stroke="currentColor" stroke-width="1"/>
    `;
    titlebarMaximize.setAttribute('title', 'Maximize');
  }
}

// Initialize UI when DOM is ready
function initializeUI() {
  bindDom();
  initStatusMessage();
  bindEvents();
  
  // Load namespaces list
  loadNamespaces();
  
  // Create context menu early so it's ready
  createContextMenu();
  
  // Wait for Monaco to be loaded (it's loaded via AMD loader in HTML)
  // Check if monaco is available, otherwise wait
  let retryCount = 0;
  const maxRetries = 50; // 5 seconds max wait time
  
  function tryInitializeMonaco() {
    if (typeof monaco !== 'undefined' && monaco.editor) {
      // Monaco is available, initialize editors
      initializeEditors();
    } else if (retryCount < maxRetries) {
      // Retry after a short delay
      retryCount++;
      setTimeout(tryInitializeMonaco, 100);
    } else {
      // Monaco didn't load after max retries, fall back to textareas
      console.warn('Monaco Editor did not load after timeout, falling back to textareas');
      createTextareaFallback();
    }
  }
  
  tryInitializeMonaco();
  
  // Note: setMode('code') is now called inside initializeEditors() after Monaco is ready
  
  // Initialize button states (disable Mask Selected if no items)
  // This will be called after setMode, but we set it here as a fallback
  setTimeout(() => {
    updateSelectedCount();
  }, 300);
  
  // Initialize search navigation buttons
  initializeSearchNavigation();
  
  // Update menu shortcuts based on platform
  updateMenuShortcuts();
}

// Update menu shortcuts to match platform (Cmd on macOS, Ctrl on Windows/Linux)
function updateMenuShortcuts() {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const modifier = isMac ? 'Cmd' : 'Ctrl';
  
  // Update Developer Tools shortcut
  const devToolsShortcut = document.getElementById('dev-tools-shortcut');
  if (devToolsShortcut) {
    devToolsShortcut.textContent = isMac ? 'Alt + Cmd + I' : 'Ctrl + Shift + I';
  }
  
  // Update Next/Previous Tab shortcuts
  const nextTabShortcut = document.getElementById('next-tab-shortcut');
  if (nextTabShortcut) {
    nextTabShortcut.textContent = isMac ? 'Cmd + Alt + Right' : 'Ctrl + Tab';
  }
  const prevTabShortcut = document.getElementById('prev-tab-shortcut');
  if (prevTabShortcut) {
    prevTabShortcut.textContent = isMac ? 'Cmd + Alt + Left' : 'Ctrl + Shift + Tab';
  }

  // Update Redo shortcut (Ctrl+Shift+Z on macOS, Ctrl+Y on Windows/Linux)
  const redoShortcut = document.getElementById('redo-shortcut');
  if (redoShortcut) {
    redoShortcut.textContent = isMac ? 'Ctrl + Shift + Z' : 'Ctrl + Y';
  }
  // Update Clear Input/Output shortcuts
  const clearInputShortcut = document.getElementById('clear-input-shortcut');
  if (clearInputShortcut) {
    clearInputShortcut.textContent = `${modifier} + Shift + U`;
  }
  const clearOutputShortcut = document.getElementById('clear-output-shortcut');
  if (clearOutputShortcut) {
    clearOutputShortcut.textContent = `${modifier} + Shift + O`;
  }
  
  // Update all Ctrl shortcuts to show platform-appropriate modifier
  // Also ensure all "+" signs have spaces around them
  const shortcuts = document.querySelectorAll('.menu-item-shortcut');
  shortcuts.forEach(shortcut => {
    let text = shortcut.textContent || '';
    // Replace Ctrl with platform-appropriate modifier
    if (text.startsWith('Ctrl')) {
      text = text.replace(/^Ctrl/, modifier);
    }
    // Ensure all "+" signs have spaces around them
    text = text.replace(/\s*\+\s*/g, ' + ');
    // Clean up any double spaces
    text = text.replace(/\s{2,}/g, ' ').trim();
    shortcut.textContent = text;
  });
}

// Search functionality
function performSearch(searchTerm: string) {
  currentSearchTerm = searchTerm;
  
  if (!searchTerm) {
    clearSearch();
    return;
  }
  
  // Search in input editor
  if (inputEditor && inputModel) {
    searchInEditor(inputEditor, inputModel, searchTerm, true);
  }
  
  // Search in output editor
  if (outputEditor && outputModel) {
    searchInEditor(outputEditor, outputModel, searchTerm, false);
  }
}

function searchInEditor(editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel, searchTerm: string, isInput: boolean, preservePosition: boolean = false) {
  const matches: monaco.Range[] = [];
  const text = model.getValue();
  
  // Escape special regex characters
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedTerm, 'gi');
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const startPos = model.getPositionAt(match.index);
    const endPos = model.getPositionAt(match.index + match[0].length);
    matches.push(new monaco.Range(
      startPos.lineNumber,
      startPos.column,
      endPos.lineNumber,
      endPos.column
    ));
  }
  
  // Preserve current match position if possible when content changes
  let newMatchIndex = 0;
  if (preservePosition && matches.length > 0) {
    const currentIndex = isInput ? inputCurrentMatchIndex : outputCurrentMatchIndex;
    const oldMatches = isInput ? inputSearchMatches : outputSearchMatches;
    
    // Try to find a match near the current position
    if (currentIndex >= 0 && currentIndex < oldMatches.length && oldMatches.length > 0) {
      const oldMatch = oldMatches[currentIndex];
      // Find the closest match to the old position
      let closestIndex = 0;
      let minDistance = Infinity;
      matches.forEach((newMatch, idx) => {
        const distance = Math.abs(newMatch.startLineNumber - oldMatch.startLineNumber) + 
                        Math.abs(newMatch.startColumn - oldMatch.startColumn);
        if (distance < minDistance) {
          minDistance = distance;
          closestIndex = idx;
        }
      });
      newMatchIndex = closestIndex;
    }
  }
  
  if (isInput) {
    inputSearchMatches = matches;
    inputCurrentMatchIndex = matches.length > 0 ? newMatchIndex : -1;
    highlightMatches(editor, matches, inputCurrentMatchIndex, true);
    updateSearchNavigation(true, matches.length);
  } else {
    outputSearchMatches = matches;
    outputCurrentMatchIndex = matches.length > 0 ? newMatchIndex : -1;
    highlightMatches(editor, matches, outputCurrentMatchIndex, false);
    updateSearchNavigation(false, matches.length);
  }
  
  // Navigate to current match (but don't focus the editor to avoid stealing focus from search input)
  // Only navigate if not preserving position (initial search) or if we found matches
  if (matches.length > 0 && !preservePosition) {
    navigateToMatch(editor, matches[newMatchIndex], false);
  } else if (matches.length > 0 && preservePosition) {
    // When preserving position, just update highlights without navigating
    // This prevents jumping when user is typing
  }
}

function highlightMatches(editor: monaco.editor.IStandaloneCodeEditor, matches: monaco.Range[], currentIndex: number, isInput: boolean) {
  const decorations: monaco.editor.IModelDeltaDecoration[] = [];
  
  matches.forEach((match, index) => {
    if (index === currentIndex) {
      // Current match - highlight in different color
      decorations.push({
        range: match,
        options: {
          className: 'search-match-current',
          inlineClassName: 'search-match-current',
          overviewRuler: {
            color: '#007acc',
            position: monaco.editor.OverviewRulerLane.Center
          }
        }
      });
    } else {
      // Other matches
      decorations.push({
        range: match,
        options: {
          className: 'search-match',
          inlineClassName: 'search-match',
          overviewRuler: {
            color: '#6e6e6e',
            position: monaco.editor.OverviewRulerLane.Center
          }
        }
      });
    }
  });
  
  const decorationIds = editor.deltaDecorations(
    isInput ? inputSearchDecorations : outputSearchDecorations,
    decorations
  );
  
  if (isInput) {
    inputSearchDecorations = decorationIds;
  } else {
    outputSearchDecorations = decorationIds;
  }
}

function navigateToMatch(editor: monaco.editor.IStandaloneCodeEditor, range: monaco.Range, shouldFocus: boolean = true) {
  editor.setPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
  editor.revealRangeInCenter(range);
  if (shouldFocus) {
    editor.focus();
  }
}

function navigateToNextMatch(isInput: boolean) {
  const matches = isInput ? inputSearchMatches : outputSearchMatches;
  const editor = isInput ? inputEditor : outputEditor;
  
  if (!editor || matches.length === 0) return;
  
  if (isInput) {
    inputCurrentMatchIndex = (inputCurrentMatchIndex + 1) % matches.length;
    highlightMatches(editor, matches, inputCurrentMatchIndex, true);
    navigateToMatch(editor, matches[inputCurrentMatchIndex], true);
  } else {
    outputCurrentMatchIndex = (outputCurrentMatchIndex + 1) % matches.length;
    highlightMatches(editor, matches, outputCurrentMatchIndex, false);
    navigateToMatch(editor, matches[outputCurrentMatchIndex], true);
  }
}

function navigateToPreviousMatch(isInput: boolean) {
  const matches = isInput ? inputSearchMatches : outputSearchMatches;
  const editor = isInput ? inputEditor : outputEditor;
  
  if (!editor || matches.length === 0) return;
  
  if (isInput) {
    inputCurrentMatchIndex = inputCurrentMatchIndex <= 0 ? matches.length - 1 : inputCurrentMatchIndex - 1;
    highlightMatches(editor, matches, inputCurrentMatchIndex, true);
    navigateToMatch(editor, matches[inputCurrentMatchIndex], true);
  } else {
    outputCurrentMatchIndex = outputCurrentMatchIndex <= 0 ? matches.length - 1 : outputCurrentMatchIndex - 1;
    highlightMatches(editor, matches, outputCurrentMatchIndex, false);
    navigateToMatch(editor, matches[outputCurrentMatchIndex], true);
  }
}

function updateSearchNavigation(isInput: boolean, matchCount: number) {
  const navElement = document.getElementById(isInput ? 'input-search-nav' : 'output-search-nav');
  if (navElement) {
    if (matchCount > 0) {
      navElement.style.display = 'flex';
    } else {
      navElement.style.display = 'none';
    }
  }
}

function clearSearch() {
  currentSearchTerm = '';
  inputSearchMatches = [];
  outputSearchMatches = [];
  inputCurrentMatchIndex = -1;
  outputCurrentMatchIndex = -1;
  
  if (inputEditor) {
    inputSearchDecorations = inputEditor.deltaDecorations(inputSearchDecorations, []);
  }
  if (outputEditor) {
    outputSearchDecorations = outputEditor.deltaDecorations(outputSearchDecorations, []);
  }
  
  const inputNav = document.getElementById('input-search-nav');
  const outputNav = document.getElementById('output-search-nav');
  if (inputNav) inputNav.style.display = 'none';
  if (outputNav) outputNav.style.display = 'none';
}

function initializeSearchNavigation() {
  const inputPrev = document.getElementById('input-search-prev');
  const inputNext = document.getElementById('input-search-next');
  const outputPrev = document.getElementById('output-search-prev');
  const outputNext = document.getElementById('output-search-next');
  
  if (inputPrev) {
    inputPrev.addEventListener('click', () => navigateToPreviousMatch(true));
  }
  if (inputNext) {
    inputNext.addEventListener('click', () => navigateToNextMatch(true));
  }
  if (outputPrev) {
    outputPrev.addEventListener('click', () => navigateToPreviousMatch(false));
  }
  if (outputNext) {
    outputNext.addEventListener('click', () => navigateToNextMatch(false));
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeUI);
} else {
  initializeUI();
}
