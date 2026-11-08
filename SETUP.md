# Development setup

Requires Node.js 22 or newer and npm.

## Run the game

Open the existing project folder, then run:

```bash
npm ci
npm run dev
```

Use the local address printed by Vite.

## Validate changes

```bash
npm run check
npm run build
```

Read [the project guide](PROJECT_GUIDE.md) before changing game rules or layouts.
Keep engine rules separate from rendering and platform storage.

## Publish changes

Review the diff, commit the intended files, and push the branch to GitHub. The deployment
workflow validates changes before publishing `main` to GitHub Pages. Use normal pushes;
do not rewrite shared history as part of routine setup.

For failures, record the build stamp, steps to reproduce, expected behavior and actual
behavior. Include the relevant error text when available.
