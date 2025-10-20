package main

import "fmt"

var Strr string = "hello"
var Numm float64 = 42
var Boool bool = true
var nothing interface{} = nil

var inferredString = "world"
var inferredNumber = 3.14
var inferredBoolean = false

var anyValue interface{} = 42

var unknownValue interface{} = 42

var numberss = []float64{1, 2, 3, 4, 5}
var strings = []string{"a", "b", "c"}

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

func Greet(name string, age *float64, title string) string {
	if title == "" {
		title = "Mr."
	}
	if age != nil {
		return fmt.Sprintf("%s %s, age %v", title, name, *age)
	}
	return fmt.Sprintf("%s %s", title, name)
}
