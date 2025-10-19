# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TS2Go is a TypeScript-to-Go transpiler that emphasizes **semantic preservation**. The goal is to generate readable, idiomatic, and type-safe Go code that maintains the same semantics as the original TypeScript.

## Core Architecture

### Three-Stage Compilation Pipeline

```
TypeScript → IR (Intermediate Representation) → Go
    ↓              ↓                              ↓
  Frontend       Middle-end                    Backend
```

1. **Frontend** (`src/frontend/`): Uses TypeScript Compiler API to parse and type-check
2. **IR** (`src/ir/`): Language-agnostic intermediate representation with 40+ node types
3. **Backend** (`src/backend/`): Generates Go code using visitor pattern

### Key Design Principles

- **Visitor Pattern**: All IR transformations use the `IRVisitor<T>` interface
- **Semantic Preservation**: TypeScript semantics are preserved through IR metadata
- **Configurable Strategies**: Multiple type mapping strategies (see Configuration below)

## Essential Commands

### Development
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to JavaScript
npm run dev          # Watch mode for development
```

### Testing
```bash
npm test             # Run all tests
npm run test:golden  # Run golden tests only
npm run test:unit    # Run unit tests only
npm run test:e2e     # Run end-to-end tests

# Run specific test file
npx jest tests/golden/golden.test.ts

# Run single test case
npx jest -t "01-basic-types"

# Run with coverage
npm test -- --coverage
```

### Linting
```bash
npm run lint         # Run ESLint on source files
```

### CLI Usage
```bash
# After building
node dist/cli.js compile input.ts -o output.go
node dist/cli.js watch src/ -o dist/
node dist/cli.js init  # Create ts2go.json config
```

## Code Organization

### IR System (`src/ir/nodes.ts`)

The IR is the heart of the transpiler. Key node hierarchies:

- **IRType**: PrimitiveType, ArrayType, UnionType, IntersectionType, etc.
- **Declaration**: VariableDeclaration, FunctionDeclaration, ClassDeclaration, etc.
- **Statement**: IfStatement, ForStatement, TryStatement, etc.
- **Expression**: BinaryExpression, CallExpression, MemberExpression, etc.

All nodes extend `IRNode` and implement `accept<T>(visitor: IRVisitor<T>): T`.

### Compilation Flow

```
Compiler.compileFile(path)
  ↓
TypeScriptParser.parseFile(path)        // Uses ts.createProgram()
  ↓
IRTransformer.transform(tsAst)          // AST → IR
  ↓
IROptimizer.optimize(irModule)          // Dead code elimination, etc.
  ↓
GoCodeGenerator.generate(irModule)      // IR → Go code
```

### Type Mapping (`src/backend/type-mapper.ts`)

TypeMapper handles TypeScript-to-Go type conversions:
- `mapType(type: IRType): string` - Main entry point
- `mapOptionalType(type: IRType): string` - Handles nullable types
- Uses `CompilerOptions` to select strategy (tagged union vs interface union, etc.)

### Backend Generator (`src/backend/go-generator.ts`)

GoCodeGenerator implements `IRVisitor<string>`:
- Maintains indentation state and import tracking
- Generates Go code by visiting each IR node
- Special handling for unions (tagged/interface/any strategies)
- Async functions → context.Context + error returns
- Classes → structs with constructor functions and pointer receiver methods

## Configuration System

The transpiler supports multiple strategies via `CompilerOptions`:

### Type Strategies
- **numberStrategy**: `float64` (default) | `int` | `contextual`
- **unionStrategy**: `tagged` (default) | `interface` | `any`
- **nullabilityStrategy**: `pointer` (default) | `zero` | `sqlNull`
- **asyncStrategy**: `sync` (default) | `future` | `errgroup`

### Example: Union Type Strategies

**Tagged Union** (default):
```go
type Result struct {
    tag    int
    value0 *Success
    value1 *Error
}
```

**Interface Union**:
```go
type Result interface { isResult() }
type SuccessResult struct { ... }
func (SuccessResult) isResult() {}
```

## Testing Architecture

### Golden Tests (`tests/golden/`)

10 comprehensive test cases covering core TypeScript features:
1. **01-basic-types**: Basic types, arrays, tuples, optional parameters
2. **02-interfaces-classes**: Interfaces, classes, inheritance, static members
3. **03-generics**: Generic functions, classes, constraints, multi-type parameters
4. **04-union-intersection**: Union/Intersection types, type guards
5. **05-async-await**: Promise, async/await, concurrent execution
6. **06-error-handling**: Error handling, custom errors, Result pattern
7. **07-enums-namespaces**: Enum, namespace, module merging
8. **08-arrays-iterators**: Array operations, iterators, higher-order functions
9. **09-modules-imports**: Module system, import/export
10. **10-advanced-types**: Mapped types, type guards, conditional types

Each test has:
- Input: `tests/golden/XX-name.ts`
- Expected: `tests/golden/expected/XX-name.go`

### Test Helpers

- **`GoldenTestRunner`** (`tests/helpers/golden-test.ts`): Compiles TS and compares with expected Go output
  - `runGoldenTest()`: Execute single test case
  - `runAllGoldenTests()`: Batch execution
  - `updateExpected()`: Update expected output files
- **`DifferentialTestRunner`** (`tests/helpers/diff-tool.ts`): Compares different compilation strategies
- **Module Alias**: Tests use `@/` to reference `src/` directory
- **Custom Jest Matchers**: `toMatchGoCode()`, `toBeValidGo()` (configured in `tests/setup.ts`)

## Runtime Helpers (`src/runtime/`)

Generated Go runtime provides:
- **OptionalValue[T]**: Optional chaining support
- **Union2/Union3[A, B, C]**: Union type helpers with type guards
- **Future[T]**: Promise/async support with Then/Catch/Finally
- **Array helpers**: Map, Filter, Reduce, etc.

Runtime code is generated from `helpers.go.template` and can be customized per compilation.

## Optimization System (`src/optimizer/`)

IROptimizer runs multiple passes based on `optimizationLevel` (0-2):

**Level 1**: Basic optimizations
- Dead code elimination
- Constant folding

**Level 2**: Advanced optimizations
- Type simplification
- Control flow normalization
- Function inlining (if enabled)

Add custom passes by implementing `OptimizationPass` interface.

## Semantic Traps to Avoid

When working on the transpiler, be aware of TypeScript→Go semantic differences:

1. **Structural vs Nominal**: TypeScript uses structural typing; Go interfaces are nominal
2. **Exception Semantics**: TypeScript can throw anything; Go uses strict `error` values
3. **Number Types**: TS `number` is float64, but bitwise ops use int32 semantics
4. **Optional Properties**: Go zero values ≠ "absent"; use pointers or sentinel values
5. **this Binding**: Class methods have implicit `this`; Go methods are explicit receivers
6. **Module Side Effects**: ESM initialization order vs Go init() functions

## Key Invariants

When modifying the codebase:

- **Preserve Source Locations**: Always propagate `SourceLocation` through IR nodes for error reporting
- **Maintain Visitor Completeness**: All IR node types must have corresponding visitor methods
- **Test Golden Cases**: Changes affecting code generation must update expected outputs
- **Export Naming**: Go exports require capitalized names; use `capitalize()` helper
- **Modifier Preservation**: Track TypeScript modifiers (export, private, etc.) in IR for correct Go generation

## Adding New Features

### New IR Node Type
1. Add node class to `src/ir/nodes.ts` extending appropriate base class
2. Add visitor method to `IRVisitor<T>` interface (bottom of `nodes.ts`)
3. Implement in `IRTransformer` (`src/ir/transformer.ts`) - TS AST → IR
4. Implement in `GoCodeGenerator` (`src/backend/go-generator.ts`) - IR → Go
5. Add to `SymbolCollector` if used in dead code elimination (`src/optimizer/optimizer.ts`)
6. Create golden test case in `tests/golden/`

### New Type Mapping Strategy
1. Add option to `CompilerOptions` in `src/config/options.ts`
2. Implement logic in `TypeMapper.mapType()` or specialized methods (`src/backend/type-mapper.ts`)
3. Handle in `GoCodeGenerator` visitor methods
4. Add differential test comparing strategies

### New Optimization Pass
1. Create class implementing `OptimizationPass` in `src/optimizer/`
2. Register in `IROptimizer.initializePasses()`
3. Test with golden cases to ensure correctness

## Development Utilities

### Utility Scripts
Several utility scripts exist in the root directory for testing and development:
- `test-compile.js`: Quick compilation testing
- `update-all-expected.js`: Update all golden test expected outputs
- `test-*.js`: Various debugging and testing utilities

These are development-only scripts and should not be committed for production use.
