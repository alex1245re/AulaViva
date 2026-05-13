<template>
  <div class="tasks-panel">

    <!-- Cabecera -->
    <div class="tasks-header">
      <h2>📋 Tareas del grupo</h2>
      <span class="tasks-progress" v-if="tasks.length > 0">
        {{ pendingCount }} pendiente{{ pendingCount !== 1 ? 's' : '' }} · {{ tasks.length }} total
      </span>
    </div>

    <!-- Barra de progreso -->
    <div class="tasks-bar" v-if="tasks.length > 0">
      <div class="tasks-bar-fill" :style="{ width: progressPct + '%' }"></div>
    </div>

    <!-- Formulario de nueva tarea -->
    <div class="task-form">
      <div class="task-input-wrap">
        <input
          v-model="newTask"
          placeholder="Nueva tarea para el grupo..."
          @keydown.enter="addTask"
          maxlength="120"
          autocomplete="off"
          class="task-input"
        />
        <div class="priority-chip-wrap">
          <select v-model="newPriority" class="priority-chip" aria-label="Prioridad">
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
          </select>
          <span class="chip-arrow" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="#e6eef3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </div>
      </div>
      <button class="btn-add" @click="addTask" :disabled="!newTask.trim()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        Añadir
      </button>
    </div>

    <!-- Resumen y acciones globales -->
    <div class="tasks-summary" v-if="tasks.length > 0">
      <button class="btn-clear-done" @click="clearCompleted" :disabled="doneCount === 0">
        Borrar completadas ({{ doneCount }})
      </button>
    </div>

    <!-- Lista de tareas ordenada por prioridad -->
    <div class="tasks-list">
      <div v-if="tasks.length === 0" class="no-tasks">No hay tareas. ¡Añade la primera!</div>
      <div
        v-for="task in sortedTasks"
        :key="task.id"
        class="task-item"
        :class="{ done: task.done, 'priority-flash': flashingId === task.id }"
      >
        <!-- Checkbox custom -->
        <label class="checkbox">
          <input type="checkbox" :checked="task.done" @change="toggleTask(task.id)" />
          <span class="checkbox-custom" aria-hidden="true"></span>
        </label>

        <!-- Contenido: texto + meta + controles prioridad -->
        <div class="task-content">
          <template v-if="task.editing">
            <input
              v-model="task.editText"
              class="edit-input"
              @keydown.enter="saveEdit(task)"
              @keydown.esc="cancelEdit(task)"
            />
          </template>
          <template v-else>
            <p class="task-title">{{ task.text }}</p>
            <p class="task-meta">
              <span class="badge" :class="`badge-${(task.priority || 'Normal').toLowerCase()}`">
                {{ task.priority || 'Normal' }}
              </span>
              <span class="task-author">{{ task.user.avatar }} {{ task.user.name }}</span>
            </p>
            <div class="priority-controls">
              <button
                class="priority-btn low"
                :class="{ active: (task.priority || 'Normal') === 'Low' }"
                @click="changePriority(task, 'Low')"
              >Low</button>
              <button
                class="priority-btn normal"
                :class="{ active: (task.priority || 'Normal') === 'Normal' }"
                @click="changePriority(task, 'Normal')"
              >Normal</button>
              <button
                class="priority-btn high"
                :class="{ active: (task.priority || 'Normal') === 'High' }"
                @click="changePriority(task, 'High')"
              >High</button>
            </div>
          </template>
        </div>

        <!-- Acciones: editar / guardar / eliminar -->
        <div class="task-actions">
          <button v-if="task.editing" class="action-btn save" title="Guardar" @click="saveEdit(task)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button v-else class="action-btn edit" title="Editar" @click="enableEdit(task)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="action-btn delete" title="Eliminar" @click="deleteTask(task.id)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import socket from '../socket.js'

const tasks = ref([])
const newTask = ref('')
const newPriority = ref('Normal')
const flashingId = ref(null)

const priorityOrder = { High: 0, Normal: 1, Low: 2 }

const sortedTasks = computed(() => {
  return [...tasks.value].sort((a, b) => {
    const pa = priorityOrder[a.priority || 'Normal'] ?? 1
    const pb = priorityOrder[b.priority || 'Normal'] ?? 1
    return pa - pb
  })
})

const doneCount    = computed(() => tasks.value.filter(t => t.done).length)
const pendingCount = computed(() => tasks.value.filter(t => !t.done).length)
const progressPct  = computed(() => tasks.value.length ? Math.round(doneCount.value / tasks.value.length * 100) : 0)

// ── Acciones ──────────────────────────────────────────────────────────
const addTask = () => {
  if (!newTask.value.trim()) return
  socket.emit('task:add', { text: newTask.value.trim(), priority: newPriority.value })
  newTask.value = ''
  newPriority.value = 'Normal'
}

const toggleTask = (id) => socket.emit('task:toggle', id)

const deleteTask = (id) => socket.emit('task:delete', id)

const clearCompleted = () => {
  tasks.value.filter(t => t.done).forEach(t => socket.emit('task:delete', t.id))
}

const enableEdit = (task) => {
  task.editing = true
  task.editText = task.text
}

const cancelEdit = (task) => {
  task.editing = false
  task.editText = ''
}

const saveEdit = (task) => {
  if (!task.editText?.trim()) return
  socket.emit('task:edit', { id: task.id, text: task.editText.trim() })
  task.editing = false
}

const changePriority = (task, priority) => {
  socket.emit('task:priority', { id: task.id, priority })
  flashingId.value = task.id
  setTimeout(() => { flashingId.value = null }, 500)
}

// ── Socket events ─────────────────────────────────────────────────────
socket.on('task:new', (task) => tasks.value.push({ ...task, editing: false, editText: '' }))

socket.on('task:updated', (updated) => {
  const i = tasks.value.findIndex(t => t.id === updated.id)
  if (i !== -1) tasks.value[i] = { ...tasks.value[i], ...updated, editing: false }
})

socket.on('task:deleted', (id) => { tasks.value = tasks.value.filter(t => t.id !== id) })

socket.on('room:state', (state) => {
  if (state.tasks) tasks.value = state.tasks.map(t => ({ ...t, editing: false, editText: '' }))
})

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
  gap: 0.85rem;
  overflow: hidden;
}

/* ── Cabecera ── */
.tasks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.tasks-header h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #e2e8f0;
}

.tasks-progress {
  font-size: 0.82rem;
  color: #94a3b8;
  background: #1e293b;
  padding: 0.2rem 0.75rem;
  border-radius: 999px;
}

/* ── Barra ── */
.tasks-bar {
  height: 5px;
  background: #1e293b;
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
}

.tasks-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
  border-radius: 3px;
  transition: width 0.35s ease;
}

/* ── Formulario ── */
.task-form {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.task-input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.task-input {
  width: 100%;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  padding-right: 7.5rem;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
}

.task-input:focus {
  border-color: #6366f1;
}

.priority-chip-wrap {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
}

.priority-chip {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  border: 1px solid rgba(255,255,255,0.07);
  padding: 4px 28px 4px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #e2e8f0;
  cursor: pointer;
  height: 30px;
  outline: none;
}

.priority-chip option { background: #1e293b; color: #e2e8f0; }

.chip-arrow {
  position: absolute;
  right: 8px;
  pointer-events: none;
  display: flex;
  align-items: center;
}

.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #6366f1;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.88rem;
  white-space: nowrap;
  transition: background 0.2s, transform 0.1s;
}

.btn-add:hover:not(:disabled) {
  background: #4f46e5;
  transform: translateY(-1px);
}

.btn-add:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Resumen ── */
.tasks-summary {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.btn-clear-done {
  border: none;
  background: transparent;
  color: #f59e0b;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.18s;
  padding: 0;
}

.btn-clear-done:hover:not(:disabled) {
  color: #fbbf24;
}

.btn-clear-done:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Lista ── */
.tasks-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid #334155;
  border-radius: 10px;
  overflow: hidden;
  background: #1a2233;
}

.no-tasks {
  color: #64748b;
  text-align: center;
  padding: 2.5rem 1rem;
  font-size: 0.92rem;
}

/* ── Item ── */
.task-item {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #334155;
  transition: background 0.15s;
}

.task-item:last-child {
  border-bottom: none;
}

.task-item:hover {
  background: #1e293b;
}

.task-item.done {
  opacity: 0.5;
}

.task-item.done .task-title {
  text-decoration: line-through;
  color: #64748b;
}

@keyframes priorityFlash {
  0%   { background: rgba(99,102,241,0.25); }
  100% { background: transparent; }
}

.task-item.priority-flash {
  animation: priorityFlash 0.5s ease-out;
}

/* ── Checkbox custom ── */
.checkbox {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  margin-top: 2px;
  cursor: pointer;
}

.checkbox input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.checkbox-custom {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: 2px solid #475569;
  background: #1e293b;
  display: inline-block;
  box-sizing: border-box;
  transition: background 0.18s, border-color 0.18s, transform 0.1s;
  position: relative;
}

.checkbox-custom::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 5px;
  height: 10px;
  border: solid transparent;
  border-width: 0 2.5px 2.5px 0;
  transform: rotate(45deg) scale(0);
  transition: transform 0.12s ease-out;
}

.checkbox input:checked + .checkbox-custom {
  background: linear-gradient(135deg, #10b981 0%, #0ea5a6 100%);
  border-color: #10b981;
  transform: scale(0.95);
}

.checkbox input:checked + .checkbox-custom::after {
  border-color: #042f2e;
  transform: rotate(45deg) scale(1);
}

/* ── Contenido de tarea ── */
.task-content {
  flex: 1;
  min-width: 0;
}

.task-title {
  margin: 0;
  font-size: 0.95rem;
  color: #e2e8f0;
  line-height: 1.4;
  word-break: break-word;
}

.task-meta {
  margin: 0.35rem 0 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.badge {
  display: inline-block;
  border-radius: 5px;
  padding: 1px 7px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.badge-low    { background: #0ea5e9; color: #e0f2fe; }
.badge-normal { background: #2563eb; color: #dbeafe; }
.badge-high   { background: #ef4444; color: #fee2e2; }

.task-author {
  font-size: 0.78rem;
  color: #64748b;
}

/* ── Controles de prioridad ── */
.priority-controls {
  display: flex;
  gap: 5px;
  margin-top: 0.45rem;
}

.priority-btn {
  border: 1px solid #334155;
  background: #1e293b;
  color: #94a3b8;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}

.priority-btn:hover { filter: brightness(1.25); }
.priority-btn:active { transform: scale(0.95); }

.priority-btn.low.active    { background: #0ea5e9; border-color: #0ea5e9; color: #082f49; }
.priority-btn.normal.active { background: #2563eb; border-color: #2563eb; color: #dbeafe; }
.priority-btn.high.active   { background: #ef4444; border-color: #ef4444; color: #fee2e2; }

/* ── Input de edición ── */
.edit-input {
  width: 100%;
  background: #0f172a;
  border: 1px solid #6366f1;
  border-radius: 6px;
  padding: 0.4rem 0.7rem;
  color: #e2e8f0;
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
}

/* ── Botones de acción ── */
.task-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
  align-items: flex-start;
  padding-top: 2px;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.3rem;
  border-radius: 6px;
  color: #64748b;
  display: flex;
  align-items: center;
  transition: background 0.15s, color 0.15s;
}

.action-btn.edit:hover  { background: rgba(99,102,241,0.15); color: #818cf8; }
.action-btn.save:hover  { background: rgba(16,185,129,0.15);  color: #34d399; }
.action-btn.delete:hover{ background: rgba(239,68,68,0.15);   color: #f87171; }
</style>
