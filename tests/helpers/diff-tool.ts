/**
 * Differential Testing Tool
 * 用於比對不同編譯策略產生的程式碼
 */

import { Compiler } from '../../src/compiler/compiler';
import { CompilerOptions, defaultOptions } from '../../src/config/options';

export interface DiffTestConfig {
  inputFile: string;
  strategies: StrategyConfig[];
}

export interface StrategyConfig {
  name: string;
  options: Partial<CompilerOptions>;
}

export interface DiffTestResult {
  strategy1: StrategyResult;
  strategy2: StrategyResult;
  differences: Difference[];
  compatible: boolean;
}

export interface StrategyResult {
  name: string;
  code: string;
  success: boolean;
  errors?: any[];
}

export interface Difference {
  type: 'type_mapping' | 'structure' | 'semantics' | 'other';
  description: string;
  location?: string;
}

/**
 * Differential Test Runner
 * 執行差分測試以比對不同策略的輸出
 */
export class DifferentialTestRunner {
  /**
   * 比對兩種策略的輸出
   */
  async compareStrategies(
    inputFile: string,
    strategy1: StrategyConfig,
    strategy2: StrategyConfig
  ): Promise<DiffTestResult> {
    // 使用策略 1 編譯
    const result1 = await this.compileWithStrategy(inputFile, strategy1);

    // 使用策略 2 編譯
    const result2 = await this.compileWithStrategy(inputFile, strategy2);

    // 分析差異
    const differences = this.analyzeDifferences(result1.code, result2.code, strategy1, strategy2);

    // 檢查相容性
    const compatible = this.checkCompatibility(result1.code, result2.code);

    return {
      strategy1: result1,
      strategy2: result2,
      differences,
      compatible
    };
  }

  /**
   * 使用特定策略編譯
   */
  private async compileWithStrategy(
    inputFile: string,
    strategy: StrategyConfig
  ): Promise<StrategyResult> {
    const options: CompilerOptions = {
      ...defaultOptions,
      ...strategy.options,
      input: inputFile,
      output: '/tmp'
    } as CompilerOptions;

    const compiler = new Compiler(options);
    const result = await compiler.compileFile(inputFile);

    return {
      name: strategy.name,
      code: typeof result.output === 'string' ? result.output : '',
      success: result.success,
      errors: result.errors
    };
  }

  /**
   * 分析兩個輸出的差異
   */
  private analyzeDifferences(
    code1: string,
    code2: string,
    strategy1: StrategyConfig,
    strategy2: StrategyConfig
  ): Difference[] {
    const differences: Difference[] = [];

    // 檢查型別對映差異
    if (strategy1.options.numberStrategy !== strategy2.options.numberStrategy) {
      const numberTypes1 = this.extractNumberTypes(code1);
      const numberTypes2 = this.extractNumberTypes(code2);

      if (numberTypes1.join(',') !== numberTypes2.join(',')) {
        differences.push({
          type: 'type_mapping',
          description: `Number type mapping differs: ${strategy1.options.numberStrategy} vs ${strategy2.options.numberStrategy}`,
          location: 'type declarations'
        });
      }
    }

    // 檢查 union 策略差異
    if (strategy1.options.unionStrategy !== strategy2.options.unionStrategy) {
      differences.push({
        type: 'type_mapping',
        description: `Union strategy differs: ${strategy1.options.unionStrategy} vs ${strategy2.options.unionStrategy}`,
        location: 'union types'
      });
    }

    // 檢查結構差異
    const structDiff = this.compareStructure(code1, code2);
    differences.push(...structDiff);

    return differences;
  }

  /**
   * 提取 number 型別對映
   */
  private extractNumberTypes(code: string): string[] {
    const numberTypePattern = /\b(int|float64|float32)\b/g;
    return (code.match(numberTypePattern) || []);
  }

  /**
   * 比對程式結構
   */
  private compareStructure(code1: string, code2: string): Difference[] {
    const differences: Difference[] = [];

    // 檢查函式數量
    const func1Count = (code1.match(/func\s+\w+/g) || []).length;
    const func2Count = (code2.match(/func\s+\w+/g) || []).length;

    if (func1Count !== func2Count) {
      differences.push({
        type: 'structure',
        description: `Different number of functions: ${func1Count} vs ${func2Count}`,
        location: 'global'
      });
    }

    // 檢查 struct 數量
    const struct1Count = (code1.match(/type\s+\w+\s+struct/g) || []).length;
    const struct2Count = (code2.match(/type\s+\w+\s+struct/g) || []).length;

    if (struct1Count !== struct2Count) {
      differences.push({
        type: 'structure',
        description: `Different number of structs: ${struct1Count} vs ${struct2Count}`,
        location: 'type definitions'
      });
    }

    return differences;
  }

  /**
   * 檢查兩個輸出是否語義相容
   */
  private checkCompatibility(code1: string, code2: string): boolean {
    // 簡化版：檢查主要結構是否存在
    const extractMainStructures = (code: string) => {
      const functions = (code.match(/func\s+(\w+)/g) || [])
        .map(m => m.replace('func ', ''));
      const types = (code.match(/type\s+(\w+)\s+/g) || [])
        .map(m => m.replace(/type\s+/, '').trim());

      return { functions, types };
    };

    const struct1 = extractMainStructures(code1);
    const struct2 = extractMainStructures(code2);

    // 檢查主要函式是否都存在
    const commonFunctions = struct1.functions.filter(f =>
      struct2.functions.includes(f)
    );

    const compatibleFunctions = commonFunctions.length >= Math.min(
      struct1.functions.length,
      struct2.functions.length
    ) * 0.8; // 80% 相容性

    // 檢查主要型別是否都存在
    const commonTypes = struct1.types.filter(t =>
      struct2.types.includes(t)
    );

    const compatibleTypes = commonTypes.length >= Math.min(
      struct1.types.length,
      struct2.types.length
    ) * 0.8; // 80% 相容性

    return compatibleFunctions && compatibleTypes;
  }

  /**
   * 執行完整的策略矩陣測試
   */
  async runStrategyMatrix(
    inputFile: string,
    strategies: StrategyConfig[]
  ): Promise<StrategyMatrixResult> {
    const results: Map<string, DiffTestResult> = new Map();

    // 比對每對策略
    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        const key = `${strategies[i].name}_vs_${strategies[j].name}`;
        const result = await this.compareStrategies(
          inputFile,
          strategies[i],
          strategies[j]
        );
        results.set(key, result);
      }
    }

    return {
      inputFile,
      comparisons: Array.from(results.entries()).map(([key, value]) => ({
        name: key,
        result: value
      }))
    };
  }
}

export interface StrategyMatrixResult {
  inputFile: string;
  comparisons: Array<{
    name: string;
    result: DiffTestResult;
  }>;
}

/**
 * 預定義的策略配置
 */
export const commonStrategies: StrategyConfig[] = [
  {
    name: 'default',
    options: {}
  },
  {
    name: 'int_numbers',
    options: {
      numberStrategy: 'int'
    }
  },
  {
    name: 'interface_unions',
    options: {
      unionStrategy: 'interface'
    }
  },
  {
    name: 'zero_nullability',
    options: {
      nullabilityStrategy: 'zero'
    }
  },
  {
    name: 'strict',
    options: {
      strict: true,
      allowAny: false
    }
  }
];

/**
 * 執行差分測試的輔助函式
 */
export async function runDiffTest(
  inputFile: string,
  strategy1Name: string,
  strategy2Name: string
): Promise<DiffTestResult> {
  const strategy1 = commonStrategies.find(s => s.name === strategy1Name);
  const strategy2 = commonStrategies.find(s => s.name === strategy2Name);

  if (!strategy1 || !strategy2) {
    throw new Error('Strategy not found');
  }

  const runner = new DifferentialTestRunner();
  return runner.compareStrategies(inputFile, strategy1, strategy2);
}
