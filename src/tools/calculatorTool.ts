/**
 * Calculator Tool
 *
 * Simple arithmetic operations tool.
 */

import { Tool } from './registry.js';

export const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Performs basic arithmetic operations',
  parameters: {
    operation: {
      type: 'string',
      description: 'Operation: add, subtract, multiply, divide',
      required: true,
    },
    a: {
      type: 'number',
      description: 'First operand',
      required: true,
    },
    b: {
      type: 'number',
      description: 'Second operand',
      required: true,
    },
  },
  execute: async (input: Record<string, unknown>) => {
    const operation = String(input.operation);
    const a = Number(input.a);
    const b = Number(input.b);

    if (isNaN(a) || isNaN(b)) {
      throw new Error('Invalid operands: a and b must be numbers');
    }

    let result: number;

    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) throw new Error('Division by zero');
        result = a / b;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return { operation, a, b, result };
  },
};
