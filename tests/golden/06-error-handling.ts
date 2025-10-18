/**
 * 測試 06: 錯誤處理與例外
 */

// 自訂錯誤類別
class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NetworkError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public url: string
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

// try/catch/finally
function parseJSON(jsonString: string): any {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError('Invalid JSON', 'json', jsonString);
    }
    throw error;
  } finally {
    console.log('Parse attempt completed');
  }
}

// 多重 catch (TypeScript 中需要用 if/else)
function processData(data: unknown): string {
  try {
    if (typeof data !== 'string') {
      throw new ValidationError('Expected string', 'data', data);
    }

    if (data.length === 0) {
      throw new Error('Empty data');
    }

    return data.toUpperCase();
  } catch (error) {
    if (error instanceof ValidationError) {
      return `Validation failed: ${error.field}`;
    } else if (error instanceof Error) {
      return `Error: ${error.message}`;
    } else {
      return 'Unknown error';
    }
  }
}

// 錯誤傳播
function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

function calculate(expression: string): number {
  const parts = expression.split('/');
  if (parts.length !== 2) {
    throw new ValidationError('Invalid expression', 'expression', expression);
  }

  const a = parseFloat(parts[0]);
  const b = parseFloat(parts[1]);

  if (isNaN(a) || isNaN(b)) {
    throw new ValidationError('Invalid number', 'expression', expression);
  }

  return divide(a, b);
}

// Result 型別模式（不使用 throw）
type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

function safeDivide(a: number, b: number): Result<number> {
  if (b === 0) {
    return {
      success: false,
      error: new Error('Division by zero')
    };
  }

  return {
    success: true,
    value: a / b
  };
}

// 鏈式錯誤處理
function chainedOperation(input: string): Result<number> {
  // Step 1: Parse
  const parsed = parseInt(input, 10);
  if (isNaN(parsed)) {
    return {
      success: false,
      error: new ValidationError('Invalid number', 'input', input)
    };
  }

  // Step 2: Validate range
  if (parsed < 0 || parsed > 100) {
    return {
      success: false,
      error: new ValidationError('Number out of range', 'value', parsed)
    };
  }

  // Step 3: Calculate
  const result = safeDivide(100, parsed);
  if (!result.success) {
    return result;
  }

  return {
    success: true,
    value: result.value * 2
  };
}

// Async 錯誤處理
async function fetchWithErrorHandling(url: string): Promise<Result<string>> {
  try {
    // 模擬網路請求
    if (url.includes('error')) {
      throw new NetworkError('Failed to fetch', 404, url);
    }

    return {
      success: true,
      value: `Data from ${url}`
    };
  } catch (error) {
    if (error instanceof NetworkError) {
      return {
        success: false,
        error
      };
    }

    return {
      success: false,
      error: new Error('Unknown error')
    };
  }
}

// Error boundary 模式
class ErrorBoundary {
  private errors: Error[] = [];

  wrap<T>(fn: () => T): T | undefined {
    try {
      return fn();
    } catch (error) {
      this.errors.push(error as Error);
      return undefined;
    }
  }

  async wrapAsync<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.errors.push(error as Error);
      return undefined;
    }
  }

  getErrors(): Error[] {
    return [...this.errors];
  }

  clearErrors(): void {
    this.errors = [];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

export {
  ValidationError,
  NetworkError,
  parseJSON,
  processData,
  divide,
  calculate,
  safeDivide,
  chainedOperation,
  fetchWithErrorHandling,
  ErrorBoundary,
  type Result
};