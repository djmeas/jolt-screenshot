# JoltShot

A fast, in-browser screenshot annotation tool. Paste or upload an image, annotate it with arrows, boxes, text, emojis, and freehand drawings, then copy the result straight to your clipboard.

![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js)
![Vue](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-38B2AC?logo=tailwind-css)

## Features

### Image loading
- **Paste** – Use `Cmd+V` / `Ctrl+V` to paste an image from your clipboard
- **Upload** – Drop a file or use the upload button to load an image
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

## License

Private – see repository for details.
