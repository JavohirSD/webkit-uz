# DevTools: JSON Formatter & UUID Generator - Technical Specification

This document serves as a comprehensive guide for AI agents to understand, maintain, and extend the `curly.dev` DevTools web application.

## 1. Architectural Overview
- **Type**: Single-page application (SPA).
- **Framework**: Pure HTML5, CSS3, and Vanilla JavaScript (ES6+).
- **External Dependencies**: 
  - `qrcode.min.js`: For QR code generation.
  - Google Fonts: 'JetBrains Mono' and 'Inter'.
- **State Management**: LocalStorage for theme persistence and font size settings.

## 2. Core Global Features
- **Themes**: Supports `[data-theme="dark"]` (default) and `light`. Managed via CSS variables and `applyTheme()` JS function.
- **Modals**: All secondary tools (Base64, QR, etc.) reside in `.modal-overlay` containers.
- **Responsive Design**: Mobile-first flexbox layout. Wide views utilize a custom `col-resizer` for the JSON editor.

## 3. Tool Specifications

### A. UUID Generator (Priority Feature)
- **Versions**: v1, v4, v5, v6, v7.
- **Logic**: Uses `BigInt` for high-precision time-based UUIDs (v1, v6, v7). Includes fallback functions for older browsers.
- **UI**: Color-coded segments for time, version, and randomness.

### B. JSON Formatter & Validator
- **Functionality**: Real-time formatting, minification, and syntax highlighting.
- **Visuals**: Collapsible nodes with element counts.
- **Performance**: Decodes Unicode automatically. Real-time error detection with line/column positioning.

### C. Base64 Encoder/Decoder
- **Modes**: Text-to-Base64 and File-to-Base64 (Data URI extraction).
- **Encoding**: Uses `TextEncoder` for UTF-8 safety.

### D. Unit Converters
- **Categories**: Data Storage, Time (Unix/ISO), Number Bases (2-36), Temperature, Length, Weight.
- **Logic**: Linear group conversion (updates all fields in a group simultaneously).

### E. Other Tools
- **Text Analyzer**: Real-time stats (chars, words, sentences, bytes).
- **QR Generator**: Supports custom colors, logo overlays, and multiple error correction levels.
- **System Info**: Fetches detailed browser/OS stats and IP location via multiple fallback APIs.

## 4. Development Instructions for AI Agents
When extending this codebase, follow these rules:
1. **No Flex/Grid in Document Export**: If creating a PDF export feature, avoid flex/grid (not supported by WeasyPrint).
2. **Vanilla Only**: Do not introduce React, Vue, or jQuery. Use `$(id)` helper for DOM access.
3. **CSS Variables**: Always use existing color tokens (e.g., `--accent`, `--panel`) to maintain theme compatibility.
4. **Tool Pattern**: To add a new tool:
   - Create a button in `.top-controls`.
   - Create a `.modal-overlay` with a unique ID.
   - Add a logic section in the IIFE at the end of the script.
5. **Token Efficiency**: Use existing utility functions like `copyText`, `flashBtn`, `pad`, and `esc`.

## 5. File Structure Reference
- **CSS**: Reset -> Tokens -> Base -> Layout -> Tool-specific styles -> Media Queries.
- **JS**: Utilities -> Theme -> Modal Logic -> Tool Logic (UUID, JSON, etc.) -> Event Listeners.
