package main

import (
	"encoding/json"
	"fmt"
)

type User struct {
	Id    string
	Name  string
	Email *string
	Age   int
}

type ReadonlyUser struct {
	id    string
	name  string
	email *string
	age   int
}

func (u ReadonlyUser) Id() string      { return u.id }
func (u ReadonlyUser) Name() string    { return u.name }
func (u ReadonlyUser) Email() *string  { return u.email }
func (u ReadonlyUser) Age() int        { return u.age }

type PartialUser struct {
	Id    *string
	Name  *string
	Email *string
	Age   *int
}

type UserCredentials struct {
	Email *string
	Id    string
}

type UserWithoutId struct {
	Name  string
	Email *string
	Age   int
}

type EventHandler string

const (
	OnClick EventHandler = "onClick"
	OnFocus EventHandler = "onFocus"
	OnBlur  EventHandler = "onBlur"
)

var user = User{
	Id:   "123",
	Name: "John",
	Age:  30,
}

func IsString(value interface{}) bool {
	_, ok := value.(string)
	return ok
}

func IsUser(obj interface{}) bool {
	if obj == nil {
		return false
	}

	u, ok := obj.(map[string]interface{})
	if !ok {
		return false
	}

	_, hasId := u["id"]
	_, hasName := u["name"]
	_, hasAge := u["age"]

	return hasId && hasName && hasAge
}

type Shape interface {
	isShape()
	GetKind() string
}

type CircleShape struct {
	Kind   string
	Radius float64
}

func (c CircleShape) isShape()           {}
func (c CircleShape) GetKind() string    { return c.Kind }

type SquareShape struct {
	Kind string
	Side float64
}

func (s SquareShape) isShape()           {}
func (s SquareShape) GetKind() string    { return s.Kind }

type RectangleShape struct {
	Kind   string
	Width  float64
	Height float64
}

func (r RectangleShape) isShape()           {}
func (r RectangleShape) GetKind() string    { return r.Kind }

func GetArea(shape Shape) float64 {
	switch s := shape.(type) {
	case CircleShape:
		return 3.14159 * s.Radius * s.Radius
	case SquareShape:
		return s.Side * s.Side
	case RectangleShape:
		return s.Width * s.Height
	default:
		return 0
	}
}

type JsonValue interface{}

type JsonArray []JsonValue
type JsonObject map[string]JsonValue

func CombineStrings(a string, b string) string {
	return a + b
}

func CombineNumbers(a float64, b float64) float64 {
	return a + b
}

func Combine(a interface{}, b interface{}) interface{} {
	switch aVal := a.(type) {
	case string:
		if bVal, ok := b.(string); ok {
			return aVal + bVal
		}
	case float64:
		if bVal, ok := b.(float64); ok {
			return aVal + bVal
		}
	}
	panic("Invalid arguments")
}

type FluentBuilder struct {
	data map[string]interface{}
}

func NewFluentBuilder() *FluentBuilder {
	return &FluentBuilder{
		data: make(map[string]interface{}),
	}
}

func (fb *FluentBuilder) Set(key string, value interface{}) *FluentBuilder {
	fb.data[key] = value
	return fb
}

func (fb *FluentBuilder) Build() map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range fb.data {
		result[k] = v
	}
	return result
}

var CONFIG = struct {
	API_URL      string
	TIMEOUT      int
	RETRY_COUNTS []int
}{
	API_URL:      "https://api.example.com",
	TIMEOUT:      5000,
	RETRY_COUNTS: []int{1, 2, 3},
}

type StringNumberPair struct {
	Item0 string
	Item1 float64
}

type StringNumberBooleanTuple struct {
	Item0 string
	Item1 float64
	Item2 bool
}

func ProcessValue() int {
	var someValue interface{} = "Hello World"
	strValue, ok := someValue.(string)
	if !ok {
		return 0
	}
	return len(strValue)
}

func ProcessNullable(value *string) string {
	if value == nil {
		panic("value is nil")
	}
	return *value
}

func GetProperty(obj map[string]interface{}, key string) interface{} {
	return obj[key]
}

type UserId string
type PostId string

func GetUserById(id UserId) User {
	return user
}

func ExampleUsage() {
	var value interface{} = "test"
	if IsString(value) {
		fmt.Println("It's a string")
	}

	circle := CircleShape{Kind: "circle", Radius: 10}
	area := GetArea(circle)
	fmt.Printf("Area: %f\n", area)

	builder := NewFluentBuilder()
	result := builder.Set("name", "John").Set("age", 30).Build()
	jsonData, _ := json.Marshal(result)
	fmt.Println(string(jsonData))

	str := CombineStrings("hello", "world")
	num := CombineNumbers(1.5, 2.5)
	fmt.Printf("String: %s, Number: %f\n", str, num)
}