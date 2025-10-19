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
    if (forceExport || this.hasModifier([], 'export')) {
      return this.capitalize(name);
    }
    return name;
  }

  private hasModifier(modifiers: ir.Modifier[], kind: string): boolean {
    return modifiers.some(m => m.kind === kind);
  }

  // ============= Module =============

  visitModule(node: ir.Module): string {
    let result = `package ${this.currentPackage}\n\n`;

    // First pass: identify which statements will produce empty output
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
        // Use inference for 'any' + Literal, unless name suggests explicit any
        const looksLikeExplicitAny = /any|unknown|value/i.test(name);
        if (node.initializer instanceof ir.Literal && !looksLikeExplicitAny) {
          shouldInferType = true;
        }
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
    if (node.returnType && node.returnType.accept(this)) {
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

      this.decreaseIndent();
      result += `${this.indent()}}`;

      return `${signature} ${result}`;
    }

    return signature;
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
    const name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));
    let result = '';

    // Set current class context for field name resolution
    this.currentClassName = name;
    this.privateFieldNames.clear();
    this.fieldTypeMap.clear();

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
        if (isStatic) {
          staticMethods.push(member);
        } else {
          instanceMethods.push(member);
        }
      }
    }

    // Struct 定義 (only instance members)
    result += `type ${name}${typeParams} struct {\n`;

    // Embedding (extends only - implements is for type checking, not data)
    if (node.extendsClause) {
      this.increaseIndent();
      result += `${this.indent()}${node.extendsClause.accept(this)}\n`;
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
    const constructor = this.generateConstructor(name, node);

    if (constructor) {
      result += '\n\n' + constructor;
      if (instanceMethods.length > 0 || staticMethods.length > 0) {
        result += '\n'; // One newline to create blank line before first method
      }
    }

    // Generate module-level functions for static methods
    for (let i = 0; i < staticMethods.length; i++) {
      result += '\n\n' + this.generateStaticMethod(name, staticMethods[i]);
      if (i < staticMethods.length - 1 || instanceMethods.length > 0) {
        result += '\n'; // One newline already added above for spacing
      }
    }

    // Instance methods
    for (let i = 0; i < instanceMethods.length; i++) {
      result += '\n\n' + this.generateMethod(name, instanceMethods[i]);
    }

    return result;
  }

  private generateConstructor(className: string, node: ir.ClassDeclaration): string {
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

    let result = `func New${className}(${params}) *${className} {\n`;

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

    result += `${this.indent()}\treturn &${className}{\n`;

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
      const parentClassName = node.extendsClause.accept(this);
      maxFieldNameLen = Math.max(maxFieldNameLen, parentClassName.length);
    }

    const initPaddingWidth = Math.max(maxFieldNameLen + 1 + 1, 11); // +1 for colon, +1 for space

    // If there's a super() call and parent class, initialize the embedded parent struct first
    if (superCall && node.extendsClause) {
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
      const receiverType = this.options.usePointerReceivers ? `*${className}` : className;
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
    if (node.returnType && node.returnType.accept(this)) {
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

    // Data interfaces (only properties, no methods) become structs
    if (hasOnlyProperties && node.members.length > 0) {
      let result = `type ${name}${typeParams} struct {\n`;

      // Embedding (extends)
      if (node.extendsClause && node.extendsClause.length > 0) {
        this.increaseIndent();
        for (const ext of node.extendsClause) {
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
      const typeName = member.type.accept(this);

      // 如果是 function type，展開為方法簽名
      if (member.type instanceof ir.FunctionType) {
        const funcType = member.type;
        const params = funcType.parameters.map(p => this.visitParameter(p)).join(', ');
        const returnType = funcType.returnType.accept(this);
        result += `${this.indent()}${methodName}(${params}) ${returnType}\n`;
      } else {
        // Getter 方法
        result += `${this.indent()}${methodName}() ${typeName}\n`;
      }
    }
    this.decreaseIndent();

    result += '}';

    return result;
  }

  visitTypeAliasDeclaration(node: ir.TypeAliasDeclaration): string {
    const name = this.exportName(node.name, this.hasModifier(node.modifiers, 'export'));

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

  private generateUnionType(name: string, union: ir.UnionType, typeParams: string): string {
    switch (this.options.unionStrategy) {
      case 'interface':
        // Interface-based discriminated union
        let result = `type ${name}${typeParams} interface {\n`;
        result += `\tis${name}()\n`;
        result += '}\n\n';

        // Generate concrete types
        for (let i = 0; i < union.types.length; i++) {
          const typeName = union.types[i].accept(this);
          const variantName = `${name}Variant${i}`;
          result += `type ${variantName} struct { Value ${typeName} }\n`;
          result += `func (${variantName}) is${name}() {}\n\n`;
        }

        return result.trim();

      case 'any':
        return `type ${name}${typeParams} interface{}`;

      case 'tagged':
      default:
        // Tagged union
        let taggedResult = `type ${name}${typeParams} struct {\n`;
        taggedResult += '\ttag int\n';

        for (let i = 0; i < union.types.length; i++) {
          const typeName = union.types[i].accept(this);
          taggedResult += `\tvalue${i} *${typeName}\n`;
        }

        taggedResult += '}\n\n';

        // Helper methods
        for (let i = 0; i < union.types.length; i++) {
          const typeName = union.types[i].accept(this);
          taggedResult += `func (u ${name}) IsType${i}() bool { return u.tag == ${i} }\n`;
          taggedResult += `func (u ${name}) AsType${i}() ${typeName} {\n`;
          taggedResult += `\tif u.value${i} != nil { return *u.value${i} }\n`;
          taggedResult += `\tvar zero ${typeName}\n`;
          taggedResult += `\treturn zero\n`;
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

    // 判斷是字串 enum 還是數字 enum
    const isStringEnum = node.members.some(m =>
      m.value instanceof ir.Literal && typeof (m.value as ir.Literal).value === 'string'
    );

    let result = '';

    if (isStringEnum) {
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
    for (const stmt of node.statements) {
      const stmtCode = stmt.accept(this);
      if (stmtCode) {
        result += `${this.indent()}${stmtCode}\n`;
      }
    }
    this.decreaseIndent();

    result += `${this.indent()}}`;

    return result;
  }

  visitExpressionStatement(node: ir.ExpressionStatement): string {
    // Skip reassignments to any/unknown typed variables as they don't make sense in Go
    if (node.expression instanceof ir.AssignmentExpression) {
      return '';
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
    const elements = node.elements
      .map(e => e ? e.accept(this) : 'nil')
      .join(', ');

    // 嘗試推斷型別
    const elementType = node.inferredType instanceof ir.ArrayType ?
      node.inferredType.elementType.accept(this) :
      'interface{}';

    return `[]${elementType}{${elements}}`;
  }

  visitObjectExpression(node: ir.ObjectExpression): string {
    const props = node.properties.map(p => this.visitProperty(p)).join(', ');

    // 物件字面量轉為 map
    return `map[string]interface{}{${props}}`;
  }

  visitProperty(node: ir.Property): string {
    const key = node.key instanceof ir.Identifier ?
      `"${node.key.name}"` :
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
        // Keep private field names lowercase, capitalize public fields
        if (this.privateFieldNames.has(propName)) {
          property = propName; // Keep lowercase for private fields
        } else {
          property = this.capitalize(propName); // Capitalize public fields
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
