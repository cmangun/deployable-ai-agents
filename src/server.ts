/**
 * Deployable AI Agent Service
 *
 * A production-ready agent server with tool calling, policy controls,
 * and observability hooks.
 */

import Fastify from 'fastify';
import { z } from 'zod';
import { config } from './config.js';
import { Agent, AgentRequest, AgentResponse } from './agent/agent.js';
import { ToolRegistry } from './tools/registry.js';
import { echoTool } from './tools/echoTool.js';
import { calculatorTool } from './tools/calculatorTool.js';

const app = Fastify({ logger: true });

// Initialize tool registry and agent
const registry = new ToolRegistry();
registry.register(echoTool);
registry.register(calculatorTool);

const agent = new Agent(registry, {
  maxSteps: config.maxAgentSteps,
  timeoutMs: config.agentTimeoutMs,
});

// Health check
app.get('/health', async () => {
  return { status: 'ok', version: '0.1.0', tools: registry.listTools().length };
});

// List available tools
app.get('/tools', async () => {
  return {
    tools: registry.listTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };
});

// Execute a single tool
const toolRequestSchema = z.object({
  tool: z.string(),
  input: z.record(z.unknown()),
});

app.post('/tool/:toolName', async (request, reply) => {
  const { toolName } = request.params as { toolName: string };
  const body = toolRequestSchema.parse(request.body);

  const tool = registry.getTool(toolName);
  if (!tool) {
    return reply.status(404).send({ error: `Tool not found: ${toolName}` });
  }

  try {
    const result = await tool.execute(body.input);
    return { tool: toolName, result };
  } catch (error) {
    return reply.status(400).send({
      error: error instanceof Error ? error.message : 'Tool execution failed',
    });
  }
});

// Run agent with a task
const agentRequestSchema = z.object({
  task: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});

app.post('/agent/run', async (request, reply) => {
  const body = agentRequestSchema.parse(request.body);

  const agentRequest: AgentRequest = {
    task: body.task,
    context: body.context || {},
  };

  try {
    const response = await agent.run(agentRequest);
    return response;
  } catch (error) {
    return reply.status(500).send({
      error: error instanceof Error ? error.message : 'Agent execution failed',
    });
  }
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`Agent server listening on http://0.0.0.0:${config.port}`);
    console.log(`Tools available: ${registry.listTools().map((t) => t.name).join(', ')}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export { app };
