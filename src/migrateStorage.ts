// Runs before the rest of the app: main.ts imports it first, so that what
// earlier versions kept in this browser under their names is under the
// names the app reads now before any of it reads one (utils/storageMigration.ts).
import { migrateStorage } from './utils/storageMigration'

migrateStorage()
