const Artifacts = require('./Artifacts')

module.exports = class {
  constructor(networkConfig, web3) {
    this.networkConfig = networkConfig
    this.web3 = web3
  }

  async getArtifact(contractName, dependency = undefined) {
    const artifacts = await this.getArtifacts()
    return artifacts.require(contractName, dependency)
  }

  async getArtifacts() {
    if (!this.artifacts) {
      const from = await this.getSender()
      const { gasPrice, gas } = this.networkConfig
      this.artifacts = new Artifacts(this.web3.currentProvider, { from, gasPrice, gas })
    }
    return this.artifacts
  }

  async getSender() {
    const { from } = this.networkConfig
    return from || (await this._getDefaultSender())
  }

  async _getDefaultSender() {
    const accounts = await this.web3.eth.getAccounts()
    return accounts[0]
  }
}
