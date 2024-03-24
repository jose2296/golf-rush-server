import { instrument } from '@socket.io/admin-ui';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import parser from 'socket.io-msgpack-parser';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    parser,
    cors: {
        origin: '*',
        methods: ["GET", "POST"]
    }
});
app.use(cors());
// app.use(express.static('./node_modules/@socket.io/admin-ui/ui/dist'))

app.get('/', (req, res) => {
    res.send('Welcome Golf rush server');
});

let rooms = {};
let users = {}

io.on('connection', (socket) => {

    const updateRoom = (roomName) => {
        const roomPlayers = Object.values(rooms[roomName].players).map(playerSocketId => users[playerSocketId]);
        io.to(roomName).emit('players', roomPlayers);
        io.to(roomName).emit('update-room', rooms[roomName]);
        updateRooms()
    }

    const updateRooms = () => {
        const newRooms = Object.entries(rooms).map(([roomName, roomData]) => {
            rooms[roomName] = {
                ...roomData,
                playersCount: Object.values(roomData.players).length
            };

            return rooms[roomName];
        });

        io.emit('update-rooms', newRooms)
    }

    const createRoom = (roomName, players) => {
        console.log('Creating room: ', roomName);
        if (rooms[roomName]) {
            console.error('Room exist with the same name:', roomName);
            return;
        }

        rooms = {
            ...rooms,
            [roomName]: {
                name: roomName,
                winner: null,   
                status: 'lobby',
                admin: socket.id,
                playersCount: 1,
                players
            }
        };

        updateRoom(roomName);
    }

    socket.emit('connected');
    updateRooms();

    socket.on('player-hole', ({ playerHole, roomName, time, timeFormated }) => {
        // TODO: Alternative to avoid finding later the winner by holedTime
        rooms[roomName].winner = rooms[roomName].winner || socket.id
        users[playerHole].holed = true;
        users[playerHole].holedTime = new Date();
        users[playerHole].time = time;
        users[playerHole].timeFormated = timeFormated;
        
        console.log(users[playerHole]);
        const roomPlayers = Object.values(rooms[roomName].players).map(playerSocketId => users[playerSocketId]);
        io.to(roomName).emit('players', roomPlayers)
        
        const isHoleFinished = Object.values(rooms[roomName].players).every(playerSocketId => users[playerSocketId].holed);
        
        if (isHoleFinished) {
            // io.to(roomName).emit('finish-hole', roomPlayers);
            // const firstPlayerFinished = roomPlayers.reduce((acc, player) => {
            //     if (!acc || player.holedTime < acc.holedTime ) {
            //         return player;
            //     }
                
            //     return acc;
            // });

            rooms[roomName].status = 'finished';
            io.to(roomName).emit('update-room', rooms[roomName]);
        }
    });

    socket.on('restart-room', ({ roomName }) => {
        rooms[roomName].winner = null;
        rooms[roomName].status = 'start';
        const roomPlayers = Object.values(rooms[roomName].players).map(playerSocketId => {
            users[playerSocketId] = {
                ...users[playerSocketId],
                pos: {x: 0, y: 10, z: 0},
                holed: false,
                holedTime: null,
                strokes: 0
            };

            return users[playerSocketId];
        });
        
        io.to(roomName).emit('update-room', rooms[roomName]);
        io.to(roomName).emit('players', roomPlayers);
    })

    socket.on('start', ({ roomName }) => {
        rooms[roomName].status = 'start';
        io.to(roomName).emit('update-room', rooms[roomName]);
    })

    socket.on('update-player-strokes', ({ roomName }) => {
        users[socket.id].strokes = users[socket.id].strokes + 1; 

        const roomPlayers = Object.values(rooms[roomName].players).map(playerSocketId => users[playerSocketId]);
        io.to(roomName).emit('players', roomPlayers)
    })

    socket.on('join-room', ({ roomName }) => {
        users[socket.id] = {
            id: socket.id,
            pos: {x: 0, y: 10, z: 0},
            holed: false,
            holedTime: null,
            strokes: 0
        };
        if (rooms[roomName]) {
            socket.join(roomName);
            rooms = {
                ...rooms,
                [roomName]: {
                    ...rooms[roomName],
                    admin: rooms[roomName].admin || socket.id,
                    playersCount: Object.values(rooms[roomName]).length + 1,
                    players: {
                        ...rooms[roomName].players || {},
                        [socket.id]: socket.id
                    }
                }
            }

            const players = {
                [socket.id]: socket.id
            }
            updateRoom(roomName, players);
            return;
        }

        socket.join(roomName);
        const players = {
            [socket.id]: socket.id
        }
        createRoom(roomName, players);
    });

    socket.on('create-room', ({ roomName }) => {
        createRoom(roomName, {});
    }); 

    socket.on('set-player-data', ({ roomName, userData }) => {
        users[socket.id] = {
            ...users[socket.id],
            userData
        };
        updateRoom(roomName);
    })

    socket.on('update-player', ({ position, roomName }) => {
        users[socket.id].pos = position;

        const roomPlayers = Object.values(rooms[roomName].players).map(playerSocketId => users[playerSocketId]);
        io.to(roomName).emit('players', roomPlayers)
    })

    socket.on('disconnect', () => {
        delete users[socket.id];

        console.log(socket.id);

        Object.entries(rooms).forEach(([roomKey, usersInRoom]) => {
            if (usersInRoom.players[socket.id]) {
                socket.leave(roomKey)
                delete usersInRoom.players[socket.id];
                const nextAdminUser = Object.values(usersInRoom.players)[0]
                rooms[roomKey].admin = nextAdminUser || null;
                
                const roomPlayers = Object.values(usersInRoom.players).map(playerSocketId => users[playerSocketId]);
                io.to(roomKey).emit('players', roomPlayers);

                updateRoom(roomKey);
                if (!nextAdminUser) {
                    delete rooms[roomKey];
                }
            }
        });

        updateRooms();
    });

    // socket.on('disconnect', (reason, description) => {
    //     console.log(socket.id, 'Disconnected');



    //     io.emit('update-rooms', rooms);
    //     console.log(rooms);
    // })
});

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
});

// instrument(io, {
//     auth: false,
//     mode: "development",
// });

export default app;
