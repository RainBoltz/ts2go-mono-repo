/**
 * 測試 03: 泛型
 */

// 泛型函式
function identity<T>(arg: T): T {
  return arg;
}

function map<T, U>(arr: T[], fn: (item: T) => U): U[] {
  const result: U[] = [];
  for (const item of arr) {
    result.push(fn(item));
  }
  return result;
}

// 泛型介面
interface Container<T> {
  value: T;
  getValue(): T;
  setValue(value: T): void;
}

// 泛型類別
class Box<T> implements Container<T> {
  constructor(public value: T) {}

  getValue(): T {
    return this.value;
  }

  setValue(value: T): void {
    this.value = value;
  }

  map<U>(fn: (value: T) => U): Box<U> {
    return new Box(fn(this.value));
  }
}

// 泛型約束
interface Lengthwise {
  length: number;
}

function logLength<T extends Lengthwise>(arg: T): T {
  console.log(arg.length);
  return arg;
}

// 多個型別參數
class Pair<K, V> {
  constructor(
    public key: K,
    public value: V
  ) {}

  getKey(): K {
    return this.key;
  }

  getValue(): V {
    return this.value;
  }
}

// 泛型預設值
interface Response<T = any> {
  data: T;
  status: number;
  message: string;
}

// 條件型別 (簡化版)
type IsString<T> = T extends string ? true : false;
type IsArray<T> = T extends any[] ? true : false;

// 使用範例
const num = identity(42);
const str = identity("hello");
const arr = map([1, 2, 3], x => x * 2);
const box = new Box<number>(10);
const pair = new Pair("key", "value");

export { identity, map, Box, Pair, logLength };