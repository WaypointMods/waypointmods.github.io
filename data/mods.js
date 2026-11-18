// EXAMPLE DATA. The build workflow will generate this file from mods/*.json
// plus each repo's GitHub Releases. Repos and download links below are fictional.
window.MODS = [
  {
    id: 'wayfarers-lanterns',
    name: "Wayfarer's Lanterns",
    author: 'brightwick',
    repo: 'brightwick/wayfarers-lanterns',
    summary: 'Hand-placed lanterns along the main roads so night travel is moody but not pitch black.',
    description: "Skyrim's roads go completely dark at night. This mod adds around 340 hand-placed lanterns along the main roads between holds, sized and spaced the way a real road would be.\n\n## Features\n- Lanterns on every main road between the nine holds\n- Light radius tuned to work with most weather and ENB setups\n- No lanterns in the wilderness, so caves and forests stay dark\n- Lanterns flicker and sway in strong wind\n\n## Compatibility\nWorks with most city and road overhauls. Patches for popular lighting mods are in the **Lighting Patch Collection**.\n\nPlace it after any mod that edits road navmesh.",
    games: ['se', 'vr'],
    category: 'Immersion',
    tags: ['lanterns', 'roads', 'lighting', 'night'],
    requirements: [],
    license: 'MIT',
    created: '2025-03-14',
    stars: 1840,
    hue: 38,
    releases: [
      { version: '1.3.0', date: '2026-11-09', notes: '- Added lanterns to the Riften to Ivarstead road\n- Lanterns now sway in strong wind\n- Fixed a floating lantern near Rorikstead',
        assets: [{ name: 'Wayfarers_Lanterns_1.3.0.7z', size: 18432000, downloads: 4210, sha256: '3f9a1c7e52b04d88e1a6c3f09d27b5a40c8e6f13a74d29be51f0c6d28b3e7a90', url: 'https://github.com/brightwick/wayfarers-lanterns/releases/download/v1.3.0/Wayfarers_Lanterns_1.3.0.7z' }] },
      { version: '1.2.1', date: '2026-08-22', notes: '- Fixed lanterns clipping into the Whiterun stables fence',
        assets: [{ name: 'Wayfarers_Lanterns_1.2.1.7z', size: 17920000, downloads: 9820, sha256: 'a01be7c4d93f2e6b58c0a7d1f4e3b29c6d8a5f017e2c4b93d6a0f58e1c7b3d42', url: 'https://github.com/brightwick/wayfarers-lanterns/releases/download/v1.2.1/Wayfarers_Lanterns_1.2.1.7z' }] },
      { version: '1.2.0', date: '2026-06-02', notes: '- Reworked light radius for ENB users\n- Added the Dawnstar road',
        assets: [{ name: 'Wayfarers_Lanterns_1.2.0.7z', size: 17800000, downloads: 12890, sha256: 'c47e0a9b13d5f68e2a4c7b90d1e6f3a58b2c4d07e9f1a36b5c8d02e4f7a9b1c6', url: 'https://github.com/brightwick/wayfarers-lanterns/releases/download/v1.2.0/Wayfarers_Lanterns_1.2.0.7z' }] }
    ]
  },
  {
    id: 'quiet-blades',
    name: 'Quiet Blades',
    author: 'ashvale',
    repo: 'ashvale/quiet-blades',
    summary: 'Drawing and sheathing weapons while sneaking is near silent, and NPCs react to the sound when you are not.',
    description: "Drawing a sword mid-sneak used to sound like a dropped cutlery drawer. Now it doesn't.\n\n## What changes\n- Weapon draw and sheathe sounds drop to a whisper while sneaking\n- Outside sneak, the sound can alert nearby NPCs\n- One-handed, two-handed and bows each have their own volume\n\nNo scripts, so it is safe to add or remove mid-playthrough.",
    games: ['se', 'le'],
    category: 'Combat',
    tags: ['stealth', 'sounds', 'weapons'],
    requirements: [],
    license: 'GPL-3.0',
    created: '2026-09-11',
    stars: 960,
    hue: 210,
    releases: [
      { version: '1.0.4', date: '2026-10-30', notes: '- Bows no longer play the sword sheathe sound\n- Small volume tweaks',
        assets: [{ name: 'Quiet_Blades_1.0.4.zip', size: 2310000, downloads: 3120, sha256: '9be41d07c2a6f83e15d9b0a74c3e8f26a5d1b94e07c3f8a62d5e9b14c70a3f8d', url: 'https://github.com/ashvale/quiet-blades/releases/download/v1.0.4/Quiet_Blades_1.0.4.zip' }] },
      { version: '1.0.0', date: '2026-09-11', notes: '- First release',
        assets: [{ name: 'Quiet_Blades_1.0.0.zip', size: 2280000, downloads: 5470, sha256: '0d6f2a9c84b1e7d35a0c9f62e8b4d17a3c5e09f2b6d8a41e7c3f05b92d6a8e14', url: 'https://github.com/ashvale/quiet-blades/releases/download/v1.0.0/Quiet_Blades_1.0.0.zip' }] }
    ]
  },
  {
    id: 'tavern-chatter',
    name: 'Tavern Chatter',
    author: 'emberquill',
    repo: 'emberquill/tavern-chatter',
    summary: 'Background crowd voices, laughter and clinking mugs for every inn, scaled to how many people are inside.',
    description: "Inns now sound busy when they are busy and quiet when they are empty.\n\n## Features\n- Over 400 new ambient sound clips\n- Volume scales with the number of NPCs in the room\n- Separate sound sets for Nord, Imperial and Dunmer inns\n- Optional quieter version for people who use voice-heavy mods\n\nThe **Quiet** file is optional. Install it after the main file and let it overwrite.",
    games: ['se', 'vr'],
    category: 'Audio',
    tags: ['ambience', 'inns', 'sounds'],
    requirements: [],
    license: 'CC BY 4.0',
    created: '2025-11-20',
    stars: 2310,
    hue: 15,
    releases: [
      { version: '2.1.0', date: '2026-11-14', notes: '- New Dunmer inn sound set for Windhelm and Raven Rock\n- Crowd volume now updates when NPCs leave',
        assets: [
          { name: 'Tavern_Chatter_2.1.0.7z', size: 224395264, downloads: 6840, sha256: 'e83c1f5a20d7b49c6e1a8f03d5b72c94a6e0d18f3b5c7a29e4d1f60b8c3a5e72', url: 'https://github.com/emberquill/tavern-chatter/releases/download/v2.1.0/Tavern_Chatter_2.1.0.7z' },
          { name: 'Tavern_Chatter_Quiet_Option.7z', size: 1048576, downloads: 1930, sha256: '5a2d8e0f71c4b36a9d2e5f08c1b74a3e6d9f20c5b8a1e47d3c6f09a2e5b8d14c', url: 'https://github.com/emberquill/tavern-chatter/releases/download/v2.1.0/Tavern_Chatter_Quiet_Option.7z' }
        ] },
      { version: '2.0.0', date: '2026-04-03', notes: '- Rebuilt the whole sound set\n- Added NPC count scaling',
        assets: [{ name: 'Tavern_Chatter_2.0.0.7z', size: 198180864, downloads: 15420, sha256: 'b16f4c9e3a07d52e8b1c6f94a0d3e75b2c8f61a4d9e03b7c5a2f86d1e4b09c73', url: 'https://github.com/emberquill/tavern-chatter/releases/download/v2.0.0/Tavern_Chatter_2.0.0.7z' }] }
    ]
  },
  {
    id: 'clear-map-markers',
    name: 'Clear Map Markers',
    author: 'northlight',
    repo: 'northlight/clear-map-markers',
    summary: 'Sharper, colour-coded map icons so you can tell a cave from a camp at a glance.',
    description: "Replaces the world map and compass icons with cleaner versions.\n\n## Features\n- Colour-coded by location type: towns, dungeons, camps, landmarks\n- Cleared locations are dimmed\n- Matching compass icons\n\nWorks with SkyUI and most map mods.",
    games: ['se', 'vr', 'le'],
    category: 'UI',
    tags: ['map', 'icons', 'compass'],
    requirements: [{ name: 'SKSE', url: 'https://skse.silverlock.org/' }],
    license: 'MIT',
    created: '2026-02-08',
    stars: 640,
    hue: 190,
    releases: [
      { version: '0.9.2', date: '2026-07-19', notes: '- Fixed missing icon for Dwemer ruins\n- Dimmed icons are easier to read on snowy map areas',
        assets: [{ name: 'Clear_Map_Markers_0.9.2.7z', size: 6291456, downloads: 4105, sha256: '7c0e3b9a5d1f86e24c7a0b3d9f5e18c62a4d7b0e3f9c51a86d2e4b7c0f3a9d15', url: 'https://github.com/northlight/clear-map-markers/releases/download/v0.9.2/Clear_Map_Markers_0.9.2.7z' }] }
    ]
  },
  {
    id: 'steadfast-followers',
    name: 'Steadfast Followers',
    author: 'ashvale',
    repo: 'ashvale/steadfast-followers',
    summary: 'Followers stop running into traps, wait properly when told to, and keep up when you fast travel.',
    description: "A set of small fixes for follower behaviour that add up to a lot less frustration.\n\n## Fixes\n- Followers avoid pressure plates and tripwires they can see\n- **Wait here** actually means wait, even after combat\n- Followers left behind catch up after fast travel\n- No more followers stuck in doorways after loading\n\nCompatible with most follower frameworks. Does not change follower stats.",
    games: ['se', 'vr'],
    category: 'Followers',
    tags: ['followers', 'ai', 'fixes'],
    requirements: [{ name: 'SKSE', url: 'https://skse.silverlock.org/' }],
    license: 'GPL-3.0',
    created: '2025-06-30',
    stars: 3120,
    hue: 280,
    releases: [
      { version: '1.5.0', date: '2026-11-01', notes: '- Followers now catch up after boat and carriage travel\n- Fixed a rare stuck-in-doorway case in Solitude',
        assets: [{ name: 'Steadfast_Followers_1.5.0.7z', size: 942080, downloads: 7215, sha256: 'd29a7e4c0b8f15d63a9e2c7b0f4d81e65c3a9f0e2d7b14c8a5f39e0d6b2c7a41', url: 'https://github.com/ashvale/steadfast-followers/releases/download/v1.5.0/Steadfast_Followers_1.5.0.7z' }] },
      { version: '1.4.2', date: '2026-09-03', notes: '- Fixed followers ignoring Wait after dialogue',
        assets: [{ name: 'Steadfast_Followers_1.4.2.7z', size: 921600, downloads: 18930, sha256: '4e8b1d6a3f09c25e7b4a1d80c6f3e29b5a7d0c14e8f62b3a9d5c07e1f4b8a26d', url: 'https://github.com/ashvale/steadfast-followers/releases/download/v1.4.2/Steadfast_Followers_1.4.2.7z' }] }
    ]
  },
  {
    id: 'snowberry-flora',
    name: 'Snowberry Flora',
    author: 'mossgarden',
    repo: 'mossgarden/snowberry-flora',
    summary: 'High-resolution textures for every bush, berry and herb in the Pale and Winterhold.',
    description: "New textures and meshes for northern flora: snowberries, frost mirriam, tundra cotton, juniper and more.\n\n## Files\n- **2K**: the full-quality version\n- **1K**: for lower-end PCs and VR\n\nPick one. Do not install both.",
    games: ['se', 'vr'],
    category: 'Visuals',
    tags: ['textures', 'flora', 'snow'],
    requirements: [],
    license: 'CC BY-NC 4.0',
    created: '2024-10-12',
    stars: 5200,
    hue: 140,
    releases: [
      { version: '3.0.0', date: '2026-10-05', notes: '- Remade every texture from scratch\n- New 1K file for VR players',
        assets: [
          { name: 'Snowberry_Flora_2K_3.0.0.7z', size: 1288490188, downloads: 11380, sha256: 'f61c4a8e2d0b97e35c1f8a4d6b20e93c7a5d1f08b4e62c9a3d7f0e15b8c4a69e', url: 'https://github.com/mossgarden/snowberry-flora/releases/download/v3.0.0/Snowberry_Flora_2K_3.0.0.7z' },
          { name: 'Snowberry_Flora_1K_3.0.0.7z', size: 503316480, downloads: 6720, sha256: '28d5b0f7c3e1a96d4b8f2c05e7a3d19b6c0f4e82a5d7b13c9e6f0a42d8b5c71e', url: 'https://github.com/mossgarden/snowberry-flora/releases/download/v3.0.0/Snowberry_Flora_1K_3.0.0.7z' }
        ] }
    ]
  },
  {
    id: 'lighting-patch-collection',
    name: 'Lighting Patch Collection',
    author: 'northlight',
    repo: 'northlight/lighting-patch-collection',
    summary: 'Compatibility patches between popular lighting, weather and road mods, updated as they update.',
    description: "One place for the small patches lighting mods always need.\n\nEach patch is a separate plugin inside the archive. Only enable the ones for mods you actually use. The list of included patches is in the archive's readme.\n\nMissing a patch? Open an issue on the repo.",
    games: ['se'],
    category: 'Patches',
    tags: ['patches', 'lighting', 'compatibility'],
    requirements: [],
    license: 'MIT',
    created: '2024-12-01',
    stars: 410,
    hue: 55,
    releases: [
      { version: '1.12.0', date: '2026-11-16', notes: "- New patch for Wayfarer's Lanterns 1.3.0",
        assets: [{ name: 'Lighting_Patch_Collection_1.12.0.7z', size: 524288, downloads: 860, sha256: '6b3f9d2a0e7c48b15d3a9f6e0c2b74d81a5e3f09c7d2b6a48e1f05c3d9b7a20e', url: 'https://github.com/northlight/lighting-patch-collection/releases/download/v1.12.0/Lighting_Patch_Collection_1.12.0.7z' }] },
      { version: '1.11.0', date: '2026-09-28', notes: '- Two new weather mod patches',
        assets: [{ name: 'Lighting_Patch_Collection_1.11.0.7z', size: 503808, downloads: 2140, sha256: 'a9e2c5f80d3b17e46a2c9d5f0b8e31a74c6d2e09f5b3a8c17d4e6f20b9a5c83d', url: 'https://github.com/northlight/lighting-patch-collection/releases/download/v1.11.0/Lighting_Patch_Collection_1.11.0.7z' }] }
    ]
  },
  {
    id: 'hearth-ledger',
    name: 'Hearth Ledger',
    author: 'emberquill',
    repo: 'emberquill/hearth-ledger',
    summary: 'Writes your skill gains, purchases and big moments into an in-game journal you can read at any time.',
    description: "A small journal item that fills itself in as you play.\n\n## Records\n- Skill level-ups and the day they happened\n- Large purchases and sales\n- Quest completions and the people involved\n\nThe journal is added to your inventory the first time you sleep in a bed.",
    games: ['se', 'vr', 'le'],
    category: 'Utilities',
    tags: ['journal', 'tracking', 'books'],
    requirements: [{ name: 'SKSE', url: 'https://skse.silverlock.org/' }],
    license: 'GPL-3.0',
    created: '2026-04-02',
    stars: 220,
    hue: 330,
    releases: [
      { version: '0.4.0', date: '2026-05-12', notes: '- Added quest completions\n- Journal pages now sorted by in-game date',
        assets: [{ name: 'Hearth_Ledger_0.4.0.zip', size: 389120, downloads: 1170, sha256: 'c0d7a4e19b5f82c36e0a7d4b1f9c25e83a6d0b7f2e4c19a5d8b3f60e7a2c4d95', url: 'https://github.com/emberquill/hearth-ledger/releases/download/v0.4.0/Hearth_Ledger_0.4.0.zip' }] }
    ]
  }
];
