import { MongoClient, Db } from "mongodb";

// Serverless ortamda bağlantıyı global olarak önbelleğe alıyoruz ki
// her istekte yeni bağlantı açılmasın. Bağlantı yalnızca ilk getDb()
// çağrısında (istek anında) kurulur — modül import'unda değil — böylece
// build sırasında gereksiz DNS/ağ erişimi olmaz.

const dbName = process.env.MONGODB_DB || "vampir-koylu";

type Cache = { promise?: Promise<MongoClient> };
const globalCache = global as typeof globalThis & { _mongo?: Cache };
globalCache._mongo ??= {};

function clientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI ortam değişkeni tanımlı değil.");
  globalCache._mongo!.promise ??= new MongoClient(uri).connect();
  return globalCache._mongo!.promise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(dbName);
}
