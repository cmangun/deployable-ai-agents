/**
 * Agent Memory System
 * 
 * Implements conversation history and working memory for agents:
 * - Short-term conversation memory
 * - Long-term knowledge storage
 * - Semantic search and retrieval
 * - Memory persistence
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MemoryEntry {
  /** Role of the entry creator */
  role: 'user' | 'assistant' | 'system' | 'agent';
  /** Content of the entry */
  content: string;
  /** Timestamp of creation */
  timestamp: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Embedding vector for semantic search (optional) */
  embedding?: number[];
}

export interface ConversationSummary {
  /** Conversation ID */
  id: string;
  /** Number of entries */
  entryCount: number;
  /** First entry timestamp */
  startedAt: string;
  /** Last entry timestamp */
  lastUpdatedAt: string;
  /** Key topics discussed */
  topics?: string[];
}

export interface MemorySearchResult {
  /** The memory entry */
  entry: MemoryEntry;
  /** Relevance score (0-1) */
  score: number;
  /** Conversation ID */
  conversationId: string;
  /** Index in conversation */
  index: number;
}

export interface MemoryConfig {
  /** Maximum entries per conversation */
  maxEntriesPerConversation: number;
  /** Maximum total conversations */
  maxConversations: number;
  /** TTL for conversations in milliseconds */
  conversationTtlMs: number;
  /** Enable semantic search */
  enableSemanticSearch: boolean;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maxEntriesPerConversation: 100,
  maxConversations: 1000,
  conversationTtlMs: 24 * 60 * 60 * 1000, // 24 hours
  enableSemanticSearch: false,
};

// ============================================================================
// MEMORY IMPLEMENTATION
// ============================================================================

/**
 * In-memory conversation storage for agents.
 * 
 * Provides conversation history management with:
 * - FIFO eviction when limits exceeded
 * - TTL-based expiration
 * - Keyword-based search
 * - Optional semantic search support
 * 
 * @example
 * ```typescript
 * const memory = new AgentMemory();
 * 
 * await memory.addEntry('conv_123', {
 *   role: 'user',
 *   content: 'What is the weather?',
 *   timestamp: new Date().toISOString(),
 * });
 * 
 * const history = await memory.getConversation('conv_123');
 * ```
 */
export class AgentMemory {
  private readonly conversations = new Map<string, MemoryEntry[]>();
  private readonly metadata = new Map<string, { createdAt: number; lastAccessedAt: number }>();
  private readonly config: MemoryConfig;

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
  }

  /**
   * Add an entry to a conversation.
   */
  async addEntry(conversationId: string, entry: MemoryEntry): Promise<void> {
    // Initialize conversation if needed
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, []);
      this.metadata.set(conversationId, {
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      });

      // Evict old conversations if limit exceeded
      await this.evictOldConversations();
    }

    const entries = this.conversations.get(conversationId)!;
    entries.push(entry);

    // Update access time
    const meta = this.metadata.get(conversationId)!;
    meta.lastAccessedAt = Date.now();

    // Evict old entries if limit exceeded
    while (entries.length > this.config.maxEntriesPerConversation) {
      entries.shift();
    }
  }

  /**
   * Get all entries in a conversation.
   */
  async getConversation(conversationId: string): Promise<MemoryEntry[]> {
    // Check TTL
    const meta = this.metadata.get(conversationId);
    if (meta && Date.now() - meta.createdAt > this.config.conversationTtlMs) {
      await this.deleteConversation(conversationId);
      return [];
    }

    // Update access time
    if (meta) {
      meta.lastAccessedAt = Date.now();
    }

    return this.conversations.get(conversationId) || [];
  }

  /**
   * Get the last N entries from a conversation.
   */
  async getRecentEntries(conversationId: string, count: number): Promise<MemoryEntry[]> {
    const entries = await this.getConversation(conversationId);
    return entries.slice(-count);
  }

  /**
   * Search entries by keyword.
   */
  async searchByKeyword(
    query: string,
    options: { conversationId?: string; limit?: number } = {}
  ): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    const limit = options.limit || 10;
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    const conversationsToSearch = options.conversationId
      ? [[options.conversationId, this.conversations.get(options.conversationId)]]
      : Array.from(this.conversations.entries());

    for (const [convId, entries] of conversationsToSearch) {
      if (!entries) continue;

      for (let i = 0; i < (entries as MemoryEntry[]).length; i++) {
        const entry = (entries as MemoryEntry[])[i];
        const contentLower = entry.content.toLowerCase();

        // Calculate relevance score
        let matchCount = 0;
        for (const term of queryTerms) {
          if (contentLower.includes(term)) {
            matchCount++;
          }
        }

        if (matchCount > 0) {
          const score = matchCount / queryTerms.length;
          results.push({
            entry,
            score,
            conversationId: convId as string,
            index: i,
          });
        }
      }
    }

    // Sort by score descending and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Delete a conversation.
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    const deleted = this.conversations.delete(conversationId);
    this.metadata.delete(conversationId);
    return deleted;
  }

  /**
   * Clear all entries in a conversation but keep it.
   */
  async clearConversation(conversationId: string): Promise<void> {
    const entries = this.conversations.get(conversationId);
    if (entries) {
      entries.length = 0;
    }
  }

  /**
   * Get conversation summary.
   */
  async getSummary(conversationId: string): Promise<ConversationSummary | null> {
    const entries = this.conversations.get(conversationId);
    const meta = this.metadata.get(conversationId);

    if (!entries || !meta) return null;

    // Extract topics from content
    const topics = this.extractTopics(entries);

    return {
      id: conversationId,
      entryCount: entries.length,
      startedAt: new Date(meta.createdAt).toISOString(),
      lastUpdatedAt: new Date(meta.lastAccessedAt).toISOString(),
      topics,
    };
  }

  /**
   * List all conversation summaries.
   */
  async listConversations(): Promise<ConversationSummary[]> {
    const summaries: ConversationSummary[] = [];

    for (const convId of this.conversations.keys()) {
      const summary = await this.getSummary(convId);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries.sort((a, b) => 
      new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
    );
  }

  /**
   * Get memory statistics.
   */
  async getStats(): Promise<{
    totalConversations: number;
    totalEntries: number;
    oldestConversation: string | null;
    newestConversation: string | null;
  }> {
    let totalEntries = 0;
    let oldest: { id: string; time: number } | null = null;
    let newest: { id: string; time: number } | null = null;

    for (const [convId, entries] of this.conversations.entries()) {
      totalEntries += entries.length;
      
      const meta = this.metadata.get(convId);
      if (meta) {
        if (!oldest || meta.createdAt < oldest.time) {
          oldest = { id: convId, time: meta.createdAt };
        }
        if (!newest || meta.createdAt > newest.time) {
          newest = { id: convId, time: meta.createdAt };
        }
      }
    }

    return {
      totalConversations: this.conversations.size,
      totalEntries,
      oldestConversation: oldest?.id || null,
      newestConversation: newest?.id || null,
    };
  }

  /**
   * Evict old conversations when limit exceeded.
   */
  private async evictOldConversations(): Promise<void> {
    while (this.conversations.size > this.config.maxConversations) {
      // Find oldest conversation
      let oldestId: string | null = null;
      let oldestTime = Infinity;

      for (const [convId, meta] of this.metadata.entries()) {
        if (meta.lastAccessedAt < oldestTime) {
          oldestTime = meta.lastAccessedAt;
          oldestId = convId;
        }
      }

      if (oldestId) {
        await this.deleteConversation(oldestId);
      } else {
        break;
      }
    }
  }

  /**
   * Extract topics from conversation entries.
   */
  private extractTopics(entries: MemoryEntry[]): string[] {
    // Simple keyword extraction (v0 implementation)
    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'shall',
      'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once',
      'here', 'there', 'when', 'where', 'why', 'how', 'all',
      'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
      'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because',
      'until', 'while', 'what', 'which', 'who', 'whom', 'this',
      'that', 'these', 'those', 'am', 'it', 'its', 'my', 'your',
      'his', 'her', 'their', 'our', 'i', 'you', 'he', 'she',
      'we', 'they', 'me', 'him', 'us', 'them',
    ]);

    for (const entry of entries) {
      const words = entry.content.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Return top 5 most common words
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Export all memory data.
   */
  async export(): Promise<{
    conversations: Record<string, MemoryEntry[]>;
    metadata: Record<string, { createdAt: number; lastAccessedAt: number }>;
  }> {
    return {
      conversations: Object.fromEntries(this.conversations),
      metadata: Object.fromEntries(this.metadata),
    };
  }

  /**
   * Import memory data.
   */
  async import(data: {
    conversations: Record<string, MemoryEntry[]>;
    metadata: Record<string, { createdAt: number; lastAccessedAt: number }>;
  }): Promise<void> {
    for (const [convId, entries] of Object.entries(data.conversations)) {
      this.conversations.set(convId, entries);
    }
    for (const [convId, meta] of Object.entries(data.metadata)) {
      this.metadata.set(convId, meta);
    }
  }

  /**
   * Clear all memory.
   */
  async clear(): Promise<void> {
    this.conversations.clear();
    this.metadata.clear();
  }
}

// ============================================================================
// WORKING MEMORY
// ============================================================================

/**
 * Working memory for agent reasoning.
 * 
 * Provides scratchpad-like storage for intermediate results,
 * context accumulation, and task state management.
 */
export class WorkingMemory {
  private readonly store = new Map<string, unknown>();
  private readonly history: Array<{ key: string; value: unknown; timestamp: number }> = [];
  private readonly maxHistory = 100;

  /**
   * Set a value in working memory.
   */
  set(key: string, value: unknown): void {
    this.store.set(key, value);
    this.history.push({ key, value, timestamp: Date.now() });
    
    // Trim history
    while (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Get a value from working memory.
   */
  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  /**
   * Check if key exists.
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Delete a value.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Get all keys.
   */
  keys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Get all entries.
   */
  entries(): Array<[string, unknown]> {
    return Array.from(this.store.entries());
  }

  /**
   * Get change history.
   */
  getHistory(): Array<{ key: string; value: unknown; timestamp: number }> {
    return [...this.history];
  }

  /**
   * Clear all values.
   */
  clear(): void {
    this.store.clear();
    this.history.length = 0;
  }

  /**
   * Get snapshot of current state.
   */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.store);
  }

  /**
   * Restore from snapshot.
   */
  restore(snapshot: Record<string, unknown>): void {
    this.store.clear();
    for (const [key, value] of Object.entries(snapshot)) {
      this.store.set(key, value);
    }
  }
}
