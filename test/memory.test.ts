/**
 * Memory System Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentMemory,
  WorkingMemory,
  MemoryEntry,
  DEFAULT_MEMORY_CONFIG,
} from '../src/memory/memory.js';

// ============================================================================
// AGENT MEMORY TESTS
// ============================================================================

describe('AgentMemory', () => {
  let memory: AgentMemory;

  beforeEach(() => {
    memory = new AgentMemory();
  });

  describe('initialization', () => {
    it('creates memory with default config', () => {
      const memory = new AgentMemory();
      expect(memory).toBeDefined();
    });

    it('accepts custom config', () => {
      const memory = new AgentMemory({
        maxEntriesPerConversation: 50,
        maxConversations: 100,
      });
      expect(memory).toBeDefined();
    });
  });

  describe('entries', () => {
    it('adds entries to conversation', async () => {
      await memory.addEntry('conv1', {
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      const entries = await memory.getConversation('conv1');
      expect(entries.length).toBe(1);
    });

    it('retrieves conversation entries', async () => {
      await memory.addEntry('conv1', {
        role: 'user',
        content: 'First',
        timestamp: new Date().toISOString(),
      });
      await memory.addEntry('conv1', {
        role: 'assistant',
        content: 'Second',
        timestamp: new Date().toISOString(),
      });

      const entries = await memory.getConversation('conv1');
      expect(entries.length).toBe(2);
      expect(entries[0].content).toBe('First');
      expect(entries[1].content).toBe('Second');
    });

    it('returns empty array for non-existent conversation', async () => {
      const entries = await memory.getConversation('nonexistent');
      expect(entries).toEqual([]);
    });

    it('gets recent entries', async () => {
      for (let i = 0; i < 10; i++) {
        await memory.addEntry('conv1', {
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      const recent = await memory.getRecentEntries('conv1', 3);
      expect(recent.length).toBe(3);
      expect(recent[0].content).toBe('Message 7');
      expect(recent[2].content).toBe('Message 9');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await memory.addEntry('conv1', {
        role: 'user',
        content: 'I need help with Python programming',
        timestamp: new Date().toISOString(),
      });
      await memory.addEntry('conv1', {
        role: 'assistant',
        content: 'I can help with Python code',
        timestamp: new Date().toISOString(),
      });
      await memory.addEntry('conv2', {
        role: 'user',
        content: 'What is JavaScript?',
        timestamp: new Date().toISOString(),
      });
    });

    it('searches by keyword', async () => {
      const results = await memory.searchByKeyword('Python');
      expect(results.length).toBe(2);
    });

    it('ranks results by relevance', async () => {
      const results = await memory.searchByKeyword('Python programming');
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('filters by conversation ID', async () => {
      const results = await memory.searchByKeyword('help', { conversationId: 'conv1' });
      expect(results.every(r => r.conversationId === 'conv1')).toBe(true);
    });

    it('limits results', async () => {
      const results = await memory.searchByKeyword('Python', { limit: 1 });
      expect(results.length).toBe(1);
    });
  });

  describe('conversation management', () => {
    it('deletes conversation', async () => {
      await memory.addEntry('conv1', {
        role: 'user',
        content: 'Test',
        timestamp: new Date().toISOString(),
      });

      const deleted = await memory.deleteConversation('conv1');
      expect(deleted).toBe(true);

      const entries = await memory.getConversation('conv1');
      expect(entries.length).toBe(0);
    });

    it('clears conversation entries', async () => {
      await memory.addEntry('conv1', {
        role: 'user',
        content: 'Test',
        timestamp: new Date().toISOString(),
      });

      await memory.clearConversation('conv1');

      const entries = await memory.getConversation('conv1');
      expect(entries.length).toBe(0);
    });

    it('gets conversation summary', async () => {
      await memory.addEntry('conv1', {
        role: 'user',
        content: 'Hello world',
        timestamp: new Date().toISOString(),
      });

      const summary = await memory.getSummary('conv1');
      expect(summary?.id).toBe('conv1');
      expect(summary?.entryCount).toBe(1);
      expect(summary?.startedAt).toBeDefined();
    });

    it('lists all conversations', async () => {
      await memory.addEntry('conv1', { role: 'user', content: 'Test 1', timestamp: new Date().toISOString() });
      await memory.addEntry('conv2', { role: 'user', content: 'Test 2', timestamp: new Date().toISOString() });

      const conversations = await memory.listConversations();
      expect(conversations.length).toBe(2);
    });
  });

  describe('statistics', () => {
    it('gets memory stats', async () => {
      await memory.addEntry('conv1', { role: 'user', content: 'Test 1', timestamp: new Date().toISOString() });
      await memory.addEntry('conv1', { role: 'user', content: 'Test 2', timestamp: new Date().toISOString() });
      await memory.addEntry('conv2', { role: 'user', content: 'Test 3', timestamp: new Date().toISOString() });

      const stats = await memory.getStats();
      expect(stats.totalConversations).toBe(2);
      expect(stats.totalEntries).toBe(3);
    });
  });

  describe('limits', () => {
    it('enforces max entries per conversation', async () => {
      const memory = new AgentMemory({ maxEntriesPerConversation: 3 });

      for (let i = 0; i < 5; i++) {
        await memory.addEntry('conv1', {
          role: 'user',
          content: `Message ${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      const entries = await memory.getConversation('conv1');
      expect(entries.length).toBe(3);
      expect(entries[0].content).toBe('Message 2'); // Oldest removed
    });

    it('enforces max conversations', async () => {
      const memory = new AgentMemory({ maxConversations: 2 });

      await memory.addEntry('conv1', { role: 'user', content: 'Test', timestamp: new Date().toISOString() });
      await memory.addEntry('conv2', { role: 'user', content: 'Test', timestamp: new Date().toISOString() });
      await memory.addEntry('conv3', { role: 'user', content: 'Test', timestamp: new Date().toISOString() });

      const conversations = await memory.listConversations();
      expect(conversations.length).toBe(2);
    });
  });

  describe('export/import', () => {
    it('exports memory data', async () => {
      await memory.addEntry('conv1', { role: 'user', content: 'Test', timestamp: new Date().toISOString() });

      const exported = await memory.export();
      expect(exported.conversations.conv1).toBeDefined();
      expect(exported.conversations.conv1.length).toBe(1);
    });

    it('imports memory data', async () => {
      const data = {
        conversations: {
          conv1: [{ role: 'user' as const, content: 'Imported', timestamp: new Date().toISOString() }],
        },
        metadata: {
          conv1: { createdAt: Date.now(), lastAccessedAt: Date.now() },
        },
      };

      await memory.import(data);

      const entries = await memory.getConversation('conv1');
      expect(entries.length).toBe(1);
      expect(entries[0].content).toBe('Imported');
    });
  });

  describe('clear', () => {
    it('clears all memory', async () => {
      await memory.addEntry('conv1', { role: 'user', content: 'Test', timestamp: new Date().toISOString() });
      await memory.addEntry('conv2', { role: 'user', content: 'Test', timestamp: new Date().toISOString() });

      await memory.clear();

      const stats = await memory.getStats();
      expect(stats.totalConversations).toBe(0);
      expect(stats.totalEntries).toBe(0);
    });
  });
});

// ============================================================================
// WORKING MEMORY TESTS
// ============================================================================

describe('WorkingMemory', () => {
  let memory: WorkingMemory;

  beforeEach(() => {
    memory = new WorkingMemory();
  });

  describe('basic operations', () => {
    it('sets and gets values', () => {
      memory.set('key1', 'value1');
      expect(memory.get('key1')).toBe('value1');
    });

    it('checks if key exists', () => {
      memory.set('key1', 'value1');
      expect(memory.has('key1')).toBe(true);
      expect(memory.has('key2')).toBe(false);
    });

    it('deletes values', () => {
      memory.set('key1', 'value1');
      const deleted = memory.delete('key1');
      expect(deleted).toBe(true);
      expect(memory.has('key1')).toBe(false);
    });

    it('returns undefined for non-existent keys', () => {
      expect(memory.get('nonexistent')).toBeUndefined();
    });
  });

  describe('iteration', () => {
    it('lists all keys', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');
      
      const keys = memory.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('lists all entries', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');
      
      const entries = memory.entries();
      expect(entries.length).toBe(2);
    });
  });

  describe('history', () => {
    it('tracks change history', () => {
      memory.set('key1', 'value1');
      memory.set('key1', 'value2');
      
      const history = memory.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].value).toBe('value1');
      expect(history[1].value).toBe('value2');
    });

    it('includes timestamps in history', () => {
      memory.set('key1', 'value1');
      
      const history = memory.getHistory();
      expect(history[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe('snapshot', () => {
    it('creates snapshot of current state', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');
      
      const snapshot = memory.snapshot();
      expect(snapshot.key1).toBe('value1');
      expect(snapshot.key2).toBe('value2');
    });

    it('restores from snapshot', () => {
      memory.set('key1', 'original');
      
      memory.restore({ key1: 'restored', key2: 'new' });
      
      expect(memory.get('key1')).toBe('restored');
      expect(memory.get('key2')).toBe('new');
    });
  });

  describe('clear', () => {
    it('clears all values', () => {
      memory.set('key1', 'value1');
      memory.set('key2', 'value2');
      
      memory.clear();
      
      expect(memory.keys().length).toBe(0);
    });

    it('clears history', () => {
      memory.set('key1', 'value1');
      memory.clear();
      
      expect(memory.getHistory().length).toBe(0);
    });
  });

  describe('type safety', () => {
    it('preserves types', () => {
      memory.set('number', 42);
      memory.set('object', { nested: true });
      memory.set('array', [1, 2, 3]);
      
      expect(memory.get<number>('number')).toBe(42);
      expect(memory.get<{ nested: boolean }>('object')).toEqual({ nested: true });
      expect(memory.get<number[]>('array')).toEqual([1, 2, 3]);
    });
  });
});
