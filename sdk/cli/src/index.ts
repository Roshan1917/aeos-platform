#!/usr/bin/env node
/**
 * aeos-sdk CLI
 *
 * Build-time tool for working with AEOS Agent Adapter SDK.
 * Generates adapter bindings, validates implementations, and lists available targets.
 *
 * Usage:
 *   aeos-sdk generate --adapter <name> --output <dir>
 *   aeos-sdk validate <adapter-file>
 *   aeos-sdk targets
 */

import { Command } from 'commander';
import { registerGenerateCommand } from './commands/generate.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerTargetsCommand } from './commands/targets.js';

const program = new Command();

program
  .name('aeos-sdk')
  .description('AEOS Agent Adapter SDK CLI')
  .version('0.1.0');

registerGenerateCommand(program);
registerValidateCommand(program);
registerTargetsCommand(program);

program.parse(process.argv);
