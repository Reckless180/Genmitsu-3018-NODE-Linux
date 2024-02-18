var Debugger = require('./debugger')
  , firmwareUploader = require('./firmware_uploader');

var WebsocketController = function({ sockets, version, abilities, machine }) {
  var that = {};
  var logger = Debugger.logger("Websocket Controller");
  var minimumTimeBetweenUpdates = 500;
  var lastUpdateTime = Date.now();
  var echoFlags = {};

  var setUpSerialPortListeners = function() {
    var echo = function(params) {
      if (echoFlags.socket) {
        sockets.emit('echo', params);
      }
    };

    machine.serialPortController.addEventListener('write', function(data) {
      echo({ action: 'write', data: data });
    });

    machine.serialPortController.addEventListener('read', function(data) {
      echo({ action: 'read', data: data });
    });

    machine.serialPortController.addEventListener('portOpened', function() {
      echo({ action: 'portOpened' });
    });

    machine.serialPortController.addEventListener('close', function() {
      echo({ action: 'close' });
    });

    machine.serialPortController.addEventListener('port-error', function(portError) {
      echo({ action: "port-error", data: portError.message });
    });
  };

  var onError = function(obj) {
    sockets.emit('error', obj);
  };

  var setUpMachineListeners = function() {
    machine.addEventListener('connected', function() {
      reportConnectionStatus();
    });

    machine.addEventListener('ready', function() {
      sockets.emit('ready');
    });

    machine.addEventListener('overrides-changed', function() {
      reportOverrides();
    });

    machine.addEventListener('resumed', function(percentComplete) {
      sockets.emit('running', machine.getProjectName(), percentComplete);
    });

    machine.addEventListener('progress', function(percentComplete) {
      if (Date.now() - lastUpdateTime > minimumTimeBetweenUpdates || percentComplete === 100) {
        lastUpdateTime = Date.now();
        sockets.emit('running', machine.getProjectName(), percentComplete);
      }
    });

    machine.addEventListener('paused', function(percentComplete) {
      sockets.emit('paused', machine.getProjectName(), percentComplete);
    });

    machine.addEventListener('unknown', function(data) {
      sockets.emit('unknown', data);
    });

    machine.addEventListener('error', onError);

    machine.addEventListener('port_lost', function(data) {
      sockets.emit('port_lost', data);
    });

    machine.addEventListener('position', function(position) {
      sockets.emit('position', position);
    });

    machine.addEventListener('probe-status', function(probeStatus) {
      sockets.emit('probe-status', probeStatus);
    });

    machine.addEventListener('probe-result', function(probeResult) {
      sockets.emit('probe-result', probeResult);
    });

    machine.addEventListener('spindle-current', function(spindleCurrent) {
      sockets.emit('spindle-current', spindleCurrent);
    });

    machine.addEventListener('grbl-state', function(state, substate) {
      sockets.emit('state', state, substate);
    });

    machine.addEventListener('run-state', function(state) {
      sockets.emit('run-state', state);
    });

    machine.addEventListener('settings', function(settings) {
      sockets.emit('machine-settings', settings);
    });

    machine.addEventListener('machine-build-info', function(machineBuildInfo) {
      sockets.emit('machine-build-info', machineBuildInfo);
    });

    machine.addEventListener('run-time', function(runTime) {
      sockets.emit('run-time', runTime);
    });

    machine.addEventListener('release', function(timestamp) {
      sockets.emit('release', timestamp);
    });

    machine.addEventListener('stopping', function() {
      sockets.emit('stopping');
    });

    machine.addEventListener('grbl-error', function(message) {
      sockets.emit('grbl-error', message);
    });

    machine.addEventListener('grbl-alarm', function(message) {
      sockets.emit('grbl-alarm', message);
    });

    machine.addEventListener('grbl-over-current', function(message) {
      sockets.emit('grbl-over-current', message);
    });

    machine.addEventListener('uploading-firmware', function() {
      reportFirmwareUploadProgress();
    });
  };

  setUpSerialPortListeners();
  setUpMachineListeners();

  var reportJobStatus = function() {
    machine.reportJobStatus();
    reportOverrides();
  };

  var reportConnectionStatus = function() {
    connectionStatus = machine.getMachineIdentification();
    sockets.emit('connection_status', connectionStatus);
  };

  var reportMachineBuildInfo = function() {
    machine.reportBuildInfo();
  };

  var reportOverrides = function() {
    sockets.emit('overrides', machine.getCurrentOverrides());
  };

  var onGcode = function(job) {
    var gcode = job.gcode;
    var lines = gcode.split('\n');
    machine.updateConfig(job.customConfig);
    machine.streamGcodeLines({ lines: lines, projectName: job.name });
  };

  var onRequestMachineSettings = function() {
    machine.requestSettings();
  };

  var onGetPorts = function() {
    machine.serialPortController.listPorts(function (ports) {
      sockets.emit('ports', ports);
    });
  };

  var onConsole = function(gcode) {
    var lines = gcode.split('\n');
    lines.forEach(function(line) {
      machine.enqueueCommand(line);
    });
  };

  var onSetConfig = function(config) {
    machine.setConfig(config);
  };

  var onDisconnect = function() {
    machine.removeClient();
  };

  var onPause = function() {
    machine.pause();
  };

  var onResume = function() {
    machine.resume();
  };

  var onAcquire = function(timestamp) {
    machine.acquire(timestamp);
  };

  var onStop = function(params) {
    machine.stop(params);
  };

  var onExecute = function(instructions) {
    machine.execute(instructions);
  };

  var onInitPort = function(comName) {
    machine.initPort(comName);
  };

  var onSetEcho = function(flags) {
    if (typeof(flags) === 'object') {
      echoFlags = flags;
    } else { // support for booleans
      if (flags) {
        echoFlags = { socket: true };
      } else {
        echoFlags = {};
      }
    }
    machine.setEchoFlags(echoFlags);
  };

  var firmwareUploadProgress = 0;

  var reportFirmwareUploadProgress = function() {
    sockets.emit('firmware-upload-progress', firmwareUploadProgress);
  };

  var onFirmwareUpload = function(hex) {
    logger.log("Received request to upload firmware");
    if (machine.getConfig().firmwareUpload) {
      if (machine.serialPortController.connected()) {
        var comName = machine.serialPortController.comName();

        var performUpload = function() {
          sockets.emit('firmware-upload-start');
          firmwareUploadProgress = 0;
          reportFirmwareUploadProgress();
          var uploader = firmwareUploader(comName, hex, machine.getConfig().firmwareUpload);
          uploader.upload({
            update: function(data) {
              firmwareUploadProgress = data;
              reportFirmwareUploadProgress();
            },
            done: function(data) {
              sockets.emit('firmware-upload-done', data);
              machine.endFirmwareUpload();
            }
          });
        };

        if (machine.beginFirmwareUpload(performUpload, machine.getConfig().firmwareUpload)) {
          logger.log("Beginning firmware upload");
        } else {
          onError({ sender_note: "Cannot upload firmware in machine's current state" });
        }
      } else {
        onError({ sender_note: "Cannot upload firmware without a connected machine" });
      }
    } else {
      onError({ sender_note: "Cannot upload firmware with unsupported machine config" });
    }
  };

  sockets.on('connection', function(socket) {
    logger.log('Client connected via ' + socket.conn.transport.name);
    socket.conn.on('upgrade', function(transport) {
      logger.log('Client transport changed to ' + transport.name)
    });

    socket.emit('version', version);
    socket.emit('abilities', abilities);
    socket.on('get_connection', reportConnectionStatus);
    socket.on('get_machine_build_info', reportMachineBuildInfo);
    socket.on('get_job_status', reportJobStatus);
    socket.on('gcode', onGcode);
    socket.on('get_ports', onGetPorts);
    socket.on('console', onConsole);
    socket.on('execute', onExecute);
    socket.on('set_config', onSetConfig);
    socket.on('disconnect', onDisconnect);
    socket.on('init_port', onInitPort);
    socket.on('pause', onPause);
    socket.on('acquire', onAcquire);
    socket.on('resume', onResume);
    socket.on('stop', onStop);
    socket.on('echo', onSetEcho);
    socket.on('update-firmware', onFirmwareUpload);
    socket.on('machine-settings', onRequestMachineSettings);
    socket.on('sent_feedback', function() { socket.broadcast.emit("sent_feedback"); });

    machine.addClient();
  });

  return that;
};

module.exports = WebsocketController;
