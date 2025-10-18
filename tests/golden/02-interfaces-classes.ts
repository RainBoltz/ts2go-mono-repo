/**
 * 測試 02: 介面與類別
 */

// 基本介面
interface User {
  id: string;
  name: string;
  email?: string;
  readonly createdAt: Date;
}

// 介面繼承
interface Admin extends User {
  role: 'admin';
  permissions: string[];
}

// 索引簽名
interface Dictionary {
  [key: string]: any;
}

// 類別實作介面
class UserImpl implements User {
  readonly createdAt: Date;

  constructor(
    public id: string,
    public name: string,
    public email?: string
  ) {
    this.createdAt = new Date();
  }

  greet(): string {
    return `Hello, I'm ${this.name}`;
  }
}

// 類別繼承
class AdminUser extends UserImpl implements Admin {
  role: 'admin' = 'admin';

  constructor(
    id: string,
    name: string,
    email: string,
    public permissions: string[]
  ) {
    super(id, name, email);
  }

  hasPermission(permission: string): boolean {
    return this.permissions.includes(permission);
  }
}

// 靜態成員
class Counter {
  private static instance: Counter;
  private count: number = 0;

  static getInstance(): Counter {
    if (!Counter.instance) {
      Counter.instance = new Counter();
    }
    return Counter.instance;
  }

  increment(): number {
    return ++this.count;
  }

  getCount(): number {
    return this.count;
  }
}

export { User, Admin, UserImpl, AdminUser, Counter };