// Generated from: 03-generics.ts

package main

import "fmt"

// 泛型函式
func Identity[T any](arg T) T {
	return arg
}

func Map[T any, U any](arr []T, fn func(T) U) []U {
	result := make([]U, 0, len(arr))
	for _, item := range arr {
		result = append(result, fn(item))
	}
	return result
}

// 泛型介面
type Container[T any] interface {
	GetValue() T
	SetValue(value T)
}

// 泛型類別
type Box[T any] struct {
	Value T
}

func NewBox[T any](value T) *Box[T] {
	return &Box[T]{Value: value}
}

func (b *Box[T]) GetValue() T {
	return b.Value
}

func (b *Box[T]) SetValue(value T) {
	b.Value = value
}

func (b *Box[T]) Map[U any](fn func(T) U) *Box[U] {
	return NewBox(fn(b.Value))
}

// 泛型約束
type Lengthwise interface {
	Len() int
}

func LogLength[T Lengthwise](arg T) T {
	fmt.Println(arg.Len())
	return arg
}

// 多個型別參數
type Pair[K any, V any] struct {
	Key   K
	Value V
}

func NewPair[K any, V any](key K, value V) *Pair[K, V] {
	return &Pair[K, V]{Key: key, Value: value}
}

func (p *Pair[K, V]) GetKey() K {
	return p.Key
}

func (p *Pair[K, V]) GetValue() V {
	return p.Value
}

// 泛型預設值
type Response[T any] struct {
	Data    T
	Status  int
	Message string
}

// 使用範例
var (
	num  = Identity(42)
	str  = Identity("hello")
	arr  = Map([]int{1, 2, 3}, func(x int) int { return x * 2 })
	box  = NewBox(10)
	pair = NewPair("key", "value")
)