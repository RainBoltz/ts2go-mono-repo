package main

import "fmt"

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

type Status string

const (
	StatusPending  Status = "PENDING"
	StatusApproved Status = "APPROVED"
	StatusRejected Status = "REJECTED"
)

type Mixed interface {
	isMixed()
}

type MixedNo struct{}

func (MixedNo) isMixed() {}

const MixedNoValue = 0

type MixedYes struct{}

func (MixedYes) isMixed() {}

const MixedYesValue = "YES"

type LogLevel int

const (
	LogLevelDebug LogLevel = iota
	LogLevelInfo
	LogLevelWarning
	LogLevelError
)

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

type Utils struct{}

func (Utils) FormatDate(date string) string {
	return date
}

func (Utils) ParseDate(str string) string {
	return str
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

type UtilsInternal struct{}

func (UtilsInternal) SecretFunction() string {
	return "internal"
}

var (
	logger  = NewUtilsLogger("App")
	dateStr = Utils{}.FormatDate("")
	config  = UtilsConfig{
		Debug:   true,
		Timeout: 5000,
	}
)

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

func GetDirectionName(dir Direction) string {
	return dir.String()
}

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

func ProcessStatus(status string) {
	fmt.Printf("Processing status: %s\n", status)
}

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