# TypeScript to Go 轉譯器開發計畫

要把 TypeScript 自動轉成 Go，而且還要比現有工具更穩——關鍵是**把語義保真**當第一優先。
這是一份可落地的開發路線圖（分階段），涵蓋架構、型別對應、語義陷阱、測試與品質策略，以及迭代節點。

# 第 0 階段：界定範圍

* **支援目標**：純 TS（非 TSX）、ES 模組、常見語言特性（泛型、介面、union/intersection、async/await、例外處理、enum、namespace）。
* **不支援 / 延後**：DOM/Browser API、反射/Proxy、eval、裝飾器 decorators（先以註解保留）、動態 import、JSX/React。
* **輸出目標**：Go 1.22+（含泛型），單模組輸出（go.mod），標準 `go fmt` 輸出，零第三方 runtime（除非必要的小型輔助庫）。
* **成功標準**：

  1. 轉出程式能 `go build` + `go vet` 通過；
  2. 單測對齊（見後述差分測試）；
  3. 錯誤訊息可定位到原始 TS 行列號。

# 第 1 階段：系統架構與 IR

**總體架構**

1. **前端（TS 前端）**

   * 使用 TypeScript 官方 Compiler API 建 AST + 類型資訊（必用 TS type checker，不靠字串解析）。
   * 產生你的 **語義 IR**（中介表示）而非直接吐 Go：IR 要容納 TS 型別系統的資訊（泛型、union、narrowing、可空性、modifiers）。
2. **中端（IR Passes）**

   * 正規化控制流程（將 `try/catch/finally`、短路、optional chaining 等，展開為顯式 CFG）。
   * 型別抹平：把 TS 的結構化型別與 union/intersection，轉為可映射到 Go 的型別構造（詳見下一節）。
   * 語意降階：將 `async/await`、Promise、例外轉為 Go 慣用語義。
3. **後端（Go 產生器）**

   * 使用 `go/ast` + `go/printer` 產碼；確保 `go fmt` 一致。
   * 產出多檔案（以模組/namespace 對應 package），自動建立 `go.mod`。
4. **最小 runtime（可選）**

   * 放在 `internal/rt`：提供 Optional chaining、深等值比較、Promise/Future（若你選此路徑）等輔助函式。嚴控體積與可見性。

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

# 第 3 階段：最小可用版本（MVP）

* 支援：基本型別、函式、struct/class、介面、泛型、陣列/Map、錯誤返回、同步邏輯。
* 限制：不含 union/intersection、async/await、高級型別運算（mapped/conditional types）。
* 交付：CLI（`ts2go`），輸入專案路徑，輸出 Go 模組，含 `go.mod`、`internal/rt`（如需）。

# 第 4 階段：高級型別與語意補齊

* **Union/Intersection 完整化**（含型別收斂與 narrowing）。
* **Mapped/Conditional Types**：將常用工具型別（`Partial`, `Pick`, `Omit`, `Record`）降階為生成器模板。
* **Overload 解析**：根據 callsite 推斷正確的 Go 函式簽名（必要時產生多個 wrapper）。
* **泛型推導**：從實參推得 type args；對應 Go 的型別參數推導。
* **模組相依處理**：對 NPM 套件提供「對映層」：

  * 純型別套件 → 忽略或轉空殼；
  * 執行期套件 → 提供 Go 等效（白名單清單）；其他直接報不支援。

# 第 5 階段：測試與品質保證

**差分與黃金測試**

* **黃金測試（golden tests）**：針對最小案例與邊界條件，固定輸出檔案快照（含 gofmt）。
* **差分測試（differential testing）**：

  1. 對 TS 原始碼執行 `tsc --noEmit` + 你的 type checker 步驟，收集期望語義；
  2. 轉譯後 `go build`、`go vet`、`staticcheck`；
  3. 若有對齊的單元測試（Jest/Vitest），以同等邏輯改寫為 Go 測試（或以 IR 產生 Go test），比較行為。
* **模糊/屬性測試**：對語法構造進行隨機組合（quickcheck），驗證不 crash、產生碼可編譯。
* **Fuzz**：Go 內建 fuzz（1.18+）跑在輸出 API 上。
* **效能對比**：針對熱路徑（迭代、數值、JSON 處理）基準測試，確保無不必要 alloc。

# 第 6 步：開發者體驗（DX）

* **錯誤與警告層級**：

  * E100x：語義不保證；E200x：不支援特性；W300x：降階但可能變語義。
* **來源對映（source map）**：輸出 `//line` 註解或對映檔，支援除錯與報錯回指 TS 行列。
* **可控變換策略**（`ts2go.json`）：

  * `numberStrategy: float64|int|contextual`
  * `unionStrategy: tagged|iface|any`
  * `asyncStrategy: sync|future|errgroup`
  * `nullability: pointer|zero|sqlNull`
* **內嵌規則註解**：允許在 TS 加註如 `// @ts2go:skip`, `// @ts2go:rename FooBar`。

# 語義陷阱清單（一開始就要防）

* **結構型 vs 名稱型**：TS 是結構型，Go 介面具名 + method set；需要在 callsite 產生 adapter。
* **例外語義**：TS 任何東西都能 `throw`；Go 嚴格 `error`。對非 `error` 型態需包裝。
* **浮點與整數**：`number` 混用可能引入 truncation；務必在算術點插入顯式轉型。
* **可選屬性**：TS 的 `obj?.x` 與 `in`/`hasOwnProperty` 對應要精確；Go 零值不等於「缺席」，多用指標或 `ok` pair。
* **this 綁定**：class method 與自由函式的 `this` 差異；Go 方法接收者設計要一致。
* **模組副作用**：ESM 順序與副作用初始化；Go 的 `init()` 可能要生成且控制順序。
* **位元操作**：TS number 是 64-bit float；位運算以 32-bit 整數語義進行，需小心 cast。

# 里程碑與檢核

1. **M1**：能轉譯 100+ 個語法樣例，全數 `go build`。
2. **M2**：支援 union/optional/async 的 80% 場景。
3. **M3**：跑通一個中小型開源 TS 專案（不依賴 DOM），產生可執行 CLI（行為對齊 80%+）。
4. **M4**：加入對映層（常見工具函式、資料結構），穩定性>90%（build+測試通過率）。

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

# 團隊與實作建議

* **語意工程師（TS/Go 雙棲）** ×2：負責 IR 設計與對映規則。
* **編譯器工程師** ×1：CFG、pass 管線、產碼、效能。
* **測試工程師** ×1：黃金/差分/模糊/基準。
* **時間箱**：MVP 約 6–8 週，完整版 3–4 個月（依功能取捨）。

# 開源策略與治理

* 採 MIT/Apache-2.0。
* 建議建立「不支援特性白名單」與「已知語義差異清單」，公開透明。
* 加入 `--explain` 模式：對每個降階提供人類可讀的說明，便於除錯與社群貢獻。
