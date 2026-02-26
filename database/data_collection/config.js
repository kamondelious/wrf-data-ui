/**
 * config.gs
 *
 * Goal: isolate all constants + column names + section configs.
 *
 * NOTE: Apps Script treats all .gs files as one project scope.
 * You do not need imports. These globals will be visible everywhere.
 */

const column_names = [
  'Name',                      // 0
  'Weight',                    // 1
  'Energy',                    // 2
  'Type',                      // 3
  'Class',                     // 4
  'Rarity',                    // 5
  'Armor',                     // 6
  'Cooldown',                  // 7
  'Description',               // 8
  'Pelvic Armor',              // 9
  'Leg Armor',                 // 10
  'Max Speed',                 // 11
  'Acceleration',              // 12
  'Fuel Capacity',             // 13
  'Shield',                    // 14
  'Shield Regeneration',       // 15
  'Shield Cooldown Reduction', // 16
  'Dominion',                  // 17
  'Damage Type',               // 18
  'Armor Damage',              // 19
  'Shield Damage',             // 20
  'Ammo',                      // 21
  'Rate of Fire',              // 22
  'Time to Reload',            // 23
  'Effective Range',           // 24
  'Uses',                      // 25
  'Gear Recharge',             // 26
  'General Talent',            // 27
  'Personality Talent',        // 28
  'Ace Talent',                // 29
  'Weapon Mount Type',         // 30
  'Weapon Mount Count',        // 31
  'Upgrade Cost',              // 32
  'Shop Cost',                 // 33
  'Speed',                     // 34
  'Fuel',                      // 35
  'Dash Speed',                // 36
  'Dash Distance',             // 37
  'Maximum Range',             // 38
  'Lock-on',                   // 39
  'Class Talent',              // 40
  'Dominion Talent',           // 41
  'Weapon Name'                // 42
];

const torsos_config = [
  {
    'size': { 'cols': 'AA', 'rows': 30 },
    'wanted': {
      'A': 5,
      'B': 0,
      'C': 4,
      'D': 31,
      'E': 31,
      'F': 1,
      'H': 6,
      'I': 6,
      'L': 7,
      'M': 7,
      'P': 8,
      'Q': 8,
      'Z': 32,
      'AA': 33
    },
    'first_header_row': 2,
    'first_data_row': 4,
    'first_data_col': 'A'
  }
];

const legs_config = [
  {
    'size': { 'cols': 'AE', 'rows': 30 },
    'wanted': {
      'A': 5,
      'B': 0,
      'C': 4,
      'D': 1,
      'E': 2,
      'G': 34,
      'H': 34,
      'K': 12,
      'L': 12,
      'O': 35,
      'P': 35,
      'S': 9,
      'T': 9,
      'W': 10,
      'X': 10,
      'AA': 36,
      'AB': 37,
      'AD': 32,
      'AE': 33
    },
    'first_header_row': 2,
    'first_data_row': 4,
    'first_data_col': 'A'
  }
];

const shoulders_config = [
  {
    'size': { 'cols': 'Z', 'rows': 30 },
    'wanted': {
      'A': 5,
      'B': 0,
      'C': 4,
      'D': 31,
      'E': 31,
      'F': 1,
      'H': 6,
      'I': 6,
      'L': 14,
      'M': 14,
      'P': 15,
      'Q': 15,
      'T': 16,
      'U': 16,
      'Y': 32,
      'Z': 33
    },
    'first_header_row': 2,
    'first_data_row': 4,
    'first_data_col': 'A'
  }
];

const weapons_config = [
  {
    'size': { 'cols': 'BC', 'rows': 37 },
    'wanted': {
      'A': 5,
      'B': 0,
      'C': 4,
      'D': 18,
      'E': 3,
      'F': 30,
      'G': 1,
      'H': 2,
      'J': 19,
      'K': 19,
      'N': 20,
      'O': 20,
      'R': 21,
      'S': 21,
      'V': 22,
      'W': 22,
      'AD': 23,
      'AE': 23,
      'AH': 24,
      'AI': 38,
      'BB': 32,
      'BC': 33
    },
    'first_header_row': 2,
    'first_data_row': 4,
    'first_data_col': 'A'
  }
];

const gear_config = [
  {
    'type': 'supply',
    'size': { 'cols': 'V', 'rows': 17 },
    'wanted': {
      'A': 5,
      'B': 0,
      'C': 4,
      'D': 4,
      'E': 3,
      'F': 1,
      'G': 2,
      'I': 7,
      'J': 7,
      'M': 25,
      'N': 25,
      'P': 8,
      'Q': 8,
      'U': 32,
      'V': 33
    },
    'first_header_row': 2,
    'first_data_row': 4,
    'first_data_col': 'A'
  },
  {
    'type': 'cycle',
    'size': { 'cols': 'V', 'rows': 33 },
    'wanted': {
      'A': 5,
      'B': 0,
      'C': 4,
      'D': 4,
      'E': 3,
      'F': 1,
      'G': 2,
      'I': 26,
      'J': 26,
      'M': 39,
      'N': 39,
      'P': 8,
      'Q': 8,
      'U': 32,
      'V': 33
    },
    'first_header_row': 21,
    'first_data_row': 23,
    'first_data_col': 'A'
  }
];

const titans_config = [
	{
		'size': { 'cols': 'W', 'rows': 5 },
		'type': 'Chassis',
		'independent': true,
		'wanted': {
			'A': 5,
			'B': 0,
			'C': 4,
			'E': 34,
			'F': 34,
			'I': 12,
			'J': 12,
			'M': 35,
			'N': 35,
			'Q': 9,
			'R': 9,
			'U': 10,
			'V': 10
		},
		'first_header_row': 1,
		'first_data_row': 4,
		'first_data_col': 'A'
	},
	{
		'size': { 'cols': 'BI', 'rows': 5 },
		'type': 'Torso',
		'independent': true,
		'wanted': {
			'A': 5,
			'B': 0,
			'C': 4,
			'Y': 6,
			'Z': 6,
			'AC': 7,
			'AD': 7,
			'AG': 39,
			'AI': 38,
			'AK': 8,
			'AT': 8,
			'BI': 32
		},
		'first_header_row': 1,
		'first_data_row': 4,
		'first_data_col': 'A'
	},
	{
		'size': { 'cols': 'BI', 'rows': 5 },
		'type': 'Right Shoulder',
		'wanted': {
			'A': 5,
			'B': 0,
			'C': 4,
			'M': 6,
			'N': 6,
			'Q': 14,
			'R': 14,
			'U': 15,
			'V': 15,
			'Y': 16,
			'Z': 16,
			'AC': 7,
			'AD': 7,
			'AG': 39,
			'AI': 38,
			'AK': 8,
			'AT': 8,
			'BI': 32
		},
		'first_header_row': 9,
		'first_data_row': 12,
		'first_data_col': 'A'
	},
	{
		'size': { 'cols': 'BI', 'rows': 5 },
		'type': 'Left Shoulder',
		'wanted': {
			'A': 5,
			'B': 0,
			'C': 4,
			'M': 6,
			'N': 6,
			'Q': 14,
			'R': 14,
			'U': 15,
			'V': 15,
			'Y': 16,
			'Z': 16,
			'AC': 7,
			'AD': 7,
			'AG': 39,
			'AI': 38,
			'AK': 8,
			'AT': 8,
			'BI': 32
		},
		'first_header_row': 17,
		'first_data_row': 20,
		'first_data_col': 'A'
	},
	{
		'size': { 'cols': 'BI', 'rows': 8 },
		'type': 'Weapon',
		'wanted': {
			'A': 5,
			'B': 0,
			'C': 4,
			'E': 42,
			'F': 18,
			'G': 3,
			'I': 19,
			'J': 19,
			'M': 20,
			'N': 20,
			'Q': 21,
			'R': 21,
			'U': 22,
			'V': 22,
			'AC': 23,
			'AD': 23,
			'AG': 24,
			'AI': 38,
			'BI': 32
		},
		'first_header_row': 25,
		'first_data_row': 28,
		'first_data_col': 'A'
	}
];

const pilots_config = [
{
    'size': { 'cols': 'G', 'rows': 32 },
    'type': 'Hero',
    'wanted': {
      'A': 0,
      'B': 4,
      'C': 27,
      'D': 40,
      'E': 28,
      'F': 41,
      'G': 29
    },
    'first_header_row': 2,
    'first_data_row': 3,
    'first_data_col': 'A',
	'recordHeight': 3
},
{
    'size': { 'cols': 'G', 'rows': 69 },
    'type': 'Common',
    'wanted': {
      'A': 0,
      'B': 4,
      'C': 27,
      'D': 40,
      'E': 28,
      'F': 41,
      'G': 29
    },
    'first_header_row': 33,
    'first_data_row': 36,
    'first_data_col': 'A'
  }
];

const pilot_talents_config = [
  {
    'size': { 'cols': 'J', 'rows': 250 },
    'type': 27, // General Talent
    'maxStop': 1,
    'independent': true,
    'wanted': { 'I': 0, 'J': 8 },
    'first_header_row': 8,
    'first_data_row': 9,
    'first_data_col': 'I'
  },
  {
    'size': { 'cols': 'J', 'rows': 250 },
    'type': 40, // Class Talent
    'maxStop': 1,
    'independent': true,
    'wanted': { 'I': 0, 'J': 8 },
    'first_header_row': 12,
    'first_data_row': 13,
    'first_data_col': 'I'
  },
  {
    'size': { 'cols': 'J', 'rows': 250 },
    'type': 28, // Personality Talent
    'maxStop': 1,
    'independent': true,
    'wanted': { 'I': 0, 'J': 8 },
    'first_header_row': 25,
    'first_data_row': 26,
    'first_data_col': 'I'
  },
  {
    'size': { 'cols': 'L', 'rows': 250 },
    'type': 41, // Dominion Talent
    'maxStop': 1,
    'independent': true,
    'wanted': { 'K': 0, 'L': 8 },
    'first_header_row': 8,
    'first_data_row': 9,
    'first_data_col': 'K'
  },
  {
    'size': { 'cols': 'L', 'rows': 250 },
    'type': 29, // Ace Talent
    'maxStop': 1,
    'independent': true,
    'wanted': { 'K': 0, 'L': 8 },
    'first_header_row': 21,
    'first_data_row': 22,
    'first_data_col': 'K'
  }
];

var pilotTalentTiers = [
  column_names[27],
  column_names[40],
  column_names[28],
  column_names[41],
  column_names[29]
];
