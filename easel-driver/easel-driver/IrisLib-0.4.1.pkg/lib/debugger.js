let nextId = 0;

exports.logger = function() {
  const logger = (name) => {
    const that = {};

    const id = nextId++;
    const prefix = `${name} [id=${id}]`;

    const timestamp = () => {
      return (new Date()).toISOString();
    };

    const withColor = (msg, color) => {
      if (color) {
        if (Colors[color]) {
          color = Colors[color];
        }

        msg = color + msg + Colors['RESET'];
      }

      return msg;
    };

    const log = (msg, color) => {
      console.log(buildMessage(msg, color));
    };

    const error = (msg, color) => {
      console.error(buildMessage(msg, color));
    };

    const buildMessage = (message, color) => {
      let formattedMessage = `${timestamp()} ${prefix} ${withColor(message, color)}`;

      if(process.platform === "win32") {
        formattedMessage = `${formattedMessage}\r`;
      }

      return formattedMessage;
    };

    that.log = log;
    that.error = error;

    return that;
  };

  logger.colors = {
    RED     : '\033[31m',
    GREEN   : '\033[32m',
    YELLOW  : '\033[33m',
    BLUE    : '\033[34m',
    MAGENTA : '\033[35m',
    CYAN    : '\033[36m',
    RESET   : '\033[0m'
  };

  return logger;
}();
