# ARB Class 3 Sight-Reading

Authorised Musician Class 3 (CEQ-3) sight-reading passages for the Royal Military School of Music. An examiner opens the page, chooses an instrument, and gets one pre-authorised passage as notation the candidate can read from a music stand or an iPad.

This sits beside the [ARB Class 3 Scales Generator](https://rgreenwood7600-boop.github.io/CEQ-3-Scale-Generator/).

Published with GitHub Pages from `main`:

**https://rgreenwood7600-boop.github.io/Class-3-Sight-Reading/**

The first set is Bb Trumpet: 50 passages in `passages/bb-trumpet/`. Adding another instrument is a folder plus one entry in `instruments.json`.

## Use the page

1. Choose the instrument.
2. Press **Generate Sight Reading**. A passage cannot be chosen by number, and the address bar does not open one.
3. The passage number, key, time signature and tempo stay on screen with the notation. Record the number.
4. **Download PDF** saves that same passage on one A4 page, in the browser. Nothing is sent to a server. Under the music there are lines for comments and a mark out of 20.

A new draw will not repeat the passage just shown.

Open the site over HTTP. `fetch` cannot read the passages from a `file://` page.

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080/

## Add an instrument

The page reads `instruments.json`. Each instrument points at a manifest. No build step.

1. Create `passages/<id>/` and put the authorised MusicXML files in it. Do not edit the musical content of a passage once it is authorised.
2. Add `passages/<id>/manifest.json`: a JSON array, one object per passage.

```json
{
  "n": 1,
  "file": "Example 01 - C major - 4-4.musicxml",
  "key": "C major",
  "time": "4/4",
  "tempo": "Moderato",
  "seed": 1
}
```

`n` is the passage number the examiner records. `file` is the filename in that folder. `time` is `2/4`, `3/4`, `4/4`, or `cut`. `seed` is optional and is only there so the generator can be traced.

3. Add the instrument to `instruments.json`. `family` is the group in the picker (`Brass`, `Woodwind`, `Percussion`, and so on).

```json
{
  "id": "bb-clarinet",
  "name": "Bb Clarinet",
  "family": "Woodwind",
  "manifest": "passages/bb-clarinet/manifest.json"
}
```

`id` is the folder name. `name` is what the page and the PDF show.

## Bb Trumpet set

`passages/bb-trumpet/` is the authorised set of 50, copied with the manifest. Pitches are written pitch. Each file is 16 bars. The part’s transpose element is for concert playback only; the page engraves the written notes.

`tools/gen_trumpet.py` and `tools/validate_trumpet.py` are the scripts that produced and checked that set, kept for reference, with their own `tools/README.md`. The generator writes a `bb-trumpet/` folder next to itself. The site serves `passages/bb-trumpet/`.

Check the published files again:

```bash
cd passages && python3 ../tools/validate_trumpet.py
```

`tools/check-render.mjs` loads all 50 in the on-page renderer (Chrome, and `puppeteer-core` installed where you run it). From the repo root, with a static server already unnecessary — the script starts one:

```bash
npm install --no-save puppeteer-core
node tools/check-render.mjs
```

## Notation and PDF

[OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) 2.3.1 draws the MusicXML. [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 builds the A4 file. Both are vendored in `vendor/` (BSD-3-Clause and MIT). The page does not load a CDN and does not need a build.

GitHub Pages is deployed by `.github/workflows/pages.yml` on every push to `main`. In the repository settings, Pages → Build and deployment must be **GitHub Actions**.
