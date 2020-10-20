const fs = require('fs')
const path = require('path')
const TruffleContract = require('@truffle/contract')

const BUILD_DIRS = ['build/contracts', 'artifacts']

module.exports = class Artifacts {
  constructor(provider, defaults) {
    this.defaults = defaults
    this.provider = provider
  }

  require(contractName, dependency = undefined) {
    const contractPaths = dependency
      ? this._getNodeModulesPath(dependency, contractName)
      : this._getLocalBuildPath(contractName)

    const artifact = this._findArtifact(contractPaths)
    if (!artifact) throw Error(`Could not find artifact for ${dependency} ${contractName}`)

    const Contract = TruffleContract(artifact)
    Contract.defaults(this.defaults)
    Contract.setProvider(this.provider)
    return Contract
  }

  _findArtifact(paths) {
    const path = paths.find(fs.existsSync)
    return path ? require(path) : undefined
  }

  _getLocalBuildPath(contractName) {
    return BUILD_DIRS.map(dir => path.resolve(process.cwd(), `./${dir}/${contractName}.json`))
  }

  _getNodeModulesPath(dependency, contractName) {
    return BUILD_DIRS.map(dir => `${process.cwd()}/node_modules/${dependency}/${dir}/${contractName}.json`)
  }
}
