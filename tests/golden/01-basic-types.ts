/**
 * 測試 01: 基本型別與變數宣告
 */

// 基本型別
const strr: string = "hello";
const numm: number = 42;
const boool: boolean = true;
const nothing: void = undefined;

// 型別推斷
let inferredString = "world";
let inferredNumber = 3.14;
let inferredBoolean = false;

// any 與 unknown
let anyValue: any = 42;
anyValue = "string";
anyValue = true;

let unknownValue: unknown = 42;
// unknownValue.toString(); // 應該要有型別檢查

// Arrays
const numberss: number[] = [1, 2, 3, 4, 5];
const strings: Array<string> = ["a", "b", "c"];

// Tuples
const tuple: [string, number] = ["age", 30];
const tuple3: [string, number, boolean] = ["test", 1, true];

// 可選與預設值
function greet(name: string, age?: number, title: string = "Mr."): string {
  if (age) {
    return `${title} ${name}, age ${age}`;
  }
  return `${title} ${name}`;
}

export { strr, numm, boool, greet };