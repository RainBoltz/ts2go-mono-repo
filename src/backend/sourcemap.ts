/**
 * Source Map Generator
 * 產生 Source Map 以追蹤 Go 程式碼到原始 TypeScript 程式碼的對應關係
 */

export interface SourceMapMapping {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number;
  originalColumn: number;
  originalFile: string;
  name?: string;
}

export class SourceMap {
  private mappings: SourceMapMapping[] = [];
  private sources: Set<string> = new Set();
  private names: Set<string> = new Set();

  /**
   * 添加一個對應關係
   */
  addMapping(mapping: SourceMapMapping): void {
    this.mappings.push(mapping);
    this.sources.add(mapping.originalFile);
    if (mapping.name) {
      this.names.add(mapping.name);
    }
  }

  /**
   * 產生 Source Map JSON
   */
  toJSON(): string {
    const sourcesList = Array.from(this.sources);
    const namesList = Array.from(this.names);

    const sourceMap = {
      version: 3,
      sources: sourcesList,
      names: namesList,
      mappings: this.encodeMappings(),
      sourcesContent: [] as (string | null)[]
    };

    return JSON.stringify(sourceMap, null, 2);
  }

  /**
   * 編碼 mappings 為 VLQ 格式（簡化版）
   * 完整實作需要使用 Base64 VLQ 編碼
   */
  private encodeMappings(): string {
    // TODO: 實作完整的 VLQ 編碼
    // 目前返回空字串，需要實作 Base64 VLQ 編碼算法
    return '';
  }

  /**
   * 獲取所有對應關係
   */
  getMappings(): SourceMapMapping[] {
    return [...this.mappings];
  }

  /**
   * 根據產生的位置查找原始位置
   */
  findOriginal(line: number, column: number): SourceMapMapping | undefined {
    return this.mappings.find(m =>
      m.generatedLine === line && m.generatedColumn === column
    );
  }

  /**
   * 根據原始位置查找產生的位置
   */
  findGenerated(file: string, line: number, column: number): SourceMapMapping | undefined {
    return this.mappings.find(m =>
      m.originalFile === file &&
      m.originalLine === line &&
      m.originalColumn === column
    );
  }
}

/**
 * Source Map Builder
 * 輔助建立 source map 的工具類別
 */
export class SourceMapBuilder {
  private sourceMap: SourceMap;
  private currentGeneratedLine = 1;
  private currentGeneratedColumn = 0;

  constructor() {
    this.sourceMap = new SourceMap();
  }

  /**
   * 記錄新行
   */
  newLine(): void {
    this.currentGeneratedLine++;
    this.currentGeneratedColumn = 0;
  }

  /**
   * 添加字元
   */
  addCharacters(count: number): void {
    this.currentGeneratedColumn += count;
  }

  /**
   * 添加對應關係
   */
  addMapping(originalFile: string, originalLine: number, originalColumn: number, name?: string): void {
    this.sourceMap.addMapping({
      generatedLine: this.currentGeneratedLine,
      generatedColumn: this.currentGeneratedColumn,
      originalFile,
      originalLine,
      originalColumn,
      name
    });
  }

  /**
   * 獲取 source map
   */
  getSourceMap(): SourceMap {
    return this.sourceMap;
  }

  /**
   * 重置狀態
   */
  reset(): void {
    this.sourceMap = new SourceMap();
    this.currentGeneratedLine = 1;
    this.currentGeneratedColumn = 0;
  }
}
