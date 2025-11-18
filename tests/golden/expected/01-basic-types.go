package main

import "fmt"

var Strr string = "hello"
var Numm int = 42
var Boool bool = true
var nothing interface{} = nil

var inferredString = "world"
var inferredNumber = 3.14
var inferredBoolean = false
var anyValue = 42

var unknownValue interface{} = 42

var numberss = []int{1, 2, 3, 4, 5}
var strings = []string{"a", "b", "c"}

type Tuple2_string_int struct {
	Item0 string
	Item1 int
}

var tuple = Tuple2_string_int{"age", 30}

type Tuple3_string_int_bool struct {
	Item0 string
	Item1 int
	Item2 bool
}

var tuple3 = Tuple3_string_int_bool{"test", 1, true}

func Greet(name string, age *int, title string) string {
	if title == "" {
		title = "Mr."
	}
	if age != nil {
		return fmt.Sprintf("%s %s, age %v", title, name, *age)
	}
	return fmt.Sprintf("%s %s", title, name)
}
