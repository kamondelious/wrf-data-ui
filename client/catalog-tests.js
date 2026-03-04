/**
 * WRF Catalog Test Suite
 *
 * Single self-contained IIFE — zero dependencies.
 * Detects viewport and runs the appropriate test categories.
 *
 * Usage (via Playwright MCP browser_evaluate):
 *   Desktop:   browser_resize(1280,800)  → navigate → evaluate this file
 *   Portrait:  browser_resize(375,667)   → navigate → evaluate this file
 *   Landscape: browser_resize(667,375)   → navigate → evaluate this file
 */
( function() {
  "use strict";

  /* ------------------------------------------------------------------ */
  /*  Console hooks                                                     */
  /* ------------------------------------------------------------------ */
  const _errors = [];
  const _warns  = [];
  const origError = console.error;
  const origWarn  = console.warn;
  console.error = ( ...a ) => { _errors.push( a.join( " " ) ); origError.apply( console, a ); };
  console.warn  = ( ...a ) => { _warns.push( a.join( " " ) );  origWarn.apply( console, a );  };

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                           */
  /* ------------------------------------------------------------------ */
  const $  = ( s, ctx ) => ( ctx || document ).querySelector( s );
  const $$ = ( s, ctx ) => [ ...( ctx || document ).querySelectorAll( s ) ];

  function visibleRows() {
    return $$( "#dataList .row" ).filter(
      r => getComputedStyle( r ).display !== "none"
    ).length;
  }

  function switchTo( section ) {
    const tab = $( `.tab[data-section="${ section }"]` );
    if ( !tab ) return 0;
    tab.click();
    return visibleRows();
  }

  function ensureFilters( visible ) {
    const ft = $( '.tab[data-section="filters"]' );
    if ( !ft ) return;
    const active = ft.classList.contains( "active" );
    if ( visible !== active ) ft.click();
  }

  function resetPin() {
    const b = $( ".brand" );
    if ( b ) b.click();
  }

  function getFilterSelect( title ) {
    for ( const box of $$( ".filter-content .filter-box" ) ) {
      const t = $( ".filter-box-title", box );
      if ( t && t.textContent.trim() === title ) return $( "select", box );
    }
    return null;
  }

  function setFilter( title, values ) {
    const sel = getFilterSelect( title );
    if ( !sel ) return false;
    for ( const o of sel.options ) o.selected = values.includes( o.value );
    sel.dispatchEvent( new Event( "change" ) );
    return true;
  }

  function clearAll() {
    const btn = $( "#clearFiltersBtn" );
    if ( btn ) btn.click();
  }

  function assert( id, name, cond, detail ) {
    return { id, name, pass: !!cond, detail: detail || "" };
  }

  function summarize( name, tests ) {
    const pass = tests.filter( t => t.pass ).length;
    return { name, total: tests.length, pass, fail: tests.length - pass, tests };
  }

  const MOBILE  = window.innerWidth <= 768;
  const LANDSCAPE = MOBILE && window.innerWidth > window.innerHeight;
  const PORTRAIT  = MOBILE && !LANDSCAPE;
  const DESKTOP   = !MOBILE;

  const SEC_KEYS = [ "pilots", "torsos", "chassis", "shoulders", "weapons", "gear", "titans" ];
  const EXPECTED_COLS = { pilots: 9, torsos: 11, chassis: 15, shoulders: 13, weapons: 18, gear: 13, titans: 6 };

  /* ------------------------------------------------------------------ */
  /*  1 · Page Load                                                     */
  /* ------------------------------------------------------------------ */
  function testPageLoad() {
    const t = [];

    // 1.1 No JS errors on load
    t.push( assert( "1.1", "No JS errors on load", _errors.length === 0,
      _errors.length ? `${ _errors.length }: ${ _errors.join( "; " ) }` : "Clean" ) );

    // 1.2 Catalog JSON loaded
    const res = performance.getEntriesByType( "resource" );
    const cat = res.find( r => r.name.includes( "Ultimate_WRF_Data_Sheet.json" ) );
    t.push( assert( "1.2", "Catalog JSON loaded", !!cat,
      cat ? `${ Math.round( cat.duration ) }ms` : "Not found" ) );

    // 1.3 Eight tabs
    t.push( assert( "1.3", "8 tabs present", $$( ".tab" ).length === 8,
      `${ $$( ".tab" ).length }` ) );

    // 1.4 Filters tab
    t.push( assert( "1.4", "Filters tab exists", !!$( '[data-section="filters"]' ) ) );

    // 1.5 Default section has rows
    const active = $( ".tab.active" );
    const sec = active ? active.dataset.section : "none";
    const rc = visibleRows();
    t.push( assert( "1.5", "Default section has rows", rc > 0,
      `${ sec }: ${ rc } rows` ) );

    // 1.6 Navigation timing
    const nav = performance.getEntriesByType( "navigation" )[ 0 ];
    t.push( assert( "1.6", "Navigation timing available", !!nav,
      nav ? `DCL ${ Math.round( nav.domContentLoadedEventEnd ) }ms` : "N/A" ) );

    return summarize( "Page Load", t );
  }

  /* ------------------------------------------------------------------ */
  /*  2 · Section Navigation                                            */
  /* ------------------------------------------------------------------ */
  function testSectionNavigation() {
    const t = [];

    for ( let i = 0; i < SEC_KEYS.length; i++ ) {
      const sec = SEC_KEYS[ i ];
      const n = i + 1;
      const count = switchTo( sec );

      const activeTab = $( ".tab.active" );
      t.push( assert( `2.${ n }a`, `${ sec }: tab active`,
        activeTab && activeTab.dataset.section === sec ) );

      t.push( assert( `2.${ n }b`, `${ sec }: rows > 0`, count > 0,
        `${ count } rows` ) );

      const cols = $$( "#listHead .head-btn" ).length;
      t.push( assert( `2.${ n }c`, `${ sec }: ${ EXPECTED_COLS[ sec ] } columns`,
        cols === EXPECTED_COLS[ sec ],
        `expected ${ EXPECTED_COLS[ sec ] }, got ${ cols }` ) );

      t.push( assert( `2.${ n }d`, `${ sec }: data rows exist`,
        $$( "#dataList .row" ).length > 0 ) );

      // Verify switching away and back yields correct section
      if ( i < SEC_KEYS.length - 1 ) {
        switchTo( SEC_KEYS[ ( i + 1 ) % SEC_KEYS.length ] );
        switchTo( sec );
        const still = $( ".tab.active" );
        t.push( assert( `2.${ n }e`, `${ sec }: survives round-trip`,
          still && still.dataset.section === sec ) );
      } else {
        t.push( assert( `2.${ n }e`, `${ sec }: last section`, true ) );
      }
    }
    return summarize( "Section Navigation", t );
  }

  /* ------------------------------------------------------------------ */
  /*  3 · Filters                                                       */
  /* ------------------------------------------------------------------ */
  function testFilters() {
    const t = [];

    // 3.1 Toggle visibility
    switchTo( "weapons" );
    ensureFilters( true );
    const fr = $( "#filterRow" );
    t.push( assert( "3.1", "Filter row visible",
      fr && getComputedStyle( fr ).display !== "none" ) );

    // 3.2 Filter boxes exist
    const boxes = $$( ".filter-content .filter-box" );
    t.push( assert( "3.2", "Filter boxes exist", boxes.length > 0,
      `${ boxes.length } boxes` ) );

    // 3.3 Pilots: no filter-selection picker
    switchTo( "pilots" );
    ensureFilters( true );
    const pfh = $( ".filter-header" );
    t.push( assert( "3.3", "Pilots: no filter picker",
      pfh && getComputedStyle( pfh ).display === "none" ) );

    // 3.4 Non-pilot: picker visible
    switchTo( "weapons" );
    ensureFilters( true );
    const wfh = $( ".filter-header" );
    t.push( assert( "3.4", "Weapons: filter picker visible",
      wfh && getComputedStyle( wfh ).display !== "none" ) );

    // 3.5 Single filter narrows results
    const total = visibleRows();
    setFilter( "Rarity", [ "Rare" ] );
    const rareCount = visibleRows();
    t.push( assert( "3.5", "Rarity=Rare narrows results",
      rareCount < total && rareCount > 0,
      `${ total } → ${ rareCount }` ) );

    // 3.6 AND: adding Class narrows further
    setFilter( "Class", [ "Assault" ] );
    const andCount = visibleRows();
    t.push( assert( "3.6", "AND: Rare+Assault narrows further",
      andCount <= rareCount,
      `${ rareCount } → ${ andCount }` ) );

    // 3.7 OR: multiple rarity values
    clearAll();
    setFilter( "Rarity", [ "Rare" ] );
    const r1 = visibleRows();
    setFilter( "Rarity", [ "Rare", "Common" ] );
    const r2 = visibleRows();
    t.push( assert( "3.7", "OR: Rare+Common > Rare only",
      r2 > r1, `${ r1 } → ${ r2 }` ) );

    // 3.8 Clear Filters restores all
    clearAll();
    t.push( assert( "3.8", "Clear restores all rows",
      visibleRows() === total, `${ visibleRows() }/${ total }` ) );

    // 3.9 No-results state
    // Try Torsos: Assault class + Light WMT
    switchTo( "torsos" );
    ensureFilters( true );
    setFilter( "Class", [ "Assault" ] );
    setFilter( "Weapon Mount Type", [ "Light" ] );
    let zeroHit = visibleRows() === 0;

    if ( !zeroHit ) {
      // Fallback: Pilots Hero + iterate Class
      clearAll();
      switchTo( "pilots" );
      ensureFilters( true );
      setFilter( "Rarity", [ "Hero" ] );
      const cSel = getFilterSelect( "Class" );
      if ( cSel ) {
        for ( const o of cSel.options ) {
          setFilter( "Class", [ o.value ] );
          if ( visibleRows() === 0 ) { zeroHit = true; break; }
        }
      }
    }
    const nrEl = $( "#noResults" );
    t.push( assert( "3.9", "No-results message shown",
      zeroHit && nrEl && !nrEl.classList.contains( "hidden" ),
      zeroHit ? "Zero-result combo found" : "Could not reach 0 results" ) );
    clearAll();

    // 3.10 Filter order is subsequence of column order
    switchTo( "weapons" );
    ensureFilters( true );
    const hdrs = $$( "#listHead .head-btn" ).map( b => b.dataset.col );
    const fTitles = $$( ".filter-content .filter-box" )
      .filter( b => getComputedStyle( b ).display !== "none" )
      .map( b => {
        const te = $( ".filter-box-title", b );
        return te ? te.textContent.trim() : "";
      } );
    let hi = 0;
    let subseq = true;
    for ( const ft of fTitles ) {
      while ( hi < hdrs.length && hdrs[ hi ] !== ft ) hi++;
      if ( hi >= hdrs.length ) { subseq = false; break; }
      hi++;
    }
    t.push( assert( "3.10", "Filter order matches column order", subseq,
      `Filters: ${ fTitles.join( ", " ) }` ) );

    clearAll();
    ensureFilters( false );
    return summarize( "Filters", t );
  }

  /* ------------------------------------------------------------------ */
  /*  4 · Sorting                                                       */
  /* ------------------------------------------------------------------ */
  function testSorting() {
    const t = [];
    switchTo( "torsos" );
    resetPin();

    const visNames = () => $$( "#dataList .row" )
      .filter( r => getComputedStyle( r ).display !== "none" )
      .map( r => {
        const c = $( '.col[data-col="Name"]', r );
        return c ? c.textContent.trim() : "";
      } );

    // 4.1 Click Name header → sorted
    const nh = $( '#listHead .head-btn[data-sort="Name"]' );
    if ( nh ) nh.click();
    t.push( assert( "4.1", "Name sort applied",
      nh && ( nh.classList.contains( "sorted-asc" ) ||
              nh.classList.contains( "sorted-desc" ) ) ) );

    // 4.2 Re-click reverses
    const d1 = nh.classList.contains( "sorted-asc" ) ? "asc" : "desc";
    nh.click();
    const d2 = nh.classList.contains( "sorted-asc" ) ? "asc" : "desc";
    t.push( assert( "4.2", "Re-click reverses direction", d1 !== d2,
      `${ d1 } → ${ d2 }` ) );

    // 4.3 Sort indicator element exists
    t.push( assert( "4.3", "Sort indicator exists", !!$( ".sort-ind", nh ) ) );

    // 4.4 Numeric sort (Armor) is correct
    const ah = $( '#listHead .head-btn[data-sort="Armor"]' );
    if ( ah ) ah.click();
    if ( ah && ah.classList.contains( "sorted-desc" ) ) ah.click(); // ensure asc
    const armorVals = $$( "#dataList .row" )
      .filter( r => getComputedStyle( r ).display !== "none" )
      .map( r => {
        const c = $( '.col[data-col="Armor"]', r );
        if ( !c ) return NaN;
        return parseFloat( c.textContent.trim().replace( /[^0-9.-]/g, "" ) ) || 0;
      } );
    let numOk = true;
    for ( let i = 1; i < armorVals.length; i++ ) {
      if ( armorVals[ i ] < armorVals[ i - 1 ] ) { numOk = false; break; }
    }
    t.push( assert( "4.4", "Armor sort numerically correct", numOk,
      `First 5: ${ armorVals.slice( 0, 5 ).join( ", " ) }` ) );

    // 4.5 Sort + filter preserves order
    ensureFilters( true );
    setFilter( "Rarity", [ "Rare" ] );
    const filtArmor = $$( "#dataList .row" )
      .filter( r => getComputedStyle( r ).display !== "none" )
      .map( r => {
        const c = $( '.col[data-col="Armor"]', r );
        return c ? parseFloat( c.textContent.trim().replace( /[^0-9.-]/g, "" ) ) || 0 : NaN;
      } );
    let filtOk = true;
    for ( let i = 1; i < filtArmor.length; i++ ) {
      if ( filtArmor[ i ] < filtArmor[ i - 1 ] ) { filtOk = false; break; }
    }
    t.push( assert( "4.5", "Sort preserved after filter",
      filtOk && filtArmor.length > 0,
      `${ filtArmor.length } rows, sorted: ${ filtOk }` ) );

    clearAll();
    ensureFilters( false );
    // Reset sort to Name
    const nh2 = $( '#listHead .head-btn[data-sort="Name"]' );
    if ( nh2 ) nh2.click();
    return summarize( "Sorting", t );
  }

  /* ------------------------------------------------------------------ */
  /*  5 · Column Visibility                                             */
  /* ------------------------------------------------------------------ */
  function testColumnVisibility() {
    const t = [];
    switchTo( "torsos" );

    // 5.1 Name has no vis-btn
    const nameBtn = $( '#listHead .head-btn[data-col="Name"]' );
    t.push( assert( "5.1", "Name has no vis-btn",
      !$( ".col-vis-btn", nameBtn ) ) );

    // 5.2 Hide Rarity
    const rarBtn = $( '#listHead .head-btn[data-col="Rarity"]' );
    const rarVis = rarBtn ? $( ".col-vis-btn", rarBtn ) : null;
    if ( rarVis ) rarVis.click();
    t.push( assert( "5.2", "Rarity hidden",
      rarBtn && rarBtn.classList.contains( "col-hidden" ) ) );

    // 5.3 --cols includes 28px
    const lh = $( "#listHead" );
    const cv = lh ? getComputedStyle( lh ).getPropertyValue( "--cols" ) : "";
    t.push( assert( "5.3", "--cols has 28px", cv.includes( "28px" ),
      cv.substring( 0, 80 ) ) );

    // 5.4 Data cells also hidden
    const row1 = $( "#dataList .row" );
    const rarCell = row1 ? $( '.col[data-col="Rarity"]', row1 ) : null;
    t.push( assert( "5.4", "Data cell has col-hidden",
      rarCell && rarCell.classList.contains( "col-hidden" ) ) );

    // 5.5 Unhide restores
    if ( rarVis ) rarVis.click();
    t.push( assert( "5.5", "Unhide restores column",
      rarBtn && !rarBtn.classList.contains( "col-hidden" ) ) );

    // 5.6 Pilots: talent cols no vis-btn, Rarity/Class/Dominion have one
    switchTo( "pilots" );
    const pGen = $( '#listHead .head-btn[data-col="General Talent"]' );
    const pRar = $( '#listHead .head-btn[data-col="Rarity"]' );
    t.push( assert( "5.6", "Pilots: talent no vis-btn, Rarity has one",
      pGen && !$( ".col-vis-btn", pGen ) &&
      pRar && !!$( ".col-vis-btn", pRar ) ) );

    return summarize( "Column Visibility", t );
  }

  /* ------------------------------------------------------------------ */
  /*  6 · Description Panel — Desktop                                   */
  /* ------------------------------------------------------------------ */
  function testDescriptionDesktop() {
    const t = [];
    switchTo( "torsos" );
    resetPin();
    ensureFilters( false );

    const dt = $( "#descTitle" );
    const dd = $( "#detailText" );

    // 6.1 Hover updates description
    const row0 = $( "#dataList .row" );
    if ( row0 ) row0.dispatchEvent( new MouseEvent( "mouseover", { bubbles: true } ) );
    const hTitle = dt ? dt.textContent.trim() : "";
    t.push( assert( "6.1", "Hover updates description",
      hTitle.length > 0 && hTitle !== "Description",
      `Title: ${ hTitle }` ) );

    // 6.2 Mouseout resets
    const dl = $( "#dataList" );
    if ( dl ) dl.dispatchEvent( new MouseEvent( "mouseout", { bubbles: true } ) );
    const rTitle = dt ? dt.textContent.trim() : "";
    t.push( assert( "6.2", "Mouseout resets description",
      rTitle === "Description" || rTitle !== hTitle,
      `After: ${ rTitle }` ) );

    // 6.3 Click pins
    if ( row0 ) row0.click();
    t.push( assert( "6.3", "Click pins description",
      row0 && row0.classList.contains( "pinned" ) &&
      dt.textContent.trim().length > 0 ) );

    // 6.4 Mouseout keeps pinned desc
    const pinTitle = dt.textContent.trim();
    if ( dl ) dl.dispatchEvent( new MouseEvent( "mouseout", { bubbles: true } ) );
    t.push( assert( "6.4", "Mouseout keeps pinned desc",
      dt.textContent.trim() === pinTitle ) );

    // 6.5 Click same unpins
    if ( row0 ) row0.click();
    t.push( assert( "6.5", "Re-click unpins",
      row0 && !row0.classList.contains( "pinned" ) ) );

    // 6.6 Pilot talent hover
    switchTo( "pilots" );
    resetPin();
    const talent = $( "#dataList .talent" );
    if ( talent ) talent.dispatchEvent( new MouseEvent( "mouseover", { bubbles: true } ) );
    t.push( assert( "6.6", "Pilot talent hover shows desc",
      talent && dd.textContent.trim().length > 0,
      dd ? dd.textContent.trim().substring( 0, 50 ) : "" ) );

    // 6.7 Talent click pins
    if ( talent ) talent.click();
    t.push( assert( "6.7", "Talent click pins",
      talent && talent.classList.contains( "pinned" ) ) );
    resetPin();

    // 6.8 Titan Torso hover
    switchTo( "titans" );
    resetPin();
    const torsoMod = $( '.kv-list[data-module="Torso"]' );
    if ( torsoMod ) torsoMod.dispatchEvent( new MouseEvent( "mouseover", { bubbles: true } ) );
    t.push( assert( "6.8", "Titan Torso hover shows desc",
      torsoMod && dd.textContent.trim().length > 0,
      dd ? dd.textContent.trim().substring( 0, 50 ) : "" ) );
    resetPin();

    // 6.9 Weapon nav — row innerHTML is rebuilt on click, so re-query within row
    const initNxt = $( '.weapon-nav-btn[data-dir="next"]' );
    const weaponRow = initNxt ? initNxt.closest( ".row" ) : null;
    if ( weaponRow ) {
      const before = $( ".weapon-nav-label", weaponRow ).textContent.trim();
      $( '.weapon-nav-btn[data-dir="next"]', weaponRow ).click();
      const after = $( ".weapon-nav-label", weaponRow ).textContent.trim();
      $( '.weapon-nav-btn[data-dir="prev"]', weaponRow ).click();
      const back = $( ".weapon-nav-label", weaponRow ).textContent.trim();
      t.push( assert( "6.9", "Weapon nav cycles",
        before !== after && back === before,
        `${ before } → ${ after } → ${ back }` ) );
    } else {
      t.push( assert( "6.9", "Weapon nav cycles", false, "No nav buttons" ) );
    }

    resetPin();
    return summarize( "Description Panel (Desktop)", t );
  }

  /* ------------------------------------------------------------------ */
  /*  7 · Description Drawer — Mobile                                   */
  /* ------------------------------------------------------------------ */
  function testDescriptionMobile() {
    const t = [];
    switchTo( "torsos" );
    resetPin();
    ensureFilters( false );

    const vis = () => $$( "#dataList .row" ).filter(
      r => getComputedStyle( r ).display !== "none"
    );

    // 7.1 Click row opens drawer
    const rows = vis();
    if ( rows[ 0 ] ) rows[ 0 ].click();
    const dr = $( ".desc-drawer.open" );
    t.push( assert( "7.1", "Click row opens drawer", !!dr ) );

    // 7.2 Drawer has content
    const dc = dr ? $( ".desc-drawer-content", dr ) : null;
    t.push( assert( "7.2", "Drawer has content",
      dc && dc.textContent.trim().length > 0 ) );

    // 7.3 Click same row closes
    if ( rows[ 0 ] ) rows[ 0 ].click();
    t.push( assert( "7.3", "Re-click closes drawer", !$( ".desc-drawer.open" ) ) );

    // 7.4 Click A then B — different content, single drawer
    if ( rows[ 0 ] ) rows[ 0 ].click();
    const tA = $( ".desc-drawer.open .desc-title" );
    const nameA = tA ? tA.textContent.trim() : "";
    if ( rows[ 1 ] ) rows[ 1 ].click();
    const tB = $( ".desc-drawer.open .desc-title" );
    const nameB = tB ? tB.textContent.trim() : "";
    t.push( assert( "7.4", "Switch rows updates drawer",
      nameA !== nameB && $$( ".desc-drawer" ).length === 1,
      `A=${ nameA }, B=${ nameB }` ) );

    // 7.5 Click brand closes drawer
    resetPin();
    t.push( assert( "7.5", "Click brand closes drawer", !$( ".desc-drawer.open" ) ) );

    // 7.6 Middle row
    const midRows = vis();
    const mid = midRows[ Math.floor( midRows.length / 2 ) ];
    if ( mid ) mid.click();
    t.push( assert( "7.6", "Middle row opens drawer", !!$( ".desc-drawer.open" ) ) );
    resetPin();

    // 7.7 Last row
    const lastRows = vis();
    const last = lastRows[ lastRows.length - 1 ];
    if ( last ) last.click();
    t.push( assert( "7.7", "Last row opens drawer", !!$( ".desc-drawer.open" ) ) );
    resetPin();

    // 7.8 Drawer content matches row
    const r3rows = vis();
    if ( r3rows[ 2 ] ) r3rows[ 2 ].click();
    const drTitle = $( ".desc-drawer.open .desc-title" );
    const nameCell = r3rows[ 2 ] ? $( '.col[data-col="Name"]', r3rows[ 2 ] ) : null;
    const expected = nameCell ? nameCell.textContent.trim() : "";
    const got = drTitle ? drTitle.textContent.trim() : "";
    t.push( assert( "7.8", "Drawer content matches row",
      expected && got.includes( expected ), `Row=${ expected }, Drawer=${ got }` ) );
    resetPin();

    // 7.9 Pilot talent drawer
    switchTo( "pilots" );
    resetPin();
    const tal = $( "#dataList .talent" );
    if ( tal ) tal.click();
    t.push( assert( "7.9", "Pilot talent opens drawer", !!$( ".desc-drawer.open" ),
      $( ".desc-drawer.open" ) ? "opened" : "no drawer" ) );
    resetPin();

    return summarize( "Description Drawer (Mobile)", t );
  }

  /* ------------------------------------------------------------------ */
  /*  8 · Level Slider                                                  */
  /* ------------------------------------------------------------------ */
  function testLevelSlider() {
    const t = [];

    // 8.1 Hidden for Pilots
    switchTo( "pilots" );
    ensureFilters( true );
    const lc = $( "#levelControl" );
    t.push( assert( "8.1", "Level hidden for Pilots",
      lc && lc.classList.contains( "visibility-hidden" ) ) );

    // 8.2 Visible for Torsos
    switchTo( "torsos" );
    ensureFilters( true );
    const lc2 = $( "#levelControl" );
    t.push( assert( "8.2", "Level visible for Torsos",
      lc2 && !lc2.classList.contains( "visibility-hidden" ) ) );

    // 8.3 Change level → Armor value changes
    // Rows are re-rendered after level change, so re-query DOM after dispatch
    const slider = $( "#levelSlider" );
    const armorBefore = ( $( '#dataList .row .col[data-col="Armor"]' ) || {} ).textContent || "";
    if ( slider ) {
      slider.value = slider.max;
      slider.dispatchEvent( new Event( "input", { bubbles: true } ) );
    }
    const armorAfter = ( $( '#dataList .row .col[data-col="Armor"]' ) || {} ).textContent || "";
    t.push( assert( "8.3", "Level change updates Armor",
      armorBefore.trim() !== armorAfter.trim(),
      `Lv1: ${ armorBefore.trim() }, Max: ${ armorAfter.trim() }` ) );

    // 8.4 Display text updates (re-query since mountLevelSlider rebuilds it)
    const disp = $( "#levelDisplay" );
    t.push( assert( "8.4", "Level display updated",
      disp && disp.textContent.trim() !== "1",
      disp ? disp.textContent.trim() : "" ) );

    // 8.5 Pin preserved across level change (re-query after each dispatch)
    resetPin();
    const pinRow = $$( "#dataList .row" ).filter(
      r => getComputedStyle( r ).display !== "none"
    )[ 0 ];
    if ( pinRow ) pinRow.click();
    const pinBefore = !!$( "#dataList .row.pinned" );
    const sl2 = $( "#levelSlider" );
    if ( sl2 ) {
      sl2.value = "0";
      sl2.dispatchEvent( new Event( "input", { bubbles: true } ) );
    }
    const pinAfter = !!$( "#dataList .row.pinned" );
    t.push( assert( "8.5", "Pin preserved on level change",
      pinBefore && pinAfter ) );

    // Clean up
    resetPin();
    const sl3 = $( "#levelSlider" );
    if ( sl3 ) { sl3.value = "0"; sl3.dispatchEvent( new Event( "input", { bubbles: true } ) ); }
    ensureFilters( false );

    return summarize( "Level Slider", t );
  }

  /* ------------------------------------------------------------------ */
  /*  9 · Layout — Desktop                                              */
  /* ------------------------------------------------------------------ */
  function testLayoutDesktop() {
    const t = [];

    // 9.1 Brand in .list-header
    const brand = $( ".brand" );
    const bp = brand ? brand.parentElement : null;
    t.push( assert( "9.1", "Brand in .list-header",
      bp && bp.classList.contains( "list-header" ) ) );

    // 9.2 Wordmark logo
    const logo = $( ".logo" );
    const src = logo ? ( logo.currentSrc || logo.src ) : "";
    t.push( assert( "9.2", "Desktop wordmark logo",
      src.includes( "WRF_Logo_Left_2C" ), src ) );

    // 9.3 .list-head is sticky
    switchTo( "torsos" );
    const lh = $( "#listHead" );
    t.push( assert( "9.3", ".list-head is sticky",
      lh && getComputedStyle( lh ).position === "sticky" ) );

    // 9.4 --filter-height non-zero when filters visible
    // --filter-height is set on #listHead inline style by renderSection.
    // Enable filters first, then switch section so renderSection sets it synchronously.
    ensureFilters( true );
    switchTo( "torsos" );
    const fh = $( "#listHead" ).style.getPropertyValue( "--filter-height" ).trim();
    t.push( assert( "9.4", "--filter-height non-zero",
      fh && fh !== "0px" && fh !== "0", fh ) );
    ensureFilters( false );

    // 9.5 All tabs visible, same row
    const tabs = $$( ".tab" );
    const rects = tabs.map( t => t.getBoundingClientRect() );
    const allWide = rects.every( r => r.width > 0 );
    const sameTop = rects.every( r => Math.abs( r.top - rects[ 0 ].top ) < 2 );
    t.push( assert( "9.5", "Tabs visible, same row",
      allWide && sameTop ) );

    return summarize( "Layout (Desktop)", t );
  }

  /* ------------------------------------------------------------------ */
  /*  9 · Layout — Portrait                                             */
  /* ------------------------------------------------------------------ */
  function testLayoutPortrait() {
    const t = [];

    // 9.1p Brand in .list-nav
    const brand = $( ".brand" );
    const bp = brand ? brand.parentElement : null;
    t.push( assert( "9.1p", "Brand in .list-nav",
      bp && bp.classList.contains( "list-nav" ) ) );

    // 9.2p Robot logo
    const logo = $( ".logo" );
    const src = logo ? ( logo.currentSrc || logo.src ) : "";
    t.push( assert( "9.2p", "Mobile robot logo",
      src.includes( "Logo_Robot" ), src ) );

    // 9.3p Sticky header
    switchTo( "torsos" );
    const lh = $( "#listHead" );
    t.push( assert( "9.3p", ".list-head is sticky",
      lh && getComputedStyle( lh ).position === "sticky" ) );

    // 9.4p Tabs all visible
    const tabs = $$( ".tab" );
    const allWide = tabs.every( t => t.getBoundingClientRect().width > 0 );
    t.push( assert( "9.4p", "Tabs all visible", allWide ) );

    return summarize( "Layout (Portrait)", t );
  }

  /* ------------------------------------------------------------------ */
  /*  9 · Layout — Landscape                                            */
  /* ------------------------------------------------------------------ */
  function testLayoutLandscape() {
    const t = [];

    // 9.1l Sidebar layout
    switchTo( "torsos" );
    ensureFilters( true );
    const dl = $( ".data-layout" );
    const fd = dl ? getComputedStyle( dl ).flexDirection : "";
    t.push( assert( "9.1l", "Landscape sidebar layout",
      fd === "row", `flex-direction: ${ fd }` ) );

    // 9.2l Torsos: no .no-sidebar
    t.push( assert( "9.2l", "Torsos: no .no-sidebar",
      dl && !dl.classList.contains( "no-sidebar" ) ) );

    // 9.3l Titans: .no-sidebar
    switchTo( "titans" );
    ensureFilters( true );
    const tdl = $( ".data-layout" );
    t.push( assert( "9.3l", "Titans: has .no-sidebar",
      tdl && tdl.classList.contains( "no-sidebar" ) ) );

    // 9.4l Sticky header
    const lh = $( "#listHead" );
    t.push( assert( "9.4l", ".list-head is sticky",
      lh && getComputedStyle( lh ).position === "sticky" ) );

    ensureFilters( false );
    return summarize( "Layout (Landscape)", t );
  }

  /* ------------------------------------------------------------------ */
  /*  11 · State Persistence                                            */
  /* ------------------------------------------------------------------ */
  function testStatePersistence() {
    const t = [];

    // 11.1 Sort persists
    switchTo( "torsos" );
    const ah = $( '#listHead .head-btn[data-sort="Armor"]' );
    if ( ah ) ah.click();
    switchTo( "weapons" );
    switchTo( "torsos" );
    const ah2 = $( '#listHead .head-btn[data-sort="Armor"]' );
    t.push( assert( "11.1", "Sort persists across switch",
      ah2 && ( ah2.classList.contains( "sorted-asc" ) ||
               ah2.classList.contains( "sorted-desc" ) ) ) );

    // Reset sort
    const nh = $( '#listHead .head-btn[data-sort="Name"]' );
    if ( nh ) nh.click();

    // 11.2 Hidden column persists
    const rb = $( '#listHead .head-btn[data-col="Rarity"]' );
    const rv = rb ? $( ".col-vis-btn", rb ) : null;
    if ( rv ) rv.click();
    switchTo( "weapons" );
    switchTo( "torsos" );
    const rb2 = $( '#listHead .head-btn[data-col="Rarity"]' );
    t.push( assert( "11.2", "Hidden column persists",
      rb2 && rb2.classList.contains( "col-hidden" ) ) );
    // Restore
    const rv2 = rb2 ? $( ".col-vis-btn", rb2 ) : null;
    if ( rv2 ) rv2.click();

    // 11.3 Filter selection persists
    ensureFilters( true );
    setFilter( "Class", [ "Assault" ] );
    switchTo( "weapons" );
    switchTo( "torsos" );
    ensureFilters( true );
    const cs = getFilterSelect( "Class" );
    const sel = cs ? [ ...cs.selectedOptions ].map( o => o.value ) : [];
    t.push( assert( "11.3", "Filter persists across switch",
      sel.includes( "Assault" ),
      `Selected: ${ sel.join( ", " ) }` ) );
    clearAll();

    // 11.4 Level persists
    const sl = $( "#levelSlider" );
    if ( sl ) { sl.value = sl.max; sl.dispatchEvent( new Event( "input", { bubbles: true } ) ); }
    const lvBefore = $( "#levelDisplay" ) ? $( "#levelDisplay" ).textContent.trim() : "";
    switchTo( "weapons" );
    switchTo( "torsos" );
    ensureFilters( true );
    const lvAfter = $( "#levelDisplay" ) ? $( "#levelDisplay" ).textContent.trim() : "";
    t.push( assert( "11.4", "Level persists across switch",
      lvAfter === lvBefore,
      `Before: ${ lvBefore }, After: ${ lvAfter }` ) );

    // Clean up
    const sl2 = $( "#levelSlider" );
    if ( sl2 ) { sl2.value = "0"; sl2.dispatchEvent( new Event( "input", { bubbles: true } ) ); }
    ensureFilters( false );

    return summarize( "State Persistence", t );
  }

  /* ------------------------------------------------------------------ */
  /*  12 · Console Health                                               */
  /* ------------------------------------------------------------------ */
  function testConsoleHealth() {
    const t = [];
    t.push( assert( "12.1", "No console errors during tests",
      _errors.length === 0,
      _errors.length ? `${ _errors.length }: ${ _errors.slice( 0, 3 ).join( "; " ) }` : "Clean" ) );
    t.push( assert( "12.2", "Console warnings collected", true,
      `${ _warns.length } warnings` ) );
    t.push( assert( "12.3", "Suite completed without exceptions", true ) );
    return summarize( "Console Health", t );
  }

  /* ------------------------------------------------------------------ */
  /*  13 · Performance                                                  */
  /* ------------------------------------------------------------------ */
  function testPerformance() {
    const t = [];
    const perf = {};

    // 13.1 Page load timing
    const nav = performance.getEntriesByType( "navigation" )[ 0 ];
    if ( nav ) {
      perf.pageLoad = {
        domContentLoaded: Math.round( nav.domContentLoadedEventEnd ),
        loadComplete: Math.round( nav.loadEventEnd ),
      };
    }
    t.push( assert( "13.1", "Page load timing captured", !!nav,
      nav ? `DCL: ${ perf.pageLoad.domContentLoaded }ms` : "N/A" ) );

    // 13.2 Section switch times
    perf.sectionSwitch = {};
    for ( const sec of SEC_KEYS ) {
      const s = performance.now();
      switchTo( sec );
      perf.sectionSwitch[ sec ] = Math.round( ( performance.now() - s ) * 10 ) / 10;
    }
    const maxSw = Math.max( ...Object.values( perf.sectionSwitch ) );
    t.push( assert( "13.2", "Section switches < 500ms", maxSw < 500,
      Object.entries( perf.sectionSwitch )
        .map( ( [ k, v ] ) => `${ k }: ${ v }ms` ).join( ", " ) ) );

    // 13.3 Filter apply time
    switchTo( "weapons" );
    ensureFilters( true );
    const fs = performance.now();
    setFilter( "Rarity", [ "Rare" ] );
    perf.filter = Math.round( ( performance.now() - fs ) * 10 ) / 10;
    clearAll();
    ensureFilters( false );
    t.push( assert( "13.3", "Filter apply < 100ms", perf.filter < 100,
      `${ perf.filter }ms` ) );

    // 13.4 Sort time
    switchTo( "torsos" );
    const ss = performance.now();
    const sh = $( '#listHead .head-btn[data-sort="Armor"]' );
    if ( sh ) sh.click();
    perf.sort = Math.round( ( performance.now() - ss ) * 10 ) / 10;
    const nh = $( '#listHead .head-btn[data-sort="Name"]' );
    if ( nh ) nh.click();
    t.push( assert( "13.4", "Sort apply < 100ms", perf.sort < 100,
      `${ perf.sort }ms` ) );

    return { ...summarize( "Performance", t ), perf };
  }

  /* ------------------------------------------------------------------ */
  /*  Runner                                                            */
  /* ------------------------------------------------------------------ */
  try {
    // Start from known state
    switchTo( "pilots" );
    resetPin();

    const categories = [];
    let perfData = {};

    if ( DESKTOP ) {
      categories.push( testPageLoad() );
      categories.push( testSectionNavigation() );
      categories.push( testFilters() );
      categories.push( testSorting() );
      categories.push( testColumnVisibility() );
      categories.push( testDescriptionDesktop() );
      categories.push( testLevelSlider() );
      categories.push( testLayoutDesktop() );
      categories.push( testStatePersistence() );
      categories.push( testConsoleHealth() );
      const pr = testPerformance();
      categories.push( pr );
      perfData = pr.perf || {};
    } else if ( PORTRAIT ) {
      categories.push( testPageLoad() );
      categories.push( testDescriptionMobile() );
      categories.push( testLayoutPortrait() );
      categories.push( testConsoleHealth() );
    } else if ( LANDSCAPE ) {
      categories.push( testPageLoad() );
      categories.push( testLayoutLandscape() );
      categories.push( testConsoleHealth() );
    }

    // Restore console
    console.error = origError;
    console.warn  = origWarn;

    // Build report
    const report = {
      viewport: DESKTOP ? "desktop" : PORTRAIT ? "portrait" : "landscape",
      timestamp: new Date().toISOString(),
      summary: {
        total: categories.reduce( ( s, c ) => s + c.total, 0 ),
        pass:  categories.reduce( ( s, c ) => s + c.pass, 0 ),
        fail:  categories.reduce( ( s, c ) => s + c.fail, 0 ),
      },
      categories,
      performance: perfData,
      console: { errors: [ ..._errors ], warnings: [ ..._warns ] },
    };

    // Pre-compute formatted report
    let md = `# WRF Catalog Test Report\n`;
    md += `**Viewport:** ${ report.viewport } | **Time:** ${ report.timestamp }\n`;
    md += `**Total:** ${ report.summary.total } | `;
    md += `**Pass:** ${ report.summary.pass } | `;
    md += `**Fail:** ${ report.summary.fail }\n\n`;
    for ( const cat of categories ) {
      const icon = cat.fail === 0 ? "PASS" : "FAIL";
      md += `## ${ icon } ${ cat.name } (${ cat.pass }/${ cat.total })\n`;
      for ( const te of cat.tests ) {
        md += `  ${ te.pass ? "ok" : "FAIL" } ${ te.id } ${ te.name }`;
        if ( te.detail ) md += ` — ${ te.detail }`;
        md += `\n`;
      }
      md += `\n`;
    }
    if ( _errors.length ) {
      md += `## Console Errors\n`;
      for ( const e of _errors ) md += `  - ${ e }\n`;
    }
    report.formattedReport = md;

    return report;

  } catch ( err ) {
    // Restore console even on failure
    console.error = origError;
    console.warn  = origWarn;
    return {
      viewport: DESKTOP ? "desktop" : PORTRAIT ? "portrait" : "landscape",
      timestamp: new Date().toISOString(),
      summary: { total: 0, pass: 0, fail: 1 },
      categories: [],
      error: `${ err.message }\n${ err.stack }`,
      console: { errors: [ ..._errors ], warnings: [ ..._warns ] },
    };
  }
} )()
