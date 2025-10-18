/**
 * 測試 08: 陣列操作與迭代器
 */

// 基本陣列操作
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
const filtered = numbers.filter(n => n > 2);
const sum = numbers.reduce((acc, n) => acc + n, 0);

// 陣列方法鏈
function processNumbers(nums: number[]): number {
  return nums
    .filter(n => n > 0)
    .map(n => n * 2)
    .reduce((sum, n) => sum + n, 0);
}

// Array 泛型方法
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

function take<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// for...of 迭代
function sumArray(numbers: number[]): number {
  let total = 0;
  for (const num of numbers) {
    total += num;
  }
  return total;
}

// for...in 迭代（物件）
function getKeys(obj: Record<string, any>): string[] {
  const keys: string[] = [];
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      keys.push(key);
    }
  }
  return keys;
}

// 解構賦值
function processCoordinates(coords: [number, number][]): void {
  for (const [x, y] of coords) {
    console.log(`Point: (${x}, ${y})`);
  }
}

// Rest 參數
function concatenate(...arrays: number[][]): number[] {
  return arrays.reduce((result, arr) => [...result, ...arr], []);
}

// Spread 運算子
const arr1 = [1, 2, 3];
const arr2 = [4, 5, 6];
const combined = [...arr1, ...arr2];
const cloned = [...arr1];

// Array.from
function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i);
}

// 自訂迭代器
class Range implements Iterable<number> {
  constructor(
    private start: number,
    private end: number,
    private step: number = 1
  ) {}

  *[Symbol.iterator](): Iterator<number> {
    for (let i = this.start; i < this.end; i += this.step) {
      yield i;
    }
  }

  toArray(): number[] {
    return [...this];
  }
}

// Map/Set 操作
function uniqueValues<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function countOccurrences<T>(arr: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

// 高階陣列函式
function partition<T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];

  for (const item of arr) {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  }

  return [pass, fail];
}

function groupBy<T, K extends string | number>(
  arr: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  const groups = {} as Record<K, T[]>;

  for (const item of arr) {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }

  return groups;
}

// 遞迴陣列處理
type NestedArray<T> = T | NestedArray<T>[];

function flatten<T>(arr: NestedArray<T>[]): T[] {
  const result: T[] = [];

  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...flatten(item as NestedArray<T>[]));
    } else {
      result.push(item as T);
    }
  }

  return result;
}

export {
  processNumbers,
  first,
  last,
  take,
  chunk,
  sumArray,
  getKeys,
  processCoordinates,
  concatenate,
  range,
  Range,
  uniqueValues,
  countOccurrences,
  partition,
  groupBy,
  flatten
};