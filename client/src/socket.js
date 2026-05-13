import { io } from 'socket.io-client'

// En desarrollo apunta a localhost; en producción define VITE_SERVER_URL en .env
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'

const socket = io(SERVER_URL, { autoConnect: true })

export default socket
