/**
 * 測試 07: Enum 與 Namespace
 */

// 數字 enum
enum Direction {
  Up,
  Down,
  Left,
  Right
}

// 字串 enum
enum Status {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Rejected = 'REJECTED'
}

// 混合 enum
enum Mixed {
  No = 0,
  Yes = 'YES'
}

// const enum
const enum LogLevel {
  Debug = 0,
  Info = 1,
  Warning = 2,
  Error = 3
}

// 使用 enum
function move(direction: Direction): string {
  switch (direction) {
    case Direction.Up:
      return 'Moving up';
    case Direction.Down:
      return 'Moving down';
    case Direction.Left:
      return 'Moving left';
    case Direction.Right:
      return 'Moving right';
    default:
      return 'Unknown direction';
  }
}

// Namespace
namespace Utils {
  export function formatDate(date: Date): string {
    return date.toISOString();
  }

  export function parseDate(str: string): Date {
    return new Date(str);
  }

  export const VERSION = '1.0.0';

  export interface Config {
    debug: boolean;
    timeout: number;
  }

  export class Logger {
    constructor(private prefix: string) {}

    log(message: string): void {
      console.log(`[${this.prefix}] ${message}`);
    }
  }

  // 內部 namespace
  export namespace Internal {
    export function secretFunction(): string {
      return 'internal';
    }
  }
}

// 使用 namespace
const logger = new Utils.Logger('App');
const dateStr = Utils.formatDate(new Date());
const config: Utils.Config = {
  debug: true,
  timeout: 5000
};

// Namespace 合併
namespace MergedNamespace {
  export interface Data {
    id: string;
    value: number;
  }
}

namespace MergedNamespace {
  export function createData(id: string, value: number): Data {
    return { id, value };
  }

  export class DataManager {
    private data: Data[] = [];

    add(item: Data): void {
      this.data.push(item);
    }

    getAll(): Data[] {
      return [...this.data];
    }
  }
}

// Enum 作為型別
type DirectionType = keyof typeof Direction;

function getDirectionName(dir: Direction): DirectionType | undefined {
  return Direction[dir] as DirectionType;
}

// Reverse mapping
function getDirectionValue(name: string): Direction | undefined {
  return (Direction as any)[name];
}

// Enum 與 Union type 的結合
type StatusUnion = `${Status}`;

function processStatus(status: StatusUnion): void {
  console.log(`Processing status: ${status}`);
}

// Computed enum members
enum FileAccess {
  None = 0,
  Read = 1 << 1,
  Write = 1 << 2,
  ReadWrite = Read | Write,
  Admin = Read | Write | 1 << 3
}

function hasAccess(current: FileAccess, required: FileAccess): boolean {
  return (current & required) === required;
}

export {
  Direction,
  Status,
  Mixed,
  LogLevel,
  move,
  Utils,
  MergedNamespace,
  getDirectionName,
  getDirectionValue,
  processStatus,
  FileAccess,
  hasAccess
};