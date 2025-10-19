package main

import (
	"encoding/json"
	"fmt"
	"strconv"
)

type StringOrNumber struct {
	tag    int
	str    *string
	number *float64
}

func NewStringOrNumberFromString(s string) StringOrNumber {
	return StringOrNumber{tag: 0, str: &s}
}

func NewStringOrNumberFromNumber(n float64) StringOrNumber {
	return StringOrNumber{tag: 1, number: &n}
}

func (u StringOrNumber) IsString() bool {
	return u.tag == 0
}

func (u StringOrNumber) IsNumber() bool {
	return u.tag == 1
}

func (u StringOrNumber) AsString() string {
	if u.str != nil {
		return *u.str
	}
	return ""
}

func (u StringOrNumber) AsNumber() float64 {
	if u.number != nil {
		return *u.number
	}
	return 0
}

type Status string

const (
	StatusPending Status = "pending"
	StatusSuccess Status = "success"
	StatusError   Status = "error"
)

func ProcessValue(value StringOrNumber) string {
	if value.IsString() {
		return value.AsString()
	} else {
		return fmt.Sprintf("%.2f", value.AsNumber())
	}
}

type Result interface {
	isResult()
	GetStatus() string
}

type SuccessResult struct {
	Status string
	Data   interface{}
}

func (s SuccessResult) isResult()         {}
func (s SuccessResult) GetStatus() string { return s.Status }

type ErrorResult struct {
	Status string
	Error  string
	Code   int
}

func (e ErrorResult) isResult()         {}
func (e ErrorResult) GetStatus() string { return e.Status }

type LoadingResult struct {
	Status string
}

func (l LoadingResult) isResult()         {}
func (l LoadingResult) GetStatus() string { return l.Status }

func HandleResult(result Result) string {
	switch r := result.(type) {
	case SuccessResult:
		data, _ := json.Marshal(r.Data)
		return fmt.Sprintf("Success: %s", string(data))
	case ErrorResult:
		return fmt.Sprintf("Error %d: %s", r.Code, r.Error)
	case LoadingResult:
		return "Loading..."
	default:
		return ""
	}
}

type Named struct {
	Name string
}

type Aged struct {
	Age int
}

type Located struct {
	Address string
}

type Person struct {
	Named
	Aged
	Located
}

var person = Person{
	Named:   Named{Name: "John"},
	Aged:    Aged{Age: 30},
	Located: Located{Address: "123 Main St"},
}

func FormatValue(value interface{}) string {
	if value == nil {
		return "null"
	}

	switch v := value.(type) {
	case bool:
		if v {
			return "true"
		}
		return "false"
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case string:
		return v
	default:
		return ""
	}
}

type ServerConfig struct {
	Host *string
	Port *int
}

type Config struct {
	Server  *ServerConfig
	Timeout *int
}

func GetServerUrl(config Config) string {
	host := "localhost"
	if config.Server != nil && config.Server.Host != nil {
		host = *config.Server.Host
	}

	port := 3000
	if config.Server != nil && config.Server.Port != nil {
		port = *config.Server.Port
	}

	return fmt.Sprintf("http://%s:%d", host, port)
}

func IsError(result Result) bool {
	_, ok := result.(ErrorResult)
	return ok
}

func IsSuccess(result Result) bool {
	_, ok := result.(SuccessResult)
	return ok
}

func ProcessResult(result Result) {
	if IsError(result) {
		err := result.(ErrorResult)
		fmt.Printf("Error: %s\n", err.Error)
	} else if IsSuccess(result) {
		success := result.(SuccessResult)
		fmt.Printf("Data: %v\n", success.Data)
	} else {
		fmt.Println("Still loading...")
	}
}