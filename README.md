# JoltShot

A fast, in-browser screenshot annotation tool. Paste or upload an image, annotate it with arrows, boxes, text, emojis, and freehand drawings, then copy the result straight to your clipboard.

![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css)

## Features

### Image loading
- **Paste** – Use `Cmd+V` / `Ctrl+V` to paste an image from your clipboard
- **Upload** – Drop a file or use the upload button to load an image
- **Append to right** – Chain multiple screenshots into one wide strip, with optional sequence labels. Click a label on the canvas to replace the auto-number with custom text (e.g. "Step 1", "A"); the label auto-expands to a pill for longer text, and clearing the field reverts to the auto-number.
- Supports common image formats (PNG, JPEG, WebP, etc.)

### Annotation tools
| Tool   | Description |
|--------|-------------|
| **Pen**   | Freehand drawing with smooth strokes |
| **Arrow** | Directional arrows; click an arrow to adjust its angle with the pivot slider |
| **Box**   | Rectangles to highlight regions |
| **Emoji** | Place emojis from a searchable picker (size 16–64px) |
| **Text**  | Labels with adjustable font size (12–48px), multi-line (Shift+Enter) |
| **Move**  | Drag any annotation to reposition; drag handles to resize |

### Drawing options
- **Colors** – Red, yellow, green, black
- **Stroke width** – 2, 4, 8, or 12px
- **Undo** – `⌘Z` / `Ctrl+Z` or the Undo button
- **Clear** – Remove all annotations in one click

### Output
- **Copy to clipboard** – Copy the full annotated image as PNG for pasting into docs, chat, or design tools
- **Touch support** – Usable on tablets and touch devices

### UI
- **Dark / light mode** – Theme toggle with preference saved in `localStorage`
- **Help** – Click `?` in the bottom-right of the toolbar for a quick user guide covering all the common workflows
- **Keyboard shortcuts** – Undo and paste

## Setup

Install dependencies:

```bash
pnpm install
# npm install
# yarn install
# bun install
```

## Development

Run the dev server at `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build and preview:

```bash
pnpm build
pnpm preview
```

## Tech stack

- **Nuxt 4** – Vue framework
- **Vue 3** – Composition API
- **Tailwind CSS** – Styling
- **HTML5 Canvas** – Drawing and image manipulation
- **Clipboard API** – Copy annotated images

## Security

The app is a static SPA served by nginx with a baseline
`Content-Security-Policy` that allows only resources from the same origin
plus `data:` and `blob:` URLs (the latter are required for clipboard image
pastes). If you add a third-party asset (font CDN, analytics script, emoji
library) you must update the CSP in `nginx.conf` to allow its source — see
the comment block at the top of the policy for the affected directives.

## License

Private – see repository for details.
