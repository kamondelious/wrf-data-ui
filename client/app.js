const CATALOG_URL = "./Ultimate_WRF_Data_Sheet.json";

// Create Clear Filters button and level control container dynamically
// (they live inside nav-controls which is appended to the filter row)
const _clearFiltersBtn = document.createElement( "button" );
_clearFiltersBtn.id = "clearFiltersBtn";
_clearFiltersBtn.className = "btn-clear-filters visibility-hidden";
_clearFiltersBtn.textContent = "Clear Filters";

const _levelControl = document.createElement( "div" );
_levelControl.id = "levelControl";
_levelControl.className = "level-control visibility-hidden";

const els = {
  tabstrip: document.getElementById( "tabstrip" ),
  listHead: document.getElementById( "listHead" ),
  filterRow: document.getElementById( "filterRow" ),
  dataList: document.getElementById( "dataList" ),
  noResults: document.getElementById( "noResults" ),
  descTitle: document.getElementById( "descTitle" ),
  detailText: document.getElementById( "detailText" ),
  levelControl: _levelControl,
  clearFiltersBtn: _clearFiltersBtn,
  levelSlider: null,
  levelDisplay: null,
};

const DEFAULT_TITLE = "Description";
const DEFAULT_MESSAGES = {
  pilots: "Hover over a talent to see its description. Click to pin.",
  titans: "Hover over a titan module to see its description. Click to pin.",
  torsos: "Hover over an item to see its description. Click to pin.",
  chassis: "Hover over an item to see its description. Click to pin.",
  shoulders: "Hover over an item to see its description. Click to pin.",
  weapons: "Hover over an item to see its description. Click to pin.",
  gear: "Hover over an item to see its description. Click to pin."
};

let catalog = null;
let currentSection = "pilots";
let sortState = { key: "Name", dir: "asc" };

// Current view state
let rows = [ ];                 // [{ el, name, ref, flat }]
let selects = { };              // key -> select element
let pilotTierNames = [ ];       // from catalog
let pilotTalentsByTier = { };   // from catalog
let availableLevels = [ 1 ];    // detected from catalog data
let currentSectionHasFilterBoxes = true;
let currentSectionHasLevels = false;
let navControls = null;

const uiState = {
  'sectionLevels': { },  // sectionKey -> level number
  'descriptionPinned': false,
  'pinnedItem': null,  // tracks what's pinned: { type: 'talent'|'row', key: '...' }
  'titanWeaponIndex': { },  // titanName -> current weapon index
  'visibleFilters': { },  // sectionKey -> Set of visible filter keys
  'filtersVisible': true,  // whether Filters tab is active
  'hiddenColumns': { }  // sectionKey -> Set of hidden column keys
};

const STORAGE_KEY_BASE = "wrfCatalogState";
function storageKey_( ) {
  return isMobile( ) ? STORAGE_KEY_BASE + "_m" : STORAGE_KEY_BASE;
}

// Get current level for the active section
function getCurrentLevel( ) {
  return uiState.sectionLevels[ currentSection ] || availableLevels[ 0 ] || 1;
}

// Set level for the active section
function setCurrentLevel( level ) {
  uiState.sectionLevels[ currentSection ] = level;
  saveState( );
}

// Load persisted state from localStorage
function loadPersistedState( ) {
  try {
    const json = localStorage.getItem( storageKey_( ) );
    if ( !json ) return null;
    return JSON.parse( json );
  } catch ( err ) {
    console.warn( "Failed to load state from localStorage:", err );
    return null;
  }
}

// Save current UI state to localStorage
function saveState( ) {
  try {
    // Build current section state
    const sectionState = {
      level: getCurrentLevel( ),
      sortKey: sortState.key,
      sortDir: sortState.dir,
      filters: { },
      hiddenColumns: Array.from( getHiddenColumns( currentSection ) ),
      visibleFilters: Array.from( uiState.visibleFilters[ currentSection ] || [ ] )
    };

    // Capture current filter selections
    for ( const [ key, sel ] of Object.entries( selects ) ) {
      const selected = getSelected( sel );
      if ( selected.length > 0 ) {
        sectionState.filters[ key ] = selected;
      }
    }

    // Merge with existing persisted state
    const state = loadPersistedState( ) || { sectionState: { } };
    state.activeSection = currentSection;
    state.filtersVisible = uiState.filtersVisible;
    state.sectionState = state.sectionState || { };
    state.sectionState[ currentSection ] = sectionState;

    localStorage.setItem( storageKey_( ), JSON.stringify( state ) );
  } catch ( err ) {
    console.warn( "Failed to save state to localStorage:", err );
  }
}

// Restore section state from persisted data (call after filters are mounted)
function restoreSectionState( sectionKey, savedState ) {
  if ( !savedState ) return;

  // Restore level
  if ( savedState.level != null && availableLevels.includes( savedState.level ) ) {
    uiState.sectionLevels[ sectionKey ] = savedState.level;
  }

  // Restore sort
  if ( savedState.sortKey != null ) {
    sortState.key = savedState.sortKey;
    sortState.dir = savedState.sortDir || "asc";
  }

  // Restore hidden columns (filter out keys that are no longer hideable)
  if ( savedState.hiddenColumns && sectionSupportsColumnHiding( sectionKey ) ) {
    uiState.hiddenColumns[ sectionKey ] = new Set(
      savedState.hiddenColumns.filter( k => columnIsHideable( sectionKey, k ) )
    );
  }

  // Restore visible filters
  if ( savedState.visibleFilters ) {
    uiState.visibleFilters[ sectionKey ] = new Set( savedState.visibleFilters );
  }

  // Restore filter selections (must be done after filters are mounted)
  if ( savedState.filters ) {
    for ( const [ key, values ] of Object.entries( savedState.filters ) ) {
      const sel = selects[ key ];
      if ( sel ) {
        for ( const opt of sel.options ) {
          opt.selected = values.includes( opt.value );
        }
      }
    }
  }
}

// Canvas-based text width measurement for accurate column sizing.
// Caches the CanvasRenderingContext2D so we only create it once.
let _measureCtx = null;
const _fontStack = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
function measureText( text, fontSpec ) {
  if ( !_measureCtx ) {
    _measureCtx = document.createElement( "canvas" ).getContext( "2d" );
  }
  _measureCtx.font = fontSpec;
  return Math.ceil( _measureCtx.measureText( text ).width );
}

const HIDDEN_COL_WIDTH = "28px";

// Column visibility helper functions
function sectionSupportsColumnHiding( sectionKey ) {
  return [ "pilots", "torsos", "chassis", "shoulders", "weapons", "gear" ].includes( sectionKey );
}

function columnIsHideable( sectionKey, colKey ) {
  if ( colKey === "Name" ) return false;
  if ( !sectionSupportsColumnHiding( sectionKey ) ) return false;
  const def = SECTIONS[ sectionKey ];
  if ( def && def.hideableColumns ) return def.hideableColumns.has( colKey );
  return true; // default: all non-Name columns are hideable
}

function getHiddenColumns( sectionKey ) {
  if ( !uiState.hiddenColumns[ sectionKey ] ) {
    uiState.hiddenColumns[ sectionKey ] = new Set( );
  }
  return uiState.hiddenColumns[ sectionKey ];
}

function isMobile( ) {
  return window.matchMedia( "( max-width: 768px )" ).matches;
}

// Mobile (≤768px): move brand into .list-nav so robot logo sits left of tabs.
// Desktop: return brand to .list-header.
function relocateBrand( ) {
  const brand = document.querySelector( ".brand" );
  const listNav = document.querySelector( ".list-nav" );
  const listHeader = document.querySelector( ".list-header" );
  if ( !brand || !listNav || !listHeader ) return;

  if ( isMobile( ) ) {
    if ( brand.parentNode !== listNav ) {
      listNav.insertBefore( brand, listNav.firstChild );
    }
  } else {
    if ( brand.parentNode !== listHeader ) {
      listHeader.insertBefore( brand, listHeader.firstChild );
    }
  }
}

// Positions the drawer content within the visible viewport.
// centerEl: if provided, centers under that element (e.g., a pilot talent).
//           if null, centers in the viewport.
// Uses visualViewport.pageLeft for the true horizontal offset — layout
// scroll APIs miss visual-viewport panning on mobile browsers.
function positionDrawerContent( content, centerEl ) {
  const vv = window.visualViewport;
  if ( !vv ) return;

  // Clear any existing transform so we measure the true natural position
  content.style.transform = "";
  const naturalX = content.getBoundingClientRect( ).left + window.scrollX;
  const contentW = content.getBoundingClientRect( ).width;
  const inset = 12;
  const visLeft = vv.pageLeft + inset;
  const visRight = vv.pageLeft + vv.width - inset;

  let targetX;
  if ( centerEl ) {
    // Center under the target element's midpoint
    const r = centerEl.getBoundingClientRect( );
    const elCenterDoc = r.left + window.scrollX + r.width / 2;
    targetX = elCenterDoc - contentW / 2;
  } else {
    // Center in the visible viewport
    targetX = vv.pageLeft + ( vv.width - contentW ) / 2;
  }

  // Clamp so the content stays within the visible area
  targetX = Math.max( visLeft, Math.min( visRight - contentW, targetX ) );

  // Apply as a delta from the content's natural position
  content.style.transform = `translateX( ${ targetX - naturalX }px )`;
}

// After the drawer animation completes, checks whether the content
// is fully within the visual viewport. If not, scrolls horizontally
// by the minimum amount needed to bring it into view.
function ensureDrawerHorizontallyVisible( content ) {
  const vv = window.visualViewport;
  if ( !vv ) return;

  // getBoundingClientRect includes transforms — gives layout-viewport coords.
  // Subtract vv.offsetLeft to get visual-viewport coords.
  const r = content.getBoundingClientRect( );
  const visLeft = r.left - vv.offsetLeft;
  const visRight = visLeft + r.width;
  const inset = 12;

  let scrollDelta = 0;
  if ( visLeft < inset ) {
    scrollDelta = visLeft - inset;
  } else if ( visRight > vv.width - inset ) {
    scrollDelta = visRight - ( vv.width - inset );
  }

  if ( scrollDelta !== 0 ) {
    window.scrollBy( { left: scrollDelta, behavior: "smooth" } );
  }
}

// Scrolls the viewport horizontally so that el is centered on screen.
// Uses window.scrollBy (not scrollIntoView) to avoid sub-scrolling
// caused by scrollIntoView walking all scrollable ancestors.
function centerElementHorizontally( el ) {
  const vv = window.visualViewport;
  if ( !vv ) return;
  const r = el.getBoundingClientRect( );
  // Convert to visual-viewport coords by subtracting vv.offsetLeft
  const elCenter = r.left + r.width / 2 - vv.offsetLeft;
  const vpCenter = vv.width / 2;
  const delta = elCenter - vpCenter;
  if ( Math.abs( delta ) > 4 ) {
    window.scrollBy( { left: delta, behavior: "instant" } );
  }
}

function openDescDrawer( anchorEl, centerEl ) {
  // Remove any existing drawer
  const existing = document.querySelector( ".desc-drawer" );
  if ( existing ) existing.remove( );

  if ( !anchorEl ) return;

  // Center the target element (e.g., pilot talent) in the viewport
  // before building the drawer, so the drawer opens centered under it.
  if ( centerEl ) {
    centerElementHorizontally( centerEl );
  }

  function buildDrawer( ) {
    // Create drawer — reads from els.descTitle/els.detailText (already set by setDescriptionOf)
    const drawer = document.createElement( "div" );
    drawer.className = "desc-drawer";
    drawer.innerHTML = `<div class="desc-drawer-inner">
      <div class="desc-drawer-content">
        <div class="desc-title">${ els.descTitle.textContent }</div>
        <div class="desc-body">${ els.detailText.textContent }</div>
      </div>
    </div>`;

    anchorEl.after( drawer );

    // Position content within the visible viewport.
    // Mobile browsers pan via the visual viewport — layout scroll APIs
    // (scrollX, scrollLeft) miss most of the horizontal movement.
    // visualViewport.pageLeft gives the true horizontal offset.
    const content = drawer.querySelector( ".desc-drawer-content" );
    positionDrawerContent( content, centerEl );

    // Force reflow so the browser computes the 0fr initial state
    // before we transition to 1fr — a single rAF isn't always enough
    drawer.offsetHeight;
    drawer.classList.add( "open" );

    // After the 300ms CSS transition completes, reposition and scroll.
    // Only positionDrawerContent + scrollDrawerIntoView here — calling
    // both centerElementHorizontally and ensureDrawerHorizontallyVisible
    // would issue two scrollBy({behavior:"smooth"}) calls in the same
    // frame, and per the CSSOM spec the second cancels the first.
    setTimeout( ( ) => {
      if ( !drawer.parentNode ) return;
      requestAnimationFrame( ( ) => {
        positionDrawerContent( content, centerEl );
        scrollDrawerIntoView( anchorEl );
      } );
    }, 320 );
  }

  buildDrawer( );
}

// Ensures the tapped row + drawer are visible in the gap between
// the sticky headers and the viewport bottom.
// Uses document-absolute coordinates (rect + scrollY) and scrollTo
// for robust positioning across orientation transitions.
function scrollDrawerIntoView( anchorEl ) {
  const drawer = document.querySelector( ".desc-drawer" );
  if ( !drawer ) return;
  const vv = window.visualViewport;
  const vpHeight = vv ? vv.height : window.innerHeight;

  // Compute the height of content that sticks to the viewport top.
  // Use offsetHeight (layout height) — NOT getBoundingClientRect().bottom
  // which is viewport-relative and includes non-sticky content above
  // the headers when the page hasn't scrolled past it.
  let stickyH = els.listHead.offsetHeight;
  if ( els.filterRow.classList.contains( "visible" ) ) {
    stickyH += els.filterRow.offsetHeight;
  }
  const lh = document.querySelector( ".list-header" );
  if ( lh && getComputedStyle( lh ).position === "sticky" ) {
    stickyH += lh.offsetHeight;
  }

  const visibleGap = vpHeight - stickyH;
  if ( visibleGap <= 0 ) return;

  // Document-absolute coordinates
  const scrollY = window.scrollY;
  const anchorDocTop = anchorEl.getBoundingClientRect( ).top + scrollY;
  const drawerDocBottom = drawer.getBoundingClientRect( ).bottom + scrollY;
  const combinedHeight = drawerDocBottom - anchorDocTop;

  let scrollTarget;
  if ( combinedHeight <= visibleGap ) {
    // Center row + drawer in the visible gap.
    // After scrollTo(T): gap center in viewport = stickyH + visibleGap/2
    // Combined center in viewport = combinedCenter - T
    // Set equal: T = combinedCenter - stickyH - visibleGap/2
    const combinedCenter = ( anchorDocTop + drawerDocBottom ) / 2;
    scrollTarget = combinedCenter - stickyH - visibleGap / 2;
  } else {
    // Row + drawer taller than gap: pin row just below headers
    scrollTarget = anchorDocTop - stickyH - 8;
  }

  scrollTarget = Math.max( 0, scrollTarget );

  // Skip if already within 5px of target — avoids jank when content
  // is already centered, while still correcting cases where the
  // browser's touch-scroll brought content into view off-center.
  if ( Math.abs( scrollTarget - scrollY ) < 5 ) return;

  window.scrollTo( { top: scrollTarget, behavior: "smooth" } );
}

// Re-renders the current section while preserving any active pin.
// Used by level-change and orientation-change handlers.
// preState: optional { pinned, item } captured earlier (e.g., by debounced
//           viewport handlers that save state before any clearing occurs).
function renderSectionPreservingPin( sectionKey, preState ) {
  const wasPinned = preState ? preState.pinned : uiState.descriptionPinned;
  const pinnedItem = preState ? preState.item : uiState.pinnedItem;

  renderSection( sectionKey );

  if ( !wasPinned || !pinnedItem ) return;

  uiState.descriptionPinned = true;
  uiState.pinnedItem = pinnedItem;

  if ( pinnedItem.startsWith( "talent:" ) ) {
    // talent:PilotName:Tier:TalentName
    const parts = pinnedItem.split( ":" );
    const pilotName = parts[ 1 ];
    const tier = parts[ 2 ];
    const name = parts.slice( 3 ).join( ":" );
    const desc = ( pilotTalentsByTier[ tier ] && pilotTalentsByTier[ tier ][ name ] )
      ? pilotTalentsByTier[ tier ][ name ] : "";
    if ( desc ) {
      // Find the specific pilot's row, then scope the talent search within it
      const row = rows.find( r => r.name === pilotName );
      if ( row ) {
        const t = row.el.querySelector(
          `.talent[data-tier="${ tier }"][data-talent="${ name }"]`
        );
        if ( t ) {
          t.classList.add( "pinned" );
          setDescriptionOf( name, desc, true, row.el, t );
        }
      }
    }
  } else if ( pinnedItem.startsWith( "row:" ) ) {
    const rowName = pinnedItem.substring( 4 );
    const row = rows.find( r => r.name === rowName );
    if ( row && row.flat ) {
      row.el.classList.add( "pinned" );
      const def = SECTIONS[ sectionKey ];
      const desc = row.flat[ def.descField ];
      if ( desc ) setDescriptionOf( row.name, desc, true, row.el );
    }
  } else if ( pinnedItem.startsWith( "titan:" ) ) {
    const parts = pinnedItem.split( ":" );
    if ( parts.length >= 3 ) {
      const titanName = parts[ 1 ];
      const row = rows.find( r => r.name === titanName );
      if ( row && row.flat ) {
        row.el.classList.add( "pinned" );
        if ( parts[ 2 ] === "weapon" && parts.length === 4 ) {
          const weaponName = parts[ 3 ];
          const weaponsData = row.flat[ "Weapons" ];
          if ( weaponsData && weaponsData[ weaponName ] ) {
            const desc = weaponsData[ weaponName ].Description;
            if ( desc ) setDescriptionOf( `${ titanName } - ${ weaponName }`, desc, true, row.el );
          }
        } else {
          const moduleName = parts[ 2 ];
          const moduleData = row.flat[ moduleName ];
          if ( moduleData && moduleData.Description ) {
            setDescriptionOf( `${ titanName } - ${ moduleName }`, moduleData.Description, true, row.el );
          }
        }
      }
    }
  }
}

function closeDescDrawer( ) {
  const drawer = document.querySelector( ".desc-drawer" );
  if ( drawer ) drawer.remove( );

  // Also clear legacy bottom sheet state (safety for viewport transitions)
  const desc = document.querySelector( ".desc" );
  const scrim = document.getElementById( "scrim" );
  if ( desc ) desc.classList.remove( "open" );
  if ( scrim ) scrim.hidden = true;

  // Unpin
  uiState.descriptionPinned = false;
  uiState.pinnedItem = null;
  document.querySelectorAll( ".row.pinned, .talent.pinned" )
    .forEach( el => el.classList.remove( "pinned" ) );
  setDefaultDescriptionForSection( currentSection );
}

function toggleColumnVisibility( sectionKey, colKey ) {
  const hidden = getHiddenColumns( sectionKey );
  if ( hidden.has( colKey ) ) {
    hidden.delete( colKey );
  } else {
    hidden.add( colKey );
  }
  applyColumnVisibility( sectionKey );
  saveState( );
}

function computeColsCss( columns, sectionKey ) {
  const hidden = getHiddenColumns( sectionKey );
  return columns.map( c => {
    if ( hidden.has( c.key ) ) {
      return HIDDEN_COL_WIDTH;
    }
    return c.width;
  } ).join( " " );
}

// Detects available levels by scanning catalog data for level-keyed objects
function detectAvailableLevels( catalog ) {
  const levelSet = new Set( );

  function scanValue( v ) {
    if ( !v || typeof v !== "object" || Array.isArray( v ) ) return;

    const keys = Object.keys( v );
    const numericKeys = keys.filter( k => /^\d+$/.test( k ) );

    // If all keys are numeric, this is a level-keyed object
    if ( numericKeys.length > 0 && numericKeys.length === keys.length ) {
      numericKeys.forEach( k => levelSet.add( Number( k ) ) );
      return;
    }

    // Otherwise recurse into object values
    Object.values( v ).forEach( scanValue );
  }

  scanValue( catalog );

  const levels = Array.from( levelSet ).sort( ( a, b ) => a - b );
  return levels.length > 0 ? levels : [ 1 ];
}

// Escapes a value for safe HTML insertion (basic entities)
function escapeHtml( s ) {
  return String( s )
    .replaceAll( "&", "&amp;" )
    .replaceAll( "<", "&lt;" )
    .replaceAll( ">", "&gt;" )
    .replaceAll( '"', "&quot;" )
    .replaceAll( "'", "&#039;" );
}

function pickLevelValue_( v, level ) {
  if ( !v || typeof v !== "object" || Array.isArray( v ) ) return v;

  const keys = Object.keys( v );
  const numericKeys = keys.filter( k => /^\d+$/.test( k ) );
  if ( !numericKeys.length || numericKeys.length !== keys.length ) return v; // not level-keyed

  const want = String( level );
  const wantVal = v[ want ];
  // If the requested level exists and is non-blank, use it
  if ( wantVal != null && String( wantVal ).trim( ) !== "" ) return wantVal;

  // fallback: nearest lower numeric key with non-blank value, else smallest key
  const nums = numericKeys.map( Number ).sort( ( a, b ) => a - b );
  let chosen = nums[ 0 ];
  for ( const n of nums ) {
    if ( n <= level ) {
      const val = v[ String( n ) ];
      if ( val != null && String( val ).trim( ) !== "" ) chosen = n;
    }
  }
  return v[ String( chosen ) ];
}

function formatValue_( v, level ) {
  // 1) arrays
  if ( Array.isArray( v ) ) {
    const parts = v.map( x => ( x == null ? "" : String( x ) ) ).filter( Boolean );
    return parts.join( ", " );
  }

  // 2) level-keyed objects (or other objects)
  const picked = pickLevelValue_( v, level );
  if ( picked && typeof picked === "object" && !Array.isArray( picked ) ) {
    // if it's still an object, display something readable
    return JSON.stringify( picked );
  }

  // 3) primitives
  return ( picked == null ) ? "" : String( picked );
}


/* ---------- Algorithmic column header shortening ---------- */

// Words to skip when building acronyms (articles, prepositions)
const ACRONYM_SKIP = new Set( [ "the", "of", "a", "an", "to", "in", "for", "and", "or" ] );

// Builds an acronym from a multi-word header name.
// Takes first letter of each significant word (skips articles/prepositions).
// E.g. "Shield Cooldown Reduction" -> "SCR", "Rate of Fire" -> "RF"
function makeAcronym_( name ) {
  const words = name.split( /\s+/ );
  const letters = [ ];
  for ( const w of words ) {
    if ( !ACRONYM_SKIP.has( w.toLowerCase( ) ) && w.length > 0 ) {
      letters.push( w[ 0 ].toUpperCase( ) );
    }
  }
  return letters.join( "" );
}

// Truncates a single word at a natural syllable boundary.
// Collects all reasonable cut points and picks one that yields 4-6 chars.
// E.g. "Regeneration" -> "Regen", "Acceleration" -> "Accel", "Distance" -> "Dist"
function truncateWord_( w ) {
  if ( w.length <= 4 ) return w;
  const isV = ch => "aeiou".includes( ch.toLowerCase( ) );

  // Collect candidate break points (number of chars to keep).
  // Two patterns indicate syllable boundaries:
  //   1. Vowel then consonant (VC): keep through the consonant
  //   2. Consonant then consonant before a vowel (CCV): split between the Cs
  const cuts = new Set( );
  for ( let i = 1; i < w.length - 1; i++ ) {
    if ( isV( w[ i ] ) && !isV( w[ i + 1 ] ) ) {
      cuts.add( i + 2 ); // include closing consonant
    }
    if ( !isV( w[ i ] ) && !isV( w[ i + 1 ] ) && i + 2 < w.length && isV( w[ i + 2 ] ) ) {
      cuts.add( i + 1 ); // split between consonant cluster
    }
  }

  const sorted = Array.from( cuts ).sort( ( a, b ) => a - b );

  // Prefer the shortest natural cut that yields 4-5 chars
  for ( const c of sorted ) {
    if ( c >= 4 && c <= 5 ) return w.slice( 0, c );
  }

  // No 4-5 cut: pick shortest cut >= 2, extend to minimum 4 chars
  for ( const c of sorted ) {
    if ( c >= 2 ) return w.slice( 0, Math.min( Math.max( c, 4 ), w.length ) );
  }

  return w.slice( 0, Math.min( 5, w.length ) );
}

// Builds an abbreviation by keeping the first part of each word.
// Drops stopwords (prepositions/articles) and truncates long words.
// E.g. "Shield Regeneration" -> "Shield Regen", "Time to Reload" -> "Reload Time"
function makeAbbreviation_( name ) {
  const words = name.split( /\s+/ );
  if ( words.length === 1 ) {
    if ( name.length <= 7 ) return name;
    return truncateWord_( name );
  }
  // Multi-word: drop stopwords, then abbreviate remaining long words
  const significant = words.filter( w => !ACRONYM_SKIP.has( w.toLowerCase( ) ) );
  const abbreviated = significant.map( w => {
    if ( w.length <= 7 ) return w;
    return truncateWord_( w );
  } );
  return abbreviated.join( " " );
}

// Estimates whether a header label fits within a column's pixel width.
// Uses approximate character widths for uppercase text at 12px with letter-spacing.
function headerFitsColumn_( label, colWidth ) {
  // Extract minimum px from width spec (e.g. "110px" or "minmax(220px, 1fr)")
  const m = colWidth.match( /(\d+)px/ );
  if ( !m ) return true; // can't determine, assume it fits
  const px = Number( m[ 1 ] );
  // Rough estimate: uppercase 12px font with letter-spacing ~8px per char + padding
  const estWidth = label.length * 8 + 30; // 30px for padding + sort indicator
  return estWidth <= px;
}

// Given the full column key (header name), the max rendered-width of the
// data in that column (character count), and the column width spec,
// returns { label, fullLabel }.
// Decision tiers:
// 1. Header fits in column and ratio < 2: keep full name
// 2. Ratio 2-4 or doesn't fit: abbreviate + tooltip
// 3. Ratio > 4 and multi-word (3+ letter acronym): acronym + tooltip
function shortenHeader_( key, maxDataWidth, colWidth ) {
  const headerLen = key.length;

  // Guard: if data is empty or very narrow, use a floor so we don't over-shrink
  const dataW = Math.max( maxDataWidth, 1 );
  const ratio = headerLen / dataW;

  // Short keys (6 chars or less): never shorten
  if ( headerLen <= 6 ) return { label: key, fullLabel: null };

  const fits = headerFitsColumn_( key, colWidth );

  // If header fits in column: only shorten if ratio is very extreme (>5)
  // If header doesn't fit: shorten whenever ratio > 1.2
  if ( fits && ratio <= 5 ) return { label: key, fullLabel: null };
  if ( !fits && ratio < 1.2 ) return { label: key, fullLabel: null };

  const words = key.split( /\s+/ );

  // High ratio: try acronym first (multi-word, 3+ letters)
  if ( ratio > 4 && words.length > 1 ) {
    const acr = makeAcronym_( key );
    if ( acr.length >= 3 ) {
      return { label: acr, fullLabel: key };
    }
  }

  // Abbreviate
  const abbr = makeAbbreviation_( key );
  if ( abbr.length < headerLen ) {
    // Prefer abbreviation over 2-letter acronym; accept any shortening
    return { label: abbr, fullLabel: key };
  }

  // Abbreviation didn't help: try acronym as last resort
  if ( ratio > 2 && words.length > 1 ) {
    const acr = makeAcronym_( key );
    if ( acr.length >= 3 ) {
      return { label: acr, fullLabel: key };
    }
  }

  // Could not shorten meaningfully: keep full name
  return { label: key, fullLabel: null };
}

// Scans item data to find the max character width and check if all values are small numbers.
// Returns { columnKey: { maxChars, maxPixels, allSmallNumbers } }.
// For arrays (stacked data like talents), measures longest individual element, not joined string.
// For titans, measures actual pixel widths (maxPixels) since kv-pairs have fixed-width keys.
function measureDataWidths_( columns, items, level, sectionKey ) {
  const result = { };
  for ( const c of columns ) {
    result[ c.key ] = { maxChars: 0, maxPixels: null, allSmallNumbers: true };
  }

  for ( const it of items ) {
    for ( const c of columns ) {
      const raw = it.flat[ c.key ];
      let maxLen = 0;

      // Special case: titans Name column includes metadata from modules
      // Uses canvas text measurement for accurate pixel widths
      if ( sectionKey === "titans" && c.key === "Name" ) {
        const META_KEY_MIN = 70; // .titan-meta .kv-key min-width in CSS
        const META_GAP = 6;
        const metaFont = `12px ${ _fontStack }`;
        const nameFont = `600 16px ${ _fontStack }`;

        // Helper to calculate kv-pair width with actual rendered text width
        const kvWidth = ( keyText, valText ) => {
          const keyPx = Math.max( META_KEY_MIN, measureText( keyText, metaFont ) );
          return keyPx + META_GAP + measureText( valText, metaFont );
        };

        // Measure the name itself (16px font-weight 600)
        const namePixels = ( raw == null ) ? 0 : measureText( String( raw ), nameFont );
        let maxPixels = namePixels;

        // Measure the kv pairs - check all modules since Upgrade Cost may only be in some
        let foundClass = false, foundRarity = false, foundDominion = false, foundUpgradeCost = false;
        for ( const modKey of [ "Chassis", "Torso", "Right Shoulder", "Left Shoulder" ] ) {
          const mod = it.flat[ modKey ];
          if ( mod && typeof mod === "object" ) {
            if ( !foundClass && mod.Class ) {
              foundClass = true;
              const px = kvWidth( "Class:", String( mod.Class ) );
              if ( px > maxPixels ) maxPixels = px;
            }
            if ( !foundRarity && mod.Rarity ) {
              foundRarity = true;
              const px = kvWidth( "Rarity:", String( mod.Rarity ) );
              if ( px > maxPixels ) maxPixels = px;
            }
            if ( !foundDominion && mod.Dominion ) {
              foundDominion = true;
              const px = kvWidth( "Dominion:", String( mod.Dominion ) );
              if ( px > maxPixels ) maxPixels = px;
            }
            if ( !foundUpgradeCost && mod[ "Upgrade Cost" ] ) {
              foundUpgradeCost = true;
              const px = kvWidth( "Upgrade Cost:", String( mod[ "Upgrade Cost" ] ) );
              if ( px > maxPixels ) maxPixels = px;
            }
            // Only break when all fields are found
            if ( foundClass && foundRarity && foundDominion && foundUpgradeCost ) break;
          }
        }
        // Keep the maximum across all titans
        if ( maxPixels > ( result[ c.key ].maxPixels || 0 ) ) {
          result[ c.key ].maxPixels = maxPixels;
        }
        result[ c.key ].allSmallNumbers = false;
      }
      // Special case: titans module columns (Chassis, Torso, Shoulders, Weapons) - measure kv-pairs
      // Uses canvas text measurement for accurate pixel widths
      else if ( sectionKey === "titans" && raw && typeof raw === "object" && !Array.isArray( raw ) ) {
        const KV_KEY_MIN = 100; // .kv-key min-width in CSS
        const KV_GAP = 6; // gap between key and value
        const kvFont = `12px ${ _fontStack }`;
        const navFont = `600 13px ${ _fontStack }`;
        const NAV_BTNS = 24 + 8 + 8 + 24; // two 24px buttons + two 8px gaps
        let maxPixels = 0;

        // Helper to calculate kv-pair width using canvas measurement.
        // Appends ":" to key text to match rendered HTML.
        const kvWidth = ( keyName, valText ) => {
          const keyPx = Math.max( KV_KEY_MIN, measureText( keyName + ":", kvFont ) );
          return keyPx + KV_GAP + measureText( valText, kvFont );
        };

        // For Weapons, it's a map of weapon name -> weapon object
        if ( c.key === "Weapons" ) {
          for ( const weaponName of Object.keys( raw ) ) {
            // Measure weapon nav bar: [< btn] [gap] [label] [gap] [> btn]
            const navPixels = measureText( weaponName, navFont ) + NAV_BTNS;
            if ( navPixels > maxPixels ) maxPixels = navPixels;
            const weapon = raw[ weaponName ];
            if ( weapon && typeof weapon === "object" ) {
              for ( const [ k, v ] of Object.entries( weapon ) ) {
                if ( TITAN_MODULE_EXCLUDE.has( k ) ) continue;
                const valStr = formatValue_( v, level );
                const kvPixels = kvWidth( k, valStr );
                if ( kvPixels > maxPixels ) maxPixels = kvPixels;
              }
            }
          }
        } else {
          // Regular module (Chassis, Torso, Shoulders)
          for ( const [ k, v ] of Object.entries( raw ) ) {
            if ( TITAN_MODULE_EXCLUDE.has( k ) ) continue;
            const valStr = formatValue_( v, level );
            const kvPixels = kvWidth( k, valStr );
            if ( kvPixels > maxPixels ) maxPixels = kvPixels;
          }
        }
        // Store pixel width and update maxChars for header comparison
        if ( maxPixels > ( result[ c.key ].maxPixels || 0 ) ) {
          result[ c.key ].maxPixels = maxPixels;
        }
        result[ c.key ].allSmallNumbers = false;
      }
      // For arrays (stacked display), measure individual elements
      else if ( Array.isArray( raw ) ) {
        for ( const item of raw ) {
          const s = ( item == null ) ? "" : String( item );
          if ( s.length > maxLen ) maxLen = s.length;
        }
        // Arrays are never considered "small numbers"
        if ( raw.length > 0 ) {
          result[ c.key ].allSmallNumbers = false;
        }
      } else {
        // For non-arrays, use formatted value
        const rendered = formatValue_( raw, level );
        maxLen = rendered.length;

        // Check if value is numeric < 1000 (only for non-arrays)
        if ( result[ c.key ].allSmallNumbers && rendered.length > 0 ) {
          const num = parseFloat( rendered.replace( /,/g, "" ) );
          if ( isNaN( num ) || num >= 1000 || num < 0 ) {
            result[ c.key ].allSmallNumbers = false;
          }
        }
      }

      if ( maxLen > result[ c.key ].maxChars ) {
        result[ c.key ].maxChars = maxLen;
      }
    }
  }
  return result;
}

// Calculates optimal column width based on max(header needs, data needs) + padding.
// Returns width in pixels.
function calculateOptimalWidth_( label, maxDataChars, hasVisibilityToggle ) {
  const CHAR_WIDTH = 8; // Approximate px per character
  const SORT_ARROW_WIDTH = 18; // Sort indicator + gap
  const VIS_TOGGLE_WIDTH = hasVisibilityToggle ? 26 : 0; // X icon + margins
  const PADDING = 20; // Left + right padding

  const headerWidth = ( label.length * CHAR_WIDTH ) + SORT_ARROW_WIDTH + VIS_TOGGLE_WIDTH + PADDING;
  const dataWidth = ( maxDataChars * CHAR_WIDTH ) + PADDING;

  return Math.max( headerWidth, dataWidth );
}

// Applies algorithmic shortening and calculates optimal widths.
// Mutates column objects in-place, setting label, fullLabel, width, and centered.
function applyHeaderShortening_( columns, items, level, sectionKey ) {
  const measurements = measureDataWidths_( columns, items, level, sectionKey );
  const hasVisToggle = sectionSupportsColumnHiding( sectionKey );

  const CHAR_WIDTH = 8;
  const SORT_ARROW_WIDTH = 18;
  const PADDING = 20;
  const CENTER_THRESHOLD = 0.80; // Center if data width <= 80% of header block width

  for ( const c of columns ) {
    const measured = measurements[ c.key ];

    // For header shortening, use maxChars or derive from maxPixels
    // This ensures proper ratio calculation for abbreviation decisions
    let effectiveDataChars = measured.maxChars;
    if ( measured.maxPixels != null && measured.maxChars === 0 ) {
      // Convert pixel width to approximate character count for ratio calculation
      effectiveDataChars = Math.ceil( measured.maxPixels / CHAR_WIDTH );
    }

    // If column already has an explicit label that differs from key, respect it
    if ( !c._labelOverride ) {
      const { label, fullLabel } = shortenHeader_( c.key, effectiveDataChars, c.width );
      c.label = label;
      c.fullLabel = fullLabel;
    }

    // Calculate header width
    const colHasVisToggle = hasVisToggle && c.key !== "Name";
    const visToggleWidth = colHasVisToggle ? 26 : 0;
    const labelText = c.label || c.key;
    const headerBlockWidth = ( labelText.length * CHAR_WIDTH ) + SORT_ARROW_WIDTH + visToggleWidth + PADDING;

    // Calculate data width - use direct pixel measurement if available (titans)
    let dataWidth;
    if ( measured.maxPixels != null ) {
      // Direct pixel width from measurement (for titan kv-pairs)
      dataWidth = measured.maxPixels + PADDING;
    } else {
      // Character-based calculation
      dataWidth = ( measured.maxChars * CHAR_WIDTH ) + PADDING;
    }

    // Set column width to max of header and data needs
    const optimalWidth = Math.max( headerBlockWidth, dataWidth );
    c.width = `${ optimalWidth }px`;

    // Center if data width is 80% or less of header block width (except Name column)
    c.centered = c.key !== "Name" && dataWidth <= ( headerBlockWidth * CENTER_THRESHOLD );
  }
}

// Sets the right-hand description panel to the section's default helper text.
function setDefaultDescriptionForSection( sectionKey ) {
  els.descTitle.textContent = DEFAULT_TITLE;
  els.detailText.textContent = DEFAULT_MESSAGES[ sectionKey ] || "Hover over an item to see its description. Click to pin.";

  // Ensure unpinned state
  uiState.descriptionPinned = false;
  uiState.pinnedItem = null;
}

// Sets the right-hand description panel title/body
// normalizing arrays and level-keyed objects using current level.
function setDescriptionOf( name, text, pinned, anchorEl, centerEl ) {
  if ( pinned === true ) uiState.descriptionPinned = true;
  els.descTitle.textContent = `Description of ${ name }`;
  const formatted = formatValue_( text, getCurrentLevel( ) );
  els.detailText.textContent = ( !formatted ) ? "(No description found.)" : formatted;

  // Mobile: open inline drawer instead of bottom sheet
  if ( pinned && isMobile( ) ) {
    openDescDrawer( anchorEl || document.querySelector( ".row.pinned" ), centerEl );
  }
}

// Show tooltip in description area (only if not pinned)
function showTooltip( subject, text ) {
  if ( uiState.descriptionPinned ) return;
  els.descTitle.textContent = `Description of ${ subject }`;
  els.detailText.textContent = text;
}

// Clear tooltip and restore default (only if not pinned)
function clearTooltip( ) {
  if ( uiState.descriptionPinned ) return;
  setDefaultDescriptionForSection( currentSection );
}


function enableSingleSelectBehavior( sel ) {
  sel.addEventListener( "mousedown", ( ev ) => {
    ev.preventDefault( );
    const option = ev.target;
    if ( option.tagName === "OPTION" ) {
      const wasSelected = option.selected;
      for ( const o of sel.options ) o.selected = false;
      if ( !wasSelected ) option.selected = true;
      sel.dispatchEvent( new Event( "change", { bubbles: true } ) );
    }
  } );
}

// Marks a tab active and updates currentSection.
function setActiveTab( section ) {
  currentSection = section;
  // Deactivate all data section tabs, but preserve Filters tab state
  for ( const btn of els.tabstrip.querySelectorAll( ".tab" ) ) {
    if ( btn.dataset.section === "filters" ) {
      // Keep filters tab state based on visibility
      btn.classList.toggle( "active", uiState.filtersVisible );
    } else {
      btn.classList.toggle( "active", btn.dataset.section === section );
    }
  }
  for ( const fn of _onTabChange ) fn( );
}

const _onTabChange = [ ];

// Creates a <select multiple> element populated with provided options.
function makeMultiSelect( options ) {
  const sel = document.createElement( "select" );
  sel.multiple = true;
  for ( const v of options ) {
    const opt = document.createElement( "option" );
    opt.value = v;
    opt.textContent = v;
    sel.appendChild( opt );
  }
  enableClickToToggle( sel );
  return sel;
}

// Enable click-to-toggle behavior on multiselect (instead of Ctrl+click)
function enableClickToToggle( sel ) {
  sel.addEventListener( "mousedown", ( ev ) => {
    ev.preventDefault( );
    const option = ev.target;
    if ( option.tagName === "OPTION" ) {
      option.selected = !option.selected;
      sel.dispatchEvent( new Event( "change", { bubbles: true } ) );
    }
  } );
}

// Returns the selected option values from a <select multiple>.
function getSelected( sel ) {
  const out = [ ];
  if ( !sel ) return out;
  for ( const opt of sel.options ) if ( opt.selected && opt.value ) out.push( opt.value );
  return out;
}

// Sorts the rendered row models (rows) based on sortState and reorders the DOM list.
function applySort( ) {
  const { key, dir } = sortState;
  const mul = dir === "asc" ? 1 : -1;

  rows.sort( ( a, b ) => {
    const av = ( key === "Name" ) ? a.name : formatValue_( a.flat[ key ], getCurrentLevel( ) );
    const bv = ( key === "Name" ) ? b.name : formatValue_( b.flat[ key ], getCurrentLevel( ) );
    const c = av.localeCompare( bv, undefined, { numeric: true, sensitivity: "base" } );
    if ( c !== 0 ) return c * mul;
    return a.name.localeCompare( b.name );
  } );

  // Update dataset.idx to match new positions so hover/click handlers
  // look up the correct item after reordering
  for ( let i = 0; i < rows.length; i++ ) {
    rows[ i ].el.dataset.idx = String( i );
  }

  const frag = document.createDocumentFragment( );
  for ( const r of rows ) frag.appendChild( r.el );
  els.dataList.innerHTML = "";
  els.dataList.appendChild( frag );
}

// Updates header button CSS classes to reflect current sortState.
function updateSortIndicators( ) {
  const btns = els.listHead.querySelectorAll( ".head-btn" );
  for ( const b of btns ) {
    b.classList.remove( "sorted-asc", "sorted-desc" );
    if ( b.dataset.sort === sortState.key ) {
      b.classList.add( sortState.dir === "asc" ? "sorted-asc" : "sorted-desc" );
    }
  }
}

// Attaches click handlers to sortable header buttons to update sortState,
// then sort/filter/refresh indicators.
function wireSorting( ) {
  const btns = els.listHead.querySelectorAll( ".head-btn" );
  for ( const b of btns ) {
    b.addEventListener( "click", ( ev ) => {
      const colKey = b.dataset.col;

      // Check if click was on the visibility toggle button
      const visBtn = ev.target.closest( ".col-vis-btn" );
      if ( visBtn ) {
        ev.stopPropagation( );
        if ( colKey && columnIsHideable( currentSection, colKey ) ) {
          toggleColumnVisibility( currentSection, colKey );
        }
        return; // Don't trigger sort
      }

      // If column is hidden, clicking anywhere on it should unhide (not sort)
      if ( b.classList.contains( "col-hidden" ) ) {
        if ( colKey && columnIsHideable( currentSection, colKey ) ) {
          toggleColumnVisibility( currentSection, colKey );
        }
        return; // Don't trigger sort
      }

      // Normal sort logic
      const k = b.dataset.sort;
      if ( !k ) return;
      if ( sortState.key === k ) sortState.dir = ( sortState.dir === "asc" ) ? "desc" : "asc";
      else { sortState.key = k; sortState.dir = "asc"; }
      applySort( );
      applyFilters( );
      updateSortIndicators( );
      saveState( );
    } );
  }
  updateSortIndicators( );
}

// Applies current multi-select filters (AND across keys, OR within each multi-select)
// and toggles row visibility.
function applyFilters( ) {
  // AND across filters; within a multi-select = OR.
  let shown = 0;

  for ( const r of rows ) {
    let ok = true;
    for ( const [ k, sel ] of Object.entries( selects ) ) {
      const wanted = getSelected( sel );
      if ( wanted.length === 0 ) continue;

      const v = r.flat[ k ];
      if ( Array.isArray( v ) ) {
        let any = false;
        for ( const w of wanted ) {
          if ( v.includes( w ) ) { any = true; break; }
        }
        if ( !any ) ok = false;
      } else {
        if ( !wanted.includes( String( v || "" ) ) ) ok = false;
      }

      if ( !ok ) break;
    }

    r.el.hidden = !ok;
    if ( ok ) shown++;
  }

  els.noResults.classList.toggle( "hidden", shown !== 0 );

  // Reapply alternating row colors based on visible rows
  updateAlternatingRows( );

  // Save filter state
  saveState( );
}

// Updates alternating row colors based on visible (non-hidden) rows
function updateAlternatingRows( ) {
  let visibleIndex = 0;
  for ( const r of rows ) {
    if ( !r.el.hidden ) {
      r.el.classList.toggle( "row-odd", visibleIndex % 2 === 0 );
      r.el.classList.toggle( "row-even", visibleIndex % 2 === 1 );
      visibleIndex++;
    } else {
      r.el.classList.remove( "row-odd", "row-even" );
    }
  }
}

// Applies column visibility state to all grid elements (headers, filters, data rows)
function applyColumnVisibility( sectionKey ) {
  const def = SECTIONS[ sectionKey ];
  if ( !def ) return;

  const hidden = getHiddenColumns( sectionKey );
  const colsCss = computeColsCss( def.columns, sectionKey );

  // Update --cols on all grid containers
  els.listHead.style.setProperty( "--cols", colsCss );
  els.dataList.style.setProperty( "--cols", colsCss );
  if ( els.filterRow.classList.contains( "grid-aligned" ) ) {
    els.filterRow.style.setProperty( "--cols", colsCss );
  }

  // Update header buttons
  const headBtns = els.listHead.querySelectorAll( ".head-btn" );
  def.columns.forEach( ( c, i ) => {
    const btn = headBtns[ i ];
    if ( !btn ) return;

    const isHidden = hidden.has( c.key );
    btn.classList.toggle( "col-hidden", isHidden );

    // Update tooltip and visibility button
    const visBtn = btn.querySelector( ".col-vis-btn" );
    if ( isHidden ) {
      btn.title = `${ c.fullLabel || c.key } - Click to Show`;
      if ( visBtn ) {
        visBtn.dataset.action = "show";
        visBtn.removeAttribute( "title" ); // Let parent tooltip show through
      }
    } else {
      btn.title = c.fullLabel || "";
      if ( visBtn ) {
        visBtn.dataset.action = "hide";
        visBtn.title = "Hide column";
      }
    }
  } );

  // Update filter cells (for grid-aligned filters - not applicable for current scope)
  const filterCols = els.filterRow.querySelectorAll( ".col[data-filter]" );
  def.columns.forEach( ( c, i ) => {
    const filterCol = filterCols[ i ];
    if ( filterCol ) {
      filterCol.classList.toggle( "col-hidden", hidden.has( c.key ) );
    }
  } );

  // Update all data row cells
  for ( const r of rows ) {
    const cells = r.el.querySelectorAll( ".col" );
    def.columns.forEach( ( c, i ) => {
      const cell = cells[ i ];
      if ( cell ) {
        cell.classList.toggle( "col-hidden", hidden.has( c.key ) );
      }
    } );
  }

  // Recalculate minimum grid width accounting for hidden columns
  const dataLayout = els.dataList.closest( ".data-layout" );
  if ( dataLayout ) {
    const gap = 8;
    let total = 0;
    for ( const c of def.columns ) {
      if ( hidden.has( c.key ) ) {
        total += 28; // HIDDEN_COL_WIDTH as number
      } else {
        const m = c.width.match( /(\d+)px/ );
        total += m ? Number( m[ 1 ] ) : 120;
      }
    }
    total += ( def.columns.length - 1 ) * gap + 24;
    const gridMinWidth = `${ total }px`;
    dataLayout.style.setProperty( "--grid-width", gridMinWidth );
    els.dataList.style.minWidth = gridMinWidth;
    els.listHead.style.minWidth = gridMinWidth;
  }
}

// Computes the minimum total grid width from column definitions so that
// backgrounds extend through the full scrollable area.
function computeGridMinWidth_( columns ) {
  const gap = 8; // matches CSS gap on .row / .list-head
  let total = 0;
  for ( const c of columns ) {
    const w = c.width;
    // Extract px value: either "NNpx" or "minmax(NNpx, ...)"
    const m = w.match( /(\d+)px/ );
    total += m ? Number( m[ 1 ] ) : 120; // fallback 120px
  }
  // Add inter-column gaps + max horizontal padding (list-head: 12+12=24)
  total += ( columns.length - 1 ) * gap + 24;
  return total;
}

// Builds the header row and filter-row skeleton DOM
// for the given column definitions.
function buildHeadAndFilters( columns, useGridFilters ) {
  const colsCss = columns.map( c => c.width ).join( " " );
  els.listHead.style.setProperty( "--cols", colsCss );
  els.dataList.style.setProperty( "--cols", colsCss );

  // Set minimum scrollable width so backgrounds extend fully
  const gridMinWidth = `${ computeGridMinWidth_( columns ) }px`;
  const dataLayout = els.dataList.closest( ".data-layout" );
  if ( dataLayout ) {
    dataLayout.style.setProperty( "--grid-width", gridMinWidth );
  }
  // Also set inline min-width on rows container and header directly
  els.dataList.style.minWidth = gridMinWidth;
  els.listHead.style.minWidth = gridMinWidth;

  // Head
  els.listHead.innerHTML = columns.map( c => {
    const sortAttr = c.sort ? `data-sort="${ escapeHtml( c.key ) }"` : `data-sort=""`;
    const titleAttr = c.fullLabel ? ` title="${ escapeHtml( c.fullLabel ) }"` : "";
    const colAttr = `data-col="${ escapeHtml( c.key ) }"`;

    // Add visibility toggle for supported sections (not Name column)
    const showVisToggle = columnIsHideable( currentSection, c.key );
    const visBtn = showVisToggle ? `<span class="col-vis-btn" data-action="hide" title="Hide column"></span>` : "";

    return `<button class="head-btn col" ${ sortAttr } ${ colAttr }${ titleAttr }>
      <span class="head-label">${ escapeHtml( c.label ) }</span>
      <span class="sort-ind"></span>
      ${ visBtn }
    </button>`;
  } ).join( "" );

  // Filters setup
  if ( useGridFilters ) {
    // Grid-aligned filters (e.g., for pilots)
    els.filterRow.className = "filter-row grid-aligned";
    els.filterRow.style.setProperty( "--cols", colsCss );

    // Create filter column for each column (some will remain empty if no filter)
    const filterColumnsHtml = columns.map( c => `<div class="col" data-filter="${ escapeHtml( c.key ) }"></div>` ).join( "" );

    els.filterRow.innerHTML = filterColumnsHtml;
  } else {
    // Horizontal layout
    els.filterRow.className = "filter-row horizontal";
    els.filterRow.style.removeProperty( "--cols" );

    const filterHeaderHtml = `
      <div class="filter-header">
        <div class="filter-header-buttons">
          <div id="filterSelection" class="filter-selection"></div>
        </div>
      </div>
    `;

    els.filterRow.innerHTML = filterHeaderHtml + `<div class="filter-content"></div>`;
  }

  selects = { };
}

// Renders row DOM elements for items and builds the
// internal rows model used for sorting/filtering/hover.
function renderRows( columns, items, rowHtmlFn ) {
  rows = [ ];
  const frag = document.createDocumentFragment( );

  for ( let i = 0; i < items.length; i++ ) {
    const it = items[ i ];

    const el = document.createElement( "button" );
    el.type = "button";
    el.className = "row";
    el.setAttribute( "role", "option" );

    // IMPORTANT: index used for row-hover description
    el.dataset.idx = String( i );

    el.innerHTML = rowHtmlFn( columns, it );

    frag.appendChild( el );
    rows.push( { el, name: it.name, ref: it.ref, flat: it.flat } );
  }

  els.dataList.innerHTML = "";
  els.dataList.appendChild( frag );
}

/* ---------- Items builders ---------- */
// Converts a {Name: refObj} dictionary into the standard items array for rendering.
function sectionItems_simpleDict( dictObj ) {
  // dict of {Name: {...}}
  const out = [ ];
  for ( const [ name, ref ] of Object.entries( dictObj || { } ) ) {
    out.push( { name, ref, flat: { Name: name, ...ref } } );
  }
  out.sort( ( a, b ) => a.name.localeCompare( b.name ) );
  return out;
}

/* ---------- PILOTS ---------- */

function pilotItems( ) {
  const out = [ ];
  const hero = ( catalog.pilots && catalog.pilots.Hero ) ? catalog.pilots.Hero : { };
  const common = ( catalog.pilots && catalog.pilots.Common ) ? catalog.pilots.Common : { };

  for ( const [ name, ref ] of Object.entries( hero ) ) {
    out.push( { name, ref, flat: { Name: name, ...ref, Rarity: "Hero" } } ); // derived
  }
  for ( const [ name, ref ] of Object.entries( common ) ) {
    out.push( { name, ref, flat: { Name: name, ...ref, Rarity: "Common" } } );
  }

  out.sort( ( a, b ) => a.name.localeCompare( b.name ) );
  return out;
}

//
function talentCellHTML( tier, v ) {
  if ( v == null ) return `<span class="cell-muted">-</span>`;
  if ( Array.isArray( v ) ) {
    if ( v.length === 0 ) return `<span class="cell-muted">-</span>`;
    const inner = v.map( t =>
      `<span class="talent" data-tier="${ escapeHtml( tier ) }" data-talent="${ escapeHtml( t ) }">${ escapeHtml( t ) }</span>`
    ).join( "" );
    return `<div class="talent-stack">${ inner }</div>`;
  }
  const s = String( v );
  if ( !s ) return `<span class="cell-muted">-</span>`;
  return `<span class="talent" data-tier="${ escapeHtml( tier ) }" data-talent="${ escapeHtml( s ) }">${ escapeHtml( s ) }</span>`;
}

//
function pilotsRowHtml( columns, it ) {
  return columns.map( c => {
    if ( pilotTierNames.includes( c.key ) ) {
      return `<div class="col">${ talentCellHTML( c.key, it.flat[ c.key ] ) }</div>`;
    }
    const raw = it.flat[ c.key ];
    const s = formatValue_( raw, getCurrentLevel( ) );
    const txt = ( !s ) ? `<span class="cell-muted">-</span>` : `<span>${ escapeHtml( s ) }</span>`;
    return `<div class="col">${ txt }</div>`;
  } ).join( "" );
}

// Mounts level slider in description area if multiple levels available
function mountLevelSlider( sectionKey ) {
  // Always create slider HTML to reserve space, but hide for pilots/single-level sections
  const shouldShow = sectionKey !== "pilots"
    && availableLevels.length > 1;

  els.levelControl.innerHTML = `
    <div class="level-control-inner">
      <label class="level-label">Level:</label>
      <input type="range" id="levelSlider" min="0" max="${ availableLevels.length - 1 }" value="0" step="1" class="level-slider" />
      <span id="levelDisplay" class="level-display">${ availableLevels[ 0 ] }</span>
    </div>
  `;

  // Re-bind slider elements
  els.levelSlider = document.getElementById( "levelSlider" );
  els.levelDisplay = document.getElementById( "levelDisplay" );

  if ( shouldShow ) {
    els.levelControl.classList.remove( "visibility-hidden" );

    // Update slider to match current level for this section
    const currentIdx = availableLevels.indexOf( getCurrentLevel( ) );
    if ( currentIdx !== -1 ) {
      els.levelSlider.value = String( currentIdx );
      els.levelDisplay.textContent = String( getCurrentLevel( ) );
    }
  } else {
    els.levelControl.classList.add( "visibility-hidden" );
  }

}

//
function mountPilotFilters( ) {
  // Horizontal filter boxes — no filter-selection picker for pilots
  const filterContent = els.filterRow.querySelector( ".filter-content" );
  if ( !filterContent ) return;

  // Derive filter keys from column order (skip Name)
  const pilotFilterable = new Set( [ "Dominion", "Class", "Rarity", ...pilotTierNames ] );
  const filterKeys = SECTIONS.pilots.columns
    .map( c => c.key )
    .filter( k => pilotFilterable.has( k ) );
  const mountedFilters = [ ];
  const filterData = [ ];

  // Collect all filter data first
  for ( const key of filterKeys ) {
    let options = [ ];
    if ( key === "Rarity" ) {
      options = [ "Hero", "Common" ];
    } else if ( key === "Dominion" || key === "Class" ) {
      const set = new Set( );
      for ( const r of rows ) if ( r.flat[ key ] ) set.add( String( r.flat[ key ] ) );
      options = Array.from( set ).sort( ( a, b ) => a.localeCompare( b ) );
    } else {
      const obj = ( pilotTalentsByTier && pilotTalentsByTier[ key ] ) ? pilotTalentsByTier[ key ] : { };
      options = Object.keys( obj ).sort( ( a, b ) => a.localeCompare( b ) );
    }

    if ( options.length === 0 ) continue;

    filterData.push( { key, options } );
    mountedFilters.push( key );
  }

  // Calculate uniform size (max 7, min 3)
  const maxOptions = Math.max( ...filterData.map( f => f.options.length ) );
  const uniformSize = Math.max( 3, Math.min( 7, maxOptions ) );

  // Mount as standard horizontal filter boxes
  for ( const { key, options } of filterData ) {
    const sel = makeMultiSelect( options );
    sel.size = uniformSize;
    sel.addEventListener( "change", applyFilters );

    const box = document.createElement( "div" );
    box.className = "filter-box";
    box.innerHTML = `<div class="filter-box-title">${ escapeHtml( key ) }</div>`;
    box.appendChild( sel );
    filterContent.appendChild( box );
    selects[ key ] = sel;
  }

  // Wire up header buttons (hides filter-selection for pilots)
  wireFilterHeaderButtons( "pilots", mountedFilters, uniformSize );
  updateFilterVisibility( "pilots" );
}

//
function wirePilotHoverDescription( ) {
  // Hover: show talent description unless pinned
  els.dataList.onmouseover = ( ev ) => {
    if ( isMobile( ) ) return;
    if ( uiState.descriptionPinned ) return;

    const t = ev.target;
    if ( !( t instanceof HTMLElement ) ) return;

    if ( t.classList.contains( "talent" ) ) {
      const tier = t.dataset.tier;
      const name = t.dataset.talent;
      if ( !tier || !name ) return;

      const desc = ( pilotTalentsByTier[ tier ] && pilotTalentsByTier[ tier ][ name ] ) ? pilotTalentsByTier[ tier ][ name ] : "";
      if ( desc != null && desc !== "" ) setDescriptionOf( name, desc );
    } else {
      // Not hovering over a talent: reset to default
      setDefaultDescriptionForSection( currentSection );
    }
  };

  // Mouse out: reset to default
  els.dataList.onmouseout = ( ) => {
    if ( isMobile( ) ) return;
    if ( !uiState.descriptionPinned ) {
      setDefaultDescriptionForSection( currentSection );
    }
  };

  // Click: pin/unpin talent description
  els.dataList.onclick = ( ev ) => {
    const t = ev.target;
    if ( !( t instanceof HTMLElement ) ) return;

    if ( t.classList.contains( "talent" ) ) {
      const tier = t.dataset.tier;
      const name = t.dataset.talent;
      if ( !tier || !name ) return;

      const rowEl = t.closest( ".row" );
      const pilotName = rows[ Number( rowEl.dataset.idx ) ].name;
      const itemKey = `talent:${ pilotName }:${ tier }:${ name }`;

      // Toggle: if clicking same talent, unpin
      if ( uiState.descriptionPinned && uiState.pinnedItem === itemKey ) {
        if ( isMobile( ) ) { closeDescDrawer( ); return; }
        uiState.descriptionPinned = false;
        uiState.pinnedItem = null;
        t.classList.remove( "pinned" );
        setDefaultDescriptionForSection( currentSection );
        return;
      }

      const desc = ( pilotTalentsByTier[ tier ] && pilotTalentsByTier[ tier ][ name ] ) ? pilotTalentsByTier[ tier ][ name ] : "";
      if ( desc != null && desc !== "" ) {
        // Remove pinned class from all talents
        els.dataList.querySelectorAll( ".talent.pinned" ).forEach( el => el.classList.remove( "pinned" ) );
        // Add pinned class to this talent
        t.classList.add( "pinned" );
        setDescriptionOf( name, desc, true, t.closest( ".row" ), t );
        uiState.pinnedItem = itemKey;
      }
      return; // Prevent unpinning below
    }

    // Click outside talent: unpin
    if ( isMobile( ) ) { closeDescDrawer( ); return; }
    els.dataList.querySelectorAll( ".talent.pinned" ).forEach( el => el.classList.remove( "pinned" ) );
    setDefaultDescriptionForSection( currentSection );
  };
}

/* ---------- GENERIC (non-pilot) ---------- */

function genericRowHtml( columns, it ) {
  return columns.map( c => {
    const raw = it.flat[ c.key ];
    const s = formatValue_( raw, getCurrentLevel( ) );
    const txt = ( !s ) ? `<span class="cell-muted">-</span>` : `<span>${ escapeHtml( s ) }</span>`;
    const centeredClass = c.centered ? " col-centered" : "";
    return `<div class="col${ centeredClass }" data-col="${ escapeHtml( c.key ) }">${ txt }</div>`;
  } ).join( "" );
}

/* ---------- TITANS ---------- */

function wireTitanWeaponNavigation( ) {
  // Hover: show module/weapon description unless pinned
  els.dataList.onmouseover = ( ev ) => {
    if ( isMobile( ) ) return;
    if ( uiState.descriptionPinned ) return;

    const moduleCell = ev.target.closest( ".kv-list" );
    if ( moduleCell ) {
      const moduleName = moduleCell.dataset.module;
      const rowEl = ev.target.closest( ".row" );
      if ( !rowEl || !moduleName ) return;

      const idx = Number( rowEl.dataset.idx );
      if ( !Number.isFinite( idx ) ) return;

      const it = rows[ idx ];
      if ( !it || !it.flat ) return;

      const moduleData = it.flat[ moduleName ];
      if ( !moduleData || typeof moduleData !== "object" ) return;

      // Check if this module has a description
      let desc = moduleData.Description || "";
      let descName = `${ it.name } - ${ moduleName }`;

      // Special case: if this is the Weapons column, get current weapon's description
      if ( moduleName === "Weapons" ) {
        const weaponNames = Object.keys( moduleData ).sort( );
        const currentIdx = uiState.titanWeaponIndex[ it.name ] || 0;
        const weaponName = weaponNames[ currentIdx ];
        const weapon = moduleData[ weaponName ];
        if ( weapon && weapon.Description ) {
          desc = weapon.Description;
          descName = `${ it.name } - ${ weaponName }`;
        }
      }

      if ( desc != null && desc !== "" ) setDescriptionOf( descName, desc );
    } else {
      // Not hovering over a module: reset to default
      setDefaultDescriptionForSection( currentSection );
    }
  };

  // Mouse out: reset to default
  els.dataList.onmouseout = ( ) => {
    if ( isMobile( ) ) return;
    if ( !uiState.descriptionPinned ) {
      setDefaultDescriptionForSection( currentSection );
    }
  };

  // Click: pin/unpin module/weapon description
  els.dataList.onclick = ( ev ) => {
    const btn = ev.target.closest( ".weapon-nav-btn" );
    if ( btn ) {
      // Handle weapon navigation - unpin if changing weapon
      uiState.descriptionPinned = false;
      uiState.pinnedItem = null;

      const titanName = btn.dataset.titan;
      const dir = btn.dataset.dir;
      if ( !titanName || !dir ) return;

      const titanData = catalog.titans && catalog.titans[ titanName ];
      if ( !titanData || !titanData.Weapons ) return;

      const weaponNames = Object.keys( titanData.Weapons ).sort( );
      if ( weaponNames.length === 0 ) return;

      const currentIdx = uiState.titanWeaponIndex[ titanName ] || 0;
      let newIdx = currentIdx;

      if ( dir === "prev" ) {
        newIdx = ( currentIdx - 1 + weaponNames.length ) % weaponNames.length;
      } else if ( dir === "next" ) {
        newIdx = ( currentIdx + 1 ) % weaponNames.length;
      }

      uiState.titanWeaponIndex[ titanName ] = newIdx;

      // Find and update just this row
      const rowIdx = rows.findIndex( r => r.name === titanName );
      if ( rowIdx === -1 ) return;

      const rowData = rows[ rowIdx ];
      const def = SECTIONS.titans;
      const newHtml = def.rowHtml( def.columns, rowData );
      rowData.el.innerHTML = newHtml;

      return;
    }

    // Handle module/weapon description pinning
    const moduleCell = ev.target.closest( ".kv-list" );
    if ( moduleCell ) {
      const moduleName = moduleCell.dataset.module;
      const rowEl = ev.target.closest( ".row" );
      if ( !rowEl || !moduleName ) return;

      const idx = Number( rowEl.dataset.idx );
      if ( !Number.isFinite( idx ) ) return;

      const it = rows[ idx ];
      if ( !it || !it.flat ) return;

      const moduleData = it.flat[ moduleName ];
      if ( !moduleData || typeof moduleData !== "object" ) return;

      let desc = moduleData.Description || "";
      let descName = `${ it.name } - ${ moduleName }`;
      let itemKey = `titan:${ it.name }:${ moduleName }`;

      // Special case: Weapons column
      if ( moduleName === "Weapons" ) {
        const weaponNames = Object.keys( moduleData ).sort( );
        const currentIdx = uiState.titanWeaponIndex[ it.name ] || 0;
        const weaponName = weaponNames[ currentIdx ];
        const weapon = moduleData[ weaponName ];
        if ( weapon && weapon.Description ) {
          desc = weapon.Description;
          descName = `${ it.name } - ${ weaponName }`;
          itemKey = `titan:${ it.name }:weapon:${ weaponName }`;
        }
      }

      // Toggle: if clicking same module, unpin
      if ( uiState.descriptionPinned && uiState.pinnedItem === itemKey ) {
        if ( isMobile( ) ) { closeDescDrawer( ); return; }
        uiState.descriptionPinned = false;
        uiState.pinnedItem = null;
        setDefaultDescriptionForSection( currentSection );
        return;
      }

      if ( desc != null && desc !== "" ) {
        // Remove pinned class from all rows, add to this one
        els.dataList.querySelectorAll( ".row.pinned" ).forEach( el => el.classList.remove( "pinned" ) );
        rowEl.classList.add( "pinned" );
        setDescriptionOf( descName, desc, true, rowEl );
        uiState.pinnedItem = itemKey;
      }
      return; // Prevent unpinning below
    }

    // Click outside: unpin
    if ( isMobile( ) ) { closeDescDrawer( ); return; }
    setDefaultDescriptionForSection( currentSection );
  };
}

// Fields to exclude from titan module columns (shown under Name instead or not needed)
const TITAN_MODULE_EXCLUDE = new Set( [ "Section Type", "Description", "Class", "Rarity", "Dominion", "Upgrade Cost" ] );

function titansRowHtml( columns, it ) {
  return columns.map( c => {
    if ( c.key === "Name" ) {
      const s = formatValue_( it.flat[ c.key ], getCurrentLevel( ) );
      const txt = ( !s ) ? `<span class="cell-muted">-</span>` : escapeHtml( s );

      // Get Class, Rarity, Dominion, Upgrade Cost from first available module
      let titanClass = "";
      let titanRarity = "";
      let titanDominion = "";
      let titanUpgradeCost = "";
      for ( const modKey of [ "Chassis", "Torso", "Right Shoulder", "Left Shoulder" ] ) {
        const mod = it.flat[ modKey ];
        if ( mod && typeof mod === "object" ) {
          if ( !titanClass && mod.Class ) titanClass = String( mod.Class );
          if ( !titanRarity && mod.Rarity ) titanRarity = String( mod.Rarity );
          if ( !titanDominion && mod.Dominion ) titanDominion = String( mod.Dominion );
          if ( !titanUpgradeCost && mod[ "Upgrade Cost" ] ) titanUpgradeCost = String( mod[ "Upgrade Cost" ] );
          if ( titanClass && titanRarity && titanDominion && titanUpgradeCost ) break;
        }
      }

      // Build key-value pairs under name
      const kvPairs = [ ];
      if ( titanClass ) kvPairs.push( `<div class="kv-item"><span class="kv-key">Class:</span> <span class="kv-val">${ escapeHtml( titanClass ) }</span></div>` );
      if ( titanRarity ) kvPairs.push( `<div class="kv-item"><span class="kv-key">Rarity:</span> <span class="kv-val">${ escapeHtml( titanRarity ) }</span></div>` );
      if ( titanDominion ) kvPairs.push( `<div class="kv-item"><span class="kv-key">Dominion:</span> <span class="kv-val">${ escapeHtml( titanDominion ) }</span></div>` );
      if ( titanUpgradeCost ) kvPairs.push( `<div class="kv-item"><span class="kv-key">Upgrade Cost:</span> <span class="kv-val">${ escapeHtml( titanUpgradeCost ) }</span></div>` );
      const metaHtml = kvPairs.length > 0 ? `<div class="titan-meta">${ kvPairs.join( "" ) }</div>` : "";

      return `<div class="col titan-name-col"><div class="titan-name">${ txt }</div>${ metaHtml }</div>`;
    }

    // For module columns (Chassis, Torso, Right Shoulder, Left Shoulder, Weapons)
    const module = it.flat[ c.key ];
    if ( !module || typeof module !== "object" ) {
      return `<div class="col"><span class="cell-muted">-</span></div>`;
    }

    // Special case: Weapons is a map of weapon name -> weapon object
    if ( c.key === "Weapons" ) {
      const weaponNames = Object.keys( module ).sort( );
      if ( weaponNames.length === 0 ) {
        return `<div class="col"><span class="cell-muted">-</span></div>`;
      }

      const titanName = it.name;

      // Initialize weapon index for this titan if not set
      if ( uiState.titanWeaponIndex[ titanName ] == null ) {
        uiState.titanWeaponIndex[ titanName ] = 0;
      }

      const currentIdx = uiState.titanWeaponIndex[ titanName ];
      const wName = weaponNames[ currentIdx ];
      const weapon = module[ wName ];

      const kvPairs = Object.entries( weapon )
        .filter( ( [ k ] ) => !TITAN_MODULE_EXCLUDE.has( k ) )
        .map( ( [ k, v ] ) => {
          const val = formatValue_( v, getCurrentLevel( ) );
          return `<div class="kv-item"><span class="kv-key">${ escapeHtml( k ) }:</span> <span class="kv-val">${ escapeHtml( val ) }</span></div>`;
        } )
        .join( "" );

      // Navigation buttons (only show if multiple weapons)
      const navHtml = weaponNames.length > 1
        ? `<div class="weapon-nav">
             <button class="weapon-nav-btn" data-titan="${ escapeHtml( titanName ) }" data-dir="prev">&lt;</button>
             <span class="weapon-nav-label">${ escapeHtml( wName ) }</span>
             <button class="weapon-nav-btn" data-titan="${ escapeHtml( titanName ) }" data-dir="next">&gt;</button>
           </div>`
        : `<div class="kv-subheader">${ escapeHtml( wName ) }</div>`;

      return `<div class="col kv-list"><div class="kv-group">${ navHtml }${ kvPairs }</div></div>`;
    }

    // Regular modules (Chassis, Torso, Shoulders)
    const kvPairs = Object.entries( module )
      .filter( ( [ k ] ) => !TITAN_MODULE_EXCLUDE.has( k ) )
      .map( ( [ k, v ] ) => {
        const val = formatValue_( v, getCurrentLevel( ) );
        return `<div class="kv-item"><span class="kv-key">${ escapeHtml( k ) }:</span> <span class="kv-val">${ escapeHtml( val ) }</span></div>`;
      } )
      .join( "" );

    return `<div class="col kv-list" data-module="${ escapeHtml( c.key ) }">${ kvPairs }</div>`;
  } ).join( "" );
}

//
function wireRowHoverDescription( descFieldKey ) {
  // Row hover shows description unless pinned
  els.dataList.onmouseover = ( ev ) => {
    if ( isMobile( ) ) return;
    if ( uiState.descriptionPinned ) return;

    const rowEl = ev.target.closest( ".row" );
    if ( rowEl ) {
      const idx = Number( rowEl.dataset.idx );
      if ( !Number.isFinite( idx ) ) return;

      const it = rows[ idx ];
      if ( !it ) return;

      const desc = it.flat ? it.flat[ descFieldKey ] : "";
      if ( desc != null && desc !== "" ) setDescriptionOf( it.name, desc );
    } else {
      // Not hovering over a row: reset to default
      setDefaultDescriptionForSection( currentSection );
    }
  };

  // Mouse out: reset to default
  els.dataList.onmouseout = ( ) => {
    if ( isMobile( ) ) return;
    if ( !uiState.descriptionPinned ) {
      setDefaultDescriptionForSection( currentSection );
    }
  };

  // Row click pins/unpins description
  els.dataList.onclick = ( ev ) => {
    const rowEl = ev.target.closest( ".row" );
    if ( rowEl ) {
      const idx = Number( rowEl.dataset.idx );
      if ( !Number.isFinite( idx ) ) return;

      const it = rows[ idx ];
      if ( !it ) return;

      const itemKey = `row:${ it.name }`;

      // Toggle: if clicking same row, unpin
      if ( uiState.descriptionPinned && uiState.pinnedItem === itemKey ) {
        if ( isMobile( ) ) { closeDescDrawer( ); return; }
        uiState.descriptionPinned = false;
        uiState.pinnedItem = null;
        rowEl.classList.remove( "pinned" );
        setDefaultDescriptionForSection( currentSection );
        return;
      }

      const desc = it.flat ? it.flat[ descFieldKey ] : "";
      if ( desc != null && desc !== "" ) {
        // Remove pinned class from all rows
        els.dataList.querySelectorAll( ".row.pinned" ).forEach( el => el.classList.remove( "pinned" ) );
        // Add pinned class to this row
        rowEl.classList.add( "pinned" );
        setDescriptionOf( it.name, desc, true, rowEl );
        uiState.pinnedItem = itemKey;
      }
      return; // Prevent unpinning below
    }

    // Click outside row: unpin
    if ( isMobile( ) ) { closeDescDrawer( ); return; }
    els.dataList.querySelectorAll( ".row.pinned" ).forEach( el => el.classList.remove( "pinned" ) );
    setDefaultDescriptionForSection( currentSection );
  };
}

//
function mountSimpleFilters( columns ) {
  const filterContent = els.filterRow.querySelector( ".filter-content" );
  if ( !filterContent ) return;

  // Whitelist: always include these
  const whitelist = new Set( [ "Rarity","Class","Dominion","Type","GearType","Weapon Mount Type","Damage Type" ] );

  // Columns that should never be filters
  const excludeList = new Set( [ "Name", "Maximum Range", "Upgrade Cost", "Shop Cost" ] );

  // Heuristic: auto-filter "categorical-looking" columns
  const MAX_UNIQUE = 25;
  const MAX_STRING_LENGTH = 60;
  const mountedFilters = [ ];
  const filterData = [ ];

  // Collect all filter data first
  for ( const c of columns ) {
    // Skip excluded columns
    if ( excludeList.has( c.key ) ) continue;

    // Skip if already whitelisted (will be processed below)
    const isWhitelisted = whitelist.has( c.key );

    // Collect unique values
    const set = new Set( );
    for ( const r of rows ) {
      const v = r.flat[ c.key ];
      if ( v == null || v === "" ) continue;

      // For heuristic check: skip arrays and objects
      if ( !isWhitelisted && ( Array.isArray( v ) || typeof v === "object" ) ) continue;

      const str = String( v );

      // For heuristic: skip if value is too long or looks numeric-only
      if ( !isWhitelisted ) {
        if ( str.length > MAX_STRING_LENGTH ) continue;
        if ( /^[\d.,]+$/.test( str ) ) continue; // purely numeric
      }

      set.add( str );
    }

    // Apply heuristic: only mount if whitelisted OR if ≤ MAX_UNIQUE unique values
    if ( !isWhitelisted && set.size > MAX_UNIQUE ) continue;
    if ( set.size === 0 ) continue;

    const options = Array.from( set ).sort( ( a, b ) => a.localeCompare( b ) );
    // Use full name for filters: fullLabel (if abbreviated), else label (if custom), else key
    const filterLabel = c.fullLabel || c.label || c.key;

    filterData.push( { key: c.key, label: filterLabel, options } );
    mountedFilters.push( filterLabel );
  }

  // Calculate uniform size (max 7, min 3)
  const maxOptions = Math.max( ...filterData.map( f => f.options.length ), 0 );
  const uniformSize = Math.max( 3, Math.min( 7, maxOptions ) );

  // Mount filters with uniform size
  for ( const { key, label, options } of filterData ) {
    const sel = makeMultiSelect( options );
    sel.size = uniformSize;
    sel.addEventListener( "change", applyFilters );

    // Create filter box with title
    const box = document.createElement( "div" );
    box.className = "filter-box";
    box.innerHTML = `<div class="filter-box-title">${ escapeHtml( label ) }</div>`;
    box.appendChild( sel );

    filterContent.appendChild( box );
    selects[ key ] = sel;
  }

  // Wire up header buttons
  wireFilterHeaderButtons( currentSection, mountedFilters, uniformSize );
  updateFilterVisibility( currentSection );

  // Return whether any filters were mounted
  return mountedFilters.length > 0;
}

// Wire clear button and create filter selection multiselect
function wireFilterHeaderButtons( sectionKey, availableFilters, uniformSize ) {
  const filterSelectionHost = document.getElementById( "filterSelection" );
  const hasFilters = availableFilters && availableFilters.length > 0;

  // If no filters available, disable filter UI for this section
  if ( !hasFilters ) {
    if ( els.clearFiltersBtn ) {
      els.clearFiltersBtn.classList.add( "visibility-hidden" );
    }
    els.filterRow.classList.remove( "visible" );
    // Deactivate Filters tab
    const filtersTab = els.tabstrip.querySelector( '[data-section="filters"]' );
    if ( filtersTab ) {
      filtersTab.classList.remove( "active" );
    }
    if ( filterSelectionHost ) {
      filterSelectionHost.innerHTML = "";
    }
    return;
  }

  // Show Clear Filters button when filters are available
  if ( els.clearFiltersBtn ) {
    els.clearFiltersBtn.classList.remove( "visibility-hidden" );
  }

  // Initialize visible filters — always show all
  if ( !uiState.visibleFilters[ sectionKey ] ) {
    uiState.visibleFilters[ sectionKey ] = new Set( availableFilters );
  }

  // Hide filter-header for pilots (no filter-selection picker)
  const filterHeader = els.filterRow.querySelector( ".filter-header" );
  if ( filterHeader ) {
    filterHeader.style.display = ( sectionKey === "pilots" ) ? "none" : "";
  }

  // Filter selection UI — multi-select (skipped for pilots)
  if ( filterSelectionHost && sectionKey !== "pilots" ) {
    const filterBox = document.createElement( "div" );
    filterBox.className = "filter-box";
    filterBox.innerHTML = `<div class="filter-box-title">Filters</div>`;

    const filterSel = makeMultiSelect( availableFilters );
    filterSel.size = Math.min( 6, uniformSize || 3 );

    for ( let i = 0; i < filterSel.options.length; i++ ) {
      const opt = filterSel.options[ i ];
      opt.selected = uiState.visibleFilters[ sectionKey ].has( opt.value );
    }

    filterSel.addEventListener( "change", ( ) => {
      uiState.visibleFilters[ sectionKey ] = new Set( getSelected( filterSel ) );
      updateFilterVisibility( sectionKey );
      saveState( );
    } );

    filterSel.addEventListener( "mouseenter", ( ) => {
      showTooltip( "Filter Selection", "Choose which filters to display. Select a filter to show it, deselect to hide it. Helps manage screen space when you only need specific filters." );
    } );
    filterSel.addEventListener( "mouseleave", clearTooltip );

    filterBox.appendChild( filterSel );
    filterSelectionHost.innerHTML = "";
    filterSelectionHost.appendChild( filterBox );
  }
}

// Show/hide filters based on visibility settings
function updateFilterVisibility( sectionKey ) {
  const visibleSet = uiState.visibleFilters[ sectionKey ] || new Set( );

  const filterContent = els.filterRow.querySelector( ".filter-content" );
  if ( filterContent ) {
    const boxes = filterContent.querySelectorAll( ".filter-box" );
    boxes.forEach( box => {
      const title = box.querySelector( ".filter-box-title" );
      if ( title ) {
        box.style.display = visibleSet.has( title.textContent ) ? "" : "none";
      }
    } );
  }
}

/* ---------- Section definitions ---------- */

function gearItems( ) {
  const out = [ ];
  const g = catalog.gear || { };
  for ( const [ gtype, dict ] of Object.entries( g ) ) {
    for ( const [ name, ref ] of Object.entries( dict || { } ) ) {
      out.push( { name, ref, flat: { Name: name, GearType: gtype, ...ref } } );
    }
  }
  out.sort( ( a, b ) => a.name.localeCompare( b.name ) );
  return out;
}

const SECTIONS = {
  pilots: {
    columns: [
      { key:"Name", width:"190px", sort:true },
      { key:"Rarity", width:"90px", sort:true },
      { key:"Class", width:"120px", sort:true },
      { key:"Dominion", width:"130px", sort:true },
      { key:"General Talent", width:"140px", sort:true },
      { key:"Class Talent", width:"150px", sort:true },
      { key:"Personality Talent", width:"150px", sort:true },
      { key:"Dominion Talent", width:"150px", sort:true },
      { key:"Ace Talent", width:"130px", sort:true },
    ],
    getItems: pilotItems,
    rowHtml: pilotsRowHtml,
    mountFilters: mountPilotFilters,
    wireHover: wirePilotHoverDescription,
    hideableColumns: new Set( [ "Rarity", "Class", "Dominion" ] ),
  },

  torsos: {
    columns: [
      { key:"Name", width:"240px", sort:true },
      { key:"Class", width:"140px", sort:true },
      { key:"Dominion", width:"130px", sort:true },
      { key:"Rarity", width:"110px", sort:true },
      { key:"Weight", width:"90px", sort:true },
      { key:"Armor", width:"110px", sort:true },
      { key:"Cooldown", width:"110px", sort:true },
      { key:"Weapon Mount Type", width:"110px", sort:true },
      { key:"Weapon Mount Count", width:"70px", sort:true },
      { key:"Upgrade Cost", width:"220px", sort:true },
      { key:"Shop Cost", width:"160px", sort:true },
    ],
    getItems: ( ) => sectionItems_simpleDict( catalog.torsos || { } ),
    rowHtml: genericRowHtml,
    descField: "Description",
  },

  chassis: {
    columns: [
      { key:"Name", width:"240px", sort:true },
      { key:"Class", width:"140px", sort:true },
      { key:"Dominion", width:"130px", sort:true },
      { key:"Rarity", width:"110px", sort:true },
      { key:"Weight", width:"90px", sort:true },
      { key:"Energy", width:"90px", sort:true },
      { key:"Speed", width:"90px", sort:true },
      { key:"Pelvic Armor", width:"110px", sort:true },
      { key:"Leg Armor", width:"110px", sort:true },
      { key:"Acceleration", width:"110px", sort:true },
      { key:"Fuel", width:"90px", sort:true },
      { key:"Dash Speed", width:"110px", sort:true },
      { key:"Dash Distance", width:"120px", sort:true },
      { key:"Upgrade Cost", width:"220px", sort:true },
      { key:"Shop Cost", width:"160px", sort:true },
    ],
    getItems: ( ) => sectionItems_simpleDict( catalog.chassis || { } ),
    rowHtml: genericRowHtml,
    descField: "Description",
  },

  shoulders: {
    columns: [
      { key:"Name", width:"240px", sort:true },
      { key:"Class", width:"140px", sort:true },
      { key:"Dominion", width:"130px", sort:true },
      { key:"Rarity", width:"110px", sort:true },
      { key:"Weight", width:"90px", sort:true },
      { key:"Armor", width:"110px", sort:true },
      { key:"Shield", width:"110px", sort:true },
      { key:"Shield Regeneration", width:"110px", sort:true },
      { key:"Shield Cooldown Reduction", width:"110px", sort:true },
      { key:"Weapon Mount Type", width:"110px", sort:true },
      { key:"Weapon Mount Count", width:"70px", sort:true },
      { key:"Upgrade Cost", width:"220px", sort:true },
      { key:"Shop Cost", width:"160px", sort:true },
    ],
    getItems: ( ) => sectionItems_simpleDict( catalog.shoulders || { } ),
    rowHtml: genericRowHtml,
    descField: "Description",
  },

  weapons: {
    columns: [
      { key:"Name", width:"240px", sort:true },
      { key:"Type", width:"140px", sort:true },
      { key:"Class", width:"140px", sort:true },
      { key:"Dominion", width:"130px", sort:true },
      { key:"Rarity", width:"110px", sort:true },
      { key:"Weight", width:"80px", sort:true },
      { key:"Energy", width:"80px", sort:true },
      { key:"Damage Type", width:"140px", sort:true },
      { key:"Armor Damage", width:"130px", sort:true },
      { key:"Shield Damage", width:"130px", sort:true },
      { key:"Ammo", width:"90px", sort:true },
      { key:"Rate of Fire", width:"110px", sort:true },
      { key:"Time to Reload", width:"110px", sort:true },
      { key:"Effective Range", width:"90px", sort:true },
      { key:"Maximum Range", width:"90px", sort:true },
      { key:"Weapon Mount Type", width:"110px", sort:true },
      { key:"Upgrade Cost", width:"220px", sort:true },
      { key:"Shop Cost", width:"160px", sort:true },
    ],
    getItems: ( ) => sectionItems_simpleDict( catalog.weapons || { } ),
    rowHtml: genericRowHtml,
    descField: "Description",
  },

  gear: {
    columns: [
      { key:"Name", width:"260px", sort:true },
      { key:"GearType", label:"Gear Type", _labelOverride:true, width:"130px", sort:true },
      { key:"Class", width:"140px", sort:true },
      { key:"Dominion", width:"130px", sort:true },
      { key:"Rarity", width:"110px", sort:true },
      { key:"Weight", width:"80px", sort:true },
      { key:"Energy", width:"80px", sort:true },
      { key:"Uses", width:"90px", sort:true },
      { key:"Gear Recharge", width:"110px", sort:true },
      { key:"Cooldown", width:"110px", sort:true },
      { key:"Lock-on", width:"90px", sort:true },
      { key:"Upgrade Cost", width:"220px", sort:true },
      { key:"Shop Cost", width:"160px", sort:true },
    ],
    getItems: gearItems,
    rowHtml: genericRowHtml,
    descField: "Description",
  },

  titans: {
    columns: [
      { key:"Name", width:"200px", sort:true },
      { key:"Chassis", width:"180px", sort:false },
      { key:"Torso", width:"180px", sort:false },
      { key:"Right Shoulder", width:"180px", sort:false },
      { key:"Left Shoulder", width:"180px", sort:false },
      { key:"Weapons", width:"200px", sort:false },
    ],
    getItems: ( ) => sectionItems_simpleDict( catalog.titans || { } ),
    rowHtml: titansRowHtml,
    descField: "Description",
    wireHover: wireTitanWeaponNavigation,
  },
};

function renderSection( sectionKey ) {
  const def = SECTIONS[ sectionKey ];
  if ( !def ) return;

  setActiveTab( sectionKey );
  setDefaultDescriptionForSection( sectionKey );

  // Reset pinned state when switching sections
  uiState.descriptionPinned = false;
  uiState.pinnedItem = null;

  // Clear hover handler (we'll re-wire)
  els.dataList.onmouseover = null;

  // Initialize level for this section if not set
  if ( uiState.sectionLevels[ sectionKey ] == null ) {
    uiState.sectionLevels[ sectionKey ] = availableLevels[ 0 ] || 1;
  }

  // Items must be built first so we can measure data widths for header labels
  const items = def.getItems( );

  // Apply algorithmic header shortening and calculate optimal widths
  applyHeaderShortening_( def.columns, items, getCurrentLevel( ), sectionKey );

  // Build head + filter skeleton (always horizontal layout)
  buildHeadAndFilters( def.columns, false );
  wireSorting( );

  // Titans: keep filters horizontal in landscape (no sidebar for level-slider-only)
  const dataLayout = els.dataList.closest( ".data-layout" );
  if ( dataLayout ) {
    dataLayout.classList.toggle( "no-sidebar", sectionKey === "titans" );
  }

  // Reset section sort default
  sortState = { key:"Name", dir:"asc" };

  renderRows( def.columns, items, def.rowHtml );

  // Filters
  selects = { };
  const sectionHasLevels = sectionKey !== "pilots" && availableLevels.length > 1;
  let hasFilters = true;
  let hasFilterBoxes = true;
  if ( def.mountFilters ) {
    def.mountFilters( );
  } else {
    hasFilterBoxes = mountSimpleFilters( def.columns );
    hasFilters = hasFilterBoxes;
  }
  hasFilters = hasFilters || sectionHasLevels;
  currentSectionHasFilterBoxes = hasFilterBoxes;
  currentSectionHasLevels = sectionHasLevels;

  // Place nav-controls (Clear Filters + level slider) inside filter row
  els.filterRow.appendChild( navControls );

  // In mobile landscape sidebar, shrink filter selects to fit their option count
  if ( isMobile( ) && window.matchMedia( "( orientation: landscape )" ).matches ) {
    for ( const sel of Object.values( selects ) ) {
      sel.size = Math.min( sel.size, sel.options.length );
    }
  }

  // Restore saved state for this section (after filters are mounted)
  const persistedState = loadPersistedState( );
  if ( persistedState && persistedState.sectionState && persistedState.sectionState[ sectionKey ] ) {
    restoreSectionState( sectionKey, persistedState.sectionState[ sectionKey ] );
  }

  // After restore, re-sync filter visibility and picker selection
  if ( hasFilterBoxes ) {
    // Pilots have no filter-selection picker — force all filters visible
    // (overrides stale persisted visibleFilters from previous sessions)
    if ( sectionKey === "pilots" ) {
      const allKeys = [ ];
      els.filterRow.querySelectorAll( ".filter-content .filter-box .filter-box-title" )
        .forEach( t => allKeys.push( t.textContent ) );
      if ( allKeys.length ) uiState.visibleFilters[ sectionKey ] = new Set( allKeys );
    }
    // Re-apply visibility to DOM (restoreSectionState may have changed the set)
    updateFilterVisibility( sectionKey );
    // Sync the filter-selection picker with the current visible set
    const filterSel = document.querySelector( "#filterSelection .filter-box select" );
    if ( filterSel ) {
      const vf = uiState.visibleFilters[ sectionKey ] || new Set( );
      for ( let i = 0; i < filterSel.options.length; i++ ) {
        filterSel.options[ i ].selected = vf.has( filterSel.options[ i ].value );
      }
    }
  }

  // Apply column visibility state for sections that support it
  if ( sectionSupportsColumnHiding( sectionKey ) ) {
    applyColumnVisibility( sectionKey );
  }

  // Handle filter visibility based on whether section has filters
  if ( hasFilters ) {
    // Show filter row if there are filter boxes OR a level slider
    if ( uiState.filtersVisible && ( hasFilterBoxes || sectionHasLevels ) ) {
      els.filterRow.classList.add( "visible" );
    }
    // Clear Filters only meaningful when there are actual filter boxes
    els.clearFiltersBtn.classList.toggle(
      "visibility-hidden",
      !uiState.filtersVisible || !hasFilterBoxes
    );
    // Restore Filters tab state
    const filtersTab = els.tabstrip.querySelector( '[data-section="filters"]' );
    if ( filtersTab ) {
      filtersTab.classList.toggle( "active", uiState.filtersVisible );
    }
  }
  // If no filters, wireFilterHeaderButtons already hid everything

  // Set header-height and filter-height synchronously to avoid one-frame stale positioning
  const listHeader = document.querySelector( ".list-header" );
  const headerHeight = ( listHeader && getComputedStyle( listHeader ).position === "sticky" )
    ? listHeader.offsetHeight : 0;
  const syncFilterHeight = els.filterRow.classList.contains( "visible" )
    ? els.filterRow.offsetHeight : 0;
  els.filterRow.style.setProperty( "--header-height", `${ headerHeight }px` );
  els.listHead.style.setProperty( "--header-height", `${ headerHeight }px` );
  els.listHead.style.setProperty( "--filter-height", `${ syncFilterHeight }px` );

  // Equalize filter box widths and refine filter row height after equalization
  requestAnimationFrame( ( ) => {
    // Measure widest filter box and set all to match
    const allBoxes = els.filterRow.querySelectorAll( ".filter-box" );
    if ( allBoxes.length ) {
      els.filterRow.style.removeProperty( "--filter-box-w" );
      let maxW = 0;
      allBoxes.forEach( b => { maxW = Math.max( maxW, b.scrollWidth ); } );
      if ( maxW > 0 ) {
        els.filterRow.style.setProperty( "--filter-box-w", maxW + "px" );
      }
    }

    const filterHeight = ( hasFilters && ( hasFilterBoxes || sectionHasLevels ) && uiState.filtersVisible )
      ? els.filterRow.offsetHeight : 0;
    const rAfHeader = document.querySelector( ".list-header" );
    const rAfHeaderH = ( rAfHeader && getComputedStyle( rAfHeader ).position === "sticky" )
      ? rAfHeader.offsetHeight : 0;
    els.listHead.style.setProperty( "--header-height", `${ rAfHeaderH }px` );
    els.listHead.style.setProperty( "--filter-height", `${ filterHeight }px` );
  } );

  // Mount level slider in description area
  mountLevelSlider( sectionKey );

  // Hover behavior
  if ( def.wireHover ) def.wireHover( );
  else if ( def.descField ) wireRowHoverDescription( def.descField );

  applySort( );
  applyFilters( );
  updateSortIndicators( );

  relocateBrand( );
}

async function main( ) {
  const res = await fetch( CATALOG_URL, { cache: "no-store" } );
  if ( !res.ok ) throw new Error( `Failed to load catalog: ${ res.status }` );
  catalog = await res.json( );

  pilotTierNames = Array.isArray( catalog.pilotTalentTiers ) ? catalog.pilotTalentTiers.slice( ) : [ ];
  pilotTalentsByTier = catalog.pilotTalents || { };

  // Detect available levels from catalog data
  availableLevels = detectAvailableLevels( catalog );

  // Load persisted state
  const persistedState = loadPersistedState( );

  // Left tabs overlap right: assign decreasing z-index based on DOM order
  els.tabstrip.querySelectorAll( ".tab" ).forEach( ( tab, i, all ) => {
    tab.style.zIndex = all.length - i + 1;
  } );

  // Create nav-controls container and adopt the existing elements
  navControls = document.createElement( "div" );
  navControls.className = "nav-controls";
  navControls.appendChild( els.levelControl );
  navControls.appendChild( els.clearFiltersBtn );

  // Relocate brand on tab change (in case mobile ↔ desktop changed)
  _onTabChange.push( relocateBrand );

  // Scrim click (closes drawer / legacy bottom sheet on mobile)
  document.getElementById( "scrim" ).addEventListener( "click", ( ) => {
    closeDescDrawer( );
  } );

  // Debounced viewport-change handler.
  // Orientation change on phones where landscape width > 768px fires BOTH
  // the max-width and orientation listeners. Without debouncing, two
  // back-to-back renderSection calls race and the second can clear state
  // restored by the first. Saving pin state at the FIRST event and
  // deferring the render to a single rAF eliminates the race.
  let _vpRenderFrame = 0;
  let _vpSavedPin = null;

  function scheduleViewportRerender( ) {
    // Capture pin state at the earliest event, before anything clears it
    if ( !_vpSavedPin ) {
      _vpSavedPin = {
        pinned: uiState.descriptionPinned,
        item: uiState.pinnedItem
      };
    }
    // Cancel any previously scheduled render so we only run once
    cancelAnimationFrame( _vpRenderFrame );
    _vpRenderFrame = requestAnimationFrame( ( ) => {
      const savedPin = _vpSavedPin;
      _vpSavedPin = null;
      relocateBrand( );
      els.filterRow.style.setProperty( "--header-height", "0px" );
      els.listHead.style.setProperty( "--header-height", "0px" );
      els.listHead.style.setProperty( "--filter-height", "0px" );
      renderSectionPreservingPin( currentSection, savedPin );
    } );
  }

  window.matchMedia( "( max-width: 768px )" ).addEventListener( "change", scheduleViewportRerender );
  window.matchMedia( "( orientation: landscape )" ).addEventListener( "change", scheduleViewportRerender );

  // Restore global filter visibility state
  if ( persistedState && persistedState.filtersVisible != null ) {
    uiState.filtersVisible = persistedState.filtersVisible;
  }

  els.tabstrip.addEventListener( "click", ( ev ) => {
    const btn = ev.target.closest( ".tab" );
    if ( !btn ) return;
    const section = btn.dataset.section;

    if ( section === "filters" ) {
      // Toggle filters visibility
      uiState.filtersVisible = !uiState.filtersVisible;
      const showRow = uiState.filtersVisible
        && ( currentSectionHasFilterBoxes || currentSectionHasLevels );
      els.filterRow.classList.toggle( "visible", showRow );
      btn.classList.toggle( "active", uiState.filtersVisible );
      els.clearFiltersBtn.classList.toggle(
        "visibility-hidden",
        !uiState.filtersVisible || !currentSectionHasFilterBoxes
      );

      // Toggle level slider with filters
      els.levelControl.classList.toggle(
        "visibility-hidden",
        !uiState.filtersVisible || currentSection === "pilots"
          || availableLevels.length <= 1
      );

      // Update column header position
      requestAnimationFrame( ( ) => {
        const filterHeight = showRow ? els.filterRow.offsetHeight : 0;
        const togHeader = document.querySelector( ".list-header" );
        const togHeaderH = ( togHeader && getComputedStyle( togHeader ).position === "sticky" )
          ? togHeader.offsetHeight : 0;
        els.filterRow.style.setProperty( "--header-height", `${ togHeaderH }px` );
        els.listHead.style.setProperty( "--header-height", `${ togHeaderH }px` );
        els.listHead.style.setProperty( "--filter-height", `${ filterHeight }px` );
      } );

      // Save filter visibility state
      saveState( );
    } else {
      renderSection( section );
    }
  } );

  // Clear Filters button
  els.clearFiltersBtn.addEventListener( "click", ( ) => {
    for ( const s of Object.values( selects ) ) for ( const opt of s.options ) opt.selected = false;
    if ( currentSection === "pilots" ) setDefaultDescriptionForSection( "pilots" );
    applyFilters( );
  } );

  // Tooltip: Clear Filters button
  els.clearFiltersBtn.addEventListener( "mouseenter", ( ) => {
    showTooltip( "Clear Filters", "Clears all active filter selections, showing all items in the current section." );
  } );
  els.clearFiltersBtn.addEventListener( "mouseleave", clearTooltip );

  // Tooltip: Filters tab
  const filtersTab = els.tabstrip.querySelector( '[data-section="filters"]' );
  if ( filtersTab ) {
    filtersTab.addEventListener( "mouseenter", ( ) => {
      if ( !uiState.filtersVisible ) {
        showTooltip( "Filters", "Click to activate. Enables narrowing the list to those with the selected properties." );
      } else {
        showTooltip( "Filters", "Click to hide filters. Currently showing filter controls for the active section." );
      }
    } );
    filtersTab.addEventListener( "mouseleave", clearTooltip );
  }

  // Tooltip: Level control (covers label and slider)
  document.addEventListener( "mouseover", ( ev ) => {
    const levelControl = ev.target.closest( ".level-control" );
    if ( levelControl ) {
      showTooltip( "Level Selector", "Adjust to view stats at different upgrade levels. Changes all displayed values to match the selected level." );
    }
  } );
  document.addEventListener( "mouseout", ( ev ) => {
    const levelControl = ev.target.closest( ".level-control" );
    if ( levelControl && !levelControl.contains( ev.relatedTarget ) ) {
      clearTooltip( );
    }
  } );

  // Level slider (delegated event for dynamically created slider)
  document.addEventListener( "input", ( ev ) => {
    if ( ev.target && ev.target.id === "levelSlider" ) {
      const sliderPos = Number( ev.target.value );
      const level = availableLevels[ sliderPos ];
      setCurrentLevel( level );

      const display = document.getElementById( "levelDisplay" );
      if ( display ) display.textContent = String( level );

      // Re-render current section to update all level-dependent values
      // Important: preserve pinned state across level changes
      renderSectionPreservingPin( currentSection );
    }
  } );

  // Global click handler to unpin when clicking outside data area
  document.addEventListener( "click", ( ev ) => {
    // If click is inside dataList, let the section-specific handlers deal with it
    if ( ev.target instanceof Node && els.dataList.contains( ev.target ) ) return;

    // Click is outside data area: unpin and remove visual highlighting
    if ( uiState.descriptionPinned ) {
      if ( isMobile( ) ) { closeDescDrawer( ); return; }
      els.dataList.querySelectorAll( ".row.pinned, .talent.pinned" ).forEach( el => el.classList.remove( "pinned" ) );
      setDefaultDescriptionForSection( currentSection );
    }
  } );

  // Render the last active section (or default to pilots)
  const initialSection = ( persistedState && persistedState.activeSection ) || "pilots";
  renderSection( initialSection );

  // Set Filters tab state based on persisted visibility
  if ( filtersTab ) {
    filtersTab.classList.toggle( "active", uiState.filtersVisible );
  }
  els.filterRow.classList.toggle( "visible", uiState.filtersVisible );
  els.clearFiltersBtn.classList.toggle( "visibility-hidden", !uiState.filtersVisible );
}

main( ).catch( err => {
  console.error( "MAIN ERROR:", err );
  els.noResults.classList.remove( "hidden" );
  els.noResults.textContent = "Error: " + ( err?.message || String( err ) );
} );
