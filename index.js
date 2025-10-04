const express = require('express')
const app = express()
const path = require('path')
const http = require('http')
const { Parser } = require('json2csv');

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
app.use(express.json());

app.get("/", (req, res) => {
    res.render("index")
})

app.post('/save-csv', (req, res) => {
    const points = req.body.points || [];
    if (!Array.isArray(points) || points.length === 0) {
        return res.status(400).send('Ni podatkov za shranjevanje.');
    }
    const fields = ['name', 'latitude', 'longitude'];
    const opts = { fields, delimiter: ',' }; // <-- vejica kot loèilo
    try {
        const parser = new Parser(opts);
        const csv = parser.parse(points);
        res.setHeader('Content-Disposition', 'attachment; filename="T1_T6.csv"');
        res.setHeader('Content-Type', 'text/csv');
        res.send(csv);
    } catch (err) {
        res.status(500).send('Napaka pri generiranju CSV.');
    }
});


server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000')
})