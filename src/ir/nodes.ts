/**
 * IR (Intermediate Representation) Node Definitions
 * 這是整個轉譯器的核心資料結構，用於表示 TypeScript 程式的語義
 */

import { SourceLocation } from './location';

// ============= 基礎節點 =============
export abstract class IRNode {
  constructor(
    public location?: SourceLocation,
    public metadata: Map<string, any> = new Map()
  ) {}

  abstract accept<T>(visitor: IRVisitor<T>): T;
}

// ============= 型別系統 =============
export abstract class IRType extends IRNode {}

export class PrimitiveType extends IRType {
  constructor(
    public kind: 'number' | 'string' | 'boolean' | 'void' | 'any' | 'unknown' | 'never',
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitPrimitiveType(this);
  }
}

export class ArrayType extends IRType {
  constructor(
    public elementType: IRType,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitArrayType(this);
  }
}

export class TupleType extends IRType {
  constructor(
    public elements: IRType[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitTupleType(this);
  }
}

export class ObjectType extends IRType {
  constructor(
    public properties: PropertySignature[],
    public indexSignature?: IndexSignature,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitObjectType(this);
  }
}

export class PropertySignature extends IRNode {
  constructor(
    public name: string,
    public type: IRType,
    public optional: boolean = false,
    public readonly: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitPropertySignature(this);
  }
}

export class IndexSignature extends IRNode {
  constructor(
    public keyType: IRType,
    public valueType: IRType,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitIndexSignature(this);
  }
}

export class FunctionType extends IRType {
  constructor(
    public parameters: Parameter[],
    public returnType: IRType,
    public typeParameters?: TypeParameter[],
    public isAsync: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitFunctionType(this);
  }
}

export class UnionType extends IRType {
  constructor(
    public types: IRType[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitUnionType(this);
  }
}

export class IntersectionType extends IRType {
  constructor(
    public types: IRType[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitIntersectionType(this);
  }
}

export class TypeReference extends IRType {
  constructor(
    public name: string,
    public typeArguments?: IRType[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitTypeReference(this);
  }
}

export class LiteralType extends IRType {
  constructor(
    public value: string | number | boolean | null | undefined,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitLiteralType(this);
  }
}

// ============= 宣告 =============
export abstract class Declaration extends IRNode {
  constructor(
    public name: string,
    public modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(location);
  }
}

export class Modifier {
  constructor(
    public kind: 'public' | 'private' | 'protected' | 'static' | 'readonly' | 'async' | 'export' | 'default'
  ) {}
}

export class VariableDeclaration extends Declaration {
  constructor(
    name: string,
    public type?: IRType,
    public initializer?: Expression,
    public isConst: boolean = false,
    modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(name, modifiers, location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitVariableDeclaration(this);
  }
}

export class FunctionDeclaration extends Declaration {
  constructor(
    name: string,
    public parameters: Parameter[],
    public returnType?: IRType,
    public body?: BlockStatement,
    public typeParameters?: TypeParameter[],
    modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(name, modifiers, location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitFunctionDeclaration(this);
  }
}

export class Parameter extends IRNode {
  constructor(
    public name: string,
    public type?: IRType,
    public optional: boolean = false,
    public defaultValue?: Expression,
    public rest: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitParameter(this);
  }
}

export class TypeParameter extends IRNode {
  constructor(
    public name: string,
    public constraint?: IRType,
    public defaultType?: IRType,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitTypeParameter(this);
  }
}

export class ClassDeclaration extends Declaration {
  constructor(
    name: string,
    public members: ClassMember[],
    public extendsClause?: TypeReference,
    public implementsClause?: TypeReference[],
    public typeParameters?: TypeParameter[],
    modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(name, modifiers, location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitClassDeclaration(this);
  }
}

export abstract class ClassMember extends IRNode {}

export class PropertyMember extends ClassMember {
  constructor(
    public name: string,
    public type?: IRType,
    public initializer?: Expression,
    public modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitPropertyMember(this);
  }
}

export class MethodMember extends ClassMember {
  constructor(
    public name: string,
    public parameters: Parameter[],
    public returnType?: IRType,
    public body?: BlockStatement,
    public typeParameters?: TypeParameter[],
    public modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitMethodMember(this);
  }
}

export class InterfaceDeclaration extends Declaration {
  constructor(
    name: string,
    public members: PropertySignature[],
    public extendsClause?: TypeReference[],
    public typeParameters?: TypeParameter[],
    modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(name, modifiers, location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitInterfaceDeclaration(this);
  }
}

export class TypeAliasDeclaration extends Declaration {
  constructor(
    name: string,
    public type: IRType,
    public typeParameters?: TypeParameter[],
    modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(name, modifiers, location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitTypeAliasDeclaration(this);
  }
}

export class EnumDeclaration extends Declaration {
  constructor(
    name: string,
    public members: EnumMember[],
    public isConst: boolean = false,
    modifiers: Modifier[] = [],
    location?: SourceLocation
  ) {
    super(name, modifiers, location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitEnumDeclaration(this);
  }
}

export class EnumMember extends IRNode {
  constructor(
    public name: string,
    public value?: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitEnumMember(this);
  }
}

// ============= 陳述式 =============
export abstract class Statement extends IRNode {}

export class BlockStatement extends Statement {
  constructor(
    public statements: Statement[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitBlockStatement(this);
  }
}

export class ExpressionStatement extends Statement {
  constructor(
    public expression: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitExpressionStatement(this);
  }
}

export class ReturnStatement extends Statement {
  constructor(
    public argument?: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitReturnStatement(this);
  }
}

export class IfStatement extends Statement {
  constructor(
    public test: Expression,
    public consequent: Statement,
    public alternate?: Statement,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitIfStatement(this);
  }
}

export class WhileStatement extends Statement {
  constructor(
    public test: Expression,
    public body: Statement,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitWhileStatement(this);
  }
}

export class ForStatement extends Statement {
  constructor(
    public body: Statement,
    public init?: VariableDeclaration | Expression,
    public test?: Expression,
    public update?: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitForStatement(this);
  }
}

export class ForOfStatement extends Statement {
  constructor(
    public left: VariableDeclaration,
    public right: Expression,
    public body: Statement,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitForOfStatement(this);
  }
}

export class TryStatement extends Statement {
  constructor(
    public block: BlockStatement,
    public handler?: CatchClause,
    public finalizer?: BlockStatement,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitTryStatement(this);
  }
}

export class CatchClause extends IRNode {
  constructor(
    public body: BlockStatement,
    public param?: Parameter,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitCatchClause(this);
  }
}

export class ThrowStatement extends Statement {
  constructor(
    public argument: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitThrowStatement(this);
  }
}

export class SwitchStatement extends Statement {
  constructor(
    public discriminant: Expression,
    public cases: SwitchCase[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitSwitchStatement(this);
  }
}

export class SwitchCase extends IRNode {
  constructor(
    public consequent: Statement[],
    public test?: Expression, // null for default case
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitSwitchCase(this);
  }
}

// ============= 表達式 =============
export abstract class Expression extends IRNode {
  public inferredType?: IRType;
}

export class Identifier extends Expression {
  constructor(
    public name: string,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitIdentifier(this);
  }
}

export class Literal extends Expression {
  constructor(
    public value: string | number | boolean | null | undefined,
    public raw: string,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitLiteral(this);
  }
}

export class ArrayExpression extends Expression {
  constructor(
    public elements: (Expression | null)[], // null for holes
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitArrayExpression(this);
  }
}

export class ObjectExpression extends Expression {
  constructor(
    public properties: Property[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitObjectExpression(this);
  }
}

export class Property extends IRNode {
  constructor(
    public key: Identifier | Literal | Expression,
    public value: Expression,
    public shorthand: boolean = false,
    public computed: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitProperty(this);
  }
}

export class FunctionExpression extends Expression {
  constructor(
    public parameters: Parameter[],
    public body: BlockStatement,
    public returnType?: IRType,
    public typeParameters?: TypeParameter[],
    public isAsync: boolean = false,
    public name?: string,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitFunctionExpression(this);
  }
}

export class ArrowFunctionExpression extends Expression {
  constructor(
    public parameters: Parameter[],
    public body: Expression | BlockStatement,
    public returnType?: IRType,
    public typeParameters?: TypeParameter[],
    public isAsync: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitArrowFunctionExpression(this);
  }
}

export class CallExpression extends Expression {
  constructor(
    public callee: Expression,
    public args: Expression[],
    public typeArguments?: IRType[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitCallExpression(this);
  }
}

export class MemberExpression extends Expression {
  constructor(
    public object: Expression,
    public property: Expression,
    public computed: boolean = false,
    public optional: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitMemberExpression(this);
  }
}

export class NewExpression extends Expression {
  constructor(
    public callee: Expression,
    public args: Expression[],
    public typeArguments?: IRType[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitNewExpression(this);
  }
}

export class BinaryExpression extends Expression {
  constructor(
    public operator: BinaryOperator,
    public left: Expression,
    public right: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitBinaryExpression(this);
  }
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%' | '**'
  | '==' | '!=' | '===' | '!==' | '<' | '<=' | '>' | '>='
  | '<<' | '>>' | '>>>'
  | '&' | '|' | '^'
  | '&&' | '||' | '??'
  | 'in' | 'instanceof';

export class UnaryExpression extends Expression {
  constructor(
    public operator: UnaryOperator,
    public argument: Expression,
    public prefix: boolean = true,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitUnaryExpression(this);
  }
}

export type UnaryOperator =
  | '+' | '-' | '!' | '~' | 'typeof' | 'void' | 'delete' | '++' | '--';

export class AssignmentExpression extends Expression {
  constructor(
    public operator: AssignmentOperator,
    public left: Expression,
    public right: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitAssignmentExpression(this);
  }
}

export type AssignmentOperator =
  | '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '**='
  | '<<=' | '>>=' | '>>>='
  | '&=' | '|=' | '^='
  | '??=' | '||=' | '&&=';

export class ConditionalExpression extends Expression {
  constructor(
    public test: Expression,
    public consequent: Expression,
    public alternate: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitConditionalExpression(this);
  }
}

export class AwaitExpression extends Expression {
  constructor(
    public argument: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitAwaitExpression(this);
  }
}

export class SpreadElement extends Expression {
  constructor(
    public argument: Expression,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitSpreadElement(this);
  }
}

export class TemplateLiteral extends Expression {
  constructor(
    public quasis: string[],
    public expressions: Expression[],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitTemplateLiteral(this);
  }
}

// ============= 模組系統 =============
export class Module extends IRNode {
  constructor(
    public name: string,
    public path: string,
    public statements: Statement[],
    public imports: ImportDeclaration[] = [],
    public exports: ExportDeclaration[] = [],
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitModule(this);
  }
}

export class ImportDeclaration extends IRNode {
  constructor(
    public specifiers: ImportSpecifier[],
    public source: string,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitImportDeclaration(this);
  }
}

export class ImportSpecifier extends IRNode {
  constructor(
    public imported: string,
    public local: string,
    public isDefault: boolean = false,
    public isNamespace: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitImportSpecifier(this);
  }
}

export class ExportDeclaration extends IRNode {
  constructor(
    public declaration?: Declaration,
    public specifiers?: ExportSpecifier[],
    public source?: string, // for re-exports
    public isDefault: boolean = false,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitExportDeclaration(this);
  }
}

export class ExportSpecifier extends IRNode {
  constructor(
    public exported: string,
    public local: string,
    location?: SourceLocation
  ) {
    super(location);
  }

  accept<T>(visitor: IRVisitor<T>): T {
    return visitor.visitExportSpecifier(this);
  }
}

// ============= Visitor 介面 =============
export interface IRVisitor<T> {
  // Types
  visitPrimitiveType(node: PrimitiveType): T;
  visitArrayType(node: ArrayType): T;
  visitTupleType(node: TupleType): T;
  visitObjectType(node: ObjectType): T;
  visitFunctionType(node: FunctionType): T;
  visitUnionType(node: UnionType): T;
  visitIntersectionType(node: IntersectionType): T;
  visitTypeReference(node: TypeReference): T;
  visitLiteralType(node: LiteralType): T;
  visitPropertySignature(node: PropertySignature): T;
  visitIndexSignature(node: IndexSignature): T;

  // Declarations
  visitVariableDeclaration(node: VariableDeclaration): T;
  visitFunctionDeclaration(node: FunctionDeclaration): T;
  visitClassDeclaration(node: ClassDeclaration): T;
  visitInterfaceDeclaration(node: InterfaceDeclaration): T;
  visitTypeAliasDeclaration(node: TypeAliasDeclaration): T;
  visitEnumDeclaration(node: EnumDeclaration): T;
  visitParameter(node: Parameter): T;
  visitTypeParameter(node: TypeParameter): T;
  visitPropertyMember(node: PropertyMember): T;
  visitMethodMember(node: MethodMember): T;
  visitEnumMember(node: EnumMember): T;

  // Statements
  visitBlockStatement(node: BlockStatement): T;
  visitExpressionStatement(node: ExpressionStatement): T;
  visitReturnStatement(node: ReturnStatement): T;
  visitIfStatement(node: IfStatement): T;
  visitWhileStatement(node: WhileStatement): T;
  visitForStatement(node: ForStatement): T;
  visitForOfStatement(node: ForOfStatement): T;
  visitTryStatement(node: TryStatement): T;
  visitCatchClause(node: CatchClause): T;
  visitThrowStatement(node: ThrowStatement): T;
  visitSwitchStatement(node: SwitchStatement): T;
  visitSwitchCase(node: SwitchCase): T;

  // Expressions
  visitIdentifier(node: Identifier): T;
  visitLiteral(node: Literal): T;
  visitArrayExpression(node: ArrayExpression): T;
  visitObjectExpression(node: ObjectExpression): T;
  visitProperty(node: Property): T;
  visitFunctionExpression(node: FunctionExpression): T;
  visitArrowFunctionExpression(node: ArrowFunctionExpression): T;
  visitCallExpression(node: CallExpression): T;
  visitMemberExpression(node: MemberExpression): T;
  visitNewExpression(node: NewExpression): T;
  visitBinaryExpression(node: BinaryExpression): T;
  visitUnaryExpression(node: UnaryExpression): T;
  visitAssignmentExpression(node: AssignmentExpression): T;
  visitConditionalExpression(node: ConditionalExpression): T;
  visitAwaitExpression(node: AwaitExpression): T;
  visitSpreadElement(node: SpreadElement): T;
  visitTemplateLiteral(node: TemplateLiteral): T;

  // Module
  visitModule(node: Module): T;
  visitImportDeclaration(node: ImportDeclaration): T;
  visitImportSpecifier(node: ImportSpecifier): T;
  visitExportDeclaration(node: ExportDeclaration): T;
  visitExportSpecifier(node: ExportSpecifier): T;
}