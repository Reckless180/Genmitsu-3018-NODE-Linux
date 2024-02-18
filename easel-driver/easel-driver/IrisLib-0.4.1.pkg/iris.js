var io       = require('socket.io')
  , http     = require('http')
  , https    = require('https')
  , fs = require('fs')
  , path = require('path')
  , SerialPortController = require('./lib/serial_port_controller')
  , Machine = require('./lib/machine')
  , WebsocketController = require('./lib/websocket_controller')
  , Debugger = require('./lib/debugger');

var httpsOptions = {
  key: fs.readFileSync('ssl/inventableslocalhost.key'),
  cert: fs.readFileSync('ssl/inventableslocalhost.cer')
};

var WEBSOCKET_PORT = parseInt(process.argv[2] || 1338);
var WEBSOCKET_SECURE_PORT = WEBSOCKET_PORT + 100;

var logger = Debugger.logger('iris.js');

var json = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
var version = json.version;
var iris = json.iris;

// TODO: Remove port 80 after SSL is enforced in production
var origins = process.argv.slice(3).join(" ") || "easel.inventables.com:80 easel.inventables.com:443 easelstaging.inventables.com:80 easelstaging.inventables.com:443 easel.invinternal.com:443 easel-secure.inventables.com:443 easel-insecure.inventables.com:80";

logger.log("Starting Easel Driver " + version);

var serialPortController = new SerialPortController();
var machine = new Machine(serialPortController);

function startApp(http, port, options) {
  var app = http.createServer(options);
  var appIo = io.listen(app);

  appIo.origins(origins);

  var secure = http == https ? "secure " : "";

  logger.log("Listening on port " + port + " for " + secure + "connections from " + origins);

  app.listen(port, "0.0.0.0");

  return new WebsocketController({
    sockets: appIo.sockets,
    version: version,
    abilities: iris.abilities,
    machine: machine,
  });
}

var secureApp = startApp(https, WEBSOCKET_SECURE_PORT, httpsOptions);
var app = startApp(http, WEBSOCKET_PORT);
