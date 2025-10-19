/**
 * TypeScript AST 到 IR 的轉換器
 */

import * as ts from 'typescript';
import * as ir from './nodes';
import { CompilerOptions } from '../config/options';
import { TypeScriptParser } from '../frontend/parser';

export class IRTransformer {
  private parser: TypeScriptParser;
  private currentModule?: ir.Module;
  private typeChecker?: ts.TypeChecker;

  constructor(
    private options: CompilerOptions,
    parser?: TypeScriptParser
  ) {
    this.parser = parser || new TypeScriptParser(options);
  }

  /**
   * 轉換 TypeScript AST 為 IR Module
   */
  async transform(sourceFile: ts.SourceFile): Promise<ir.Module> {
    this.typeChecker = this.parser.getTypeChecker();

    const module = new ir.Module(
      this.getModuleName(sourceFile),
      sourceFile.fileName,
      [],
      [],
      [],
      this.parser.getSourceLocation(sourceFile)
    );

    this.currentModule = module;

    // 處理 imports
    const imports = this.parser.getImports(sourceFile);
    for (const importDecl of imports) {
      const irImport = this.transformImportDeclaration(importDecl);
      if (irImport) {
        module.imports.push(irImport);
      }
    }

    // 處理頂層陳述式
    ts.forEachChild(sourceFile, node => {
      const stmt = this.transformStatement(node);
      if (stmt) {
        module.statements.push(stmt);
      }
    });

    // 處理 exports
    const exports = this.parser.getExports(sourceFile);
    for (const exportDecl of exports) {
      const irExport = this.transformExportDeclaration(exportDecl);
      if (irExport) {
        module.exports.push(irExport);
      }
    }

    return module;
  }

  /**
   * 轉換陳述式
   */
  private transformStatement(node: ts.Node): ir.Statement | null {
    switch (node.kind) {
      case ts.SyntaxKind.VariableStatement:
        return this.transformVariableStatement(node as ts.VariableStatement);
      case ts.SyntaxKind.FunctionDeclaration:
        return this.transformFunctionDeclaration(node as ts.FunctionDeclaration);
      case ts.SyntaxKind.ClassDeclaration:
        return this.transformClassDeclaration(node as ts.ClassDeclaration);
      case ts.SyntaxKind.InterfaceDeclaration:
        return this.transformInterfaceDeclaration(node as ts.InterfaceDeclaration);
      case ts.SyntaxKind.TypeAliasDeclaration:
        return this.transformTypeAliasDeclaration(node as ts.TypeAliasDeclaration);
      case ts.SyntaxKind.EnumDeclaration:
        return this.transformEnumDeclaration(node as ts.EnumDeclaration);
      case ts.SyntaxKind.ExpressionStatement:
        return this.transformExpressionStatement(node as ts.ExpressionStatement);
      case ts.SyntaxKind.IfStatement:
        return this.transformIfStatement(node as ts.IfStatement);
      case ts.SyntaxKind.WhileStatement:
        return this.transformWhileStatement(node as ts.WhileStatement);
      case ts.SyntaxKind.ForStatement:
        return this.transformForStatement(node as ts.ForStatement);
      case ts.SyntaxKind.ForOfStatement:
        return this.transformForOfStatement(node as ts.ForOfStatement);
      case ts.SyntaxKind.ReturnStatement:
        return this.transformReturnStatement(node as ts.ReturnStatement);
      case ts.SyntaxKind.ThrowStatement:
        return this.transformThrowStatement(node as ts.ThrowStatement);
      case ts.SyntaxKind.TryStatement:
        return this.transformTryStatement(node as ts.TryStatement);
      case ts.SyntaxKind.SwitchStatement:
        return this.transformSwitchStatement(node as ts.SwitchStatement);
      case ts.SyntaxKind.Block:
        return this.transformBlock(node as ts.Block);
      default:
        return null;
    }
  }

  /**
   * 轉換變數陳述式
   */
  private transformVariableStatement(node: ts.VariableStatement): ir.Statement {
    const declarations: ir.Statement[] = [];

    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const varDecl = new ir.VariableDeclaration(
          decl.name.text,
          this.transformTypeNode(decl.type),
          decl.initializer ? this.transformExpression(decl.initializer) : undefined,
          node.declarationList.flags & ts.NodeFlags.Const ? true : false,
          this.getModifiers(node),
          this.parser.getSourceLocation(decl)
        );
        declarations.push(varDecl);
      }
    }

    if (declarations.length === 1) {
      return declarations[0];
    }

    return new ir.BlockStatement(declarations);
  }

  /**
   * 轉換函式宣告
   */
  private transformFunctionDeclaration(node: ts.FunctionDeclaration): ir.FunctionDeclaration | null {
    if (!node.name) return null;

    const parameters = node.parameters.map(p => this.transformParameter(p));
    const returnType = node.type ? this.transformTypeNode(node.type) : undefined;
    const typeParameters = node.typeParameters?.map(tp => this.transformTypeParameter(tp));
    const body = node.body ? this.transformBlock(node.body) : undefined;

    return new ir.FunctionDeclaration(
      node.name.text,
      parameters,
      returnType,
      body,
      typeParameters,
      this.getModifiers(node),
      this.parser.getSourceLocation(node)
    );
  }

  /**
   * 轉換類別宣告
   */
  private transformClassDeclaration(node: ts.ClassDeclaration): ir.ClassDeclaration | null {
    if (!node.name) return null;

    const members: ir.ClassMember[] = [];

    for (const member of node.members) {
      const irMember = this.transformClassMember(member);
      if (irMember) {
        members.push(irMember);
      }
    }

    const heritage = node.heritageClauses?.find(
      h => h.token === ts.SyntaxKind.ExtendsKeyword
    );
    const extendsType = heritage?.types[0] ?
      this.transformTypeNode(heritage.types[0]) as ir.TypeReference :
      undefined;

    const implementsClause = node.heritageClauses?.find(
      h => h.token === ts.SyntaxKind.ImplementsKeyword
    );
    const implementsTypes = implementsClause?.types.map(
      t => this.transformTypeNode(t) as ir.TypeReference
    );

    return new ir.ClassDeclaration(
      node.name.text,
      members,
      extendsType,
      implementsTypes,
      node.typeParameters?.map(tp => this.transformTypeParameter(tp)),
      this.getModifiers(node),
      this.parser.getSourceLocation(node)
    );
  }

  /**
   * 轉換類別成員
   */
  private transformClassMember(node: ts.ClassElement): ir.ClassMember | null {
    if (ts.isPropertyDeclaration(node)) {
      const name = this.getPropertyName(node.name);
      if (!name) return null;

      return new ir.PropertyMember(
        name,
        node.type ? this.transformTypeNode(node.type) : undefined,
        node.initializer ? this.transformExpression(node.initializer) : undefined,
        this.getModifiers(node),
        this.parser.getSourceLocation(node)
      );
    }

    if (ts.isMethodDeclaration(node)) {
      const name = this.getPropertyName(node.name);
      if (!name) return null;

      return new ir.MethodMember(
        name,
        node.parameters.map(p => this.transformParameter(p)),
        node.type ? this.transformTypeNode(node.type) : undefined,
        node.body ? this.transformBlock(node.body) : undefined,
        node.typeParameters?.map(tp => this.transformTypeParameter(tp)),
        this.getModifiers(node),
        this.parser.getSourceLocation(node)
      );
    }

    if (ts.isConstructorDeclaration(node)) {
      return new ir.MethodMember(
        'constructor',
        node.parameters.map(p => this.transformParameter(p)),
        undefined,
        node.body ? this.transformBlock(node.body) : undefined,
        undefined,
        this.getModifiers(node),
        this.parser.getSourceLocation(node)
      );
    }

    if (ts.isGetAccessorDeclaration(node)) {
      const name = this.getPropertyName(node.name);
      if (!name) return null;

      return new ir.MethodMember(
        `get_${name}`,
        [],
        node.type ? this.transformTypeNode(node.type) : undefined,
        node.body ? this.transformBlock(node.body) : undefined,
        undefined,
        this.getModifiers(node),
        this.parser.getSourceLocation(node)
      );
    }

    if (ts.isSetAccessorDeclaration(node)) {
      const name = this.getPropertyName(node.name);
      if (!name) return null;

      return new ir.MethodMember(
        `set_${name}`,
        node.parameters.map(p => this.transformParameter(p)),
        undefined,
        node.body ? this.transformBlock(node.body) : undefined,
        undefined,
        this.getModifiers(node),
        this.parser.getSourceLocation(node)
      );
    }

    return null;
  }

  /**
   * 轉換介面宣告
   */
  private transformInterfaceDeclaration(node: ts.InterfaceDeclaration): ir.InterfaceDeclaration {
    const members: ir.PropertySignature[] = [];

    for (const member of node.members) {
      if (ts.isPropertySignature(member)) {
        const name = this.getPropertyName(member.name);
        if (name) {
          members.push(new ir.PropertySignature(
            name,
            member.type ? this.transformTypeNode(member.type) : new ir.PrimitiveType('any'),
            !!member.questionToken,
            !!member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword),
            this.parser.getSourceLocation(member)
          ));
        }
      } else if (ts.isMethodSignature(member)) {
        const name = this.getPropertyName(member.name);
        if (name) {
          const methodType = new ir.FunctionType(
            member.parameters.map(p => this.transformParameter(p)),
            member.type ? this.transformTypeNode(member.type) : new ir.PrimitiveType('void'),
            member.typeParameters?.map(tp => this.transformTypeParameter(tp)),
            false,
            this.parser.getSourceLocation(member)
          );
          members.push(new ir.PropertySignature(
            name,
            methodType,
            !!member.questionToken,
            false,
            this.parser.getSourceLocation(member)
          ));
        }
      } else if (ts.isIndexSignatureDeclaration(member)) {
        // Index signatures: [key: string]: Type
        const param = member.parameters[0];
        if (param && member.type) {
          const keyType = param.type ? this.transformTypeNode(param.type) : new ir.PrimitiveType('string');
          const valueType = this.transformTypeNode(member.type);
          // Store as a special property with name "[index]"
          members.push(new ir.PropertySignature(
            '[index]',
            new ir.FunctionType(
              [new ir.Parameter(
                param.name ? (param.name as ts.Identifier).text : 'key',
                keyType,
                false,
                undefined,
                false,
                this.parser.getSourceLocation(param)
              )],
              valueType,
              undefined,
              false,
              this.parser.getSourceLocation(member)
            ),
            false,
            false,
            this.parser.getSourceLocation(member)
          ));
        }
      }
    }

    const heritage = node.heritageClauses?.find(
      h => h.token === ts.SyntaxKind.ExtendsKeyword
    );
    const extendsTypes = heritage?.types.map(
      t => this.transformTypeNode(t) as ir.TypeReference
    );

    return new ir.InterfaceDeclaration(
      node.name.text,
      members,
      extendsTypes,
      node.typeParameters?.map(tp => this.transformTypeParameter(tp)),
      this.getModifiers(node),
      this.parser.getSourceLocation(node)
    );
  }

  /**
   * 轉換型別別名宣告
   */
  private transformTypeAliasDeclaration(node: ts.TypeAliasDeclaration): ir.TypeAliasDeclaration {
    return new ir.TypeAliasDeclaration(
      node.name.text,
      this.transformTypeNode(node.type),
      node.typeParameters?.map(tp => this.transformTypeParameter(tp)),
      this.getModifiers(node),
      this.parser.getSourceLocation(node)
    );
  }

  /**
   * 轉換列舉宣告
   */
  private transformEnumDeclaration(node: ts.EnumDeclaration): ir.EnumDeclaration {
    const members = node.members.map(member => {
      return new ir.EnumMember(
        member.name ? this.getPropertyName(member.name)! : '',
        member.initializer ? this.transformExpression(member.initializer) : undefined,
        this.parser.getSourceLocation(member)
      );
    });

    const isConst = !!node.modifiers?.some(
      m => m.kind === ts.SyntaxKind.ConstKeyword
    );

    return new ir.EnumDeclaration(
      node.name.text,
      members,
      isConst,
      this.getModifiers(node),
      this.parser.getSourceLocation(node)
    );
  }

  /**
   * 轉換型別節點
   */
  private transformTypeNode(node?: ts.TypeNode): ir.IRType {
    if (!node) {
      return new ir.PrimitiveType('any');
    }

    switch (node.kind) {
      case ts.SyntaxKind.NumberKeyword:
        return new ir.PrimitiveType('number', this.parser.getSourceLocation(node));
      case ts.SyntaxKind.StringKeyword:
        return new ir.PrimitiveType('string', this.parser.getSourceLocation(node));
      case ts.SyntaxKind.BooleanKeyword:
        return new ir.PrimitiveType('boolean', this.parser.getSourceLocation(node));
      case ts.SyntaxKind.VoidKeyword:
        return new ir.PrimitiveType('void', this.parser.getSourceLocation(node));
      case ts.SyntaxKind.AnyKeyword:
        return new ir.PrimitiveType('any', this.parser.getSourceLocation(node));
      case ts.SyntaxKind.UnknownKeyword:
        return new ir.PrimitiveType('unknown', this.parser.getSourceLocation(node));
      case ts.SyntaxKind.NeverKeyword:
        return new ir.PrimitiveType('never', this.parser.getSourceLocation(node));

      case ts.SyntaxKind.ArrayType:
        const arrayType = node as ts.ArrayTypeNode;
        return new ir.ArrayType(
          this.transformTypeNode(arrayType.elementType),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.TupleType:
        const tupleType = node as ts.TupleTypeNode;
        return new ir.TupleType(
          tupleType.elements.map(e => this.transformTypeNode(e)),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.UnionType:
        const unionType = node as ts.UnionTypeNode;
        return new ir.UnionType(
          unionType.types.map(t => this.transformTypeNode(t)),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.IntersectionType:
        const intersectionType = node as ts.IntersectionTypeNode;
        return new ir.IntersectionType(
          intersectionType.types.map(t => this.transformTypeNode(t)),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.TypeReference:
        const typeRef = node as ts.TypeReferenceNode;
        const typeName = this.getEntityName(typeRef.typeName);
        return new ir.TypeReference(
          typeName,
          typeRef.typeArguments?.map(t => this.transformTypeNode(t)),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.FunctionType:
        const funcType = node as ts.FunctionTypeNode;
        return new ir.FunctionType(
          funcType.parameters.map(p => this.transformParameter(p)),
          this.transformTypeNode(funcType.type),
          funcType.typeParameters?.map(tp => this.transformTypeParameter(tp)),
          false,
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.LiteralType:
        const literalType = node as ts.LiteralTypeNode;
        return this.transformLiteralType(literalType);

      case ts.SyntaxKind.TypeLiteral:
        const typeLiteral = node as ts.TypeLiteralNode;
        return this.transformTypeLiteral(typeLiteral);

      default:
        return new ir.PrimitiveType('any', this.parser.getSourceLocation(node));
    }
  }

  /**
   * 轉換字面量型別
   */
  private transformLiteralType(node: ts.LiteralTypeNode): ir.LiteralType {
    let value: any = undefined;

    if (ts.isStringLiteral(node.literal)) {
      value = node.literal.text;
    } else if (ts.isNumericLiteral(node.literal)) {
      value = Number(node.literal.text);
    } else if (node.literal.kind === ts.SyntaxKind.TrueKeyword) {
      value = true;
    } else if (node.literal.kind === ts.SyntaxKind.FalseKeyword) {
      value = false;
    } else if (node.literal.kind === ts.SyntaxKind.NullKeyword) {
      value = null;
    }

    return new ir.LiteralType(value, this.parser.getSourceLocation(node));
  }

  /**
   * 轉換型別字面量
   */
  private transformTypeLiteral(node: ts.TypeLiteralNode): ir.ObjectType {
    const properties: ir.PropertySignature[] = [];
    let indexSignature: ir.IndexSignature | undefined;

    for (const member of node.members) {
      if (ts.isPropertySignature(member)) {
        const name = this.getPropertyName(member.name);
        if (name) {
          properties.push(new ir.PropertySignature(
            name,
            member.type ? this.transformTypeNode(member.type) : new ir.PrimitiveType('any'),
            !!member.questionToken,
            !!member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword),
            this.parser.getSourceLocation(member)
          ));
        }
      } else if (ts.isIndexSignatureDeclaration(member)) {
        const param = member.parameters[0];
        if (param && member.type) {
          const keyType = param.type ? this.transformTypeNode(param.type) : new ir.PrimitiveType('string');
          const valueType = this.transformTypeNode(member.type);
          indexSignature = new ir.IndexSignature(
            keyType,
            valueType,
            this.parser.getSourceLocation(member)
          );
        }
      }
    }

    return new ir.ObjectType(
      properties,
      indexSignature,
      this.parser.getSourceLocation(node)
    );
  }

  /**
   * 轉換表達式
   */
  private transformExpression(node: ts.Expression): ir.Expression {
    switch (node.kind) {
      case ts.SyntaxKind.Identifier:
        return new ir.Identifier(
          (node as ts.Identifier).text,
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.NumericLiteral:
        const numLit = node as ts.NumericLiteral;
        return new ir.Literal(
          Number(numLit.text),
          numLit.text,
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.StringLiteral:
        const strLit = node as ts.StringLiteral;
        return new ir.Literal(
          strLit.text,
          `"${strLit.text}"`,
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.TrueKeyword:
        return new ir.Literal(true, 'true', this.parser.getSourceLocation(node));

      case ts.SyntaxKind.FalseKeyword:
        return new ir.Literal(false, 'false', this.parser.getSourceLocation(node));

      case ts.SyntaxKind.NullKeyword:
        return new ir.Literal(null, 'null', this.parser.getSourceLocation(node));

      case ts.SyntaxKind.UndefinedKeyword:
        return new ir.Literal(undefined, 'undefined', this.parser.getSourceLocation(node));

      case ts.SyntaxKind.ArrayLiteralExpression:
        const arrayLit = node as ts.ArrayLiteralExpression;
        return new ir.ArrayExpression(
          arrayLit.elements.map(e => this.transformExpression(e)),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.ObjectLiteralExpression:
        return this.transformObjectLiteral(node as ts.ObjectLiteralExpression);

      case ts.SyntaxKind.CallExpression:
        return this.transformCallExpression(node as ts.CallExpression);

      case ts.SyntaxKind.NewExpression:
        return this.transformNewExpression(node as ts.NewExpression);

      case ts.SyntaxKind.PropertyAccessExpression:
        return this.transformPropertyAccess(node as ts.PropertyAccessExpression);

      case ts.SyntaxKind.ElementAccessExpression:
        return this.transformElementAccess(node as ts.ElementAccessExpression);

      case ts.SyntaxKind.BinaryExpression:
        return this.transformBinaryExpression(node as ts.BinaryExpression);

      case ts.SyntaxKind.PrefixUnaryExpression:
      case ts.SyntaxKind.PostfixUnaryExpression:
        return this.transformUnaryExpression(node as ts.UnaryExpression);

      case ts.SyntaxKind.ConditionalExpression:
        return this.transformConditionalExpression(node as ts.ConditionalExpression);

      case ts.SyntaxKind.ArrowFunction:
        return this.transformArrowFunction(node as ts.ArrowFunction);

      case ts.SyntaxKind.FunctionExpression:
        return this.transformFunctionExpression(node as ts.FunctionExpression);

      case ts.SyntaxKind.AwaitExpression:
        const awaitExpr = node as ts.AwaitExpression;
        return new ir.AwaitExpression(
          this.transformExpression(awaitExpr.expression),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.SpreadElement:
        const spreadElement = node as ts.SpreadElement;
        return new ir.SpreadElement(
          this.transformExpression(spreadElement.expression),
          this.parser.getSourceLocation(node)
        );

      case ts.SyntaxKind.TemplateExpression:
        return this.transformTemplateExpression(node as ts.TemplateExpression);

      default:
        // 預設返回 identifier
        return new ir.Identifier('unknown', this.parser.getSourceLocation(node));
    }
  }

  // ... 其他輔助方法 ...

  private transformParameter(param: ts.ParameterDeclaration): ir.Parameter {
    const name = ts.isIdentifier(param.name) ? param.name.text : 'unknown';
    return new ir.Parameter(
      name,
      param.type ? this.transformTypeNode(param.type) : undefined,
      !!param.questionToken,
      param.initializer ? this.transformExpression(param.initializer) : undefined,
      !!param.dotDotDotToken,
      this.parser.getSourceLocation(param)
    );
  }

  private transformTypeParameter(tp: ts.TypeParameterDeclaration): ir.TypeParameter {
    return new ir.TypeParameter(
      tp.name.text,
      tp.constraint ? this.transformTypeNode(tp.constraint) : undefined,
      tp.default ? this.transformTypeNode(tp.default) : undefined,
      this.parser.getSourceLocation(tp)
    );
  }

  private getModifiers(node: ts.Node): ir.Modifier[] {
    const modifiers = this.parser.getModifiers(node);
    const result: ir.Modifier[] = [];

    for (const mod of modifiers) {
      result.push(new ir.Modifier(mod as any));
    }

    return result;
  }

  private getPropertyName(name?: ts.PropertyName): string | null {
    if (!name) return null;
    if (ts.isIdentifier(name)) return name.text;
    if (ts.isStringLiteral(name)) return name.text;
    if (ts.isNumericLiteral(name)) return name.text;
    return null;
  }

  private getEntityName(name: ts.EntityName): string {
    if (ts.isIdentifier(name)) {
      return name.text;
    }
    // For qualified names like A.B
    return this.getEntityName(name.right);
  }

  private getModuleName(sourceFile: ts.SourceFile): string {
    const path = sourceFile.fileName;
    const parts = path.split('/');
    const fileName = parts[parts.length - 1];
    return fileName; // Keep the .ts extension
  }

  private transformBlock(node: ts.Block): ir.BlockStatement {
    const statements: ir.Statement[] = [];
    for (const stmt of node.statements) {
      const irStmt = this.transformStatement(stmt);
      if (irStmt) {
        statements.push(irStmt);
      }
    }
    return new ir.BlockStatement(statements, this.parser.getSourceLocation(node));
  }

  private transformImportDeclaration(node: ts.ImportDeclaration): ir.ImportDeclaration {
    const specifiers: ir.ImportSpecifier[] = [];
    const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;

    if (node.importClause) {
      // Default import: import Foo from 'module'
      if (node.importClause.name) {
        specifiers.push(new ir.ImportSpecifier(
          'default',
          node.importClause.name.text,
          true,
          false,
          this.parser.getSourceLocation(node.importClause.name)
        ));
      }

      // Named imports: import { A, B } from 'module'
      if (node.importClause.namedBindings) {
        const bindings = node.importClause.namedBindings;

        if (ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            specifiers.push(new ir.ImportSpecifier(
              element.propertyName?.text || element.name.text,
              element.name.text,
              false,
              false,
              this.parser.getSourceLocation(element)
            ));
          }
        } else if (ts.isNamespaceImport(bindings)) {
          // import * as Foo from 'module'
          specifiers.push(new ir.ImportSpecifier(
            '*',
            bindings.name.text,
            false,
            true,
            this.parser.getSourceLocation(bindings)
          ));
        }
      }
    }

    return new ir.ImportDeclaration(
      specifiers,
      moduleSpecifier,
      this.parser.getSourceLocation(node)
    );
  }

  private transformExportDeclaration(node: ts.ExportDeclaration): ir.ExportDeclaration {
    const specifiers: ir.ExportSpecifier[] = [];
    const source = node.moduleSpecifier ? (node.moduleSpecifier as ts.StringLiteral).text : undefined;

    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        specifiers.push(new ir.ExportSpecifier(
          element.propertyName?.text || element.name.text,
          element.name.text,
          this.parser.getSourceLocation(element)
        ));
      }
    }

    return new ir.ExportDeclaration(
      undefined,
      specifiers,
      source,
      false,
      this.parser.getSourceLocation(node)
    );
  }

  private transformExpressionStatement(node: ts.ExpressionStatement): ir.ExpressionStatement {
    return new ir.ExpressionStatement(
      this.transformExpression(node.expression),
      this.parser.getSourceLocation(node)
    );
  }

  private transformIfStatement(node: ts.IfStatement): ir.IfStatement {
    const thenStmt = this.transformStatement(node.thenStatement);
    const elseStmt = node.elseStatement ? this.transformStatement(node.elseStatement) : undefined;

    return new ir.IfStatement(
      this.transformExpression(node.expression),
      thenStmt || new ir.BlockStatement([]),
      elseStmt || undefined,
      this.parser.getSourceLocation(node)
    );
  }

  private transformWhileStatement(node: ts.WhileStatement): ir.WhileStatement {
    return new ir.WhileStatement(
      this.transformExpression(node.expression),
      this.transformStatement(node.statement)!,
      this.parser.getSourceLocation(node)
    );
  }

  private transformForStatement(node: ts.ForStatement): ir.ForStatement {
    let init: ir.VariableDeclaration | ir.Expression | undefined;

    if (node.initializer) {
      if (ts.isVariableDeclarationList(node.initializer)) {
        // for (let i = 0; ...)
        const decl = node.initializer.declarations[0];
        if (ts.isIdentifier(decl.name)) {
          const isConst = !!(node.initializer.flags & ts.NodeFlags.Const);
          init = new ir.VariableDeclaration(
            decl.name.text,
            decl.type ? this.transformTypeNode(decl.type) : undefined,
            decl.initializer ? this.transformExpression(decl.initializer) : undefined,
            isConst,
            [],
            this.parser.getSourceLocation(decl)
          );
        }
      } else {
        // for (i = 0; ...)
        init = this.transformExpression(node.initializer);
      }
    }

    return new ir.ForStatement(
      this.transformStatement(node.statement)!,
      init,
      node.condition ? this.transformExpression(node.condition) : undefined,
      node.incrementor ? this.transformExpression(node.incrementor) : undefined,
      this.parser.getSourceLocation(node)
    );
  }

  private transformForOfStatement(node: ts.ForOfStatement): ir.ForOfStatement {
    let varDecl: ir.VariableDeclaration;

    if (ts.isVariableDeclarationList(node.initializer)) {
      const decl = node.initializer.declarations[0];
      if (ts.isIdentifier(decl.name)) {
        const isConst = !!(node.initializer.flags & ts.NodeFlags.Const);
        varDecl = new ir.VariableDeclaration(
          decl.name.text,
          decl.type ? this.transformTypeNode(decl.type) : undefined,
          undefined,
          isConst,
          [],
          this.parser.getSourceLocation(decl)
        );
      } else {
        varDecl = new ir.VariableDeclaration('item', undefined, undefined, false, []);
      }
    } else {
      varDecl = new ir.VariableDeclaration('item', undefined, undefined, false, []);
    }

    return new ir.ForOfStatement(
      varDecl,
      this.transformExpression(node.expression),
      this.transformStatement(node.statement)!,
      this.parser.getSourceLocation(node)
    );
  }

  private transformReturnStatement(node: ts.ReturnStatement): ir.ReturnStatement {
    return new ir.ReturnStatement(
      node.expression ? this.transformExpression(node.expression) : undefined,
      this.parser.getSourceLocation(node)
    );
  }

  private transformThrowStatement(node: ts.ThrowStatement): ir.ThrowStatement {
    return new ir.ThrowStatement(
      this.transformExpression(node.expression!),
      this.parser.getSourceLocation(node)
    );
  }

  private transformTryStatement(node: ts.TryStatement): ir.TryStatement {
    return new ir.TryStatement(
      this.transformBlock(node.tryBlock),
      node.catchClause ? this.transformCatchClause(node.catchClause) : undefined,
      node.finallyBlock ? this.transformBlock(node.finallyBlock) : undefined,
      this.parser.getSourceLocation(node)
    );
  }

  private transformCatchClause(node: ts.CatchClause): ir.CatchClause {
    let param: ir.Parameter | undefined;

    if (node.variableDeclaration) {
      const name = ts.isIdentifier(node.variableDeclaration.name)
        ? node.variableDeclaration.name.text
        : 'error';
      param = new ir.Parameter(
        name,
        node.variableDeclaration.type ? this.transformTypeNode(node.variableDeclaration.type) : undefined,
        false,
        undefined,
        false,
        this.parser.getSourceLocation(node.variableDeclaration)
      );
    }

    return new ir.CatchClause(
      this.transformBlock(node.block),
      param,
      this.parser.getSourceLocation(node)
    );
  }

  private transformSwitchStatement(node: ts.SwitchStatement): ir.SwitchStatement {
    const cases: ir.SwitchCase[] = [];

    for (const clause of node.caseBlock.clauses) {
      const test = ts.isCaseClause(clause)
        ? this.transformExpression(clause.expression)
        : undefined;

      const consequent: ir.Statement[] = [];
      for (const stmt of clause.statements) {
        const irStmt = this.transformStatement(stmt);
        if (irStmt) {
          consequent.push(irStmt);
        }
      }

      cases.push(new ir.SwitchCase(
        consequent,
        test,
        this.parser.getSourceLocation(clause)
      ));
    }

    return new ir.SwitchStatement(
      this.transformExpression(node.expression),
      cases,
      this.parser.getSourceLocation(node)
    );
  }

  private transformObjectLiteral(node: ts.ObjectLiteralExpression): ir.ObjectExpression {
    const properties: ir.Property[] = [];

    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const keyName = this.getPropertyName(prop.name);
        if (keyName) {
          const keyExpr = ts.isComputedPropertyName(prop.name)
            ? this.transformExpression(prop.name.expression)
            : new ir.Identifier(keyName, this.parser.getSourceLocation(prop.name));

          properties.push(new ir.Property(
            keyExpr,
            this.transformExpression(prop.initializer),
            false,
            ts.isComputedPropertyName(prop.name),
            this.parser.getSourceLocation(prop)
          ));
        }
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        properties.push(new ir.Property(
          new ir.Identifier(prop.name.text, this.parser.getSourceLocation(prop.name)),
          new ir.Identifier(prop.name.text, this.parser.getSourceLocation(prop.name)),
          true,
          false,
          this.parser.getSourceLocation(prop)
        ));
      } else if (ts.isSpreadAssignment(prop)) {
        properties.push(new ir.Property(
          new ir.Literal('...', '...', this.parser.getSourceLocation(prop)),
          this.transformExpression(prop.expression),
          false,
          false,
          this.parser.getSourceLocation(prop)
        ));
      }
    }

    return new ir.ObjectExpression(properties, this.parser.getSourceLocation(node));
  }

  private transformCallExpression(node: ts.CallExpression): ir.CallExpression {
    const typeArguments = node.typeArguments?.map(t => this.transformTypeNode(t));

    return new ir.CallExpression(
      this.transformExpression(node.expression),
      node.arguments.map(arg => this.transformExpression(arg)),
      typeArguments,
      this.parser.getSourceLocation(node)
    );
  }

  private transformNewExpression(node: ts.NewExpression): ir.NewExpression {
    const typeArguments = node.typeArguments?.map(t => this.transformTypeNode(t));

    return new ir.NewExpression(
      this.transformExpression(node.expression),
      node.arguments?.map(arg => this.transformExpression(arg)) || [],
      typeArguments,
      this.parser.getSourceLocation(node)
    );
  }

  private transformPropertyAccess(node: ts.PropertyAccessExpression): ir.MemberExpression {
    return new ir.MemberExpression(
      this.transformExpression(node.expression),
      new ir.Identifier(node.name.text),
      false,
      !!node.questionDotToken,
      this.parser.getSourceLocation(node)
    );
  }

  private transformElementAccess(node: ts.ElementAccessExpression): ir.MemberExpression {
    return new ir.MemberExpression(
      this.transformExpression(node.expression),
      this.transformExpression(node.argumentExpression!),
      true,
      !!node.questionDotToken,
      this.parser.getSourceLocation(node)
    );
  }

  private transformBinaryExpression(node: ts.BinaryExpression): ir.Expression {
    const op = this.getBinaryOperator(node.operatorToken.kind);
    if (this.isAssignmentOperator(op)) {
      return new ir.AssignmentExpression(
        op as ir.AssignmentOperator,
        this.transformExpression(node.left as ts.Expression),
        this.transformExpression(node.right),
        this.parser.getSourceLocation(node)
      );
    }
    return new ir.BinaryExpression(
      op as ir.BinaryOperator,
      this.transformExpression(node.left as ts.Expression),
      this.transformExpression(node.right),
      this.parser.getSourceLocation(node)
    );
  }

  private transformUnaryExpression(node: ts.UnaryExpression): ir.UnaryExpression {
    const op = this.getUnaryOperator(node);
    const operand = ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) ?
      (node as any).operand :
      (node as ts.PrefixUnaryExpression).operand;
    return new ir.UnaryExpression(
      op,
      this.transformExpression(operand),
      ts.isPrefixUnaryExpression(node),
      this.parser.getSourceLocation(node)
    );
  }

  private transformConditionalExpression(node: ts.ConditionalExpression): ir.ConditionalExpression {
    return new ir.ConditionalExpression(
      this.transformExpression(node.condition),
      this.transformExpression(node.whenTrue),
      this.transformExpression(node.whenFalse),
      this.parser.getSourceLocation(node)
    );
  }

  private transformArrowFunction(node: ts.ArrowFunction): ir.ArrowFunctionExpression {
    const body = ts.isBlock(node.body)
      ? this.transformBlock(node.body)
      : this.transformExpression(node.body);

    return new ir.ArrowFunctionExpression(
      node.parameters.map(p => this.transformParameter(p)),
      body,
      node.type ? this.transformTypeNode(node.type) : undefined,
      node.typeParameters?.map(tp => this.transformTypeParameter(tp)),
      !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
      this.parser.getSourceLocation(node)
    );
  }

  private transformFunctionExpression(node: ts.FunctionExpression): ir.FunctionExpression {
    return new ir.FunctionExpression(
      node.parameters.map(p => this.transformParameter(p)),
      node.body ? this.transformBlock(node.body) : new ir.BlockStatement([]),
      node.type ? this.transformTypeNode(node.type) : undefined,
      node.typeParameters?.map(tp => this.transformTypeParameter(tp)),
      !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword),
      node.name?.text,
      this.parser.getSourceLocation(node)
    );
  }

  private transformTemplateExpression(node: ts.TemplateExpression): ir.TemplateLiteral {
    const quasis: string[] = [node.head.text];
    const expressions: ir.Expression[] = [];

    for (const span of node.templateSpans) {
      expressions.push(this.transformExpression(span.expression));
      quasis.push(span.literal.text);
    }

    return new ir.TemplateLiteral(
      quasis,
      expressions,
      this.parser.getSourceLocation(node)
    );
  }

  private getBinaryOperator(kind: ts.SyntaxKind): string {
    switch (kind) {
      // Arithmetic
      case ts.SyntaxKind.PlusToken: return '+';
      case ts.SyntaxKind.MinusToken: return '-';
      case ts.SyntaxKind.AsteriskToken: return '*';
      case ts.SyntaxKind.SlashToken: return '/';
      case ts.SyntaxKind.PercentToken: return '%';
      case ts.SyntaxKind.AsteriskAsteriskToken: return '**';

      // Bitwise
      case ts.SyntaxKind.AmpersandToken: return '&';
      case ts.SyntaxKind.BarToken: return '|';
      case ts.SyntaxKind.CaretToken: return '^';
      case ts.SyntaxKind.LessThanLessThanToken: return '<<';
      case ts.SyntaxKind.GreaterThanGreaterThanToken: return '>>';
      case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return '>>>';

      // Comparison
      case ts.SyntaxKind.EqualsEqualsToken: return '==';
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return '===';
      case ts.SyntaxKind.ExclamationEqualsToken: return '!=';
      case ts.SyntaxKind.ExclamationEqualsEqualsToken: return '!==';
      case ts.SyntaxKind.LessThanToken: return '<';
      case ts.SyntaxKind.LessThanEqualsToken: return '<=';
      case ts.SyntaxKind.GreaterThanToken: return '>';
      case ts.SyntaxKind.GreaterThanEqualsToken: return '>=';

      // Logical
      case ts.SyntaxKind.AmpersandAmpersandToken: return '&&';
      case ts.SyntaxKind.BarBarToken: return '||';
      case ts.SyntaxKind.QuestionQuestionToken: return '??';

      // Assignment
      case ts.SyntaxKind.EqualsToken: return '=';
      case ts.SyntaxKind.PlusEqualsToken: return '+=';
      case ts.SyntaxKind.MinusEqualsToken: return '-=';
      case ts.SyntaxKind.AsteriskEqualsToken: return '*=';
      case ts.SyntaxKind.SlashEqualsToken: return '/=';
      case ts.SyntaxKind.PercentEqualsToken: return '%=';
      case ts.SyntaxKind.AmpersandEqualsToken: return '&=';
      case ts.SyntaxKind.BarEqualsToken: return '|=';
      case ts.SyntaxKind.CaretEqualsToken: return '^=';
      case ts.SyntaxKind.LessThanLessThanEqualsToken: return '<<=';
      case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken: return '>>=';
      case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken: return '>>>=';
      case ts.SyntaxKind.AsteriskAsteriskEqualsToken: return '**=';

      // Special
      case ts.SyntaxKind.InKeyword: return 'in';
      case ts.SyntaxKind.InstanceOfKeyword: return 'instanceof';
      case ts.SyntaxKind.CommaToken: return ',';

      default: return '=';
    }
  }

  private getUnaryOperator(node: ts.UnaryExpression): ir.UnaryOperator {
    if (ts.isPrefixUnaryExpression(node)) {
      switch (node.operator) {
        case ts.SyntaxKind.PlusToken: return '+';
        case ts.SyntaxKind.MinusToken: return '-';
        case ts.SyntaxKind.ExclamationToken: return '!';
        case ts.SyntaxKind.TildeToken: return '~';
        case ts.SyntaxKind.PlusPlusToken: return '++';
        case ts.SyntaxKind.MinusMinusToken: return '--';
        default: return '!';
      }
    } else if (ts.isPostfixUnaryExpression(node)) {
      switch (node.operator) {
        case ts.SyntaxKind.PlusPlusToken: return '++';
        case ts.SyntaxKind.MinusMinusToken: return '--';
        default: return '++';
      }
    }
    return '!';
  }

  private isAssignmentOperator(op: string): boolean {
    return ['=', '+=', '-=', '*=', '/=', '%='].includes(op);
  }
}