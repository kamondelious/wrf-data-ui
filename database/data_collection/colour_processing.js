/**
 * color_processing.gs
 *
 * Formatting-based inference (sheet colors -> rarity/dominion/etc).
 *
 * Move these here (once we copy them in):
 * - applyRarityAndDominionFromColors_(...) (or your current name)
 * - any helpers specifically for parsing hex colors / mapping to rarity
 * - debug logging for unknown colors
 */


/**
 * Infer Rarity from background color and dominion from font color.
 * Updates the 'items' array in-place.
 */
function applyRarityAndDominionFromColors_( sheet, sectionCfg, items ) {
  var seenUnknownRarityBgs_ = { };

  if ( !items || items.length === 0 ) return;

  // --- Helper functions defined inside to be self-contained ---
  function rarityFromBg_( bg ) {
    if ( !bg ) return 'Common';
    var c = String( bg ).toLowerCase( );

    // normalize a few common cases
    if ( c === '#fff' ) c = '#ffffff';

    // Known mappings
    if ( c === '#ffffff' || c === '#dabba5' || c === 'white' ) return 'Common';
    if ( c === '#00ff00' || c === '#00b050' || c === '#70ad47' || c === '#92d050' ) return 'Uncommon';
    if ( c === '#0000ff' || c === '#0070c0' || c === '#5b9bd5' || c === '#00b0f0' ) return 'Rare';

    // log unknown colors once (so you can extend mapping precisely)
    if ( !seenUnknownRarityBgs_[ c ] ) {
      seenUnknownRarityBgs_[ c ] = true;
      Logger.log( 'DEBUG Unknown rarity background color: ' + c );
    }

    // Temporary fallback so we don't break export
    return 'Common';
  }

  // --- Main logic ---
  var wantedPrepared = prepareWanted_( sectionCfg.wanted, sectionCfg.first_data_col );
  var recordHeight = Number( sectionCfg.recordHeight || 1 );
  var startRow = Number( sectionCfg.first_data_row || 1 );

  // Find the column numbers for Rarity (5) and Role (4) based on fieldIdx
  var rarityCol = null;
  var roleCols = [ ];
  wantedPrepared.forEach(
    function( p ) {
      if ( p.fieldIdx === 5 ) rarityCol = p.colIdx;
      if ( p.fieldIdx === 4 ) roleCols.push( p.colIdx );
    }
  );

  // If neither rarity nor role columns exist, nothing to do
  if ( rarityCol == null && roleCols.length === 0 ) return;

  // Build a map of which absolute sheet rows we need to check
  var rowMap = { };
  var allRowsNeeded = [ ];
  items.forEach(
    function( item, index ) {
      // Prefer __row when present (attachRowMeta), otherwise fallback to computed row
      var rowAbs = ( item.__row !== undefined && item.__row !== null )
        ? Number( item.__row )
        : ( startRow + ( index * recordHeight ) );

      if ( !rowMap[ rowAbs ] ) {
        rowMap[ rowAbs ] = [ ];
        allRowsNeeded.push( rowAbs );
      }
      rowMap[ rowAbs ].push( item );
    }
  );

  if ( allRowsNeeded.length === 0 ) return;

  allRowsNeeded.sort(
    function( a, b ) { return a - b; }
  );

  // Group contiguous rows into spans to minimize getRange calls
  var spans = [ ];
  var spanStart = allRowsNeeded[ 0 ];
  var prev = allRowsNeeded[ 0 ];
  for ( var i = 1; i < allRowsNeeded.length; i++ ) {
    var current = allRowsNeeded[ i ];
    if ( current !== prev + 1 ) {
      spans.push( { start: spanStart, end: prev } );
      spanStart = current;
    }
    prev = current;
  }
  spans.push( { start: spanStart, end: prev } );

  // Process each span of rows
  spans.forEach(
    function( span ) {
      var numRows = span.end - span.start + 1;

      // Get rarity backgrounds for the span
      var rarityBgs = ( rarityCol != null )
        ? sheet.getRange( span.start, rarityCol, numRows, 1 ).getBackgrounds( )
        : null;

      // Get role font colors for the span (min..max so we can index offsets)
      var roleFonts = null;
      var minRoleCol = 0;
      var maxRoleCol = 0;
      if ( roleCols.length > 0 ) {
        minRoleCol = Math.min.apply( null, roleCols );
        maxRoleCol = Math.max.apply( null, roleCols );
        roleFonts = sheet.getRange( span.start, minRoleCol, numRows, maxRoleCol - minRoleCol + 1 ).getFontColors( );
      }

      // Apply colors to the items in this span
      for ( var r = 0; r < numRows; r++ ) {
        var currentRow = span.start + r;
        var itemsOnThisRow = rowMap[ currentRow ];
        if ( !itemsOnThisRow ) continue;

        var rarity = rarityBgs ? rarityFromBg_( rarityBgs[ r ][ 0 ] ) : 'Common';

        // Determine dominion by scanning across all role columns for a non-empty mapping
        var dominion = '';
        if ( roleFonts ) {
          for ( var rc = 0; rc < roleCols.length; rc++ ) {
            var offset = roleCols[ rc ] - minRoleCol;
            var fc = roleFonts[ r ][ offset ];
            dominion = inferDominionFromFontColor_( fc );
            if ( dominion ) break;
          }
        }

        itemsOnThisRow.forEach(
          function( item ) {
            item.Rarity = rarity;

            if ( dominion ) {
              // Safer: prefer existing field name; otherwise write dominion
              if ( 'Dominion' in item ) item.Dominion = dominion;
              else item.Dominion = dominion;
            }
          }
        );
      }
    }
  );
}


/**
 * Font color mapping to faction/dominion.
 * This is also tolerant. If you know exact hexes, we can match precisely.
 */
function inferDominionFromFontColor_( fontHex ) {
  if ( !fontHex ) return '';

  // Handle named colors too
  var s = String( fontHex ).toLowerCase( );

  if ( s.indexOf( 'purple' ) >= 0 ) return 'Tortuga';
  if ( s.indexOf( 'red' ) >= 0 ) return 'Mayflower';
  if ( s.indexOf( 'green' ) >= 0 ) return 'FortEvo';
  if ( s.indexOf( 'blue' ) >= 0 ) return 'Freecon';

  if ( s.indexOf( '#' ) === 0 && s.length === 7 ) {
    var r = parseInt( s.substr( 1,2 ), 16 );
    var g = parseInt( s.substr( 3,2 ), 16 );
    var b = parseInt( s.substr( 5,2 ), 16 );

    // Purple: R and B high, G low-ish
    if ( r > 120 && b > 120 && g < 120 ) return 'Tortuga';
    // Red
    if ( r > g + 40 && r > b + 40 ) return 'Mayflower';
    // Green
    if ( g > r + 40 && g > b + 40 ) return 'FortEvo';
    // Blue
    if ( b > r + 40 && b > g + 40 ) return 'Freecon';
  }

  return '';
}

/**
 * Heuristic helpers for detecting green/blue in hex color.
 * This is intentionally forgiving because sheet creators may use slightly different shades.
 */
function looksGreen_( hex ) {
  // hex: #RRGGBB
  if ( !hex || hex.length !== 7 ) return false;
  var r = parseInt( hex.substr( 1,2 ), 16 );
  var g = parseInt( hex.substr( 3,2 ), 16 );
  var b = parseInt( hex.substr( 5,2 ), 16 );
  return g > r + 30 && g > b + 30;
}

function looksBlue_( hex ) {
  if ( !hex || hex.length !== 7 ) return false;
  var r = parseInt( hex.substr( 1,2 ), 16 );
  var g = parseInt( hex.substr( 3,2 ), 16 );
  var b = parseInt( hex.substr( 5,2 ), 16 );
  return b > r + 30 && b > g + 30;
}
