# Self-hosting the fonts (optional)

By default Amphora loads its three fonts from Google Fonts. To serve them from your own server instead
(no requests to Google; recommended in the EU because of GDPR):

1. Download the WOFF2 files, Latin subset, for:
   - Cinzel 500, 700
   - Crimson Pro 400, 600, 700 and 400 italic
   - IBM Plex Mono 500, 600, 700
   Easiest: https://gwfh.mranftl.com (google-webfonts-helper): pick the font, the weights above and
   "Modern browsers", then download. Or install the @fontsource packages with npm and copy the latin .woff2 files.
2. Put the files in this fonts/ folder with the file names used in fonts.css (rename them if needed).
3. In index.html, delete the three Google Fonts lines and add:
   <link rel="stylesheet" href="fonts/fonts.css">
4. In your Content-Security-Policy you can then remove https://fonts.googleapis.com and https://fonts.gstatic.com.

If a font file is missing the game still works: it falls back to Georgia and your system's monospace font.
