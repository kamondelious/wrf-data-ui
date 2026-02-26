/**
 * AS_scan_00.gs
 *
 * Scanning + parsing the sheet into structured objects.
 *
 * Move these here (once we paste them in):
 * - sheetToObjects(...)
 * - processRows_(...)
 * - prepareWanted_(...)
 * - any "wanted pattern" / row-matching helpers
 * - any scan/debug logging helpers tightly coupled to scanning
 */

function getFieldOffsets_( wantedPrepared, fieldIdx ) {
  var out = [ ];
  for ( var i = 0; i < wantedPrepared.length; i++ ) {
    if ( wantedPrepared[ i ].fieldIdx === fieldIdx ) out.push( wantedPrepared[ i ].offset );
  }
  return out;
}

/**
 * True if value is null/undefined/empty string after trimming.
 */
function isBlank_( v ) {
  return v === null || typeof v === 'undefined' || String( v ).trim( ) === '';
}

/**
 * Convert column letters to 1-based index. e.g. A->1, Z->26, AA->27
 */
function colToIndex( colLetters ) {
  var s = String( colLetters ).trim( ).toUpperCase( );
  var n = 0;
  for ( var i = 0; i < s.length; i++ ) {
    var c = s.charCodeAt( i );
    if ( c < 65 || c > 90 ) throw new Error( 'Invalid column letters: ' + colLetters );
    n = n * 26 + ( c - 64 );
  }
  return n;
}

/**
 * Field indices that are allowed to be blank while still considering the row "valid".
 * - Rarity (5): inferred from background color, cell text may be blank.
 * - Maximum Range (38): often blank; we fill from Effective Range later.
 */
function isOptionalFieldIndex_( fieldIdx ) {
  return fieldIdx === 5
      || fieldIdx === 32
      || fieldIdx === 33
      || fieldIdx === 37
      || fieldIdx === 38
      || fieldIdx === 39;
}

function isHeaderFieldIndex_( fieldIdx ) {
  // Fields that should be taken from the first row of the block only
  return fieldIdx === 0    // Name
      || fieldIdx === 4    // Class
      || fieldIdx === 17   // Dominion
      || fieldIdx === 29;  // Ace Talent
}

/**
 * Prepare wanted mapping into offsets into the scan row array.
 * wanted is an object: { "A": 5, "B": 0, ... }
 */
function prepareWanted_( wantedObj, firstDataColLetter ) {
  var firstIdx = colToIndex( firstDataColLetter );
  var keys = Object.keys( wantedObj );
  var out = [ ];

  for ( var i = 0; i < keys.length; i++ ) {
    var colLetter = String( keys[ i ] ).trim( ).toUpperCase( );
    var fieldIdx = wantedObj[ keys[ i ] ];

    var colIdx = colToIndex( colLetter );
    var offset = colIdx - firstIdx;

    out.push({
      col: colLetter,
      colIdx: colIdx,
      offset: offset,
      fieldIdx: fieldIdx
    });
  }

  // Sort by offset so extraction is stable
  out.sort( function( a, b ) { return a.offset - b.offset; } );
  return out;
}

/**
 * Build a map fieldIdx -> array of wanted entries that map into that field.
 */
function groupWantedByField_( wantedPrepared ) {
  var map = { };
  for ( var i = 0; i < wantedPrepared.length; i++ ) {
    var e = wantedPrepared[ i ];
    var k = String( e.fieldIdx );
    if ( !map[ k ] ) map[ k ] = [ ];
    map[ k ].push( e );
  }
  return map;
}

/**
 * Extract a row object using display values.
 * If multiple columns map to the same fieldIdx, we produce:
 *   fieldName: { "1": v1, "13": v2, ... } in the order encountered.
 *
 * NOTE: This is deliberate for L1/L13 pairs.
 */
function extractRowObject_( row, wantedPrepared, columnNames ) {
  var byField = groupWantedByField_( wantedPrepared );
  var out = { };

  var fieldKeys = Object.keys( byField );
  for ( var i = 0; i < fieldKeys.length; i++ ) {
    var fieldIdx = Number( fieldKeys[ i ] );
    var fieldName = columnNames[ fieldIdx ] || ( 'Field_' + fieldIdx );

    var entries = byField[ fieldKeys[ i ] ];
    if ( entries.length === 1 ) {
      out[ fieldName ] = row[ entries[ 0 ].offset ];
      continue;
    }

    // Paired / multi-mapped field (e.g., level 1 + level 13)
    var obj = { };
    for ( var j = 0; j < entries.length; j++ ) {
      var tierKey = String( j === 0 ? 1 : ( j === 1 ? 13 : ( j + 1 ) ) ); // 1, 13, then 3.. etc if ever needed
      obj[ tierKey ] = row[ entries[ j ].offset ];
    }

    // Merge-fill: if one value is blank and another is non-blank, use the non-blank for both
    // This handles merged cells in the sheet where the value applies to all levels
    var vals = Object.keys( obj ).map( function( k ) { return obj[ k ]; } );
    var nonBlank = vals.filter( function( v ) { return v != null && String( v ).trim( ) !== ''; } );
    if ( nonBlank.length === 1 && vals.length === 2 ) {
      // Exactly one non-blank value: fill both keys with it
      var fillVal = nonBlank[ 0 ];
      for ( var k in obj ) obj[ k ] = fillVal;
    }

    out[ fieldName ] = obj;
  }

  return out;
}

/**
 * Extract an object from a multi-row "record block" (e.g. hero pilots span 3 rows).
 * For each fieldIdx, we collect values across rows and mapped columns:
 *  - If we find 1 value total, store scalar
 *  - If many values, store array (preserving order)
 */
function extractBlockObject_( rowsBlock, wantedPrepared, columnNames ) {
  var byField = groupWantedByField_( wantedPrepared );
  var out = { };

  var fieldKeys = Object.keys( byField );
  for ( var i = 0; i < fieldKeys.length; i++ ) {
    var fieldIdx = Number( fieldKeys[ i ] );
    var fieldName = columnNames[ fieldIdx ] || ( 'Field_' + fieldIdx );

    var entries = byField[ fieldKeys[ i ] ];

    // Header fields: take from first row only
    if ( isHeaderFieldIndex_( fieldIdx ) ) {
      var v = '';
      for ( var j = 0; j < entries.length; j++ ) {
        var vv = rowsBlock[ 0 ][ entries[ j ].offset ];
        if ( !isBlank_( vv ) ) { v = vv; break; }
      }
      out[ fieldName ] = v;
      continue;
    }

    // Talent fields: collect across the whole block
    var vals = [ ];
    for ( var r = 0; r < rowsBlock.length; r++ ) {
      var row = rowsBlock[ r ];
      for ( var j2 = 0; j2 < entries.length; j2++ ) {
        var x = row[ entries[ j2 ].offset ];
        if ( !isBlank_( x ) ) vals.push( x );
      }
    }

    if ( vals.length === 0 ) out[ fieldName ] = '';
    else if ( vals.length === 1 ) out[ fieldName ] = vals[ 0 ];
    else out[ fieldName ] = vals;
  }

  return out;
}

function blockLooksVerticallyMergedFor_( rawBlock, wantedPrepared ) {
  var nameOffs = getFieldOffsets_( wantedPrepared, 0 ); // Name
  var roleOffs = getFieldOffsets_( wantedPrepared, 4 ); // Role

  // If config doesn't map Name, we can't enforce this check.
  if ( nameOffs.length === 0 ) return true;

  var no = nameOffs[ 0 ];
  if ( isBlank_( rawBlock[ 0 ][ no ] ) ) return false;

  for ( var r = 1; r < rawBlock.length; r++ ) {
    if ( !isBlank_( rawBlock[ r ][ no ] ) ) return false;
  }

  // If Role exists, enforce the same vertical-merge shape.
  if ( roleOffs.length > 0 ) {
    var ro = roleOffs[ 0 ];
    if ( isBlank_( rawBlock[ 0 ][ ro ] ) ) return false;
    for ( var rr = 1; rr < rawBlock.length; rr++ ) {
      if ( !isBlank_( rawBlock[ rr ][ ro ] ) ) return false;
    }
  }

  return true;
}

function rawRowHasName_( rawRow, wantedPrepared ) {
  var hasName = false;
  var hasOther = false;

  for ( var i = 0; i < wantedPrepared.length; i++ ) {
    var e = wantedPrepared[ i ];
    var v = rawRow[ e.offset ];

    if ( e.fieldIdx === 0 ) {
      if ( !isBlank_( v ) ) hasName = true;
      continue;
    }

    if ( isOptionalFieldIndex_( e.fieldIdx ) ) continue;

    if ( !isBlank_( v ) ) hasOther = true;
  }

  return hasName && hasOther;
}

function isValidRoleValue_( v ) {
  var s = String( v || '' ).trim( );
  // Sheet uses "Defense" (gear/titans) in some places; accept both spellings.
  return s === 'Flanker'
      || s === 'Assault'
      || s === 'Defense'
      || s === 'Defender'
      || s === 'Tactician';
}

/**
 * Row match rule:
 * - Evaluate at the FIELD level (not per-cell).
 * - Anchor: Name (fieldIdx 0) must exist (non-blank) in at least one mapped column.
 * - For each unique fieldIdx in wanted:
 *     - if optional -> ignore
 *     - else -> at least one mapped column for that fieldIdx must be non-blank.
 */
function rowMatchesWanted_( row, wantedPrepared, columnNames ) {
  var byField = groupWantedByField_( wantedPrepared );

  // Anchor: Name required
  var nameEntries = byField[ '0' ];
  if ( !nameEntries || nameEntries.length === 0 ) {
    throw new Error( 'Wanted mapping must include Name (fieldIdx 0).' );
  }

  var hasName = false;
  for ( var i = 0; i < nameEntries.length; i++ ) {
    if ( !isBlank_( row[ nameEntries[ i ].offset ] ) ) { hasName = true; break; }
  }
  if ( !hasName ) return false;

  var roleEntries = byField[ '4' ];
  if ( roleEntries && roleEntries.length > 0 ) {
    var roleVal = '';
    for ( var r = 0; r < roleEntries.length; r++ ) {
      var v = row[ roleEntries[ r ].offset ];
      if ( !isBlank_( v ) ) { roleVal = v; break; }
    }
    if ( !isValidRoleValue_( roleVal ) ) return false;
  }

  // If Description is mapped, reject rows where it looks like "just numbers/punctuation"
  var descEntries = byField[ '8' ]; // Description
  if ( descEntries && descEntries.length > 0 ) {
    var descVal = '';
    for ( var d = 0; d < descEntries.length; d++ ) {
      var dv = row[ descEntries[ d ].offset ];
      if ( !isBlank_( dv ) ) { descVal = String( dv ).trim( ); break; }
    }
    // If present and numeric-only-ish, it's almost certainly the wrong row
    if ( descVal && /^[0-9\s.,%]+$/.test( descVal ) ) return false;
  }

  // Required fields: at least one non-blank among mapped columns
  var keys = Object.keys( byField );
  for ( var k = 0; k < keys.length; k++ ) {
    var fieldIdx = Number( keys[ k ] );
    if ( isOptionalFieldIndex_( fieldIdx ) ) continue;

    var entries = byField[ keys[ k ] ];
    var found = false;
    for ( var j = 0; j < entries.length; j++ ) {
      if ( !isBlank_( row[ entries[ j ].offset ] ) ) { found = true; break; }
    }
    if ( !found ) return false;
  }

  return true;
}

/**
 * Block match rule for multi-row records (e.g. hero pilots 3 rows):
 * - Name anchor must be present in block's top row.
 * - For each required fieldIdx, at least one mapped cell in ANY row of the block must be non-blank.
 */
function blockMatchesWanted_( rowsBlock, wantedPrepared, columnNames ) {
  var byField = groupWantedByField_( wantedPrepared );

  // Anchor: Name must exist in row 0
  var nameEntries = byField[ '0' ];
  if ( !nameEntries || nameEntries.length === 0 ) {
    throw new Error( 'Wanted mapping must include Name (fieldIdx 0).' );
  }

  var hasName = false;
  for ( var i = 0; i < nameEntries.length; i++ ) {
    if ( !isBlank_( rowsBlock[ 0 ][ nameEntries[ i ].offset ] ) ) { hasName = true; break; }
  }
  if ( !hasName ) return false;

  var roleEntries = byField[ '4' ];
  if ( roleEntries && roleEntries.length > 0 ) {
    var roleVal = '';
    for ( var r = 0; r < roleEntries.length; r++ ) {
      var v = rowsBlock[ 0 ][ roleEntries[ r ].offset ];
      if ( !isBlank_( v ) ) { roleVal = v; break; }
    }
    if ( !isValidRoleValue_( roleVal ) ) return false;
  }

  // If Description is mapped, reject blocks where the first found description is numeric-only-ish
  var descEntries = byField[ '8' ]; // Description
  if ( descEntries && descEntries.length > 0 ) {
    var descVal = '';

    for ( var rrDesc = 0; rrDesc < rowsBlock.length && !descVal; rrDesc++ ) {
      for ( var d = 0; d < descEntries.length; d++ ) {
        var dv = rowsBlock[ rrDesc ][ descEntries[ d ].offset ];
        if ( !isBlank_( dv ) ) { descVal = String( dv ).trim( ); break; }
      }
    }

    if ( descVal && /^[0-9\s.,%]+$/.test( descVal ) ) return false;
  }

  // Required fields: at least one mapped cell in ANY row of the block must be non-blank
  var keys = Object.keys( byField );
  for ( var k = 0; k < keys.length; k++ ) {
    var fieldIdx = Number( keys[ k ] );
    if ( isOptionalFieldIndex_( fieldIdx ) ) continue;

    var entries = byField[ keys[ k ] ];
    var found = false;

    for ( var rr = 0; rr < rowsBlock.length && !found; rr++ ) {
      for ( var j = 0; j < entries.length; j++ ) {
        if ( !isBlank_( rowsBlock[ rr ][ entries[ j ].offset ] ) ) { found = true; break; }
      }
    }
    if ( !found ) return false;
  }

  return true;
}

/**
 * Processes an array of data rows against a single section config.
 * Encapsulates the core pattern matching and data extraction logic.
 *
 * @param {Array<Array<string>>} dataArray A 2D array of raw sheet data (display values).
 * @param {Object} cfg The config object for the current section.
 * @param {Array<string>} columnNames The global array of column names.
 * @param {Object} opts Options for scanning (e.g., maxStop).
 * @param {number} startDataArrayIndex The 0-based index in dataArray to start scanning from.
 * @returns {Object} An object containing:
 *   - items: An array of extracted item objects.
 *   - lastRowIndex: The 0-based index of the last row considered for processing in dataArray.
 */
function processRows_( dataArray, cfg, columnNames, opts, startDataArrayIndex ) {
  opts = opts || { };
  var items = [ ];
  var consecutiveNonMatches = 0;
  // per-config override
  var maxStop = Number( ( cfg.maxStop != null ) ? cfg.maxStop : ( opts.maxStop || 1 ) );

  var wantedPrepared = prepareWanted_( cfg.wanted, 'A' );

  var currentArrayRowIndex = startDataArrayIndex;

  // Scan until a valid data row is found or maxStop criteria met
  var started = false;
  while ( currentArrayRowIndex < dataArray.length ) {
    var rowData = dataArray[ currentArrayRowIndex ];

    var isMatch = false;
    if ( cfg.recordHeight && cfg.recordHeight > 1 ) {
        var block = [ ];
        for ( var k = 0; k < cfg.recordHeight; k++ ) {
            if ( currentArrayRowIndex + k < dataArray.length ) {
                block.push( dataArray[ currentArrayRowIndex + k ] );
            }
        }
        if ( block.length === cfg.recordHeight && blockMatchesWanted_( block, wantedPrepared, columnNames ) ) {
            isMatch = true;
            started = true;
            items.push( extractBlockObject_( block, wantedPrepared, columnNames ) );
            consecutiveNonMatches = 0;
            currentArrayRowIndex += ( cfg.recordHeight -1 );
        }
    } else {
        isMatch = rowMatchesWanted_( rowData, wantedPrepared, columnNames );
        if ( isMatch ) {
            started = true;
            items.push( extractRowObject_( rowData, wantedPrepared, columnNames ) );
            consecutiveNonMatches = 0;
        }
    }

    if ( !isMatch ) {
        if( started ) consecutiveNonMatches++;
        if ( consecutiveNonMatches >= maxStop ) {
          break;
        }
    }

    currentArrayRowIndex++;
  }
  // IMPORTANT: If we never "started" (no matches found), do NOT advance the caller's cursor.
  // Otherwise, a single unmatched section (e.g. Titans Left Shoulder) can consume the rest of the sheet
  // and prevent later sections (e.g. Titan Weapons) from being scanned.
  var lastIdx = started ? currentArrayRowIndex : startDataArrayIndex;

  return {
    items: items,
    lastRowIndex: lastIdx
  };
}


/**
 * Dispatcher: runs all config entries and concatenates results.
 * Reads data from the sheet once into a 2D array and processes sections from it.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The Google Sheet object.
 * @param {Array<Object>} configArr An array of config objects for different sections within the sheet.
 * @param {Array<string>} columnNames The global array of column names.
 * @param {Object} opts Options for scanning (e.g., maxStop).
 * @returns {Object} An object containing:
 *   - items: A dictionary where keys are config types and values are arrays of extracted item objects.
 */
function sheetToObjects( sheet, configArr, columnNames, opts ) {
  opts = opts || { };
  var allItemsGrouped = { }; // Collects all items, grouped by config type

  // Read all data from the sheet once for performance
  var dataArray = sheet.getDataRange( ).getDisplayValues( );
  var currentDataArrayIndex = 0; // Cursor for the current position in the dataArray

  for ( var i = 0; i < configArr.length; i++ ) {
    var cfg = configArr[ i ];

    // Determine the actual start index for scanning this config's section in the dataArray.
    // This ensures we respect the section's configured start row, but also don't re-scan
    // rows already processed by a previous config in the same sheet.
    var sectionConfiguredStartIndex = ( cfg.first_data_row || 1 ) - 1; // 0-based index
    var actualScanStartIndex = cfg.independent
      ? sectionConfiguredStartIndex
      : Math.max( currentDataArrayIndex, sectionConfiguredStartIndex );

    // Call processRows_ to extract items for the current config from the dataArray
    var result = processRows_( dataArray, cfg, columnNames, opts, actualScanStartIndex );

    // Group items by config.type
    var categoryName = ( cfg.type == null ) ? '' : String( cfg.type );
    if ( categoryName ) {
        if ( !allItemsGrouped[ categoryName ] ) allItemsGrouped[ categoryName ] = [ ];
        allItemsGrouped[ categoryName ] = allItemsGrouped[ categoryName ].concat( result.items );
    } else {
        // Fallback for configs without a 'type'
        if ( !allItemsGrouped[ 'default' ] ) allItemsGrouped[ 'default' ] = [ ];
        allItemsGrouped[ 'default' ] = allItemsGrouped[ 'default' ].concat( result.items );
    }

    // Update the cursor for the next section to start from where this one finished
    if ( !cfg.independent ) currentDataArrayIndex = result.lastRowIndex;
  }

  // For single-config sheets, flatten the result for backward compatibility
  if ( configArr.length === 1 && !configArr[ 0 ].type ) {
      return { items: allItemsGrouped[ 'default' ] || [ ] };
  }

  // Return items, now grouped by config.type
  return { items: allItemsGrouped };
}
