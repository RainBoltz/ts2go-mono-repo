# TS2Go 架構設計文件

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
- `backend/go-generator.ts`: Go 程式碼產生器
- `backend/type-mapper.ts`: 型別對映策略
- `backend/name-mangler.ts`: 名稱轉換

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

**使用 `go/ast` 與 `go/printer`**：

```typescript
class GoCodeGenerator {
  generateFile(module: Module): string {
    const file = this.createASTFile(module);
    return this.printAST(file);
  }

  private createASTFile(module: Module): *ast.File {
    // 建立 Go AST
  }

  private printAST(file: *ast.File): string {
    // 使用 go/printer 產生格式化程式碼
  }
}
```

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

## 優化階段

### Pass 管線

```
IR
 ↓
[Pass 1] 控制流正規化
 ↓
[Pass 2] 型別簡化
 ↓
[Pass 3] 死碼消除
 ↓
[Pass 4] 常數折疊
 ↓
[Pass 5] 內聯優化
 ↓
Optimized IR
```

### 實作範例

```typescript
class OptimizationPipeline {
  private passes: Pass[] = [
    new ControlFlowNormalizationPass(),
    new TypeSimplificationPass(),
    new DeadCodeEliminationPass(),
    new ConstantFoldingPass(),
  ];

  optimize(module: Module): Module {
    let current = module;
    for (const pass of this.passes) {
      current = pass.transform(current);
    }
    return current;
  }
}
```

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

## 測試策略

### 1. 黃金測試

固定輸入與輸出，驗證轉譯結果：

```typescript
describe('Golden Tests', () => {
  const goldenTests = loadGoldenTests('tests/golden');

  for (const test of goldenTests) {
    it(test.name, async () => {
      const result = await compiler.compile(test.input);
      expect(result.output).toEqual(test.expected);
    });
  }
});
```

### 2. 差分測試

比較 TypeScript 與 Go 的執行結果：

```typescript
describe('Differential Tests', () => {
  it('arithmetic operations', async () => {
    const tsResult = await runTypeScript('1 + 2 * 3');
    const goResult = await runGo(compile('1 + 2 * 3'));
    expect(tsResult).toEqual(goResult);
  });
});
```

### 3. 模糊測試

隨機生成 TypeScript 程式碼，驗證編譯器穩定性：

```typescript
describe('Fuzz Tests', () => {
  it('handles random expressions', () => {
    for (let i = 0; i < 1000; i++) {
      const expr = generateRandomExpression();
      expect(() => compiler.compile(expr)).not.toThrow();
    }
  });
});
```

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

## 未來規劃

### 短期目標（3 個月內）
- [ ] 完成 Go 程式碼產生器
- [ ] 實作所有核心型別對映
- [ ] 支援基本的 async/await
- [ ] 建立完整的測試套件

### 中期目標（6 個月內）
- [ ] 支援完整的 Union/Intersection
- [ ] 實作 Mapped/Conditional Types
- [ ] 產生 Source Map
- [ ] CLI 工具與 VS Code 擴充

### 長期目標（1 年內）
- [ ] 支援大型專案轉譯
- [ ] 效能基準測試與優化
- [ ] 生態系統整合（NPM 套件對映）
- [ ] 社群驅動的型別對映庫

## 參考資料

- [TypeScript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [Go AST Package](https://pkg.go.dev/go/ast)
- [Compiler Design Patterns](https://en.wikipedia.org/wiki/Compiler)
- [Type System Theory](https://en.wikipedia.org/wiki/Type_system)