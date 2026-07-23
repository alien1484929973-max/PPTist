import { Buffer } from 'node:buffer'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const KEY_LENGTH = 64

export const hashPassword = async password => {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64')}$${Buffer.from(key).toString('base64')}`
}

export const verifyPassword = async (password, encodedHash) => {
  const [algorithm, saltBase64, keyBase64] = String(encodedHash || '').split('$')
  if (algorithm !== 'scrypt' || !saltBase64 || !keyBase64) return false

  try {
    const expected = Buffer.from(keyBase64, 'base64')
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltBase64, 'base64'), expected.length))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }
  catch {
    return false
  }
}
