/**
 * Utility for formatting and normalizing meeting title and congregation name.
 */

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Formats display title from meeting name and congregation name.
 * 
 * Rules:
 * - If both exist: "Nome da Reunião - Nome da Congregação"
 * - If only name exists: "Nome da Reunião"
 * - If only congregation exists: "Nome da Congregação"
 * - If empty: ""
 * - Deduplication: If the name already ends with " - [Congregação]" (case-insensitive),
 *   it strips the duplicate suffix before formatting to prevent visual redundancy.
 */
export function formatMeetingTitle(rawName?: string, rawCongregation?: string): string {
  const name = (rawName || '').trim();
  const congregation = (rawCongregation || '').trim();

  if (!name && !congregation) return '';
  if (!congregation) return name;
  if (!name) return congregation;

  const nameLower = name.toLowerCase();
  const congLower = congregation.toLowerCase();

  // If the name is exactly the congregation name
  if (nameLower === congLower) {
    return congregation;
  }

  // If name ends with " - congregation" (or " – " or " — ")
  const regex = new RegExp(`\\s*[-–—]\\s*${escapeRegExp(congregation)}$`, 'i');
  if (regex.test(name)) {
    const baseName = name.replace(regex, '').trim();
    if (baseName) {
      return `${baseName} - ${congregation}`;
    }
    return congregation;
  }

  return `${name} - ${congregation}`;
}

/**
 * Extracts base meeting name and congregation name if they were combined in legacy data.
 * Useful when populating the edit modal so that if a legacy meeting has
 * name: "Comissão Diretiva - Central de Caruaru" and congregation: "Central de Caruaru",
 * the name field shows "Comissão Diretiva" and the congregation field shows "Central de Caruaru".
 */
export function extractBaseMeetingName(rawName?: string, rawCongregation?: string): {
  baseName: string;
  congregation: string;
} {
  const name = (rawName || '').trim();
  const congregation = (rawCongregation || '').trim();

  if (!congregation) {
    return { baseName: name, congregation: '' };
  }

  const regex = new RegExp(`\\s*[-–—]\\s*${escapeRegExp(congregation)}$`, 'i');
  if (regex.test(name)) {
    const stripped = name.replace(regex, '').trim();
    return {
      baseName: stripped || name,
      congregation,
    };
  }

  return { baseName: name, congregation };
}
