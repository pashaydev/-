# 3D SvelteKit Project with Three.js

A SvelteKit project featuring 3D rendering capabilities using Three.js, with GLTF and Draco compression support.

## Features

- Three.js integration with SvelteKit
- GLTF model loading with Draco compression
- Animation support
- Responsive 3D canvas that adapts to window size

## Getting Started

1. Clone this repository
2. Install dependencies:

```bash
bun install
```

## Development

Start the development server:

```bash
bun run dev

# or open in browser automatically
bun run dev -- --open
```

## 3D Model Setup

### Using the Test Cube

By default, the application displays a simple animated green cube. This is controlled by the `useTestCube` flag in `src/routes/+page.svelte`.

### Using Your Own 3D Models

1. Place your GLTF/GLB models in the `static/models/` directory
2. Update the model path in `src/routes/+page.svelte`:

```typescript
// Set to false to use your own model
let useTestCube = false;

// Update this path to your model file
scene.loadModel('/models/your-model.glb')
```

### Draco Compression

This project uses Google's hosted Draco decoders. If you need to use local decoders, update the path in `src/lib/Scene.ts`:

```typescript
this.dracoLoader.setDecoderPath('/draco/');
```

## Building for Production

```bash
bun run build
```

Preview the production build with:

```bash
bun run preview
```

## Customizing the Scene

The scene configuration can be modified in `src/lib/Scene.ts`, including:
- Camera settings
- Lighting setup
- Renderer configuration
- Animation handling
