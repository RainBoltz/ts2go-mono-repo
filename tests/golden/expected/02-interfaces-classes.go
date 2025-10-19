package main

import (
	"fmt"
	"time"
)

type User struct {
	Id        string
	Name      string
	Email     *string
	CreatedAt time.Time
}

type Admin struct {
	User
	Role        string
	Permissions []string
}

type Dictionary map[string]interface{}

type UserImpl struct {
	Id        string
	Name      string
	Email     *string
	CreatedAt time.Time
}

func NewUserImpl(id string, name string, email *string) *UserImpl {
	return &UserImpl{
		Id:        id,
		Name:      name,
		Email:     email,
		CreatedAt: time.Now(),
	}
}

func (u *UserImpl) Greet() string {
	return fmt.Sprintf("Hello, I'm %s", u.Name)
}

type AdminUser struct {
	UserImpl
	Role        string
	Permissions []string
}

func NewAdminUser(id string, name string, email string, permissions []string) *AdminUser {
	emailPtr := &email
	return &AdminUser{
		UserImpl:    *NewUserImpl(id, name, emailPtr),
		Role:        "admin",
		Permissions: permissions,
	}
}

func (a *AdminUser) HasPermission(permission string) bool {
	for _, p := range a.Permissions {
		if p == permission {
			return true
		}
	}
	return false
}

type Counter struct {
	count int
}

var counterInstance *Counter

func GetCounterInstance() *Counter {
	if counterInstance == nil {
		counterInstance = &Counter{count: 0}
	}
	return counterInstance
}

func (c *Counter) Increment() int {
	c.count++
	return c.count
}

func (c *Counter) GetCount() int {
	return c.count
}