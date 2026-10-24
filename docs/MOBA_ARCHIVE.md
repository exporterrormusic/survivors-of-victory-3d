# Preserved MOBA baseline — 2026-10-24

The MOBA implementation is retained before a possible Survivors transition. No genre
conversion is part of this checkpoint. Survivors of Victory is an existing, nearly
finished game: inspect and reuse its suitable systems before rebuilding equivalents.
The separate `_REF` project remains untouched.

## Permanent restoration points

- Repository: https://github.com/exporterrormusic/survivors-of-victory-3d
- Frozen branch: `archive/moba-2026-10-24`
- Annotated tag: `moba-baseline-2026-10-24`
- Release: https://github.com/exporterrormusic/survivors-of-victory-3d/releases/tag/moba-baseline-2026-10-24
- Local full snapshot: `archives/moba-baseline-2026-10-24/`

Continue future development on `main`. Do not move the baseline tag, rewrite the
archive branch, or replace its release files. Make a new dated checkpoint when needed.
Restore into a separate folder; do not extract an archive over ongoing work.

## What is preserved

The Git baseline includes source, menus, combat and character systems, both MOBA maps,
navigation, structures, HUD, lighting, environment art sources, ready-to-use runtime
models/textures/audio, asset tools, design notes and the dependency lockfile.
Runtime assets in `public/chibi` and `public/raptures` are intentionally versioned.

The release adds two complete ZIPs:

| File | Contents | SHA-256 |
| --- | --- | --- |
| `moba-source-and-assets.zip` | 2,841 files: source, public assets, art sources, raw downloads, tools, docs, screenshots/mockups/evidence and the existing dist folder captured at snapshot time | `ddc2c701dfa1026d2596a04bab7067d846e1fd50b85bb90f1ac7d95374146a50` |
| `moba-playable-build.zip` | 1,113 files: a fresh production build and all public runtime assets | `2dbbc3c43c6f0182c377fe56d770f5f53e415d48f8bd82e4a8900841c239b75d` |

Each ZIP has a SHA-256 sidecar and a manifest of every file's size and hash.
The full archive includes raw and generated assets that were originally gitignored.
Generated evidence and raw downloads are release attachments rather than ordinary Git files.

`node_modules`, the separate `_REF` game, machine-local assistant settings, the root
debug log and browser localStorage are not included. Browser saves/settings belong to
the browser profile and origin, not this repository. The compiled build does not need
Node packages or another asset download to run.

## Restore the editable MOBA

Clone the frozen branch into a new directory:

```powershell
git clone --branch archive/moba-2026-10-24 https://github.com/exporterrormusic/survivors-of-victory-3d.git moba-restored
Set-Location moba-restored
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

Alternatively, extract `moba-source-and-assets.zip` into a new empty directory and run
the same npm commands there. Use `npm ci` to honor `package-lock.json`. Package registry
access is needed to reinstall dependencies. Do not run the asset download scripts just
to restore: converted models and images are already present.

Validated environment: Node 22.15.0, npm 10.9.2, TypeScript 7.0.2, Vite 8.3.5,
Babylon 9.32.0 and Phaser 4.2.1. Python 3.11.9 was used for ZIP verification.
Asset regeneration tools can still depend on their original online sources.
`tools/capture-paintover.mjs` has an existing machine-specific Playwright import;
adjust that development-tool path if reproducing captures elsewhere.

## Run the archived build without reinstalling packages

Extract `moba-playable-build.zip` into an empty folder, open PowerShell there, then:

```powershell
python -m http.server 5184 --bind 127.0.0.1
```

Open `http://127.0.0.1:5184/` for menus, or:

- `http://127.0.0.1:5184/?hero=snow-white&map=three-lane`
- `http://127.0.0.1:5184/?hero=snow-white&map=single-lane`

Use an HTTP server; opening index.html as a file is insufficient. Stop the server with Ctrl+C.

## Verification and scope

Typechecking and a fresh production build passed. All 31 navigation regression
scenarios passed. Every ZIP entry was read back and checked against its captured size
and SHA-256; complete ZIP hashes were also verified. No new interactive browser smoke
test was performed for this archive. Build warnings and check logs are retained.

Parallel work updated generated dist/artifacts and performance documentation during
capture. The captured source, runtime assets, raw assets, tools and build configuration
were checked and remained unchanged. Use the separate playable ZIP as the authoritative
compiled snapshot; the source ZIP retains older generated output as captured. The Git
baseline also includes the later documentation and these restoration instructions.

This preserves the MOBA prototype as implemented, including its existing limitations;
it does not add multiplayer or complete unfinished MOBA features.
