import { Address } from '@graphprotocol/graph-ts'

import { ZERO_ADDRESS } from '../helpers/utils'
import { ERC20 } from '../types/schema'
import { ERC20 as ERC20Contract } from '../types/AragonProtocol/ERC20'

const ETH_SYMBOL = 'ETH'
const ETH_DECIMALS = 18

export function loadOrCreateERC20(address: Address) : ERC20 {
    let id = address.toHexString()
    let token = ERC20.load(id)

    if (token == null) {
        if (id == ZERO_ADDRESS) {
            token = new ERC20(ZERO_ADDRESS)
            token.name = ETH_SYMBOL
            token.symbol = ETH_SYMBOL
            token.decimals = ETH_DECIMALS
        } else {
            let tokenContract = ERC20Contract.bind(address)
            token = new ERC20(id)
            token.name = tokenContract.name()
            token.symbol = tokenContract.symbol()
            token.decimals = tokenContract.decimals()
        }
    }

    token.save()
    return token!
}
