const express = require('express');
const { Server } = require('socket.io');
const { createServer } = require('node:http');
const cors = require('cors');
const { db } = require('./firebaseAdmin');

// Helper: guarda en Firestore sin bloquear ni romper si no está disponible
const fsSet    = (ref, data, opts) => db ? ref.set(data, opts || {}).catch(e => console.error('[Firestore]', e.message)) : null;
const fsAdd    = (ref, data)       => db ? ref.add(data).catch(e => console.error('[Firestore]', e.message)) : null;
const fsDel    = (ref)             => db ? ref.delete().catch(e => console.error('[Firestore]', e.message)) : null;
// Usar set+merge en vez de update para no fallar si el doc no existe todavía
const fsUpdate = (ref, data)      => db ? ref.set(data, { merge: true }).catch(e => console.error('[Firestore]', e.message)) : null;

const app = express();
const port = process.env.PORT || 3000;

// En producción solo acepta peticiones desde el dominio de Firebase Hosting
const allowedOrigins = process.env.CLIENT_ORIGIN
    ? [process.env.CLIENT_ORIGIN]
    : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST'] }));
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST']
    }
});

// Salas de estudio: { roomId: { name, users: [], messages: [], boardStrokes: [], pomodoroState, codeSnippets: [] } }
const rooms = {};

// Estado por sala del Pomodoro
const defaultPomodoroState = () => ({
    running: false,
    mode: 'work',       // 'work' | 'break' | 'longBreak'
    timeLeft: 25 * 60, // segundos
    workDuration: 25 * 60,
    breakDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    cycles: 0,
    intervalOwner: null
});

function getOrCreateRoom(roomId, roomName) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            id: roomId,
            name: roomName || roomId,
            users: [],
            messages: [],
            boardStrokes: [],
            pomodoroState: defaultPomodoroState(),
            codeSnippets: [],
            tasks: [],
            password: null
        };
    }
    return rooms[roomId];
}

io.on('connection', (socket) => {

    // Helper: devuelve la sala o null; evita crashes si el socket emite
    // eventos después de que la sala fue eliminada.
    const getRoom = () => {
        if (!socket.user || !socket.roomId) return null;
        return rooms[socket.roomId] || null;
    };

    // ---------- UNIRSE A SALA ----------
    socket.on('join', async ({ user, roomId, roomName, password }) => {
        // Validar contraseña si la sala ya existe y está protegida
        if (rooms[roomId] && rooms[roomId].password) {
            if (rooms[roomId].password !== password) {
                socket.emit('join:error', { message: 'Contraseña incorrecta' });
                return;
            }
        }

        socket.user = { ...user, id: socket.id };
        socket.roomId = roomId;

        const isNewRoom = !rooms[roomId];
        const room = getOrCreateRoom(roomId, roomName);

        // Guardar contraseña y asignar propietario al crear la sala
        if (isNewRoom && password) {
            room.password = password;
        }
        if (isNewRoom) {
            room.ownerId = socket.id;
        }

        // Si la sala es nueva en memoria, cargar datos persistidos de Firestore
        if (isNewRoom && db) {
            try {
                const [msgsSnap, snipsSnap, tasksSnap] = await Promise.all([
                    db.collection('rooms').doc(roomId)
                      .collection('messages').orderBy('timestamp').limit(100).get(),
                    db.collection('rooms').doc(roomId)
                      .collection('snippets').orderBy('timestamp', 'desc').limit(20).get(),
                    db.collection('rooms').doc(roomId)
                      .collection('tasks').orderBy('timestamp').get()
                ]);
                room.messages    = msgsSnap.docs.map(d => d.data());
                room.codeSnippets = snipsSnap.docs.map(d => d.data());
                room.tasks        = tasksSnap.docs.map(d => d.data());
            } catch (e) {
                console.error('[Firestore] Error cargando sala:', e.message);
            }
        }

        // Evitar duplicados al reconectar
        room.users = room.users.filter(u => u.id !== socket.id);
        room.users.push(socket.user);

        socket.join(roomId);

        // Persistir/actualizar sala en Firestore
        fsSet(db && db.collection('rooms').doc(roomId), {
            id: roomId,
            name: room.name,
            userCount: room.users.length,
            hasPassword: !!room.password,
            updatedAt: Date.now()
        }, { merge: true });

        // Enviar estado actual al usuario que entra
        socket.emit('room:state', {
            messages: room.messages,
            users: room.users,
            boardStrokes: room.boardStrokes,
            pomodoroState: room.pomodoroState,
            codeSnippets: room.codeSnippets,
            tasks: room.tasks,
            room: { id: room.id, name: room.name },
            ownerId: room.ownerId
        });

        // Avisar a todos de la sala
        io.to(roomId).emit('users:update', room.users);
        io.to(roomId).emit('room:owner', room.ownerId);
        io.to(roomId).emit('chat:message', {
            system: true,
            text: `${socket.user.name} se ha unido a la sala`
        });
    });

    // ---------- ADMINISTRACIÓN DE SALA ----------
    socket.on('room:kick', (targetId) => {
        const room = getRoom(); if (!room) return;
        if (room.ownerId !== socket.id) return; // solo el owner
        const targetSocket = io.sockets.sockets.get(targetId);
        if (!targetSocket || targetSocket.roomId !== socket.roomId) return;
        const targetName = targetSocket.user?.name || 'Usuario';
        targetSocket.emit('kicked', { by: socket.user.name });
        targetSocket.leave(socket.roomId);
        room.users = room.users.filter(u => u.id !== targetId);
        targetSocket.user = null;
        targetSocket.roomId = null;
        io.to(socket.roomId).emit('users:update', room.users);
        io.to(socket.roomId).emit('chat:message', {
            system: true,
            text: `${targetName} fue expulsado de la sala por ${socket.user.name}`
        });
        fsUpdate(db && db.collection('rooms').doc(socket.roomId), {
            userCount: room.users.length,
            updatedAt: Date.now()
        });
    });

    socket.on('room:transfer', (targetId) => {
        const room = getRoom(); if (!room) return;
        if (room.ownerId !== socket.id) return;
        const target = room.users.find(u => u.id === targetId);
        if (!target) return;
        room.ownerId = targetId;
        io.to(socket.roomId).emit('room:owner', room.ownerId);
        io.to(socket.roomId).emit('chat:message', {
            system: true,
            text: `${socket.user.name} ha transferido la administración a ${target.name}`
        });
    });

    // ---------- CHAT ----------
    socket.on('chat:send', (text) => {
        const room = getRoom(); if (!room) return;
        const msg = {
            system: false,
            user: socket.user,
            text,
            timestamp: Date.now()
        };
        room.messages.push(msg);
        io.to(socket.roomId).emit('chat:message', msg);
        // Persistir mensaje en Firestore
        fsAdd(db && db.collection('rooms').doc(socket.roomId).collection('messages'), msg);
    });

    socket.on('chat:typing', (activo) => {
        if (!getRoom()) return;
        socket.to(socket.roomId).emit('chat:typing', { user: socket.user, activo });
    });

    // ---------- PIZARRA ----------
    socket.on('board:draw', (stroke) => {
        const room = getRoom(); if (!room) return;
        // Guardar el userId en el trazo para que el undo sea por usuario
        room.boardStrokes.push({ ...stroke, userId: socket.id });
        socket.to(socket.roomId).emit('board:draw', stroke);
    });

    socket.on('board:clear', () => {
        const room = getRoom(); if (!room) return;
        room.boardStrokes = [];
        io.to(socket.roomId).emit('board:clear');
    });

    socket.on('board:undo', () => {
        const room = getRoom(); if (!room) return;
        const strokes = room.boardStrokes;
        // Buscar el último strokeId que pertenece a este usuario
        let lastStrokeId = null;
        for (let i = strokes.length - 1; i >= 0; i--) {
            if (strokes[i].userId === socket.id) {
                lastStrokeId = strokes[i].strokeId;
                break;
            }
        }
        if (lastStrokeId !== null) {
            room.boardStrokes = strokes.filter(s => s.strokeId !== lastStrokeId);
            io.to(socket.roomId).emit('board:sync', room.boardStrokes);
        }
    });

    // ---------- POMODORO ----------
    socket.on('pomodoro:start', () => {
        const room = getRoom(); if (!room) return;
        const pomo = room.pomodoroState;
        if (pomo.running) return;

        pomo.running = true;
        pomo.intervalOwner = socket.id;
        io.to(socket.roomId).emit('pomodoro:update', serializePomo(pomo));

        const roomId = socket.roomId;
        const tick = setInterval(() => {
            const r = rooms[roomId];
            if (!r) { clearInterval(tick); return; }
            const p = r.pomodoroState;
            if (!p.running) { clearInterval(tick); return; }

            p.timeLeft -= 1;
            io.to(roomId).emit('pomodoro:tick', p.timeLeft);

            if (p.timeLeft <= 0) {
                clearInterval(tick);
                p._interval = null;
                p.running = false;
                p.cycles += p.mode === 'work' ? 1 : 0;

                if (p.mode === 'work') {
                    p.mode = p.cycles % 4 === 0 ? 'longBreak' : 'break';
                    p.timeLeft = p.mode === 'longBreak' ? p.longBreakDuration : p.breakDuration;
                } else {
                    p.mode = 'work';
                    p.timeLeft = p.workDuration;
                }
                io.to(roomId).emit('pomodoro:done', serializePomo(p));
            }
        }, 1000);

        pomo._interval = tick;
    });

    socket.on('pomodoro:pause', () => {
        const room = getRoom(); if (!room) return;
        const pomo = room.pomodoroState;
        pomo.running = false;
        if (pomo._interval) { clearInterval(pomo._interval); pomo._interval = null; }
        io.to(socket.roomId).emit('pomodoro:update', serializePomo(pomo));
    });

    socket.on('pomodoro:reset', () => {
        const room = getRoom(); if (!room) return;
        if (room.pomodoroState._interval) clearInterval(room.pomodoroState._interval);
        room.pomodoroState = defaultPomodoroState();
        io.to(socket.roomId).emit('pomodoro:update', serializePomo(room.pomodoroState));
    });

    socket.on('pomodoro:setDurations', ({ work, breakDur, longBreak }) => {
        const room = getRoom(); if (!room) return;
        const pomo = room.pomodoroState;

        // Pausar antes de cambiar duraciones para evitar estados inconsistentes
        if (pomo.running) {
            pomo.running = false;
            if (pomo._interval) { clearInterval(pomo._interval); pomo._interval = null; }
        }

        // Validar y aplicar (mínimo 1 min, máximo 90 min)
        const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.floor(v)));
        if (work)     pomo.workDuration      = clamp(work,     1, 90) * 60;
        if (breakDur) pomo.breakDuration     = clamp(breakDur, 1, 30) * 60;
        if (longBreak) pomo.longBreakDuration = clamp(longBreak, 1, 60) * 60;

        // Resetear al inicio del modo trabajo con la nueva duración
        pomo.mode = 'work';
        pomo.timeLeft = pomo.workDuration;

        io.to(socket.roomId).emit('pomodoro:update', serializePomo(pomo));
    });

    // ---------- FRAGMENTOS DE CÓDIGO ----------
    socket.on('snippet:share', ({ title, code, language }) => {
        const room = getRoom(); if (!room) return;
        const snippet = {
            id: Date.now().toString(),
            title,
            code,
            language,
            user: socket.user,
            timestamp: Date.now()
        };
        room.codeSnippets.unshift(snippet);
        if (room.codeSnippets.length > 20) room.codeSnippets.pop();
        io.to(socket.roomId).emit('snippet:new', snippet);
        // Persistir snippet en Firestore
        fsSet(db && db.collection('rooms').doc(socket.roomId).collection('snippets').doc(snippet.id), snippet);
    });

    socket.on('snippet:delete', (snippetId) => {
        const room = getRoom(); if (!room) return;
        room.codeSnippets = room.codeSnippets.filter(s => s.id !== snippetId);
        io.to(socket.roomId).emit('snippet:deleted', snippetId);
        // Eliminar de Firestore
        fsDel(db && db.collection('rooms').doc(socket.roomId).collection('snippets').doc(snippetId));
    });

    // ---------- TAREAS ----------
    socket.on('task:add', ({ text, priority } = {}) => {
        const room = getRoom(); if (!room) return;
        const validPriority = ['High', 'Normal', 'Low'].includes(priority) ? priority : 'Normal';
        const task = {
            id: Date.now().toString(),
            text: (text || '').slice(0, 120),
            done: false,
            priority: validPriority,
            user: socket.user,
            timestamp: Date.now()
        };
        room.tasks.push(task);
        io.to(socket.roomId).emit('task:new', task);
        fsSet(db && db.collection('rooms').doc(socket.roomId).collection('tasks').doc(task.id), task);
    });

    socket.on('task:toggle', (taskId) => {
        const room = getRoom(); if (!room) return;
        const task = room.tasks.find(t => t.id === taskId);
        if (!task) return;
        task.done = !task.done;
        io.to(socket.roomId).emit('task:updated', { ...task });
        fsUpdate(db && db.collection('rooms').doc(socket.roomId).collection('tasks').doc(taskId), { done: task.done });
    });

    socket.on('task:edit', ({ id, text }) => {
        const room = getRoom(); if (!room) return;
        const task = room.tasks.find(t => t.id === id);
        if (!task) return;
        task.text = (text || '').slice(0, 120);
        io.to(socket.roomId).emit('task:updated', { ...task });
        fsUpdate(db && db.collection('rooms').doc(socket.roomId).collection('tasks').doc(id), { text: task.text });
    });

    socket.on('task:priority', ({ id, priority }) => {
        const room = getRoom(); if (!room) return;
        const task = room.tasks.find(t => t.id === id);
        if (!task) return;
        const validPriority = ['High', 'Normal', 'Low'].includes(priority) ? priority : 'Normal';
        task.priority = validPriority;
        io.to(socket.roomId).emit('task:updated', { ...task });
        fsUpdate(db && db.collection('rooms').doc(socket.roomId).collection('tasks').doc(id), { priority: validPriority });
    });

    socket.on('task:delete', (taskId) => {
        const room = getRoom(); if (!room) return;
        room.tasks = room.tasks.filter(t => t.id !== taskId);
        io.to(socket.roomId).emit('task:deleted', taskId);
        fsDel(db && db.collection('rooms').doc(socket.roomId).collection('tasks').doc(taskId));
    });

    // ---------- DESCONEXIÓN ----------
    socket.on('disconnect', () => {
        if (!socket.user || !socket.roomId) return;
        const room = rooms[socket.roomId];
        if (!room) return;

        room.users = room.users.filter(u => u.id !== socket.id);

        // Si el admin se fue, transferir al siguiente usuario
        if (room.ownerId === socket.id && room.users.length > 0) {
            room.ownerId = room.users[0].id;
            io.to(socket.roomId).emit('room:owner', room.ownerId);
            io.to(socket.roomId).emit('chat:message', {
                system: true,
                text: `${room.users[0].name} es ahora el administrador de la sala`
            });
        }

        io.to(socket.roomId).emit('users:update', room.users);
        io.to(socket.roomId).emit('chat:message', {
            system: true,
            text: `${socket.user.name} ha salido de la sala`
        });

        // Actualizar contador en Firestore
        fsUpdate(db && db.collection('rooms').doc(socket.roomId), {
            userCount: room.users.length,
            updatedAt: Date.now()
        });

        if (room.users.length === 0) {
            if (room.pomodoroState._interval) clearInterval(room.pomodoroState._interval);
            delete rooms[socket.roomId];
        }
    });
});

// Serializar estado del Pomodoro sin incluir el objeto Timeout (_interval)
function serializePomo(p) {
    return {
        running: p.running,
        mode: p.mode,
        timeLeft: p.timeLeft,
        workDuration: p.workDuration,
        breakDuration: p.breakDuration,
        longBreakDuration: p.longBreakDuration,
        cycles: p.cycles
    };
}

// Endpoint para listar salas activas
app.get('/rooms', (req, res) => {
    const activeRooms = Object.values(rooms).map(r => ({
        id: r.id,
        name: r.name,
        userCount: r.users.length,
        hasPassword: !!r.password
    }));
    res.json(activeRooms);
});

// Evitar que el servidor se caiga por excepciones no capturadas
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
});

server.listen(port, () => {
    console.log(`Servidor StudyRoom en puerto ${port}`);
});

