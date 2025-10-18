/**
 * 源碼位置追蹤
 */

export class SourceLocation {
  constructor(
    public file: string,
    public start: Position,
    public end: Position
  ) {}

  toString(): string {
    return `${this.file}:${this.start.line}:${this.start.column}`;
  }
}

export class Position {
  constructor(
    public line: number,
    public column: number,
    public offset: number
  ) {}
}