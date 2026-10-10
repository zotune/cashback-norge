Cashback Norge uses one visual component layer in `ui.ts`, including the website,
installation guides, React popup, shadow DOM panel and generated userscript.

- `cbn-button`, `cbn-button--quiet`, `cbn-button--primary`: actions and navigation.
- `cbn-field`, `cbn-field-group`: inputs and grouped inputs.
- `cbn-card`, `cbn-row`: content surfaces and interactive offer rows.
- `cbn-chip`, `cbn-chip--muted`: provider brands and small status labels.
- `cbn-popover`: floating menus.

Keep layout, typography and sizing in the screen's stylesheet. Change fills,
corners and interaction states here, so all surfaces change together. Installation
buttons configure `--cbn-button-bg` and `--cbn-button-fg`. Provider chips retain their
brand hues, with pale fills and white lettering softened in dark mode. Do not add persistent borders; use an outline for input focus and
keyboard focus. The illustrated third-party phone screens retain their real UI.

`theme.ts` supplies the shared light/dark palette, preference store and theme-menu
component. Each environment only supplies its persistence adapter. The default is
the system appearance; an explicit choice overrides it until System is selected.
