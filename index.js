var express = require('express');
var socketio = require('socket.io');
var routes = require('./routes/index');
var http = require('http');
var cors = require('cors');

// Best error handler
process.on('uncaughtException', e => console.error(e)/*require('opn')(`http://stackoverflow.com/search?q=[node.js]+${e.message}`)*/)

var app = express();
var server = http.createServer(app);
var io = socketio(server);

app.use(cors());
app.use('/jenkinsapi', routes(io));
app.set('port', process.env.PORT || 3000);

server.listen(app.get('port'), function() {
  console.log('Server listening on port ' + server.address().port);
});

/// catch 404 and forwarding to error handler
/*
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});*/
// development error handler
// will print stacktrace
/*
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}
*/
