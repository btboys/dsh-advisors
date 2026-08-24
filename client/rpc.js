/**
 * Wire shapes for the /dsh-advisors RPC channel.
 * Keep in lockstep with src/rpc.ts on the host side.
 */

export const ADVISORS_RPC_CHANNEL = '/dsh-advisors'

export const ADVISORS_ENDPOINTS = Object.freeze({
  configGet: 'advisors.config.get',
  configSet: 'advisors.config.set',
  sessionGet: 'advisors.session.get',
  sessionSet: 'advisors.session.set',
})
