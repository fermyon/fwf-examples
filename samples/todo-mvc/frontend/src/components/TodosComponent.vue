<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';

import TodoFooter from './TodoFooter.vue';
import TodoHeader from './TodoHeader.vue';
import TodoItem from './TodoItem.vue';

const todos = ref([]);
const route = useRoute();

const filters = {
    all: (todos) => todos,
    active: (todos) => todos.value.filter((todo) => !todo.completed),
    completed: (todos) => todos.value.filter((todo) => todo.completed),
};

const activeTodos = computed(() => filters.active(todos));
const completedTodos = computed(() => filters.completed(todos));
const filteredTodos = computed(() => {
    switch(route.name) {
        case "active":
            return activeTodos;
        case "completed":
            return completedTodos;
        default:
            return todos;
    }
});

const toggleAllModel = computed({
    get() {
        return activeTodos.value.length === 0;
    },
    set(value) {
        todos.value.forEach((todo) => {
            todo.completed = value;
        });
    },
});



async function addTodo(value) {

    const response = await fetch("/api/todos", {
        method: "POST",
        body: JSON.stringify({
            content: value
        })
    })
    if (response.ok) {
        const newTask = await response.json()
        todos.value.push(newTask)
    }
}

async function deleteTodo(todo) {
    const response = await fetch(`/api/todos/${todo.id}`, {
        method: "DELETE"
    });
    if (response.ok) {
        todos.value = todos.value.filter((t) => t !== todo);
    }
}

async function toggleTodo(todo, value) {
    const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'POST'
    })
    if (response.ok) {
        const updatedTodo = await response.json();
        todo.completed = updatedTodo.completed
    }
};

async function editTodo(todo, value) {
    const response = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        body: JSON.stringify({
            content: value
        })
    });
    if (response.ok){
        const updated = await response.json();
        todo.content = updated.content;
    }
    
}

async function deleteCompleted() {

    const response = await fetch('/api/todos', {
        method: "DELETE"
    })
    if (response.ok) {
        todos.value = await response.json();
    }
}

onMounted(async () => {
  const response = await fetch("/api/todos")
  if (response.ok) {
    todos.value = await response.json()
  }
})

</script>

<template>
    <TodoHeader @add-todo="addTodo" />
    <main class="main" v-show="todos.length > 0">
        <div class="toggle-all-container">
            <input type="checkbox" id="toggle-all-input" class="toggle-all" v-model="toggleAllModel" :disabled="filteredTodos.value.length === 0"/>
            <label class="toggle-all-label" htmlFor="toggle-all-input"> Toggle All Input </label>
        </div>
        <ul class="todo-list">
            <TodoItem v-for="(todo, index) in filteredTodos.value" :key="todo.id" :todo="todo" :index="index"
                @delete-todo="deleteTodo" @edit-todo="editTodo" @toggle-todo="toggleTodo" />
        </ul>
    </main>
    <TodoFooter :todos="todos" @delete-completed="deleteCompleted" />
</template>