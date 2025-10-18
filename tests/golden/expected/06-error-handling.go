// Generated from: 06-error-handling.ts

package main

import (
	"encoding/json"
	"fmt"
)

// 自訂錯誤類別
type ValidationError struct {
	Message string
	Field   string
	Value   interface{}
}

func (e ValidationError) Error() string {
	return e.Message
}

func NewValidationError(message string, field string, value interface{}) *ValidationError {
	return &ValidationError{
		Message: message,
		Field:   field,
		Value:   value,
	}
}

type NetworkError struct {
	Message    string
	StatusCode int
	Url        string
}

func (e NetworkError) Error() string {
	return e.Message
}

func NewNetworkError(message string, statusCode int, url string) *NetworkError {
	return &NetworkError{
		Message:    message,
		StatusCode: statusCode,
		Url:        url,
	}
}

// try/catch/finally - 使用 defer 實現 finally
func ParseJSON(jsonString string) (interface{}, error) {
	defer func() {
		fmt.Println("Parse attempt completed")
	}()

	var result interface{}
	err := json.Unmarshal([]byte(jsonString), &result)
	if err != nil {
		return nil, NewValidationError("Invalid JSON", "json", jsonString)
	}

	return result, nil
}

// 多重 catch (TypeScript 中需要用 if/else)
func ProcessData(data interface{}) (string, error) {
	defer func() {
		if r := recover(); r != nil {
			// 處理 panic
		}
	}()

	str, ok := data.(string)
	if !ok {
		return "Validation failed: data", nil
	}

	if len(str) == 0 {
		return "", fmt.Errorf("Empty data")
	}

	// 在 Go 中需要使用 strings.ToUpper(str)
	return str, nil
}

// 錯誤傳播
func Divide(a float64, b float64) (float64, error) {
	if b == 0 {
		return 0, fmt.Errorf("Division by zero")
	}
	return a / b, nil
}

func Calculate(expression string) (float64, error) {
	// 簡化實作
	return 0, fmt.Errorf("Not implemented")
}

// Result 型別模式（不使用 throw）
type Result[T any] struct {
	Success bool
	Value   T
	Error   error
}

func SafeDivide(a float64, b float64) Result[float64] {
	if b == 0 {
		return Result[float64]{
			Success: false,
			Error:   fmt.Errorf("Division by zero"),
		}
	}

	return Result[float64]{
		Success: true,
		Value:   a / b,
	}
}

// 鏈式錯誤處理
func ChainedOperation(input string) Result[float64] {
	// Step 1: Parse
	// 簡化實作
	parsed := 0.0

	// Step 2: Validate range
	if parsed < 0 || parsed > 100 {
		return Result[float64]{
			Success: false,
			Error:   NewValidationError("Number out of range", "value", parsed),
		}
	}

	// Step 3: Calculate
	result := SafeDivide(100, parsed)
	if !result.Success {
		return result
	}

	return Result[float64]{
		Success: true,
		Value:   result.Value * 2,
	}
}

// Async 錯誤處理
func FetchWithErrorHandling(url string) Result[string] {
	defer func() {
		if r := recover(); r != nil {
			// 處理 panic
		}
	}()

	// 模擬網路請求
	if len(url) > 0 && url[0] == 'e' { // 簡化的錯誤判斷
		return Result[string]{
			Success: false,
			Error:   NewNetworkError("Failed to fetch", 404, url),
		}
	}

	return Result[string]{
		Success: true,
		Value:   fmt.Sprintf("Data from %s", url),
	}
}

// Error boundary 模式
type ErrorBoundary struct {
	errors []error
}

func NewErrorBoundary() *ErrorBoundary {
	return &ErrorBoundary{
		errors: make([]error, 0),
	}
}

func (eb *ErrorBoundary) Wrap(fn func() interface{}) interface{} {
	defer func() {
		if r := recover(); r != nil {
			if err, ok := r.(error); ok {
				eb.errors = append(eb.errors, err)
			}
		}
	}()

	return fn()
}

func (eb *ErrorBoundary) WrapAsync(fn func() (interface{}, error)) (interface{}, error) {
	defer func() {
		if r := recover(); r != nil {
			if err, ok := r.(error); ok {
				eb.errors = append(eb.errors, err)
			}
		}
	}()

	result, err := fn()
	if err != nil {
		eb.errors = append(eb.errors, err)
		return nil, err
	}

	return result, nil
}

func (eb *ErrorBoundary) GetErrors() []error {
	result := make([]error, len(eb.errors))
	copy(result, eb.errors)
	return result
}

func (eb *ErrorBoundary) ClearErrors() {
	eb.errors = make([]error, 0)
}

func (eb *ErrorBoundary) HasErrors() bool {
	return len(eb.errors) > 0
}