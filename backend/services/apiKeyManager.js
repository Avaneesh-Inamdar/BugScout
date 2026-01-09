const Groq = require('groq-sdk');

class ApiKeyManager {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.clients = new Map();
    
    // Load all available API keys
    const keyNames = ['GROQ_API_KEY', 'GROQ_API_KEY_BACKUP', 'GROQ_API_KEY_BACKUP_2'];
    keyNames.forEach(name => {
      const key = process.env[name];
      if (key) {
        this.keys.push({ name, key });
        this.clients.set(key, new Groq({ apiKey: key }));
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
  
  rotateKey() {
    if (this.keys.length <= 1) return false;
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.log(`Rotated to API key: ${this.keys[this.currentIndex].name}`);
    return true;
  }
  
  async executeWithFallback(fn) {
    if (!this.hasKeys()) {
      throw new Error('No API keys configured');
    }
    
    const triedKeys = new Set();
    
    while (triedKeys.size < this.keys.length) {
      const client = this.getCurrentClient();
      const keyName = this.keys[this.currentIndex].name;
      triedKeys.add(keyName);
      
      try {
        return await fn(client);
      } catch (error) {
        const isRateLimit = error.status === 429 || 
                          error.message?.includes('rate limit') ||
                          error.message?.includes('quota');
        
        if (isRateLimit && this.rotateKey()) {
          console.log(`Rate limited on ${keyName}, trying next key...`);
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error('All API keys exhausted or rate limited');
  }
}

// Singleton instance
const apiKeyManager = new ApiKeyManager();

module.exports = apiKeyManager;
