// =============================================================================
// lib/genericPhoto.js  -  A GENERIC STOCK PHOTO FOR PLACES WITH NO REAL ONE YET
//
// WHAT THIS IS, AND WHAT IT ISN'T
// -----------------------------------
// Most of the 28 seed destinations have never had a real photo attached -
// they show a plain colour gradient instead (see Destinations.jsx before
// this file existed). A flat gradient for most of the catalogue looks
// unfinished; this gives every place SOME photo instead, using Lorem Picsum
// (https://picsum.photos) - a free, stable placeholder-image service with
// no API key and no per-photo guessing involved (unlike hard-coding a
// specific Unsplash photo id, which can silently 404 if that exact photo
// is ever removed - this deliberately never does that).
//
// THIS IS NOT, AND MUST NEVER BE PRESENTED AS, A REAL PHOTO OF THE PLACE.
// It's generic stock imagery used only as a nicer-looking placeholder than
// a plain gradient - the same honest role the gradient played before. The
// real photo pipeline (an uploaded photo through the app, or one dropped
// into src/assets/media/<id>/ - see lib/media.js) always takes priority
// over this, everywhere this is used.
//
// WHY SEEDED BY DESTINATION ID, NOT RANDOM
// -------------------------------------------
// picsum.photos/seed/<anything>/WxH always returns the SAME photo for the
// same seed - using the destination's own id means a place shows one
// consistent placeholder every time you see it (not a different random
// photo on every reload), and different places get different photos from
// each other without any manual curation.
// =============================================================================

export function genericPhotoFor(destinationId, width = 600, height = 400) {
  return `https://picsum.photos/seed/${encodeURIComponent(destinationId)}/${width}/${height}`;
}
