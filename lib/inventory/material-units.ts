import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type MaterialUnits = Record<string, 'count' | 'volume'>

export async function getLiveMaterialUnits(): Promise<{ units: MaterialUnits; available: boolean }> {
  try {
    const directory = path.join(process.cwd(), 'data', 'scmdb')
    const manifest = JSON.parse(await readFile(path.join(directory, 'latest.json'), 'utf8'))
    const filename: unknown = manifest?.channels?.live?.files?.crafting_blueprints
    if (typeof filename !== 'string' || !/^crafting_blueprints-[\w.-]+\.json$/.test(filename)) {
      throw new Error('Invalid LIVE blueprint manifest')
    }
    const dataset = JSON.parse(await readFile(path.join(directory, filename), 'utf8'))
    if (dataset.version !== manifest.channels.live.version ||
        !Array.isArray(dataset.items) || !Array.isArray(dataset.resources) ||
        !dataset.items.every((name: unknown) => typeof name === 'string') ||
        !dataset.resources.every((name: unknown) => typeof name === 'string')) {
      throw new Error('Invalid LIVE material metadata')
    }
    const items = new Set<string>(dataset.items)
    const resources = new Set<string>(dataset.resources)
    const units: MaterialUnits = {}
    for (const name of items) if (!resources.has(name)) units[name] = 'count'
    for (const name of resources) if (!items.has(name)) units[name] = 'volume'
    return { units, available: true }
  } catch (error) {
    console.error('LIVE material metadata unavailable', error)
    return { units: {}, available: false }
  }
}
