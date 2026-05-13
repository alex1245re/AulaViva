import { io } from 'socket.io-client'

// Normalizar URL: asegurar que siempre tenga protocolo
let SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
if (SERVER_URL && !SERVER_URL.startsWith('http')) {
  SERVER_URL = 'https://' + SERVER_URL
}

const socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
})

export default socket
