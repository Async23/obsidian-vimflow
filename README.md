# Vimflow

Vimium-style keyboard navigation for Obsidian, with frame-driven continuous scrolling and letter hints for links and workspace controls.

Works in reading views, editor views, sidebars, and popout windows. Inputs, menus, and dialogs retain their normal keyboard behavior.

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Async23/obsidian-vimflow/releases/latest).
2. Put the three files in `<vault>/.obsidian/plugins/vimflow/`. If you use a custom configuration directory, replace `.obsidian` with that directory.
3. Reload Obsidian and enable **Vimflow** in **Settings → Community plugins**. Disable other global navigation plugins that handle the same keys.

## Usage

Press `Esc` to enter navigation mode. Hold `j/k/h/l` to scroll continuously; release the key to stop. Press `f` to show hints, then type a hint's letters to activate its target. Press `i` to edit and `?` for the shortcut reference.

The note picker reads local Markdown file paths to let you find notes. Vimflow works offline and does not collect telemetry or require an account or payment.

- [中文使用说明与完整快捷键](docs/guide.md)
- [Development and contributing](CONTRIBUTING.md)
- [Report an issue](https://github.com/Async23/obsidian-vimflow/issues)

An independent project, released under the [MIT license](LICENSE).
