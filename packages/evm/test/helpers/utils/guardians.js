const { toChecksumAddress } = require('web3-utils')

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
  countGuardian,
  countEqualGuardians,
  filterGuardians,
  filterWinningGuardians
}
