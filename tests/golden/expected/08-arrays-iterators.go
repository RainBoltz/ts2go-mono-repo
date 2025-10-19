package main

var (
	numbers  = []int{1, 2, 3, 4, 5}
	doubled  []int
	filtered []int
	sum      int
)

func init() {
	doubled = make([]int, len(numbers))
	for i, n := range numbers {
		doubled[i] = n * 2
	}

	filtered = make([]int, 0)
	for _, n := range numbers {
		if n > 2 {
			filtered = append(filtered, n)
		}
	}

	sum = 0
	for _, n := range numbers {
		sum += n
	}
}

func ProcessNumbers(nums []int) int {
	filtered := make([]int, 0)
	for _, n := range nums {
		if n > 0 {
			filtered = append(filtered, n)
		}
	}

	mapped := make([]int, len(filtered))
	for i, n := range filtered {
		mapped[i] = n * 2
	}

	sum := 0
	for _, n := range mapped {
		sum += n
	}

	return sum
}

func First[T any](arr []T) *T {
	if len(arr) == 0 {
		return nil
	}
	return &arr[0]
}

func Last[T any](arr []T) *T {
	if len(arr) == 0 {
		return nil
	}
	return &arr[len(arr)-1]
}

func Take[T any](arr []T, n int) []T {
	if n > len(arr) {
		n = len(arr)
	}
	return arr[0:n]
}

func Chunk[T any](arr []T, size int) [][]T {
	chunks := make([][]T, 0)
	for i := 0; i < len(arr); i += size {
		end := i + size
		if end > len(arr) {
			end = len(arr)
		}
		chunks = append(chunks, arr[i:end])
	}
	return chunks
}

func SumArray(numbers []int) int {
	total := 0
	for _, num := range numbers {
		total += num
	}
	return total
}

func GetKeys(obj map[string]interface{}) []string {
	keys := make([]string, 0, len(obj))
	for key := range obj {
		keys = append(keys, key)
	}
	return keys
}

func ProcessCoordinates(coords [][2]int) {
	for _, coord := range coords {
		x, y := coord[0], coord[1]
		println("Point: (", x, ", ", y, ")")
	}
}

func Concatenate(arrays ...[]int) []int {
	result := make([]int, 0)
	for _, arr := range arrays {
		result = append(result, arr...)
	}
	return result
}

var (
	arr1     = []int{1, 2, 3}
	arr2     = []int{4, 5, 6}
	combined []int
	cloned   []int
)

func init() {
	combined = append(append([]int{}, arr1...), arr2...)
	cloned = append([]int{}, arr1...)
}

func Range(start int, end int) []int {
	length := end - start
	result := make([]int, length)
	for i := 0; i < length; i++ {
		result[i] = start + i
	}
	return result
}

type RangeIterator struct {
	start int
	end   int
	step  int
}

func NewRange(start int, end int, step int) *RangeIterator {
	if step == 0 {
		step = 1
	}
	return &RangeIterator{
		start: start,
		end:   end,
		step:  step,
	}
}

func (r *RangeIterator) Iterator() <-chan int {
	ch := make(chan int)
	go func() {
		defer close(ch)
		for i := r.start; i < r.end; i += r.step {
			ch <- i
		}
	}()
	return ch
}

func (r *RangeIterator) ToArray() []int {
	result := make([]int, 0)
	for val := range r.Iterator() {
		result = append(result, val)
	}
	return result
}

func UniqueValues[T comparable](arr []T) []T {
	seen := make(map[T]bool)
	result := make([]T, 0)

	for _, item := range arr {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}

	return result
}

func CountOccurrences[T comparable](arr []T) map[T]int {
	counts := make(map[T]int)
	for _, item := range arr {
		counts[item]++
	}
	return counts
}

func Partition[T any](arr []T, predicate func(T) bool) ([]T, []T) {
	pass := make([]T, 0)
	fail := make([]T, 0)

	for _, item := range arr {
		if predicate(item) {
			pass = append(pass, item)
		} else {
			fail = append(fail, item)
		}
	}

	return pass, fail
}

func GroupBy[T any, K comparable](arr []T, keyFn func(T) K) map[K][]T {
	groups := make(map[K][]T)

	for _, item := range arr {
		key := keyFn(item)
		groups[key] = append(groups[key], item)
	}

	return groups
}

type NestedArray interface{}

func Flatten(arr []NestedArray) []interface{} {
	result := make([]interface{}, 0)

	for _, item := range arr {
		if nested, ok := item.([]NestedArray); ok {
			result = append(result, Flatten(nested)...)
		} else {
			result = append(result, item)
		}
	}

	return result
}