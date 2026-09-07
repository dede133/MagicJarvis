import { readFile } from 'node:fs/promises'

/** Loads only simple local development variables and never logs their values. */
export const loadDevEnvironment = async (): Promise<void> => {
  try {
    const contents = await readFile('.env.local', 'utf8')
    contents.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match || process.env[match[1]] !== undefined) return
      const value = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2')
      process.env[match[1]] = value
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}
