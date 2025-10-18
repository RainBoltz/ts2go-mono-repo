/**
 * 測試 10: 進階型別特性
 */

// Mapped Types
type Readonly<T> = {
  readonly [P in keyof T]: T[P];
};

type Partial<T> = {
  [P in keyof T]?: T[P];
};

type Required<T> = {
  [P in keyof T]-?: T[P];
};

type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Conditional Types
type IsString<T> = T extends string ? true : false;
type IsArray<T> = T extends any[] ? true : false;
type ElementType<T> = T extends (infer E)[] ? E : T;

// Utility type usage
interface User {
  id: string;
  name: string;
  email?: string;
  age: number;
}

type ReadonlyUser = Readonly<User>;
type PartialUser = Partial<User>;
type UserCredentials = Pick<User, 'email' | 'id'>;
type UserWithoutId = Omit<User, 'id'>;

// Template Literal Types
type EventName = 'click' | 'focus' | 'blur';
type EventHandler = `on${Capitalize<EventName>}`;

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type EndpointPath = `/api/${string}`;

// Index Access Types
type UserIdType = User['id'];
type UserKeys = keyof User;

const user: User = {
  id: '123',
  name: 'John',
  age: 30
};

// Type Guards and Type Predicates
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isUser(obj: any): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'age' in obj
  );
}

// Discriminated Unions with Type Guards
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'rectangle'; width: number; height: number };

function getArea(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.side ** 2;
    case 'rectangle':
      return shape.width * shape.height;
  }
}

// Recursive Types
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonArray
  | JsonObject;

interface JsonArray extends Array<JsonValue> {}
interface JsonObject extends Record<string, JsonValue> {}

// Function Overloading
function combine(a: string, b: string): string;
function combine(a: number, b: number): number;
function combine(a: string | number, b: string | number): string | number {
  if (typeof a === 'string' && typeof b === 'string') {
    return a + b;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a + b;
  }
  throw new Error('Invalid arguments');
}

// This type
class FluentBuilder {
  private data: Record<string, any> = {};

  set(key: string, value: any): this {
    this.data[key] = value;
    return this;
  }

  build(): Record<string, any> {
    return { ...this.data };
  }
}

// Const assertions and literal types
const CONFIG = {
  API_URL: 'https://api.example.com',
  TIMEOUT: 5000,
  RETRY_COUNTS: [1, 2, 3]
} as const;

type ConfigType = typeof CONFIG;
type ApiUrl = typeof CONFIG.API_URL;

// Tuple types with rest elements
type StringNumberPair = [string, number];
type StringNumberBooleanTuple = [string, number, boolean];
type RestTuple = [string, ...number[], boolean];

function processRestTuple(tuple: RestTuple): void {
  const [first, ...middle, last] = tuple;
  console.log({ first, middle, last });
}

// Type assertions
const someValue: unknown = 'Hello World';
const strLength = (someValue as string).length;

// Non-null assertion
function processNullable(value?: string): string {
  return value!.toUpperCase(); // 使用 ! 斷言非 null
}

// keyof and typeof operators
type UserKey = keyof User;
type UserType = typeof user;

function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Branded types (nominal typing simulation)
type UserId = string & { __brand: 'UserId' };
type PostId = string & { __brand: 'PostId' };

function getUserById(id: UserId): User {
  return user;
}

// Type inference in conditional types
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;
type UnwrapArray<T> = T extends (infer U)[] ? U : T;

type PromiseString = Promise<string>;
type UnwrappedString = UnwrapPromise<PromiseString>; // string

export {
  type ReadonlyUser,
  type PartialUser,
  type UserCredentials,
  type UserWithoutId,
  type EventHandler,
  type Shape,
  type JsonValue,
  isString,
  isUser,
  getArea,
  combine,
  FluentBuilder,
  processRestTuple,
  getProperty,
  getUserById,
  type UserId,
  type PostId
};