// Generated from: 01-basic-types.ts

package main

import "fmt"

// 基本型別
var str string = "hello"
var num float64 = 42
var bool bool = true
var nothing interface{} = nil

// 型別推斷
var inferredString = "world"
var inferredNumber = 3.14
var inferredBoolean = false

// any 與 unknown
var anyValue interface{} = 42

// anyValue = "string"
// anyValue = true

var unknownValue interface{} = 42

// Arrays
var numbers = []float64{1, 2, 3, 4, 5}
var strings = []string{"a", "b", "c"}

// Tuples
type Tuple2_string_float64 struct {
	Item0 string
	Item1 float64
}

var tuple = Tuple2_string_float64{"age", 30}

type Tuple3_string_float64_bool struct {
	Item0 string
	Item1 float64
	Item2 bool
}

var tuple3 = Tuple3_string_float64_bool{"test", 1, true}

// 可選與預設值
func greet(name string, age *float64, title string) string {
	if title == "" {
		title = "Mr."
	}
	if age != nil {
		return fmt.Sprintf("%s %s, age %v", title, name, *age)
	}
	return fmt.Sprintf("%s %s", title, name)
}
