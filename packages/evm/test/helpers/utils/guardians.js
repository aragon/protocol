const { sha3, toChecksumAddress } = require('web3-utils')

const ACTIVATE_DATA = sha3('activate(uint256)').slice(0, 10)
const LOCK_ACTIVATION_DATA = sha3('lockActivation(address,uint256)').slice(0, 10)

const filterGuardians = (guardiansList, guardiansToFiler) => {
  const addressesToFiler = guardiansToFiler.map(j => toChecksumAddress(j.address))
  return guardiansList.filter(guardian => !addressesToFiler.includes(toChecksumAddress(guardian.address)))
}

const filterWinningGuardians = (votersList, winningRuling) => {
  const winners = votersList.filter(({ outcome }) => outcome === winningRuling)
  const losers = filterGuardians(votersList, winners)
  return [winners, losers]
}

const countGuardian = (list, guardianAddress) => {
  const equalGuardians = list.filter(address => address === guardianAddress)
  return equalGuardians.length
}

const countEqualGuardians = addresses => {
  return addresses.reduce((totals, address) => {
    const index = totals.map(guardian => guardian.address).indexOf(address)
    if (index >= 0) totals[index].count++
    else totals.push({ address, count: 1 })
    return totals
  }, [])
}

module.exports = {
  ACTIVATE_DATA,
  LOCK_ACTIVATION_DATA,
  countGuardian,
  countEqualGuardians,
  filterGuardians,
  filterWinningGuardians
}
