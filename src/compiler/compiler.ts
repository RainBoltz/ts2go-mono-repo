/**
 * 主編譯器介面
 */

import * as ts from 'typescript';
import { Module } from '../ir/nodes';
import { CompilerOptions } from '../config/options';
import { TypeScriptParser } from '../frontend/parser';
import { IRTransformer } from '../ir/transformer';
import { GoCodeGenerator } from '../backend/go-generator';
import { CompilationResult, CompilationError, GoProject, CompilationStatistics } from './result';
import { IROptimizer } from '../optimizer/optimizer';

export class Compiler {
  private parser: TypeScriptParser;
  private transformer: IRTransformer;
  private generator: GoCodeGenerator;
  private optimizer: IROptimizer;

  constructor(private options: CompilerOptions) {
    this.parser = new TypeScriptParser(options);
    this.transformer = new IRTransformer(options, this.parser);
    this.generator = new GoCodeGenerator(options);
    this.optimizer = new IROptimizer(options);
  }

  /**
   * 編譯單一 TypeScript 檔案
   */
  async compileFile(filePath: string): Promise<CompilationResult> {
    try {
      // 階段 1: 解析 TypeScript AST
      const tsAst = await this.parser.parseFile(filePath);

      // 階段 2: 轉換為 IR
      const irModule = await this.transformer.transform(tsAst);

      // 階段 3: IR 優化與正規化
      const optimizedIR = await this.optimizeIR(irModule);

      // 階段 4: 產生 Go 程式碼
      const generated = this.generator.generate(optimizedIR);

      return {
        success: true,
        output: generated.code,
        sourceMap: generated.sourceMap,
        warnings: this.collectWarnings(),
        statistics: this.collectStatistics()
      };
    } catch (error) {
      return {
        success: false,
        errors: [this.wrapError(error as Error)],
        warnings: this.collectWarnings()
      };
    }
  }

  /**
   * 編譯整個 TypeScript 專案
   */
  async compileProject(projectPath: string): Promise<CompilationResult> {
    try {
      // 階段 1: 分析專案結構
      const project = await this.parser.analyzeProject(projectPath);

      // 階段 2: 批次轉換所有模組
      const modules: Module[] = [];
      for (const file of project.files) {
        const tsAst = await this.parser.parseFile(file);
        const irModule = await this.transformer.transform(tsAst);
        modules.push(irModule);
      }

      // 階段 3: 解析模組相依性
      const resolvedModules = await this.resolveModuleDependencies(modules);

      // 階段 4: 批次產生 Go 程式碼
      const goFiles = resolvedModules.map(m => this.generator.generate(m));

      const filesMap = new Map<string, string>();
      goFiles.forEach((file, index) => {
        filesMap.set(resolvedModules[index].path, file.code);
      });

      const goProject: GoProject = {
        goMod: 'module generated\n\ngo 1.21',
        files: filesMap
      };

      return {
        success: true,
        output: goProject,
        warnings: this.collectWarnings(),
        statistics: this.collectStatistics()
      };
    } catch (error) {
      return {
        success: false,
        errors: [this.wrapError(error as Error)],
        warnings: this.collectWarnings()
      };
    }
  }

  /**
   * IR 優化階段
   */
  private async optimizeIR(module: Module): Promise<Module> {
    return this.optimizer.optimize(module);
  }

  /**
   * 解析模組相依性
   */
  private async resolveModuleDependencies(modules: Module[]): Promise<Module[]> {
    // TODO: 實作模組相依性解析
    // - 建立相依圖
    // - 拓樸排序
    // - 循環相依檢測
    return modules;
  }

  private collectWarnings(): CompilationError[] {
    // TODO: 收集來自各階段的警告
    return [];
  }

  private collectStatistics(): CompilationStatistics {
    // TODO: 收集編譯統計資訊
    return {
      filesProcessed: 0,
      linesOfCode: 0,
      compilationTime: 0
    };
  }

  private wrapError(error: Error): CompilationError {
    return {
      code: 'E0000',
      message: error.message,
      location: undefined,
      severity: 'error'
    };
  }
}

/**
 * 編譯管線介面
 */
export interface CompilationPipeline {
  /**
   * 前端: TypeScript → IR
   */
  parse(source: string | ts.SourceFile): Promise<Module>;

  /**
   * 中端: IR 轉換與優化
   */
  transform(module: Module): Promise<Module>;

  /**
   * 後端: IR → Go
   */
  generate(module: Module): Promise<string>;
}