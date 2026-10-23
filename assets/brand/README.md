# Cashback Norge quokka

- `quokka-original.png`: the supplied **Cheerful Bear with Blueberry Badge (1).png**, preserved unchanged; Cashback Norge's mascot is a quokka.
- `quokka-transparent.png`: transparent cutout master, made with imagegen in **edit / background-extraction** mode. No solid background or checkerboard is part of the image.
- `quokka-pointing.png`: transparent pointing pose used for small UI mascot moments.
- `quokka-couple.png`: transparent two-quokka charity/affiliate illustration, composed from the approved mascot style.
- `avatar.png`: transparent 1024 px version with extra room for circular Instagram/TikTok crops.
- `facebook-cover.png`: 2051 × 767 px Facebook cover made with the built-in imagegen tool. The male and female quokkas hunt for blueberries at the sides; the quiet center leaves room for the overlapping profile avatar. No text is embedded.
- `facebook-cover-preview.png`: desktop/mobile placement mockup based on the supplied Facebook screenshots. The avatar is overlaid only for preview; upload `facebook-cover.png` as the cover.
- `facebook-cover.prompt.txt`: final imagegen prompt for the cover, using `quokka-transparent.png` and `quokka-couple.png` as character references.
- `prompt.txt`: the final imagegen edit prompt used for the cutout.

Run `python3 scripts/build-brand-assets.py` from the repository root to regenerate the website logo, PNG/ICO favicons, Apple touch icon, Chrome toolbar/store icons, and embedded extension/userscript imagery. Pillow is used only to resize approved transparent assets, preserve their alpha channels, add transparent padding, and encode the icon formats; it does not remove or redraw backgrounds.

The website uses `site/logo.png` at 512 px, separate from its small favicon. Chrome receives 16, 32, 48 and 128 px icons. The shared embedded image in `src/shared/brand.ts` comes from that same master.
