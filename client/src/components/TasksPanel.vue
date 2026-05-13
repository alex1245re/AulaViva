<template>
  <div class="tasks-panel">
    <div class="tasks-header">
      <h2>📋 Tareas del grupo</h2>
      <span class="tasks-progress" v-if="tasks.length > 0">
        {{ doneCount }}/{{ tasks.length }} completadas
      </span>
    </div>

    <!-- Barra de progreso -->
    <div class="tasks-bar" v-if="tasks.length > 0">
      <div class="tasks-bar-fill" :style="{ width: progressPct + '%' }"></div>
    </div>

    <!-- Formulario -->
    <div class="task-form">
      <input
        v-model="newTask"
        placeholder="Nueva tarea para el grupo..."
        @keydown.enter="addTask"
        maxlength="120"
        autocomplete="off"
      />
      <button class="btn-primary" @click="addTask" :disabled="!newTask.trim()">Añadir</button>
    </div>

    <!-- Lista -->
    <div class="tasks-list">
      <div v-if="tasks.length === 0" class="no-tasks">No hay tareas. ¡Añade la primera!</div>
      <div
        v-for="task in tasks"
        :key="task.id"
        class="task-item"
        :class="{ done: task.done }"
      >
        <button class="task-check" @click="toggleTask(task.id)" :title="task.done ? 'Marcar pendiente' : 'Marcar completada'">
          {{ task.done ? '✅' : '⬜' }}
        </button>
        <span class="task-text">{{ task.text }}</span>
        <span class="task-author" :title="task.user.name">{{ task.user.avatar }}</span>
        <button class="btn-icon btn-danger-sm" @click="deleteTask(task.id)" title="Eliminar">🗑</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import socket from '../socket.js'

const tasks = ref([])
const newTask = ref('')

const doneCount = computed(() => tasks.value.filter(t => t.done).length)
const progressPct = computed(() => tasks.value.length ? Math.round(doneCount.value / tasks.value.length * 100) : 0)

const addTask = () => {
  if (!newTask.value.trim()) return
  socket.emit('task:add', newTask.value.trim())
  newTask.value = ''
}

const toggleTask = (id) => socket.emit('task:toggle', id)
const deleteTask = (id) => socket.emit('task:delete', id)

socket.on('task:new', (task) => tasks.value.push(task))
socket.on('task:updated', (task) => {
  const i = tasks.value.findIndex(t => t.id === task.id)
  if (i !== -1) tasks.value[i] = task
})
socket.on('task:deleted', (id) => { tasks.value = tasks.value.filter(t => t.id !== id) })
socket.on('room:state', (state) => { if (state.tasks) tasks.value = state.tasks })

onUnmounted(() => {
  socket.off('task:new')
  socket.off('task:updated')
  socket.off('task:deleted')
})
</script>

<style scoped>
.tasks-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem;
  gap: 1rem;
  overflow: hidden;
}

.tasks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.tasks-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #e2e8f0;
}

.tasks-progress {
  font-size: 0.85rem;
  color: #94a3b8;
  background: #1e293b;
  padding: 0.2rem 0.7rem;
  border-radius: 999px;
}

.tasks-bar {
  height: 6px;
  background: #1e293b;
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
}

.tasks-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.task-form {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.task-form input {
  flex: 1;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
}

.task-form input:focus {
  border-color: #6366f1;
}

.btn-primary {
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1.1rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-primary:hover:not(:disabled) {
  background: #4f46e5;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tasks-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.no-tasks {
  color: #64748b;
  text-align: center;
  margin-top: 2rem;
  font-size: 0.95rem;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 0.7rem 0.9rem;
  transition: border-color 0.2s;
}

.task-item:hover {
  border-color: #6366f1;
}

.task-item.done {
  opacity: 0.55;
  border-color: #1e3a2f;
}

.task-item.done .task-text {
  text-decoration: line-through;
  color: #64748b;
}

.task-check {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.task-text {
  flex: 1;
  font-size: 0.9rem;
  color: #cbd5e1;
  word-break: break-word;
}

.task-author {
  font-size: 1rem;
  flex-shrink: 0;
  opacity: 0.7;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.2rem 0.3rem;
  border-radius: 5px;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.btn-danger-sm:hover {
  background: rgba(239, 68, 68, 0.15);
}
</style>
