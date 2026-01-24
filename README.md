# TS2Go - TypeScript to Go Transpiler

A TypeScript-to-Go transpiler that emphasizes **semantic preservation**, generating readable, idiomatic, and type-safe Go code.

## Features

- **Semantic Preservation**: Ensures transpiled Go code maintains the same semantics as the original TypeScript
- **Complete Type System**: Supports generics, Union/Intersection types, Mapped Types, and other advanced type features
- **Configurable Strategies**: Multiple type mapping and semantic transformation strategies
- **Clear Error Messages**: Precise error location tracking to original TypeScript source
- **Idiomatic Go Output**: Generates code following Go community best practices

## Architecture

### Three-Stage Compilation Pipeline

```
TypeScript → IR (Intermediate Representation) → Go
    ↓              ↓                              ↓
  Frontend       Middle-end                    Backend
```

1. **Frontend**: Uses TypeScript Compiler API to build AST and type information
2. **Middle-end**: Control flow normalization, type flattening, semantic lowering
3. **Backend**: Generates Go code using visitor pattern

### Directory Structure

```
ts2go-mono-repo/
├── src/
│   ├── compiler/      # Main compiler interface
│   ├── ir/            # Intermediate Representation (IR) definitions
│   │   ├── nodes.ts       # IR node definitions
│   │   ├── location.ts    # Source location tracking
│   │   └── transformer.ts # TypeScript AST → IR transformation
│   ├── frontend/      # TypeScript parser
│   │   └── parser.ts      # TypeScript Compiler API wrapper
│   ├── backend/       # Go code generator
│   │   ├── go-generator.ts # IR → Go code generation
│   │   ├── type-mapper.ts  # Type mapping strategies
│   │   └── sourcemap.ts    # Source map generation
│   ├── runtime/       # Runtime helper functions
│   ├── optimizer/     # Optimization passes
│   └── config/        # Configuration options
│       └── options.ts     # Compiler configuration
├── tests/
│   ├── golden/        # Golden test cases
│   │   ├── *.ts           # TypeScript input
│   │   └── expected/*.go  # Expected Go output
│   ├── unit/          # Unit tests
│   └── e2e/           # End-to-end tests
└── examples/          # Example code
```

## Core IR Type System

### Type Nodes
- **PrimitiveType**: `number`, `string`, `boolean`, `void`, `any`, `unknown`, `never`
- **ArrayType**: Array types
- **TupleType**: Tuple types
- **ObjectType**: Object literal types
- **FunctionType**: Function types
- **UnionType**: Union types `A | B`
- **IntersectionType**: Intersection types `A & B`
- **TypeReference**: Type references (including generic parameters)
- **LiteralType**: Literal types

### Declaration Nodes
- **VariableDeclaration**: Variable declarations
- **FunctionDeclaration**: Function declarations
- **ClassDeclaration**: Class declarations
- **InterfaceDeclaration**: Interface declarations
- **TypeAliasDeclaration**: Type aliases
- **EnumDeclaration**: Enum declarations

### Expression Nodes
- **BinaryExpression**: Binary operations
- **UnaryExpression**: Unary operations
- **CallExpression**: Function calls
- **MemberExpression**: Member access
- **AwaitExpression**: async/await
- **ConditionalExpression**: Ternary operations
- **TemplateLiteral**: Template strings

## Type Mapping Strategies

### Basic Types

| TypeScript | Go (Default) | Alternative Strategies |
|-----------|--------------|------------------------|
| `number` | `float64` | `int`, `contextual` |
| `string` | `string` | - |
| `boolean` | `bool` | - |
| `any` | `interface{}` | - |
| `unknown` | `interface{}` + type checks | - |
| `void` | no return value | - |
| `Array<T>` | `[]T` | - |
| `Tuple<A,B>` | `struct{Item0 A; Item1 B}` | - |

### Advanced Types

#### Union Types (`A | B`)

**Strategy 1: Tagged Union** (default)
```go
type StringOrNumber struct {
    tag    int
    str    *string
    number *float64
}
```

**Strategy 2: Interface**
```go
type StringOrNumber interface {
    isStringOrNumber()
}
```

**Strategy 3: Any**
```go
type StringOrNumber interface{}
```

#### Intersection Types (`A & B`)

```go
type Person struct {
    Named    // embedded
    Aged     // embedded
    Located  // embedded
}
```

#### Optional Types (`T?`)

```go
// Using pointers
var email *string

// Or using sql.Null* series
var email sql.NullString
```

### Semantic Mappings

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

## Configuration Options

Configure transpilation strategies in `ts2go.json`:

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

### Available Options

- **numberStrategy**: `float64` | `int` | `contextual`
- **unionStrategy**: `tagged` | `interface` | `any`
- **nullabilityStrategy**: `pointer` | `zero` | `sqlNull`
- **asyncStrategy**: `sync` | `future` | `errgroup`
- **errorHandling**: `return` | `panic`

## Golden Test Cases

The project includes 10 golden tests covering core features:

| Test | Description | Status |
|------|-------------|--------|
| 01-basic-types | Basic types, arrays, tuples, optional parameters | ✅ Passing |
| 02-interfaces-classes | Interfaces, classes, inheritance, static members | ✅ Passing |
| 03-generics | Generic functions, classes, constraints, multi-type parameters | ✅ Passing |
| 04-union-intersection | Union/Intersection types, type guards | 🚧 In Progress |
| 05-async-await | Promise, async/await, concurrent execution | 🚧 In Progress |
| 06-error-handling | Error handling, custom errors, Result pattern | 🚧 In Progress |
| 07-enums-namespaces | Enum, Namespace, module merging | 🚧 In Progress |
| 08-arrays-iterators | Array operations, iterators, higher-order functions | 🚧 In Progress |
| 09-modules-imports | Module system, import/export | 🚧 In Progress |
| 10-advanced-types | Mapped types, Type guards, conditional types | 🚧 In Progress |

Each test case includes:
- TypeScript input file (`tests/golden/*.ts`)
- Expected Go output file (`tests/golden/expected/*.go`)

## Installation & Usage

### Install Dependencies

```bash
npm install
```

### Build Project

```bash
npm run build
```

### Run Tests

```bash
# All tests
npm test

# Golden tests only
npm run test:golden

# Unit tests
npm run test:unit
```

### CLI Usage

```bash
# Transpile a single file
ts2go input.ts -o output.go

# Transpile entire project
ts2go src/ -o dist/

# Specify configuration file
ts2go src/ -c ts2go.json
```

## Development Roadmap

### ✅ Completed
- [x] Project skeleton and IR type definitions
- [x] TypeScript Parser implementation
- [x] IR transformer core framework
- [x] 10 golden test case designs
- [x] Go code generator complete implementation
- [x] Type mapping strategy system (TypeMapper)
- [x] Source Map generation
- [x] Test framework setup (Jest + Golden Tests)
- [x] Differential testing tool
- [x] CLI tool complete implementation
- [x] Runtime helper library (Optional, Union, Future, Array helpers)
- [x] Optimization system (Dead Code Elimination, Constant Folding, etc.)
- [x] Basic types, interfaces, classes support (Tests 01-03)
- [x] Generics with constraints and type parameter propagation
- [x] Watch mode
- [x] Array method transformations (.map, .filter, .reduce)
- [x] Type predicate and type guard support
- [x] Discriminated union detection and handling

### 🚧 In Progress
- [ ] Union/Intersection complete implementation (Test 04)
- [ ] Async/await semantic mapping (Test 05)
- [ ] Error handling patterns (Test 06)
- [ ] Enum and namespace handling (Test 07)
- [ ] Iterator and higher-order function support (Test 08)
- [ ] Module dependency resolution (Test 09)
- [ ] Mapped/Conditional types processing (Test 10)

### 📋 Planned
- [ ] Performance optimization and benchmarking
- [ ] Incremental compilation support
- [ ] Additional language features (Decorators, Reflection)
- [ ] Production stability improvements
- [ ] Documentation and examples

## Semantic Traps

Important semantic differences to be aware of when working with this transpiler:

1. **Structural vs Nominal**: TypeScript uses structural typing; Go interfaces are nominal with method sets
2. **Exception Semantics**: TypeScript can throw anything; Go uses strict `error` values
3. **Float and Integer**: `number` mixing may introduce truncation
4. **Optional Properties**: Go zero values ≠ "absent"; use pointers or `ok` pairs
5. **this Binding**: Difference between class methods and free functions' `this`
6. **Module Side Effects**: ESM order and side effect initialization
7. **Bitwise Operations**: TS number is 64-bit float; bitwise ops use 32-bit integer semantics

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork this project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Add tests for new features
- Update relevant documentation

## License

GPL-2.0 License - See [LICENSE](LICENSE) file for details

## Acknowledgments

This project is inspired by the need for better cross-language transpilation tools. Special thanks to:

- TypeScript Compiler API's excellent design
- Go language's simplicity and efficiency
- All pioneers of open source compiler projects

## Contact

- Issues: [GitHub Issues](https://github.com/rainboltz/ts2go/issues)
- Discussions: [GitHub Discussions](https://github.com/rainboltz/ts2go/discussions)

---

**Project Status**: Currently in early development (v0.1.0). 3 of 10 golden tests passing. API may have breaking changes. Not recommended for production use.
