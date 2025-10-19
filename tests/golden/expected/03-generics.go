package main

import "fmt"

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

type Container[T any] interface {
	GetValue() T
	SetValue(value T)
}

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

type Lengthwise interface {
	Len() int
}

func LogLength[T Lengthwise](arg T) T {
	fmt.Println(arg.Len())
	return arg
}

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

type Response[T any] struct {
	Data    T
	Status  int
	Message string
}

var (
	num  = Identity(42)
	str  = Identity("hello")
	arr  = Map([]int{1, 2, 3}, func(x int) int { return x * 2 })
	box  = NewBox(10)
	pair = NewPair("key", "value")
)