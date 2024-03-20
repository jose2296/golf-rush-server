import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
app.use(cors());

app.get('/', (req, res) => {
    res.send('Welcome Golf rush server');
});

let rooms = {};
let users = {}

io.on('connection', (socket) => {

    const updateRoom = (roomName) => {
        const roomPlayers = Object.values(rooms[roomName].players).map(playerSocketId => users[playerSocketId]);
        io.to(roomName).emit('players', roomPlayers);
        updateRooms()
    }

    const updateRooms = () => {
        const _rooms = Object.entries(rooms).map(([roomName, roomData]) => ({
            ...roomData,
            name: roomName,
            playersCount: Object.values(roomData.players).length
        }))
        io.emit('update-rooms', _rooms)
    }

    socket.emit('connected');
    updateRooms();

    socket.on('join-room', ({ roomName }) => {
        users[socket.id] = {
            id: socket.id,
            pos: {x: 0, y: 10, z: 0}
        };
        if (rooms[roomName]) {
            socket.join(roomName);
            rooms = {
                ...rooms,
                [roomName]: {
                    ...rooms[roomName],
                    players: {
                        ...rooms[roomName].players || {},
                        [socket.id]: socket.id
                    }
                }
            }
            updateRoom(roomName);
            return;
        }

        socket.join(roomName);
        console.log('Creating room: ', roomName);
        rooms = {
            ...rooms,
            [roomName]: {
                players: {
                    [socket.id]: socket.id
                }
            }
        };

        updateRoom(roomName);
    });

    socket.on('set-player-data', ({ roomName, userData }) => {
        users[socket.id] = {
            ...users[socket.id],
            userData
        };
        updateRoom(roomName);
    })

    socket.on('update-player', ({ player, roomName }) => {
        users[player.id] = player;

        const roomPlayers = Object.values(rooms[roomName].players).map(playerSocketId => users[playerSocketId]);
        io.to(roomName).emit('players', roomPlayers);
        socket.to(roomName).emit('player', roomPlayers)
    })

    socket.on('disconnect', () => {
        Object.entries(rooms).forEach(([roomKey, usersInRoom]) => {
            if (usersInRoom.players[socket.id]) {
                socket.leave(roomKey)
                delete usersInRoom.players[socket.id];

                const roomPlayers = Object.values(usersInRoom.players).map(playerSocketId => users[playerSocketId]);
                io.to(roomKey).emit('players', roomPlayers);

                updateRoom(roomKey)
            }
        });
    });

    // socket.on('disconnect', (reason, description) => {
    //     console.log(socket.id, 'Disconnected');



    //     io.emit('update-rooms', rooms);
    //     console.log(rooms);
    // })
});

server.listen(3000, () => {
    console.log('srver running at http://localhost:3000');
});

export default app;
