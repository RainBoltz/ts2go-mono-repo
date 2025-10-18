/**
 * Type Mapping Strategies
 * 定義 TypeScript 型別到 Go 型別的對應策略
 */

import * as ir from '../ir/nodes';
import { CompilerOptions } from '../config/options';

export interface TypeMappingContext {
  options: CompilerOptions;
  currentScope?: string;
  inReturnType?: boolean;
  inParameterType?: boolean;
}

/**
 * Type Mapper
 * 負責將 TypeScript 型別映射到 Go 型別
 */
export class TypeMapper {
  constructor(private context: TypeMappingContext) {}

  /**
   * 映射型別節點到 Go 型別字串
   */
  mapType(type: ir.IRType): string {
    if (type instanceof ir.PrimitiveType) {
      return this.mapPrimitiveType(type);
    }
    if (type instanceof ir.ArrayType) {
      return this.mapArrayType(type);
    }
    if (type instanceof ir.TupleType) {
      return this.mapTupleType(type);
    }
    if (type instanceof ir.ObjectType) {
      return this.mapObjectType(type);
    }
    if (type instanceof ir.FunctionType) {
      return this.mapFunctionType(type);
    }
    if (type instanceof ir.UnionType) {
      return this.mapUnionType(type);
    }
    if (type instanceof ir.IntersectionType) {
      return this.mapIntersectionType(type);
    }
    if (type instanceof ir.TypeReference) {
      return this.mapTypeReference(type);
    }
    if (type instanceof ir.LiteralType) {
      return this.mapLiteralType(type);
    }

    return 'interface{}';
  }

  /**
   * 映射基本型別
   */
  private mapPrimitiveType(type: ir.PrimitiveType): string {
    switch (type.kind) {
      case 'number':
        return this.mapNumberType();
      case 'string':
        return 'string';
      case 'boolean':
        return 'bool';
      case 'void':
        return ''; // void 在函式返回型別中表示無返回值
      case 'any':
        return 'interface{}';
      case 'unknown':
        // unknown 比 any 更安全，但 Go 中都映射到 interface{}
        return 'interface{}';
      case 'never':
        // never 表示永不返回，Go 中無直接對應
        return '';
      default:
        return 'interface{}';
    }
  }

  /**
   * 映射 number 型別（根據策略）
   */
  private mapNumberType(): string {
    const strategy = this.context.options.numberStrategy || 'float64';

    switch (strategy) {
      case 'int':
        return 'int';
      case 'contextual':
        // 上下文相關型別推斷
        // TODO: 根據使用情境決定使用 int 或 float64
        return 'float64';
      case 'float64':
      default:
        return 'float64';
    }
  }

  /**
   * 映射陣列型別
   */
  private mapArrayType(type: ir.ArrayType): string {
    const elementType = this.mapType(type.elementType);
    return `[]${elementType}`;
  }

  /**
   * 映射元組型別
   */
  private mapTupleType(type: ir.TupleType): string {
    // 元組轉換為具名 struct
    const typeName = this.generateTupleName(type);
    return typeName;
  }

  /**
   * 產生元組型別名稱
   */
  private generateTupleName(type: ir.TupleType): string {
    const typeNames = type.elements.map(t => this.mapType(t));
    return `Tuple${type.elements.length}_${typeNames.join('_').replace(/\[\]/g, 'Array').replace(/\*/g, 'Ptr')}`;
  }

  /**
   * 映射物件型別
   */
  private mapObjectType(type: ir.ObjectType): string {
    // 物件字面量型別轉為匿名 struct
    // 或根據 index signature 轉為 map
    if (type.indexSignature) {
      const keyType = this.mapType(type.indexSignature.keyType);
      const valueType = this.mapType(type.indexSignature.valueType);
      return `map[${keyType}]${valueType}`;
    }

    // 返回 struct 的 placeholder
    // 實際 struct 定義會在宣告層級產生
    return 'struct{}';
  }

  /**
   * 映射函式型別
   */
  private mapFunctionType(type: ir.FunctionType): string {
    const params = type.parameters
      .map(p => this.mapType(p.type || new ir.PrimitiveType('any')))
      .join(', ');

    const returnType = this.mapType(type.returnType);

    if (type.isAsync) {
      // Async 函式返回 error
      if (returnType) {
        return `func(context.Context, ${params}) (${returnType}, error)`;
      }
      return `func(context.Context, ${params}) error`;
    }

    if (returnType) {
      return `func(${params}) ${returnType}`;
    }
    return `func(${params})`;
  }

  /**
   * 映射 Union 型別
   */
  private mapUnionType(type: ir.UnionType): string {
    const strategy = this.context.options.unionStrategy || 'tagged';

    switch (strategy) {
      case 'interface':
        // Interface-based union
        // 返回 interface{} placeholder，實際定義在宣告層級
        return 'interface{}';

      case 'any':
        // 簡單地映射為 any
        return 'interface{}';

      case 'tagged':
      default:
        // Tagged union
        // 返回 placeholder，實際 struct 在宣告層級產生
        return 'interface{}';
    }
  }

  /**
   * 映射 Intersection 型別
   */
  private mapIntersectionType(type: ir.IntersectionType): string {
    // Intersection 通過 struct embedding 實現
    // 返回 placeholder
    return 'interface{}';
  }

  /**
   * 映射型別引用
   */
  private mapTypeReference(type: ir.TypeReference): string {
    // 處理內建型別
    switch (type.name) {
      case 'Promise':
        // Promise<T> → T（async 函式自動處理 error）
        if (type.typeArguments && type.typeArguments.length > 0) {
          return this.mapType(type.typeArguments[0]);
        }
        return 'interface{}';

      case 'Array':
        if (type.typeArguments && type.typeArguments.length > 0) {
          const elementType = this.mapType(type.typeArguments[0]);
          return `[]${elementType}`;
        }
        return '[]interface{}';

      case 'Map':
        if (type.typeArguments && type.typeArguments.length >= 2) {
          const keyType = this.mapType(type.typeArguments[0]);
          const valueType = this.mapType(type.typeArguments[1]);
          return `map[${keyType}]${valueType}`;
        }
        return 'map[string]interface{}';

      case 'Set':
        if (type.typeArguments && type.typeArguments.length > 0) {
          const elementType = this.mapType(type.typeArguments[0]);
          return `map[${elementType}]bool`;
        }
        return 'map[interface{}]bool';

      case 'Record':
        if (type.typeArguments && type.typeArguments.length >= 2) {
          const keyType = this.mapType(type.typeArguments[0]);
          const valueType = this.mapType(type.typeArguments[1]);
          return `map[${keyType}]${valueType}`;
        }
        return 'map[string]interface{}';

      case 'Partial':
      case 'Required':
      case 'Readonly':
      case 'Pick':
      case 'Omit':
        // Utility types - 在編譯時處理，這裡返回 placeholder
        if (type.typeArguments && type.typeArguments.length > 0) {
          return this.mapType(type.typeArguments[0]);
        }
        return 'interface{}';

      default:
        // 使用者定義型別
        let typeName = type.name;

        // 處理泛型參數
        if (type.typeArguments && type.typeArguments.length > 0) {
          const typeArgs = type.typeArguments.map(t => this.mapType(t)).join(', ');
          return `${typeName}[${typeArgs}]`;
        }

        return typeName;
    }
  }

  /**
   * 映射字面量型別
   */
  private mapLiteralType(type: ir.LiteralType): string {
    // Literal types 映射為對應的基本型別
    if (typeof type.value === 'string') {
      return 'string';
    }
    if (typeof type.value === 'number') {
      return this.mapNumberType();
    }
    if (typeof type.value === 'boolean') {
      return 'bool';
    }
    return 'interface{}';
  }

  /**
   * 處理可選型別（nullable）
   */
  mapOptionalType(type: ir.IRType): string {
    const baseType = this.mapType(type);
    const strategy = this.context.options.nullabilityStrategy || 'pointer';

    switch (strategy) {
      case 'pointer':
        // 使用指標表示可選
        return `*${baseType}`;

      case 'sqlNull':
        // 使用 sql.Null* 系列
        if (baseType === 'string') return 'sql.NullString';
        if (baseType === 'int') return 'sql.NullInt64';
        if (baseType === 'float64') return 'sql.NullFloat64';
        if (baseType === 'bool') return 'sql.NullBool';
        // 其他型別仍使用指標
        return `*${baseType}`;

      case 'zero':
      default:
        // 使用零值表示未設定（不推薦，因為無法區分零值和未設定）
        return baseType;
    }
  }

  /**
   * 檢查型別是否需要指標接收者
   */
  needsPointerReceiver(type: ir.IRType): boolean {
    // 大型 struct 或需要修改的型別使用指標接收者
    if (type instanceof ir.ObjectType) {
      return type.properties.length > 2;
    }
    if (type instanceof ir.TypeReference) {
      return true; // 使用者定義型別預設使用指標
    }
    return false;
  }
}

/**
 * 特殊型別處理器
 */
export class SpecialTypeHandler {
  /**
   * 處理 Promise 型別
   */
  static handlePromise(type: ir.TypeReference, mapper: TypeMapper): string {
    if (type.typeArguments && type.typeArguments.length > 0) {
      return mapper.mapType(type.typeArguments[0]);
    }
    return 'interface{}';
  }

  /**
   * 處理 Date 型別
   */
  static handleDate(): string {
    return 'time.Time';
  }

  /**
   * 處理 RegExp 型別
   */
  static handleRegExp(): string {
    return '*regexp.Regexp';
  }

  /**
   * 處理 Error 型別
   */
  static handleError(): string {
    return 'error';
  }

  /**
   * 處理 Buffer/Uint8Array 型別
   */
  static handleBuffer(): string {
    return '[]byte';
  }
}

/**
 * 型別相容性檢查器
 */
export class TypeCompatibilityChecker {
  /**
   * 檢查兩個型別是否相容
   */
  static isCompatible(from: ir.IRType, to: ir.IRType): boolean {
    // 簡化實作：檢查基本型別相容性
    if (from instanceof ir.PrimitiveType && to instanceof ir.PrimitiveType) {
      if (from.kind === 'any' || to.kind === 'any') return true;
      if (from.kind === 'unknown' || to.kind === 'unknown') return true;
      return from.kind === to.kind;
    }

    // Array 型別
    if (from instanceof ir.ArrayType && to instanceof ir.ArrayType) {
      return this.isCompatible(from.elementType, to.elementType);
    }

    // TODO: 更複雜的型別相容性檢查
    return false;
  }

  /**
   * 檢查是否需要型別轉換
   */
  static needsConversion(from: ir.IRType, to: ir.IRType): boolean {
    if (this.isCompatible(from, to)) return false;

    // number 與 int/float 之間的轉換
    if (from instanceof ir.PrimitiveType && to instanceof ir.PrimitiveType) {
      if (from.kind === 'number' || to.kind === 'number') {
        return true;
      }
    }

    return false;
  }
}
