/**
 * 測試 04: Union 與 Intersection 型別
 */

// Union 型別
type StringOrNumber = string | number;
type Status = 'pending' | 'success' | 'error';

function processValue(value: StringOrNumber): string {
  if (typeof value === 'string') {
    return value.toUpperCase();
  } else {
    return value.toFixed(2);
  }
}

// Discriminated Union
type Success = {
  status: 'success';
  data: any;
};

type Error = {
  status: 'error';
  error: string;
  code: number;
};

type Loading = {
  status: 'loading';
};

type Result = Success | Error | Loading;

function handleResult(result: Result): string {
  switch (result.status) {
    case 'success':
      return `Success: ${JSON.stringify(result.data)}`;
    case 'error':
      return `Error ${result.code}: ${result.error}`;
    case 'loading':
      return 'Loading...';
  }
}

// Intersection 型別
interface Named {
  name: string;
}

interface Aged {
  age: number;
}

interface Located {
  address: string;
}

type Person = Named & Aged & Located;

const person: Person = {
  name: 'John',
  age: 30,
  address: '123 Main St'
};

// 函式參數中的 union
function formatValue(value: string | number | boolean | null): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return value;
}

// Optional chaining 與 nullish coalescing
interface Config {
  server?: {
    host?: string;
    port?: number;
  };
  timeout?: number;
}

function getServerUrl(config: Config): string {
  const host = config.server?.host ?? 'localhost';
  const port = config.server?.port ?? 3000;
  return `http://${host}:${port}`;
}

// Type Guards
function isError(result: Result): result is Error {
  return result.status === 'error';
}

function isSuccess(result: Result): result is Success {
  return result.status === 'success';
}

// 使用 type guard
function processResult(result: Result): void {
  if (isError(result)) {
    console.error(`Error: ${result.error}`);
  } else if (isSuccess(result)) {
    console.log(`Data: ${result.data}`);
  } else {
    console.log('Still loading...');
  }
}

export {
  processValue,
  handleResult,
  formatValue,
  getServerUrl,
  isError,
  isSuccess,
  processResult,
  type Result,
  type Person
};