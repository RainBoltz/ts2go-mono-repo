/**
 * 編譯結果定義
 */

import { SourceLocation } from '../ir/location';

export interface CompilationResult {
  success: boolean;
  output?: string | GoProject;
  errors?: CompilationError[];
  warnings?: CompilationError[];
  sourceMap?: SourceMap;
  statistics?: CompilationStatistics;
}

export interface CompilationError {
  code: string;
  message: string;
  location?: SourceLocation;
  severity: 'error' | 'warning' | 'info';
  hint?: string;
}

export interface GoProject {
  goMod: string;
  files: Map<string, string>;
  runtime?: Map<string, string>;
}

export interface SourceMap {
  version: number;
  file: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: string[];
  names: string[];
  mappings: string;
  toJSON(): string;
}

export interface CompilationStatistics {
  filesProcessed: number;
  linesOfCode: number;
  compilationTime: number;
  irNodesCreated?: number;
  optimizationPasses?: number;
}