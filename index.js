require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? [/chrome-extension:\/\/.*/] 
      : '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Store active rooms and their participants with names
const rooms = new Map();
const userNames = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', ({ roomId, userName }) => {
    // Store user's name
    userNames.set(socket.id, userName);

    // Create room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    // Add user to room
    const room = rooms.get(roomId);
    room.add(socket.id);
    socket.join(roomId);    // Notify other users in the room
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userName: userNames.get(socket.id)
    });

    // Send list of existing users to the new participant
    const existingUsers = Array.from(room)
      .filter(id => id !== socket.id)
      .map(id => ({
        userId: id,
        userName: userNames.get(id)
      }));
    socket.emit('existing-users', existingUsers);
  });

  socket.on('offer', (data) => {
    socket.to(data.targetUserId).emit('offer', {
      offer: data.offer,
      userId: socket.id
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.targetUserId).emit('answer', {
      answer: data.answer,
      userId: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.targetUserId).emit('ice-candidate', {
      candidate: data.candidate,
      userId: socket.id
    });
  });

  socket.on('disconnect', () => {
    // Remove user from all rooms
    rooms.forEach((participants, roomId) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        // Notify others in the room
        socket.to(roomId).emit('user-left', socket.id);
        // Clean up empty rooms
        if (participants.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
