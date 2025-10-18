/**
 * TypeScript Parser - 使用 TypeScript Compiler API
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { Module } from '../ir/nodes';
import { CompilerOptions } from '../config/options';
import { SourceLocation, Position } from '../ir/location';

export interface ProjectInfo {
  files: string[];
  rootDir: string;
  tsConfig?: ts.ParsedCommandLine;
}

export class TypeScriptParser {
  private program?: ts.Program;
  private typeChecker?: ts.TypeChecker;

  constructor(private options: CompilerOptions) {}

  /**
   * 解析單一 TypeScript 檔案
   */
  async parseFile(filePath: string): Promise<ts.SourceFile> {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const sourceText = fs.readFileSync(absolutePath, 'utf-8');

    // 建立單檔案程式
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      lib: ['es2022']
    };

    const sourceFile = ts.createSourceFile(
      absolutePath,
      sourceText,
      ts.ScriptTarget.ES2022,
      true
    );

    // 建立程式以取得型別資訊
    this.program = ts.createProgram([absolutePath], compilerOptions);
    this.typeChecker = this.program.getTypeChecker();

    return this.program.getSourceFile(absolutePath)!;
  }

  /**
   * 分析整個 TypeScript 專案
   */
  async analyzeProject(projectPath: string): Promise<ProjectInfo> {
    const absolutePath = path.resolve(projectPath);

    // 尋找 tsconfig.json
    const configPath = ts.findConfigFile(
      absolutePath,
      ts.sys.fileExists,
      'tsconfig.json'
    );

    let parsedConfig: ts.ParsedCommandLine | undefined;
    let files: string[] = [];

    if (configPath) {
      // 解析 tsconfig.json
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
      );
      files = parsedConfig.fileNames;
    } else {
      // 沒有 tsconfig.json，掃描所有 .ts 檔案
      files = this.scanTypeScriptFiles(absolutePath);
    }

    // 建立程式
    const compilerOptions = parsedConfig?.options || {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    };

    this.program = ts.createProgram(files, compilerOptions);
    this.typeChecker = this.program.getTypeChecker();

    // 檢查編譯錯誤
    const diagnostics = [
      ...this.program.getSyntacticDiagnostics(),
      ...this.program.getSemanticDiagnostics()
    ];

    if (diagnostics.length > 0 && this.options.strict) {
      this.reportDiagnostics(diagnostics);
    }

    return {
      files,
      rootDir: absolutePath,
      tsConfig: parsedConfig
    };
  }

  /**
   * 取得 TypeChecker 實例
   */
  getTypeChecker(): ts.TypeChecker {
    if (!this.typeChecker) {
      throw new Error('TypeChecker not initialized. Parse a file or project first.');
    }
    return this.typeChecker;
  }

  /**
   * 取得 Program 實例
   */
  getProgram(): ts.Program {
    if (!this.program) {
      throw new Error('Program not initialized. Parse a file or project first.');
    }
    return this.program;
  }

  /**
   * 將 TypeScript AST 位置轉換為我們的 SourceLocation
   */
  getSourceLocation(node: ts.Node): SourceLocation {
    const sourceFile = node.getSourceFile();
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return new SourceLocation(
      sourceFile.fileName,
      new Position(start.line + 1, start.character + 1, node.getStart()),
      new Position(end.line + 1, end.character + 1, node.getEnd())
    );
  }

  /**
   * 取得節點的型別資訊
   */
  getTypeOfNode(node: ts.Node): ts.Type | undefined {
    if (!this.typeChecker) {
      return undefined;
    }

    try {
      return this.typeChecker.getTypeAtLocation(node);
    } catch {
      return undefined;
    }
  }

  /**
   * 取得符號資訊
   */
  getSymbolOfNode(node: ts.Node): ts.Symbol | undefined {
    if (!this.typeChecker) {
      return undefined;
    }

    try {
      return this.typeChecker.getSymbolAtLocation(node);
    } catch {
      return undefined;
    }
  }

  /**
   * 檢查節點是否被匯出
   */
  isExported(node: ts.Node): boolean {
    return !!(ts.getCombinedModifierFlags(node as any) & ts.ModifierFlags.Export);
  }

  /**
   * 檢查節點是否為預設匯出
   */
  isDefaultExport(node: ts.Node): boolean {
    return !!(ts.getCombinedModifierFlags(node as any) & ts.ModifierFlags.Default);
  }

  /**
   * 取得節點的修飾符
   */
  getModifiers(node: ts.Node): Set<string> {
    const modifiers = new Set<string>();
    const flags = ts.getCombinedModifierFlags(node as any);

    if (flags & ts.ModifierFlags.Export) modifiers.add('export');
    if (flags & ts.ModifierFlags.Default) modifiers.add('default');
    if (flags & ts.ModifierFlags.Public) modifiers.add('public');
    if (flags & ts.ModifierFlags.Private) modifiers.add('private');
    if (flags & ts.ModifierFlags.Protected) modifiers.add('protected');
    if (flags & ts.ModifierFlags.Static) modifiers.add('static');
    if (flags & ts.ModifierFlags.Readonly) modifiers.add('readonly');
    if (flags & ts.ModifierFlags.Async) modifiers.add('async');
    if (flags & ts.ModifierFlags.Const) modifiers.add('const');
    if (flags & ts.ModifierFlags.Abstract) modifiers.add('abstract');

    return modifiers;
  }

  /**
   * 掃描目錄中的所有 TypeScript 檔案
   */
  private scanTypeScriptFiles(dir: string): string[] {
    const files: string[] = [];

    function scan(currentDir: string) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // 忽略 node_modules 和隱藏目錄
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scan(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    }

    scan(dir);
    return files;
  }

  /**
   * 報告診斷訊息
   */
  private reportDiagnostics(diagnostics: readonly ts.Diagnostic[]) {
    const formatHost: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: path => path,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine
    };

    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost);
    console.error(message);

    if (this.options.strict) {
      throw new Error(`TypeScript compilation errors found`);
    }
  }

  /**
   * 取得 AST 節點的文字內容
   */
  getNodeText(node: ts.Node): string {
    return node.getText();
  }

  /**
   * 取得識別符名稱
   */
  getIdentifierName(node: ts.Node): string | undefined {
    if (ts.isIdentifier(node)) {
      return node.text;
    }
    return undefined;
  }

  /**
   * 遍歷 AST
   */
  visitNode(node: ts.Node, visitor: (node: ts.Node) => void) {
    visitor(node);
    ts.forEachChild(node, child => this.visitNode(child, visitor));
  }

  /**
   * 取得檔案的所有匯入
   */
  getImports(sourceFile: ts.SourceFile): ts.ImportDeclaration[] {
    const imports: ts.ImportDeclaration[] = [];

    ts.forEachChild(sourceFile, node => {
      if (ts.isImportDeclaration(node)) {
        imports.push(node);
      }
    });

    return imports;
  }

  /**
   * 取得檔案的所有匯出
   */
  getExports(sourceFile: ts.SourceFile): ts.ExportDeclaration[] {
    const exports: ts.ExportDeclaration[] = [];

    ts.forEachChild(sourceFile, node => {
      if (ts.isExportDeclaration(node)) {
        exports.push(node);
      }
    });

    return exports;
  }

  /**
   * 檢查型別相容性
   */
  isTypeAssignableTo(source: ts.Type, target: ts.Type): boolean {
    if (!this.typeChecker) {
      return false;
    }

    return this.typeChecker.isTypeAssignableTo(source, target);
  }

  /**
   * 解析型別字串
   */
  getTypeString(type: ts.Type): string {
    if (!this.typeChecker) {
      return 'unknown';
    }

    return this.typeChecker.typeToString(type);
  }
}