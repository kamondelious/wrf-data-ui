// @ts-check
const { test, expect } = require( "@playwright/test" );

/**
 * Scroll-behavior regression tests.
 *
 * The existing catalog-tests.js checks `getComputedStyle.position === "sticky"`
 * but doesn't verify that elements actually stick at the right position after
 * scrolling. These tests scroll well past the headers and verify:
 * 1. Elements have position: sticky
 * 2. They remain in the viewport after scrolling (top < viewportHeight)
 * 3. They are in the correct stacking order
 * 4. They are near their expected CSS `top` position
 */

test.beforeEach( async ( { page } ) => {
  await page.goto( "/" );
  await page.waitForSelector( ".row", { timeout: 10_000 } );
} );

async function switchSection( page, section ) {
  await page.locator( `.tab[data-section="${ section }"]` ).click();
  await page.waitForSelector( "#dataList .row", { timeout: 5_000 } );
}

async function ensureFilters( page, visible ) {
  const filtersTab = page.locator( '.tab[data-section="filters"]' );
  const isActive = await filtersTab.evaluate(
    el => el.classList.contains( "active" )
  );
  if ( visible !== isActive ) {
    await filtersTab.click();
  }
}

/**
 * Scroll well past the sticky elements and measure their bounding rects.
 * Returns element measurements plus scroll metadata.
 */
async function scrollAndMeasure( page, selectors ) {
  return page.evaluate( ( sels ) => {
    // Find the actual scroll container (body when html overflow:hidden, else documentElement)
    const scroller = document.body.scrollHeight > document.body.clientHeight
      ? document.body
      : document.documentElement;

    // Measure natural position before scrolling
    const firstSel = Object.values( sels )[ 0 ];
    const firstEl = document.querySelector( firstSel );
    const scrollTop = scroller.scrollTop;
    const naturalTop = firstEl
      ? firstEl.getBoundingClientRect().top + scrollTop
      : 200;

    // Scroll well past sticky elements
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    const target = Math.min( maxScroll, Math.max( naturalTop + 500, 1000 ) );
    scroller.scrollTop = target;
    scroller.getBoundingClientRect(); // force layout

    const vh = scroller.clientHeight;
    const actualScroll = scroller.scrollTop;
    const results = {
      _scrollY: actualScroll,
      _maxScroll: maxScroll,
      _viewportHeight: vh,
      _scrolledPastTarget: actualScroll > naturalTop,
    };
    for ( const [ key, sel ] of Object.entries( sels ) ) {
      const el = document.querySelector( sel );
      if ( el ) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle( el );
        results[ key ] = {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          position: style.position,
          display: style.display,
          visible: rect.height > 0 && style.display !== "none",
        };
      } else {
        results[ key ] = null;
      }
    }
    return results;
  }, selectors );
}

/* ================================================================== */
/*  Desktop sticky tests                                              */
/* ================================================================== */

test.describe( "Desktop sticky headers", () => {
  test.beforeEach( ( { }, testInfo ) => {
    test.skip( !testInfo.project.name.includes( "desktop" ), "desktop only" );
  } );

  test( "list-header sticks at top after scroll", async ( { page } ) => {
    await switchSection( page, "torsos" );
    const m = await scrollAndMeasure( page, {
      listHeader: ".list-header",
    } );
    expect( m._scrolledPastTarget ).toBe( true );
    expect( m.listHeader.position ).toBe( "sticky" );
    // Should be at or very near the top of the viewport
    expect( m.listHeader.top ).toBeGreaterThanOrEqual( -2 );
    expect( m.listHeader.top ).toBeLessThan( 5 );
  } );

  test( "sticky cascade: header → filter-row → list-head (filters visible)",
    async ( { page } ) => {
      await switchSection( page, "torsos" );
      await ensureFilters( page, true );

      const m = await scrollAndMeasure( page, {
        listHeader: ".list-header",
        filterRow: "#filterRow",
        listHead: "#listHead",
      } );

      expect( m._scrolledPastTarget ).toBe( true );

      // All should be sticky and in the viewport
      expect( m.listHeader.position ).toBe( "sticky" );
      expect( m.filterRow.position ).toBe( "sticky" );
      expect( m.listHead.position ).toBe( "sticky" );

      // Correct order: header < filter-row < list-head
      expect( m.listHeader.top ).toBeLessThan( m.filterRow.top );
      expect( m.filterRow.top ).toBeLessThan( m.listHead.top );

      // All above the fold
      expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
    }
  );

  test( "list-head sticks below header (filters hidden)", async ( { page } ) => {
    await switchSection( page, "torsos" );
    await ensureFilters( page, false );

    const m = await scrollAndMeasure( page, {
      listHeader: ".list-header",
      listHead: "#listHead",
    } );

    expect( m._scrolledPastTarget ).toBe( true );
    expect( m.listHead.position ).toBe( "sticky" );
    // list-head should be in the viewport, below or at list-header bottom
    expect( m.listHead.top ).toBeGreaterThanOrEqual( m.listHeader.bottom - 2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );

  test( "sticky works for pilots section", async ( { page } ) => {
    await switchSection( page, "pilots" );

    const m = await scrollAndMeasure( page, {
      listHeader: ".list-header",
      listHead: "#listHead",
    } );

    expect( m._scrolledPastTarget ).toBe( true );
    expect( m.listHead.position ).toBe( "sticky" );
    expect( m.listHead.top ).toBeGreaterThanOrEqual( -2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );

  test( "sticky works for titans section", async ( { page } ) => {
    await switchSection( page, "titans" );

    const m = await scrollAndMeasure( page, {
      listHeader: ".list-header",
      listHead: "#listHead",
    } );

    if ( !m._scrolledPastTarget ) return; // not enough content
    expect( m.listHead.position ).toBe( "sticky" );
    expect( m.listHead.top ).toBeGreaterThanOrEqual( -2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );
} );

/* ================================================================== */
/*  Mobile portrait sticky tests                                      */
/* ================================================================== */

test.describe( "Portrait sticky headers", () => {
  test.beforeEach( ( { }, testInfo ) => {
    test.skip( !testInfo.project.name.includes( "portrait" ), "portrait only" );
  } );

  // Pilots has 79 rows — plenty of content in portrait
  test( "list-head sticks in viewport after scroll", async ( { page } ) => {
    await switchSection( page, "pilots" );
    await ensureFilters( page, false );

    const m = await scrollAndMeasure( page, {
      listHead: "#listHead",
    } );

    expect( m._scrolledPastTarget ).toBe( true );
    expect( m.listHead.position ).toBe( "sticky" );
    // On mobile, --header-height=0 so list-head should be near top
    expect( m.listHead.top ).toBeGreaterThanOrEqual( -2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );

  test( "filter-row sticks above list-head (filters visible)", async ( { page } ) => {
    await switchSection( page, "pilots" );
    await ensureFilters( page, true );

    const m = await scrollAndMeasure( page, {
      filterRow: "#filterRow",
      listHead: "#listHead",
    } );

    expect( m._scrolledPastTarget ).toBe( true );
    expect( m.filterRow.position ).toBe( "sticky" );
    expect( m.filterRow.top ).toBeGreaterThanOrEqual( -2 );
    // list-head below filter-row
    expect( m.listHead.top ).toBeGreaterThanOrEqual( m.filterRow.bottom - 2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );

  test( "sticky works for weapons section", async ( { page } ) => {
    await switchSection( page, "weapons" );

    const m = await scrollAndMeasure( page, {
      listHead: "#listHead",
    } );

    expect( m._scrolledPastTarget ).toBe( true );
    expect( m.listHead.position ).toBe( "sticky" );
    expect( m.listHead.top ).toBeGreaterThanOrEqual( -2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );

  test( "sticky works for titans section", async ( { page } ) => {
    await switchSection( page, "titans" );

    const m = await scrollAndMeasure( page, {
      listHead: "#listHead",
    } );

    if ( !m._scrolledPastTarget ) return;
    expect( m.listHead.position ).toBe( "sticky" );
    expect( m.listHead.top ).toBeGreaterThanOrEqual( -2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );
} );

/* ================================================================== */
/*  Mobile landscape sticky tests                                     */
/* ================================================================== */

test.describe( "Landscape sticky headers", () => {
  test.beforeEach( ( { }, testInfo ) => {
    test.skip( !testInfo.project.name.includes( "landscape" ), "landscape only" );
  } );

  test( "list-head sticks in viewport after scroll", async ( { page } ) => {
    await switchSection( page, "pilots" );
    await ensureFilters( page, false );

    const m = await scrollAndMeasure( page, {
      listHead: "#listHead",
    } );

    expect( m._scrolledPastTarget ).toBe( true );
    expect( m.listHead.position ).toBe( "sticky" );
    expect( m.listHead.top ).toBeGreaterThanOrEqual( -2 );
    expect( m.listHead.bottom ).toBeLessThan( m._viewportHeight );
  } );

  test( "filter sidebar visible in landscape (non-titan)", async ( { page } ) => {
    await switchSection( page, "pilots" );
    await ensureFilters( page, true );

    const m = await scrollAndMeasure( page, {
      filterRow: "#filterRow",
      listHead: "#listHead",
    } );

    expect( m.filterRow.visible ).toBe( true );
    expect( m.listHead.position ).toBe( "sticky" );
  } );

  test( "titans use no-sidebar layout", async ( { page } ) => {
    await switchSection( page, "titans" );

    const hasSidebar = await page.evaluate( () => {
      const dl = document.querySelector( ".data-layout" );
      return dl ? !dl.classList.contains( "no-sidebar" ) : false;
    } );

    expect( hasSidebar ).toBe( false );
  } );
} );
