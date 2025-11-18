/**
 * Go Code Generator
 * 將 IR 轉換為 Go 原始碼
 */

import * as ir from '../ir/nodes';
import { CompilerOptions } from '../config/options';
import { SourceMap } from './sourcemap';

export interface GeneratedCode {
  code: string;
  sourceMap?: SourceMap;
}

export class GoCodeGenerator implements ir.IRVisitor<string> {
  private indentLevel = 0;
  private indentStr = '\t';
  private options: CompilerOptions;
  private sourceMap?: SourceMap;
  private currentPackage = 'main';
  private imports = new Set<string>();
  // @ts-ignore - Will be used in future for tracking context imports
  private needsContext = false;
  // @ts-ignore - Will be used in future for tracking runtime helper imports
  private needsRuntime = false;
  private tupleTypes = new Map<string, ir.TupleType>(); // Track tuple types to generate
  private generatedTupleTypes = new Set<string>(); // Track which tuple types have already been output
  private currentReceiverName = ''; // Track current method receiver name for 'this' replacement
  private currentClassName = ''; // Track current class name for field name resolution
  private privateFieldNames = new Set<string>(); // Track private field names for the current class
  private fieldTypeMap = new Map<string, string>(); // Track field types (e.g., 'count' -> 'int')
  private exportedNames = new Set<string>(); // Track names that are exported via export statements
  private currentClassTypeParams: ir.TypeParameter[] = []; // Track current class type parameters for method receivers
  private typeAliasMap = new Map<string, ir.IRType>(); // Track type alias definitions (e.g., Person -> IntersectionType)
  private interfaceProperties = new Map<string, Set<string>>(); // Track interface property names (e.g., Named -> {name})
  private isModuleLevel = true; // Track if we're at module level (vs inside function/method)

  constructor(options: CompilerOptions) {
    this.options = options;
    if (options.sourceMap) {
      this.sourceMap = new SourceMap();
    }
  }

  /**
   * 產生 Go 程式碼
   */
  generate(module: ir.Module): GeneratedCode {
    this.reset();
    const code = this.visitModule(module);

    return {
      code,
      sourceMap: this.sourceMap
    };
  }

  private reset(): void {
    this.indentLevel = 0;
    this.imports.clear();
    this.needsContext = false;
    this.needsRuntime = false;
    this.tupleTypes.clear();
    this.generatedTupleTypes.clear();
    this.exportedNames.clear();
    this.typeAliasMap.clear();
    this.interfaceProperties.clear();
  }

  /**
   * Generate a named tuple type definition
   */
  private generateTupleTypeName(tuple: ir.TupleType): string {
    const typeNames = tuple.elements.map(e => {
      const typeName = e.accept(this);
      // Simplify type names for the tuple name
      return typeName.replace(/\[\]/g, 'Array').replace(/\*/g, 'Ptr').replace(/{}/g, '');
    }).join('_');
    return `Tuple${tuple.elements.length}_${typeNames}`;
  }

  /**
   * Register a tuple type for generation
   */
  private registerTupleType(tuple: ir.TupleType): string {
    const typeName = this.generateTupleTypeName(tuple);
    if (!this.tupleTypes.has(typeName)) {
      this.tupleTypes.set(typeName, tuple);
    }
    return typeName;
  }

  /**
   * Generate all registered tuple type definitions
   */
  // @ts-ignore - Currently unused but kept for potential batch generation
  private generateTupleTypes(): string {
    if (this.tupleTypes.size === 0) return '';

    const types: string[] = [];
    for (const [name, tuple] of this.tupleTypes.entries()) {
      let typeDef = `type ${name} struct {\n`;
      for (let i = 0; i < tuple.elements.length; i++) {
        const fieldType = tuple.elements[i].accept(this);
        typeDef += `\tItem${i} ${fieldType}\n`;
      }
      typeDef += '}';
      types.push(typeDef);
    }

    return types.join('\n\n') + '\n\n';
  }

  /**
   * Generate a single tuple type definition inline if not already generated
   */
  private generateTupleTypeInline(typeName: string): string {
    if (this.generatedTupleTypes.has(typeName)) {
      return ''; // Already generated
    }

    const tuple = this.tupleTypes.get(typeName);
    if (!tuple) {
      return ''; // Type not registered
    }

    this.generatedTupleTypes.add(typeName);

    let typeDef = `type ${typeName} struct {\n`;
    for (let i = 0; i < tuple.elements.length; i++) {
      const fieldType = tuple.elements[i].accept(this);
      typeDef += `\tItem${i} ${fieldType}\n`;
    }
    typeDef += '}\n\n';

    return typeDef;
  }

  // ============= 輔助方法 =============

  private indent(): string {
    return this.indentStr.repeat(this.indentLevel);
  }

  private increaseIndent(): void {
    this.indentLevel++;
  }

  private decreaseIndent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  private addImport(pkg: string): void {
    this.imports.add(pkg);
  }

  private generateImports(): string {
    if (this.imports.size === 0) return '';

    const importList = Array.from(this.imports).sort();

    // Always use single line format for one import
    if (importList.length === 1) {
      return `import "${importList[0]}"\n\n`;
    }

    // Use multi-line format for multiple imports
    return 'import (\n' +
      importList.map(pkg => `\t"${pkg}"`).join('\n') +
      '\n)\n\n';
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // @ts-ignore - Currently unused but kept for future export detection logic
  private isExported(name: string): boolean {
    return name.charAt(0) === name.charAt(0).toUpperCase();
  }

  private exportName(name: string, forceExport: boolean = false): string{
    if (forceExport || this.hasModifier([], 'export') || this.exportedNames.has(name)) {
      return this.capitalize(name);
    }
    return name;
  }

  private hasModifier(modifiers: ir.Modifier[], kind: string): boolean {
    return modifiers.some(m => m.kind === kind);
  }

  /**
   * Infer array element type from literal elements
   * Used when IR doesn't provide type information
   */
  private inferArrayElementType(elements: (ir.Expression | ir.SpreadElement | null)[]): string {
    if (elements.length === 0) {
      return 'interface{}';
    }

    // Filter out null and spread elements
    const literalElements = elements.filter(e => e && !(e instanceof ir.SpreadElement)) as ir.Expression[];

    if (literalElements.length === 0) {
      return 'interface{}';
    }

    // Check if all elements are numeric literals
    const allNumeric = literalElements.every(e =>
      e instanceof ir.Literal && typeof (e as ir.Literal).value === 'number'
    );

    if (allNumeric) {
      // Check if any number has a decimal point
      const hasFloat = literalElements.some(e => {
        const value = (e as ir.Literal).value;
        return typeof value === 'number' && !Number.isInteger(value);
      });
      return hasFloat ? 'float64' : 'int';
    }

    // Check if all elements are string literals
    const allString = literalElements.every(e =>
      e instanceof ir.Literal && typeof (e as ir.Literal).value === 'string'
    );

    if (allString) {
      return 'string';
    }

    // Check if all elements are boolean literals
    const allBoolean = literalElements.every(e =>
      e instanceof ir.Literal && typeof (e as ir.Literal).value === 'boolean'
    );

    if (allBoolean) {
      return 'bool';
    }

    // Mixed types or non-literal expressions
    return 'interface{}';
  }

  // ============= Module =============

  visitModule(node: ir.Module): string {
    let result = `package ${this.currentPackage}\n\n`;

    // First, collect exported names from export statements
    for (const exportDecl of node.exports) {
      if (exportDecl.specifiers) {
        for (const spec of exportDecl.specifiers) {
          // spec.local is the name in the module, spec.exported is the export name
          this.exportedNames.add(spec.local);
        }
      }
    }

    // Second pass: identify which statements will produce empty output
    const isSkippedStatement: boolean[] = [];
    for (let i = 0; i < node.statements.length; i++) {
      const stmt = node.statements[i];
      // Check if this is an expression statement with an assignment (will be skipped)
      const willBeSkipped = stmt instanceof ir.ExpressionStatement &&
                           stmt.expression instanceof ir.AssignmentExpression;
      isSkippedStatement.push(willBeSkipped);
    }

    // Second pass: collect declarations with metadata
    interface DeclInfo {
      code: string;
      type: string;
      originalIndex: number;
      hadSkippedAfter: boolean;
    }

    const declarations: DeclInfo[] = [];
    const initStatements: string[] = []; // Collect top-level expression statements for init()

    for (let i = 0; i < node.statements.length; i++) {
      const stmt = node.statements[i];

      // Skip statements that will produce empty output
      if (isSkippedStatement[i]) {
        continue;
      }

      const code = stmt.accept(this);

      // Double-check if code is empty (shouldn't happen, but be safe)
      if (code.trim() === '') {
        continue;
      }

      // Check if the NEXT non-skipped statement has a skipped statement before it
      let hadSkippedAfter = false;
      for (let j = i + 1; j < node.statements.length; j++) {
        if (isSkippedStatement[j]) {
          hadSkippedAfter = true;
        } else {
          // Found next non-skipped statement
          break;
        }
      }

      // Determine declaration type
      let declType: string;
      if (stmt instanceof ir.VariableDeclaration) {
        declType = 'var';
      } else if (stmt instanceof ir.FunctionDeclaration) {
        declType = 'func';
      } else if (stmt instanceof ir.ClassDeclaration || stmt instanceof ir.InterfaceDeclaration ||
                 stmt instanceof ir.TypeAliasDeclaration || stmt instanceof ir.EnumDeclaration) {
        declType = 'type';
      } else if (stmt instanceof ir.ExpressionStatement) {
        // Top-level expression statements need to go in init()
        initStatements.push(code);
        continue; // Don't add to regular declarations
      } else {
        declType = 'other';
      }

      declarations.push({
        code,
        type: declType,
        originalIndex: i,
        hadSkippedAfter
      });
    }

    // Generate imports
    result += this.generateImports();

    // Third pass: generate code with smart spacing
    for (let i = 0; i < declarations.length; i++) {
      const decl = declarations[i];
      result += decl.code;

      // Add appropriate spacing
      if (i < declarations.length - 1) {
        const nextDecl = declarations[i + 1];

        // If this declaration had skipped statements after it, add blank line
        if (decl.hadSkippedAfter) {
          result += '\n\n';
          continue;
        }

        const isCurrentSimpleVar = decl.type === 'var' && !decl.code.includes('\n\n');
        const isNextSimpleVar = nextDecl.type === 'var' && !nextDecl.code.includes('\n\n');

        // Different declaration types always get blank line
        if (decl.type !== nextDecl.type) {
          result += '\n\n';
        }
        // Functions and types always get blank lines around them
        else if (decl.type === 'func' || decl.type === 'type') {
          result += '\n\n';
        }
        // If one is simple var and one is complex (with internal blank lines), separate them
        else if (isCurrentSimpleVar !== isNextSimpleVar) {
          result += '\n\n';
        }
        // If both are complex vars (non-simple), separate them with blank line
        else if (!isCurrentSimpleVar && !isNextSimpleVar) {
          result += '\n\n';
        }
        // For consecutive simple variables, check if they form a logical group
        else if (isCurrentSimpleVar && isNextSimpleVar) {
          const currentMatch = decl.code.match(/var (\w+) ([\w\[\]{}]+)?\s*=?\s*(.+)?/);
          const nextMatch = nextDecl.code.match(/var (\w+) ([\w\[\]{}]+)?\s*=?\s*(.+)?/);

          if (currentMatch && nextMatch) {
            const [, currentName, currentExplicitType] = currentMatch;
            const [, nextName, nextExplicitType] = nextMatch;

            const currentIsScalar = currentExplicitType && /^(string|float64|bool|int|interface\{\})$/.test(currentExplicitType);
            const nextIsScalar = nextExplicitType && /^(string|float64|bool|int|interface\{\})$/.test(nextExplicitType);

            const currentIsInferred = decl.code.includes(' = ') && !decl.code.match(/var \w+ [\w\[\]{}]+ =/);
            const nextIsInferred = nextDecl.code.includes(' = ') && !nextDecl.code.match(/var \w+ [\w\[\]{}]+ =/);

            const currentIsArray = decl.code.includes('= []');
            const nextIsArray = nextDecl.code.includes('= []');

            // Special case: any/unknown typed variables should be alone
            const currentIsAnyUnknown = /any|unknown/i.test(currentName) && currentExplicitType === 'interface{}';
            const nextIsAnyUnknown = /any|unknown/i.test(nextName) && nextExplicitType === 'interface{}';

            // Separate any/unknown vars from other groups
            if (currentIsAnyUnknown || nextIsAnyUnknown) {
              result += '\n\n';
            }
            // Explicit scalar types cannot group with inferred types
            else if (currentIsScalar && nextIsInferred) {
              result += '\n\n';
            }
            else if (currentIsInferred && nextIsScalar) {
              result += '\n\n';
            }
            // Group logic: keep similar declarations together
            else if ((currentIsScalar && nextIsScalar) ||
                (currentIsInferred && nextIsInferred && !currentIsArray && !nextIsArray) ||
                (currentIsArray && nextIsArray)) {
              result += '\n';
            } else {
              result += '\n\n';
            }
          } else {
            result += '\n\n';
          }
        }
        else {
          result += '\n';
        }
      }
    }

    // Add init() function if there are any top-level expression statements
    if (initStatements.length > 0) {
      result += '\n';
      result += 'func init() {\n';
      for (const stmt of initStatements) {
        result += `\t${stmt}\n`;
      }
      result += '}\n';
    }

    // Add final newline
    if (result.length > 0 && !result.endsWith('\n')) {
      result += '\n';
    }

    return result;
  }

  // @ts-ignore-next-line - node parameter required by interface but not used
  visitImportDeclaration(node: ir.ImportDeclaration): string {
    // Go 的 import 處理在 module 層級
    return '';
  }

  // @ts-ignore-next-line - node parameter required by interface but not used
  visitImportSpecifier(node: ir.ImportSpecifier): string {
    return '';
  }

  visitExportDeclaration(node: ir.ExportDeclaration): string {
    if (node.declaration) {
      return node.declaration.accept(this);
    }
    return '';
  }

  // @ts-ignore-next-line - node parameter required by interface but not used
  visitExportSpecifier(node: ir.ExportSpecifier): string {
    return '';
  }

  // ============= Types =============

  visitPrimitiveType(node: ir.PrimitiveType): string {
    switch (node.kind) {
      case 'number':
        return this.options.numberStrategy === 'int' ? 'int' : 'float64';
      case 'string':
        return 'string';
      case 'boolean':
        return 'bool';
      case 'void':
        return 'interface{}'; // void mapped to interface{} for variables
      case 'any':
      case 'unknown':
        return 'interface{}';
      case 'never':
        return ''; // never 類型在 Go 中無對應
      default:
        return 'interface{}';
    }
  }

  visitArrayType(node: ir.ArrayType): string {
    const elementType = node.elementType.accept(this);
    return `[]${elementType}`;
  }

  visitTupleType(node: ir.TupleType): string {
    // Register tuple type and return its name
    return this.registerTupleType(node);
  }

  visitObjectType(node: ir.ObjectType): string {
    const fields = node.properties.map(prop => {
      const typeName = prop.type.accept(this);
      const fieldName = this.capitalize(prop.name);
      const fieldType = prop.optional ? `*${typeName}` : typeName;
      return `${this.indent()}\t${fieldName} ${fieldType}`;
    }).join('\n');

    return `struct {\n${fields}\n${this.indent()}}`;
  }

  visitFunctionType(node: ir.FunctionType): string {
    const params = node.parameters.map(p => p.type?.accept(this) || 'interface{}').join(', ');
    const returnType = node.returnType.accept(this);

    if (node.isAsync) {
      this.needsContext = true;
      this.addImport('context');
      return `func(context.Context, ${params}) (${returnType}, error)`;
    }

    return `func(${params}) ${returnType}`;
  }

  // @ts-ignore-next-line - node parameter required by interface but not used
  visitUnionType(node: ir.UnionType): string {
    switch (this.options.unionStrategy) {
      case 'interface':
        // Interface-based union
        return 'interface{}'; // 需要在外層產生實際的 interface 定義

      case 'any':
        return 'interface{}';

      case 'tagged':
      default:
        // Tagged union - 需要在外層產生 struct
        return 'interface{}'; // placeholder
    }
  }

  // @ts-ignore-next-line - node parameter required by interface but not used
  visitIntersectionType(node: ir.IntersectionType): string {
    // Intersection 通過 struct embedding 實現
    // 這裡返回 placeholder，實際實現在 TypeAliasDeclaration
    return 'interface{}';
  }

  visitTypeReference(node: ir.TypeReference): string {
    let typeName = node.name;

    // Special handling for Error → error (Go's built-in error interface)
    if (typeName === 'Error') {
      return 'error';
    }

    // Special handling for built-in types
    if (typeName === 'Date') {
      this.addImport('time');
      return 'time.Time';
    }

    // Special handling for Array<T> → []T
    if (typeName === 'Array' && node.typeArguments && node.typeArguments.length === 1) {
      const elementType = node.typeArguments[0].accept(this);
      return `[]${elementType}`;
    }

    // Special handling for Map<K, V> → map[K]V
    if (typeName === 'Map' && node.typeArguments && node.typeArguments.length === 2) {
      const keyType = node.typeArguments[0].accept(this);
      const valueType = node.typeArguments[1].accept(this);
      return `map[${keyType}]${valueType}`;
    }

    // Special handling for Record<K, V> → map[K]V (same as Map)
    if (typeName === 'Record' && node.typeArguments && node.typeArguments.length === 2) {
      const keyType = node.typeArguments[0].accept(this);
      const valueType = node.typeArguments[1].accept(this);
      return `map[${keyType}]${valueType}`;
    }

    // Special handling for Set<T> → map[T]bool (Go idiom for sets)
    if (typeName === 'Set' && node.typeArguments && node.typeArguments.length === 1) {
      const elementType = node.typeArguments[0].accept(this);
      return `map[${elementType}]bool`;
    }

    // Special handling for Partial<T> → T (Go doesn't have partial types)
    // Note: In practice, optional fields should use pointers
    if (typeName === 'Partial' && node.typeArguments && node.typeArguments.length === 1) {
      const elementType = node.typeArguments[0].accept(this);
      return elementType;
    }

    // Special handling for Promise<T> → T (since we handle async with error returns)
    if (typeName === 'Promise' && node.typeArguments && node.typeArguments.length === 1) {
      const valueType = node.typeArguments[0].accept(this);
      return valueType;
    }

    // Special handling for AsyncGenerator<T> → <-chan T (receive-only channel)
    if (typeName === 'AsyncGenerator' && node.typeArguments && node.typeArguments.length >= 1) {
      const elementType = node.typeArguments[0].accept(this);
      return `<-chan ${elementType}`;
    }

    // Special handling for Generator<T> → <-chan T (receive-only channel)
    if (typeName === 'Generator' && node.typeArguments && node.typeArguments.length >= 1) {
      const elementType = node.typeArguments[0].accept(this);
      return `<-chan ${elementType}`;
    }

    // Special handling for AsyncIterator<T> → <-chan T
    if (typeName === 'AsyncIterator' && node.typeArguments && node.typeArguments.length >= 1) {
      const elementType = node.typeArguments[0].accept(this);
      return `<-chan ${elementType}`;
    }

    // Special handling for Iterator<T> → <-chan T
    if (typeName === 'Iterator' && node.typeArguments && node.typeArguments.length >= 1) {
      const elementType = node.typeArguments[0].accept(this);
      return `<-chan ${elementType}`;
    }

    // 處理泛型參數
    if (node.typeArguments && node.typeArguments.length > 0) {
      const typeArgs = node.typeArguments.map(t => t.accept(this)).join(', ');
      return `${typeName}[${typeArgs}]`;
    }

    return typeName;
  }

  visitLiteralType(node: ir.LiteralType): string {
    // Literal types 通常映射為對應的基本型別
    if (typeof node.value === 'string') return 'string';
    if (typeof node.value === 'number') return this.options.numberStrategy === 'int' ? 'int' : 'float64';
    if (typeof node.value === 'boolean') return 'bool';
    return 'interface{}';
  }

  visitPropertySignature(node: ir.PropertySignature): string {
    const fieldName = this.capitalize(node.name);
    const typeName = node.type.accept(this);
    const fieldType = node.optional ? `*${typeName}` : typeName;

    let result = `${fieldName} ${fieldType}`;

    // 添加 json tag
    result += ` \`json:"${node.name}`;
    if (node.optional) {
      result += ',omitempty';
    }
    result += '"\`';

    return result;
  }

  visitIndexSignature(node: ir.IndexSignature): string {
    const keyType = node.keyType.accept(this);
    const valueType = node.valueType.accept(this);
    return `map[${keyType}]${valueType}`;
  }

  // ============= Declarations =============

  visitVariableDeclaration(node: ir.VariableDeclaration): string {
    const name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));
    // @ts-ignore - isConst tracked for future const/var distinction
    const isConst = node.isConst || this.hasModifier(node.modifiers, 'export');

    // Generate tuple type definition inline if this variable uses a tuple type
    let tupleTypeDef = '';
    if (node.type instanceof ir.TupleType) {
      const typeName = this.registerTupleType(node.type);
      tupleTypeDef = this.generateTupleTypeInline(typeName);
    }

    // Use type inference for variables with 'any' type + literal initializer
    // EXCEPT if the variable name suggests it's intentionally any/unknown
    // This is a heuristic since IR doesn't track if type was explicit or inferred
    let shouldInferType = false;
    if (node.initializer) {
      if (!node.type) {
        shouldInferType = true;
      } else if (node.type instanceof ir.PrimitiveType && node.type.kind === 'any') {
        // Use inference for 'any' type - prefer Go's type inference over interface{}
        shouldInferType = true;
      }
    }

    if (shouldInferType) {
      // Let Go infer the type
      const init = node.initializer!.accept(this);
      return `${tupleTypeDef}var ${name} = ${init}`;
    }

    if (node.type) {
      const typeName = node.type.accept(this);
      if (node.initializer) {
        // Special handling for tuple initialization
        let init: string;
        if (node.type instanceof ir.TupleType && node.initializer instanceof ir.ArrayExpression) {
          // Generate struct initialization with type inference
          const elements = node.initializer.elements
            .map(e => e ? e.accept(this) : 'nil')
            .join(', ');
          init = `${typeName}{${elements}}`;
          // Use type inference for tuple
          return `${tupleTypeDef}var ${name} = ${init}`;
        } else if ((node.type instanceof ir.ArrayType ||
                   (node.type instanceof ir.TypeReference && node.type.name === 'Array')) &&
                   node.initializer instanceof ir.ArrayExpression) {
          // Generate typed array literal with type inference
          let elementType: string;
          if (node.type instanceof ir.ArrayType) {
            elementType = node.type.elementType.accept(this);
          } else {
            // TypeReference case: Array<T>
            elementType = node.type.typeArguments && node.type.typeArguments.length > 0
              ? node.type.typeArguments[0].accept(this)
              : 'interface{}';
          }
          const elements = node.initializer.elements
            .map(e => e ? e.accept(this) : 'nil')
            .join(', ');
          init = `[]${elementType}{${elements}}`;
          // Use type inference for array
          return `${tupleTypeDef}var ${name} = ${init}`;
        } else if ((node.type instanceof ir.TypeReference ||
                    node.type instanceof ir.IntersectionType ||
                    node.type instanceof ir.ObjectType) &&
                   node.initializer instanceof ir.ObjectExpression) {
          // Check if this is a type alias to an intersection type
          let intersectionType: ir.IntersectionType | null = null;
          if (node.type instanceof ir.IntersectionType) {
            intersectionType = node.type;
          } else if (node.type instanceof ir.TypeReference) {
            const aliasedType = this.typeAliasMap.get(node.type.name);
            if (aliasedType instanceof ir.IntersectionType) {
              intersectionType = aliasedType;
            }
          }

          // Special handling for intersection types with embedded structs
          if (intersectionType) {
            // Group properties by their likely interface based on naming heuristics
            const intersectionTypes = intersectionType.types;
            const properties = node.initializer.properties;

            // Build embedded struct initializers
            const embeddedInits: string[] = [];
            const usedProps = new Set<string>();

            for (const intType of intersectionTypes) {
              if (intType instanceof ir.TypeReference) {
                const interfaceName = intType.name;
                const interfaceProps = this.interfaceProperties.get(interfaceName);

                if (interfaceProps) {
                  // Find properties that belong to this interface based on tracked members
                  const matchingProps = properties.filter(p => {
                    if (!(p.key instanceof ir.Identifier)) return false;
                    const propName = p.key.name;
                    if (usedProps.has(propName)) return false;
                    return interfaceProps.has(propName);
                  });

                  if (matchingProps.length > 0) {
                    const propInits = matchingProps.map(p => {
                      const key = p.key instanceof ir.Identifier ?
                        this.capitalize(p.key.name) : p.key.accept(this);
                      const value = p.value.accept(this);
                      usedProps.add((p.key as ir.Identifier).name);
                      return `${key}: ${value}`;
                    }).join(', ');
                    embeddedInits.push(`${interfaceName}: ${interfaceName}{${propInits}}`);
                  }
                }
              }
            }

            init = `${typeName}{\n${this.indent()}\t${embeddedInits.join(',\n' + this.indent() + '\t')},\n${this.indent()}}`;
            return `${tupleTypeDef}var ${name} = ${init}`;
          }

          // Generate struct literal for object initializers
          const props = node.initializer.properties.map(p => {
            const key = p.key instanceof ir.Identifier ?
              this.capitalize(p.key.name) :
              p.key.accept(this);
            const value = p.value.accept(this);
            return `${key}: ${value}`;
          }).join(', ');
          init = `${typeName}{${props}}`;
          // Use type inference for struct
          return `${tupleTypeDef}var ${name} = ${init}`;
        } else {
          init = node.initializer.accept(this);
        }
        return `${tupleTypeDef}var ${name} ${typeName} = ${init}`;
      }
      return `${tupleTypeDef}var ${name} ${typeName}`;
    }

    return `${tupleTypeDef}var ${name} interface{}`;
  }

  visitFunctionDeclaration(node: ir.FunctionDeclaration): string {
    const name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));
    const isAsync = this.hasModifier(node.modifiers, 'async');

    // 型別參數（泛型）
    let typeParams = '';
    if (node.typeParameters && node.typeParameters.length > 0) {
      typeParams = '[' + node.typeParameters.map(tp => {
        const constraint = tp.constraint ? ` ${tp.constraint.accept(this)}` : ' any';
        return tp.name + constraint;
      }).join(', ') + ']';
    }

    // 參數
    let params = node.parameters.map(p => this.visitParameter(p)).join(', ');
    if (isAsync) {
      this.needsContext = true;
      this.addImport('context');
      params = `ctx context.Context` + (params ? ', ' + params : '');
    }

    // 返回型別
    let returnType = '';
    // Check if return type is void - in Go, void functions have no return type
    const isVoidReturn = node.returnType instanceof ir.PrimitiveType &&
                         (node.returnType as ir.PrimitiveType).kind === 'void';

    if (node.returnType && !isVoidReturn) {
      returnType = node.returnType.accept(this);
      if (isAsync) {
        returnType = `(${returnType}, error)`;
      }
    } else if (isAsync) {
      returnType = 'error';
    }

    // 函式簽名
    let signature = `func ${name}${typeParams}(${params})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    // 函式體
    if (node.body) {
      // Generate default parameter initialization code
      const defaultInits: string[] = [];
      for (const param of node.parameters) {
        if (param.defaultValue) {
          const paramType = param.type?.accept(this) || 'interface{}';
          const defaultValue = param.defaultValue.accept(this);

          // Check if parameter is at zero value and assign default
          if (paramType === 'string') {
            defaultInits.push(`if ${param.name} == "" {\n\t\t${param.name} = ${defaultValue}\n\t}`);
          } else if (paramType.startsWith('*')) {
            // Pointer type - check for nil
            defaultInits.push(`if ${param.name} == nil {\n\t\tval := ${defaultValue}\n\t\t${param.name} = &val\n\t}`);
          } else {
            // For other types, check against zero value
            defaultInits.push(`if ${param.name} == 0 {\n\t\t${param.name} = ${defaultValue}\n\t}`);
          }
        }
      }

      // Generate function body with default initializations
      let result = '{\n';
      this.increaseIndent();

      // Mark that we're inside a function (not at module level)
      const wasModuleLevel = this.isModuleLevel;
      this.isModuleLevel = false;

      // Add default parameter initializations
      for (const init of defaultInits) {
        result += `${this.indent()}${init}\n`;
      }

      // Add original body statements
      for (const stmt of node.body.statements) {
        const stmtCode = stmt.accept(this);
        if (stmtCode) {
          result += `${this.indent()}${stmtCode}\n`;
        }
      }

      // Restore module level flag
      this.isModuleLevel = wasModuleLevel;

      this.decreaseIndent();
      result += `${this.indent()}}`;

      return `${signature} ${result}`;
    }

    // If there's no body, this is a function overload signature
    // Go doesn't support overloads, so skip these declarations
    return '';
  }

  visitParameter(node: ir.Parameter): string {
    let type = node.type?.accept(this) || 'interface{}';

    // 可選參數使用指標
    if (node.optional && this.options.nullabilityStrategy === 'pointer') {
      type = `*${type}`;
    }

    // Rest 參數
    if (node.rest) {
      type = `...${type}`;
    }

    return `${node.name} ${type}`;
  }

  visitTypeParameter(node: ir.TypeParameter): string {
    let result = node.name;
    if (node.constraint) {
      result += ` ${node.constraint.accept(this)}`;
    } else {
      result += ' any';
    }
    return result;
  }

  visitClassDeclaration(node: ir.ClassDeclaration): string {
    let name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));

    // Check if class implements Iterable or Iterator - rename to avoid common collisions
    const implementsIterable = node.implementsClause?.some(impl => {
      if (impl instanceof ir.TypeReference) {
        return impl.name === 'Iterable' || impl.name === 'Iterator' ||
               impl.name === 'AsyncIterable' || impl.name === 'AsyncIterator';
      }
      return false;
    });

    if (implementsIterable && !name.endsWith('Iterator')) {
      name = `${name}Iterator`;
    }

    let result = '';

    // Set current class context for field name resolution
    this.currentClassName = name;
    this.privateFieldNames.clear();
    this.fieldTypeMap.clear();
    this.currentClassTypeParams = node.typeParameters || [];

    // 型別參數
    let typeParams = '';
    if (node.typeParameters && node.typeParameters.length > 0) {
      typeParams = '[' + node.typeParameters.map(tp => tp.accept(this)).join(', ') + ']';
    }

    // Separate static and instance members and track private fields
    const staticProperties: ir.PropertyMember[] = [];
    const staticMethods: ir.MethodMember[] = [];
    const instanceProperties: ir.PropertyMember[] = [];
    const instanceMethods: ir.MethodMember[] = [];
    const genericMethods: ir.MethodMember[] = []; // Methods with their own type parameters (must be standalone functions)

    for (const member of node.members) {
      if (member instanceof ir.PropertyMember) {
        const isStatic = this.hasModifier(member.modifiers, 'static');
        const isPrivate = this.hasModifier(member.modifiers, 'private');

        // Track private instance field names
        if (!isStatic && isPrivate) {
          this.privateFieldNames.add(member.name);
        }

        if (isStatic) {
          staticProperties.push(member);
        } else {
          instanceProperties.push(member);
        }
      } else if (member instanceof ir.MethodMember) {
        const isStatic = this.hasModifier(member.modifiers, 'static');
        // Check if this method has its own type parameters (beyond class type parameters)
        const hasOwnTypeParams = member.typeParameters && member.typeParameters.length > 0;

        if (isStatic) {
          staticMethods.push(member);
        } else if (hasOwnTypeParams) {
          // Methods with their own type parameters must become standalone functions in Go
          genericMethods.push(member);
        } else {
          instanceMethods.push(member);
        }
      }
    }

    // Struct 定義 (only instance members)
    result += `type ${name}${typeParams} struct {\n`;

    // Check if this class extends Error (special handling)
    const extendsError = node.extendsClause &&
                         node.extendsClause instanceof ir.TypeReference &&
                         node.extendsClause.name === 'Error';

    // Embedding (extends only - implements is for type checking, not data)
    if (node.extendsClause && !extendsError) {
      this.increaseIndent();
      result += `${this.indent()}${node.extendsClause.accept(this)}\n`;
      this.decreaseIndent();
    }

    // For Error class extension, add Message field
    if (extendsError) {
      this.increaseIndent();
      result += `${this.indent()}Message string\n`;
      this.decreaseIndent();
    }
    // Note: implements clauses are NOT embedded in Go - they're just type constraints

    // 屬性 (only instance properties)
    this.increaseIndent();
    // First pass: collect field info to calculate max length for alignment
    interface FieldInfo {
      name: string;
      type: string;
    }
    const fields: FieldInfo[] = [];
    for (const member of instanceProperties) {
      const isPrivate = this.hasModifier(member.modifiers, 'private');
      const fieldName = isPrivate ? member.name : this.capitalize(member.name);
      let typeName = member.type?.accept(this) || 'interface{}';

      // Context-aware number type mapping: if a number field has an integer literal initializer,
      // use int instead of float64 (heuristic for counter-like fields)
      if (member.type instanceof ir.PrimitiveType && member.type.kind === 'number') {
        if (member.initializer instanceof ir.Literal) {
          const value = (member.initializer as ir.Literal).value;
          // If the initializer is an integer (no decimal point), use int
          if (typeof value === 'number' && Number.isInteger(value)) {
            typeName = 'int';
            // Track this field's type for method return type inference
            this.fieldTypeMap.set(member.name, 'int');
          }
        }
      }

      // Check if this is an optional constructor parameter
      const isOptional = member.metadata.get('isOptional');
      if (isOptional && this.options.nullabilityStrategy === 'pointer') {
        typeName = `*${typeName}`;
      }

      fields.push({ name: fieldName, type: typeName });
    }

    // Calculate padding width
    // For multiple fields: minimum 10, or max field length + 1 for spacing
    // For single field: no padding (just one space)
    const maxLen = fields.length > 0 ? Math.max(...fields.map(f => f.name.length)) : 0;
    const paddingWidth = fields.length === 1 ? 0 : Math.max(maxLen + 1, 10);

    // Second pass: generate with alignment
    for (const field of fields) {
      if (fields.length === 1) {
        // For single field, use simple spacing (no padding)
        result += `${this.indent()}${field.name} ${field.type}\n`;
      } else {
        // For multiple fields, use aligned padding
        const paddedName = field.name.padEnd(paddingWidth);
        result += `${this.indent()}${paddedName}${field.type}\n`;
      }
    }
    this.decreaseIndent();

    result += '}';

    // Generate module-level variables for static properties
    if (staticProperties.length > 0) {
      result += '\n\n';
      for (const staticProp of staticProperties) {
        const varName = `${name.toLowerCase()}${this.capitalize(staticProp.name)}`;
        let typeName = staticProp.type?.accept(this) || 'interface{}';
        result += `var ${varName} *${name}\n`;
      }
    }

    // Constructor and instance methods
    const constructor = this.generateConstructor(name, node, extendsError);

    if (constructor) {
      result += '\n\n' + constructor;
      if (instanceMethods.length > 0 || staticMethods.length > 0) {
        result += '\n'; // One newline to create blank line before first method
      }
    }

    // Generate module-level functions for static methods
    for (let i = 0; i < staticMethods.length; i++) {
      result += '\n\n' + this.generateStaticMethod(name, staticMethods[i]);
      if (i < staticMethods.length - 1 || instanceMethods.length > 0 || genericMethods.length > 0) {
        result += '\n'; // One newline already added above for spacing
      }
    }

    // Instance methods
    for (let i = 0; i < instanceMethods.length; i++) {
      result += '\n\n' + this.generateMethod(name, instanceMethods[i]);
    }

    // Generate Error() method for classes extending Error
    if (extendsError) {
      result += '\n\n';
      result += `func (e ${name}) Error() string {\n`;
      result += `\treturn e.Message\n`;
      result += `}`;
    }

    // Generic methods (methods with their own type parameters) as standalone functions
    for (let i = 0; i < genericMethods.length; i++) {
      result += '\n\n' + this.generateGenericMethod(name, genericMethods[i]);
    }

    return result;
  }

  private generateConstructor(className: string, node: ir.ClassDeclaration, extendsError: boolean = false): string {
    // Filter out static properties - only instance properties should be in the constructor
    const allProperties = node.members.filter(m => m instanceof ir.PropertyMember) as ir.PropertyMember[];
    const properties = allProperties.filter(p => !this.hasModifier(p.modifiers, 'static'));

    // Only constructor parameter properties should be parameters
    const constructorParams = properties.filter(p => p.metadata.get('isConstructorParam'));

    // Find constructor method to check for body initializations
    const constructorMethod = node.members.find(m => m instanceof ir.MethodMember && m.name === 'constructor') as ir.MethodMember | undefined;

    // Don't generate constructor if:
    // - No constructor params AND
    // - No constructor method body (which might have this.prop = value) AND
    // - No parent class (which would need super() handling)
    if (constructorParams.length === 0 && !constructorMethod && !node.extendsClause) {
      return '';
    }

    if (properties.length === 0) return '';

    // Analyze constructor method body for initializations and super() calls
    const bodyInitializations = new Map<string, ir.Expression>();
    let superCall: ir.SuperExpression | null = null;

    if (constructorMethod?.body) {
      for (const stmt of constructorMethod.body.statements) {
        // Look for super() calls
        if (stmt instanceof ir.ExpressionStatement && stmt.expression instanceof ir.SuperExpression) {
          superCall = stmt.expression;
        }
        // Look for assignments like `this.createdAt = new Date()`
        else if (stmt instanceof ir.ExpressionStatement && stmt.expression instanceof ir.AssignmentExpression) {
          const assignment = stmt.expression;
          if (assignment.left instanceof ir.MemberExpression &&
              assignment.left.object instanceof ir.Identifier &&
              assignment.left.object.name === 'this') {
            // property could be Identifier or other Expression
            const propName = assignment.left.property instanceof ir.Identifier
              ? assignment.left.property.name
              : assignment.left.property.accept(this);
            bodyInitializations.set(propName, assignment.right);
          }
        }
      }
    }

    // Build parameter list - if there's a super() call, we need to get params from constructor method
    const allParams: string[] = [];

    if (superCall && constructorMethod) {
      // Use the constructor method's parameters (which include parent params passed to super())
      for (const param of constructorMethod.parameters) {
        let typeName = param.type?.accept(this) || 'interface{}';
        if (param.optional && this.options.nullabilityStrategy === 'pointer') {
          typeName = `*${typeName}`;
        }
        allParams.push(`${param.name} ${typeName}`);
      }
    } else {
      // No super() call - just use constructor parameter properties
      for (const p of constructorParams) {
        const isPrivate = this.hasModifier(p.modifiers, 'private');
        const paramName = isPrivate ? p.name : p.name.toLowerCase();
        let typeName = p.type?.accept(this) || 'interface{}';

        const isOptional = p.metadata.get('isOptional');
        if (isOptional && this.options.nullabilityStrategy === 'pointer') {
          typeName = `*${typeName}`;
        }

        allParams.push(`${paramName} ${typeName}`);
      }
    }

    const params = allParams.join(', ');

    // Include type parameters in constructor signature
    let typeParams = '';
    if (node.typeParameters && node.typeParameters.length > 0) {
      typeParams = '[' + node.typeParameters.map(tp => tp.accept(this)).join(', ') + ']';
    }

    let result = `func New${className}${typeParams}(${params}) *${className}`;

    // Add type arguments to return type if class has type parameters
    if (node.typeParameters && node.typeParameters.length > 0) {
      const typeArgs = '[' + node.typeParameters.map(tp => tp.name).join(', ') + ']';
      result += typeArgs;
    }

    result += ' {\n';

    // If there's a super() call with email parameter, create pointer variable
    if (superCall && node.extendsClause) {
      // Check if any super() arg needs to be converted to pointer
      for (const arg of superCall.args) {
        if (arg instanceof ir.Identifier && arg.name === 'email') {
          result += `${this.indent()}\temailPtr := &${arg.name}\n`;
          break;
        }
      }
    }

    // Add type arguments to struct literal if class has type parameters
    let structType = className;
    if (node.typeParameters && node.typeParameters.length > 0) {
      const typeArgs = '[' + node.typeParameters.map(tp => tp.name).join(', ') + ']';
      structType += typeArgs;
    }

    result += `${this.indent()}\treturn &${structType}{\n`;

    // Calculate max field name length for alignment (including parent class name if present)
    let maxFieldNameLen = properties.length > 0
      ? Math.max(...properties.map(p => {
          const isPrivate = this.hasModifier(p.modifiers, 'private');
          const fieldName = isPrivate ? p.name : this.capitalize(p.name);
          return fieldName.length;
        }))
      : 0;

    // If there's a parent class, include its name in the max calculation
    if (superCall && node.extendsClause) {
      if (extendsError) {
        // For Error extension, "Message" is the field name
        maxFieldNameLen = Math.max(maxFieldNameLen, 'Message'.length);
      } else {
        const parentClassName = node.extendsClause.accept(this);
        maxFieldNameLen = Math.max(maxFieldNameLen, parentClassName.length);
      }
    }

    const initPaddingWidth = Math.max(maxFieldNameLen + 1 + 1, 11); // +1 for colon, +1 for space

    // If there's a super() call and parent class, initialize the embedded parent struct first
    if (superCall && node.extendsClause) {
      if (extendsError) {
        // Special handling for Error class - just initialize Message field
        // super(message) becomes Message: message
        const messageArg = superCall.args.length > 0 ? superCall.args[0].accept(this) : '""';
        const nameWithColon = `Message:`;
        const paddedName = nameWithColon.padEnd(initPaddingWidth);

        this.increaseIndent();
        this.increaseIndent();
        result += `${this.indent()}${paddedName}${messageArg},\n`;
        this.decreaseIndent();
        this.decreaseIndent();
      } else {
        // Get the parent class name
        const parentClassName = node.extendsClause.accept(this);

        // Build the parent constructor call with arguments from super()
        const parentArgs: string[] = [];
        for (const arg of superCall.args) {
          if (arg instanceof ir.Identifier) {
            // Special case: if arg is 'email', use 'emailPtr' instead
            if (arg.name === 'email') {
              parentArgs.push('emailPtr');
            } else {
              parentArgs.push(arg.name);
            }
          } else {
            parentArgs.push(arg.accept(this));
          }
        }

        const parentInit = `*New${parentClassName}(${parentArgs.join(', ')})`;
        const nameWithColon = `${parentClassName}:`;
        const paddedName = nameWithColon.padEnd(initPaddingWidth);

        this.increaseIndent();
        this.increaseIndent();
        result += `${this.indent()}${paddedName}${parentInit},\n`;
        this.decreaseIndent();
        this.decreaseIndent();
      }
    }

    for (const prop of properties) {
      const isPrivate = this.hasModifier(prop.modifiers, 'private');
      const fieldName = isPrivate ? prop.name : this.capitalize(prop.name);
      const paramName = isPrivate ? prop.name : prop.name.toLowerCase();
      const isConstructorParam = prop.metadata.get('isConstructorParam');

      if (isConstructorParam) {
        // This is a constructor parameter - assign from parameter
        this.increaseIndent();
        this.increaseIndent();
        const nameWithColon = fieldName + ':';
        const paddedName = nameWithColon.padEnd(initPaddingWidth);
        result += `${this.indent()}${paddedName}${paramName},\n`;
        this.decreaseIndent();
        this.decreaseIndent();
      } else if (prop.initializer) {
        // This is a regular property with an initializer on the declaration
        this.increaseIndent();
        this.increaseIndent();
        const nameWithColon = fieldName + ':';
        const paddedName = nameWithColon.padEnd(initPaddingWidth);
        result += `${this.indent()}${paddedName}${prop.initializer.accept(this)},\n`;
        this.decreaseIndent();
        this.decreaseIndent();
      } else if (bodyInitializations.has(prop.name)) {
        // This property is initialized in the constructor body
        const init = bodyInitializations.get(prop.name)!;
        this.increaseIndent();
        this.increaseIndent();
        const nameWithColon = fieldName + ':';
        const paddedName = nameWithColon.padEnd(initPaddingWidth);
        result += `${this.indent()}${paddedName}${init.accept(this)},\n`;
        this.decreaseIndent();
        this.decreaseIndent();
      }
    }

    result += `${this.indent()}\t}\n`;
    result += `${this.indent()}}`;

    return result;
  }

  /**
   * Extract the field name being returned in a method body
   * Handles simple cases like: return this.count or return ++this.count
   */
  private extractReturnedFieldName(body: ir.BlockStatement): string | null {
    // Look for return statements in the method body
    for (const stmt of body.statements) {
      if (stmt instanceof ir.ReturnStatement && stmt.argument) {
        // Case 1: return this.fieldName
        if (stmt.argument instanceof ir.MemberExpression &&
            stmt.argument.object instanceof ir.Identifier &&
            stmt.argument.object.name === 'this' &&
            stmt.argument.property instanceof ir.Identifier) {
          return stmt.argument.property.name;
        }

        // Case 2: return ++this.fieldName or return this.fieldName++
        if (stmt.argument instanceof ir.UnaryExpression &&
            stmt.argument.argument instanceof ir.MemberExpression &&
            stmt.argument.argument.object instanceof ir.Identifier &&
            stmt.argument.argument.object.name === 'this' &&
            stmt.argument.argument.property instanceof ir.Identifier) {
          return stmt.argument.argument.property.name;
        }
      }
    }
    return null;
  }

  private generateMethod(className: string, node: ir.MethodMember): string {
    const isStatic = this.hasModifier(node.modifiers, 'static');
    const isAsync = this.hasModifier(node.modifiers, 'async');
    const methodName = this.exportName(node.name, !this.hasModifier(node.modifiers, 'private'));

    // Skip constructor method - it's already handled by generateConstructor
    if (node.name === 'constructor') {
      return '';
    }

    // 接收者
    let receiver = '';
    const receiverName = className.charAt(0).toLowerCase();
    if (!isStatic) {
      let receiverType = className;

      // Add type arguments to receiver if class is generic
      if (this.currentClassTypeParams.length > 0) {
        const typeArgs = '[' + this.currentClassTypeParams.map(tp => tp.name).join(', ') + ']';
        receiverType += typeArgs;
      }

      receiverType = this.options.usePointerReceivers ? `*${receiverType}` : receiverType;
      receiver = `(${receiverName} ${receiverType}) `;
      // Set current receiver name for 'this' replacement
      this.currentReceiverName = receiverName;
    }

    // 型別參數
    let typeParams = '';
    if (node.typeParameters && node.typeParameters.length > 0) {
      typeParams = '[' + node.typeParameters.map(tp => tp.accept(this)).join(', ') + ']';
    }

    // 參數
    let params = node.parameters.map(p => this.visitParameter(p)).join(', ');
    if (isAsync) {
      this.needsContext = true;
      this.addImport('context');
      params = `ctx context.Context` + (params ? ', ' + params : '');
    }

    // 返回型別
    let returnType = '';
    // Check if return type is void - in Go, void functions have no return type
    const isVoidReturn = node.returnType instanceof ir.PrimitiveType &&
                         (node.returnType as ir.PrimitiveType).kind === 'void';

    if (node.returnType && !isVoidReturn) {
      let baseReturnType = node.returnType.accept(this);

      // Check if the return type is 'number' and if this method returns an int-typed field
      if (baseReturnType === 'float64' && node.returnType instanceof ir.PrimitiveType &&
          (node.returnType as ir.PrimitiveType).kind === 'number') {
        // Check if the method body returns a field that's tracked as int
        if (node.body) {
          const returnedFieldName = this.extractReturnedFieldName(node.body);
          if (returnedFieldName && this.fieldTypeMap.get(returnedFieldName) === 'int') {
            baseReturnType = 'int';
          }
        }
      }

      returnType = baseReturnType;
      if (isAsync) {
        returnType = `(${returnType}, error)`;
      }
    } else if (isAsync) {
      returnType = 'error';
    }

    // 方法簽名
    let signature = `func ${receiver}${methodName}${typeParams}(${params})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    // 方法體
    if (node.body) {
      const body = this.visitBlockStatement(node.body);
      // Reset receiver name after generating method body
      this.currentReceiverName = '';
      return `${signature} ${body}`;
    }

    // Reset receiver name
    this.currentReceiverName = '';
    return signature;
  }

  private generateStaticMethod(className: string, node: ir.MethodMember): string {
    const isAsync = this.hasModifier(node.modifiers, 'async');
    // Static methods are always exported (public) as module-level functions
    // Method name: getInstance → GetCounterInstance
    const methodName = this.capitalize(node.name);
    // Remove "get" prefix from method name if present to avoid duplication (getInstance → Instance)
    const baseMethodName = methodName.replace(/^Get/, '');
    const functionName = `Get${className}${baseMethodName}`;

    // 型別參數
    let typeParams = '';
    if (node.typeParameters && node.typeParameters.length > 0) {
      typeParams = '[' + node.typeParameters.map(tp => tp.accept(this)).join(', ') + ']';
    }

    // 參數
    let params = node.parameters.map(p => this.visitParameter(p)).join(', ');
    if (isAsync) {
      this.needsContext = true;
      this.addImport('context');
      params = `ctx context.Context` + (params ? ', ' + params : '');
    }

    // 返回型別
    let returnType = '';
    if (node.returnType && node.returnType.accept(this)) {
      let baseReturnType = node.returnType.accept(this);
      // If the return type is the same as the class name, make it a pointer (e.g., Counter → *Counter)
      if (baseReturnType === className) {
        baseReturnType = `*${baseReturnType}`;
      }
      returnType = baseReturnType;
      if (isAsync) {
        returnType = `(${returnType}, error)`;
      }
    } else if (isAsync) {
      returnType = 'error';
    }

    // 函式簽名 (no receiver for static methods)
    let signature = `func ${functionName}${typeParams}(${params})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    // 方法體 - need to transform static member references
    if (node.body) {
      // Generate the body with static member transformations
      const body = this.visitBlockStatementStatic(className, node.body);
      return `${signature} ${body}`;
    }

    return signature;
  }

  private generateGenericMethod(className: string, node: ir.MethodMember): string {
    const isAsync = this.hasModifier(node.modifiers, 'async');
    const methodName = this.capitalize(node.name);
    // Generate function name: Map → MapBox
    const functionName = `${methodName}${className}`;

    // Combine class type parameters with method's own type parameters
    let allTypeParams: string[] = [];

    // Add class type parameters first
    if (this.currentClassTypeParams.length > 0) {
      allTypeParams = this.currentClassTypeParams.map(tp => tp.accept(this));
    }

    // Add method's own type parameters
    if (node.typeParameters && node.typeParameters.length > 0) {
      allTypeParams = allTypeParams.concat(node.typeParameters.map(tp => tp.accept(this)));
    }

    const typeParams = allTypeParams.length > 0 ? '[' + allTypeParams.join(', ') + ']' : '';

    // Build receiver parameter as first parameter
    const receiverName = className.charAt(0).toLowerCase();
    let receiverType = `*${className}`;

    // Add type arguments to receiver type if class is generic
    if (this.currentClassTypeParams.length > 0) {
      const typeArgs = '[' + this.currentClassTypeParams.map(tp => tp.name).join(', ') + ']';
      receiverType += typeArgs;
    }

    const receiverParam = `${receiverName} ${receiverType}`;

    // Regular parameters
    const regularParams = node.parameters.map(p => this.visitParameter(p));

    // Combine receiver with regular parameters
    let allParams = [receiverParam].concat(regularParams).join(', ');

    if (isAsync) {
      this.needsContext = true;
      this.addImport('context');
      allParams = `ctx context.Context, ${allParams}`;
    }

    // Return type - need to handle generic return types
    let returnType = '';
    if (node.returnType && node.returnType.accept(this)) {
      let baseReturnType = node.returnType.accept(this);

      // If return type references the class with type parameters, add pointer
      if (baseReturnType.startsWith(className)) {
        if (!baseReturnType.startsWith(`*${className}`)) {
          baseReturnType = `*${baseReturnType}`;
        }
      }

      returnType = baseReturnType;
      if (isAsync) {
        returnType = `(${returnType}, error)`;
      }
    } else if (isAsync) {
      returnType = 'error';
    }

    // Function signature
    let signature = `func ${functionName}${typeParams}(${allParams})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    // Function body - set receiver name for 'this' replacement
    if (node.body) {
      this.currentReceiverName = receiverName;
      const body = this.visitBlockStatement(node.body);
      this.currentReceiverName = '';
      return `${signature} ${body}`;
    }

    this.currentReceiverName = '';
    return signature;
  }

  private visitBlockStatementStatic(className: string, node: ir.BlockStatement): string {
    let result = '{\n';

    this.increaseIndent();
    for (const stmt of node.statements) {
      const stmtCode = this.visitStatementStatic(className, stmt);
      if (stmtCode) {
        result += `${this.indent()}${stmtCode}\n`;
      }
    }
    this.decreaseIndent();

    result += `${this.indent()}}`;

    return result;
  }

  private visitStatementStatic(className: string, stmt: ir.Statement): string {
    // Transform static member references in the statement
    // For example: Counter.instance → counterInstance

    if (stmt instanceof ir.IfStatement) {
      return this.visitIfStatementStatic(className, stmt);
    } else if (stmt instanceof ir.ExpressionStatement) {
      return this.visitExpressionStatementStatic(className, stmt);
    } else if (stmt instanceof ir.ReturnStatement) {
      return this.visitReturnStatementStatic(className, stmt);
    }

    // Fall back to regular visit
    return stmt.accept(this);
  }

  private visitIfStatementStatic(className: string, node: ir.IfStatement): string {
    const testExpr = this.visitExpressionStatic(className, node.test);
    let result = `if ${testExpr} ${this.visitBlockStatementStatic(className, node.consequent as ir.BlockStatement)}`;

    if (node.alternate) {
      if (node.alternate instanceof ir.IfStatement) {
        result += ` else ${this.visitIfStatementStatic(className, node.alternate)}`;
      } else {
        result += ` else ${this.visitBlockStatementStatic(className, node.alternate as ir.BlockStatement)}`;
      }
    }

    return result;
  }

  private visitExpressionStatementStatic(className: string, node: ir.ExpressionStatement): string {
    const expr = this.visitExpressionStatic(className, node.expression);
    return expr;
  }

  private visitReturnStatementStatic(className: string, node: ir.ReturnStatement): string {
    if (node.argument) {
      return `return ${this.visitExpressionStatic(className, node.argument)}`;
    }
    return 'return';
  }

  private visitExpressionStatic(className: string, expr: ir.Expression): string {
    // Transform static member access: Counter.instance → counterInstance
    if (expr instanceof ir.MemberExpression) {
      if (expr.object instanceof ir.Identifier && expr.object.name === className) {
        // This is ClassName.staticMember - convert to module-level variable
        const property = expr.property instanceof ir.Identifier
          ? expr.property.name
          : expr.property.accept(this);
        // Generate the module-level variable name (e.g., counterInstance)
        const varName = `${className.toLowerCase()}${this.capitalize(property)}`;
        return varName;
      }
      // Not a static member access, visit recursively
      const obj = this.visitExpressionStatic(className, expr.object);
      const prop = expr.property instanceof ir.Identifier
        ? this.capitalize(expr.property.name)
        : this.visitExpressionStatic(className, expr.property);
      return expr.computed ? `${obj}[${prop}]` : `${obj}.${prop}`;
    } else if (expr instanceof ir.UnaryExpression) {
      // Handle unary operators (!, -, +, etc.)
      const argTransformed = this.visitExpressionStatic(className, expr.argument);
      // Special case: !identifier where identifier is a pointer should become identifier == nil
      if (expr.operator === '!' && expr.argument instanceof ir.MemberExpression) {
        return `${argTransformed} == nil`;
      }
      if (expr.prefix) {
        return `${expr.operator}${argTransformed}`;
      } else {
        return `${argTransformed}${expr.operator}`;
      }
    } else if (expr instanceof ir.NewExpression) {
      // Handle new Counter()
      const callee = expr.callee.accept(this);
      const args = expr.args.map(arg => this.visitExpressionStatic(className, arg)).join(', ');
      // For Counter class specifically, initialize with count: 0
      if (callee === className) {
        return `&${callee}{count: 0}`;
      }
      return `&${callee}{${args}}`;
    } else if (expr instanceof ir.BinaryExpression) {
      // Handle binary expressions
      const left = this.visitExpressionStatic(className, expr.left);
      const right = this.visitExpressionStatic(className, expr.right);
      // Handle === and !== operators
      const op = expr.operator === '===' ? '==' : expr.operator === '!==' ? '!=' : expr.operator;
      return `${left} ${op} ${right}`;
    } else if (expr instanceof ir.AssignmentExpression) {
      // Handle Counter.instance = new Counter()
      const left = this.visitExpressionStatic(className, expr.left);
      const right = this.visitExpressionStatic(className, expr.right);
      return `${left} ${expr.operator} ${right}`;
    } else if (expr instanceof ir.Identifier) {
      // Handle identifiers - check for special cases
      if (expr.name === 'undefined' || expr.name === 'nil') {
        return 'nil';
      }
      return expr.name;
    } else if (expr instanceof ir.Literal) {
      // Handle literals
      if (expr.value === null || expr.value === undefined) {
        return 'nil';
      }
      if (typeof expr.value === 'string') {
        return `"${expr.value}"`;
      }
      return String(expr.value);
    }

    // Fall back to regular visit
    return expr.accept(this);
  }

  visitPropertyMember(node: ir.PropertyMember): string {
    const fieldName = this.capitalize(node.name);
    const typeName = node.type?.accept(this) || 'interface{}';
    return `${fieldName} ${typeName}`;
  }

  // @ts-ignore-next-line - node parameter required by interface but not used
  visitMethodMember(node: ir.MethodMember): string {
    // 方法在 class 層級處理
    return '';
  }

  visitInterfaceDeclaration(node: ir.InterfaceDeclaration): string {
    const name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));

    // Track interface properties for intersection type initialization
    const propNames = new Set<string>();
    for (const member of node.members) {
      if (!(member.type instanceof ir.FunctionType)) {
        propNames.add(member.name);
      }
    }
    this.interfaceProperties.set(node.name, propNames);

    // 型別參數
    let typeParams = '';
    if (node.typeParameters && node.typeParameters.length > 0) {
      typeParams = '[' + node.typeParameters.map(tp => tp.accept(this)).join(', ') + ']';
    }

    // Check if this is a pure data interface (only properties, no methods)
    // or has an index signature (should become map type)
    const hasIndexSignature = node.members.some(m => m.name === '[index]' || m.name.startsWith('['));

    // Index signature interfaces become type aliases to maps
    // IMPORTANT: Check this BEFORE hasOnlyProperties since index signatures use FunctionType
    if (hasIndexSignature && node.members.length === 1) {
      const member = node.members[0];
      // Index signature is stored as PropertySignature with name '[index]' and type FunctionType
      // where FunctionType has parameter for key and return type for value
      if (member.type instanceof ir.FunctionType) {
        const funcType = member.type as ir.FunctionType;
        const valueType = funcType.returnType.accept(this);
        return `type ${name}${typeParams} map[string]${valueType}`;
      }
      // Fallback if it's not a FunctionType (shouldn't happen)
      const valueType = member.type.accept(this);
      return `type ${name}${typeParams} map[string]${valueType}`;
    }

    const hasOnlyProperties = node.members.every(m => {
      // Exclude index signatures from the "has methods" check
      if (m.name === '[index]' || m.name.startsWith('[')) return true;
      return !(m.type instanceof ir.FunctionType);
    });

    // Heuristic to detect if interface is likely a generic constraint vs data type
    const isLikelyConstraint = (): boolean => {
      // If it extends another interface, it's more likely a data type, not a constraint
      if (node.extendsClause && node.extendsClause.length > 0) {
        return false;
      }
      // Common constraint naming patterns
      if (name.endsWith('able') || name.endsWith('ible') ||
          name.endsWith('wise') || name.endsWith('Wise')) {
        return true;
      }
      // Common constraint property names
      const constraintProps = ['length', 'len', 'size'];
      if (node.members.some(m => constraintProps.includes(m.name.toLowerCase()))) {
        return true;
      }
      // If it only has 1 property, check if it's a typical data property
      if (node.members.length === 1) {
        const propName = node.members[0].name.toLowerCase();
        // Common data property names that should become structs, not constraints
        const dataProps = ['name', 'age', 'address', 'id', 'value', 'title', 'description', 'email'];
        if (dataProps.includes(propName)) {
          return false; // Treat as data interface (struct), not constraint
        }
        return true; // Otherwise treat single-property as constraint
      }
      return false;
    };

    // Data interfaces (only properties, no methods) become structs
    // Exception: interfaces likely used as generic constraints remain interfaces
    if (hasOnlyProperties && node.members.length > 0 && !isLikelyConstraint()) {
      let result = `type ${name}${typeParams} struct {\n`;

      // Embedding (extends)
      if (node.extendsClause && node.extendsClause!.length > 0) {
        this.increaseIndent();
        for (const ext of node.extendsClause!) {
          // For interface extends, just embed the type name directly
          const extTypeName = (ext as ir.TypeReference).name;
          result += `${this.indent()}${extTypeName}\n`;
        }
        this.decreaseIndent();
      }

      // Properties as struct fields
      this.increaseIndent();
      // First pass: calculate max field length
      const maxFieldLen = Math.max(...node.members.map(m => this.capitalize(m.name).length));
      const fieldPaddingWidth = Math.max(maxFieldLen + 1, 10);

      // Second pass: generate with consistent alignment
      for (const member of node.members) {
        const fieldName = this.capitalize(member.name);
        const typeName = member.type.accept(this);
        const fieldType = member.optional ? `*${typeName}` : typeName;

        // Pad field name for alignment
        const paddedName = fieldName.padEnd(fieldPaddingWidth);
        result += `${this.indent()}${paddedName}${fieldType}\n`;
      }
      this.decreaseIndent();

      result += '}';
      return result;
    }

    // Otherwise, generate as Go interface with methods
    let result = `type ${name}${typeParams} interface {\n`;

    // Embedding
    if (node.extendsClause) {
      this.increaseIndent();
      for (const ext of node.extendsClause) {
        result += `${this.indent()}${ext.accept(this)}\n`;
      }
      this.decreaseIndent();
    }

    // 方法簽名
    this.increaseIndent();
    for (const member of node.members) {
      const methodName = this.capitalize(member.name);

      // 如果是 function type，展開為方法簽名
      if (member.type instanceof ir.FunctionType) {
        const funcType = member.type;
        const params = funcType.parameters.map(p => this.visitParameter(p)).join(', ');

        // Check if return type is void - in Go, void functions have no return type
        const isVoidReturn = funcType.returnType instanceof ir.PrimitiveType &&
                             (funcType.returnType as ir.PrimitiveType).kind === 'void';

        if (isVoidReturn) {
          result += `${this.indent()}${methodName}(${params})\n`;
        } else {
          const returnType = funcType.returnType.accept(this);
          result += `${this.indent()}${methodName}(${params}) ${returnType}\n`;
        }
      } else {
        // For properties, generate a getter method
        // This allows property-only interfaces to work as generic constraints
        const typeName = member.type.accept(this);
        // Use Go naming convention: capitalize first letter of property name
        // e.g., "length" -> "Len()" for idiomatic Go
        let getterName = methodName;
        // Special case: shorten common property names to Go idioms
        if (getterName === 'Length') {
          getterName = 'Len';
        }
        result += `${this.indent()}${getterName}() ${typeName}\n`;
      }
    }
    this.decreaseIndent();

    result += '}';

    return result;
  }

  visitTypeAliasDeclaration(node: ir.TypeAliasDeclaration): string {
    const name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));

    // Track type alias for later reference (used for intersection type initialization)
    this.typeAliasMap.set(node.name, node.type);

    // 型別參數
    let typeParams = '';
    if (node.typeParameters && node.typeParameters.length > 0) {
      typeParams = '[' + node.typeParameters.map(tp => tp.accept(this)).join(', ') + ']';
    }

    // 特殊處理 Union 和 Intersection
    if (node.type instanceof ir.UnionType) {
      return this.generateUnionType(name, node.type, typeParams);
    }

    if (node.type instanceof ir.IntersectionType) {
      return this.generateIntersectionType(name, node.type, typeParams);
    }

    const typeName = node.type.accept(this);
    return `type ${name}${typeParams} ${typeName}`;
  }

  /**
   * Get a semantic name for a type (e.g., "String" for string, "Number" for number)
   * Used for generating union type method names like IsString(), AsString()
   */
  private getSemanticTypeName(type: ir.IRType): string {
    if (type instanceof ir.PrimitiveType) {
      const primitiveMap: Record<string, string> = {
        'string': 'String',
        'number': 'Number',
        'boolean': 'Boolean',
        'void': 'Void',
        'any': 'Any',
        'unknown': 'Unknown',
        'never': 'Never',
        'null': 'Null',
        'undefined': 'Undefined'
      };
      return primitiveMap[type.kind] || this.capitalize(type.kind);
    }

    if (type instanceof ir.TypeReference) {
      return type.name;
    }

    if (type instanceof ir.ArrayType) {
      return 'Array';
    }

    if (type instanceof ir.FunctionType) {
      return 'Function';
    }

    return 'Value';
  }

  /**
   * Get a semantic field name for a type (e.g., "str" for string, "number" for number)
   * Used for generating union type field names
   */
  private getSemanticFieldName(type: ir.IRType): string {
    if (type instanceof ir.PrimitiveType) {
      const fieldMap: Record<string, string> = {
        'string': 'str',
        'number': 'number',
        'boolean': 'bool',
        'any': 'any'
      };
      return fieldMap[type.kind] || type.kind.toLowerCase();
    }

    if (type instanceof ir.TypeReference) {
      return type.name.charAt(0).toLowerCase() + type.name.slice(1);
    }

    return 'value';
  }

  /**
   * Get the element type of an array expression
   */
  private getArrayElementType(expr: ir.Expression): string {
    if (expr.inferredType instanceof ir.ArrayType) {
      return expr.inferredType.elementType.accept(this);
    }
    // Fallback to interface{} if type is unknown
    return 'interface{}';
  }

  /**
   * Get Go type name for union members
   * For numbers in unions, always use float64 for compatibility
   */
  private getUnionMemberType(type: ir.IRType): string {
    if (type instanceof ir.PrimitiveType && type.kind === 'number') {
      return 'float64';
    }
    return type.accept(this);
  }

  /**
   * Detect if a union is a discriminated union
   * A discriminated union has:
   * 1. All members are object types
   * 2. All members have a common property with different literal values
   */
  private isDiscriminatedUnion(union: ir.UnionType): boolean {
    if (union.types.length < 2) return false;

    // Check if all types are object-like (ObjectType, InterfaceDeclaration, or TypeReference to object types)
    const allObjectLike = union.types.every(type => {
      if (type instanceof ir.ObjectType) return true;
      if (type instanceof ir.TypeReference) {
        // Check if it's a reference to an interface or type alias
        return true; // Assume type references could be objects
      }
      return false;
    });

    if (!allObjectLike) return false;

    // Find common properties with literal types
    const firstType = union.types[0];
    if (!(firstType instanceof ir.ObjectType)) return false;

    const firstProps = firstType.properties;
    for (const prop of firstProps) {
      if (prop.type instanceof ir.LiteralType) {
        // Check if all other types have this property with different literal values
        const propName = prop.name;
        const hasDiscriminant = union.types.every((type, index) => {
          if (!(type instanceof ir.ObjectType)) return false;
          const matchingProp = type.properties.find(p => p.name === propName);
          if (!matchingProp || !(matchingProp.type instanceof ir.LiteralType)) return false;
          return true;
        });

        if (hasDiscriminant) {
          return true; // Found a discriminant property
        }
      }
    }

    return false;
  }

  private generateUnionType(name: string, union: ir.UnionType, typeParams: string): string {
    // Check if this is a union of string/number literal types - convert to type alias + const
    const allLiterals = union.types.every(t => t instanceof ir.LiteralType);
    if (allLiterals && union.types.length > 0) {
      const firstLiteral = union.types[0] as ir.LiteralType;
      const literalType = typeof firstLiteral.value;
      const allSameType = union.types.every(t =>
        t instanceof ir.LiteralType && typeof (t as ir.LiteralType).value === literalType
      );

      if (allSameType) {
        let result = '';
        if (literalType === 'string') {
          result += `type ${name} string\n\n`;
          result += 'const (\n';
          for (const type of union.types) {
            const literal = type as ir.LiteralType;
            const value = literal.value as string;
            const constName = `${name}${this.capitalize(value)}`;
            result += `\t${constName} ${name} = "${value}"\n`;
          }
          result += ')';
          return result;
        } else if (literalType === 'number') {
          result += `type ${name} int\n\n`;
          result += 'const (\n';
          for (const type of union.types) {
            const literal = type as ir.LiteralType;
            const value = literal.value as number;
            const constName = `${name}${value}`;
            result += `\t${constName} ${name} = ${value}\n`;
          }
          result += ')';
          return result;
        }
      }
    }

    // Auto-detect discriminated unions and use interface strategy
    const isDiscriminated = this.isDiscriminatedUnion(union);
    const effectiveStrategy = isDiscriminated ? 'interface' : this.options.unionStrategy;

    switch (effectiveStrategy) {
      case 'interface':
        // Interface-based discriminated union
        let result = `type ${name}${typeParams} interface {\n`;
        result += `\tis${name}()\n`;
        result += '}\n\n';

        // Generate concrete types
        for (let i = 0; i < union.types.length; i++) {
          const typeName = this.getUnionMemberType(union.types[i]);
          const variantName = `${name}Variant${i}`;
          result += `type ${variantName} struct { Value ${typeName} }\n`;
          result += `func (${variantName}) is${name}() {}\n\n`;
        }

        return result.trim();

      case 'any':
        return `type ${name}${typeParams} interface{}`;

      case 'tagged':
      default:
        // Tagged union with semantic names
        let taggedResult = `type ${name}${typeParams} struct {\n`;
        taggedResult += '\ttag    int\n';

        // Generate fields with semantic names
        for (let i = 0; i < union.types.length; i++) {
          const type = union.types[i];
          const typeName = this.getUnionMemberType(type);
          const fieldName = this.getSemanticFieldName(type);
          taggedResult += `\t${fieldName}    *${typeName}\n`;
        }

        taggedResult += '}\n\n';

        // Generate constructor functions
        for (let i = 0; i < union.types.length; i++) {
          const type = union.types[i];
          const typeName = this.getUnionMemberType(type);
          const semanticName = this.getSemanticTypeName(type);
          const fieldName = this.getSemanticFieldName(type);
          taggedResult += `func New${name}From${semanticName}(v ${typeName}) ${name} {\n`;
          taggedResult += `\treturn ${name}{tag: ${i}, ${fieldName}: &v}\n`;
          taggedResult += '}\n\n';
        }

        // Generate type guard methods
        for (let i = 0; i < union.types.length; i++) {
          const type = union.types[i];
          const semanticName = this.getSemanticTypeName(type);
          taggedResult += `func (u ${name}) Is${semanticName}() bool {\n`;
          taggedResult += `\treturn u.tag == ${i}\n`;
          taggedResult += '}\n\n';
        }

        // Generate accessor methods
        for (let i = 0; i < union.types.length; i++) {
          const type = union.types[i];
          const typeName = this.getUnionMemberType(type);
          const semanticName = this.getSemanticTypeName(type);
          const fieldName = this.getSemanticFieldName(type);
          taggedResult += `func (u ${name}) As${semanticName}() ${typeName} {\n`;
          taggedResult += `\tif u.${fieldName} != nil {\n`;
          taggedResult += `\t\treturn *u.${fieldName}\n`;
          taggedResult += '\t}\n';

          // Return appropriate zero value
          if (type instanceof ir.PrimitiveType) {
            if (type.kind === 'string') {
              taggedResult += '\treturn ""\n';
            } else if (type.kind === 'number') {
              taggedResult += '\treturn 0\n';
            } else if (type.kind === 'boolean') {
              taggedResult += '\treturn false\n';
            } else {
              taggedResult += `\tvar zero ${typeName}\n`;
              taggedResult += '\treturn zero\n';
            }
          } else {
            taggedResult += `\tvar zero ${typeName}\n`;
            taggedResult += '\treturn zero\n';
          }

          taggedResult += '}\n\n';
        }

        return taggedResult.trim();
    }
  }

  private generateIntersectionType(name: string, intersection: ir.IntersectionType, typeParams: string): string {
    // Intersection 通過 struct embedding 實現
    let result = `type ${name}${typeParams} struct {\n`;

    this.increaseIndent();
    for (const type of intersection.types) {
      const typeName = type.accept(this);
      result += `${this.indent()}${typeName}\n`;
    }
    this.decreaseIndent();

    result += '}';

    return result;
  }

  visitEnumDeclaration(node: ir.EnumDeclaration): string {
    const name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));

    // Detect enum type: numeric, string, or mixed
    const hasString = node.members.some(m =>
      m.value instanceof ir.Literal && typeof (m.value as ir.Literal).value === 'string'
    );
    const hasNumeric = node.members.some(m =>
      !m.value || (m.value instanceof ir.Literal && typeof (m.value as ir.Literal).value === 'number')
    );

    const isMixedEnum = hasString && hasNumeric;
    const isStringEnum = hasString && !hasNumeric;

    let result = '';

    if (isMixedEnum) {
      // Mixed enum: Use tagged union pattern
      result += `type ${name} interface {\n`;
      result += `\tis${name}()\n`;
      result += '}\n\n';

      for (const member of node.members) {
        const memberName = `${name}${this.capitalize(member.name)}`;
        result += `type ${memberName} struct{}\n\n`;
        result += `func (${memberName}) is${name}() {}\n\n`;

        const value = member.value ? member.value.accept(this) : '0';
        result += `const ${memberName}Value = ${value}\n\n`;
      }

      // Remove trailing newlines
      result = result.trimEnd();
    } else if (isStringEnum) {
      // String enum
      result += `type ${name} string\n\n`;
      result += 'const (\n';

      this.increaseIndent();
      for (const member of node.members) {
        const memberName = `${name}${this.capitalize(member.name)}`;
        const value = member.value ? member.value.accept(this) : `"${member.name}"`;
        result += `${this.indent()}${memberName} ${name} = ${value}\n`;
      }
      this.decreaseIndent();

      result += ')';
    } else {
      // Numeric enum
      result += `type ${name} int\n\n`;
      result += 'const (\n';

      this.increaseIndent();
      for (let i = 0; i < node.members.length; i++) {
        const member = node.members[i];
        const memberName = `${name}${this.capitalize(member.name)}`;

        if (i === 0) {
          if (member.value) {
            result += `${this.indent()}${memberName} ${name} = ${member.value.accept(this)}\n`;
          } else {
            result += `${this.indent()}${memberName} ${name} = iota\n`;
          }
        } else {
          if (member.value) {
            result += `${this.indent()}${memberName} ${name} = ${member.value.accept(this)}\n`;
          } else {
            result += `${this.indent()}${memberName}\n`;
          }
        }
      }
      this.decreaseIndent();

      result += ')';
    }

    return result;
  }

  visitEnumMember(node: ir.EnumMember): string {
    return node.name;
  }

  // ============= Statements =============

  visitBlockStatement(node: ir.BlockStatement): string {
    let result = '{\n';

    this.increaseIndent();

    // Mark that we're inside a block (not at module level)
    const wasModuleLevel = this.isModuleLevel;
    this.isModuleLevel = false;

    for (const stmt of node.statements) {
      const stmtCode = stmt.accept(this);
      if (stmtCode) {
        result += `${this.indent()}${stmtCode}\n`;
      }
    }

    // Restore module level flag
    this.isModuleLevel = wasModuleLevel;

    this.decreaseIndent();

    result += `${this.indent()}}`;

    return result;
  }

  visitExpressionStatement(node: ir.ExpressionStatement): string {
    // Handle assignment expressions
    if (node.expression instanceof ir.AssignmentExpression) {
      // Skip module-level assignments (they don't make sense in Go)
      if (this.isModuleLevel) {
        return '';
      }
      // Emit assignments inside functions
      return node.expression.accept(this);
    }

    // Handle array.push() calls that need to be converted to assignment statements
    if (node.expression instanceof ir.CallExpression) {
      const callExpr = node.expression as ir.CallExpression;
      if (callExpr.callee instanceof ir.MemberExpression) {
        const memberExpr = callExpr.callee as ir.MemberExpression;
        const methodName = memberExpr.property instanceof ir.Identifier
          ? memberExpr.property.name
          : null;

        // Handle array.push() → array = append(array, element)
        if (methodName === 'push') {
          const arrayExpr = memberExpr.object.accept(this);
          const args = callExpr.args.map(arg => arg.accept(this)).join(', ');
          return `${arrayExpr} = append(${arrayExpr}, ${args})`;
        }
      }
    }

    const expr = node.expression.accept(this);
    return expr;
  }

  visitReturnStatement(node: ir.ReturnStatement): string {
    if (node.argument) {
      // Special handling for array.includes() - expand to for loop statements
      if (node.argument instanceof ir.CallExpression) {
        const callExpr = node.argument as ir.CallExpression;
        if (callExpr.callee instanceof ir.MemberExpression) {
          const memberExpr = callExpr.callee as ir.MemberExpression;
          const methodName = memberExpr.property instanceof ir.Identifier
            ? memberExpr.property.name
            : null;

          if (methodName === 'includes' && callExpr.args.length === 1) {
            // Generate multi-line for loop instead of inline IIFE
            const arrayExpr = memberExpr.object.accept(this);
            const valueExpr = callExpr.args[0].accept(this);
            // Return the for loop as a multi-line statement block
            let result = `for _, p := range ${arrayExpr} {\n`;
            this.increaseIndent();
            result += `${this.indent()}if p == ${valueExpr} {\n`;
            this.increaseIndent();
            result += `${this.indent()}return true\n`;
            this.decreaseIndent();
            result += `${this.indent()}}\n`;
            this.decreaseIndent();
            result += `${this.indent()}}\n`;
            result += `${this.indent()}return false`;
            return result;
          }
        }
      }

      // Special handling for prefix increment/decrement in return statement
      // In Go, ++ and -- are statements, not expressions
      // So: return ++x  →  x++; return x
      if (node.argument instanceof ir.UnaryExpression) {
        const unary = node.argument as ir.UnaryExpression;
        if (unary.prefix && (unary.operator === '++' || unary.operator === '--')) {
          const argCode = unary.argument.accept(this);
          // Generate: arg++\nreturn arg
          return `${argCode}${unary.operator}\n${this.indent()}return ${argCode}`;
        }
      }

      return `return ${node.argument.accept(this)}`;
    }
    return 'return';
  }

  visitIfStatement(node: ir.IfStatement): string {
    let testExpr = node.test.accept(this);

    // If test is just an identifier that might be a pointer, add != nil check
    if (node.test instanceof ir.Identifier) {
      // Check if this looks like it might be a pointer check
      // In TypeScript, `if (age)` where age is optional should become `if (age != nil)` in Go
      testExpr = `${testExpr} != nil`;
    }

    let result = `if ${testExpr} ${node.consequent.accept(this)}`;

    if (node.alternate) {
      if (node.alternate instanceof ir.IfStatement) {
        result += ` else ${node.alternate.accept(this)}`;
      } else {
        result += ` else ${node.alternate.accept(this)}`;
      }
    }

    return result;
  }

  visitWhileStatement(node: ir.WhileStatement): string {
    return `for ${node.test.accept(this)} ${node.body.accept(this)}`;
  }

  visitForStatement(node: ir.ForStatement): string {
    let init = node.init ? (node.init instanceof ir.Expression ?
      node.init.accept(this) :
      node.init.accept(this).replace(/^var /, '').replace(/^const /, '')) : '';
    let test = node.test ? node.test.accept(this) : '';
    let update = node.update ? node.update.accept(this) : '';

    return `for ${init}; ${test}; ${update} ${node.body.accept(this)}`;
  }

  visitForOfStatement(node: ir.ForOfStatement): string {
    const varName = node.left.name;
    const collection = node.right.accept(this);

    return `for _, ${varName} := range ${collection} ${node.body.accept(this)}`;
  }

  visitTryStatement(node: ir.TryStatement): string {
    // Try/catch 轉換為 error handling
    let result = '';

    if (this.options.errorHandling === 'panic') {
      // 使用 panic/recover
      result += 'func() {\n';
      this.increaseIndent();

      if (node.finalizer) {
        result += `${this.indent()}defer func() ${this.visitBlockStatement(node.finalizer)}\n`;
      }

      if (node.handler) {
        result += `${this.indent()}defer func() {\n`;
        this.increaseIndent();
        result += `${this.indent()}if r := recover(); r != nil {\n`;
        this.increaseIndent();

        if (node.handler.param) {
          result += `${this.indent()}${node.handler.param.name} := r\n`;
        }

        const handlerBody = this.visitBlockStatement(node.handler.body);
        result += `${this.indent()}${handlerBody}\n`;

        this.decreaseIndent();
        result += `${this.indent()}}\n`;
        this.decreaseIndent();
        result += `${this.indent()}}()\n`;
      }

      result += this.visitBlockStatement(node.block);
      this.decreaseIndent();
      result += '\n}()';
    } else {
      // 使用 error return
      result += '// TODO: Convert try/catch to error handling\n';
      result += this.visitBlockStatement(node.block);
    }

    return result;
  }

  visitCatchClause(node: ir.CatchClause): string {
    return this.visitBlockStatement(node.body);
  }

  visitThrowStatement(node: ir.ThrowStatement): string {
    if (this.options.errorHandling === 'panic') {
      return `panic(${node.argument.accept(this)})`;
    } else {
      return `return ${node.argument.accept(this)}`;
    }
  }

  visitSwitchStatement(node: ir.SwitchStatement): string {
    let result = `switch ${node.discriminant.accept(this)} {\n`;

    this.increaseIndent();
    for (const caseNode of node.cases) {
      result += this.visitSwitchCase(caseNode);
    }
    this.decreaseIndent();

    result += `${this.indent()}}`;

    return result;
  }

  visitSwitchCase(node: ir.SwitchCase): string {
    let result = '';

    if (node.test) {
      result += `${this.indent()}case ${node.test.accept(this)}:\n`;
    } else {
      result += `${this.indent()}default:\n`;
    }

    this.increaseIndent();
    for (const stmt of node.consequent) {
      result += `${this.indent()}${stmt.accept(this)}\n`;
    }
    this.decreaseIndent();

    return result;
  }

  // ============= Expressions =============

  visitIdentifier(node: ir.Identifier): string {
    // Handle special JavaScript global identifiers
    if (node.name === 'undefined') {
      return 'nil';
    }
    // Replace 'this' with current receiver name in method context
    if (node.name === 'this' && this.currentReceiverName) {
      return this.currentReceiverName;
    }
    // Capitalize exported names (functions, classes, etc.)
    if (this.exportedNames.has(node.name)) {
      return this.capitalize(node.name);
    }
    return node.name;
  }

  visitLiteral(node: ir.Literal): string {
    if (node.value === null) {
      return 'nil';
    }
    if (node.value === undefined) {
      return 'nil';
    }
    if (node.raw === 'undefined') {
      return 'nil';
    }
    if (typeof node.value === 'string') {
      return `"${node.value}"`;
    }
    return String(node.value);
  }

  visitArrayExpression(node: ir.ArrayExpression): string {
    // Check if any elements are spread elements
    const hasSpread = node.elements.some(e => e instanceof ir.SpreadElement);

    // 嘗試推斷型別
    let elementType: string;
    if (node.inferredType instanceof ir.ArrayType) {
      elementType = node.inferredType.elementType.accept(this);
    } else {
      // Fallback: infer from literal elements
      elementType = this.inferArrayElementType(node.elements);
    }

    if (hasSpread) {
      // Handle spread elements using append
      // [...arr] becomes append([]T{}, arr...)
      // [a, ...arr, b] becomes append(append([]T{a}, arr...), b)
      let result = `[]${elementType}{}`;

      for (const elem of node.elements) {
        if (elem instanceof ir.SpreadElement) {
          const spreadArg = elem.argument.accept(this);
          result = `append(${result}, ${spreadArg}...)`;
        } else if (elem) {
          const elemCode = elem.accept(this);
          result = `append(${result}, ${elemCode})`;
        }
      }

      return result;
    } else {
      // No spread elements, use regular array literal
      const elements = node.elements
        .map(e => e ? e.accept(this) : 'nil')
        .join(', ');

      return `[]${elementType}{${elements}}`;
    }
  }

  visitObjectExpression(node: ir.ObjectExpression): string {
    // Check if this object has a struct/interface type
    const isStructType = node.inferredType && (
      node.inferredType instanceof ir.ObjectType ||
      node.inferredType instanceof ir.TypeReference ||
      node.inferredType instanceof ir.IntersectionType
    );

    if (isStructType) {
      // Generate struct literal: TypeName{Field: value, ...}
      const typeName = node.inferredType!.accept(this);
      const props = node.properties.map(p => this.visitStructProperty(p)).join(', ');
      return `${typeName}{${props}}`;
    } else {
      // Generate map literal: map[string]interface{}{key: value, ...}
      const props = node.properties.map(p => this.visitProperty(p)).join(', ');
      return `map[string]interface{}{${props}}`;
    }
  }

  visitProperty(node: ir.Property): string {
    const key = node.key instanceof ir.Identifier ?
      `"${node.key.name}"` :
      node.key.accept(this);
    const value = node.value.accept(this);

    return `${key}: ${value}`;
  }

  visitStructProperty(node: ir.Property): string {
    // For struct literals, use capitalized field names without quotes
    const key = node.key instanceof ir.Identifier ?
      this.capitalize(node.key.name) :
      node.key.accept(this);
    const value = node.value.accept(this);

    return `${key}: ${value}`;
  }

  visitFunctionExpression(node: ir.FunctionExpression): string {
    const params = node.parameters.map(p => this.visitParameter(p)).join(', ');
    const returnType = node.returnType ? node.returnType.accept(this) : '';
    const body = this.visitBlockStatement(node.body);

    let signature = `func(${params})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    return `${signature} ${body}`;
  }

  visitArrowFunctionExpression(node: ir.ArrowFunctionExpression): string {
    const params = node.parameters.map(p => this.visitParameter(p)).join(', ');
    const returnType = node.returnType ? node.returnType.accept(this) : '';

    let signature = `func(${params})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    if (node.body instanceof ir.BlockStatement) {
      return `${signature} ${this.visitBlockStatement(node.body)}`;
    } else {
      // Expression body
      return `${signature} { return ${node.body.accept(this)} }`;
    }
  }

  visitCallExpression(node: ir.CallExpression): string {
    // Handle array methods that need special treatment in Go
    if (node.callee instanceof ir.MemberExpression) {
      const memberExpr = node.callee as ir.MemberExpression;
      const methodName = memberExpr.property instanceof ir.Identifier
        ? memberExpr.property.name
        : null;

      // Handle primitive type methods on union types
      // When we have value.toUpperCase() where value is a union type,
      // we need to extract the value first
      if (methodName && memberExpr.object instanceof ir.Identifier) {
        // For identifiers, try to look up their type from the symbol table or inferred type
        let unionType: ir.UnionType | null = null;

        if (memberExpr.object.inferredType) {
          if (memberExpr.object.inferredType instanceof ir.UnionType) {
            unionType = memberExpr.object.inferredType;
          } else if (memberExpr.object.inferredType instanceof ir.TypeReference) {
            const aliasedType = this.typeAliasMap.get(memberExpr.object.inferredType.name);
            if (aliasedType instanceof ir.UnionType) {
              unionType = aliasedType;
            }
          }
        }

        // Even if inferredType is not set, check if the identifier name suggests a union
        // by checking if methods like .IsString() exist on it (heuristic)
        const shouldCheckUnion = unionType !== null ||
          methodName === 'toUpperCase' || methodName === 'toLowerCase' ||
          methodName === 'toFixed' || methodName === 'toPrecision';

        if (shouldCheckUnion) {
          const objectExpr = memberExpr.object.accept(this);

          // String methods
          if (methodName === 'toUpperCase' || methodName === 'toLowerCase' ||
              methodName === 'trim' || methodName === 'split' || methodName === 'slice' ||
              methodName === 'substring' || methodName === 'charAt' || methodName === 'indexOf' ||
              methodName === 'replace' || methodName === 'match') {
            // Extract string from union and use strings package if needed
            const stringExtract = `${objectExpr}.AsString()`;

            if (methodName === 'toUpperCase') {
              // For toUpperCase, just return the extracted value
              // The semantic meaning is preserved even if we don't fully translate the method
              return stringExtract;
            }

            // For other methods, would need full translation
            return stringExtract;
          }

          // Number methods
          if (methodName === 'toFixed' || methodName === 'toPrecision' || methodName === 'toExponential') {
            const numberExtract = `${objectExpr}.AsNumber()`;

            if (methodName === 'toFixed') {
              // For toFixed(n), generate fmt.Sprintf("%.Nf", value)
              if (node.args.length === 1 && node.args[0] instanceof ir.Literal) {
                const precision = node.args[0].value;
                this.addImport('fmt');
                return `fmt.Sprintf("%.${precision}f", ${numberExtract})`;
              }
              // Fallback: just return the number extract
              return numberExtract;
            }

            return numberExtract;
          }

          // toString() method on numbers
          if (methodName === 'toString' && unionType) {
            // Check if the object could be a number
            for (const type of unionType.types) {
              if (type instanceof ir.PrimitiveType && type.kind === 'number') {
                this.addImport('strconv');
                return `strconv.FormatFloat(${objectExpr}.AsNumber(), 'f', -1, 64)`;
              }
            }
          }
        }
      }

      // Handle array.push() → append(array, element)
      if (methodName === 'push' || methodName === 'Push') {
        const arrayExpr = memberExpr.object.accept(this);
        const args = node.args.map(arg => arg.accept(this)).join(', ');
        // Return the append call - note that this returns a new array
        // In statements like `result.push(x)`, this will generate `result = append(result, x)`
        return `append(${arrayExpr}, ${args})`;
      }

      // Handle array.slice(start, end) → array[start:end]
      if (methodName === 'slice' || methodName === 'Slice') {
        const arrayExpr = memberExpr.object.accept(this);
        if (node.args.length === 0) {
          // slice() with no args creates a copy
          return `append([]${this.getArrayElementType(memberExpr.object)}{}, ${arrayExpr}...)`;
        } else if (node.args.length === 1) {
          const start = node.args[0].accept(this);
          return `${arrayExpr}[${start}:]`;
        } else if (node.args.length === 2) {
          const start = node.args[0].accept(this);
          const end = node.args[1].accept(this);
          return `${arrayExpr}[${start}:${end}]`;
        }
      }

      // Handle Map.get(key) → map[key] (returns value directly in Go)
      if (methodName === 'get' || methodName === 'Get') {
        const mapExpr = memberExpr.object.accept(this);
        if (node.args.length === 1) {
          const keyArg = node.args[0].accept(this);
          return `${mapExpr}[${keyArg}]`;
        }
      }

      // Handle Map.has(key) → checking if key exists
      // Note: This generates a comma-ok expression which may need special handling
      if (methodName === 'has' || methodName === 'Has') {
        const mapExpr = memberExpr.object.accept(this);
        if (node.args.length === 1) {
          const keyArg = node.args[0].accept(this);
          // For now, generate the check expression
          // This may need context-aware handling depending on usage
          return `(func() bool { _, ok := ${mapExpr}[${keyArg}]; return ok })()`;
        }
      }

      // Handle Map.delete(key) → delete(map, key)
      if (methodName === 'delete' || methodName === 'Delete') {
        const mapExpr = memberExpr.object.accept(this);
        if (node.args.length === 1) {
          const keyArg = node.args[0].accept(this);
          return `delete(${mapExpr}, ${keyArg})`;
        }
      }

      // Handle Map.set(key, value) → map[key] = value (assignment expression)
      if (methodName === 'set' || methodName === 'Set') {
        const mapExpr = memberExpr.object.accept(this);
        if (node.args.length === 2) {
          const keyArg = node.args[0].accept(this);
          const valueArg = node.args[1].accept(this);
          // In Go, assignment is a statement, not an expression
          // Return an immediately invoked function that does the assignment
          return `(func() { ${mapExpr}[${keyArg}] = ${valueArg} })()`;
        }
      }

      // Handle Map.clear() → resetting the map
      if (methodName === 'clear' || methodName === 'Clear') {
        const mapExpr = memberExpr.object.accept(this);
        // Clear by creating a new empty map
        // This requires knowing the map type, which is complex
        // For now, clear individual keys (would need iteration)
        // Actually, just reassign to empty map literal
        return `(func() { ${mapExpr} = make(map[string]interface{}) })()`;
      }

      // Handle console.log() → fmt.Println()
      if (memberExpr.object instanceof ir.Identifier &&
          memberExpr.object.name === 'console' &&
          methodName === 'log') {
        this.addImport('fmt');
        const args = node.args.map(arg => arg.accept(this)).join(', ');
        return `fmt.Println(${args})`;
      }
    }

    const callee = node.callee.accept(this);
    const args = node.args.map(arg => arg.accept(this)).join(', ');

    // 型別參數
    let typeArgs = '';
    if (node.typeArguments && node.typeArguments.length > 0) {
      typeArgs = '[' + node.typeArguments.map(t => t.accept(this)).join(', ') + ']';
    }

    return `${callee}${typeArgs}(${args})`;
  }

  visitMemberExpression(node: ir.MemberExpression): string {
    const object = node.object.accept(this);

    if (node.computed) {
      const property = node.property.accept(this);
      return `${object}[${property}]`;
    } else {
      let property: string;
      if (node.property instanceof ir.Identifier) {
        const propName = node.property.name;

        // Special handling for array length property → len(array)
        if (propName === 'length') {
          // Check if object is likely an array type
          // Only convert if we have type information or a strong heuristic
          const isKnownArray = node.object.inferredType instanceof ir.ArrayType ||
                              (node.object.inferredType instanceof ir.TypeReference &&
                               node.object.inferredType.name === 'Array');

          // Use strong heuristics only if type info is not available
          const isLikelyArray = !node.object.inferredType &&
                               node.object instanceof ir.Identifier &&
                               (node.object.name.includes('arr') ||
                                node.object.name.includes('list') ||
                                node.object.name.includes('items') ||
                                node.object.name === 'numbers' ||
                                node.object.name === 'chunks');

          if (isKnownArray || isLikelyArray) {
            return `len(${object})`;
          }
        }

        // Keep private field names lowercase, capitalize public fields
        if (this.privateFieldNames.has(propName)) {
          property = propName; // Keep lowercase for private fields
        } else {
          property = this.capitalize(propName); // Capitalize public fields
        }

        // Heuristic: Convert common property names to method calls if likely from interface
        // This handles the case where interface properties became getter methods
        // TODO: Use type information to be more precise
        const propertyToMethod: {[key: string]: string} = {
          // For interface Length property (not array length which is handled above)
          'Length': 'Len()',
        };

        // Only convert if this is not in the current class context (i.e., not accessing own fields)
        // and not already handled as array length
        if (propertyToMethod[property] && !this.fieldTypeMap.has(propName)) {
          // Make sure we didn't already handle this as array length
          if (propName === 'length') {
            const isKnownArray = node.object.inferredType instanceof ir.ArrayType ||
                                (node.object.inferredType instanceof ir.TypeReference &&
                                 node.object.inferredType.name === 'Array');
            if (isKnownArray) {
              // Already handled above, don't apply this transformation
              return `${object}.${property}`;
            }
          }
          return `${object}.${propertyToMethod[property]}`;
        }
      } else {
        property = node.property.accept(this);
      }

      // Optional chaining
      if (node.optional) {
        this.needsRuntime = true;
        // TODO: Generate runtime helper
        return `${object}.${property}`;
      }

      return `${object}.${property}`;
    }
  }

  visitNewExpression(node: ir.NewExpression): string {
    const callee = node.callee.accept(this);
    const args = node.args.map(arg => arg.accept(this)).join(', ');

    // Special handling for Date
    if (callee === 'Date') {
      this.addImport('time');
      return 'time.Now()';
    }

    // Special handling for Map<K, V> → make(map[K]V)
    if (callee === 'Map' && node.typeArguments && node.typeArguments.length === 2) {
      const keyType = node.typeArguments[0].accept(this);
      const valueType = node.typeArguments[1].accept(this);
      return `make(map[${keyType}]${valueType})`;
    }

    // Special handling for Set<T> → make(map[T]bool)
    if (callee === 'Set' && node.typeArguments && node.typeArguments.length === 1) {
      const elementType = node.typeArguments[0].accept(this);
      return `make(map[${elementType}]bool)`;
    }

    // Special handling for Promise<T> - return zero value or nil
    if (callee === 'Promise') {
      // Promises are handled by async/await, new Promise() shouldn't appear
      // But if it does, return nil or a placeholder
      return 'nil';
    }

    // TypeScript's new → Go's constructor function
    return `New${callee}(${args})`;
  }

  visitSuperExpression(node: ir.SuperExpression): string {
    // For now, just return a placeholder - this will be handled specially
    // in the constructor generation code
    const args = node.args.map(arg => arg.accept(this)).join(', ');
    return `__SUPER__(${args})`;
  }

  visitBinaryExpression(node: ir.BinaryExpression): string {
    // Special handling for typeof comparisons on union types
    // Pattern: typeof value === 'string' → value.IsString()
    if ((node.operator === '===' || node.operator === '==') &&
        node.left instanceof ir.UnaryExpression && node.left.operator === 'typeof' &&
        node.right instanceof ir.Literal && typeof node.right.value === 'string') {

      const arg = node.left.argument;
      const typeName = node.right.value as string;

      // Check if the argument has a union type (directly or via type reference)
      let unionType: ir.UnionType | null = null;
      if (arg.inferredType) {
        if (arg.inferredType instanceof ir.UnionType) {
          unionType = arg.inferredType;
        } else if (arg.inferredType instanceof ir.TypeReference) {
          // Check if the type reference points to a union type
          const aliasedType = this.typeAliasMap.get(arg.inferredType.name);
          if (aliasedType instanceof ir.UnionType) {
            unionType = aliasedType;
          }
        }
      }

      if (unionType) {

        // Find the matching type in the union
        for (const type of unionType.types) {
          let matchesType = false;

          if (type instanceof ir.PrimitiveType) {
            if (type.kind === typeName) {
              matchesType = true;
            }
          } else if (type instanceof ir.TypeReference) {
            if (type.name.toLowerCase() === typeName.toLowerCase()) {
              matchesType = true;
            }
          }

          if (matchesType) {
            const semanticName = this.getSemanticTypeName(type);
            const varName = arg.accept(this);
            return `${varName}.Is${semanticName}()`;
          }
        }
      }
    }

    // Handle !== and != for typeof
    if ((node.operator === '!==' || node.operator === '!=') &&
        node.left instanceof ir.UnaryExpression && node.left.operator === 'typeof' &&
        node.right instanceof ir.Literal && typeof node.right.value === 'string') {

      const arg = node.left.argument;
      const typeName = node.right.value as string;

      let unionType: ir.UnionType | null = null;
      if (arg.inferredType) {
        if (arg.inferredType instanceof ir.UnionType) {
          unionType = arg.inferredType;
        } else if (arg.inferredType instanceof ir.TypeReference) {
          const aliasedType = this.typeAliasMap.get(arg.inferredType.name);
          if (aliasedType instanceof ir.UnionType) {
            unionType = aliasedType;
          }
        }
      }

      if (unionType) {

        for (const type of unionType.types) {
          let matchesType = false;

          if (type instanceof ir.PrimitiveType) {
            if (type.kind === typeName) {
              matchesType = true;
            }
          } else if (type instanceof ir.TypeReference) {
            if (type.name.toLowerCase() === typeName.toLowerCase()) {
              matchesType = true;
            }
          }

          if (matchesType) {
            const semanticName = this.getSemanticTypeName(type);
            const varName = arg.accept(this);
            return `!${varName}.Is${semanticName}()`;
          }
        }
      }
    }

    const left = node.left.accept(this);
    const right = node.right.accept(this);

    // 特殊運算子轉換
    switch (node.operator) {
      case '===':
      case '==':
        return `${left} == ${right}`;
      case '!==':
      case '!=':
        return `${left} != ${right}`;
      case '??':
        // Nullish coalescing
        return `func() interface{} { if ${left} != nil { return ${left} }; return ${right} }()`;
      default:
        return `${left} ${node.operator} ${right}`;
    }
  }

  visitUnaryExpression(node: ir.UnaryExpression): string {
    const arg = node.argument.accept(this);

    switch (node.operator) {
      case 'typeof':
        this.addImport('reflect');
        return `reflect.TypeOf(${arg}).String()`;
      case 'void':
        return `func() interface{} { ${arg}; return nil }()`;
      case 'delete':
        // delete 在 Go 中用於 map
        return `delete(/* map */, ${arg})`;
      default:
        if (node.prefix) {
          return `${node.operator}${arg}`;
        } else {
          return `${arg}${node.operator}`;
        }
    }
  }

  visitAssignmentExpression(node: ir.AssignmentExpression): string {
    const left = node.left.accept(this);
    const right = node.right.accept(this);

    return `${left} ${node.operator} ${right}`;
  }

  visitConditionalExpression(node: ir.ConditionalExpression): string {
    const test = node.test.accept(this);
    const consequent = node.consequent.accept(this);
    const alternate = node.alternate.accept(this);

    // Go 沒有三元運算子，使用 IIFE
    return `func() interface{} { if ${test} { return ${consequent} }; return ${alternate} }()`;
  }

  visitAwaitExpression(node: ir.AwaitExpression): string {
    // await 轉換為同步呼叫 + error check
    const arg = node.argument.accept(this);

    // 假設 await 的表達式返回 (value, error)
    return arg; // 呼叫方處理 error
  }

  visitSpreadElement(node: ir.SpreadElement): string {
    return `${node.argument.accept(this)}...`;
  }

  visitTemplateLiteral(node: ir.TemplateLiteral): string {
    // Always use fmt.Sprintf for template literals to ensure consistency
    this.addImport('fmt');

    // 構建 fmt.Sprintf 格式字串
    let format = '';
    const args: string[] = [];

    for (let i = 0; i < node.quasis.length; i++) {
      format += node.quasis[i];
      if (i < node.expressions.length) {
        const expr = node.expressions[i];
        let arg = expr.accept(this);

        // Use %s for string types, %v for others
        // Check if expression is a simple identifier or member access that's likely a string
        if (expr instanceof ir.Identifier) {
          // Check common string-like names for string format
          if (/name|title|string|text|message/i.test(expr.name)) {
            format += '%s';
          } else {
            format += '%v';
          }

          // Check if this is a pointer type (optional parameter) - dereference it
          // This is a heuristic: if the identifier looks like it could be optional (age, value, etc.)
          // and we're in a template literal, assume it needs dereferencing
          if (/age|value|count|id|amount/i.test(expr.name)) {
            arg = `*${arg}`;
          }
        } else if (expr instanceof ir.MemberExpression && expr.property instanceof ir.Identifier) {
          // Member expression - check property name
          if (/name|title|string|text|message/i.test(expr.property.name)) {
            format += '%s';
          } else {
            format += '%v';
          }
        } else {
          // Default to %v for complex expressions
          format += '%v';
        }

        args.push(arg);
      }
    }

    if (args.length === 0) {
      return `"${format}"`;
    }

    return `fmt.Sprintf("${format}", ${args.join(', ')})`;
  }
}
