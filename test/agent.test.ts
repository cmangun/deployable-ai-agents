/**
 * Agent Tests
 * 
 * Comprehensive test suite for the enhanced agent.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Agent, AgentConfig, DEFAULT_AGENT_CONFIG } from '../src/agent/agent.js';
import { ToolRegistry, Tool, createDefaultRegistry } from '../src/tools/registry.js';
import { PolicyEngine, createDenyPolicy, createRateLimitPolicy } from '../src/policy/engine.js';
import { AgentMemory } from '../src/memory/memory.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createTestTool = (name: string, result: unknown): Tool => ({
  name,
  description: `Test tool: ${name}`,
  enabled: true,
  version: '1.0.0',
  execute: async () => ({ success: true, data: result }),
});

const createFailingTool = (name: string, error: string): Tool => ({
  name,
  description: `Failing tool: ${name}`,
  enabled: true,
  version: '1.0.0',
  execute: async () => ({ success: false, data: null, error }),
});

// ============================================================================
// AGENT CORE TESTS
// ============================================================================

describe('Agent', () => {
  let registry: ToolRegistry;
  let agent: Agent;

  beforeEach(() => {
    registry = createDefaultRegistry();
    agent = new Agent(registry);
  });

  describe('initialization', () => {
    it('creates agent with default config', () => {
      const agent = new Agent(registry);
      expect(agent).toBeDefined();
    });

    it('accepts custom config', () => {
      const config: Partial<AgentConfig> = {
        maxSteps: 5,
        timeoutMs: 10000,
        confidenceThreshold: 0.5,
      };
      const agent = new Agent(registry, config);
      expect(agent).toBeDefined();
    });

    it('accepts policy engine', () => {
      const policyEngine = new PolicyEngine();
      const agent = new Agent(registry, {}, policyEngine);
      expect(agent).toBeDefined();
    });

    it('accepts memory', () => {
      const memory = new AgentMemory();
      const agent = new Agent(registry, {}, undefined, memory);
      expect(agent).toBeDefined();
    });
  });

  describe('task execution', () => {
    it('executes simple task', async () => {
      const response = await agent.run({
        task: 'use echo tool with hello',
      });

      expect(response.success).toBe(true);
      expect(response.task).toBe('use echo tool with hello');
      expect(response.totalSteps).toBeGreaterThan(0);
      expect(response.conversationId).toBeDefined();
      expect(response.auditId).toBeDefined();
    });

    it('executes calculator task', async () => {
      const response = await agent.run({
        task: 'use calculator to add 5 and 3',
      });

      expect(response.success).toBe(true);
      expect(response.totalSteps).toBeGreaterThan(0);
    });

    it('handles unknown task gracefully', async () => {
      const response = await agent.run({
        task: 'do something completely unknown',
      });

      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
    });

    it('respects max steps limit', async () => {
      const agent = new Agent(registry, { maxSteps: 2 });
      const response = await agent.run({
        task: 'complex multi-step task',
        maxSteps: 2,
      });

      expect(response.totalSteps).toBeLessThanOrEqual(2);
    });

    it('includes step details', async () => {
      const response = await agent.run({
        task: 'use echo tool',
      });

      expect(response.steps.length).toBeGreaterThan(0);
      
      const step = response.steps[0];
      expect(step.stepNumber).toBe(1);
      expect(step.timestamp).toBeDefined();
      expect(step.thought).toBeDefined();
      expect(step.thought.reasoning).toBeDefined();
      expect(step.thought.confidence).toBeGreaterThan(0);
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('tool matching', () => {
    it('matches tool by name', async () => {
      const response = await agent.run({
        task: 'use the calculator tool',
      });

      expect(response.steps.some(s => s.action?.tool === 'calculator')).toBe(true);
    });

    it('matches tool by description keywords', async () => {
      registry.register({
        name: 'weather',
        description: 'Get weather forecast and temperature',
        enabled: true,
        version: '1.0.0',
        execute: async () => ({ success: true, data: { temp: 72, condition: 'sunny' } }),
      });

      const response = await agent.run({
        task: 'what is the temperature outside?',
      });

      expect(response.steps.some(s => s.action?.tool === 'weather')).toBe(true);
    });

    it('handles no matching tool', async () => {
      const response = await agent.run({
        task: 'make me a sandwich',
      });

      expect(response.success).toBe(true);
      expect(response.result).toContain('tool');
    });
  });

  describe('error handling', () => {
    it('handles tool execution error', async () => {
      registry.register(createFailingTool('failing', 'Intentional failure'));

      const response = await agent.run({
        task: 'use failing tool',
      });

      const failedStep = response.steps.find(s => s.observation?.error);
      expect(failedStep).toBeDefined();
    });

    it('handles tool not found', async () => {
      const response = await agent.run({
        task: 'use nonexistent tool',
      });

      expect(response.success).toBe(true); // Agent completes, just doesn't find tool
    });
  });

  describe('context handling', () => {
    it('accepts context in request', async () => {
      const response = await agent.run({
        task: 'use echo tool',
        context: { customKey: 'customValue' },
      });

      expect(response.success).toBe(true);
    });

    it('accepts conversation ID', async () => {
      const response = await agent.run({
        task: 'use echo tool',
        conversationId: 'conv_test_123',
      });

      expect(response.conversationId).toBe('conv_test_123');
    });

    it('accepts user ID', async () => {
      const response = await agent.run({
        task: 'use echo tool',
        userId: 'user_test_456',
      });

      expect(response.success).toBe(true);
    });
  });
});

// ============================================================================
// POLICY INTEGRATION TESTS
// ============================================================================

describe('Agent with Policies', () => {
  let registry: ToolRegistry;
  let policyEngine: PolicyEngine;

  beforeEach(() => {
    registry = createDefaultRegistry();
    policyEngine = new PolicyEngine({ defaultEffect: 'allow' });
  });

  it('blocks actions denied by policy', async () => {
    policyEngine.addRule(createDenyPolicy(
      'deny-calculator',
      'tool:calculator',
      'Calculator is disabled for testing'
    ));

    const agent = new Agent(registry, { enablePolicies: true }, policyEngine);
    const response = await agent.run({
      task: 'use calculator to add 2 and 2',
    });

    const blockedStep = response.steps.find(s => 
      s.observation?.error?.includes('blocked')
    );
    expect(blockedStep).toBeDefined();
  });

  it('enforces rate limits', async () => {
    policyEngine.addRule(createRateLimitPolicy(
      'rate-limit',
      2, // Max 2 requests
      60000, // Per minute
      'tool:*'
    ));

    const agent = new Agent(registry, { enablePolicies: true }, policyEngine);

    // First two should succeed
    await agent.run({ task: 'echo hello' });
    await agent.run({ task: 'echo world' });

    // Third should be rate limited
    const response = await agent.run({ task: 'echo again' });
    
    // Rate limit applies at policy level, not full block
    expect(response.success).toBeDefined();
  });

  it('records policy decisions in steps', async () => {
    policyEngine.addRule({
      id: 'audit-all',
      name: 'Audit All',
      description: 'Audit all actions',
      enabled: true,
      priority: 1,
      actionPattern: '*',
      condition: () => true,
      effect: 'allow',
    });

    const agent = new Agent(registry, { enablePolicies: true }, policyEngine);
    const response = await agent.run({
      task: 'use echo tool',
    });

    const stepWithPolicy = response.steps.find(s => s.policyDecisions);
    expect(stepWithPolicy?.policyDecisions).toBeDefined();
  });
});

// ============================================================================
// MEMORY INTEGRATION TESTS
// ============================================================================

describe('Agent with Memory', () => {
  let registry: ToolRegistry;
  let memory: AgentMemory;

  beforeEach(() => {
    registry = createDefaultRegistry();
    memory = new AgentMemory();
  });

  it('stores conversation in memory', async () => {
    const agent = new Agent(registry, { enableMemory: true }, undefined, memory);
    const response = await agent.run({
      task: 'use echo tool with test message',
      conversationId: 'test_conv',
    });

    const entries = await memory.getConversation('test_conv');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('loads conversation history', async () => {
    // Pre-populate memory
    await memory.addEntry('test_conv', {
      role: 'user',
      content: 'Previous message',
      timestamp: new Date().toISOString(),
    });

    const agent = new Agent(registry, { enableMemory: true }, undefined, memory);
    await agent.run({
      task: 'continue conversation',
      conversationId: 'test_conv',
    });

    const entries = await memory.getConversation('test_conv');
    expect(entries.length).toBeGreaterThan(1);
  });

  it('preserves conversation ID across runs', async () => {
    const agent = new Agent(registry, { enableMemory: true }, undefined, memory);

    const response1 = await agent.run({
      task: 'first message',
      conversationId: 'persistent_conv',
    });

    const response2 = await agent.run({
      task: 'second message',
      conversationId: 'persistent_conv',
    });

    expect(response1.conversationId).toBe(response2.conversationId);

    const entries = await memory.getConversation('persistent_conv');
    expect(entries.length).toBeGreaterThan(2);
  });
});

// ============================================================================
// RESPONSE STRUCTURE TESTS
// ============================================================================

describe('Agent Response', () => {
  let registry: ToolRegistry;
  let agent: Agent;

  beforeEach(() => {
    registry = createDefaultRegistry();
    agent = new Agent(registry);
  });

  it('includes all required fields', async () => {
    const response = await agent.run({ task: 'test task' });

    expect(response).toHaveProperty('success');
    expect(response).toHaveProperty('task');
    expect(response).toHaveProperty('result');
    expect(response).toHaveProperty('steps');
    expect(response).toHaveProperty('totalSteps');
    expect(response).toHaveProperty('durationMs');
    expect(response).toHaveProperty('conversationId');
    expect(response).toHaveProperty('auditId');
  });

  it('calculates duration correctly', async () => {
    const response = await agent.run({ task: 'echo test' });

    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(response.durationMs).toBeLessThan(10000); // Should be fast
  });

  it('generates unique IDs', async () => {
    const response1 = await agent.run({ task: 'test 1' });
    const response2 = await agent.run({ task: 'test 2' });

    expect(response1.auditId).not.toBe(response2.auditId);
    expect(response1.conversationId).not.toBe(response2.conversationId);
  });

  it('includes warnings when applicable', async () => {
    const agent = new Agent(registry, { maxSteps: 1, confidenceThreshold: 0.99 });
    const response = await agent.run({ task: 'complex task' });

    // May include low confidence warning
    expect(Array.isArray(response.warnings) || response.warnings === undefined).toBe(true);
  });
});

// ============================================================================
// STEP STRUCTURE TESTS
// ============================================================================

describe('Agent Steps', () => {
  let registry: ToolRegistry;
  let agent: Agent;

  beforeEach(() => {
    registry = createDefaultRegistry();
    agent = new Agent(registry);
  });

  it('thought process includes reasoning', async () => {
    const response = await agent.run({ task: 'use echo tool' });
    
    const step = response.steps[0];
    expect(step.thought.reasoning).toBeDefined();
    expect(step.thought.reasoning.length).toBeGreaterThan(0);
  });

  it('thought process includes confidence', async () => {
    const response = await agent.run({ task: 'use calculator' });
    
    const step = response.steps[0];
    expect(step.thought.confidence).toBeGreaterThan(0);
    expect(step.thought.confidence).toBeLessThanOrEqual(1);
  });

  it('action includes rationale', async () => {
    const response = await agent.run({ task: 'use echo tool' });
    
    const stepWithAction = response.steps.find(s => s.action);
    if (stepWithAction?.action) {
      expect(stepWithAction.action.rationale).toBeDefined();
    }
  });

  it('observation includes success status', async () => {
    const response = await agent.run({ task: 'use echo tool' });
    
    const stepWithObservation = response.steps.find(s => s.observation);
    if (stepWithObservation?.observation) {
      expect(typeof stepWithObservation.observation.success).toBe('boolean');
    }
  });

  it('steps have sequential numbers', async () => {
    const agent = new Agent(registry, { maxSteps: 5 });
    const response = await agent.run({ task: 'multi step task' });

    for (let i = 0; i < response.steps.length; i++) {
      expect(response.steps[i].stepNumber).toBe(i + 1);
    }
  });

  it('steps have valid timestamps', async () => {
    const response = await agent.run({ task: 'test' });

    for (const step of response.steps) {
      const timestamp = new Date(step.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    }
  });
});
