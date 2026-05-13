<template>
  <div class="lobby">
    <div class="lobby-card">
      <div class="lobby-logo">📚</div>
      <h1>StudyRoom</h1>
      <p class="subtitle">Estudia en equipo, a distancia</p>

      <form @submit.prevent="enter">
        <!-- Usuario autenticado -->
        <div class="field user-greeting">
          <span class="greeting-avatar">{{ avatar }}</span>
          <div class="greeting-info">
            <div class="greeting-name">{{ firebaseUser?.displayName || firebaseUser?.email }}</div>
            <div class="greeting-email">{{ firebaseUser?.email }}</div>
          </div>
          <button type="button" class="btn-logout-lobby" @click="logout" title="Cerrar sesión">⎋</button>
        </div>

        <div class="field">
          <label>Elige tu avatar</label>
          <div class="avatars">
            <label v-for="av in avatars" :key="av" :class="{ selected: avatar === av }">
              <input type="radio" v-model="avatar" :value="av" />
              {{ av }}
            </label>
          </div>
        </div>

        <div class="divider"></div>

        <div class="field">
          <label>Crear nueva sala</label>
          <div class="row">
            <input v-model="newRoomName" type="text" placeholder="Nombre de la sala" maxlength="40" autocomplete="off" />
            <button type="button" class="btn-secondary" @click="createRoom" :disabled="!newRoomName.trim()">
              Crear
            </button>
          </div>
          <input v-model="newRoomPassword" type="password" placeholder="🔒 Contraseña (opcional)" maxlength="40" autocomplete="off" style="margin-top:0.5rem" />
        </div>

        <div class="field">
          <label>O unirse a una sala existente</label>
          <div class="rooms-list">
            <div v-if="loadingRooms" class="loading-rooms">Buscando salas...</div>
            <div v-else-if="activeRooms.length === 0" class="no-rooms">No hay salas activas. ¡Crea una!</div>
            <div
              v-else
              v-for="room in activeRooms"
              :key="room.id"
              class="room-item"
              :class="{ active: selectedRoom === room.id }"
              @click="selectRoom(room)"
            >
              <span class="room-name">{{ room.hasPassword ? '🔒 ' : '' }}{{ room.name }}</span>
              <span class="room-count">{{ room.userCount }} {{ room.userCount === 1 ? 'persona' : 'personas' }}</span>
            </div>
          </div>
          <div v-if="selectedRoomLocked" class="field" style="margin-top:0.5rem">
            <input v-model="joinPassword" type="password" placeholder="Contraseña de la sala" maxlength="40" autocomplete="off" />
          </div>
          <div v-if="joinError" class="join-error">❌ {{ joinError }}</div>
          <button type="submit" class="btn-primary" :disabled="!selectedRoom">
            Unirse a sala
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { db, auth } from '../firebase.js'
import { signOut } from 'firebase/auth'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import socket from '../socket.js'

const props = defineProps({ firebaseUser: Object })
const emit = defineEmits(['join'])

const logout = () => signOut(auth)

const avatar = ref('🧑‍💻')
const avatars = ['🧑‍💻', '👩‍💻', '🤓', '🦊', '🐼', '🦁', '🤖', '👻']

const newRoomName = ref('')
const newRoomPassword = ref('')
const selectedRoom = ref(null)
const joinPassword = ref('')
const joinError = ref('')
const activeRooms = ref([])
const loadingRooms = ref(true)

const selectedRoomLocked = computed(() => {
  const room = activeRooms.value.find(r => r.id === selectedRoom.value)
  return room?.hasPassword || false
})

const selectRoom = (room) => {
  selectedRoom.value = room.id
  joinPassword.value = ''
  joinError.value = ''
}

// ── Fallback: polling HTTP si Firestore no está configurado ──────────
let pollingInterval = null

let SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
if (SERVER_URL && !SERVER_URL.startsWith('http')) SERVER_URL = 'https://' + SERVER_URL

const fetchRoomsHttp = async () => {
  try {
    const res = await fetch(`${SERVER_URL}/rooms`)
    activeRooms.value = await res.json()
  } catch {
    activeRooms.value = []
  } finally {
    loadingRooms.value = false
  }
}

const startPolling = () => {
  fetchRoomsHttp()
  pollingInterval = setInterval(fetchRoomsHttp, 3000)
}

// ── Firestore: listener en tiempo real de salas ──────────────────────
let firestoreUnsub = null

const startFirestoreListener = () => {
  const q = query(collection(db, 'rooms'), orderBy('updatedAt', 'desc'))
  firestoreUnsub = onSnapshot(
    q,
    (snap) => {
      activeRooms.value = snap.docs
        .map(d => d.data())
        .filter(r => r.userCount > 0)
      loadingRooms.value = false
    },
    (err) => {
      console.warn('[Firestore] Error en listener de salas, cambiando a HTTP:', err.message)
      if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null }
      startPolling()
    }
  )
}

// ── Acciones ─────────────────────────────────────────────────────────
const createRoom = () => {
  if (!newRoomName.value.trim()) return
  const name = props.firebaseUser?.displayName || props.firebaseUser?.email || 'Usuario'
  const roomId = 'room_' + Date.now()
  emit('join', {
    user: { name, avatar: avatar.value },
    roomId,
    roomName: newRoomName.value.trim(),
    password: newRoomPassword.value.trim() || undefined
  })
}

const enter = () => {
  if (!selectedRoom.value) return
  joinError.value = ''
  const name = props.firebaseUser?.displayName || props.firebaseUser?.email || 'Usuario'
  const room = activeRooms.value.find(r => r.id === selectedRoom.value)
  emit('join', {
    user: { name, avatar: avatar.value },
    roomId: selectedRoom.value,
    roomName: room?.name || selectedRoom.value,
    password: joinPassword.value.trim() || undefined
  })
}

onMounted(() => {
  // Siempre arranca polling HTTP (funciona aunque Firestore no persista)
  startPolling()
  // Además, si Firestore está disponible, el listener sobreescribe con datos en tiempo real
  if (db) {
    startFirestoreListener()
  }

  socket.on('join:error', (err) => {
    joinError.value = err.message
  })
})

onUnmounted(() => {
  if (firestoreUnsub) firestoreUnsub()
  clearInterval(pollingInterval)
  socket.off('join:error')
})
</script>
