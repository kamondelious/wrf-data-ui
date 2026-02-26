/**
 * export.gs
 *
 * Entrypoints + orchestration + network/export.
 *
 * Move these here (once we copy them in):
 * - buildCatalogJson()  (main orchestrator)
 * - pushCatalogToAws()  (Lambda URL / MD5 / upload)
 * - any request signing helpers (HMAC) used for AWS pushes
 * - any debug/driver functions you run manually
 */

function buildCatalogJson( ) {
  var ss = SpreadsheetApp.openById( '12c9xH_C4Z6cbNr930HedczBHuBiX9rv4goK9FglbdXY' );

  var torsosSheet = ss.getSheetByName( 'Torsos' );
  var legsSheet = ss.getSheetByName( 'Legs' );
  var shouldersSheet = ss.getSheetByName( 'Shoulders' );
  var titansSheet = ss.getSheetByName( 'Titans' );
  var gearSheet = ss.getSheetByName( 'Gear' );
  var weaponsSheet = ss.getSheetByName( 'Weapons' );
  var pilotsSheet = ss.getSheetByName( 'Pilots' );

  // Single-section sheets: sheetToObjects returns { items: [...] } when cfg.type is missing
  var scanOpts = { log: false, attachRowMeta: true, useMergeFill: true, maxStop: 1 };

  var torsosRes    = sheetToObjects( torsosSheet, torsos_config, column_names, scanOpts ).items;
  var chassisRes   = sheetToObjects( legsSheet,  legs_config,   column_names, scanOpts ).items;
  var shouldersRes = sheetToObjects( shouldersSheet, shoulders_config, column_names, scanOpts ).items;
  var weaponsRes   = sheetToObjects( weaponsSheet, weapons_config, column_names, scanOpts ).items;

  var gearGrouped        = sheetToObjects( gearSheet,   gear_config,   column_names, scanOpts ).items;
  var titansGrouped      = sheetToObjects( titansSheet, titans_config, column_names, scanOpts ).items;
  var pilotsGrouped      = sheetToObjects( pilotsSheet, pilots_config, column_names, scanOpts ).items;
  var pilotTalentsGrouped= sheetToObjects( pilotsSheet, pilot_talents_config, column_names, scanOpts ).items;

  // Pilot talents: keep as tier -> array of {Name, Description}
  // cleanCatalogForExport_() will compact into { talentName: talentDescription } and preserve tier order.
  var pilotTalentsByTier = { };
  Object.keys( pilotTalentsGrouped ).forEach( function( categoryTypeKey ) { // e.g., "27", "40"
      var tierName = ( column_names[ Number( categoryTypeKey ) ] )
        ? column_names[ Number( categoryTypeKey ) ].trim( )
        : ( "Field_" + categoryTypeKey );
      pilotTalentsByTier[ tierName ] = pilotTalentsGrouped[ categoryTypeKey ] || [ ];
  } );

  // Enrichment: rarity + dominion inferred from formatting.
  // applyRarityAndDominionFromColors_ expects a sheet, config, and an array of items.
  // We need to iterate over the configs for single-section sheets.
  // For grouped items, we iterate over the types.

  // Single-section sheets (pass the single config and the flat array of items)
  torsos_config.forEach( function( cfg ) { applyRarityAndDominionFromColors_( torsosSheet, cfg, torsosRes ); } );
  legs_config.forEach( function( cfg ) { applyRarityAndDominionFromColors_( legsSheet, cfg, chassisRes ); } );
  shoulders_config.forEach( function( cfg ) { applyRarityAndDominionFromColors_( shouldersSheet, cfg, shouldersRes ); } );
  weapons_config.forEach( function( cfg ) { applyRarityAndDominionFromColors_( weaponsSheet, cfg, weaponsRes ); } );

  // Multi-section grouped sheets
  Object.keys( gearGrouped ).forEach( function( type ) {
      var cfg = gear_config.find( c => String( c.type ) === type ); // Find matching config
      if ( cfg ) applyRarityAndDominionFromColors_( gearSheet, cfg, gearGrouped[ type ] );
  } );

  Object.keys( titansGrouped ).forEach( function( type ) {
      var cfg = titans_config.find( c => String( c.type ) === type ); // Find matching config
      if ( cfg ) applyRarityAndDominionFromColors_( titansSheet, cfg, titansGrouped[ type ] );
  } );

  Object.keys( pilotsGrouped ).forEach( function( type ) {
      var cfg = pilots_config.find( c => String( c.type ) === type ); // Find matching config
      if ( cfg ) applyRarityAndDominionFromColors_( pilotsSheet, cfg, pilotsGrouped[ type ] );
  } );

  // Normalization
  // Note: normalizeWeaponFields_ and normalizeGearRoles_ expect an item object or an array of item objects
  // For flat arrays (torsosRes, etc.), we can directly use forEach.
  // For grouped objects, we need to iterate over the values (the arrays of items).

  torsosRes.forEach( normalizeWeaponFields_ ); // Assuming torsos can have weapon fields
  chassisRes.forEach( normalizeWeaponFields_ ); // Assuming chassis can have weapon fields
  shouldersRes.forEach( normalizeWeaponFields_ ); // Assuming shoulders can have weapon fields
  weaponsRes.forEach( normalizeWeaponFields_ );

  Object.values( titansGrouped ).flat( ).forEach( normalizeWeaponFields_ ); // Flatten all arrays within titansGrouped
  Object.values( gearGrouped ).flat( ).forEach( normalizeGearRoles_ ); // Flatten all arrays within gearGrouped

  var catalog = {
    torsos: stripMeta_( torsosRes ),
    chassis: stripMeta_( chassisRes ),
    shoulders: stripMeta_( shouldersRes ),
    weapons: stripMeta_( weaponsRes ),
    gear: stripMeta_( gearGrouped ),
    titans: stripMeta_( titansGrouped ),
    pilots: stripMeta_( pilotsGrouped ),
    pilotTalents: stripMeta_( pilotTalentsByTier )
  };

  // Final export shaping (e.g. keying by name, nesting titans)
  catalog = cleanCatalogForExport_( catalog );

  return JSON.stringify( catalog );
}

/********************
 * Push to AWS
 ********************/
function pushCatalogToAws( ) {
  var props = PropertiesService.getScriptProperties( );
  var url = props.getProperty( 'AWS_INGEST_URL' );
  var secret = props.getProperty( 'SHARED_SECRET' );

  if ( !url || !secret ) throw new Error( 'Missing AWS_INGEST_URL or SHARED_SECRET in Script Properties' );

  var json = buildCatalogJson( ); // raw JSON string
  var md5 = Utilities.base64Encode( Utilities.computeDigest( Utilities.DigestAlgorithm.MD5, json ) );

  var last = props.getProperty( 'LAST_CATALOG_MD5' );
  if ( last && last === md5 ) {
    Logger.log( 'No changes detected (MD5 match). Skipping upload.' );
    return;
  }

  var ts = Math.floor( Date.now( ) / 1000 ).toString( );
  var message = ts + '.' + json;

  var sigBytes = Utilities.computeHmacSha256Signature( message, secret );
  var sigB64 = Utilities.base64Encode( sigBytes );

  var resp = UrlFetchApp.fetch( url, {
    method: 'post',
    contentType: 'application/json',
    payload: json,
    muteHttpExceptions: true,
    headers: {
      'X-Timestamp': ts,
      'X-Signature': sigB64,
    },
  } );

  var code = resp.getResponseCode( );
  var body = resp.getContentText( );

  Logger.log( 'Ingest response: ' + code );
  Logger.log( body );

  if ( code >= 200 && code < 300 ) {
    props.setProperty( 'LAST_CATALOG_MD5', md5 );
  } else {
    throw new Error( 'Upload failed: ' + code + ' ' + body );
  }
}
