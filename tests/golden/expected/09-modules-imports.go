// Generated from: 09-modules-imports.ts

package main

// Named exports
const (
	API_VERSION  = "1.0.0"
	API_ENDPOINT = "https://api.example.com"
)

type ApiConfig struct {
	Endpoint string
	Timeout  int
	Retries  int
}

type ApiClient struct {
	config ApiConfig
}

func NewApiClient(config ApiConfig) *ApiClient {
	return &ApiClient{config: config}
}

func (a *ApiClient) Request(path string) (interface{}, error) {
	// 模擬 API 請求
	return map[string]interface{}{
		"path":   path,
		"config": a.config,
	}, nil
}

func CreateClient(config *ApiConfig) *ApiClient {
	defaultConfig := ApiConfig{
		Endpoint: API_ENDPOINT,
		Timeout:  5000,
		Retries:  3,
	}

	if config != nil {
		if config.Endpoint != "" {
			defaultConfig.Endpoint = config.Endpoint
		}
		if config.Timeout != 0 {
			defaultConfig.Timeout = config.Timeout
		}
		if config.Retries != 0 {
			defaultConfig.Retries = config.Retries
		}
	}

	return NewApiClient(defaultConfig)
}

// Type-only exports
type RequestMethod string

const (
	RequestMethodGET    RequestMethod = "GET"
	RequestMethodPOST   RequestMethod = "POST"
	RequestMethodPUT    RequestMethod = "PUT"
	RequestMethodDELETE RequestMethod = "DELETE"
)

type RequestHeaders map[string]string

type RequestOptions struct {
	Method  RequestMethod
	Headers *RequestHeaders
	Body    interface{}
}

// Default export - 在 Go 中沒有 default export，使用特殊命名
type HttpClient struct {
	ApiClient
}

func NewHttpClient(config ApiConfig) *HttpClient {
	return &HttpClient{
		ApiClient: *NewApiClient(config),
	}
}

func (h *HttpClient) Get(path string) (interface{}, error) {
	return h.Request(path)
}

func (h *HttpClient) Post(path string, data interface{}) (interface{}, error) {
	return h.Request(path)
}

// Namespace export
type HttpMethod string

const (
	HttpMethodGET    HttpMethod = "GET"
	HttpMethodPOST   HttpMethod = "POST"
	HttpMethodPUT    HttpMethod = "PUT"
	HttpMethodDELETE HttpMethod = "DELETE"
)

type HttpResponse struct {
	Status  int
	Data    interface{}
	Headers map[string]string
}

type HttpRequest struct {
	Url    string
	Method HttpMethod
}

func NewHttpRequest(url string, method HttpMethod) *HttpRequest {
	return &HttpRequest{
		Url:    url,
		Method: method,
	}
}

// Function overloads - Go 不支援函式重載，使用可選參數
func Fetch(url string, options *RequestOptions) (interface{}, error) {
	// Implementation
	return map[string]interface{}{
		"url":     url,
		"options": options,
	}, nil
}

// Const assertions
var CONSTANTS = struct {
	MAX_RETRIES int
	TIMEOUT     int
	ENDPOINTS   struct {
		USERS    string
		POSTS    string
		COMMENTS string
	}
}{
	MAX_RETRIES: 3,
	TIMEOUT:     5000,
	ENDPOINTS: struct {
		USERS    string
		POSTS    string
		COMMENTS string
	}{
		USERS:    "/users",
		POSTS:    "/posts",
		COMMENTS: "/comments",
	},
}

// Module initialization - 使用 init 函式
func init() {
	println("Module initialized")
}

// Export patterns
var Utils = struct {
	FormatUrl     func(string) string
	ParseResponse func(interface{}) interface{}
}{
	FormatUrl: func(path string) string {
		return API_ENDPOINT + path
	},
	ParseResponse: func(response interface{}) interface{} {
		// 簡化實作
		return response
	},
}

// Conditional exports based on environment
var config = struct {
	Debug    bool
	LogLevel string
}{
	Debug:    false, // 預設為 production
	LogLevel: "error",
}

// Re-export with rename
type Client = ApiClient