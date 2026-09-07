const numberWords: Record<string, string> = {
  cero: '0',
  un: '1',
  uno: '1',
  una: '1',
  dos: '2',
  tres: '3',
  cuatro: '4',
  cinco: '5',
  seis: '6',
  siete: '7',
  ocho: '8',
  nueve: '9',
  diez: '10',
  once: '11',
  doce: '12',
  trece: '13',
  catorce: '14',
  quince: '15',
  dieciseis: '16',
  diecisiete: '17',
  dieciocho: '18',
  diecinueve: '19',
  veinte: '20',
  treinta: '30',
  cuarenta: '40',
  cincuenta: '50',
  sesenta: '60',
  setenta: '70',
  ochenta: '80',
  noventa: '90',
  cien: '100',
}

/** Normalizes human input while preserving commas that can separate visual indexes. */
export const normalizeCommandText = (input: string): string =>
  input
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.!?;:]/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b[\p{L}]+\b/gu, (word) => numberWords[word] ?? word)
