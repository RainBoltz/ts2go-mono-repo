/**
 * Jest Test Setup
 * 全域測試設定與輔助函式
 */

// 設定測試超時時間
jest.setTimeout(30000);

// 全域測試輔助函式
declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchGoCode(expected: string): R;
      toBeValidGo(): R;
    }
  }
}

/**
 * 自訂 matcher: 比對 Go 程式碼（忽略空白差異）
 */
expect.extend({
  toMatchGoCode(received: string, expected: string) {
    const normalizeWhitespace = (code: string) => {
      return code
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    };

    const normalizedReceived = normalizeWhitespace(received);
    const normalizedExpected = normalizeWhitespace(expected);

    const pass = normalizedReceived === normalizedExpected;

    if (pass) {
      return {
        message: () =>
          `Expected generated Go code not to match expected code`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `Expected generated Go code to match expected code\n\n` +
          `Expected:\n${normalizedExpected}\n\n` +
          `Received:\n${normalizedReceived}`,
        pass: false,
      };
    }
  },

  toBeValidGo(received: string) {
    // 簡單的 Go 語法驗證
    const hasPackageDeclaration = /^package \w+/.test(received);
    const hasBalancedBraces = (received.match(/{/g) || []).length ===
                               (received.match(/}/g) || []).length;

    const pass = hasPackageDeclaration && hasBalancedBraces;

    if (pass) {
      return {
        message: () => `Expected code not to be valid Go`,
        pass: true,
      };
    } else {
      const issues: string[] = [];
      if (!hasPackageDeclaration) issues.push('Missing package declaration');
      if (!hasBalancedBraces) issues.push('Unbalanced braces');

      return {
        message: () =>
          `Expected code to be valid Go, but found issues:\n` +
          issues.map(issue => `- ${issue}`).join('\n'),
        pass: false,
      };
    }
  },
});

export {};
