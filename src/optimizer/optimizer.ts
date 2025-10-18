/**
 * IR Optimizer
 * 對 IR 進行各種優化處理
 */

import * as ir from '../ir/nodes';
import { CompilerOptions } from '../config/options';

export interface OptimizationPass {
  name: string;
  run(module: ir.Module, options: CompilerOptions): ir.Module;
}

export class IROptimizer {
  private passes: OptimizationPass[] = [];

  constructor(private options: CompilerOptions) {
    this.initializePasses();
  }

  /**
   * 初始化優化 passes
   */
  private initializePasses(): void {
    const level: number = this.options.optimizationLevel !== undefined ? this.options.optimizationLevel : 1;

    // Level 0: 不優化
    if (level === 0) return;

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

  /**
   * 執行所有優化 passes
   */
  optimize(module: ir.Module): ir.Module {
    let optimized = module;

    for (const pass of this.passes) {
      if (this.options.verbose) {
        console.log(`Running optimization pass: ${pass.name}`);
      }
      optimized = pass.run(optimized, this.options);
    }

    return optimized;
  }

  /**
   * 添加自訂優化 pass
   */
  addPass(pass: OptimizationPass): void {
    this.passes.push(pass);
  }
}

/**
 * 死碼消除 Pass
 * 移除未使用的變數、函式、型別
 */
export class DeadCodeEliminationPass implements OptimizationPass {
  name = 'dead-code-elimination';

  run(module: ir.Module, options: CompilerOptions): ir.Module {
    const usedSymbols = this.collectUsedSymbols(module);
    const filteredStatements = module.statements.filter(stmt => {
      if (stmt instanceof ir.Declaration) {
        return usedSymbols.has(stmt.name) || this.isExported(stmt);
      }
      return true;
    });

    return new ir.Module(
      module.name,
      module.path,
      filteredStatements,
      module.imports,
      module.exports,
      module.location
    );
  }

  /**
   * 收集所有被使用的符號
   */
  private collectUsedSymbols(module: ir.Module): Set<string> {
    const used = new Set<string>();
    const visitor = new SymbolCollector(used);

    for (const stmt of module.statements) {
      stmt.accept(visitor);
    }

    return used;
  }

  /**
   * 檢查是否被導出
   */
  private isExported(decl: ir.Declaration): boolean {
    return decl.modifiers.some(m => m.kind === 'export');
  }
}

/**
 * 符號收集器
 */
class SymbolCollector implements ir.IRVisitor<void> {
  constructor(private used: Set<string>) {}

  visitIdentifier(node: ir.Identifier): void {
    this.used.add(node.name);
  }

  visitTypeReference(node: ir.TypeReference): void {
    this.used.add(node.name);
    if (node.typeArguments) {
      node.typeArguments.forEach(arg => arg.accept(this));
    }
  }

  // 實作其他 visitor 方法...
  // (為了簡潔，省略了其他方法的完整實作)

  visitPrimitiveType(): void {}
  visitArrayType(node: ir.ArrayType): void {
    node.elementType.accept(this);
  }
  visitTupleType(node: ir.TupleType): void {
    node.elements.forEach(e => e.accept(this));
  }
  visitObjectType(node: ir.ObjectType): void {
    node.properties.forEach(p => p.accept(this));
  }
  visitFunctionType(node: ir.FunctionType): void {
    node.parameters.forEach(p => p.accept(this));
    node.returnType.accept(this);
  }
  visitUnionType(node: ir.UnionType): void {
    node.types.forEach(t => t.accept(this));
  }
  visitIntersectionType(node: ir.IntersectionType): void {
    node.types.forEach(t => t.accept(this));
  }
  visitLiteralType(): void {}
  visitPropertySignature(node: ir.PropertySignature): void {
    node.type.accept(this);
  }
  visitIndexSignature(node: ir.IndexSignature): void {
    node.keyType.accept(this);
    node.valueType.accept(this);
  }
  visitVariableDeclaration(node: ir.VariableDeclaration): void {
    if (node.type) node.type.accept(this);
    if (node.initializer) node.initializer.accept(this);
  }
  visitFunctionDeclaration(node: ir.FunctionDeclaration): void {
    node.parameters.forEach(p => p.accept(this));
    if (node.returnType) node.returnType.accept(this);
    if (node.body) node.body.accept(this);
  }
  visitClassDeclaration(node: ir.ClassDeclaration): void {
    node.members.forEach(m => m.accept(this));
  }
  visitInterfaceDeclaration(node: ir.InterfaceDeclaration): void {
    node.members.forEach(m => m.accept(this));
  }
  visitTypeAliasDeclaration(node: ir.TypeAliasDeclaration): void {
    node.type.accept(this);
  }
  visitEnumDeclaration(node: ir.EnumDeclaration): void {
    node.members.forEach(m => m.accept(this));
  }
  visitParameter(node: ir.Parameter): void {
    if (node.type) node.type.accept(this);
  }
  visitTypeParameter(): void {}
  visitPropertyMember(node: ir.PropertyMember): void {
    if (node.type) node.type.accept(this);
  }
  visitMethodMember(node: ir.MethodMember): void {
    node.parameters.forEach(p => p.accept(this));
    if (node.body) node.body.accept(this);
  }
  visitEnumMember(): void {}
  visitBlockStatement(node: ir.BlockStatement): void {
    node.statements.forEach(s => s.accept(this));
  }
  visitExpressionStatement(node: ir.ExpressionStatement): void {
    node.expression.accept(this);
  }
  visitReturnStatement(node: ir.ReturnStatement): void {
    if (node.argument) node.argument.accept(this);
  }
  visitIfStatement(node: ir.IfStatement): void {
    node.test.accept(this);
    node.consequent.accept(this);
    if (node.alternate) node.alternate.accept(this);
  }
  visitWhileStatement(node: ir.WhileStatement): void {
    node.test.accept(this);
    node.body.accept(this);
  }
  visitForStatement(node: ir.ForStatement): void {
    if (node.init) {
      if (node.init instanceof ir.Expression) {
        node.init.accept(this);
      } else {
        node.init.accept(this);
      }
    }
    if (node.test) node.test.accept(this);
    if (node.update) node.update.accept(this);
    node.body.accept(this);
  }
  visitForOfStatement(node: ir.ForOfStatement): void {
    node.left.accept(this);
    node.right.accept(this);
    node.body.accept(this);
  }
  visitTryStatement(node: ir.TryStatement): void {
    node.block.accept(this);
    if (node.handler) node.handler.accept(this);
    if (node.finalizer) node.finalizer.accept(this);
  }
  visitCatchClause(node: ir.CatchClause): void {
    node.body.accept(this);
  }
  visitThrowStatement(node: ir.ThrowStatement): void {
    node.argument.accept(this);
  }
  visitSwitchStatement(node: ir.SwitchStatement): void {
    node.discriminant.accept(this);
    node.cases.forEach(c => c.accept(this));
  }
  visitSwitchCase(node: ir.SwitchCase): void {
    if (node.test) node.test.accept(this);
    node.consequent.forEach(s => s.accept(this));
  }
  visitLiteral(): void {}
  visitArrayExpression(node: ir.ArrayExpression): void {
    node.elements.forEach(e => e && e.accept(this));
  }
  visitObjectExpression(node: ir.ObjectExpression): void {
    node.properties.forEach(p => p.accept(this));
  }
  visitProperty(node: ir.Property): void {
    if (node.key instanceof ir.Expression) {
      node.key.accept(this);
    }
    node.value.accept(this);
  }
  visitFunctionExpression(node: ir.FunctionExpression): void {
    node.parameters.forEach(p => p.accept(this));
    node.body.accept(this);
  }
  visitArrowFunctionExpression(node: ir.ArrowFunctionExpression): void {
    node.parameters.forEach(p => p.accept(this));
    if (node.body instanceof ir.Expression) {
      node.body.accept(this);
    } else {
      node.body.accept(this);
    }
  }
  visitCallExpression(node: ir.CallExpression): void {
    node.callee.accept(this);
    node.args.forEach(arg => arg.accept(this));
  }
  visitMemberExpression(node: ir.MemberExpression): void {
    node.object.accept(this);
    node.property.accept(this);
  }
  visitNewExpression(node: ir.NewExpression): void {
    node.callee.accept(this);
    node.args.forEach(arg => arg.accept(this));
  }
  visitBinaryExpression(node: ir.BinaryExpression): void {
    node.left.accept(this);
    node.right.accept(this);
  }
  visitUnaryExpression(node: ir.UnaryExpression): void {
    node.argument.accept(this);
  }
  visitAssignmentExpression(node: ir.AssignmentExpression): void {
    node.left.accept(this);
    node.right.accept(this);
  }
  visitConditionalExpression(node: ir.ConditionalExpression): void {
    node.test.accept(this);
    node.consequent.accept(this);
    node.alternate.accept(this);
  }
  visitAwaitExpression(node: ir.AwaitExpression): void {
    node.argument.accept(this);
  }
  visitSpreadElement(node: ir.SpreadElement): void {
    node.argument.accept(this);
  }
  visitTemplateLiteral(node: ir.TemplateLiteral): void {
    node.expressions.forEach(e => e.accept(this));
  }
  visitModule(node: ir.Module): void {
    node.statements.forEach(s => s.accept(this));
  }
  visitImportDeclaration(): void {}
  visitImportSpecifier(): void {}
  visitExportDeclaration(node: ir.ExportDeclaration): void {
    if (node.declaration) node.declaration.accept(this);
  }
  visitExportSpecifier(): void {}
}

/**
 * 常數折疊 Pass
 * 在編譯時計算常數表達式
 */
export class ConstantFoldingPass implements OptimizationPass {
  name = 'constant-folding';

  run(module: ir.Module, options: CompilerOptions): ir.Module {
    // TODO: 實作常數折疊
    // 例如: 2 + 3 → 5, "hello" + " " + "world" → "hello world"
    return module;
  }
}

/**
 * 型別簡化 Pass
 * 簡化複雜的型別表達式
 */
export class TypeSimplificationPass implements OptimizationPass {
  name = 'type-simplification';

  run(module: ir.Module, options: CompilerOptions): ir.Module {
    // TODO: 實作型別簡化
    // 例如: A | A → A, A & never → never
    return module;
  }
}

/**
 * 控制流正規化 Pass
 * 將複雜的控制流轉換為標準形式
 */
export class ControlFlowNormalizationPass implements OptimizationPass {
  name = 'control-flow-normalization';

  run(module: ir.Module, options: CompilerOptions): ir.Module {
    // TODO: 實作控制流正規化
    // 例如: 展平嵌套的 if, 消除無法到達的程式碼
    return module;
  }
}

/**
 * 內聯 Pass
 * 內聯小型函式
 */
export class InliningPass implements OptimizationPass {
  name = 'inlining';

  run(module: ir.Module, options: CompilerOptions): ir.Module {
    if (!options.inlineSmallFunctions) {
      return module;
    }

    // TODO: 實作函式內聯
    // 例如: 將小型函式直接內聯到呼叫處
    return module;
  }
}
