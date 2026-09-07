import type { Zone } from './card'

export type ZoneInformationVisibility = 'PUBLIC' | 'HIDDEN'

/** Visibility describes what Jarvis may know, not what the physical zone contains. */
export const zoneInformationVisibility = (
  zone: Zone,
): ZoneInformationVisibility =>
  zone === 'hand' || zone === 'library' ? 'HIDDEN' : 'PUBLIC'
