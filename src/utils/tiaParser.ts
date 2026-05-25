/**
 * TIA Portal DB paste parser
 * Parses tab-separated text from TIA Portal Data Block view
 * 
 * Input format (tab-separated):
 *   [tab]Name[tab]DataType[tab]Offset[tab]StartValue[tab]...[tab]Comment
 * 
 * Example:
 *   \tGIEMIK\tReal\t12.0\t0.0\tTrue\tTrue\tTrue\tTrue\tFalse\t
 */

interface ParsedTag {
  name: string;
  dataType: string;       // Bool, Real, DInt, Int, String[n], UDInt
  offset: string;         // e.g., "12.0", "60.1"
  address: string;        // nodes7 format: DB18,REAL12
  description: string;
  startValue: string;
}

/**
 * Convert TIA Portal data type + offset to nodes7 address format
 */
function toNodes7Address(dbNumber: number, dataType: string, offset: string): string {
  const prefix = `DB${dbNumber}`;
  const dtUpper = dataType.toUpperCase();

  // Bool → X{byte}.{bit}
  if (dtUpper === 'BOOL') {
    return `${prefix},X${offset}`;
  }

  // Real (32-bit float) → REAL{byte}
  if (dtUpper === 'REAL') {
    const byteOffset = offset.split('.')[0];
    return `${prefix},REAL${byteOffset}`;
  }

  // DInt (32-bit signed int) → DINT{byte}
  if (dtUpper === 'DINT') {
    const byteOffset = offset.split('.')[0];
    return `${prefix},DINT${byteOffset}`;
  }

  // Int (16-bit signed int) → INT{byte}
  if (dtUpper === 'INT') {
    const byteOffset = offset.split('.')[0];
    return `${prefix},INT${byteOffset}`;
  }

  // UDInt (32-bit unsigned) → DINT{byte} (nodes7 reads as DINT, value reinterpreted)
  if (dtUpper === 'UDINT') {
    const byteOffset = offset.split('.')[0];
    return `${prefix},DINT${byteOffset}`;
  }

  // String[n] → S{byte}.{length}
  const stringMatch = dataType.match(/^String\[(\d+)\]$/i);
  if (stringMatch) {
    const length = parseInt(stringMatch[1]);
    const byteOffset = offset.split('.')[0];
    return `${prefix},S${byteOffset}.${length}`;
  }

  // String without length (e.g., String max 254)
  if (dtUpper === 'STRING') {
    const byteOffset = offset.split('.')[0];
    return `${prefix},S${byteOffset}.254`;
  }

  // Byte → BYTE{offset}
  if (dtUpper === 'BYTE') {
    const byteOffset = offset.split('.')[0];
    return `${prefix},BYTE${byteOffset}`;
  }

  // Word → WORD{offset}  
  if (dtUpper === 'WORD') {
    const byteOffset = offset.split('.')[0];
    return `${prefix},WORD${byteOffset}`;
  }

  // Fallback
  const byteOffset = offset.split('.')[0];
  return `${prefix},REAL${byteOffset}`;
}

/**
 * Normalize TIA data type to our canonical type names
 */
function normalizeDataType(tiaType: string): string {
  const upper = tiaType.toUpperCase();
  if (upper === 'BOOL') return 'BOOL';
  if (upper === 'REAL') return 'REAL';
  if (upper === 'DINT') return 'DINT';
  if (upper === 'INT') return 'INT';
  if (upper === 'UDINT') return 'UDINT';
  if (upper === 'BYTE') return 'BYTE';
  if (upper === 'WORD') return 'WORD';
  if (upper.startsWith('STRING')) return tiaType; // keep String[n]
  return tiaType;
}

/**
 * Parse TIA Portal paste text into structured tag definitions
 */
export function parseTiaPaste(text: string, dbNumber: number): ParsedTag[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const tags: ParsedTag[] = [];

  for (const line of lines) {
    // Split by tab
    const parts = line.split('\t').map(p => p.trim());
    
    // Skip "Static" header line
    if (parts.every(p => p === '' || p === 'Static')) continue;

    // Find the meaningful parts: name, data_type, offset, start_value
    // TIA format: [empty]\tName\tDataType\tOffset\tStartValue\t[booleans...]\tComment
    const nonEmpty = parts.filter(p => p !== '');
    if (nonEmpty.length < 3) continue;

    // Determine column positions
    let name = '';
    let dataType = '';
    let offset = '';
    let startValue = '';
    let comment = '';

    // Find the first non-empty field as name
    let idx = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] !== '') {
        if (idx === 0) { name = parts[i]; idx++; }
        else if (idx === 1) { dataType = parts[i]; idx++; }
        else if (idx === 2) { offset = parts[i]; idx++; }
        else if (idx === 3) { startValue = parts[i]; idx++; }
        else {
          // Remaining non-True/False values could be the comment
          if (parts[i] !== 'True' && parts[i] !== 'False' && parts[i] !== '') {
            comment = parts[i];
          }
        }
      }
    }

    // Validate we have minimum required fields
    if (!name || !dataType || !offset) continue;
    
    // Validate offset is numeric
    if (!/^\d+(\.\d+)?$/.test(offset)) continue;

    // Skip "Static" row
    if (name === 'Static') continue;

    const address = toNodes7Address(dbNumber, dataType, offset);
    
    tags.push({
      name,
      dataType: normalizeDataType(dataType),
      offset,
      address,
      description: comment || '',
      startValue,
    });
  }

  return tags;
}
