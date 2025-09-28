# GitHub Pages deployment for talk-with-eyes

This is a basic guide for the GitHub Pages deployment set up in this repository.

## How It Works

1. The project is built using Vite with base path configured for GitHub Pages (`/talk-with-eyes/`).
2. When code is pushed to the `master` or `main` branch, GitHub Actions automatically:
   - Builds the project
   - Deploys it to GitHub Pages

## Local Development

Run the development server:

```bash
npm run dev
```

## Manual Deployment (if needed)

You shouldn't need this since CI/CD is set up, but you can manually deploy:

```bash
# Build the project
npm run build

# Test the build locally
npm run preview
```

## Note

Make sure GitHub Pages is enabled in your repository settings, with the source set to "GitHub Actions".