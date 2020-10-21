const fs = require('fs')
const logger = require('../helpers/logger')('BaseDeployer')

module.exports = class BaseDeployer {
  constructor(environment, output = undefined) {
    this.environment = environment
    this.output = output
    this.previousDeploy = {}

    if (this._existsPreviousDeploy()) {
      this.previousDeploy = require(this.output)
      logger.warn(`Using previous deploy at ${this.output}`)
    }
  }

  _existsPreviousDeploy() {
    return !!this.output && fs.existsSync(this.output)
  }

  _saveDeploy(data) {
    if (!this.output) logger.warn(`Couldn't save deploy, no output path given: ${data}`)
    this.previousDeploy = { ...this.previousDeploy, ...data }
    const previousDeployJSON = JSON.stringify(this.previousDeploy, null, 2)
    fs.writeFileSync(this.output, previousDeployJSON)
  }
}
