# TS2Go - TypeScript to Go Transpiler

一個強調**語義保真**的 TypeScript 到 Go 轉譯器，致力於產生可讀、慣用且類型安全的 Go 程式碼。

## 專案特色

- **語義保真優先**：確保轉譯後的 Go 程式碼語義與原始 TypeScript 一致
- **完整型別系統**：支援泛型、Union/Intersection、Mapped Types 等進階型別特性
- **可配置策略**：提供多種型別對映與語義轉換策略
- **清晰的錯誤訊息**：精確定位到原始 TypeScript 檔案的行列號
- **慣用的 Go 程式碼**：產生符合 Go 社群最佳實踐的程式碼

## 架構設計

### 三階段編譯流程

```
TypeScript → IR (中間表示) → Go
    ↓           ↓              ↓
  前端        中端           後端
```

1. **前端**：使用 TypeScript Compiler API 建立 AST 與型別資訊
2. **中端**：正規化控制流程、型別抹平、語義降階
3. **後端**：使用 `go/ast` + `go/printer` 產生 Go 程式碼

### 目錄結構

```
ts2go-mono-repo/
├── src/
│   ├── compiler/      # 主編譯器介面
│   ├── ir/           # 中間表示 (IR) 定義
│   │   ├── nodes.ts      # IR 節點定義
│   │   ├── location.ts   # 源碼位置追蹤
│   │   └── transformer.ts # TypeScript AST → IR 轉換
│   ├── frontend/     # TypeScript 解析器
│   │   └── parser.ts     # TypeScript Compiler API 封裝
│   ├── backend/      # Go 程式碼產生器
│   ├── runtime/      # 執行時輔助函式
│   ├── utils/        # 工具函式
│   └── config/       # 配置選項
│       └── options.ts    # 編譯器配置
├── tests/
│   ├── golden/       # 黃金測試樣例
│   │   ├── *.ts          # TypeScript 輸入
│   │   └── expected/*.go # 預期 Go 輸出
│   ├── unit/         # 單元測試
│   └── e2e/          # 端到端測試
└── examples/         # 範例程式碼
```

## 核心 IR 型別系統

### 型別節點
- **PrimitiveType**: `number`, `string`, `boolean`, `void`, `any`, `unknown`, `never`
- **ArrayType**: 陣列型別
- **TupleType**: 元組型別
- **ObjectType**: 物件字面量型別
- **FunctionType**: 函式型別
- **UnionType**: 聯合型別 `A | B`
- **IntersectionType**: 交叉型別 `A & B`
- **TypeReference**: 型別引用（含泛型參數）
- **LiteralType**: 字面量型別

### 宣告節點
- **VariableDeclaration**: 變數宣告
- **FunctionDeclaration**: 函式宣告
- **ClassDeclaration**: 類別宣告
- **InterfaceDeclaration**: 介面宣告
- **TypeAliasDeclaration**: 型別別名
- **EnumDeclaration**: 列舉宣告

### 表達式節點
- **BinaryExpression**: 二元運算
- **UnaryExpression**: 一元運算
- **CallExpression**: 函式呼叫
- **MemberExpression**: 成員存取
- **AwaitExpression**: async/await
- **ConditionalExpression**: 三元運算
- **TemplateLiteral**: 模板字串

## 型別對映策略

### 基本型別

| TypeScript | Go (預設) | 可選策略 |
|-----------|----------|---------|
| `number` | `float64` | `int`, `contextual` |
| `string` | `string` | - |
| `boolean` | `bool` | - |
| `any` | `interface{}` | - |
| `unknown` | `interface{}` + 型別檢查 | - |
| `void` | 無返回值 | - |
| `Array<T>` | `[]T` | - |
| `Tuple<A,B>` | `struct{Item0 A; Item1 B}` | - |

### 進階型別

#### Union Types (`A | B`)

**策略 1: Tagged Union** (預設)
```go
type StringOrNumber struct {
    tag    int
    str    *string
    number *float64
}
```

**策略 2: Interface**
```go
type StringOrNumber interface {
    isStringOrNumber()
}
```

**策略 3: Any**
```go
type StringOrNumber interface{}
```

#### Intersection Types (`A & B`)

```go
type Person struct {
    Named    // 內嵌
    Aged     // 內嵌
    Located  // 內嵌
}
```

#### Optional Types (`T?`)

```go
// 使用指標
var email *string

// 或使用 sql.Null* 系列
var email sql.NullString
```

### 語義對映

#### Async/Await → Error Return

```typescript
async function fetchData(url: string): Promise<string> {
    const response = await fetch(url);
    return response.text();
}
```

```go
func FetchData(ctx context.Context, url string) (string, error) {
    response, err := fetch(ctx, url)
    if err != nil {
        return "", err
    }
    return response.Text()
}
```

#### Try/Catch → Error Handling

```typescript
try {
    doSomething();
} catch (err) {
    handleError(err);
} finally {
    cleanup();
}
```

```go
func wrapper() (err error) {
    defer func() {
        cleanup()
    }()

    if err := doSomething(); err != nil {
        return handleError(err)
    }
    return nil
}
```

#### Class → Struct + Methods

```typescript
class Counter {
    private count: number = 0;

    increment(): number {
        return ++this.count;
    }
}
```

```go
type Counter struct {
    count int
}

func (c *Counter) Increment() int {
    c.count++
    return c.count
}
```

## 配置選項

在 `ts2go.json` 中配置轉譯策略：

```json
{
  "numberStrategy": "float64",
  "unionStrategy": "tagged",
  "nullabilityStrategy": "pointer",
  "asyncStrategy": "sync",
  "errorHandling": "return",
  "goVersion": "1.22",
  "generateRuntime": true,
  "strict": true
}
```

### 可用選項

- **numberStrategy**: `float64` | `int` | `contextual`
- **unionStrategy**: `tagged` | `interface` | `any`
- **nullabilityStrategy**: `pointer` | `zero` | `sqlNull`
- **asyncStrategy**: `sync` | `future` | `errgroup`
- **errorHandling**: `return` | `panic`

## 黃金測試樣例

專案包含 10 個涵蓋核心功能的黃金測試：

1. **01-basic-types**: 基本型別、陣列、元組、可選參數
2. **02-interfaces-classes**: 介面、類別、繼承、靜態成員
3. **03-generics**: 泛型函式、類別、約束、多型別參數
4. **04-union-intersection**: Union/Intersection 型別、型別守衛
5. **05-async-await**: Promise、async/await、並行執行
6. **06-error-handling**: 錯誤處理、自訂錯誤、Result 模式
7. **07-enums-namespaces**: Enum、Namespace、模組合併
8. **08-arrays-iterators**: 陣列操作、迭代器、高階函式
9. **09-modules-imports**: 模組系統、import/export
10. **10-advanced-types**: Mapped types、Type guards、條件型別

每個測試樣例都包含：
- TypeScript 輸入檔案 (`tests/golden/*.ts`)
- 預期 Go 輸出檔案 (`tests/golden/expected/*.go`)

## 安裝與使用

### 安裝依賴

```bash
npm install
```

### 建構專案

```bash
npm run build
```

### 執行測試

```bash
# 所有測試
npm test

# 黃金測試
npm run test:golden

# 單元測試
npm run test:unit
```

### 使用 CLI

```bash
# 轉譯單一檔案
ts2go input.ts -o output.go

# 轉譯整個專案
ts2go src/ -o dist/

# 指定配置檔
ts2go src/ -c ts2go.json
```

## 開發路線圖

### ✅ 已完成
- [x] 專案骨架與 IR 型別定義
- [x] TypeScript Parser 實作
- [x] IR 轉換器核心框架
- [x] 10 個黃金測試樣例設計

### 🚧 進行中
- [ ] Go 程式碼產生器實作
- [ ] 測試框架建置

### 📋 計劃中
- [ ] Union/Intersection 完整支援
- [ ] Mapped/Conditional Types 處理
- [ ] Source Map 產生
- [ ] CLI 工具完善
- [ ] Runtime 輔助函式庫
- [ ] 效能優化與基準測試
- [ ] 文件與範例完善

## 語義陷阱清單

在開發過程中需要特別注意的語義差異：

1. **結構型 vs 名稱型**：TS 是結構型，Go 介面具名 + method set
2. **例外語義**：TS 任何東西都能 `throw`；Go 嚴格 `error`
3. **浮點與整數**：`number` 混用可能引入 truncation
4. **可選屬性**：Go 零值不等於「缺席」，多用指標或 `ok` pair
5. **this 綁定**：class method 與自由函式的 `this` 差異
6. **模組副作用**：ESM 順序與副作用初始化
7. **位元操作**：TS number 是 64-bit float；位運算以 32-bit 整數語義進行

## 貢獻指南

歡迎貢獻！請遵循以下步驟：

1. Fork 本專案
2. 建立 feature 分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

### 程式碼風格

- 使用 TypeScript strict 模式
- 遵循 ESLint 規則
- 為新功能添加測試
- 更新相關文件

## 授權

MIT License - 詳見 [LICENSE](LICENSE) 檔案

## 致謝

本專案靈感來自於對更好的跨語言轉譯工具的需求，特別感謝：

- TypeScript Compiler API 的優秀設計
- Go 語言的簡潔與高效
- 所有開源編譯器專案的先驅者們

## 聯絡方式

- Issues: [GitHub Issues](https://github.com/rainboltz/ts2go/issues)
- Discussions: [GitHub Discussions](https://github.com/rainboltz/ts2go/discussions)

---

**⚠️ 專案狀態**: 目前處於早期開發階段，API 可能會有重大變更。不建議用於生產環境。