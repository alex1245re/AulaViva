<template>
  <div class="pomodoro-panel">
    <div class="pomodoro-inner">
      <h2>⏱ Pomodoro Grupal</h2>

      <div class="mode-tabs">
        <span :class="{ active: pomo.mode === 'work' }">Trabajo</span>
        <span :class="{ active: pomo.mode === 'break' }">Descanso</span>
        <span :class="{ active: pomo.mode === 'longBreak' }">Descanso largo</span>
      </div>

      <div class="timer-circle" :class="pomo.mode">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" class="track" />
          <circle
            cx="60" cy="60" r="54"
            class="progress"
            :style="{ strokeDashoffset: dashOffset }"
          />
        </svg>
        <div class="timer-text">{{ formattedTime }}</div>
      </div>

      <div class="pomo-controls">
        <button v-if="!pomo.running" class="btn-start" @click="start">▶ Iniciar</button>
        <button v-else class="btn-pause" @click="pause">⏸ Pausar</button>
        <button class="btn-reset" @click="reset">↩ Reiniciar</button>
      </div>

      <div class="pomo-cycles">
        Ciclos completados: <strong>{{ pomo.cycles }}</strong>
      </div>

      <details class="pomo-settings">
        <summary>⚙️ Configuración</summary>
        <div class="settings-form">
          <label>
            Trabajo (min)
            <input type="number" v-model.number="cfg.work" min="1" max="90" />
          </label>
          <label>
            Descanso (min)
            <input type="number" v-model.number="cfg.breakDur" min="1" max="30" />
          </label>
          <label>
            Descanso largo (min)
            <input type="number" v-model.number="cfg.longBreak" min="1" max="60" />
          </label>
          <button @click="applySettings">Aplicar</button>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import socket from '../socket.js'

const pomo = reactive({
  running: false,
  mode: 'work',
  timeLeft: 25 * 60,
  workDuration: 25 * 60,
  breakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  cycles: 0
})

const cfg = reactive({ work: 25, breakDur: 5, longBreak: 15 })

const totalDuration = computed(() => {
  if (pomo.mode === 'work') return pomo.workDuration
  if (pomo.mode === 'break') return pomo.breakDuration
  return pomo.longBreakDuration
})

const dashOffset = computed(() => {
  const circumference = 2 * Math.PI * 54
  const total = totalDuration.value
  if (!total || total <= 0) return 0
  const ratio = Math.min(1, Math.max(0, pomo.timeLeft / total))
  return circumference * (1 - ratio)
})

const formattedTime = computed(() => {
  const m = Math.floor(pomo.timeLeft / 60).toString().padStart(2, '0')
  const s = (pomo.timeLeft % 60).toString().padStart(2, '0')
  return `${m}:${s}`
})

const applyState = (state) => {
  Object.assign(pomo, {
    running: state.running,
    mode: state.mode,
    timeLeft: state.timeLeft,
    workDuration: state.workDuration,
    breakDuration: state.breakDuration,
    longBreakDuration: state.longBreakDuration,
    cycles: state.cycles
  })
}

const start = () => socket.emit('pomodoro:start')
const pause = () => socket.emit('pomodoro:pause')
const reset = () => socket.emit('pomodoro:reset')

const applySettings = () => {
  socket.emit('pomodoro:setDurations', {
    work: cfg.work,
    breakDur: cfg.breakDur,
    longBreak: cfg.longBreak
  })
}

const sendNotification = (state) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const msgs = {
    work:      { title: '⏱ ¡Tiempo de trabajar!', body: `Empieza el bloque de trabajo (${Math.round(state.workDuration / 60)} min)` },
    break:     { title: '☕ ¡Descanso corto!',     body: `Tómate ${Math.round(state.breakDuration / 60)} min de descanso` },
    longBreak: { title: '🛋️ ¡Descanso largo!',    body: `Descansa bien durante ${Math.round(state.longBreakDuration / 60)} min` }
  }
  const { title, body } = msgs[state.mode] || msgs.work
  new Notification(title, { body, icon: '/favicon.ico', silent: false })
}

socket.on('pomodoro:update', applyState)
socket.on('pomodoro:done', (state) => { applyState(state); sendNotification(state) })
socket.on('pomodoro:tick', (timeLeft) => { pomo.timeLeft = timeLeft })
socket.on('room:state', (state) => { if (state.pomodoroState) applyState(state.pomodoroState) })

onMounted(() => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
})

onUnmounted(() => {
  socket.off('pomodoro:update')
  socket.off('pomodoro:done')
  socket.off('pomodoro:tick')
})
</script>
