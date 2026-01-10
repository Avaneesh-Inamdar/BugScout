const Groq = require('groq-sdk');

class ApiKeyManager {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.clients = new Map();
    this.lastRequestTime = new Map(); // Track last request time per key
    this.minRequestInterval = 1000; // Minimum 1 second between requests per key
    
    // Load all available API keys
    const keyNames = ['GROQ_API_KEY', 'GROQ_API_KEY_BACKUP', 'GROQ_API_KEY_BACKUP_2'];
    keyNames.forEach(name => {
      const key = process.env[name];
      if (key) {
        this.keys.push({ name, key });
        this.clients.set(key, new Groq({ apiKey: key }));
        this.lastRequestTime.set(key, 0);
      }
    });
    
    console.log(`API Key Manager initialized with ${this.keys.length} key(s)`);
  }
  
  hasKeys() {
    return this.keys.length > 0;
  }
  
  getCurrentClient() {
    if (!this.hasKeys()) return null;
    const keyInfo = this.keys[this.currentIndex];
    return this.clients.get(keyInfo.key);
  }
  
  getCurrentKey() {
    if (!this.hasKeys()) return null;
    return this.keys[this.currentIndex].key;
  }
  
  rotateKey() {
    if (this.keys.length <= 1) return false;
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.log(`Rotated to API key: ${this.keys[this.currentIndex].name}`);
    return true;
  }
  
  // Wait if needed to respect rate limits
  async waitForRateLimit() {
    const key = this.getCurrentKey();
    if (!key) return;
    
    const lastTime = this.lastRequestTime.get(key) || 0;
    const elapsed = Date.now() - lastTime;
    
    if (elapsed < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  updateLastRequestTime() {
    const key = this.getCurrentKey();
    if (key) {
      this.lastRequestTime.set(key, Date.now());
    }
  }
  
  async executeWithFallback(fn, retries = 2) {
    if (!this.hasKeys()) {
      throw new Error('No API keys configured');
    }
    
    const triedKeys = new Set();
    let lastError = null;
    
    while (triedKeys.size < this.keys.length) {
      const client = this.getCurrentClient();
      const keyName = this.keys[this.currentIndex].name;
      triedKeys.add(keyName);
      
      // Retry loop for transient errors
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Wait to respect rate limits
          await this.waitForRateLimit();
          
          const result = await fn(client);
          this.updateLastRequestTime();
          return result;
        } catch (error) {
          lastError = error;
          const isRateLimit = error.status === 429 || 
                            error.message?.includes('rate limit') ||
                            error.message?.includes('quota') ||
                            error.message?.includes('too many requests');
          
          const isTransient = error.status === 503 || 
                             error.status === 502 ||
                             error.message?.includes('temporarily');
          
          if (isRateLimit) {
            console.log(`Rate limited on ${keyName}, attempt ${attempt + 1}`);
            
            // If we have more keys, try the next one
            if (this.rotateKey()) {
              console.log(`Switching to next API key...`);
              break; // Break retry loop, try next key
            }
            
            // If no more keys, wait and retry with exponential backoff
            if (attempt < retries) {
              const waitTime = Math.min(2000 * Math.pow(2, attempt), 10000);
              console.log(`Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            }
          } else if (isTransient && attempt < retries) {
            // Transient error, retry after short delay
            const waitTime = 1000 * (attempt + 1);
            console.log(`Transient error on ${keyName}, retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          
          // Non-retryable error
          throw error;
        }
      }
    }
    
    throw lastError || new Error('All API keys exhausted or rate limited');
  }
}

// Singleton instance
const apiKeyManager = new ApiKeyManager();

module.exports = apiKeyManager;
