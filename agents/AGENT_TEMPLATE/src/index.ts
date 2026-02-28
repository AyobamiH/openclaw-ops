#!/usr/bin/env node

/**
 * Agent Template - Main Entry Point
 * 
 * This is the starting point for all agent execution.
 * Modify this file to implement your agent's logic.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as Skills from '../../../skills/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../agent.config.json');

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  permissions: {
    skills: Record<string, any>;
  };
}

let agentConfig: AgentConfig;

/**
 * Load agent configuration
 */
async function loadConfig(): Promise<void> {
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    agentConfig = JSON.parse(configContent);
    console.log(`[${agentConfig.id}] Configuration loaded`);
  } catch (error: any) {
    console.error('Failed to load agent config:', error.message);
    process.exit(1);
  }
}

/**
 * Check if a skill is allowed for this agent
 */
function canUseSkill(skillId: string): boolean {
  const skillPerms = agentConfig.permissions.skills[skillId];
  return skillPerms && skillPerms.allowed === true;
}

/**
 * Main agent handler
 * 
 * This function receives a task from the orchestrator and must:
 * 1. Validate the request
 * 2. Execute the task using allowed skills
 * 3. Return structured results
 * 4. Handle errors gracefully
 */
async function handleTask(task: any): Promise<any> {
  const agentId = agentConfig.id;
  const taskId = task.id || 'unknown';

  console.log(`[${agentId}] Starting task: ${taskId}`);
  console.log(`[${agentId}] Input:`, JSON.stringify(task.input).substring(0, 200));

  try {
    // CUSTOMIZE THIS SECTION FOR YOUR AGENT
    // Example: Fetch and parse a document
    
    // Step 1: Validate input
    if (!task.input || typeof task.input !== 'object') {
      return {
        taskId,
        success: false,
        error: 'Invalid input format',
      };
    }

    // Step 2: Use allowed skills
    const results: any[] = [];

    // Example skill usage (adjust based on your agent's purpose)
    if (task.input.url && canUseSkill('sourceFetch')) {
      console.log(`[${agentId}] Fetching: ${task.input.url}`);
      
      const fetchResult = await Skills.executeSkill('sourceFetch', {
        url: task.input.url,
        timeout: 10000,
      }, agentId);

      if (!fetchResult.success) {
        return {
          taskId,
          success: false,
          error: `Fetch failed: ${fetchResult.error}`,
        };
      }

      results.push({
        skill: 'sourceFetch',
        success: true,
        data: {
          statusCode: fetchResult.data?.statusCode,
          contentLength: fetchResult.data?.content?.length,
        },
      });
    }

    // Step 3: Return results
    console.log(`[${agentId}] Task completed: ${taskId}`);
    return {
      taskId,
      success: true,
      agentId,
      results,
      completedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`[${agentId}] Error in task ${taskId}:`, error.message);
    return {
      taskId,
      success: false,
      error: error.message,
      agentId,
    };
  }
}

/**
 * Startup sequence
 */
async function main(): Promise<void> {
  console.log('Agent Template is starting...');

  // Load configuration
  await loadConfig();

  // TODO: Connect to orchestrator
  // TODO: Register with agent registry
  // TODO: Start heartbeat monitor
  // TODO: Listen for tasks

  // For now, just show that we're ready
  console.log(`[${agentConfig.id}] Ready to accept tasks`);

  // Example: Process a task from stdin (for testing)
  if (process.argv[2]) {
    try {
      const taskInput = JSON.parse(process.argv[2]);
      const result = await handleTask(taskInput);
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
}

// Run main
main().catch(console.error);

// Export for testing
export { handleTask, loadConfig, canUseSkill };
