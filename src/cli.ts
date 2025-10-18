#!/usr/bin/env node

/**
 * TS2Go CLI
 * Command-line interface for TypeScript to Go transpiler
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as chalk from 'chalk';
import { glob } from 'glob';
import { Compiler } from './compiler/compiler';
import { CompilerOptions, defaultOptions, loadOptionsFromFile } from './config/options';
import { generateRuntime } from './runtime/runtime-generator';

const program = new Command();

program
  .name('ts2go')
  .description('TypeScript to Go transpiler with semantic preservation')
  .version('0.1.0');

// ============= Compile Command =============

program
  .command('compile')
  .description('Compile TypeScript file(s) to Go')
  .argument('<input>', 'Input TypeScript file or directory')
  .option('-o, --output <dir>', 'Output directory', './dist')
  .option('-c, --config <file>', 'Config file path', 'ts2go.json')
  .option('--number-strategy <strategy>', 'Number type mapping strategy (float64|int|contextual)', 'float64')
  .option('--union-strategy <strategy>', 'Union type mapping strategy (tagged|interface|any)', 'tagged')
  .option('--nullability-strategy <strategy>', 'Nullability strategy (pointer|zero|sqlNull)', 'pointer')
  .option('--async-strategy <strategy>', 'Async/await handling strategy (sync|future|errgroup)', 'sync')
  .option('--go-version <version>', 'Target Go version', '1.22')
  .option('--no-runtime', 'Do not generate runtime helpers')
  .option('--source-map', 'Generate source maps')
  .option('--strict', 'Enable strict mode')
  .option('--verbose', 'Verbose output')
  .action(async (input: string, options: any) => {
    try {
      console.log(chalk.blue('TS2Go Compiler v0.1.0\n'));

      // Load config file if exists
      let config: Partial<CompilerOptions> = { ...defaultOptions };
      if (fs.existsSync(options.config)) {
        config = await loadOptionsFromFile(options.config);
        if (options.verbose) {
          console.log(chalk.gray(`Loaded config from ${options.config}`));
        }
      }

      // Override with CLI options
      const compilerOptions: CompilerOptions = {
        ...config,
        input,
        output: options.output,
        numberStrategy: options.numberStrategy || config.numberStrategy,
        unionStrategy: options.unionStrategy || config.unionStrategy,
        nullabilityStrategy: options.nullabilityStrategy || config.nullabilityStrategy,
        asyncStrategy: options.asyncStrategy || config.asyncStrategy,
        goVersion: options.goVersion || config.goVersion,
        generateRuntime: options.runtime !== false,
        sourceMap: options.sourceMap || config.sourceMap,
        strict: options.strict || config.strict,
        verbose: options.verbose || config.verbose
      } as CompilerOptions;

      if (options.verbose) {
        console.log(chalk.gray('Compiler options:'));
        console.log(chalk.gray(JSON.stringify(compilerOptions, null, 2)));
        console.log();
      }

      // Create compiler
      const compiler = new Compiler(compilerOptions);

      // Check if input is file or directory
      const inputStat = fs.statSync(input);

      if (inputStat.isFile()) {
        // Single file compilation
        console.log(chalk.gray(`Compiling ${input}...`));
        const result = await compiler.compileFile(input);

        if (result.success) {
          const outputPath = path.join(
            options.output,
            path.basename(input, '.ts') + '.go'
          );

          // Ensure output directory exists
          const outputDir = path.dirname(outputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          fs.writeFileSync(outputPath, result.output as string);
          console.log(chalk.green(`✓ Compiled to ${outputPath}`));

          // Generate source map if requested
          if (result.sourceMap && compilerOptions.sourceMap) {
            const sourceMapPath = outputPath + '.map';
            fs.writeFileSync(sourceMapPath, result.sourceMap.toJSON());
            console.log(chalk.green(`✓ Generated source map: ${sourceMapPath}`));
          }
        } else {
          console.error(chalk.red('✗ Compilation failed:'));
          result.errors?.forEach(err => {
            console.error(chalk.red(`  ${err.message}`));
          });
          process.exit(1);
        }
      } else {
        // Directory compilation
        console.log(chalk.gray(`Compiling project ${input}...`));
        const result = await compiler.compileProject(input);

        if (result.success) {
          console.log(chalk.green(`✓ Compiled project to ${options.output}`));
        } else {
          console.error(chalk.red('✗ Compilation failed:'));
          result.errors?.forEach(err => {
            console.error(chalk.red(`  ${err.message}`));
          });
          process.exit(1);
        }
      }

      // Generate runtime if needed
      if (compilerOptions.generateRuntime) {
        console.log(chalk.gray('Generating runtime helpers...'));
        await generateRuntime(path.join(options.output, 'runtime'));
        console.log(chalk.green('✓ Generated runtime helpers'));
      }

      console.log(chalk.green('\n✓ Done!'));
    } catch (error: any) {
      console.error(chalk.red(`\n✗ Error: ${error.message}`));
      if (options.verbose && error.stack) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// ============= Watch Command =============

program
  .command('watch')
  .description('Watch TypeScript files and recompile on changes')
  .argument('<input>', 'Input TypeScript file or directory to watch')
  .option('-o, --output <dir>', 'Output directory', './dist')
  .option('-c, --config <file>', 'Config file path', 'ts2go.json')
  .option('--verbose', 'Verbose output')
  .action(async (input: string, options: any) => {
    try {
      console.log(chalk.blue('TS2Go Watch Mode\n'));
      console.log(chalk.gray(`Watching ${input} for changes...\n`));

      // Load config
      let config: Partial<CompilerOptions> = { ...defaultOptions };
      if (fs.existsSync(options.config)) {
        config = await loadOptionsFromFile(options.config);
      }

      const compilerOptions: CompilerOptions = {
        ...config,
        input,
        output: options.output,
        verbose: options.verbose
      } as CompilerOptions;

      const compiler = new Compiler(compilerOptions);

      // Watch for file changes
      const chokidar = require('chokidar');
      const watcher = chokidar.watch(input, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true
      });

      let compiling = false;

      const compile = async (filePath: string) => {
        if (compiling) return;
        compiling = true;

        try {
          console.log(chalk.gray(`\nChange detected: ${filePath}`));
          console.log(chalk.gray('Recompiling...'));

          const result = await compiler.compileFile(filePath);

          if (result.success) {
            const outputPath = path.join(
              options.output,
              path.basename(filePath, '.ts') + '.go'
            );
            fs.writeFileSync(outputPath, result.output as string);
            console.log(chalk.green(`✓ Compiled to ${outputPath}`));
          } else {
            console.error(chalk.red('✗ Compilation failed:'));
            result.errors?.forEach(err => {
              console.error(chalk.red(`  ${err.message}`));
            });
          }
        } catch (error: any) {
          console.error(chalk.red(`✗ Error: ${error.message}`));
        } finally {
          compiling = false;
        }
      };

      watcher
        .on('add', (filePath: string) => {
          if (filePath.endsWith('.ts')) {
            compile(filePath);
          }
        })
        .on('change', (filePath: string) => {
          if (filePath.endsWith('.ts')) {
            compile(filePath);
          }
        });

      // Keep process running
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n\nStopping watch mode...'));
        watcher.close();
        process.exit(0);
      });
    } catch (error: any) {
      console.error(chalk.red(`\n✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ============= Init Command =============

program
  .command('init')
  .description('Initialize a new ts2go.json config file')
  .option('-f, --force', 'Overwrite existing config')
  .action((options: any) => {
    const configPath = 'ts2go.json';

    if (fs.existsSync(configPath) && !options.force) {
      console.error(chalk.red(`✗ ${configPath} already exists. Use --force to overwrite.`));
      process.exit(1);
    }

    const defaultConfig = {
      numberStrategy: 'float64',
      unionStrategy: 'tagged',
      nullabilityStrategy: 'pointer',
      asyncStrategy: 'sync',
      errorHandling: 'return',
      goVersion: '1.22',
      generateRuntime: true,
      sourceMap: true,
      strict: true,
      optimizationLevel: 1
    };

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green(`✓ Created ${configPath}`));
  });

// ============= Info Command =============

program
  .command('info')
  .description('Show information about a TypeScript file')
  .argument('<file>', 'TypeScript file to analyze')
  .action(async (file: string) => {
    try {
      console.log(chalk.blue('TS2Go File Information\n'));

      const stat = fs.statSync(file);
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;

      console.log(chalk.gray('File:'), file);
      console.log(chalk.gray('Size:'), `${stat.size} bytes`);
      console.log(chalk.gray('Lines:'), lines);

      // Simple analysis
      const hasClasses = /class\s+\w+/.test(content);
      const hasInterfaces = /interface\s+\w+/.test(content);
      const hasGenerics = /<\w+>/.test(content);
      const hasAsync = /async\s+/.test(content);
      const hasUnion = /\w+\s*\|\s*\w+/.test(content);

      console.log(chalk.gray('\nFeatures detected:'));
      if (hasClasses) console.log(chalk.gray('  - Classes'));
      if (hasInterfaces) console.log(chalk.gray('  - Interfaces'));
      if (hasGenerics) console.log(chalk.gray('  - Generics'));
      if (hasAsync) console.log(chalk.gray('  - Async/Await'));
      if (hasUnion) console.log(chalk.gray('  - Union Types'));

      console.log();
    } catch (error: any) {
      console.error(chalk.red(`✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// ============= Generate Runtime Command =============

program
  .command('runtime')
  .description('Generate runtime helper package')
  .option('-o, --output <dir>', 'Output directory', './runtime')
  .option('-p, --package <name>', 'Package name', 'runtime')
  .action(async (options: any) => {
    try {
      console.log(chalk.blue('Generating runtime helpers...\n'));

      await generateRuntime(options.output, ['all'], options.package);

      console.log(chalk.green(`✓ Generated runtime package at ${options.output}`));
    } catch (error: any) {
      console.error(chalk.red(`✗ Error: ${error.message}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
