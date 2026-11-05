# InkConnect

InkConnect is a static, multi-page website for connecting clients with
freelance writers. It works as a local demo using browser storage and can
optionally connect to a Google Apps Script backend.

## Run the demo

Open `index.html` in a browser. No package installation or build step is
required. The demo stores its data in the browser's `localStorage`.

For best results, you can also serve this folder with any static file server.
The entry page is `index.html`.

## Project structure

```text
inkconnect/
|-- assets/
|   |-- css/          Shared styles
|   `-- js/           Page scripts and API layer
|-- backend/
|   |-- Code.gs       Google Apps Script backend
|   `-- SETUP.md      Backend setup and deployment instructions
|-- index.html        Home page / site entry point
|-- login.html
|-- register.html
`-- ...               Other site pages
```

## Optional Google Apps Script backend

The site uses its local demo database by default. To connect a Google Sheet
and Apps Script, follow [backend/SETUP.md](backend/SETUP.md). Review the
backend's authentication and permissions before using it with real user or
payment data; do not publish sensitive credentials in this repository.

## Upload to GitHub

1. Create a new repository on GitHub.
2. Upload the **contents of this folder** (including `index.html`, `assets/`,
   and `backend/`) to the repository's top level.
3. In the repository settings, enable GitHub Pages and select the branch and
   root folder where `index.html` is located.

The site is static, so GitHub Pages can serve the frontend. The optional
Google Apps Script backend must be configured separately.
