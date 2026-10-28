# The Robotics Fieldbook

Source: [NicholasHazen/ubiquitous-enigma](https://github.com/NicholasHazen/ubiquitous-enigma).

A practical HTML textbook for building a room-survey rover while learning
mechanical design, accurate 3D printing, electronics, model training, mapping,
and navigation. The workbench keeps the next session, evidence, restart notes,
and saved ideas together. The core path covers one supervised room; broader
reconstruction and unusual locomotion remain optional extensions.

The book includes 34 working sessions, eight capability milestones, a dependency
roadmap, and 33 curated resources. It supplies fit coupons and software exercises;
it does not claim a physically validated robot kit or a complete chassis CAD model.

## Build and preview

Use Python 3.10 or newer. The book build needs no third-party Python packages;
the GitHub workflow uses Python 3.12.

```sh
python build.py
python -m http.server 8000 --directory dist
```

Open <http://localhost:8000/>. You can also open `dist/index.html` directly.
The interface, fonts and starter downloads are embedded for offline use;
external references and software installation still require internet access.

Edit source files and rebuild. Do not edit generated files in `dist/` by hand.
The build produces:

- `dist/index.html`: the website.
- `dist/robotics-fieldbook.html`: the downloadable standalone edition.
- `dist/legacy.html`: the archived rover, arm, crawler and simulation edition.

## Checks

```sh
python review/check_structure.py
python review/check_bundled_assets.py
```

Optional browser checks require Node.js and the package dependencies:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

On Linux, Playwright may also require system dependencies; its installer reports
what is missing. Browser checks exercise navigation, responsive layouts, notes,
progress, imports, exports and the archived edition. Hardware and household
performance must be checked through the course's physical experiments.

## GitHub Pages

The workflow builds and checks pushes to `main`, pull requests targeting `main`,
and manual runs. Successful builds on `main` deploy automatically once Pages is
enabled. Pull requests never deploy.

One-time repository setting:

1. Open [Settings → Pages](https://github.com/NicholasHazen/ubiquitous-enigma/settings/pages).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open [Actions → Build and publish fieldbook](https://github.com/NicholasHazen/ubiquitous-enigma/actions/workflows/pages.yml)
   and choose **Run workflow** on `main` if no deployment is running.

The GitHub integration can update repository files but cannot enable Pages in
repository settings, so the repository owner must make the one-time setting.
No repository variable or deployment secret is needed.

The expected site address after successful deployment is
<https://nicholashazen.github.io/ubiquitous-enigma/>. The repository and Pages site
are public. The workflow publishes only `dist/`; hash navigation and relative
download links work under the project URL. Future pushes to `main` rebuild and
publish automatically. Disabling the workflow stops future deployments; it does
not remove an already published site.

## Move existing notes and progress

Notes are stored in the browser for the site's origin. They do not transfer
automatically to a different domain, browser, or device.

1. On the existing fieldbook, open `#ch-practice` and choose **Export notes & progress**.
2. Save the JSON backup before changing sites.
3. On the new site, open `#ch-practice` and choose **Import saved notes** with that file.

A Home Survey export includes chapter notes, checkpoints, the active session,
workbench evidence and saved ideas. The archived edition has its own separate
notes and export. Keep the original site and backup until you have verified the
import. Notes are browser-local; they are not committed to this repository.

## Source map

- `course/`: current chapters and resource library.
- `src/`: styles, navigation, workbench and session dependency data.
- `content/`: shared inserts and historical chapter sources.
- `assets/`: downloadable print, hardware, training and memory exercises; fonts.
- `archive/`: the preserved previous edition used by the build.
- `review/`: automated structural, asset and browser checks.
- `tools/`: supplementary packaging tools.
- `.github/workflows/pages.yml`: checked build and optional Pages publication.

No repository-wide license has been selected. Bundled font license texts are in
`assets/fonts/` and embedded in the standalone book. Preserve those notices and
any licenses supplied with individual assets or dependencies.
