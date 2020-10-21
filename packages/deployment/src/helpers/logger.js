const chalk = require('chalk')

const DEFAULTS = {
  verbose: true,
  silent: false
}

class Logger {
  constructor(actor) {
    this.actor = actor
  }

  info(msg) {
    if (!DEFAULTS.verbose) return
    this.log(msg, '️  ', 'white')
  }

  success(msg) {
    this.log(msg, '✅', 'green')
  }

  warn(msg) {
    this.log(msg, '⚠️ ', 'yellow')
  }

  error(msg) {
    this.log(msg, '🚨', 'red')
  }

  log(msg, emoji, color = 'white') {
    if (DEFAULTS.silent) return
    const padding = 30 - this.actor.length
    let formattedMessage = chalk.keyword(color)(`${emoji}  ${this._stringify(msg)}`)
    if (DEFAULTS.verbose) formattedMessage = `[${this.actor}]${' '.repeat(padding)}${formattedMessage}`
    console.error(formattedMessage)
  }

  _stringify(obj) {
    return (typeof obj === 'object') ? JSON.stringify(obj) : obj.toString()
  }
}

module.exports = actor => new Logger(actor)

module.exports.setDefaults = (silent, verbose) => {
  DEFAULTS.silent = silent
  DEFAULTS.verbose = verbose
}
