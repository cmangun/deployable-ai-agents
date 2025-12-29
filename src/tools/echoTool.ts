/**
 * Echo Tool
 *
 * Simple tool that echoes input back. Used for testing.
 */

import { Tool } from './registry.js';

export const echoTool: Tool = {
  name: 'echo',
  description: 'Echoes the input text back',
  parameters: {
    text: {
      type: 'string',
      description: 'Text to echo',
      required: true,
    },
  },
  execute: async (input: Record<string, unknown>) => {
    const text = String(input.text || '');
    return { echoed: text, timestamp: new Date().toISOString() };
  },
};
