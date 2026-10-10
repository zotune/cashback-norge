# Cashback Norge bear

- `bear-original.png`: the supplied **Cheerful Bear with Blueberry Badge (1).png**, preserved unchanged.
- `bear-transparent.png`: transparent cutout master, made with imagegen in **edit / background-extraction** mode. No solid background or checkerboard is part of the image.
- `avatar.png`: transparent 1024 px version with extra room for circular Instagram/TikTok crops.
- `prompt.txt`: the final imagegen edit prompt used for the cutout.

Run `python3 scripts/build-brand-assets.py` from the repository root to regenerate the website logo, PNG/ICO favicons, Apple touch icon, Chrome toolbar/store icons and the embedded extension/userscript logo. Pillow is used only to resize the approved master, preserve its alpha channel, add transparent padding and encode the icon formats; it does not remove or redraw the background.

The website uses `site/logo.png` at 512 px, separate from its small favicon. Chrome receives 16, 32, 48 and 128 px icons. The shared embedded image in `src/shared/brand.ts` comes from that same master.
