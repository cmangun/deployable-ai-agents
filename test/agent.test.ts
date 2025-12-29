import { describe, it, expect, beforeAll } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { echoTool } from '../src/tools/echoTool.js';
import { calculatorTool } from '../src/tools/calculatorTool.js';
import { Agent } from '../src/agent/agent.js';

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    expect(registry.hasTool('echo')).toBe(true);
    expect(registry.getTool('echo')).toBe(echoTool);
    expect(registry.listTools()).toHaveLength(1);
  });
});

describe('Echo Tool', () => {
  it('echoes input text', async () => {
    const result = (await echoTool.execute({ text: 'hello' })) as { echoed: string };
    expect(result.echoed).toBe('hello');
  });
});

describe('Calculator Tool', () => {
  it('adds numbers', async () => {
    const result = (await calculatorTool.execute({ operation: 'add', a: 2, b: 3 })) as {
      result: number;
    };
    expect(result.result).toBe(5);
  });

  it('subtracts numbers', async () => {
    const result = (await calculatorTool.execute({ operation: 'subtract', a: 10, b: 4 })) as {
      result: number;
    };
    expect(result.result).toBe(6);
  });

  it('multiplies numbers', async () => {
    const result = (await calculatorTool.execute({ operation: 'multiply', a: 3, b: 4 })) as {
      result: number;
    };
    expect(result.result).toBe(12);
  });

  it('divides numbers', async () => {
    const result = (await calculatorTool.execute({ operation: 'divide', a: 10, b: 2 })) as {
      result: number;
    };
    expect(result.result).toBe(5);
  });

  it('throws on division by zero', async () => {
    await expect(calculatorTool.execute({ operation: 'divide', a: 10, b: 0 })).rejects.toThrow(
      'Division by zero'
    );
  });
});

describe('Agent', () => {
  let agent: Agent;
  let registry: ToolRegistry;

  beforeAll(() => {
    registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(calculatorTool);
    agent = new Agent(registry, { maxSteps: 10, timeoutMs: 5000 });
  });

  it('executes echo tool when mentioned', async () => {
    const response = await agent.run({
      task: 'Please use echo to repeat this',
      context: {},
    });

    expect(response.success).toBe(true);
    expect(response.steps.length).toBeGreaterThan(0);
  });

  it('provides guidance when no tool mentioned', async () => {
    const response = await agent.run({
      task: 'What can you do?',
      context: {},
    });

    expect(response.success).toBe(true);
    expect(response.result).toContain('echo');
    expect(response.result).toContain('calculator');
  });
});
