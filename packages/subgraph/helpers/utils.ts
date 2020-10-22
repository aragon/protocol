import { ByteArray, ethereum } from '@graphprotocol/graph-ts'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function buildId(event: ethereum.Event): string {
    return event.transaction.hash.toHexString() + event.logIndex.toString()
}

export function concat(a: ByteArray, b: ByteArray): ByteArray {
    let out = new Uint8Array(a.length + b.length)
    for (let i = 0; i < a.length; i++) {
        out[i] = a[i]
    }
    for (let j = 0; j < b.length; j++) {
        out[a.length + j] = b[j]
    }
    return out as ByteArray
}
