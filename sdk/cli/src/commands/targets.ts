/**
 * aeos-sdk targets
 *
 * Lists all available AEOS adapter targets that can be used with
 * `aeos-sdk generate --adapter <name>`.
 *
 * Usage:
 *   aeos-sdk targets
 *
 * Expected behavior (not yet implemented — currently prints static list):
 *   1. Read the sdk/adapters/ directory to discover available adapters
 *   2. For each adapter, check its package.json for name + version
 *   3. Print a formatted table of adapter name, package, status, and version
 */

import type { Command } from 'commander';

// Static registry of known adapter targets.
// TODO: replace with dynamic discovery from sdk/adapters/ directory.
const ADAPTER_TARGETS: Array<{
  name: string;
  package: string;
  framework: string;
  status: 'available' | 'planned';
}> = [
  { name: 'anthropic', package: '@aeos/adapter-anthropic', framework: 'Anthropic SDK', status: 'available' },
  { name: 'openai', package: '@aeos/sdk-adapter-openai', framework: 'OpenAI SDK', status: 'available' },
  { name: 'bedrock', package: '@aeos/sdk-adapter-bedrock', framework: 'AWS Bedrock', status: 'available' },
  { name: 'vertex', package: '@aeos/sdk-adapter-vertex', framework: 'Google Vertex AI', status: 'planned' },
  { name: 'agentforce', package: '@aeos/sdk-adapter-agentforce', framework: 'Salesforce AgentForce', status: 'planned' },
  { name: 'langgraph', package: '@aeos/sdk-adapter-langgraph', framework: 'LangGraph', status: 'planned' },
  { name: 'crewai', package: '@aeos/sdk-adapter-crewai', framework: 'CrewAI', status: 'planned' },
  { name: 'human-workflow', package: '@aeos/sdk-adapter-human-workflow', framework: 'Human-in-the-loop', status: 'planned' },
];

export function registerTargetsCommand(program: Command): void {
  program
    .command('targets')
    .description('List all available AEOS adapter targets')
    .action(() => {
      // TODO: replace static list with dynamic discovery from sdk/adapters/ dir
      // Steps:
      //   1. fs.readdirSync(path.join(__dirname, '../../../adapters'))
      //   2. For each subdirectory, read package.json
      //   3. Merge with planned targets list
      //   4. Print sorted table

      console.log('');
      console.log('AEOS SDK — Available adapter targets');
      console.log('');
      console.log(
        padRow('NAME', 'FRAMEWORK', 'PACKAGE', 'STATUS'),
      );
      console.log('─'.repeat(90));

      for (const target of ADAPTER_TARGETS) {
        console.log(padRow(target.name, target.framework, target.package, target.status));
      }

      console.log('');
      console.log(`Use: aeos-sdk generate --adapter <name> --output <dir>`);
      console.log('');
      process.exit(0);
    });
}

function padRow(name: string, framework: string, pkg: string, status: string): string {
  return `  ${name.padEnd(18)}${framework.padEnd(26)}${pkg.padEnd(36)}${status}`;
}
