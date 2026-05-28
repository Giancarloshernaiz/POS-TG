import { hash, verify } from '@node-rs/argon2'

const argonOptions = {
  algorithm: 2 as const, // Algorithm.Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 4) throw new Error('password too short')
  return hash(plain, argonOptions)
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plain)
  } catch {
    return false
  }
}
