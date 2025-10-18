// Generated from: 05-async-await.ts

package main

import (
	"context"
	"fmt"
	"time"
)

// 基本 async function - 轉換為返回 error 的同步函式
func FetchData(ctx context.Context, url string) (string, error) {
	// 模擬 HTTP 請求
	time.Sleep(100 * time.Millisecond)
	return fmt.Sprintf("Data from %s", url), nil
}

// async/await 與錯誤處理
func FetchWithRetry(ctx context.Context, url string, maxRetries int) (string, error) {
	if maxRetries == 0 {
		maxRetries = 3
	}

	var lastError error

	for i := 0; i < maxRetries; i++ {
		data, err := FetchData(ctx, url)
		if err == nil {
			return data, nil
		}
		lastError = err
		fmt.Printf("Retry %d failed\n", i+1)
	}

	if lastError != nil {
		return "", lastError
	}
	return "", fmt.Errorf("Max retries exceeded")
}

// 並行執行 - 使用 goroutines
func FetchMultiple(ctx context.Context, urls []string) ([]string, error) {
	results := make([]string, len(urls))
	errs := make(chan error, len(urls))
	done := make(chan bool, len(urls))

	for i, url := range urls {
		go func(index int, u string) {
			data, err := FetchData(ctx, u)
			if err != nil {
				errs <- err
				return
			}
			results[index] = data
			done <- true
		}(i, url)
	}

	// 等待所有完成
	for i := 0; i < len(urls); i++ {
		select {
		case <-done:
			// 成功
		case err := <-errs:
			return nil, err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	return results, nil
}

// Promise.race - 返回第一個完成的結果
func FetchFirstAvailable(ctx context.Context, urls []string) (string, error) {
	result := make(chan string, 1)
	errs := make(chan error, len(urls))

	for _, url := range urls {
		go func(u string) {
			data, err := FetchData(ctx, u)
			if err != nil {
				errs <- err
				return
			}
			select {
			case result <- data:
			default:
			}
		}(url)
	}

	select {
	case data := <-result:
		return data, nil
	case err := <-errs:
		return "", err
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

// async 方法在類別中
type DataService struct {
	cache map[string]string
}

func NewDataService() *DataService {
	return &DataService{
		cache: make(map[string]string),
	}
}

func (d *DataService) GetData(ctx context.Context, key string) (string, error) {
	if val, ok := d.cache[key]; ok {
		return val, nil
	}

	data, err := FetchData(ctx, key)
	if err != nil {
		return "", err
	}

	d.cache[key] = data
	return data, nil
}

func (d *DataService) ClearCache(ctx context.Context) error {
	d.cache = make(map[string]string)
	return nil
}

// async arrow function
var ProcessAsync = func(ctx context.Context, input string) (int, error) {
	result, err := FetchData(ctx, input)
	if err != nil {
		return 0, err
	}
	return len(result), nil
}

// Promise chain 轉換
func FetchAndProcess(ctx context.Context, url string) (int, error) {
	data, err := FetchData(ctx, url)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return 0, nil
	}

	// 相當於 .then(data => data.toUpperCase())
	upperData := data // 在 Go 中需要使用 strings.ToUpper(data)

	// 相當於 .then(data => data.length)
	return len(upperData), nil
}

// async generator - 使用 channel
func GenerateData(ctx context.Context, count int) <-chan int {
	ch := make(chan int)
	go func() {
		defer close(ch)
		for i := 0; i < count; i++ {
			select {
			case <-ctx.Done():
				return
			case <-time.After(10 * time.Millisecond):
				ch <- i
			}
		}
	}()
	return ch
}

// 使用 async generator
func ConsumeGenerator(ctx context.Context) ([]int, error) {
	results := make([]int, 0)
	for value := range GenerateData(ctx, 5) {
		results = append(results, value)
	}
	return results, nil
}

// Promise 工具函式
func Delay(ctx context.Context, ms int) error {
	select {
	case <-time.After(time.Duration(ms) * time.Millisecond):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func Timeout[T any](ctx context.Context, promiseFn func(context.Context) (T, error), ms int) (T, error) {
	var zero T
	resultCh := make(chan T, 1)
	errCh := make(chan error, 1)

	go func() {
		result, err := promiseFn(ctx)
		if err != nil {
			errCh <- err
			return
		}
		resultCh <- result
	}()

	select {
	case result := <-resultCh:
		return result, nil
	case err := <-errCh:
		return zero, err
	case <-time.After(time.Duration(ms) * time.Millisecond):
		return zero, fmt.Errorf("Timeout")
	case <-ctx.Done():
		return zero, ctx.Err()
	}
}