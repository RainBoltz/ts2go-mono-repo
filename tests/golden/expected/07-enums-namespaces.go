// Generated from: 07-enums-namespaces.ts

package main

import "fmt"

// 數字 enum
type Direction int

const (
	DirectionUp Direction = iota
	DirectionDown
	DirectionLeft
	DirectionRight
)

func (d Direction) String() string {
	switch d {
	case DirectionUp:
		return "Up"
	case DirectionDown:
		return "Down"
	case DirectionLeft:
		return "Left"
	case DirectionRight:
		return "Right"
	default:
		return "Unknown"
	}
}

// 字串 enum
type Status string

const (
	StatusPending  Status = "PENDING"
	StatusApproved Status = "APPROVED"
	StatusRejected Status = "REJECTED"
)

// 混合 enum - 在 Go 中需要分開處理
type Mixed interface {
	isMixed()
}

type MixedNo struct{}

func (MixedNo) isMixed() {}

const MixedNoValue = 0

type MixedYes struct{}

func (MixedYes) isMixed() {}

const MixedYesValue = "YES"

// const enum - 在 Go 中與普通 enum 相同
type LogLevel int

const (
	LogLevelDebug LogLevel = iota
	LogLevelInfo
	LogLevelWarning
	LogLevelError
)

// 使用 enum
func Move(direction Direction) string {
	switch direction {
	case DirectionUp:
		return "Moving up"
	case DirectionDown:
		return "Moving down"
	case DirectionLeft:
		return "Moving left"
	case DirectionRight:
		return "Moving right"
	default:
		return "Unknown direction"
	}
}

// Namespace - 在 Go 中使用 package 或 struct 模擬
type Utils struct{}

func (Utils) FormatDate(date string) string {
	return date // 簡化實作
}

func (Utils) ParseDate(str string) string {
	return str // 簡化實作
}

const UtilsVERSION = "1.0.0"

type UtilsConfig struct {
	Debug   bool
	Timeout int
}

type UtilsLogger struct {
	prefix string
}

func NewUtilsLogger(prefix string) *UtilsLogger {
	return &UtilsLogger{prefix: prefix}
}

func (l *UtilsLogger) Log(message string) {
	fmt.Printf("[%s] %s\n", l.prefix, message)
}

// 內部 namespace
type UtilsInternal struct{}

func (UtilsInternal) SecretFunction() string {
	return "internal"
}

// 使用 namespace
var (
	logger  = NewUtilsLogger("App")
	dateStr = Utils{}.FormatDate("")
	config  = UtilsConfig{
		Debug:   true,
		Timeout: 5000,
	}
)

// Namespace 合併 - 在 Go 中直接定義在同一個 package
type MergedNamespaceData struct {
	Id    string
	Value float64
}

func MergedNamespaceCreateData(id string, value float64) MergedNamespaceData {
	return MergedNamespaceData{Id: id, Value: value}
}

type MergedNamespaceDataManager struct {
	data []MergedNamespaceData
}

func NewMergedNamespaceDataManager() *MergedNamespaceDataManager {
	return &MergedNamespaceDataManager{
		data: make([]MergedNamespaceData, 0),
	}
}

func (dm *MergedNamespaceDataManager) Add(item MergedNamespaceData) {
	dm.data = append(dm.data, item)
}

func (dm *MergedNamespaceDataManager) GetAll() []MergedNamespaceData {
	result := make([]MergedNamespaceData, len(dm.data))
	copy(result, dm.data)
	return result
}

// Enum 作為型別
func GetDirectionName(dir Direction) string {
	return dir.String()
}

// Reverse mapping
func GetDirectionValue(name string) (Direction, bool) {
	switch name {
	case "Up":
		return DirectionUp, true
	case "Down":
		return DirectionDown, true
	case "Left":
		return DirectionLeft, true
	case "Right":
		return DirectionRight, true
	default:
		return 0, false
	}
}

// Enum 與 Union type 的結合
func ProcessStatus(status string) {
	fmt.Printf("Processing status: %s\n", status)
}

// Computed enum members - 使用位元運算
type FileAccess int

const (
	FileAccessNone      FileAccess = 0
	FileAccessRead      FileAccess = 1 << 1
	FileAccessWrite     FileAccess = 1 << 2
	FileAccessReadWrite FileAccess = FileAccessRead | FileAccessWrite
	FileAccessAdmin     FileAccess = FileAccessRead | FileAccessWrite | (1 << 3)
)

func HasAccess(current FileAccess, required FileAccess) bool {
	return (current & required) == required
}