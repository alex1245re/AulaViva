<template>
  <!-- Cargando estado de auth -->
  <div v-if="!authReady" class="auth-loading">
    <div class="auth-loading-spinner"></div>
  </div>

  <!-- No autenticado -->
  <AuthScreen v-else-if="!firebaseUser" />

  <!-- LOBBY -->
  <LobbyScreen v-else-if="!inRoom" @join="joinRoom" :firebaseUser="firebaseUser" />

  <!-- SALA DE ESTUDIO -->
  <div v-else class="room-layout">
    <!-- SIDEBAR -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="room-info">
          <span class="room-icon">📚</span>
          <div>
            <div class="room-name">{{ roomInfo.name }}</div>
            <div class="room-id">ID: {{ roomInfo.id }}</div>
          </div>
        </div>
        <button class="btn-leave" @click="leaveRoom" title="Salir">✕</button>
      </div>

      <div class="sidebar-section">
        <h4>Participantes ({{ users.length }})</h4>
        <ul class="user-list">
          <li v-for="u in users" :key="u.id" class="user-item">
            <span class="user-avatar">{{ u.avatar }}</span>
            <span v-if="u.id === roomOwnerId" class="admin-crown" title="Administrador">👑</span>
            <span class="user-name" :class="{ 'you': u.id === mySocketId }">
              {{ u.name }}{{ u.id === mySocketId ? ' (tú)' : '' }}
            </span>
            <div v-if="isAdmin && u.id !== mySocketId" class="admin-user-actions">
              <button class="btn-kick-user" @click="kickUser(u)" title="Expulsar">⊗</button>
              <button class="btn-promote-user" @click="transferTo(u)" title="Transferir admin">👑</button>
            </div>
          </li>
        </ul>
      </div>

      <!-- Navegación de pestañas -->
      <nav class="sidebar-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['nav-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          {{ tab.icon }} {{ tab.label }}
        </button>
      </nav>

      <div class="sidebar-bottom">
        <div class="current-user-info">
          <span class="current-avatar">{{ currentUser.avatar }}</span>
          <span class="current-name">{{ currentUser.name }}</span>
        </div>
        <button class="btn-logout" @click="logout" title="Cerrar sesión">⎋</button>
      </div>
    </aside>

    <!-- PANEL PRINCIPAL -->
    <main class="main-panel">
      <ChatPanel     v-show="activeTab === 'chat'"     :messages="messages"    :currentUser="currentUser" />
      <BoardPanel    v-show="activeTab === 'board'"    :isActive="activeTab === 'board'" />
      <PomodoroPanel v-show="activeTab === 'pomodoro'" />
      <SnippetsPanel v-show="activeTab === 'snippets'" :currentUser="currentUser" />
      <TasksPanel    v-show="activeTab === 'tasks'" />
    </main>
  </div>
  <!-- Toast expulsado -->
  <Transition name="kicked-fade">
    <div v-if="kickedMsg" class="kicked-toast">🚫 {{ kickedMsg }}</div>
  </Transition>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase.js'
import socket from './socket.js'
import AuthScreen from './components/AuthScreen.vue'
import LobbyScreen from './components/LobbyScreen.vue'
import ChatPanel from './components/ChatPanel.vue'
import BoardPanel from './components/BoardPanel.vue'
import PomodoroPanel from './components/PomodoroPanel.vue'
import SnippetsPanel from './components/SnippetsPanel.vue'
import TasksPanel from './components/TasksPanel.vue'

const authReady    = ref(false)
const firebaseUser = ref(null)
const inRoom       = ref(false)
const currentUser  = reactive({ name: '', avatar: '' })
const roomInfo     = reactive({ id: '', name: '' })
const users        = ref([])
const messages     = ref([])
const activeTab    = ref('chat')
const roomOwnerId  = ref('')
const mySocketId   = ref('')
const kickedMsg    = ref('')

const isAdmin = computed(() => !!mySocketId.value && mySocketId.value === roomOwnerId.value)

const tabs = [
  { id: 'chat',     icon: '💬', label: 'Chat' },
  { id: 'board',    icon: '🖌️', label: 'Pizarra' },
  { id: 'pomodoro', icon: '⏱', label: 'Pomodoro' },
  { id: 'snippets', icon: '</>',label: 'Código' },
  { id: 'tasks',    icon: '📋', label: 'Tareas' }
]

const joinRoom = ({ user, roomId, roomName, password }) => {
  currentUser.name = user.name
  currentUser.avatar = user.avatar
  roomInfo.id = roomId
  roomInfo.name = roomName
  socket.emit('join', { user, roomId, roomName, password })
  // inRoom se activa al recibir room:state (el servidor confirma el acceso)
}

const leaveRoom = () => {
  socket.disconnect()
  socket.connect()
  inRoom.value = false
  users.value = []
  messages.value = []
  activeTab.value = 'chat'
  roomOwnerId.value = ''
  mySocketId.value = ''
}

const kickUser   = (u) => socket.emit('room:kick', u.id)
const transferTo = (u) => { if (confirm(`¿Dar la administración a ${u.name}?`)) socket.emit('room:transfer', u.id) }

const logout = async () => {
  leaveRoom()
  await signOut(auth)
}

onMounted(() => {
  // Escuchar cambios de autenticación
  onAuthStateChanged(auth, (user) => {
    firebaseUser.value = user
    authReady.value = true
    // Si el usuario cierra sesión externamente, volver al lobby
    if (!user && inRoom.value) {
      inRoom.value = false
      users.value = []
      messages.value = []
    }
  })

  socket.on('room:state', (state) => {
    users.value = state.users
    messages.value = state.messages
    roomOwnerId.value = state.ownerId || ''
    mySocketId.value = socket.id
    inRoom.value = true
  })

  socket.on('users:update', (u) => { users.value = u })

  socket.on('room:owner', (ownerId) => { roomOwnerId.value = ownerId })

  socket.on('kicked', ({ by }) => {
    leaveRoom()
    kickedMsg.value = `Has sido expulsado de la sala por ${by}`
    setTimeout(() => { kickedMsg.value = '' }, 5000)
  })

  socket.on('chat:message', (msg) => { messages.value.push(msg) })
})
</script>
