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
      const rawUri = process.env.MONGO_URL || process.env.MONGODB_URI
      const uri = String(rawUri || '').trim()
      if (!uri) {
        throw new Error('Database connection failed: Neither MONGO_URL nor MONGODB_URI environment variable is configured.')
      }
      const c = new MongoClient(uri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 10000,
      })
      await c.connect()
      client = c
      const dbName = (process.env.DB_NAME || '').trim() || 'niuronai'
      db = c.db(dbName)
      return db
    })().catch((err) => {
      connecting = null
      throw err
    })
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
