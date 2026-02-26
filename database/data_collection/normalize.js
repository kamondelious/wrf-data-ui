/**
 * normalize.gs
 *
 * Normalization + shaping helpers that operate on parsed objects.
 *
 * Move these here (once we copy them in):
 * - cleanItemArray_ / cleanGrouped_ / objectWithoutKeys_
 * - normalizeWeaponFields_ / normalizeGearRoles_ / fixWeaponMountFields_
 * - fixGearDualRole_ / nestTitansByName_ / mapArrayByKey_
 * - stripMeta_ / cleanCatalogForExport_
 * - any catalog shaping helpers that are NOT directly scanning or color-inference
 */

function cleanCatalogForExport_( catalog ) {
  // Mutates catalog into a low-processing, low-bloat schema for the web UI.
  // Key idea: most collections become objects keyed by Name (or Weapon Name) so the UI can do O(1) lookups.

  // 1) Fix known structural oddities before keying.
  if ( catalog.gear ) {
    // fixGearDualRole_ is a catalog-level normalizer (it expects catalog.gear.supply/cycle arrays).
    // Call it once here (before we convert arrays to maps) rather than per-item.
    fixGearDualRole_( catalog );
  }

  // Weapon mount columns on parts use two cols (Heavy, Light), not level (1,13).
  fixWeaponMountFields_( catalog.torsos );
  fixWeaponMountFields_( catalog.shoulders );

  // Ensure mount type letters are normalized everywhere they may appear.
  cleanItemArray_( catalog.torsos );
  cleanItemArray_( catalog.chassis );
  cleanItemArray_( catalog.shoulders );
  cleanItemArray_( catalog.weapons );
  if ( catalog.gear ) {
    cleanItemArray_( catalog.gear.supply );
    cleanItemArray_( catalog.gear.cycle );
  }

  // Pilots: collapse Ace Talent arrays (should be a single value), drop Section Type.
  if ( catalog.pilots ) {
    Object.keys( catalog.pilots ).forEach( function( pType ) {
      var arr = catalog.pilots[ pType ];
      if ( !Array.isArray( arr ) ) return;
      arr.forEach( function( p ) {
        if ( !p ) return;
        if ( Array.isArray( p[ 'Ace Talent' ] ) ) {
          // Often repeated across the 3 hero rows; take the first non-empty.
          var ace = '';
          for ( var i = 0; i < p[ 'Ace Talent' ].length; i++ ) {
            var v = ( p[ 'Ace Talent' ][ i ] == null ) ? '' : String( p[ 'Ace Talent' ][ i ] ).trim( );
            if ( v ) { ace = v; break; }
          }
          p[ 'Ace Talent' ] = ace;
        }
        if ( 'Section Type' in p ) delete p[ 'Section Type' ];
        // Specific cleanup: Rex Cole sheet label includes event suffix; export should use canonical name.
        // Be tolerant of stray whitespace / NBSP by normalizing first.
        var _rawName = ( p[ 'Name' ] == null ) ? '' : String( p[ 'Name' ] );
        var _normName = _rawName.split( String.fromCharCode( 160 ) ).join( ' ' ).trim( );
        while ( _normName.indexOf( '  ' ) !== -1 ) _normName = _normName.split( '  ' ).join( ' ' );
        if ( _normName === 'Rex Cole (Christmas Event)' || ( _normName.indexOf( 'Rex Cole' ) === 0 && _normName.indexOf( '(' ) !== -1 ) ) {
          p[ 'Name' ] = 'Rex Cole';
        }
      } );
    } );
  }

  // Titans: clean arrays in each bucket (and later nest under titan name).
  if ( catalog.titans ) {
    Object.keys( catalog.titans ).forEach( function( sec ) {
      cleanItemArray_( catalog.titans[ sec ] );
    } );
  }

  // 2) Pilot talents: convert to tier -> { name: desc } and keep tier order.
  // pilotTalentTiers is the single source of truth for ordering in the UI.
  catalog.pilotTalentTiers = pilotTalentTiers.slice( );
  buildPilotTalentsTierMap_( catalog, catalog.pilotTalentTiers );

  // 3) Convert collections to maps keyed by Name to avoid array scans on low-end devices.
  catalog.torsos = mapArrayByKey_( catalog.torsos, 'Name', true );
  catalog.chassis = mapArrayByKey_( catalog.chassis, 'Name', true );
  catalog.shoulders = mapArrayByKey_( catalog.shoulders, 'Name', true );
  catalog.weapons = mapArrayByKey_( catalog.weapons, 'Name', true );

  if ( catalog.gear ) {
    catalog.gear = {
      supply: mapArrayByKey_( catalog.gear.supply, 'Name', true ),
      cycle: mapArrayByKey_( catalog.gear.cycle, 'Name', true )
    };
  }

  if ( catalog.pilots ) {
    // Keep the buckets (Hero/Common), but key within each bucket by pilot name.
    Object.keys( catalog.pilots ).forEach( function( pType ) {
      catalog.pilots[ pType ] = mapArrayByKey_( catalog.pilots[ pType ], 'Name', true );
    } );
  }

  if ( catalog.titans ) {
    // Titans are not interchangeable, so nest everything under titan name:
    // titans: { Alpha: { Chassis:{...}, Torso:{...}, "Left Shoulder":{...}, "Right Shoulder":{...}, Weapons:{...} } }
    catalog.titans = nestTitansByName_( catalog.titans );
  }

  return catalog;
}


function cleanGrouped_( groupedObj ) {
  if ( !groupedObj ) return;
  Object.keys( groupedObj ).forEach( function( k ) {
    var arr = groupedObj[ k ];
    cleanItemArray_( arr );
  } );
}

function cleanItemArray_( arr ) {
  if ( !arr || !arr.length ) {
    Logger.log( 'cleanItemArray_() was passed an empty array.' );
    return;
  }

  var record = 0;
  arr.forEach( function( it ) {
    if ( !it ) {
      Logger.log( 'cleanItemArray_() Record '+ record +' is empty.' );
      return;
    }

    // Remove section/meta noise
    delete it[ 'Section Type' ];
    delete it[ '__row' ];

    // Normalize common name suffix noise (sheet sometimes uses trailing asterisks to denote variants/events)
    if ( it[ 'Name' ] != null && String( it[ 'Name' ] ).trim( ) !== '' ) {
      it[ 'Name' ] = String( it[ 'Name' ] ).replace( /\s*\*+$/g, '' ).trim( );
    }
    // Titan weapons use a separate 'Weapon Name' field; strip trailing * there too.
    if ( it[ 'Weapon Name' ] != null && String( it[ 'Weapon Name' ] ).trim( ) !== '' ) {
      it[ 'Weapon Name' ] = String( it[ 'Weapon Name' ] ).replace( /\s*\*+$/g, '' ).trim( );
    }

    // Normalize Weapon Mount Type
    if ( it[ 'Weapon Mount Type' ] === 'L' ) it[ 'Weapon Mount Type' ] = 'Light';
    else if ( it[ 'Weapon Mount Type' ] === 'H' ) it[ 'Weapon Mount Type' ] = 'Heavy';

    record += 1;
  } );
}

function fixGearDualRole_( catalog ) {
  if ( !catalog || !catalog.gear ) return;

  [ 'supply', 'cycle' ].forEach( function( t ) {
    var arr = catalog.gear[ t ];
    if ( !arr || !arr.length ) return;

    arr.forEach( function( it ) {
      // If Lock-on is blank (often due to merged cells), treat it as 0
      if ( isBlank_( it[ column_names[ 39 ] ] ) ) it[ column_names[ 39 ] ] = '0';

      var v = it[ column_names[ 4 ] ];
      // If Role is incorrectly shaped like { "1": "...", "13": "..." }, convert to ["...","..."]
      if ( v && typeof v === 'object' && ( v[ '1' ] != null || v[ '13' ] != null ) ) {
        var a = [ ];
        if ( v[ '1' ] != null && String( v[ '1' ] ).trim( ) !== '' ) a.push( String( v[ '1' ] ).trim( ) );
        if ( v[ '13' ] != null && String( v[ '13' ] ).trim( ) !== '' ) a.push( String( v[ '13' ] ).trim( ) );
        // Dedup
        var seen = { };
        var out = [ ];
        a.forEach( function( x ) { if ( !seen[ x ] ) { seen[ x ] = true; out.push( x ); } } );
        it[ column_names[ 4 ] ] = out;
      }
    } );
  } );
}

function buildPilotTalentsTierMap_( catalog, tierNames ) {
  // Source of truth is the sheet (raw grouped pilot talents), not pilot usage.
  var grouped = catalog.pilotTalents || { };
  var out = { };

  tierNames.forEach( function( tier ) {
    out[ tier ] = { };
    var bucket = grouped[ tier ];

    var items = [ ];
    if ( Array.isArray( bucket ) ) items = bucket;

    items.forEach( function( it ) {
      if ( !it ) return;
      var name = ( it[ 'Name' ] == null ) ? '' : String( it[ 'Name' ] ).trim( );
      var desc = ( it[ 'Description' ] == null ) ? '' : String( it[ 'Description' ] ).trim( );
      if ( !name || !desc ) return;
      out[ tier ][ name ] = desc;
    } );
  } );

  catalog.pilotTalents = out;
  return out;
}

function objectWithoutKeys_( obj, dropKeys ) {
  var out = { };
  if ( !obj ) return out;
  for ( var k in obj ) {
    if ( !Object.prototype.hasOwnProperty.call( obj, k ) ) continue;
    if ( dropKeys.indexOf( k ) !== -1 ) continue;
    out[ k ] = obj[ k ];
  }
  return out;
}

function mapArrayByKey_( arr, keyField, dropKeyField ) {
  var out = { };
  if ( !Array.isArray( arr ) ) return out;

  arr.forEach( function( it ) {
    if ( !it ) return;
    var key = ( it[ keyField ] == null ) ? '' : String( it[ keyField ] ).trim( );
    if ( !key ) return;

    var drop = [ 'Section Type' ];
    if ( dropKeyField ) drop.push( keyField );
    out[ key ] = objectWithoutKeys_( it, drop );
  } );

  return out;
}

function fixWeaponMountFields_( arr ) {
  if ( !Array.isArray( arr ) ) return;

  arr.forEach( function( it ) {
    if ( !it ) return;

    var wc = it[ 'Weapon Mount Count' ];
    if ( wc && typeof wc === 'object' && !Array.isArray( wc ) ) {
      // On these sheets, the two columns represent Heavy count then Light count, not (lvl1,lvl13).
      var heavy = parseInt( wc[ '1' ] || '0', 10 ) || 0;
      var light = parseInt( wc[ '13' ] || '0', 10 ) || 0;

      if ( heavy > 0 ) {
        it[ 'Weapon Mount Count' ] = String( heavy );
        it[ 'Weapon Mount Type' ] = 'Heavy';
      } else if ( light > 0 ) {
        it[ 'Weapon Mount Count' ] = String( light );
        it[ 'Weapon Mount Type' ] = 'Light';
      } else {
        it[ 'Weapon Mount Count' ] = '0';
        if ( 'Weapon Mount Type' in it ) delete it[ 'Weapon Mount Type' ];
      }
    }
  } );
}

function nestTitansByName_( titansByType ) {
  var out = { };
  if ( !titansByType ) return out;

  Object.keys( titansByType ).forEach( function( section ) {
    var arr = titansByType[ section ];
    if ( !Array.isArray( arr ) ) return;

    arr.forEach( function( it ) {
      if ( !it ) return;

      var titanName = ( it[ 'Name' ] == null ) ? '' : String( it[ 'Name' ] ).trim( );
      titanName = titanName.replace( /\s*\*+$/g, '' );
      if ( !titanName ) return;

      if ( !out[ titanName ] ) out[ titanName ] = { };

      if ( section === 'Weapon' ) {
        var weaponName = ( it[ 'Weapon Name' ] == null ) ? '' : String( it[ 'Weapon Name' ] ).trim( );
        weaponName = weaponName.replace( /[*]+$/g, '' );
        if ( !weaponName ) return;

        if ( !out[ titanName ][ 'Weapons' ] ) out[ titanName ][ 'Weapons' ] = { };
        out[ titanName ][ 'Weapons' ][ weaponName ] = objectWithoutKeys_( it, [ 'Name', 'Weapon Name', 'Section Type' ] );
      } else {
        out[ titanName ][ section ] = objectWithoutKeys_( it, [ 'Name', 'Section Type' ] );
      }
    } );
  } );

  return out;
}

function indexByName_( arr, field ) {
  var out = { };
  if ( !arr || !arr.length ) return out;
  for ( var i = 0; i < arr.length; i++ ) {
    var it = arr[ i ];
    if ( !it ) continue;
    var name = it[ field ];
    if ( name == null || String( name ).trim( ) === '' ) continue;
    out[ String( name ) ] = i;
  }
  return out;
}

function buildPilotTalentUsage_( pilotsGrouped, tierNames ) {
  // usage[tier][talentName] = true
  var usage = { };
  tierNames.forEach( function( t ) { usage[ t ] = { }; } );

  if ( !pilotsGrouped ) return usage;

  Object.keys( pilotsGrouped ).forEach( function( section ) {
    var arr = pilotsGrouped[ section ];
    if ( !Array.isArray( arr ) ) return;

    arr.forEach( function( p ) {
      if ( !p ) return;

      // Current pilot shape in your output has tier fields at top-level:
      // "General Talent": [..], "Role Talent": [..], ... and "Ace Talent": "..."
      tierNames.forEach( function( tier ) {
        if ( tier === 'Ace Talent' ) {
          var a = p[ 'Ace Talent' ];
          if ( a != null && String( a ).trim( ) !== '' ) usage[ tier ][ String( a ).trim( ) ] = true;
        } else {
          var list = p[ tier ];
          if ( Array.isArray( list ) ) {
            list.forEach( function( n ) {
              if ( n != null && String( n ).trim( ) !== '' ) usage[ tier ][ String( n ).trim( ) ] = true;
            } );
          }
        }
      } );
    } );
  } );

  return usage;
}

function buildIndexes_( catalog ) {
  // Small maps to avoid UI preprocessing on weak devices
  var idx = { };

  idx.torsosByName = indexByName_( catalog.torsos, 'Name' );
  idx.chassisByName = indexByName_( catalog.chassis, 'Name' );
  idx.shouldersByName = indexByName_( catalog.shoulders, 'Name' );
  idx.weaponsByName = indexByName_( catalog.weapons, 'Name' );

  if ( catalog.gear ) {
    idx.gearSupplyByName = indexByName_( catalog.gear.supply, 'Name' );
    idx.gearCycleByName = indexByName_( catalog.gear.cycle, 'Name' );
  }

  if ( catalog.pilots ) {
    idx.pilotsHeroByName = indexByName_( catalog.pilots.Hero, 'Name' );
    idx.pilotsCommonByName = indexByName_( catalog.pilots.Common, 'Name' );
  }

  if ( catalog.titans ) {
    idx.titansChassisByName = indexByName_( catalog.titans.Chassis, 'Name' );
    idx.titansTorsoByName = indexByName_( catalog.titans.Torso, 'Name' );
    idx.titansRightShoulderByName = indexByName_( catalog.titans[ 'Right Shoulder' ], 'Name' );
    idx.titansLeftShoulderByName = indexByName_( catalog.titans[ 'Left Shoulder' ], 'Name' );
    // Titan weapons: index by Weapon Name if present, else Name
    idx.titansWeaponByWeaponName = indexByName_( catalog.titans.Weapon, 'Weapon Name' );
  }

  return idx;
}

/**
 * Remove internal metadata fields (like __row) from an object or array of objects.
 */
function stripMeta_( x ) {
  if ( Array.isArray( x ) ) return x.map( stripMeta_ );
  if ( !x || typeof x !== 'object' ) return x;

  var out = { };
  Object.keys( x ).forEach( function( k ) {
    if ( k === '__row' ) return;
    out[ k ] = stripMeta_( x[ k ] );
  } );
  return out;
}

/**
 * Normalize weapon fields:
 * - Damage Type: Electro -> Electromagnetic
 * - Type: RPG -> Rocket Launcher
 * - Maximum Range: if blank, fill from Effective Range
 *
 * Works with display-value strings.
 */
function normalizeWeaponFields_( obj ) {
  if ( !obj || typeof obj !== 'object' ) return;

  if ( obj[ 'Damage Type' ] === 'Electro' ) obj[ 'Damage Type' ] = 'Electromagnetic';
  if ( obj[ 'Type' ] === 'RPG' ) obj[ 'Type' ] = 'Rocket Launcher';

  var maxR = obj[ 'Maximum Range' ];
  var effR = obj[ 'Effective Range' ];
  if ( isBlank_( maxR ) && !isBlank_( effR ) ) obj[ 'Maximum Range' ] = effR;
}

function normalizeGearRoles_( item ) {
  var r = item[ column_names[ 4 ] ];
  if ( !r || typeof r !== 'object' || Array.isArray( r ) ) return;

  var a = r[ '1' ];
  var b = r[ '13' ];

  // If it's not actually the {1,13} pattern, bail.
  if ( a == null && b == null ) return;

  var out = [ ];
  if ( a != null && String( a ).trim( ) !== '' ) out.push( String( a ).trim( ) );
  if ( b != null && String( b ).trim( ) !== '' ) out.push( String( b ).trim( ) );

  // de-dupe while keeping order
  var seen = { };
  out = out.filter( function( x ){ if ( seen[ x ] ) return false; seen[ x ] = true; return true; } );

  item[ column_names[ 4 ] ] = out;
}


