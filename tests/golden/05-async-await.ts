/**
 * 測試 05: Async/Await 與 Promise
 */

// 基本 async function
async function fetchData(url: string): Promise<string> {
  // 模擬 HTTP 請求
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Data from ${url}`);
    }, 100);
  });
}

// async/await 與錯誤處理
async function fetchWithRetry(url: string, maxRetries: number = 3): Promise<string> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const data = await fetchData(url);
      return data;
    } catch (error) {
      lastError = error as Error;
      console.log(`Retry ${i + 1} failed`);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// 並行執行
async function fetchMultiple(urls: string[]): Promise<string[]> {
  const promises = urls.map(url => fetchData(url));
  return Promise.all(promises);
}

// Promise.race
async function fetchFirstAvailable(urls: string[]): Promise<string> {
  const promises = urls.map(url => fetchData(url));
  return Promise.race(promises);
}

// async 方法在類別中
class DataService {
  private cache: Map<string, string> = new Map();

  async getData(key: string): Promise<string | undefined> {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const data = await fetchData(key);
    this.cache.set(key, data);
    return data;
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
  }
}

// async arrow function
const processAsync = async (input: string): Promise<number> => {
  const result = await fetchData(input);
  return result.length;
};

// Promise chain 轉換
function fetchAndProcess(url: string): Promise<number> {
  return fetchData(url)
    .then(data => data.toUpperCase())
    .then(data => data.length)
    .catch(error => {
      console.error('Error:', error);
      return 0;
    });
}

// async generator (簡化版)
async function* generateData(count: number): AsyncGenerator<number> {
  for (let i = 0; i < count; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
    yield i;
  }
}

// 使用 async generator
async function consumeGenerator(): Promise<number[]> {
  const results: number[] = [];
  for await (const value of generateData(5)) {
    results.push(value);
  }
  return results;
}

// Promise 工具函式
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    delay(ms).then(() => {
      throw new Error('Timeout');
    })
  ]);
}

export {
  fetchData,
  fetchWithRetry,
  fetchMultiple,
  fetchFirstAvailable,
  DataService,
  processAsync,
  fetchAndProcess,
  generateData,
  consumeGenerator,
  delay,
  timeout
};