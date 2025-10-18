/**
 * Runtime Code Generator
 * 產生 Go runtime 輔助程式碼
 */

import * as fs from 'fs';
import * as path from 'path';

export interface RuntimeConfig {
  /**
   * 需要的 runtime 功能
   */
  features: RuntimeFeature[];

  /**
   * 輸出目錄
   */
  outputDir: string;

  /**
   * Package 名稱
   */
  packageName?: string;
}

export type RuntimeFeature =
  | 'optional'
  | 'union'
  | 'future'
  | 'array'
  | 'type-checking'
  | 'json'
  | 'all';

export class RuntimeGenerator {
  private templatePath: string;

  constructor() {
    this.templatePath = path.join(__dirname, 'helpers.go.template');
  }

  /**
   * 產生 runtime 程式碼
   */
  generate(config: RuntimeConfig): string {
    const template = this.loadTemplate();

    // 如果需要全部功能，直接返回完整模板
    if (config.features.includes('all')) {
      return this.replacePackageName(template, config.packageName);
    }

    // 否則，只提取需要的功能
    const selectedCode = this.extractFeatures(template, config.features);
    return this.replacePackageName(selectedCode, config.packageName);
  }

  /**
   * 將 runtime 程式碼寫入檔案
   */
  async generateToFile(config: RuntimeConfig): Promise<void> {
    const code = this.generate(config);
    const outputPath = path.join(config.outputDir, 'runtime.go');

    // 確保目錄存在
    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, code, 'utf-8');
  }

  /**
   * 載入模板
   */
  private loadTemplate(): string {
    try {
      return fs.readFileSync(this.templatePath, 'utf-8');
    } catch (error) {
      // 如果模板檔案不存在，返回內建模板
      return this.getBuiltinTemplate();
    }
  }

  /**
   * 提取指定的功能
   */
  private extractFeatures(template: string, features: RuntimeFeature[]): string {
    const sections: Map<RuntimeFeature, string> = this.parseTemplate(template);
    let result = this.getHeader(template);

    for (const feature of features) {
      const section = sections.get(feature);
      if (section) {
        result += '\n' + section + '\n';
      }
    }

    return result;
  }

  /**
   * 解析模板，提取各個功能區塊
   */
  private parseTemplate(template: string): Map<RuntimeFeature, string> {
    const sections = new Map<RuntimeFeature, string>();

    const featurePatterns: Array<[RuntimeFeature, RegExp]> = [
      ['optional', /\/\/ ={12,} Optional Chaining Helpers ={12,}[\s\S]*?(?=\/\/ ={12,}|$)/],
      ['union', /\/\/ ={12,} Union Type Helpers ={12,}[\s\S]*?(?=\/\/ ={12,}|$)/],
      ['future', /\/\/ ={12,} Promise\/Future Helpers ={12,}[\s\S]*?(?=\/\/ ={12,}|$)/],
      ['array', /\/\/ ={12,} Array Helpers ={12,}[\s\S]*?(?=\/\/ ={12,}|$)/],
      ['type-checking', /\/\/ ={12,} Type Checking Helpers ={12,}[\s\S]*?(?=\/\/ ={12,}|$)/],
      ['json', /\/\/ ={12,} JSON Helpers ={12,}[\s\S]*?(?=\/\/ ={12,}|$)/]
    ];

    for (const [feature, pattern] of featurePatterns) {
      const match = template.match(pattern);
      if (match) {
        sections.set(feature, match[0]);
      }
    }

    return sections;
  }

  /**
   * 獲取模板標頭（package 和 imports）
   */
  private getHeader(template: string): string {
    const match = template.match(/^[\s\S]*?(?=\/\/ ={12,})/);
    return match ? match[0] : '';
  }

  /**
   * 替換 package 名稱
   */
  private replacePackageName(code: string, packageName?: string): string {
    if (!packageName) {
      return code;
    }

    return code.replace(/package\s+\w+/, `package ${packageName}`);
  }

  /**
   * 獲取內建模板（如果模板檔案不存在）
   */
  private getBuiltinTemplate(): string {
    return `// Package runtime provides runtime helpers for TypeScript to Go transpiled code
package runtime

// TODO: Add runtime helpers
`;
  }

  /**
   * 分析 IR 模組，決定需要哪些 runtime 功能
   */
  static analyzeRequiredFeatures(irModule: any): RuntimeFeature[] {
    const features = new Set<RuntimeFeature>();

    // TODO: 分析 IR 來決定需要的功能
    // 例如：
    // - 如果有可選鏈，添加 'optional'
    // - 如果有 Union 型別，添加 'union'
    // - 如果有 Promise，添加 'future'

    // 目前返回所有功能
    return ['all'];
  }
}

/**
 * 快速產生 runtime 程式碼的輔助函式
 */
export async function generateRuntime(
  outputDir: string,
  features: RuntimeFeature[] = ['all'],
  packageName: string = 'runtime'
): Promise<void> {
  const generator = new RuntimeGenerator();
  await generator.generateToFile({
    features,
    outputDir,
    packageName
  });
}

/**
 * 檢查是否需要 runtime
 */
export function needsRuntime(irModule: any): boolean {
  // 簡化版：總是需要 runtime
  // TODO: 更精確的分析
  return true;
}
