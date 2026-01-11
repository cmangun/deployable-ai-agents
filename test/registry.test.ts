/**
 * Tool Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ToolRegistry,
  Tool,
  ToolResult,
  echoTool,
  calculatorTool,
  jsonTool,
  dateTool,
  createDefaultRegistry,
} from '../src/tools/registry.js';

// ============================================================================
// TOOL REGISTRY CORE TESTS
// ============================================================================

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('registration', () => {
    it('registers tools', () => {
      registry.register(echoTool);
      expect(registry.hasTool('echo')).toBe(true);
    });

    it('retrieves registered tools', () => {
      registry.register(echoTool);
      const tool = registry.getTool('echo');
      expect(tool?.name).toBe('echo');
    });

    it('lists all tools', () => {
      registry.register(echoTool);
      registry.register(calculatorTool);
      const tools = registry.listTools();
      expect(tools.length).toBe(2);
    });

    it('unregisters tools', () => {
      registry.register(echoTool);
      const removed = registry.unregister('echo');
      expect(removed).toBe(true);
      expect(registry.hasTool('echo')).toBe(false);
    });

    it('returns false when unregistering non-existent tool', () => {
      const removed = registry.unregister('nonexistent');
      expect(removed).toBe(false);
    });

    it('validates dependencies on registration', () => {
      const dependentTool: Tool = {
        name: 'dependent',
        description: 'Depends on calculator',
        enabled: true,
        version: '1.0.0',
        dependencies: ['calculator'],
        execute: async () => ({ success: true, data: null }),
      };

      expect(() => registry.register(dependentTool)).toThrow(/depends on unregistered/);
    });

    it('prevents unregistering tools with dependents', () => {
      registry.register(calculatorTool);
      
      const dependentTool: Tool = {
        name: 'dependent',
        description: 'Depends on calculator',
        enabled: true,
        version: '1.0.0',
        dependencies: ['calculator'],
        execute: async () => ({ success: true, data: null }),
      };
      registry.register(dependentTool);

      expect(() => registry.unregister('calculator')).toThrow(/depends on it/);
    });
  });

  describe('categories', () => {
    it('lists tools by category', () => {
      registry.register(echoTool);
      registry.register(calculatorTool);
      
      const mathTools = registry.listByCategory('math');
      expect(mathTools.length).toBe(1);
      expect(mathTools[0].name).toBe('calculator');
    });

    it('gets all categories', () => {
      registry.register(echoTool);
      registry.register(calculatorTool);
      
      const categories = registry.getCategories();
      expect(categories).toContain('utility');
      expect(categories).toContain('math');
    });
  });

  describe('enable/disable', () => {
    it('enables and disables tools', () => {
      registry.register(echoTool);
      
      registry.setEnabled('echo', false);
      expect(registry.getTool('echo')?.enabled).toBe(false);
      
      registry.setEnabled('echo', true);
      expect(registry.getTool('echo')?.enabled).toBe(true);
    });

    it('returns false for non-existent tool', () => {
      const result = registry.setEnabled('nonexistent', false);
      expect(result).toBe(false);
    });
  });

  describe('execution', () => {
    it('executes tools', async () => {
      registry.register(echoTool);
      
      const result = await registry.execute('echo', { text: 'hello' });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('hello');
    });

    it('returns error for non-existent tool', async () => {
      const result = await registry.execute('nonexistent', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for disabled tool', async () => {
      registry.register(echoTool);
      registry.setEnabled('echo', false);
      
      const result = await registry.execute('echo', { text: 'hello' });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('validates required parameters', async () => {
      registry.register(echoTool);
      
      const result = await registry.execute('echo', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required');
    });

    it('validates parameter types', async () => {
      registry.register(calculatorTool);
      
      const result = await registry.execute('calculator', {
        operation: 'add',
        a: 'not a number',
        b: 3,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid type');
    });

    it('validates enum values', async () => {
      registry.register(calculatorTool);
      
      const result = await registry.execute('calculator', {
        operation: 'invalid_op',
        a: 2,
        b: 3,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('applies default values', async () => {
      const toolWithDefaults: Tool = {
        name: 'defaults',
        description: 'Tool with defaults',
        enabled: true,
        version: '1.0.0',
        parameters: {
          value: {
            name: 'value',
            type: 'string',
            description: 'Value',
            required: false,
            default: 'default_value',
          },
        },
        execute: async (input) => ({ success: true, data: input.value }),
      };
      
      registry.register(toolWithDefaults);
      const result = await registry.execute('defaults', {});
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('default_value');
    });

    it('includes duration in metadata', async () => {
      registry.register(echoTool);
      
      const result = await registry.execute('echo', { text: 'hello' });
      
      expect(result.metadata?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles execution errors', async () => {
      const failingTool: Tool = {
        name: 'failing',
        description: 'Always fails',
        enabled: true,
        version: '1.0.0',
        execute: async () => { throw new Error('Intentional failure'); },
      };
      
      registry.register(failingTool);
      const result = await registry.execute('failing', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Intentional failure');
    });
  });

  describe('execution tracking', () => {
    it('tracks executions', async () => {
      registry.register(echoTool);
      
      await registry.execute('echo', { text: 'test1' });
      await registry.execute('echo', { text: 'test2' });
      
      const executions = registry.getExecutions();
      expect(executions.length).toBe(2);
    });

    it('filters executions by tool', async () => {
      registry.register(echoTool);
      registry.register(calculatorTool);
      
      await registry.execute('echo', { text: 'test' });
      await registry.execute('calculator', { operation: 'add', a: 1, b: 2 });
      
      const executions = registry.getExecutions({ tool: 'echo' });
      expect(executions.length).toBe(1);
      expect(executions[0].tool).toBe('echo');
    });

    it('limits execution history', async () => {
      registry.register(echoTool);
      
      const executions = registry.getExecutions({ limit: 1 });
      // No executions yet
      expect(executions.length).toBe(0);
    });

    it('clears executions', async () => {
      registry.register(echoTool);
      await registry.execute('echo', { text: 'test' });
      
      registry.clearExecutions();
      
      const executions = registry.getExecutions();
      expect(executions.length).toBe(0);
    });
  });

  describe('statistics', () => {
    it('calculates execution stats', async () => {
      registry.register(echoTool);
      registry.register(calculatorTool);
      
      await registry.execute('echo', { text: 'test' });
      await registry.execute('calculator', { operation: 'add', a: 1, b: 2 });
      
      const stats = registry.getStats();
      
      expect(stats.totalExecutions).toBe(2);
      expect(stats.successRate).toBe(1);
      expect(stats.averageDurationMs).toBeGreaterThanOrEqual(0);
      expect(stats.byTool.echo).toBeDefined();
      expect(stats.byTool.calculator).toBeDefined();
    });

    it('handles no executions', () => {
      const stats = registry.getStats();
      
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.averageDurationMs).toBe(0);
    });
  });

  describe('export', () => {
    it('exports registry configuration', () => {
      registry.register(echoTool);
      
      const exported = registry.export();
      
      expect(exported.tools.length).toBe(1);
      expect(exported.tools[0].name).toBe('echo');
      expect(exported.config).toBeDefined();
    });
  });
});

// ============================================================================
// BUILT-IN TOOLS TESTS
// ============================================================================

describe('Echo Tool', () => {
  it('echoes text', async () => {
    const result = await echoTool.execute({ text: 'hello world' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('hello world');
  });
});

describe('Calculator Tool', () => {
  it('adds numbers', async () => {
    const result = await calculatorTool.execute({ operation: 'add', a: 5, b: 3 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(8);
  });

  it('subtracts numbers', async () => {
    const result = await calculatorTool.execute({ operation: 'subtract', a: 10, b: 4 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(6);
  });

  it('multiplies numbers', async () => {
    const result = await calculatorTool.execute({ operation: 'multiply', a: 6, b: 7 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
  });

  it('divides numbers', async () => {
    const result = await calculatorTool.execute({ operation: 'divide', a: 20, b: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(4);
  });

  it('handles division by zero', async () => {
    const result = await calculatorTool.execute({ operation: 'divide', a: 10, b: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Division by zero');
  });

  it('calculates power', async () => {
    const result = await calculatorTool.execute({ operation: 'power', a: 2, b: 8 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(256);
  });

  it('calculates square root', async () => {
    const result = await calculatorTool.execute({ operation: 'sqrt', a: 16 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(4);
  });

  it('handles negative square root', async () => {
    const result = await calculatorTool.execute({ operation: 'sqrt', a: -1 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('negative');
  });

  it('calculates modulo', async () => {
    const result = await calculatorTool.execute({ operation: 'modulo', a: 17, b: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toBe(2);
  });
});

describe('JSON Tool', () => {
  it('parses JSON', async () => {
    const result = await jsonTool.execute({
      operation: 'parse',
      input: '{"name":"test","value":42}',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test', value: 42 });
  });

  it('handles invalid JSON', async () => {
    const result = await jsonTool.execute({
      operation: 'parse',
      input: 'not valid json',
    });
    expect(result.success).toBe(false);
  });
});

describe('Date Tool', () => {
  it('gets current date', async () => {
    const result = await dateTool.execute({ operation: 'now' });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe('string');
  });

  it('parses date string', async () => {
    const result = await dateTool.execute({
      operation: 'parse',
      input: '2024-01-15T12:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('calculates date difference', async () => {
    const result = await dateTool.execute({
      operation: 'diff',
      input: '2024-01-01',
      input2: '2024-01-02',
    });
    expect(result.success).toBe(true);
    expect((result.data as any).days).toBe(1);
  });

  it('formats as unix timestamp', async () => {
    const result = await dateTool.execute({
      operation: 'now',
      format: 'unix',
    });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe('number');
  });
});

describe('createDefaultRegistry', () => {
  it('creates registry with built-in tools', () => {
    const registry = createDefaultRegistry();
    
    expect(registry.hasTool('echo')).toBe(true);
    expect(registry.hasTool('calculator')).toBe(true);
    expect(registry.hasTool('json')).toBe(true);
    expect(registry.hasTool('date')).toBe(true);
  });
});
