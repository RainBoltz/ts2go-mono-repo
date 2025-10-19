# TS2Go Architecture Design

> 本文件詳細說明 TS2Go 的架構設計、編譯流程、資料結構與實作細節。
> For English version, see README.md. This document contains detailed technical specifications in Chinese.

## 總體架構

TS2Go 採用三階段編譯器架構，以確保語義保真與程式碼品質：

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│ TypeScript  │ ───> │  IR (中間表示) │ ───> │   Go Code   │
│   Source    │      │   Semantic   │      │   Output    │
└─────────────┘      └──────────────┘      └─────────────┘
      │                     │                      │
   前端階段              中端階段               後端階段
      │                     │                      │
   ┌─────┐             ┌─────┐              ┌─────┐
   │Parse│             │Trans│              │Code │
   │Check│             │form │              │ Gen │
   └─────┘             └─────┘              └─────┘
```

## 階段詳解

### 階段 1: 前端 (Frontend)

**職責**：解析 TypeScript 原始碼，建立完整的 AST 與型別資訊

**核心模組**：
- `frontend/parser.ts`: TypeScript Compiler API 封裝
  - 使用官方 `typescript` 套件
  - 提供 TypeChecker 存取
  - 支援完整型別推導

**關鍵功能**：
1. **檔案解析**
   ```typescript
   parseFile(filePath: string): Promise<ts.SourceFile>
   ```

2. **專案分析**
   ```typescript
   analyzeProject(projectPath: string): Promise<ProjectInfo>
   ```

3. **型別查詢**
   ```typescript
   getTypeOfNode(node: ts.Node): ts.Type | undefined
   getSymbolOfNode(node: ts.Node): ts.Symbol | undefined
   ```

**輸出**：TypeScript AST + 型別資訊

### 階段 2: 中端 (Middle-end)

**職責**：將 TypeScript AST 轉換為語義豐富的 IR，並進行正規化

**核心模組**：
- `ir/nodes.ts`: IR 節點定義
- `ir/transformer.ts`: AST → IR 轉換器
- `ir/location.ts`: 源碼位置追蹤

**IR 設計原則**：
1. **語義完整性**：保留所有語義資訊
2. **型別明確性**：每個節點都有明確型別
3. **可擴展性**：易於添加新的語言特性
4. **可遍歷性**：實作 Visitor 模式

**轉換流程**：
```
TypeScript AST
      ↓
 [語法轉換]
      ↓
  IR Nodes
      ↓
 [語義正規化]
      ↓
 [型別推導]
      ↓
 [優化 Pass]
      ↓
Normalized IR
```

**IR 層次結構**：

```
IRNode (抽象基類)
├── IRType (型別節點)
│   ├── PrimitiveType
│   ├── ArrayType
│   ├── TupleType
│   ├── ObjectType
│   ├── UnionType
│   ├── IntersectionType
│   └── TypeReference
├── Declaration (宣告節點)
│   ├── VariableDeclaration
│   ├── FunctionDeclaration
│   ├── ClassDeclaration
│   ├── InterfaceDeclaration
│   └── TypeAliasDeclaration
├── Statement (陳述式節點)
│   ├── BlockStatement
│   ├── IfStatement
│   ├── ForStatement
│   └── TryStatement
└── Expression (表達式節點)
    ├── BinaryExpression
    ├── CallExpression
    ├── MemberExpression
    └── AwaitExpression
```

### 階段 3: 後端 (Backend)

**職責**：從 IR 產生慣用的 Go 程式碼

**核心模組**：
- `backend/go-generator.ts`: Go 程式碼產生器 ✅
- `backend/type-mapper.ts`: 型別對映策略 ✅
- `backend/sourcemap.ts`: Source Map 產生 ✅

**產生策略**：

#### 1. 型別對映

```typescript
interface TypeMapper {
  mapPrimitiveType(type: PrimitiveType): string;
  mapUnionType(type: UnionType): GoTypeDefinition;
  mapIntersectionType(type: IntersectionType): GoTypeDefinition;
}
```

**對映表**：
| TypeScript | Go | 說明 |
|-----------|-----|------|
| `number` | `float64` | 預設，可配置 |
| `string` | `string` | 直接對映 |
| `boolean` | `bool` | 直接對映 |
| `any` | `interface{}` | 類型擦除 |
| `T[]` | `[]T` | 切片 |
| `[A,B]` | `struct{Item0 A; Item1 B}` | 命名結構體 |
| `A \| B` | Tagged Union / Interface | 可配置 |
| `A & B` | 結構體內嵌 | 欄位合併 |

#### 2. 語義轉換

**Async/Await 轉換**：

策略 A - 同步降階（預設）：
```typescript
async function fetch(): Promise<string> {
    return "data";
}
```
↓
```go
func Fetch() (string, error) {
    return "data", nil
}
```

策略 B - Future 模式：
```go
type Future[T any] struct {
    ch chan Result[T]
}

func Fetch() *Future[string] {
    // Implementation
}
```

**錯誤處理轉換**：

```typescript
try {
    operation();
} catch (err) {
    handle(err);
} finally {
    cleanup();
}
```
↓
```go
func wrapper() (err error) {
    defer cleanup()

    if err := operation(); err != nil {
        return handle(err)
    }
    return nil
}
```

#### 3. 程式碼產生

**使用 Visitor 模式直接產生 Go 程式碼**：

```typescript
class GoCodeGenerator implements IRVisitor<string> {
  generate(module: Module): GeneratedCode {
    const code = this.visitModule(module);
    return {
      code,
      sourceMap: this.sourceMap
    };
  }

  visitModule(node: Module): string {
    // 產生 package 聲明
    // 收集 imports
    // 遍歷所有宣告並產生程式碼
  }

  // 實作所有 IR 節點的 visit 方法
  visitFunctionDeclaration(node: FunctionDeclaration): string { ... }
  visitClassDeclaration(node: ClassDeclaration): string { ... }
  // ... 40+ visitor 方法
}
```

**已實作功能** ✅：
- 完整的 Visitor 模式實作
- 自動 import 管理
- 縮排與格式化
- Constructor 產生 (NewXxx functions)
- Method 產生 (pointer receivers)
- 泛型支援 (Go 1.18+)
- Union type 三種策略 (tagged/interface/any)
- Async 函式 → context.Context + error
- Template literals → fmt.Sprintf

## 資料流

### 完整編譯流程

```
1. 輸入
   ├─ TypeScript 原始碼
   └─ ts2go.json (配置)
         ↓
2. 前端處理
   ├─ 詞法分析 (TypeScript Compiler)
   ├─ 語法分析 (TypeScript Compiler)
   ├─ 語義分析 (TypeChecker)
   └─ 生成 TypeScript AST
         ↓
3. IR 轉換
   ├─ AST 遍歷
   ├─ 節點轉換
   ├─ 型別解析
   └─ 生成 IR
         ↓
4. IR 優化
   ├─ 控制流正規化
   ├─ 型別簡化
   ├─ 死碼消除
   └─ 常數折疊
         ↓
5. 後端產生
   ├─ IR → Go AST
   ├─ 型別對映
   ├─ 名稱轉換
   └─ 程式碼格式化
         ↓
6. 輸出
   ├─ Go 原始碼
   ├─ Source Map
   └─ 編譯報告
```

## 配置系統

### 配置檔案結構

```json
{
  "input": "src/",
  "output": "dist/",
  "numberStrategy": "float64",
  "unionStrategy": "tagged",
  "asyncStrategy": "sync",
  "errorHandling": "return",
  "goVersion": "1.22",
  "strict": true,
  "optimization": {
    "level": 1,
    "removeDeadCode": true,
    "inlineFunctions": false
  },
  "experimental": {
    "decorators": false,
    "reflection": false
  }
}
```

### 策略說明

#### numberStrategy
- `float64`: 所有 number 映射為 float64（預設）
- `int`: 所有 number 映射為 int
- `contextual`: 根據使用情境自動選擇

#### unionStrategy
- `tagged`: 使用 Tagged Union 模式（安全，推薦）
- `interface`: 使用 Go interface 與型別斷言
- `any`: 使用 interface{} + runtime checks

#### asyncStrategy
- `sync`: 同步降階，Promise → (T, error)
- `future`: Channel-based Future 模式
- `errgroup`: 使用 sync/errgroup

## 優化階段 ✅

### Pass 管線

```
IR
 ↓
[Pass 1] 死碼消除 ✅
 ↓
[Pass 2] 常數折疊 ✅
 ↓
[Pass 3] 型別簡化 (Level 2) ✅
 ↓
[Pass 4] 控制流正規化 (Level 2) ✅
 ↓
[Pass 5] 內聯優化 (Level 2, 可選) ✅
 ↓
Optimized IR
```

### 實作範例

```typescript
class IROptimizer {
  private passes: OptimizationPass[] = [];

  constructor(private options: CompilerOptions) {
    this.initializePasses();
  }

  private initializePasses(): void {
    const level = this.options.optimizationLevel || 1;

    // Level 1: 基本優化
    if (level >= 1) {
      this.passes.push(new DeadCodeEliminationPass());
      this.passes.push(new ConstantFoldingPass());
    }

    // Level 2: 進階優化
    if (level >= 2) {
      this.passes.push(new TypeSimplificationPass());
      this.passes.push(new ControlFlowNormalizationPass());
      this.passes.push(new InliningPass());
    }
  }

  optimize(module: Module): Module {
    let optimized = module;
    for (const pass of this.passes) {
      optimized = pass.run(optimized, this.options);
    }
    return optimized;
  }
}
```

**已實作** ✅：
- 完整的優化框架 (`src/optimizer/optimizer.ts`)
- 死碼消除 (移除未使用的變數、函式、型別)
- 符號使用分析 (SymbolCollector with full IR visitor)
- 保留 export 的符號
- 可配置的優化等級 (0-2)

## 錯誤處理

### 錯誤碼系統

- **E1xxx**: 語法錯誤
- **E2xxx**: 型別錯誤
- **E3xxx**: 不支援特性
- **W4xxx**: 警告（語義可能變更）

### 錯誤報告格式

```
Error E2001: Union type too complex
  --> src/types.ts:15:12
   |
15 | type X = A | B | C | D | E;
   |            ^^^^^^^^^^^^^^^ Consider simplifying this union type
   |
   = help: Use intersection types or interfaces instead
```

## 測試策略 ✅

### 1. 黃金測試 ✅

固定輸入與輸出，驗證轉譯結果：

**實作** (`tests/helpers/golden-test.ts`):
```typescript
export class GoldenTestRunner {
  async runGoldenTest(testCase: GoldenTestCase): Promise<GoldenTestResult> {
    // 讀取預期輸出
    const expectedCode = fs.readFileSync(expectedPath, 'utf-8');

    // 編譯 TypeScript 到 Go
    const compiler = new Compiler(options);
    const result = await compiler.compileFile(inputPath);

    // 比對生成的程式碼與預期的程式碼
    const comparison = this.compareCode(result.output, expectedCode);

    return { passed: comparison.match, diff: comparison.diff };
  }
}
```

**10 個黃金測試樣例** ✅：
1. 01-basic-types.ts → 01-basic-types.go
2. 02-interfaces-classes.ts → 02-interfaces-classes.go
3. 03-generics.ts → 03-generics.go
4. 04-union-intersection.ts → 04-union-intersection.go
5. 05-async-await.ts → 05-async-await.go
6. 06-error-handling.ts → 06-error-handling.go
7. 07-enums-namespaces.ts → 07-enums-namespaces.go
8. 08-arrays-iterators.ts → 08-arrays-iterators.go
9. 09-modules-imports.ts → 09-modules-imports.go
10. 10-advanced-types.ts → 10-advanced-types.go

**Jest 設定** ✅：
- 自訂 matchers: `toMatchGoCode()`, `toBeValidGo()`
- 詳細的 diff 報告
- 30 秒測試超時

### 2. 差分測試 ✅

比較不同編譯策略的輸出：

**實作** (`tests/helpers/diff-tool.ts`):
```typescript
export class DifferentialTestRunner {
  async compareStrategies(
    inputFile: string,
    strategy1: StrategyConfig,
    strategy2: StrategyConfig
  ): Promise<DiffTestResult> {
    // 使用策略 1 編譯
    const result1 = await this.compileWithStrategy(inputFile, strategy1);

    // 使用策略 2 編譯
    const result2 = await this.compileWithStrategy(inputFile, strategy2);

    // 分析差異
    const differences = this.analyzeDifferences(result1, result2);

    return { strategy1: result1, strategy2: result2, differences };
  }
}
```

**預定義策略** ✅：
- `default`: 預設配置
- `int_numbers`: number → int
- `interface_unions`: union → interface
- `zero_nullability`: 零值表示 null
- `strict`: 嚴格模式

### 3. 模糊測試

TODO: 未來實作隨機生成測試

## 效能考量

### 編譯速度優化

1. **並行處理**：多檔案並行解析
2. **增量編譯**：只重新編譯變更的檔案
3. **快取機制**：快取型別檢查結果

### 記憶體管理

1. **串流處理**：大型檔案使用串流讀取
2. **及時釋放**：完成階段後立即釋放 AST
3. **池化重用**：重用頻繁分配的物件

## 擴展性

### 新增語言特性

1. 在 `ir/nodes.ts` 定義新 IR 節點
2. 在 `ir/transformer.ts` 實作轉換邏輯
3. 在 `backend/go-generator.ts` 實作程式碼產生
4. 添加測試樣例

### 新增優化 Pass

```typescript
class MyOptimizationPass implements Pass {
  transform(module: Module): Module {
    // 實作優化邏輯
    return optimizedModule;
  }
}

// 註冊到管線
pipeline.addPass(new MyOptimizationPass());
```

## Runtime 輔助系統 ✅

**位置**: `src/runtime/`

### Runtime Helpers (`helpers.go.template`) ✅

**Optional Chaining**:
```go
type OptionalValue[T any] struct {
    value   T
    present bool
}

func (o OptionalValue[T]) Map[U any](fn func(T) U) OptionalValue[U]
func (o OptionalValue[T]) GetOrDefault(defaultValue T) T
```

**Union Types**:
```go
type Union2[A any, B any] struct {
    tag    int
    valueA *A
    valueB *B
}

func (u Union2[A, B]) IsType(typeIndex int) bool
func (u Union2[A, B]) AsA() A
func (u Union2[A, B]) TryAsA() (A, bool)
```

**Promise/Future**:
```go
type Future[T any] struct {
    done  chan struct{}
    value T
    err   error
}

func (f *Future[T]) Then[U any](fn func(T) (U, error)) *Future[U]
func (f *Future[T]) Catch(handler func(error) (T, error)) *Future[T]
func All[T any](futures ...*Future[T]) *Future[[]T]
func Race[T any](futures ...*Future[T]) *Future[T]
```

**Array Helpers**:
```go
func Map[T any, U any](slice []T, fn func(T) U) []U
func Filter[T any](slice []T, predicate func(T) bool) []T
func Reduce[T any, U any](slice []T, initial U, fn func(U, T) U) U
func Find[T any](slice []T, predicate func(T) bool) (T, bool)
```

**Runtime Generator** (`runtime-generator.ts`) ✅:
- 可選擇性產生 runtime 功能
- 模組化的 feature 選擇
- 自訂 package 名稱

### CLI 工具 ✅

**位置**: `src/cli.ts`

**命令**:
```bash
ts2go compile <input> -o <output>    # 編譯
ts2go watch <input> -o <output>       # 監聽模式
ts2go init                            # 初始化配置
ts2go info <file>                     # 分析檔案
ts2go runtime -o <dir>                # 產生 runtime
```

**功能** ✅:
- 單檔案和批次編譯
- Watch 模式 (使用 chokidar)
- 彩色輸出 (使用 chalk)
- 詳細日誌模式
- 配置檔支援 (ts2go.json)
- 錯誤報告與堆疊追蹤

## 重要實作細節

### IR 節點數量
完整的 IR 系統包含 **40+ 節點類型**，全部定義於 `src/ir/nodes.ts`：
- 9 種 Type 節點（PrimitiveType, ArrayType, UnionType 等）
- 8 種 Declaration 節點（VariableDeclaration, FunctionDeclaration 等）
- 12 種 Statement 節點（IfStatement, ForStatement, TryStatement 等）
- 16 種 Expression 節點（BinaryExpression, CallExpression 等）
- 4 種 Module 節點（Module, ImportDeclaration 等）

### Visitor Pattern 完整性
所有 IR 節點必須：
1. 繼承自適當的基類（IRType, Declaration, Statement, Expression）
2. 實作 `accept<T>(visitor: IRVisitor<T>): T` 方法
3. 在 `IRVisitor<T>` 介面中有對應的 `visitXxx()` 方法
4. 在所有 visitor 實作（GoCodeGenerator, SymbolCollector 等）中有對應實作

### 錯誤位置追蹤
每個 IR 節點都包含 `SourceLocation`，用於：
- 錯誤訊息精確定位到原始 TypeScript 檔案
- Source Map 產生
- 除錯資訊保留

## 實作進度

### ✅ 已完成（Production Ready）
- [x] IR 型別系統 (40+ 節點類型) - `src/ir/nodes.ts`
- [x] TypeScript Parser (完整型別檢查) - `src/frontend/parser.ts`
- [x] IR Transformer (AST → IR) - `src/ir/transformer.ts`
- [x] Go Code Generator (完整實作) - `src/backend/go-generator.ts`
- [x] Type Mapper (多策略支援) - `src/backend/type-mapper.ts`
- [x] Source Map 產生 - `src/backend/sourcemap.ts`
- [x] Optimization System (死碼消除等) - `src/optimizer/optimizer.ts`
- [x] Test Framework (Jest + Golden Tests) - `tests/`
- [x] Differential Testing Tool - `tests/helpers/diff-tool.ts`
- [x] Runtime Helpers (Go template) - `src/runtime/`
- [x] CLI Tool (完整功能) - `src/cli.ts`
- [x] 10 個黃金測試樣例 - `tests/golden/`

### 🚧 進行中（In Development）
- [ ] 完整的 Mapped/Conditional Types 支援
- [ ] 更精確的型別推斷（基於 control flow）
- [ ] 模組相依性完整解析（NPM packages）

### 📋 未來計劃（Roadmap）
- [ ] 增量編譯（只編譯變更檔案）
- [ ] VS Code 擴充套件
- [ ] 效能基準測試與優化
- [ ] NPM 套件對映庫（常見套件的 Go 等價物）
- [ ] 社群型別定義庫

## 參考資料

- [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [Go AST Package](https://pkg.go.dev/go/ast)
- [Compiler Design Patterns](https://en.wikipedia.org/wiki/Compiler)
- [Type System Theory](https://en.wikipedia.org/wiki/Type_system)