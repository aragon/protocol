const { network: { config } } = require('@nomiclabs/buidler')

const getAccounts = () => {
  return config.accounts.map(({ privateKey }) => {
    const { address } = web3.eth.accounts.privateKeyToAccount(privateKey)
    return { address, privateKey }
  })
}

const getPKForAccount = address => {
  const account = getAccounts().find(account => account.address.toLowerCase() === address.toLowerCase())
  return account.privateKey
}

module.exports = {
  getAccounts,
  getPKForAccount
}
