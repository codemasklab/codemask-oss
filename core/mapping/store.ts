import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import keytar from 'keytar';

const SERVICE_NAME = 'codemasklab';
const KEY_NAME = 'mapping-secret';
const STORE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '.',
  '.codemasklab'
);
const STORE_FILE = path.join(STORE_DIR, 'mapping-store.encrypted');
const SECRET_FILE = path.join(STORE_DIR, '.secret'); // Fallback secret storage

interface MappingEntry {
  kind: string;
  namespace: string;
  original: string;
  token: string;
}

interface MappingData {
  entries: MappingEntry[];
}

/**
 * Get or create encryption key from OS keychain, with fallback to file storage
 */
async function getOrCreateSecret(): Promise<string> {
  let secret: string | null = null;
  
  // Try keytar first (OS keychain)
  try {
    secret = await keytar.getPassword(SERVICE_NAME, KEY_NAME);
  } catch (e: any) {
    // Keytar failed (e.g., keyring service not available)
    console.warn('Keytar unavailable, using file-based secret storage:', e.message);
  }
  
  // If keytar worked and returned a secret, use it
  if (secret) {
    return secret;
  }
  
  // Fallback: use file-based secret storage
  ensureStoreDir();
  
  if (fs.existsSync(SECRET_FILE)) {
    try {
      // Read existing secret (should have restrictive permissions)
      secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
      if (secret && secret.length >= 32) {
        return secret;
      }
    } catch (e: any) {
      console.warn('Failed to read secret file, generating new one:', e.message);
    }
  }
  
  // Generate new 32-byte key
  secret = crypto.randomBytes(32).toString('hex');
  
  // Try to save to keytar first
  try {
    await keytar.setPassword(SERVICE_NAME, KEY_NAME, secret);
  } catch (e: any) {
    // Keytar failed, save to file as fallback
    try {
      // Write with restrictive permissions (owner read/write only)
      fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    } catch (e2: any) {
      // If even file write fails, just use the in-memory secret
      // (will be lost on restart, but app will still work)
      console.warn('Failed to persist secret, using in-memory only:', e2.message);
    }
  }
  
  return secret;
}

/**
 * Encrypt mapping data
 */
function encrypt(data: MappingData, secret: string): string {
  const json = JSON.stringify(data);
  const key = crypto.scryptSync(secret, 'salt', 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(json, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + authTag + encrypted data
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt mapping data
 */
function decrypt(encryptedData: string, secret: string): MappingData | null {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const key = crypto.scryptSync(secret, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

/**
 * Ensure store directory exists
 */
function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    // Set restrictive permissions on directory (owner read/write/execute only)
    try {
      fs.chmodSync(STORE_DIR, 0o700);
    } catch (e) {
      // Permissions change may fail on some systems, ignore
    }
  }
}

/**
 * Load mapping from disk
 */
export async function loadMapping(): Promise<Map<string, MappingEntry>> {
  ensureStoreDir();
  
  if (!fs.existsSync(STORE_FILE)) {
    return new Map();
  }
  
  const secret = await getOrCreateSecret();
  const encrypted = fs.readFileSync(STORE_FILE, 'utf8');
  const data = decrypt(encrypted, secret);
  
  if (!data) {
    return new Map();
  }
  
  const map = new Map<string, MappingEntry>();
  for (const entry of data.entries) {
    const key = `${entry.kind}:${entry.namespace}:${entry.original}`;
    map.set(key, entry);
  }
  
  return map;
}

/**
 * Save mapping to disk
 */
export async function saveMapping(map: Map<string, MappingEntry>): Promise<void> {
  ensureStoreDir();
  
  const secret = await getOrCreateSecret();
  const entries = Array.from(map.values());
  const data: MappingData = { entries };
  
  const encrypted = encrypt(data, secret);
  fs.writeFileSync(STORE_FILE, encrypted, 'utf8');
}

/**
 * Remember a mapping entry
 */
export async function remember(
  kind: string,
  namespace: string,
  original: string,
  factory: () => string
): Promise<string> {
  const map = await loadMapping();
  const key = `${kind}:${namespace}:${original}`;
  
  let entry = map.get(key);
  if (!entry) {
    entry = {
      kind,
      namespace,
      original,
      token: factory()
    };
    map.set(key, entry);
    await saveMapping(map);
  }
  
  return entry.token;
}

/**
 * Reverse lookup: token -> original
 */
export async function reverseLookup(token: string): Promise<string | null> {
  const map = await loadMapping();
  
  for (const entry of map.values()) {
    if (entry.token === token) {
      return entry.original;
    }
  }
  
  return null;
}

/**
 * Reverse lookup for namespace-specific token
 */
export async function reverseLookupWithNamespace(token: string, namespace: string): Promise<string | null> {
  const map = await loadMapping();
  
  for (const entry of map.values()) {
    if (entry.token === token && entry.namespace === namespace) {
      return entry.original;
    }
  }
  
  return null;
}

/**
 * Get all mappings for unmasking
 */
export async function getAllMappings(namespace?: string): Promise<Map<string, string>> {
  const map = await loadMapping();
  const result = new Map<string, string>();
  
  for (const entry of map.values()) {
    if (!namespace || entry.namespace === namespace) {
      result.set(entry.token, entry.original);
    }
  }
  
  return result;
}

/**
 * Get all unique namespaces from stored mappings
 */
export async function getAllNamespaces(): Promise<string[]> {
  const map = await loadMapping();
  const namespaces = new Set<string>();
  
  for (const entry of map.values()) {
    namespaces.add(entry.namespace);
  }
  
  return Array.from(namespaces).sort();
}

/**
 * Wipe mappings for a specific namespace
 */
export async function wipeNamespace(namespace: string): Promise<void> {
  ensureStoreDir();
  
  if (!fs.existsSync(STORE_FILE)) {
    return;
  }
  
  const secret = await getOrCreateSecret();
  const encrypted = fs.readFileSync(STORE_FILE, 'utf8');
  const data = decrypt(encrypted, secret);
  
  if (!data || !data.entries) {
    return;
  }
  
  // Filter out entries for the specified namespace
  const filteredEntries = data.entries.filter(entry => entry.namespace !== namespace);
  
  // If no entries remain, delete the file
  if (filteredEntries.length === 0) {
    fs.unlinkSync(STORE_FILE);
    return;
  }
  
  // Save the filtered entries
  const newData: MappingData = {
    entries: filteredEntries
  };
  
  const newEncrypted = encrypt(newData, secret);
  fs.writeFileSync(STORE_FILE, newEncrypted, 'utf8');
}

/**
 * Wipe all mappings and key from keychain
 */
export async function wipeAll(): Promise<void> {
  ensureStoreDir();
  
  if (fs.existsSync(STORE_FILE)) {
    fs.unlinkSync(STORE_FILE);
  }
  
  if (fs.existsSync(SECRET_FILE)) {
    try {
      fs.unlinkSync(SECRET_FILE);
    } catch (e) {
      // File might not exist or be locked, ignore
    }
  }
  
  try {
    await keytar.deletePassword(SERVICE_NAME, KEY_NAME);
  } catch (e) {
    // Key might not exist, ignore
  }
}

