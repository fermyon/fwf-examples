package repository

import (
	"encoding/json"
	"fmt"

	"github.com/fermyon/spin/sdk/go/v2/kv"
	"github.com/google/uuid"
)

type Todo struct {
	Id        string `json:"id"`
	Content   string `json:"content"`
	Completed bool   `json:"completed"`
}

func newTodo(content string) Todo {
	return Todo{
		Id:        uuid.NewString(),
		Content:   content,
		Completed: false,
	}
}

func GetAllTodos() ([]Todo, error) {
	return loadTodos()
}

func AddTodo(content string) (*Todo, error) {
	if len(content) == 0 {
		return nil, fmt.Errorf("content for new Todo can't be empty")
	}
	t := newTodo(content)
	todos, err := loadTodos()
	if err != nil {
		return nil, fmt.Errorf("error loading todos")
	}
	todos = append(todos, t)
	err = saveTodos(todos)
	if err != nil {
		return nil, fmt.Errorf("error storing todos")
	}
	return &t, nil
}

func UpdateTodo(id string, content string) (*Todo, error) {
	todos, err := loadTodos()
	if err != nil {
		return nil, fmt.Errorf("error loading todos")
	}
	var updatedTodo *Todo
	for i := range todos {
		if todos[i].Id == id {
			todos[i].Content = content
			updatedTodo = &todos[i]
			break
		}
	}
	if updatedTodo == nil {
		return nil, nil
	}
	err = saveTodos(todos)
	if err != nil {
		return nil, fmt.Errorf("error storing todos")
	}
	return updatedTodo, nil
}

func DeleteTodoById(id string) (bool, error) {
	todos, err := loadTodos()
	if err != nil {
		return false, fmt.Errorf("error loading todos")
	}
	found := false
	remainingTodos := make([]Todo, 0, len(todos))
	for _, todo := range todos {
		if todo.Id == id {
			found = true
			continue
		}
		remainingTodos = append(remainingTodos, todo)
	}
	if !found {
		return false, nil
	}
	err = saveTodos(remainingTodos)
	if err != nil {
		return false, fmt.Errorf("error storing todos")
	}
	return true, nil
}

func ToggleTodoById(id string) (*Todo, error) {
	todos, err := loadTodos()
	if err != nil {
		return nil, fmt.Errorf("error loading todos")
	}
	var toggledTodo *Todo
	for i := range todos {
		if todos[i].Id == id {
			todos[i].Completed = !todos[i].Completed
			toggledTodo = &todos[i]
			break
		}
	}
	if toggledTodo == nil {
		return nil, nil
	}
	err = saveTodos(todos)
	if err != nil {
		return nil, fmt.Errorf("error storing todos")
	}
	return toggledTodo, nil
}

func loadTodos() ([]Todo, error) {
	todos := make([]Todo, 0)
	store, err := kv.OpenStore("default")
	if err != nil {
		return todos, err
	}
	exists, err := store.Exists("all_todos")
	if err != nil {
		return todos, err
	}
	if !exists {
		return todos, nil
	}
	raw, err := store.Get("all_todos")
	if err != nil {
		return todos, err
	}
	err = json.Unmarshal(raw, &todos)
	if err != nil {
		return todos, err
	}
	return todos, nil
}

func saveTodos(todos []Todo) error {
	store, err := kv.OpenStore("default")
	if err != nil {
		return err
	}
	b, err := json.Marshal(todos)
	if err != nil {
		return err
	}
	err = store.Set("all_todos", b)
	return err
}

func DeleteAllCompletedTodos() ([]Todo, error) {
	all, err := loadTodos()
	if err != nil {
		return all, err
	}
	remainingTodos := make([]Todo, 0, len(all))
	for _, task := range all {
		if !task.Completed {
			remainingTodos = append(remainingTodos, task)
		}
	}
	if err := saveTodos(remainingTodos); err != nil {
		return remainingTodos, err
	}
	return remainingTodos, nil
}
