/**
 * Golden Test Helper
 * 用於比對生成的 Go 程式碼與預期的 Go 程式碼
 */

import * as fs from 'fs';
import * as path from 'path';
import { Compiler } from '../../src/compiler/compiler';
import { CompilerOptions, defaultOptions } from '../../src/config/options';

export interface GoldenTestCase {
  name: string;
  inputFile: string;
  expectedFile: string;
  options?: Partial<CompilerOptions>;
}

export class GoldenTestRunner {
  private goldenDir: string;
  private expectedDir: string;

  constructor(
    goldenDir: string = path.join(__dirname, '../golden'),
    expectedDir: string = path.join(__dirname, '../golden/expected')
  ) {
    this.goldenDir = goldenDir;
    this.expectedDir = expectedDir;
  }

  /**
   * 執行單一黃金測試
   */
  async runGoldenTest(testCase: GoldenTestCase): Promise<GoldenTestResult> {
    const inputPath = path.join(this.goldenDir, testCase.inputFile);
    const expectedPath = path.join(this.expectedDir, testCase.expectedFile);

    // 讀取預期輸出
    const expectedCode = fs.readFileSync(expectedPath, 'utf-8');

    // 編譯 TypeScript 到 Go
    const options: CompilerOptions = {
      ...defaultOptions,
      ...testCase.options,
      input: inputPath,
      output: '/tmp'
    } as CompilerOptions;

    const compiler = new Compiler(options);
    const result = await compiler.compileFile(inputPath);

    if (!result.success) {
      return {
        passed: false,
        name: testCase.name,
        errors: result.errors || [],
        expected: expectedCode,
        actual: ''
      };
    }

    const generatedCode = typeof result.output === 'string' ? result.output : '';

    // 比對生成的程式碼與預期的程式碼
    const comparison = this.compareCode(generatedCode, expectedCode);

    return {
      passed: comparison.match,
      name: testCase.name,
      expected: expectedCode,
      actual: generatedCode,
      diff: comparison.diff
    };
  }

  /**
   * 批次執行黃金測試
   */
  async runAllGoldenTests(): Promise<GoldenTestSummary> {
    const testCases = this.discoverTestCases();
    const results: GoldenTestResult[] = [];

    for (const testCase of testCases) {
      const result = await this.runGoldenTest(testCase);
      results.push(result);
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      results
    };
  }

  /**
   * 自動發現測試案例
   */
  private discoverTestCases(): GoldenTestCase[] {
    const testFiles = fs.readdirSync(this.goldenDir)
      .filter(file => file.endsWith('.ts') && !file.includes('node_modules'));

    return testFiles.map(file => {
      const baseName = path.basename(file, '.ts');
      return {
        name: baseName,
        inputFile: file,
        expectedFile: `${baseName}.go`
      };
    });
  }

  /**
   * 比對程式碼
   */
  private compareCode(actual: string, expected: string): CodeComparison {
    const normalizedActual = this.normalizeCode(actual);
    const normalizedExpected = this.normalizeCode(expected);

    if (normalizedActual === normalizedExpected) {
      return { match: true };
    }

    // 產生 diff
    const diff = this.generateDiff(normalizedActual, normalizedExpected);

    return {
      match: false,
      diff
    };
  }

  /**
   * 正規化程式碼（用於比對）
   */
  private normalizeCode(code: string): string {
    return code
      .split('\n')
      .map(line => line.trimEnd()) // 移除行尾空白
      .filter(line => line.length > 0 || true) // 保留空行
      .join('\n')
      .trim();
  }

  /**
   * 產生差異報告（簡化版）
   */
  private generateDiff(actual: string, expected: string): string[] {
    const actualLines = actual.split('\n');
    const expectedLines = expected.split('\n');
    const diff: string[] = [];

    const maxLines = Math.max(actualLines.length, expectedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const actualLine = actualLines[i] || '';
      const expectedLine = expectedLines[i] || '';

      if (actualLine !== expectedLine) {
        diff.push(`Line ${i + 1}:`);
        diff.push(`  Expected: ${expectedLine}`);
        diff.push(`  Actual:   ${actualLine}`);
      }
    }

    return diff;
  }

  /**
   * 更新預期輸出（用於首次建立或更新測試）
   */
  async updateExpected(testCase: GoldenTestCase): Promise<void> {
    const inputPath = path.join(this.goldenDir, testCase.inputFile);
    const expectedPath = path.join(this.expectedDir, testCase.expectedFile);

    const options: CompilerOptions = {
      ...defaultOptions,
      ...testCase.options,
      input: inputPath,
      output: '/tmp'
    } as CompilerOptions;

    const compiler = new Compiler(options);
    const result = await compiler.compileFile(inputPath);

    if (result.success && typeof result.output === 'string') {
      fs.writeFileSync(expectedPath, result.output, 'utf-8');
    } else {
      throw new Error(`Failed to compile ${testCase.name}`);
    }
  }
}

export interface GoldenTestResult {
  passed: boolean;
  name: string;
  expected: string;
  actual: string;
  diff?: string[];
  errors?: any[];
}

export interface GoldenTestSummary {
  total: number;
  passed: number;
  failed: number;
  results: GoldenTestResult[];
}

export interface CodeComparison {
  match: boolean;
  diff?: string[];
}

/**
 * 執行黃金測試的輔助函式
 */
export async function runGoldenTest(
  name: string,
  inputFile: string,
  expectedFile: string,
  options?: Partial<CompilerOptions>
): Promise<void> {
  const runner = new GoldenTestRunner();
  const result = await runner.runGoldenTest({
    name,
    inputFile,
    expectedFile,
    options
  });

  if (!result.passed) {
    const errorMessage = [
      `Golden test failed: ${name}`,
      '',
      'Differences:',
      ...(result.diff || []),
      '',
      'Errors:',
      ...(result.errors || []).map(e => `  ${e.message}`)
    ].join('\n');

    throw new Error(errorMessage);
  }
}
