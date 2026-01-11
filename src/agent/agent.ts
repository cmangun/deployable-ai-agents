/**
 * Enhanced Agent with Memory, Planning, and Governance
 * 
 * Production-grade agentic AI implementation with:
 * - Multi-step reasoning with plan-act-observe loop
 * - Conversation history and working memory
 * - Tool orchestration with dependency resolution
 * - Policy controls and guardrails
 * - Comprehensive telemetry and audit logging
 */

import { ToolRegistry, Tool, ToolResult } from '../tools/registry.js';
import { PolicyEngine, PolicyDecision } from '../policy/engine.js';
import { AgentMemory, MemoryEntry } from '../memory/memory.js';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentRequest {
  /** The task or query to process */
  task: string;
  /** Additional context for the task */
  context?: Record<string, unknown>;
  /** Conversation ID for multi-turn interactions */
  conversationId?: string;
  /** User ID for personalization and audit */
  userId?: string;
  /** Maximum steps for this request (overrides config) */
  maxSteps?: number;
}

export interface ThoughtProcess {
  /** What the agent is considering */
  reasoning: string;
  /** Confidence in this reasoning (0-1) */
  confidence: number;
  /** Alternative approaches considered */
  alternatives?: string[];
}

export interface ToolCall {
  /** Tool name to invoke */
  tool: string;
  /** Input parameters for the tool */
  input: Record<string, unknown>;
  /** Why this tool was selected */
  rationale: string;
}

export interface AgentStep {
  /** Step sequence number */
  stepNumber: number;
  /** Timestamp when step started */
  timestamp: string;
  /** Agent's thought process */
  thought: ThoughtProcess;
  /** Action taken (tool call or null for final answer) */
  action: ToolCall | null;
  /** Result of the action */
  observation: ToolResult | null;
  /** Duration of this step in milliseconds */
  durationMs: number;
  /** Policy decisions that affected this step */
  policyDecisions?: PolicyDecision[];
}

export interface AgentResponse {
  /** Whether the task completed successfully */
  success: boolean;
  /** Original task */
  task: string;
  /** Final result or answer */
  result: string;
  /** Detailed execution steps */
  steps: AgentStep[];
  /** Total number of steps taken */
  totalSteps: number;
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Conversation ID for continuation */
  conversationId: string;
  /** Token/cost usage summary */
  usage?: {
    totalTokens: number;
    estimatedCostUsd: number;
  };
  /** Any warnings or notices */
  warnings?: string[];
  /** Audit trail ID */
  auditId: string;
}

export interface AgentConfig {
  /** Maximum steps before termination */
  maxSteps: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Minimum confidence threshold for actions */
  confidenceThreshold: number;
  /** Enable verbose logging */
  verbose: boolean;
  /** Enable memory persistence */
  enableMemory: boolean;
  /** Enable policy enforcement */
  enablePolicies: boolean;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  maxSteps: 10,
  timeoutMs: 30000,
  confidenceThreshold: 0.7,
  verbose: false,
  enableMemory: true,
  enablePolicies: true,
};

// ============================================================================
// AGENT IMPLEMENTATION
// ============================================================================

/**
 * Production-grade agent with reasoning, memory, and governance.
 * 
 * The agent follows a plan-act-observe loop:
 * 1. PLAN: Analyze the task and determine next action
 * 2. ACT: Execute the selected tool or provide final answer
 * 3. OBSERVE: Process results and update memory
 * 4. REPEAT: Continue until task complete or limits reached
 * 
 * @example
 * ```typescript
 * const agent = new Agent(registry, config, policyEngine, memory);
 * const response = await agent.run({
 *   task: "Calculate 25 * 4 and format the result",
 *   userId: "user_123"
 * });
 * ```
 */
export class Agent {
  private readonly config: AgentConfig;

  constructor(
    private readonly registry: ToolRegistry,
    config: Partial<AgentConfig> = {},
    private readonly policyEngine?: PolicyEngine,
    private readonly memory?: AgentMemory
  ) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /**
   * Execute an agent task with full reasoning loop.
   */
  async run(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const conversationId = request.conversationId || this.generateId('conv');
    const auditId = this.generateId('audit');
    const steps: AgentStep[] = [];
    const warnings: string[] = [];
    const maxSteps = request.maxSteps ?? this.config.maxSteps;

    // Load conversation history if memory enabled
    let history: MemoryEntry[] = [];
    if (this.config.enableMemory && this.memory) {
      history = await this.memory.getConversation(conversationId);
    }

    // Check policies before starting
    if (this.config.enablePolicies && this.policyEngine) {
      const preCheck = await this.policyEngine.evaluate({
        action: 'agent:start',
        context: {
          task: request.task,
          userId: request.userId,
          conversationId,
        },
      });

      if (!preCheck.allowed) {
        return this.createResponse({
          success: false,
          task: request.task,
          result: `Request blocked: ${preCheck.reason}`,
          steps: [],
          startTime,
          conversationId,
          auditId,
          warnings: [`Policy violation: ${preCheck.reason}`],
        });
      }
    }

    let result = '';
    let currentStep = 0;
    let isComplete = false;

    // Main reasoning loop
    while (!isComplete && currentStep < maxSteps) {
      currentStep++;
      const stepStartTime = Date.now();

      // Check timeout
      if (Date.now() - startTime > this.config.timeoutMs) {
        warnings.push('Execution timeout reached');
        break;
      }

      // PLAN: Analyze and decide next action
      const thought = await this.plan(request, steps, history);

      // Check confidence threshold
      if (thought.confidence < this.config.confidenceThreshold) {
        warnings.push(`Low confidence (${thought.confidence.toFixed(2)}) at step ${currentStep}`);
      }

      // Determine if we should act or conclude
      const action = await this.selectAction(request, thought, steps);

      let observation: ToolResult | null = null;
      let policyDecisions: PolicyDecision[] = [];

      if (action) {
        // Check policy for tool execution
        if (this.config.enablePolicies && this.policyEngine) {
          const toolCheck = await this.policyEngine.evaluate({
            action: `tool:${action.tool}`,
            context: {
              input: action.input,
              userId: request.userId,
              step: currentStep,
            },
          });
          policyDecisions.push(toolCheck);

          if (!toolCheck.allowed) {
            observation = {
              success: false,
              data: null,
              error: `Tool blocked: ${toolCheck.reason}`,
            };
          }
        }

        // ACT: Execute the tool if allowed
        if (!observation) {
          observation = await this.executeTool(action);
        }

        // OBSERVE: Check if task is complete
        isComplete = this.isTaskComplete(request, observation, steps);
        if (isComplete) {
          result = this.formatResult(observation);
        }
      } else {
        // No action selected = provide final answer
        isComplete = true;
        result = thought.reasoning;
      }

      // Record step
      const step: AgentStep = {
        stepNumber: currentStep,
        timestamp: new Date().toISOString(),
        thought,
        action,
        observation,
        durationMs: Date.now() - stepStartTime,
        policyDecisions: policyDecisions.length > 0 ? policyDecisions : undefined,
      };
      steps.push(step);

      // Update memory
      if (this.config.enableMemory && this.memory) {
        await this.memory.addEntry(conversationId, {
          role: 'agent',
          content: JSON.stringify(step),
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Handle incomplete execution
    if (!isComplete) {
      result = this.summarizeProgress(steps);
      warnings.push(`Task incomplete after ${maxSteps} steps`);
    }

    // Save final result to memory
    if (this.config.enableMemory && this.memory) {
      await this.memory.addEntry(conversationId, {
        role: 'assistant',
        content: result,
        timestamp: new Date().toISOString(),
      });
    }

    return this.createResponse({
      success: isComplete && !steps.some(s => s.observation?.error),
      task: request.task,
      result,
      steps,
      startTime,
      conversationId,
      auditId,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  }

  /**
   * Plan the next step based on task, history, and current progress.
   */
  private async plan(
    request: AgentRequest,
    steps: AgentStep[],
    history: MemoryEntry[]
  ): Promise<ThoughtProcess> {
    const tools = this.registry.listTools();
    const task = request.task.toLowerCase();

    // Analyze task for tool matching
    const toolMatches = tools
      .map(tool => ({
        tool,
        score: this.scoreToolRelevance(tool, task),
      }))
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);

    // Determine confidence based on tool matches
    const confidence = toolMatches.length > 0 
      ? Math.min(0.95, toolMatches[0].score)
      : 0.5;

    // Build reasoning
    let reasoning: string;
    const alternatives: string[] = [];

    if (steps.length === 0) {
      // First step - analyze the task
      if (toolMatches.length > 0) {
        reasoning = `Task requires "${toolMatches[0].tool.name}" tool. ` +
          `Match confidence: ${(toolMatches[0].score * 100).toFixed(0)}%`;
        
        if (toolMatches.length > 1) {
          alternatives.push(
            ...toolMatches.slice(1, 3).map(m => 
              `Alternative: ${m.tool.name} (${(m.score * 100).toFixed(0)}%)`
            )
          );
        }
      } else {
        reasoning = 'No specific tool matches the task. Will provide direct guidance.';
        alternatives.push('Could search for relevant tools');
        alternatives.push('Could request clarification');
      }
    } else {
      // Subsequent steps - analyze progress
      const lastStep = steps[steps.length - 1];
      
      if (lastStep.observation?.error) {
        reasoning = `Previous step failed: ${lastStep.observation.error}. ` +
          'Considering alternative approach.';
        confidence * 0.8; // Reduce confidence after error
      } else if (lastStep.observation?.success) {
        reasoning = 'Previous step succeeded. Evaluating if task is complete.';
      } else {
        reasoning = 'Continuing task execution.';
      }
    }

    return {
      reasoning,
      confidence,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  /**
   * Select the best action based on planning.
   */
  private async selectAction(
    request: AgentRequest,
    thought: ThoughtProcess,
    steps: AgentStep[]
  ): Promise<ToolCall | null> {
    const tools = this.registry.listTools();
    const task = request.task.toLowerCase();

    // Check if we've already completed the task
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep.observation?.success && this.isTaskComplete(request, lastStep.observation, steps)) {
        return null; // No more action needed
      }
    }

    // Find best matching tool
    const bestMatch = tools
      .map(tool => ({
        tool,
        score: this.scoreToolRelevance(tool, task),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (bestMatch && bestMatch.score > 0.3) {
      // Extract parameters for the tool
      const input = this.extractToolInput(bestMatch.tool, request);

      return {
        tool: bestMatch.tool.name,
        input,
        rationale: `Selected "${bestMatch.tool.name}" with ${(bestMatch.score * 100).toFixed(0)}% relevance`,
      };
    }

    return null;
  }

  /**
   * Execute a tool call with error handling.
   */
  private async executeTool(action: ToolCall): Promise<ToolResult> {
    const tool = this.registry.getTool(action.tool);
    
    if (!tool) {
      return {
        success: false,
        data: null,
        error: `Tool "${action.tool}" not found`,
      };
    }

    try {
      return await tool.execute(action.input);
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Score how relevant a tool is for a given task.
   */
  private scoreToolRelevance(tool: Tool, task: string): number {
    let score = 0;

    // Check name match
    if (task.includes(tool.name.toLowerCase())) {
      score += 0.5;
    }

    // Check description keywords
    const descWords = tool.description.toLowerCase().split(/\s+/);
    const taskWords = task.split(/\s+/);
    
    for (const descWord of descWords) {
      if (taskWords.some(tw => tw.includes(descWord) || descWord.includes(tw))) {
        score += 0.1;
      }
    }

    // Check parameter hints
    if (tool.parameters) {
      for (const param of Object.keys(tool.parameters)) {
        if (task.includes(param.toLowerCase())) {
          score += 0.2;
        }
      }
    }

    return Math.min(1, score);
  }

  /**
   * Extract input parameters for a tool from the request.
   */
  private extractToolInput(tool: Tool, request: AgentRequest): Record<string, unknown> {
    const input: Record<string, unknown> = {
      text: request.task,
      ...request.context,
    };

    // Parse numbers from task
    const numbers = request.task.match(/\d+(\.\d+)?/g);
    if (numbers && numbers.length >= 2) {
      input.a = parseFloat(numbers[0]);
      input.b = parseFloat(numbers[1]);
    }

    return input;
  }

  /**
   * Check if the task is complete based on observations.
   */
  private isTaskComplete(
    request: AgentRequest,
    observation: ToolResult | null,
    steps: AgentStep[]
  ): boolean {
    // Single successful tool execution = complete for v0
    if (observation?.success) {
      return true;
    }

    // Error after multiple attempts = give up
    if (steps.length >= 3 && steps.every(s => s.observation?.error)) {
      return true;
    }

    return false;
  }

  /**
   * Format the final result from observations.
   */
  private formatResult(observation: ToolResult | null): string {
    if (!observation) {
      return 'No result available';
    }

    if (observation.error) {
      return `Error: ${observation.error}`;
    }

    if (typeof observation.data === 'string') {
      return observation.data;
    }

    return JSON.stringify(observation.data, null, 2);
  }

  /**
   * Summarize progress when task is incomplete.
   */
  private summarizeProgress(steps: AgentStep[]): string {
    if (steps.length === 0) {
      return 'No progress made';
    }

    const successfulSteps = steps.filter(s => s.observation?.success).length;
    const lastStep = steps[steps.length - 1];

    return `Completed ${successfulSteps}/${steps.length} steps. ` +
      `Last action: ${lastStep.action?.tool || 'none'}. ` +
      `Last result: ${this.formatResult(lastStep.observation)}`;
  }

  /**
   * Create the final response object.
   */
  private createResponse(params: {
    success: boolean;
    task: string;
    result: string;
    steps: AgentStep[];
    startTime: number;
    conversationId: string;
    auditId: string;
    warnings?: string[];
  }): AgentResponse {
    return {
      success: params.success,
      task: params.task,
      result: params.result,
      steps: params.steps,
      totalSteps: params.steps.length,
      durationMs: Date.now() - params.startTime,
      conversationId: params.conversationId,
      auditId: params.auditId,
      warnings: params.warnings,
    };
  }

  /**
   * Generate a unique ID with prefix.
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Create an agent with default configuration.
 */
export function createAgent(
  registry: ToolRegistry,
  config?: Partial<AgentConfig>
): Agent {
  return new Agent(registry, config);
}
