/**
 * 測試 09: 模組系統與匯入/匯出
 */

// Named exports
export const API_VERSION = '1.0.0';
export const API_ENDPOINT = 'https://api.example.com';

export interface ApiConfig {
  endpoint: string;
  timeout: number;
  retries: number;
}

export class ApiClient {
  constructor(private config: ApiConfig) {}

  async request(path: string): Promise<any> {
    // 模擬 API 請求
    return { path, config: this.config };
  }
}

export function createClient(config: Partial<ApiConfig> = {}): ApiClient {
  const defaultConfig: ApiConfig = {
    endpoint: API_ENDPOINT,
    timeout: 5000,
    retries: 3
  };

  return new ApiClient({ ...defaultConfig, ...config });
}

// Type-only exports
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type RequestHeaders = Record<string, string>;

export interface RequestOptions {
  method: RequestMethod;
  headers?: RequestHeaders;
  body?: any;
}

// Re-exports (假設從其他模組)
// export { Logger } from './logger';
// export * from './utils';
// export { default as DefaultExport } from './default';

// Default export
export default class HttpClient extends ApiClient {
  constructor(config: ApiConfig) {
    super(config);
  }

  get(path: string): Promise<any> {
    return this.request(path);
  }

  post(path: string, data: any): Promise<any> {
    return this.request(path);
  }
}

// Namespace export
export namespace Http {
  export enum Method {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE'
  }

  export interface Response {
    status: number;
    data: any;
    headers: Record<string, string>;
  }

  export class Request {
    constructor(
      public url: string,
      public method: Method
    ) {}
  }
}

// Function overloads for export
export function fetch(url: string): Promise<any>;
export function fetch(url: string, options: RequestOptions): Promise<any>;
export function fetch(url: string, options?: RequestOptions): Promise<any> {
  // Implementation
  return Promise.resolve({ url, options });
}

// Const assertions
export const CONSTANTS = {
  MAX_RETRIES: 3,
  TIMEOUT: 5000,
  ENDPOINTS: {
    USERS: '/users',
    POSTS: '/posts',
    COMMENTS: '/comments'
  }
} as const;

export type ConstantsType = typeof CONSTANTS;
export type EndpointKeys = keyof typeof CONSTANTS.ENDPOINTS;

// Module augmentation pattern
declare global {
  interface Window {
    myGlobal: string;
  }
}

// Side effects (module initialization)
console.log('Module initialized');

// Complex export patterns
export const Utils = {
  formatUrl(path: string): string {
    return `${API_ENDPOINT}${path}`;
  },

  parseResponse(response: any): any {
    return JSON.parse(response);
  }
};

// Export assignment pattern (CommonJS style)
// module.exports = HttpClient;
// exports.createClient = createClient;

// Conditional exports based on environment
const isDevelopment = process.env.NODE_ENV === 'development';

export const config = isDevelopment
  ? { debug: true, logLevel: 'verbose' }
  : { debug: false, logLevel: 'error' };

// Barrel exports pattern
export * from './types';  // Would export all types from types.ts
export { ApiClient as Client };  // Re-export with rename