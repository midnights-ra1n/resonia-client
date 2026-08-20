# Graph Report - resonia-client  (2026-08-20)

## Corpus Check
- 108 files · ~173,661 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 628 nodes · 996 edges · 128 communities (29 shown, 99 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Playlist & Sidebar UI
- Audio Cache Manager
- Home Feed & Subsonic Client
- Player Bar Layout
- Instant Gapless Audio Engine
- Client Runtime Dependencies
- Client Dev Dependencies
- Audio Quality & Platform Storage
- App TS Config
- Node TS Config
- Priority Download Queue
- i18n Context & Translation
- Root Workspace Package Config
- App Routing & Feature Pages
- Cover Art Cache
- Turborepo Build Pipeline
- API Client Package & Checksums
- Most Played Albums Widget
- Navidrome Native API Client
- Client README & Vite Plugins
- Core Package Config
- UI Package Config
- Home Song Row
- TS Project References
- Community 26
- Community 27
- Community 28
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 124
- Community 125
- Community 126
- Community 127

## God Nodes (most connected - your core abstractions)
1. `usePlayerStore` - 31 edges
2. `useServersStore` - 30 edges
3. `getClientForServer()` - 27 edges
4. `CacheManager` - 21 edges
5. `InstantGaplessEngine` - 21 edges
6. `useTranslation()` - 21 edges
7. `SubsonicClient` - 20 edges
8. `compilerOptions` - 18 edges
9. `AlbumPage()` - 16 edges
10. `compilerOptions` - 15 edges

## Surprising Connections (you probably didn't know these)
- `AlbumCarouselProps` --references--> `AlbumSummary`  [EXTRACTED]
  apps/client/src/features/album/AlbumCarousel.tsx → packages/api-client/src/subsonic/types.ts
- `AlbumCardProps` --references--> `AlbumSummary`  [EXTRACTED]
  apps/client/src/features/home/AlbumCard.tsx → packages/api-client/src/subsonic/types.ts
- `MostPlayedAlbums()` --calls--> `useTranslation()`  [EXTRACTED]
  apps/client/src/components/home/MostPlayedAlbums.tsx → apps/client/src/lib/i18n/useTranslation.ts
- `AlbumCard()` --calls--> `useTranslation()`  [EXTRACTED]
  apps/client/src/components/home/MostPlayedAlbums.tsx → apps/client/src/lib/i18n/useTranslation.ts
- `AppLayout()` --calls--> `useTranslation()`  [EXTRACTED]
  apps/client/src/app/layout/AppLayout.tsx → apps/client/src/lib/i18n/useTranslation.ts

## Import Cycles
- None detected.

## Communities (128 total, 99 thin omitted)

### Community 0 - "Playlist & Sidebar UI"
Cohesion: 0.08
Nodes (49): CreatePlaylistModal(), handleSubmit(), CreatePlaylistModalProps, PlaylistSidebarItem(), PlaylistSidebarItemProps, navLinks, Sidebar(), SessionGate() (+41 more)

### Community 1 - "Audio Cache Manager"
Cohesion: 0.08
Nodes (24): CacheManager, fetchRange(), RangeChunk, RangeNotSatisfiableError, ChunkEvent, ChunkListener, DownloadTask, createOpfsWriter() (+16 more)

### Community 2 - "Home Feed & Subsonic Client"
Cohesion: 0.09
Nodes (19): AlbumCarouselProps, AlbumCardProps, generateSalt(), generateToken(), SubsonicApiError, SubsonicClient, SubsonicClientConfig, buildStreamUrl() (+11 more)

### Community 3 - "Player Bar Layout"
Cohesion: 0.11
Nodes (30): AppLayout(), PlayerBar(), formatTime(), PlayerSectionCenter(), PlayerSectionLeft(), PlayerSectionRight(), DropPosition, formatDuration() (+22 more)

### Community 4 - "Instant Gapless Audio Engine"
Cohesion: 0.10
Nodes (13): EngineState, getInstantGaplessEngine(), InstantGaplessEngine, NO_TRIM, PendingSchedule, detectEdgeSilence(), SilenceTrim, Docker deployment (ghcr.io/midnights-ra1n/resonia-client) (+5 more)

### Community 5 - "Client Runtime Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, @chakra-ui/react, lucide-react, react, react-dom, react-router-dom, @resonia/api-client, tailwindcss (+22 more)

### Community 6 - "Client Dev Dependencies"
Cohesion: 0.07
Nodes (27): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, @tauri-apps/cli, @types/node (+19 more)

### Community 7 - "Audio Quality & Platform Storage"
Cohesion: 0.16
Nodes (13): AUDIO_QUALITIES, AudioQuality, DEFAULT_QUALITY_ID, getAvailableQualities(), getQualityById(), getPlatform(), isTauri(), Platform (+5 more)

### Community 8 - "App TS Config"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 9 - "Node TS Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 10 - "Priority Download Queue"
Cohesion: 0.17
Nodes (6): PREFETCH_PERCENTAGES, PriorityDownloadQueue, QueueSlot, UpcomingTrack, debugLog(), isEnabled()

### Community 11 - "i18n Context & Translation"
Cohesion: 0.25
Nodes (12): detectBrowserLocale(), I18nContext, I18nContextValue, I18nProvider(), getByPath(), interpolate(), resolveTranslation(), translations (+4 more)

### Community 12 - "Root Workspace Package Config"
Cohesion: 0.11
Nodes (17): description, devDependencies, eslint, prettier, turbo, typescript, eslint, turbo (+9 more)

### Community 13 - "App Routing & Feature Pages"
Cohesion: 0.21
Nodes (7): src/main.tsx (app entry point), App(), router, DownloadsPage(), SearchPage(), SettingsPage(), StatsPage()

### Community 14 - "Cover Art Cache"
Cohesion: 0.36
Nodes (11): ResolvedCover, useCoverArt(), CacheEntryMeta, cacheKeyFor(), enforceLimit(), getCachedCoverUrl(), loadAndCacheCover(), readMeta() (+3 more)

### Community 15 - "Turborepo Build Pipeline"
Cohesion: 0.15
Nodes (12): ^build, dist/**, dependsOn, outputs, cache, persistent, outputs, $schema (+4 more)

### Community 16 - "API Client Package & Checksums"
Cohesion: 0.17
Nodes (11): dependencies, spark-md5, devDependencies, @types/spark-md5, main, name, private, type (+3 more)

### Community 17 - "Most Played Albums Widget"
Cohesion: 0.27
Nodes (5): AlbumCard(), AlbumCardProps, MostPlayedAlbums(), MostPlayedAlbumsProps, Album

### Community 18 - "Navidrome Native API Client"
Cohesion: 0.25
Nodes (4): NavidromeAuthResult, NavidromeNativeClient, NavidromeSong, NavidromeSongTags

### Community 19 - "Client README & Vite Plugins"
Cohesion: 0.33
Nodes (6): eslint-plugin-react-dom, eslint-plugin-react-x, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC), React Compiler (not enabled, dev/build perf impact), Vite + React + TypeScript template

### Community 20 - "Core Package Config"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 21 - "UI Package Config"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

## Knowledge Gaps
- **240 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+235 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **99 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SubsonicClient` connect `Home Feed & Subsonic Client` to `Playlist & Sidebar UI`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `CacheManager` connect `Audio Cache Manager` to `Priority Download Queue`, `Player Bar Layout`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _240 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Playlist & Sidebar UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07789473684210527 - nodes in this community are weakly interconnected._
- **Should `Audio Cache Manager` be split into smaller, more focused modules?**
  _Cohesion score 0.07922077922077922 - nodes in this community are weakly interconnected._
- **Should `Home Feed & Subsonic Client` be split into smaller, more focused modules?**
  _Cohesion score 0.08536585365853659 - nodes in this community are weakly interconnected._
- **Should `Player Bar Layout` be split into smaller, more focused modules?**
  _Cohesion score 0.11025641025641025 - nodes in this community are weakly interconnected._