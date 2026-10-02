# ShowHunt logo assets

Selected direction: the original orange search / S / location-pin symbol and dark-blue ShowHunt wordmark, with no background. The user approved a clean SVG recreation and white lettering for use on the navy header and footer.

## Current files

Both apps have their own copies because Vercel deploys them separately:

- `public/brand/showhunt-logo.svg`: transparent master with dark-blue lettering.
- `public/brand/showhunt-logo-light.svg`: transparent white-lettering variant used in the header and storefront footer.
- Matching `.png` exports: 960 × 380 with alpha transparency.
- `public/brand/showhunt-symbol.svg`: original-style orange symbol alone.
- `public/brand/showhunt-app-icon.png`: 512 × 512 transparent app icon.
- `app/icon.svg`: scalable browser icon.
- `app/favicon.ico`: 16, 32 and 48 pixel PNG frames in an ICO container.
- `app/apple-icon.png`: 180 × 180 orange symbol on navy for saved home-screen shortcuts.

Next.js adds the icon links from its [file conventions](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons). These assets do not add offline or installable-PWA behavior.

## Artwork and production

The SVG artwork uses filled paths only: no embedded bitmap, external font, script, background rectangle, or network resource. The original symbol was recreated with smooth paths; the wordmark uses Arial Bold converted to outlines to retain its appearance across devices. This is a faithful recreation rather than an exact pixel copy of the supplied bitmap.

Symbol: `#FF6B1A`. Original-style wordmark: `#003047`. Header/footer wordmark: `#FFFFFF`. Existing page navy `#14213D`, teal, and orange CTA colors remain unchanged.

Mode: built-in image editing was tried first, but its transparent exports had rough edges. The user then explicitly approved native SVG recreation. Final SVG assets were authored as paths; PNG and ICO exports were rendered from those SVGs with the locally installed Sharp dependency. The rejected image-tool exports are not used in the apps.

## Image-tool prompts used before SVG approval

Use case: background-extraction. Edit target: ONLY the original ShowHunt logo in the most recent user attachment, with the orange search/location-S symbol and the entire dark navy/blue word ShowHunt. Remove the white background completely to real alpha transparency, including inside every opening in the symbol and lettering. Keep all original foreground colors, font, original exact word spelling "ShowHunt", letter shapes and proportions unchanged. Both Show and Hunt stay the SAME original dark navy/blue color. Symbol stays its original vivid orange/coral. Do not use any previously generated variants or yellow lettering. Clean the cutout edges with smooth antialiasing and no white fringe, glow, stray pixels or speckles. Tightly crop away the large empty white margins to form a compact wide horizontal logo with small equal transparent padding on each side. Do not distort the artwork. ONE transparent logo PNG, no background color, checkerboard, shadow, border, slogan or mockup.

Use case: logo-brand / background-extraction. Create a clean transparent production cutout of this exact ShowHunt logo. Preserve the original symbol silhouette (orange magnifier surrounding a curving S that ends in a pointed location pin, dot in the lower bowl) and the exact dark blue ShowHunt wordmark. Carefully rebuild clean flat opaque foreground shapes over an empty alpha canvas: orange/coral symbol and dark blue text. Remove ALL stray pixels, red flecks, color fringes and rough edge artifacts visible in the reference negative spaces. Every pixel outside the actual shapes and letters must be FULLY transparent. Both Show and Hunt dark blue, no yellow, no white lettering. Keep the same typography and proportions; do not thicken the letters or change the identity. Horizontal logo fitted into a 3:1 canvas with modest clearspace. Straight crisp smooth edges as in an exported professional vector logo, flat fills, no gradient, no texture, no outline, no shadows. ONE logo only, no labels, no additional content. True alpha transparency, never a checkerboard or opaque background.

Use case: precise-object-edit / logo-brand. Reference: ShowHunt logo with orange S/search/location-pin symbol and dark blue lettering. Make the approved dark-background version: change the ENTIRE "ShowHunt" wordmark to opaque PURE WHITE #FFFFFF, keeping the recognizable original orange/coral symbol, exact typography, proportions and layout. Produce a transparent PNG cutout with no background. Smooth professional clean contours with no scattered pixels, red flecks, halos, white fringe, shadows, outlines or texture. Letter interiors and symbol negative spaces must be fully transparent while letter strokes are completely opaque white. Orange symbol has flat vibrant orange fill matching the reference. Preserve the full exact spelling ShowHunt as one word, all letters white with no yellow. Wide 3:1 horizontal canvas with compact even transparent padding. One complete logo only. Intended to sit on #14213D navy header but DO NOT put a navy background into the image.

