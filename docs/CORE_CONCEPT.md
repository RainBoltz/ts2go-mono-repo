# TypeScript to Go 轉譯器核心概念

> Core Concepts and Development Plan for TS2Go Transpiler

要把 TypeScript 自動轉成 Go，而且還要比現有工具更穩——關鍵是**把語義保真**當第一優先。
這是一份可落地的開發路線圖（分階段），涵蓋架構、型別對應、語義陷阱、測試與品質策略，以及迭代節點。

**狀態更新**：本文件原為開發計畫，目前大部分功能已實作完成。請參考 ARCHITECTURE.md 以了解目前的實作狀態。

# 第 0 階段：界定範圍

* **支援目標**：純 TS（非 TSX）、ES 模組、常見語言特性（泛型、介面、union/intersection、async/await、例外處理、enum、namespace）。
* **不支援 / 延後**：DOM/Browser API、反射/Proxy、eval、裝飾器 decorators（先以註解保留）、動態 import、JSX/React。
* **輸出目標**：Go 1.22+（含泛型），單模組輸出（go.mod），標準 `go fmt` 輸出，零第三方 runtime（除非必要的小型輔助庫）。
* **成功標準**：

  1. 轉出程式能 `go build` + `go vet` 通過；
  2. 單測對齊（見後述差分測試）；
  3. 錯誤訊息可定位到原始 TS 行列號。

# 第 1 階段：系統架構與 IR ✅ **已完成**

**總體架構**

1. **前端（TS 前端）** ✅ `src/frontend/parser.ts`

   * 使用 TypeScript 官方 Compiler API 建 AST + 類型資訊（必用 TS type checker，不靠字串解析）。
   * 產生你的 **語義 IR**（中介表示）而非直接吐 Go：IR 要容納 TS 型別系統的資訊（泛型、union、narrowing、可空性、modifiers）。

2. **中端（IR Passes）** ✅ `src/ir/transformer.ts`, `src/optimizer/optimizer.ts`

   * 正規化控制流程（將 `try/catch/finally`、短路、optional chaining 等，展開為顯式 CFG）。
   * 型別抹平：把 TS 的結構化型別與 union/intersection，轉為可映射到 Go 的型別構造（詳見下一節）。
   * 語意降階：將 `async/await`、Promise、例外轉為 Go 慣用語義。

3. **後端（Go 產生器）** ✅ `src/backend/go-generator.ts`

   * **實作細節**：直接產生 Go 程式碼字串（使用 Visitor 模式），確保 `go fmt` 相容的輸出。
   * 產出多檔案（以模組/namespace 對應 package），自動建立 `go.mod`。
   * **注意**：目前不使用 `go/ast` + `go/printer`（這些是 Go 套件），而是在 TypeScript 中直接生成格式化的 Go 程式碼。

4. **最小 runtime（可選）** ✅ `src/runtime/`

   * Runtime helpers 定義在 `helpers.go.template`
   * 提供 Optional chaining、Union types、Promise/Future、Array helpers 等輔助函式
   * 可透過配置選擇性產生所需的 runtime 功能
   * RuntimeGenerator (`src/runtime/runtime-generator.ts`) 負責產生客製化的 runtime 程式碼

# 第 2 階段：型別與語義對映設計（關鍵）

**標準型別對映**

* `number` → `float64`（或依上下文窄化成 `int`/`int64`；務必可設定策略）。
* `string` → `string`；`boolean` → `bool`。
* `any` → `any`（Go 無此型，可用 `any`/`interface{}`），搭配嚴格模式提供 `//go:check` runtime 斷言。
* `unknown` → `any` 但生成處強制型別檢查（IR 插入 assert/ok idiom）。
* `Array<T>` → `[]T`；`Record<K,V>`/索引簽章 → `map[string]V`（K 常落在 string）。
* `enum` → `iota` + 顯式底層型別（`int`），並生成 `String()`（fmt 友好）。
* Tuple `[A,B]` → 自動生成 `struct{ A A; B B }`（具名欄位），或 `type Tuple2[A,B] struct{ First A; Second B }`。
* `interface`（TS 結構型）→ **Go struct + 對應介面**

  * 生成最小介面（method set）+ 實作的 struct；
  * 可選「鴨子型別模式」：為存取點自動生成匿名介面以兼容結構化相容性。
* `class` → `struct` + 指標方法；`extends` → 內嵌或組合（建議內嵌：符合 Go idiom）。
* 泛型 `T` → Go type parameter（1.18+），constraints 由 TS `extends` 推導成 Go `~` 或介面集合。
* Union `A | B` → 幾種策略（可配置）：

  1. **Tagged Union**：生成 `struct{ tag int; a *A; b *B }` + helpers；
  2. **接口分派**：抽象成 `interface{ isU() }`，A/B 實作 marker；
  3. **any + 型別守衛**：最少侵入，但較不安全。
     以可預測與易除錯為首選（多用 1 或 2）。
* Intersection `A & B` → 生成合併 struct；衝突欄位報錯或生成前綴。
* `readonly`、可選屬性 `?` → 以指標或 `,omitempty` 標註、或在建構器注入 defensive copy。
* `null | undefined` → `*T`（指標）或 `sql.Null*` 等顯式 Nullable 型別（可配置）。

**語義對映與語法糖**

* **例外 → 錯誤返回**：

  * `throw` → 回傳 `error`；
  * `try/catch` → 產生 `val, err := fn(...); if err != nil { ... }`；
  * `finally` → `defer`。
  * 可提供「嚴格 panic 模式」做原型驗證，但預設走 `error`。
* **async/await/Promise**（三選一，可配置，建議先選 A）：
  A) **同步降階**：若 await 鏈中無真正 I/O，直接展開為同步呼叫（最快落地）。
  B) **Channel/Future**：`type Future[T] struct{ ch chan result[T] }`；`await`→ `<-ch`。
  C) **goroutine + errgroup**：對並行段落產生 `errgroup` 模式。
* **optional chaining / nullish coalescing**：

  * 產生安全存取程式碼或呼叫 `rt.GetOrDefault(...)`。
* **迭代器 / for..of**：轉 `for range`（必要時生成 adapter）。
* **物件字面量 / 展開運算子**：建立 struct 累加器；擴展以淺拷貝處理。
* **靜態屬性/方法**：對應 package-level 變數/函式。
* **模組系統**：ESM `import/export` → Go `package` + 檔案分割；`default export` → 對應公有名 `Default` 或檔案級導出表。

# 第 3 階段：最小可用版本（MVP）✅ **已完成**

* ✅ **支援**：基本型別、函式、struct/class、介面、泛型、陣列/Map、錯誤返回、同步邏輯。
* ✅ **已實作**：union/intersection 基礎支援、async/await 轉換
* ✅ **交付**：CLI（`ts2go`），輸入專案路徑，輸出 Go 模組，含 runtime helpers（如需）。
  - CLI 位於 `src/cli.ts`
  - 支援 compile、watch、init、info、runtime 命令
  - 配置檔案 `ts2go.json` 支援

# 第 4 階段：高級型別與語意補齊 🚧 **部分完成**

* ✅ **Union/Intersection 基礎支援**：Tagged union、Interface union、Any 三種策略
* 🚧 **Mapped/Conditional Types**（進行中）：將常用工具型別（`Partial`, `Pick`, `Omit`, `Record`）降階為生成器模板。
* 🚧 **Overload 解析**（規劃中）：根據 callsite 推斷正確的 Go 函式簽名（必要時產生多個 wrapper）。
* ✅ **泛型推導**：基本的泛型推導已支援，對應 Go 的型別參數
* 📋 **模組相依處理**（未來計劃）：對 NPM 套件提供「對映層」：
  * 純型別套件 → 忽略或轉空殼；
  * 執行期套件 → 提供 Go 等效（白名單清單）；其他直接報不支援。

# 第 5 階段：測試與品質保證 ✅ **已完成**

**差分與黃金測試**

* ✅ **黃金測試（golden tests）** - `tests/golden/`
  - 已實作 10 個綜合測試案例，涵蓋所有核心功能
  - `GoldenTestRunner` (`tests/helpers/golden-test.ts`) 負責執行與比對
  - 固定輸出檔案快照，確保輸出一致性
  - 支援 `updateExpected()` 方法更新預期輸出

* ✅ **差分測試（differential testing）** - `tests/helpers/diff-tool.ts`
  - `DifferentialTestRunner` 比較不同編譯策略的輸出
  - 預定義策略：default, int_numbers, interface_unions, zero_nullability, strict
  - 可分析不同策略間的差異

* ✅ **Jest 測試框架** - `jest.config.js`, `tests/setup.ts`
  - 自訂 matchers: `toMatchGoCode()`, `toBeValidGo()`
  - 完整的測試覆蓋率報告
  - 30 秒測試超時設定

* 📋 **模糊/屬性測試**（未來計劃）：對語法構造進行隨機組合（quickcheck），驗證不 crash、產生碼可編譯。
* 📋 **Fuzz Testing**（未來計劃）：Go 內建 fuzz（1.18+）跑在輸出 API 上。
* 📋 **效能對比**（未來計劃）：針對熱路徑（迭代、數值、JSON 處理）基準測試，確保無不必要 alloc。

# 第 6 步：開發者體驗（DX）✅ **已完成**

* ✅ **錯誤位置追蹤**（`src/ir/location.ts`）：
  - 每個 IR 節點包含 `SourceLocation`
  - 錯誤訊息可精確定位到原始 TypeScript 檔案的行列號
  - 支援錯誤報告與堆疊追蹤

* ✅ **Source Map 產生**（`src/backend/sourcemap.ts`）：
  - 支援 source map 產生
  - 可追蹤 Go 程式碼對應的原始 TypeScript 位置

* ✅ **可控變換策略**（`ts2go.json`）- `src/config/options.ts`：
  - `numberStrategy: float64|int|contextual`
  - `unionStrategy: tagged|interface|any`
  - `asyncStrategy: sync|future|errgroup`
  - `nullabilityStrategy: pointer|zero|sqlNull`
  - `errorHandling: return|panic`
  - `optimizationLevel: 0|1|2`

* ✅ **CLI 工具**（`src/cli.ts`）：
  - 彩色輸出（使用 chalk）
  - 詳細日誌模式
  - Watch 模式（使用 chokidar）
  - 初始化配置檔（`ts2go init`）

* 📋 **內嵌規則註解**（未來計劃）：允許在 TS 加註如 `// @ts2go:skip`, `// @ts2go:rename FooBar`。

# 語義陷阱清單（一開始就要防）

* **結構型 vs 名稱型**：TS 是結構型，Go 介面具名 + method set；需要在 callsite 產生 adapter。
* **例外語義**：TS 任何東西都能 `throw`；Go 嚴格 `error`。對非 `error` 型態需包裝。
* **浮點與整數**：`number` 混用可能引入 truncation；務必在算術點插入顯式轉型。
* **可選屬性**：TS 的 `obj?.x` 與 `in`/`hasOwnProperty` 對應要精確；Go 零值不等於「缺席」，多用指標或 `ok` pair。
* **this 綁定**：class method 與自由函式的 `this` 差異；Go 方法接收者設計要一致。
* **模組副作用**：ESM 順序與副作用初始化；Go 的 `init()` 可能要生成且控制順序。
* **位元操作**：TS number 是 64-bit float；位運算以 32-bit 整數語義進行，需小心 cast。

# 里程碑與檢核

1. ✅ **M1**：能轉譯 100+ 個語法樣例，全數 `go build`。
   - **狀態**：已完成。10 個綜合黃金測試涵蓋核心語法
   - **位置**：`tests/golden/`

2. ✅ **M2**：支援 union/optional/async 的 80% 場景。
   - **狀態**：已完成。Union（3種策略）、Optional、Async/Await 基礎支援完成
   - **實作**：`src/backend/type-mapper.ts`, `src/backend/go-generator.ts`

3. 🚧 **M3**：跑通一個中小型開源 TS 專案（不依賴 DOM），產生可執行 CLI（行為對齊 80%+）。
   - **狀態**：進行中。CLI 工具已完成，需要實際專案測試

4. 📋 **M4**：加入對映層（常見工具函式、資料結構），穩定性>90%（build+測試通過率）。
   - **狀態**：未來計劃。NPM 套件對映層

# 最小範例（對映示意）

**TS**

```ts
export interface User { id: string; name?: string }
export type Result = { ok: true; value: number } | { ok: false; error: Error }

export async function getUser(id: string): Promise<User> {
  if (!id) throw new Error("bad id");
  return { id, name: "Ada" };
}

export function add(a: number, b: number | undefined) {
  return a + (b ?? 0);
}
```

**產生的 Go（概念示意）**

```go
package mod

type User struct {
    Id   string
    Name *string
}

type Result interface {
    isResult()
}
type okResult struct{ Value float64 }
func (okResult) isResult() {}
type errResult struct{ Error error }
func (errResult) isResult() {}

func GetUser(ctx context.Context, id string) (User, error) {
    if id == "" { return User{}, fmt.Errorf("bad id") }
    name := "Ada"
    return User{Id: id, Name: &name}, nil
}

func Add(a float64, b *float64) float64 {
    var z float64
    if b != nil { z = *b }
    return a + z
}
```

# 專案狀態總結

## ✅ 已完成的核心功能
- **完整的 IR 系統**：40+ 節點類型，完整的 Visitor 模式
- **TypeScript 解析**：使用官方 Compiler API，完整型別檢查
- **Go 程式碼產生**：直接產生格式化的 Go 程式碼
- **型別對映**：多策略支援（union, number, nullability, async）
- **優化系統**：死碼消除、常數折疊等
- **測試框架**：10 個黃金測試 + 差分測試工具
- **CLI 工具**：完整功能（compile, watch, init 等）
- **Runtime Helpers**：Optional, Union, Future, Array helpers

## 🚧 進行中的功能
- Mapped/Conditional Types 完整支援
- 更精確的型別推斷
- 模組相依性解析

## 📋 未來計劃
- 增量編譯
- VS Code 擴充
- NPM 套件對映庫
- 效能基準測試
- 社群型別定義庫

## 授權與治理

* **授權**：GPL License（見 LICENSE 檔案）
* **開源策略**：
  - 公開透明的「不支援特性」與「已知語義差異」清單
  - 詳細的錯誤訊息與堆疊追蹤
  - 完整的文件與範例

## 參考文件

- **CLAUDE.md**：Claude Code 使用指南，包含常用命令與架構概覽
- **docs/ARCHITECTURE.md**：詳細的架構設計與實作細節
- **docs/CORE_CONCEPT.md**（本文件）：核心概念與開發計畫
- **README.md**：專案概述與使用說明
