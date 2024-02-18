var errorHandler = require('./error_handler')
    , SerialPort = require('serialport')
    , Readline = SerialPort.parsers.Readline
    , Debugger = require('./debugger')
    , eventDispatcher = require('./event_dispatcher')
    , Parser = require('./parser');

var SerialPortController = function() {
  var that = {};

  var port = null;
  var currentComName = null;

  var parser = Parser();
  var logger = Debugger.logger("Serial port controller");

  var connected = function() {
    return port && port.isOpen;
  };

  var write = function(data) {
    if (connected()) {
      that.dispatchEvent('write', data);
      port.write(data);
    }
  };

  var close = function(callback) {
    if (connected()) {
      port.close(callback);
      port = null;
    }
  };

  var listPorts = function (callback) {
    SerialPort.list().then(
      function(ports) {
        // Fix for serialPort change from comName -> path
        // Apparently the object returned from the serial
        // port lib is also read-only
        callback(ports.map(function(port) {
          const clone = {};
          for (const key of Object.getOwnPropertyNames(port)) {
            clone[key] = port[key];
          }
          // Feb 2024 - Updated by M. Higginson - Spoofed manufacturer key for the CH-341 controller
          clone["manufacturer"] = "FTDI";
          clone["vendorId"] = "0403";
          clone.comName = port.path;
          return clone;
        }));
      },
      function(error) {
        // TODO: catch and handle errors
        errorHandler.trigger(error);
        return null;
      }
    )
  };

  var initPortWithConfigs = function(comName, config) {
    close();
    currentComName = comName;
    var thisPort = new SerialPort(
      comName,
      { baudRate: config.baud },
      function (error) {
        if (error !== null) {
          logger.log("ERROR: " + error, Debugger.logger.RED);
        }
      }
    );
    var serialPortParser = thisPort.pipe(new Readline({ delimiter: config.separator }));

    thisPort.on('open', function() {
      if (port !== thisPort) {
        return;
      }
      logger.log("Port opened");
      that.dispatchEvent('portOpened');
    });

    serialPortParser.on('data', function(data) {
      if (port !== thisPort) {
        return;
      }

      data = data.toString('utf8');

      that.dispatchEvent('read', data);
      parser.parseData(data, config);
    });

    thisPort.on('error', function(d) {
      if (port !== thisPort) {
        return;
      }
      if (port !== null) {
        logger.log('On error');
        logger.log('error: ' + d);
        logger.log('CODE: ' + d.code);
        if (d.code === 'UNKNOWN' || d.code === 'ENXIO' || d.code === undefined) {
          close();
          that.dispatchEvent("port-error", d);
          that.dispatchEvent("close");
        }
      }
    });

    thisPort.on('close', function() {
      if (port !== thisPort) {
        return;
      }
      logger.log('On close');
      port = null;
      that.dispatchEvent("close");
    });

    port = thisPort;
  };

  that.listPorts = listPorts;
  that.initPortWithConfigs = initPortWithConfigs;
  that.comName = function() { return currentComName; };
  that.write = write;
  that.parser = function() { return parser; };
  that.connected = connected;
  that.close = close;

  eventDispatcher(that);

  return that;
};

module.exports = SerialPortController;
