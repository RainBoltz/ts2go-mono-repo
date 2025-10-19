/**
 * 編譯器配置選項
 */

export interface CompilerOptions {
  // === 基本選項 ===
  /**
   * 輸入檔案或目錄
   */
  input: string;

  /**
   * 輸出目錄
   */
  output: string;

  /**
   * 是否產生 source map
   */
  sourceMap?: boolean;

  /**
   * 是否保留註解
   */
  preserveComments?: boolean;

  // === 型別對映策略 ===
  /**
   * number 型別對映策略
   */
  numberStrategy?: 'float64' | 'int' | 'contextual';

  /**
   * Union 型別對映策略
   */
  unionStrategy?: 'tagged' | 'interface' | 'any';

  /**
   * 空值處理策略
   */
  nullabilityStrategy?: 'pointer' | 'zero' | 'sqlNull';

  /**
   * async/await 處理策略
   */
  asyncStrategy?: 'sync' | 'future' | 'errgroup';

  // === 輸出控制 ===
  /**
   * Go 版本目標
   */
  goVersion?: string; // 預設 "1.22"

  /**
   * 是否產生 runtime 輔助函式
   */
  generateRuntime?: boolean;

  /**
   * 是否使用指標接收者
   */
  usePointerReceivers?: boolean;

  /**
   * 是否內嵌介面
   */
  embedInterfaces?: boolean;

  // === 錯誤處理 ===
  /**
   * 錯誤處理模式
   */
  errorHandling?: 'return' | 'panic';

  /**
   * 是否啟用嚴格模式
   */
  strict?: boolean;

  /**
   * 是否允許 any 型別
   */
  allowAny?: boolean;

  // === 優化選項 ===
  /**
   * 優化等級
   */
  optimizationLevel?: 0 | 1 | 2;

  /**
   * 是否移除未使用的程式碼
   */
  removeUnusedCode?: boolean;

  /**
   * 是否內聯小函式
   */
  inlineSmallFunctions?: boolean;

  // === 除錯選項 ===
  /**
   * 是否輸出 IR
   */
  emitIR?: boolean;

  /**
   * 是否輸出詳細日誌
   */
  verbose?: boolean;

  /**
   * 是否產生解釋性註解
   */
  explainTransformations?: boolean;

  // === 相容性選項 ===
  /**
   * TypeScript 配置檔路徑
   */
  tsConfigPath?: string;

  /**
   * 忽略的檔案模式
   */
  exclude?: string[];

  /**
   * 包含的檔案模式
   */
  include?: string[];

  // === 實驗性功能 ===
  experimental?: {
    /**
     * 是否啟用裝飾器支援
     */
    decorators?: boolean;

    /**
     * 是否啟用反射支援
     */
    reflection?: boolean;

    /**
     * 是否產生介面適配器
     */
    generateAdapters?: boolean;
  };
}

/**
 * 預設配置
 */
export const defaultOptions: Partial<CompilerOptions> = {
  sourceMap: true,
  preserveComments: false,
  numberStrategy: 'float64',
  unionStrategy: 'tagged',
  nullabilityStrategy: 'pointer',
  asyncStrategy: 'sync',
  goVersion: '1.22',
  generateRuntime: true,
  usePointerReceivers: true,
  embedInterfaces: true,
  errorHandling: 'return',
  strict: true,
  allowAny: false,
  optimizationLevel: 0,
  removeUnusedCode: false,
  inlineSmallFunctions: false,
  emitIR: false,
  verbose: false,
  explainTransformations: false,
  experimental: {
    decorators: false,
    reflection: false,
    generateAdapters: false
  }
};

/**
 * 合併配置選項
 */
export function mergeOptions(
  userOptions: Partial<CompilerOptions>,
  defaults: Partial<CompilerOptions> = defaultOptions
): CompilerOptions {
  return {
    ...defaults,
    ...userOptions,
    experimental: {
      ...defaults.experimental,
      ...userOptions.experimental
    }
  } as CompilerOptions;
}

/**
 * 從設定檔載入選項
 */
export async function loadOptionsFromFile(configPath: string): Promise<CompilerOptions> {
  // TODO: 實作從 ts2go.json 載入配置
  throw new Error('Not implemented');
}

/**
 * 驗證配置選項
 */
export function validateOptions(options: CompilerOptions): void {
  if (!options.input) {
    throw new Error('Input file or directory is required');
  }

  if (!options.output) {
    throw new Error('Output directory is required');
  }

  if (options.goVersion && !isValidGoVersion(options.goVersion)) {
    throw new Error(`Invalid Go version: ${options.goVersion}`);
  }
}

function isValidGoVersion(version: string): boolean {
  const pattern = /^\d+\.\d+$/;
  return pattern.test(version);
}