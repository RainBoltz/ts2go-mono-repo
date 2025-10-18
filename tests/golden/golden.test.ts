/**
 * Golden Tests
 * 測試 TypeScript 到 Go 的轉譯是否符合預期
 */

import { runGoldenTest } from '../helpers/golden-test';
import { GoldenTestRunner } from '../helpers/golden-test';

describe('Golden Tests - Basic Types', () => {
  test('01-basic-types', async () => {
    await runGoldenTest(
      '01-basic-types',
      '01-basic-types.ts',
      '01-basic-types.go'
    );
  });
});

describe('Golden Tests - OOP', () => {
  test('02-interfaces-classes', async () => {
    await runGoldenTest(
      '02-interfaces-classes',
      '02-interfaces-classes.ts',
      '02-interfaces-classes.go'
    );
  });
});

describe('Golden Tests - Generics', () => {
  test('03-generics', async () => {
    await runGoldenTest(
      '03-generics',
      '03-generics.ts',
      '03-generics.go'
    );
  });
});

describe('Golden Tests - Union/Intersection', () => {
  test('04-union-intersection', async () => {
    await runGoldenTest(
      '04-union-intersection',
      '04-union-intersection.ts',
      '04-union-intersection.go'
    );
  });
});

describe('Golden Tests - Async/Await', () => {
  test('05-async-await', async () => {
    await runGoldenTest(
      '05-async-await',
      '05-async-await.ts',
      '05-async-await.go'
    );
  });
});

describe('Golden Tests - Error Handling', () => {
  test('06-error-handling', async () => {
    await runGoldenTest(
      '06-error-handling',
      '06-error-handling.ts',
      '06-error-handling.go'
    );
  });
});

describe('Golden Tests - Enums/Namespaces', () => {
  test('07-enums-namespaces', async () => {
    await runGoldenTest(
      '07-enums-namespaces',
      '07-enums-namespaces.ts',
      '07-enums-namespaces.go'
    );
  });
});

describe('Golden Tests - Arrays/Iterators', () => {
  test('08-arrays-iterators', async () => {
    await runGoldenTest(
      '08-arrays-iterators',
      '08-arrays-iterators.ts',
      '08-arrays-iterators.go'
    );
  });
});

describe('Golden Tests - Modules/Imports', () => {
  test('09-modules-imports', async () => {
    await runGoldenTest(
      '09-modules-imports',
      '09-modules-imports.ts',
      '09-modules-imports.go'
    );
  });
});

describe('Golden Tests - Advanced Types', () => {
  test('10-advanced-types', async () => {
    await runGoldenTest(
      '10-advanced-types',
      '10-advanced-types.ts',
      '10-advanced-types.go'
    );
  });
});

describe('Golden Tests - All Tests', () => {
  test('run all golden tests', async () => {
    const runner = new GoldenTestRunner();
    const summary = await runner.runAllGoldenTests();

    console.log(`\nGolden Test Summary:`);
    console.log(`  Total: ${summary.total}`);
    console.log(`  Passed: ${summary.passed}`);
    console.log(`  Failed: ${summary.failed}`);

    if (summary.failed > 0) {
      console.log(`\nFailed tests:`);
      summary.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}`);
          if (r.diff) {
            console.log(`    Differences:`);
            r.diff.slice(0, 10).forEach(line => console.log(`      ${line}`));
          }
        });
    }

    expect(summary.passed).toBe(summary.total);
  }, 60000); // 60 second timeout for all tests
});
