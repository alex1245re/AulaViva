<template>
  <div class="chat-panel">
    <ul class="messages" ref="messagesEl">
      <li
        v-for="(msg, i) in messages"
        :key="i"
        :class="[
          'msg',
          msg.system ? 'msg--system' : '',
          !msg.system && msg.user?.name === currentUser.name ? 'msg--own' : ''
        ]"
      >
        <template v-if="msg.system">
          <span>{{ msg.text }}</span>
        </template>
        <template v-else>
          <div class="msg-avatar">{{ msg.user.avatar }}</div>
          <div class="msg-body">
            <div class="msg-meta">
              <strong>{{ msg.user.name }}</strong>
              <time>{{ formatTime(msg.timestamp) }}</time>
            </div>
            <div class="msg-text">{{ msg.text }}</div>
          </div>
        </template>
      </li>
    </ul>

    <div class="typing-indicator" v-if="typingText">{{ typingText }}</div>

    <form class="chat-form" @submit.prevent="send">
      <input
        v-model="draft"
        @input="onTyping"
        placeholder="Escribe un mensaje..."
        autocomplete="off"
        maxlength="1000"
      />
      <button type="submit">Enviar</button>
    </form>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import socket from '../socket.js'

const props = defineProps({
  messages: Array,
  currentUser: Object
})

const draft = ref('')
const typingText = ref('')
const messagesEl = ref(null)
const typingUsers = new Set()
let typingTimeout = null

const formatTime = (ts) => {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

const scrollBottom = async () => {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}

watch(() => props.messages?.length, scrollBottom)

const send = () => {
  if (!draft.value.trim()) return
  socket.emit('chat:send', draft.value.trim())
  socket.emit('chat:typing', false)
  clearTimeout(typingTimeout)
  draft.value = ''
}

const onTyping = () => {
  socket.emit('chat:typing', true)
  clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => socket.emit('chat:typing', false), 1500)
}

socket.on('chat:typing', ({ user, activo }) => {
  if (activo) typingUsers.add(user.name)
  else typingUsers.delete(user.name)

  if (typingUsers.size === 0) typingText.value = ''
  else if (typingUsers.size === 1) typingText.value = `${[...typingUsers][0]} está escribiendo...`
  else typingText.value = 'Varios usuarios están escribiendo...'
})
</script>
