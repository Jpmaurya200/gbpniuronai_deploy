import { MongoClient } from 'mongodb'

// Singleton Mongo connection with concurrency-safe init (prevents the
// "Cannot read properties of undefined (reading 'collection')" race on cold start)
let client
let db
let connecting

export async function connectToMongo() {
  if (db) return db
  if (!connecting) {
    connecting = (async () => {
      const c = new MongoClient(process.env.MONGO_URL)
      await c.connect()
      client = c
      db = c.db(process.env.DB_NAME)
      return db
    })()
  }
  return connecting
}

// Strip Mongo's _id so responses are JSON-safe (we use UUIDs everywhere)
export function clean(doc) {
  if (!doc) return doc
  if (Array.isArray(doc)) return doc.map(clean)
  const { _id, ...rest } = doc
  return rest
}

export function periodKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
