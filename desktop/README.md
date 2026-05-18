# Sprout

Desktop chat shell with:

- Tauri + React + TypeScript + Vite
- Tailwind CSS
- shadcn/ui-ready shared components
- Biome (lint/format/check)
- Feature-driven frontend structure

## Scripts

- `pnpm dev` - run the web frontend
- `pnpm tauri dev` - run the desktop app
- `pnpm build` - typecheck and build frontend
- `pnpm typecheck` - TypeScript checks
- `pnpm lint` - Biome lint
- `pnpm format` - Biome format (write)
- `pnpm check` - Biome check

## Structure

- `src/shared` - reusable app-wide code (`ui`, `lib`, `styles`)
- `src/features` - feature modules (vertical slices)
- `src/app` - top-level app composition

## Light builds (no huddle / TTS / STT)

For wimpy machines, CI lanes, or anyone who doesn't need voice, the
`huddle` Cargo feature can be disabled at compile time. With it off, the
following native deps are dropped from the build entirely:

- `sherpa-onnx` (STT, Parakeet)
- `ort` (ONNX Runtime, Kokoro TTS — also skips its ~100 MB binary download)
- `opus`, `rodio`, `ndarray`, `rubato`, `earshot`, `audioadapter-buffers`
- `tauri-plugin-global-shortcut` (push-to-talk shortcut)

The first-run model download (~187 MB of Parakeet + Kokoro weights) is
also skipped.

From the repo root:

```bash
just desktop-light           # dev mode without huddle
just desktop-light-build     # packaged release without huddle
just desktop-light-check     # cargo check the light path
```

Under the hood these set `VITE_SPROUT_HUDDLE=0`, pass
`--no-default-features` to cargo, and layer the
`src-tauri/tauri.light.conf.json` capability override. The Rust huddle
module is replaced by `src-tauri/src/huddle_stub.rs` and the frontend
huddle module by `src/features/huddle/index.light.ts` — both expose the
same public API as the originals so the rest of the app compiles and
renders without any changes. Voice-only Tauri commands return
`voice/huddle is disabled in this build`; the huddle UI is hidden.
