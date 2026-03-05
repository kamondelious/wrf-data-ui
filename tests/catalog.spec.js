// @ts-check
const { test, expect } = require( "@playwright/test" );
const fs = require( "fs" );
const path = require( "path" );

const testSrc = fs.readFileSync(
  path.join( __dirname, "..", "client", "catalog-tests.js" ),
  "utf-8"
);

test.beforeEach( async ( { page } ) => {
  await page.goto( "/" );
  await page.waitForSelector( ".row", { timeout: 10_000 } );
} );

test.describe( "Catalog test suite", () => {
  test( "all categories pass", async ( { page } ) => {
    const report = await page.evaluate( testSrc );

    // Log the formatted report for CI visibility
    if ( report.formattedReport ) {
      console.log( report.formattedReport );
    }

    // If the suite itself threw, fail immediately
    if ( report.error ) {
      throw new Error( `Suite crashed: ${ report.error }` );
    }

    // Collect per-test failures for a clear message
    const failures = [];
    for ( const cat of report.categories ) {
      for ( const t of cat.tests ) {
        if ( !t.pass ) {
          failures.push( `${ t.id } ${ t.name }${ t.detail ? " — " + t.detail : "" }` );
        }
      }
    }

    expect(
      failures,
      `${ failures.length } test(s) failed:\n  ${ failures.join( "\n  " ) }`
    ).toHaveLength( 0 );
  } );
} );
