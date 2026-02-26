const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" }
});
const path = require('path');

// Указываем серверу отдавать файлы из корня папки
app.use(express.static(path.join(__dirname, './')));

// Базовый маршрут для проверки
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Пользователь подключился');

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg); // Рассылаем всем
  });

  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data); // Рассылаем всем кроме отправителя
  });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился');
  });
});

// Render сам подставит нужный порт в process.env.PORT
const PORT = process.env.PORT || 10000;
http.listen(PORT, '0.0.0.0', () => {
  console.log('Сервер запущен на порту ' + PORT);
});
