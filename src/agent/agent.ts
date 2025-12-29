/**
 * Agent Module
 *
 * Implements a simple plan-act-observe loop with tool calling.
 */

import { ToolRegistry } from '../tools/registry.js';

export interface AgentRequest {
  task: string;
  context: Record<string, unknown>;
}

export interface AgentStep {
  stepNumber: number;
  thought: string;
  action: { tool: string; input: Record<string, unknown> } | null;
  observation: string | null;
}

export interface AgentResponse {
  success: boolean;
  task: string;
  result: string;
  steps: AgentStep[];
  totalSteps: number;
  durationMs: number;
}

export interface AgentConfig {
  maxSteps: number;
  timeoutMs: number;
}

/**
 * Simple deterministic agent for demonstration.
 *
 * In production, this would:
 * - Call an LLM for planning
 * - Use more sophisticated tool selection
 * - Implement memory and context management
 */
export class Agent {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly config: AgentConfig
  ) {}

  async run(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const steps: AgentStep[] = [];
    let result = '';

    // v0: Simple pattern matching for demonstration
    // In production, this would use an LLM for planning

    const task = request.task.toLowerCase();

    // Check if task mentions a known tool
    const tools = this.registry.listTools();
    const mentionedTool = tools.find((t) => task.includes(t.name.toLowerCase()));

    if (mentionedTool) {
      // Execute the mentioned tool
      const step: AgentStep = {
        stepNumber: 1,
        thought: `Task mentions "${mentionedTool.name}" tool. Will execute it.`,
        action: { tool: mentionedTool.name, input: { text: request.task } },
        observation: null,
      };

      try {
        const toolResult = await mentionedTool.execute({ text: request.task });
        step.observation = JSON.stringify(toolResult);
        result = `Tool "${mentionedTool.name}" returned: ${step.observation}`;
      } catch (error) {
        step.observation = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
        result = step.observation;
      }

      steps.push(step);
    } else {
      // No specific tool mentioned, provide helpful response
      steps.push({
        stepNumber: 1,
        thought: 'No specific tool mentioned. Providing guidance.',
        action: null,
        observation: `Available tools: ${tools.map((t) => t.name).join(', ')}`,
      });
      result = `I can help with tasks using these tools: ${tools.map((t) => `${t.name} (${t.description})`).join(', ')}`;
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      task: request.task,
      result,
      steps,
      totalSteps: steps.length,
      durationMs,
    };
  }
}
