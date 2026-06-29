// Per-request actor context for the MCP tools.
//
// The stdio server sets a single default actor (the owner) at startup; the HTTP
// server resolves a per-request actor from the authenticated Personal Access
// Token. AsyncLocalStorage carries the resolved actor into each tool call so
// handlers can attribute writes to the real user without changing every handler
// signature (they just call getActorId()).
import { AsyncLocalStorage } from 'node:async_hooks'
import type { User } from '../lib/db/schema'

export type Role = User['role'] // 'owner' | 'manager' | 'employee'

export type Actor = {
  userId: string
  role: Role
  displayName: string
  email: string
  via: 'mcp' | 'mcp-http'
}

const storage = new AsyncLocalStorage<Actor>()

// Default actor for the stdio server (which has no per-request auth). Never set
// on the HTTP path, so a missing/invalid token can never fall back to an owner.
let defaultActor: Actor | null = null
export function setDefaultActor(actor: Actor | null): void {
  defaultActor = actor
}

// Resolve the actor for a tool call: the per-request (HTTP token) actor if
// present, otherwise the stdio default. Throws if neither exists.
export function resolveActor(requestActor?: Actor): Actor {
  const actor = requestActor ?? defaultActor
  if (!actor) throw new Error('No MCP actor in context.')
  return actor
}

export function runWithActor<T>(actor: Actor, fn: () => T): T {
  return storage.run(actor, fn)
}

export function getActor(): Actor {
  const actor = storage.getStore()
  if (!actor) throw new Error('No MCP actor in async context.')
  return actor
}

export function getActorId(): string {
  return getActor().userId
}

export function tryActor(): Actor | undefined {
  return storage.getStore()
}
