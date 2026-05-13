<template>
  <div class="lobby">
    <div class="lobby-card">
      <div class="lobby-logo">📚</div>
      <h1>StudyRoom</h1>
      <p class="subtitle">Estudia en equipo, a distancia</p>

      <form @submit.prevent="enter">
        <div class="field">
          <label>Tu nombre</label>
          <input v-model="username" type="text" placeholder="Ej: María García" required autocomplete="off" maxlength="30" />
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
            <button type="button" class="btn-secondary" @click="createRoom" :disabled="!username.trim() || !newRoomName.trim()">
              Crear
            </button>
          </div>
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
              @click="selectedRoom = room.id"
            >
              <span class="room-name">{{ room.name }}</span>
              <span class="room-count">{{ room.userCount }} {{ room.userCount === 1 ? 'persona' : 'personas' }}</span>
            </div>
          </div>
          <button type="submit" class="btn-primary" :disabled="!username.trim() || !selectedRoom">
            Unirse a sala
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { db } from '../firebase.js'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'

const emit = defineEmits(['join'])

const username = ref('')
const avatar = ref('🧑‍💻')
const avatars = ['🧑‍💻', '👩‍💻', '🤓', '🦊', '🐼', '🦁', '🤖', '👻']

const newRoomName = ref('')
const selectedRoom = ref(null)
const activeRooms = ref([])
const loadingRooms = ref(true)

// ── Fallback: polling HTTP si Firestore no está configurado ──────────
let pollingInterval = null

const fetchRoomsHttp = async () => {
  try {
    const res = await fetch('http://localhost:3000/rooms')
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
  if (!username.value.trim() || !newRoomName.value.trim()) return
  const roomId = 'room_' + Date.now()
  emit('join', {
    user: { name: username.value.trim(), avatar: avatar.value },
    roomId,
    roomName: newRoomName.value.trim()
  })
}

const enter = () => {
  if (!username.value.trim() || !selectedRoom.value) return
  const room = activeRooms.value.find(r => r.id === selectedRoom.value)
  emit('join', {
    user: { name: username.value.trim(), avatar: avatar.value },
    roomId: selectedRoom.value,
    roomName: room?.name || selectedRoom.value
  })
}

onMounted(() => {
  if (db) {
    startFirestoreListener()
  } else {
    startPolling()
  }
})

onUnmounted(() => {
  if (firestoreUnsub) firestoreUnsub()
  clearInterval(pollingInterval)
})
</script>
