# Publishing (GitHub Pages)

You can publish the site using either a GitHub Action or the `mkdocs gh-deploy` command.

## Option A: GitHub Actions (recommended)

1. Add the workflow in `.github/workflows/docs.yml` (see below).
2. In your repository settings, enable GitHub Pages and select "GitHub Actions" as the source.
3. Push to `main` to publish.

## Option B: Manual deploy

1. Install the docs dependencies.
2. Run `mkdocs gh-deploy --force`.

This creates a `gh-pages` branch and publishes the site.

## Example workflow

```yaml
name: Docs

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - name: Install docs deps
        run: pip install -r requirements-docs.txt
      - name: Build
        run: mkdocs build
      - name: Configure Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```
