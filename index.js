const express = require('express')
const app = express()
const path = require('path')
const http = require('http')

// Create a new socketio server
const socketio = require('socket.io')
const server = http.createServer(app)
const io = socketio(server)

io.on("connection", function (socket) {
    socket.on("send-location", function (data) {
        // Èe je poslano polje points, ga posreduj naprej
        if (Array.isArray(data.points)) {
            io.emit("receive-location", { id: socket.id, points: data.points });
        } else {
            // Za nazaj združljivost (ena toèka)
            io.emit("receive-location", { id: socket.id, ...data });
        }
    });

    socket.on("disconnect", function () {
        io.emit("user-disconnect", { id: socket.id });
    });
})

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')))


app.get("/", (req, res) => {
    res.render("index")
})

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000')
})