/**
 * Tool Registry and Management
 * 
 * Provides a centralized registry for agent tools with:
 * - Tool registration and discovery
 * - Schema validation
 * - Execution tracking
 * - Dependency management
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ToolParameter {
  /** Parameter name */
  name: string;
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Description for the parameter */
  description: string;
  /** Whether the parameter is required */
  required: boolean;
  /** Default value if not provided */
  default?: unknown;
  /** Enum values for string type */
  enum?: string[];
  /** Minimum value for number type */
  minimum?: number;
  /** Maximum value for number type */
  maximum?: number;
}

export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Result data (any serializable value) */
  data: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution metadata */
  metadata?: {
    durationMs?: number;
    tokensUsed?: number;
    cached?: boolean;
  };
}

export interface Tool {
  /** Unique tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Parameter schema */
  parameters?: Record<string, ToolParameter>;
  /** Tool category for organization */
  category?: string;
  /** Whether tool is enabled */
  enabled: boolean;
  /** Tool version */
  version: string;
  /** Dependencies on other tools */
  dependencies?: string[];
  /** Execute the tool */
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolExecutionRecord {
  /** Tool name */
  tool: string;
  /** Input parameters */
  input: Record<string, unknown>;
  /** Execution result */
  result: ToolResult;
  /** Timestamp */
  timestamp: string;
  /** Duration in milliseconds */
  durationMs: number;
}

export interface ToolRegistryConfig {
  /** Enable execution tracking */
  enableTracking: boolean;
  /** Maximum tracked executions */
  maxTrackedExecutions: number;
  /** Validate inputs against schema */
  validateInputs: boolean;
}

export const DEFAULT_REGISTRY_CONFIG: ToolRegistryConfig = {
  enableTracking: true,
  maxTrackedExecutions: 1000,
  validateInputs: true,
};

// ============================================================================
// TOOL REGISTRY
// ============================================================================

/**
 * Central registry for agent tools.
 * 
 * Provides tool registration, discovery, and execution management.
 * Supports schema validation, dependency checking, and execution tracking.
 * 
 * @example
 * ```typescript
 * const registry = new ToolRegistry();
 * 
 * registry.register({
 *   name: 'calculator',
 *   description: 'Perform arithmetic operations',
 *   parameters: {
 *     operation: { name: 'operation', type: 'string', required: true, description: 'Operation type' },
 *     a: { name: 'a', type: 'number', required: true, description: 'First operand' },
 *     b: { name: 'b', type: 'number', required: true, description: 'Second operand' },
 *   },
 *   enabled: true,
 *   version: '1.0.0',
 *   execute: async (input) => {
 *     const { operation, a, b } = input;
 *     // ... implementation
 *   },
 * });
 * 
 * const result = await registry.execute('calculator', { operation: 'add', a: 2, b: 3 });
 * ```
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly executions: ToolExecutionRecord[] = [];
  private readonly config: ToolRegistryConfig;

  constructor(config: Partial<ToolRegistryConfig> = {}) {
    this.config = { ...DEFAULT_REGISTRY_CONFIG, ...config };
  }

  /**
   * Register a tool.
   */
  register(tool: Tool): void {
    // Validate dependencies
    if (tool.dependencies) {
      for (const dep of tool.dependencies) {
        if (!this.tools.has(dep)) {
          throw new Error(`Tool "${tool.name}" depends on unregistered tool "${dep}"`);
        }
      }
    }

    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool.
   */
  unregister(name: string): boolean {
    // Check if other tools depend on this one
    for (const tool of this.tools.values()) {
      if (tool.dependencies?.includes(name)) {
        throw new Error(`Cannot unregister "${name}": tool "${tool.name}" depends on it`);
      }
    }

    return this.tools.delete(name);
  }

  /**
   * Get a tool by name.
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists.
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools.
   */
  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category.
   */
  listByCategory(category: string): Tool[] {
    return Array.from(this.tools.values()).filter(t => t.category === category);
  }

  /**
   * Get all categories.
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    for (const tool of this.tools.values()) {
      if (tool.category) {
        categories.add(tool.category);
      }
    }
    return Array.from(categories);
  }

  /**
   * Enable or disable a tool.
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const tool = this.tools.get(name);
    if (tool) {
      tool.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Execute a tool with input validation.
   */
  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        data: null,
        error: `Tool "${name}" not found`,
      };
    }

    if (!tool.enabled) {
      return {
        success: false,
        data: null,
        error: `Tool "${name}" is disabled`,
      };
    }

    // Validate input
    if (this.config.validateInputs && tool.parameters) {
      const validationError = this.validateInput(tool.parameters, input);
      if (validationError) {
        return {
          success: false,
          data: null,
          error: validationError,
        };
      }
    }

    // Apply defaults
    const processedInput = this.applyDefaults(tool.parameters || {}, input);

    try {
      const result = await tool.execute(processedInput);
      const durationMs = Date.now() - startTime;

      // Track execution
      if (this.config.enableTracking) {
        this.trackExecution(name, processedInput, result, durationMs);
      }

      return {
        ...result,
        metadata: {
          ...result.metadata,
          durationMs,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const result: ToolResult = {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: { durationMs },
      };

      if (this.config.enableTracking) {
        this.trackExecution(name, processedInput, result, durationMs);
      }

      return result;
    }
  }

  /**
   * Validate input against parameter schema.
   */
  private validateInput(
    parameters: Record<string, ToolParameter>,
    input: Record<string, unknown>
  ): string | null {
    for (const [key, param] of Object.entries(parameters)) {
      const value = input[key];

      // Check required
      if (param.required && value === undefined) {
        return `Missing required parameter: ${key}`;
      }

      if (value !== undefined) {
        // Check type
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== param.type && param.type !== 'object') {
          return `Invalid type for "${key}": expected ${param.type}, got ${actualType}`;
        }

        // Check enum
        if (param.enum && !param.enum.includes(value as string)) {
          return `Invalid value for "${key}": must be one of ${param.enum.join(', ')}`;
        }

        // Check range for numbers
        if (param.type === 'number') {
          const num = value as number;
          if (param.minimum !== undefined && num < param.minimum) {
            return `Value for "${key}" must be >= ${param.minimum}`;
          }
          if (param.maximum !== undefined && num > param.maximum) {
            return `Value for "${key}" must be <= ${param.maximum}`;
          }
        }
      }
    }

    return null;
  }

  /**
   * Apply default values to input.
   */
  private applyDefaults(
    parameters: Record<string, ToolParameter>,
    input: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...input };

    for (const [key, param] of Object.entries(parameters)) {
      if (result[key] === undefined && param.default !== undefined) {
        result[key] = param.default;
      }
    }

    return result;
  }

  /**
   * Track tool execution.
   */
  private trackExecution(
    tool: string,
    input: Record<string, unknown>,
    result: ToolResult,
    durationMs: number
  ): void {
    this.executions.push({
      tool,
      input,
      result,
      timestamp: new Date().toISOString(),
      durationMs,
    });

    // Trim executions
    while (this.executions.length > this.config.maxTrackedExecutions) {
      this.executions.shift();
    }
  }

  /**
   * Get execution history.
   */
  getExecutions(options: {
    tool?: string;
    limit?: number;
    since?: string;
  } = {}): ToolExecutionRecord[] {
    let results = [...this.executions];

    if (options.tool) {
      results = results.filter(e => e.tool === options.tool);
    }

    if (options.since) {
      const sinceTime = new Date(options.since).getTime();
      results = results.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    if (options.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Get execution statistics.
   */
  getStats(): {
    totalExecutions: number;
    successRate: number;
    averageDurationMs: number;
    byTool: Record<string, { count: number; successRate: number; avgDurationMs: number }>;
  } {
    const byTool: Record<string, { count: number; successes: number; totalDuration: number }> = {};

    for (const exec of this.executions) {
      if (!byTool[exec.tool]) {
        byTool[exec.tool] = { count: 0, successes: 0, totalDuration: 0 };
      }
      byTool[exec.tool].count++;
      if (exec.result.success) {
        byTool[exec.tool].successes++;
      }
      byTool[exec.tool].totalDuration += exec.durationMs;
    }

    const totalExecutions = this.executions.length;
    const totalSuccesses = this.executions.filter(e => e.result.success).length;
    const totalDuration = this.executions.reduce((sum, e) => sum + e.durationMs, 0);

    return {
      totalExecutions,
      successRate: totalExecutions > 0 ? totalSuccesses / totalExecutions : 0,
      averageDurationMs: totalExecutions > 0 ? totalDuration / totalExecutions : 0,
      byTool: Object.fromEntries(
        Object.entries(byTool).map(([tool, stats]) => [
          tool,
          {
            count: stats.count,
            successRate: stats.count > 0 ? stats.successes / stats.count : 0,
            avgDurationMs: stats.count > 0 ? stats.totalDuration / stats.count : 0,
          },
        ])
      ),
    };
  }

  /**
   * Clear execution history.
   */
  clearExecutions(): void {
    this.executions.length = 0;
  }

  /**
   * Export registry configuration.
   */
  export(): {
    tools: Array<Omit<Tool, 'execute'>>;
    config: ToolRegistryConfig;
  } {
    return {
      tools: Array.from(this.tools.values()).map(({ execute, ...rest }) => rest),
      config: this.config,
    };
  }
}

// ============================================================================
// BUILT-IN TOOLS
// ============================================================================

/**
 * Echo tool - returns the input text.
 */
export const echoTool: Tool = {
  name: 'echo',
  description: 'Echo back the input text',
  category: 'utility',
  enabled: true,
  version: '1.0.0',
  parameters: {
    text: {
      name: 'text',
      type: 'string',
      description: 'Text to echo',
      required: true,
    },
  },
  execute: async (input) => ({
    success: true,
    data: input.text,
  }),
};

/**
 * Calculator tool - perform arithmetic operations.
 */
export const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Perform arithmetic calculations',
  category: 'math',
  enabled: true,
  version: '1.0.0',
  parameters: {
    operation: {
      name: 'operation',
      type: 'string',
      description: 'Operation to perform',
      required: true,
      enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt', 'modulo'],
    },
    a: {
      name: 'a',
      type: 'number',
      description: 'First operand',
      required: true,
    },
    b: {
      name: 'b',
      type: 'number',
      description: 'Second operand (not required for sqrt)',
      required: false,
    },
  },
  execute: async (input) => {
    const { operation, a, b } = input as { operation: string; a: number; b?: number };

    let result: number;

    switch (operation) {
      case 'add':
        result = a + (b ?? 0);
        break;
      case 'subtract':
        result = a - (b ?? 0);
        break;
      case 'multiply':
        result = a * (b ?? 1);
        break;
      case 'divide':
        if (b === 0) {
          return { success: false, data: null, error: 'Division by zero' };
        }
        result = a / (b ?? 1);
        break;
      case 'power':
        result = Math.pow(a, b ?? 2);
        break;
      case 'sqrt':
        if (a < 0) {
          return { success: false, data: null, error: 'Cannot take square root of negative number' };
        }
        result = Math.sqrt(a);
        break;
      case 'modulo':
        if (b === 0) {
          return { success: false, data: null, error: 'Modulo by zero' };
        }
        result = a % (b ?? 1);
        break;
      default:
        return { success: false, data: null, error: `Unknown operation: ${operation}` };
    }

    return { success: true, data: result };
  },
};

/**
 * JSON tool - parse and stringify JSON.
 */
export const jsonTool: Tool = {
  name: 'json',
  description: 'Parse or stringify JSON',
  category: 'utility',
  enabled: true,
  version: '1.0.0',
  parameters: {
    operation: {
      name: 'operation',
      type: 'string',
      description: 'Operation to perform',
      required: true,
      enum: ['parse', 'stringify'],
    },
    input: {
      name: 'input',
      type: 'string',
      description: 'Input string (JSON for parse, object for stringify)',
      required: true,
    },
  },
  execute: async (input) => {
    const { operation, input: data } = input as { operation: string; input: string };

    try {
      if (operation === 'parse') {
        return { success: true, data: JSON.parse(data) };
      } else {
        return { success: true, data: JSON.stringify(data, null, 2) };
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'JSON error',
      };
    }
  },
};

/**
 * Date tool - get current date/time or parse dates.
 */
export const dateTool: Tool = {
  name: 'date',
  description: 'Get current date/time or parse dates',
  category: 'utility',
  enabled: true,
  version: '1.0.0',
  parameters: {
    operation: {
      name: 'operation',
      type: 'string',
      description: 'Operation to perform',
      required: true,
      enum: ['now', 'parse', 'format', 'diff'],
    },
    input: {
      name: 'input',
      type: 'string',
      description: 'Input date string (for parse/format/diff)',
      required: false,
    },
    input2: {
      name: 'input2',
      type: 'string',
      description: 'Second date string (for diff)',
      required: false,
    },
    format: {
      name: 'format',
      type: 'string',
      description: 'Output format (iso, unix, readable)',
      required: false,
      default: 'iso',
      enum: ['iso', 'unix', 'readable'],
    },
  },
  execute: async (input) => {
    const { operation, input: dateStr, input2, format = 'iso' } = input as {
      operation: string;
      input?: string;
      input2?: string;
      format?: string;
    };

    try {
      let date: Date;

      if (operation === 'now') {
        date = new Date();
      } else if (operation === 'parse' && dateStr) {
        date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return { success: false, data: null, error: 'Invalid date string' };
        }
      } else if (operation === 'diff' && dateStr && input2) {
        const d1 = new Date(dateStr);
        const d2 = new Date(input2);
        const diffMs = Math.abs(d2.getTime() - d1.getTime());
        return {
          success: true,
          data: {
            milliseconds: diffMs,
            seconds: Math.floor(diffMs / 1000),
            minutes: Math.floor(diffMs / 60000),
            hours: Math.floor(diffMs / 3600000),
            days: Math.floor(diffMs / 86400000),
          },
        };
      } else {
        return { success: false, data: null, error: 'Invalid operation or missing input' };
      }

      let result: string | number;
      switch (format) {
        case 'unix':
          result = Math.floor(date.getTime() / 1000);
          break;
        case 'readable':
          result = date.toLocaleString();
          break;
        default:
          result = date.toISOString();
      }

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Date error',
      };
    }
  },
};

/**
 * Create a registry with default tools.
 */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(echoTool);
  registry.register(calculatorTool);
  registry.register(jsonTool);
  registry.register(dateTool);
  return registry;
}
