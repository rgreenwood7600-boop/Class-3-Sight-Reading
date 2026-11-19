/* Examiner page: pick an instrument, open one authorised sight-reading passage. */

(function () {
    var instrumentSelect = document.getElementById("instrument");
    var passageSelect = document.getElementById("passage");
    var generateButton = document.getElementById("generateButton");
    var downloadButton = document.getElementById("downloadButton");
    var emptyState = document.getElementById("emptyState");
    var passageTitle = document.getElementById("passageTitle");
    var passageFacts = document.getElementById("passageFacts");
    var osmdHost = document.getElementById("osmd");
    var errorBox = document.getElementById("error");
    var statusBox = document.getElementById("status");

    var instruments = [];
    var passages = [];
    var instrument = null;
    var osmd = null;
    var loadedXml = null;
    var current = null;
    var token = 0;
    var renderWidth = 0;
    var readyResolve;
    var ready = new Promise(function (resolve) { readyResolve = resolve; });

    function prettify(text) {
        return String(text).replace(/Bb/g, "B♭").replace(/Eb/g, "E♭");
    }

    function timeLabel(time) {
        return time === "cut" ? "Cut time" : time;
    }

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    function setStatus(text) {
        statusBox.textContent = text;
    }

    function showError(message) {
        errorBox.hidden = !message;
        errorBox.textContent = message || "";
    }

    function lastKey() {
        return "ceq3-sight-last:" + (instrument ? instrument.id : "");
    }

    function remember(n) {
        try { sessionStorage.setItem(lastKey(), String(n)); } catch (e) { /* private mode */ }
    }

    function remembered() {
        try { return Number(sessionStorage.getItem(lastKey())); } catch (e) { return NaN; }
    }

    function xmlForEngine(xml) {
        return window.CeqXml.forEngine(xml);
    }

    function measuresFor(width) {
        // One bar a line on a phone keeps the notes large. Two on a tablet, four on a desk.
        if (width < 520) return 1;
        if (width < 900) return 2;
        return 4;
    }

    function passageUrl(passage) {
        var dir = instrument.manifest.replace(/manifest\.json$/, "");
        return dir + passage.file.split("/").map(encodeURIComponent).join("/");
    }

    function setHash(n) {
        var next = "#" + instrument.id + "/" + n;
        if (location.hash !== next) history.replaceState(null, "", next);
    }

    function parseHash() {
        var match = /^#([a-z0-9-]+)\/(\d+)$/.exec(location.hash);
        if (!match) return null;
        return { id: match[1], n: Number(match[2]) };
    }

    function setBusy(busy) {
        generateButton.disabled = busy || passages.length === 0;
        passageSelect.disabled = busy || passages.length === 0;
        instrumentSelect.disabled = busy;
        downloadButton.disabled = busy || !current;
        generateButton.setAttribute("aria-busy", busy ? "true" : "false");
    }

    function fillInstruments() {
        instrumentSelect.replaceChildren();
        var families = [];
        instruments.forEach(function (item) {
            if (families.indexOf(item.family) === -1) families.push(item.family);
        });
        families.forEach(function (family) {
            var group = document.createElement("optgroup");
            group.label = family;
            instruments.filter(function (item) { return item.family === family; }).forEach(function (item) {
                var option = document.createElement("option");
                option.value = item.id;
                option.textContent = prettify(item.name);
                group.appendChild(option);
            });
            instrumentSelect.appendChild(group);
        });
    }

    function fillPassages() {
        var previous = passageSelect.value;
        passageSelect.replaceChildren();
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose a number";
        passageSelect.appendChild(placeholder);
        passages.forEach(function (passage) {
            var option = document.createElement("option");
            option.value = String(passage.n);
            option.textContent = pad(passage.n) + " — " + prettify(passage.key) + ", " + timeLabel(passage.time);
            passageSelect.appendChild(option);
        });
        if (passages.some(function (passage) { return String(passage.n) === previous; })) {
            passageSelect.value = previous;
        }
    }

    function findPassage(n) {
        return passages.find(function (passage) { return passage.n === n; }) || null;
    }

    function ensureOsmd() {
        if (osmd) return osmd;
        osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(osmdHost, {
            autoResize: false,
            backend: "svg",
            drawTitle: false,
            drawSubtitle: false,
            drawCredits: false,
            drawComposer: false,
            drawLyricist: false,
            drawPartNames: false,
            drawPartAbbreviations: false,
            drawMetronomeMarks: true,
            disableCursor: true,
            drawMeasureNumbersOnlyAtSystemStart: true,
            stretchLastSystemLine: true,
            pageBackgroundColor: "#FFFFFF",
            defaultFontFamily: "Georgia, 'Times New Roman', Times, serif"
        });
        return osmd;
    }

    function renderCurrent() {
        var width = osmdHost.clientWidth;
        if (!width) return;
        var engine = ensureOsmd();
        engine.EngravingRules.RenderXMeasuresPerLineAkaSystem = measuresFor(width);
        engine.render();
        renderWidth = width;
        var svg = osmdHost.querySelector("svg");
        if (svg) {
            svg.setAttribute("role", "img");
            svg.setAttribute("aria-label", passageTitle.textContent + ", " + passageFacts.textContent);
        }
    }

    async function display(passage, options) {
        var my = ++token;
        var moveFocus = options && options.focus;
        showError("");
        setStatus("Opening passage " + pad(passage.n) + ".");
        setBusy(true);
        emptyState.hidden = false;
        emptyState.textContent = "Opening passage " + pad(passage.n) + "…";
        try {
            var response = await fetch(passageUrl(passage));
            if (!response.ok) throw new Error("Passage " + pad(passage.n) + " did not load.");
            var xml = await response.text();
            if (my !== token) return;
            var engine = ensureOsmd();
            await engine.load(xmlForEngine(xml));
            if (my !== token) return;
            loadedXml = xml;
            current = { passage: passage, xml: xml, instrument: instrument };
            passageTitle.hidden = false;
            passageFacts.hidden = false;
            osmdHost.hidden = false;
            emptyState.hidden = true;
            passageTitle.textContent = "Passage " + pad(passage.n);
            passageFacts.textContent = prettify(instrument.name) + ", written pitch · " +
                prettify(passage.key) + " · " + timeLabel(passage.time) + " · " + passage.tempo;
            passageSelect.value = String(passage.n);
            remember(passage.n);
            setHash(passage.n);
            await new Promise(function (resolve) { requestAnimationFrame(resolve); });
            if (my !== token) return;
            renderCurrent();
            downloadButton.disabled = false;
            setStatus(passageTitle.textContent + ". " + passageFacts.textContent);
            if (moveFocus) passageTitle.focus();
        } catch (error) {
            if (my !== token) return;
            current = null;
            downloadButton.disabled = true;
            showError(error && error.message ? error.message : "That passage could not be opened.");
            setStatus("The passage could not be opened.");
        } finally {
            if (my === token) setBusy(false);
        }
    }

    function pickRandom() {
        var last = current ? current.passage.n : remembered();
        var pool = passages.filter(function (passage) { return passage.n !== last; });
        if (pool.length === 0) pool = passages.slice();
        return pool[Math.floor(Math.random() * pool.length)];
    }

    async function loadInstrument(id) {
        instrument = instruments.find(function (item) { return item.id === id; }) || instruments[0];
        instrumentSelect.value = instrument.id;
        passages = [];
        current = null;
        loadedXml = null;
        passageTitle.hidden = true;
        passageFacts.hidden = true;
        osmdHost.hidden = true;
        emptyState.hidden = false;
        emptyState.textContent = "Choose an instrument, then press Generate Sight Reading.";
        downloadButton.disabled = true;
        showError("");
        setBusy(true);
        try {
            var response = await fetch(instrument.manifest);
            if (!response.ok) throw new Error("The passage list for " + instrument.name + " did not load.");
            var data = await response.json();
            if (!Array.isArray(data)) throw new Error("The passage list is not in the expected form.");
            passages = data.slice().sort(function (a, b) { return a.n - b.n; });
            fillPassages();
            setStatus(passages.length + " passages ready for " + prettify(instrument.name) + ".");
        } catch (error) {
            passages = [];
            fillPassages();
            showError(error && error.message ? error.message : "The passage list did not load.");
        } finally {
            setBusy(false);
        }
    }

    function firstPitch(engine) {
        var measures = engine.Sheet && engine.Sheet.SourceMeasures;
        if (!measures) return null;
        for (var i = 0; i < measures.length; i++) {
            var columns = measures[i].VerticalSourceStaffEntryContainers || [];
            for (var c = 0; c < columns.length; c++) {
                var entries = columns[c].StaffEntries || [];
                for (var s = 0; s < entries.length; s++) {
                    var entry = entries[s];
                    if (!entry) continue;
                    var voices = entry.VoiceEntries || [];
                    for (var v = 0; v < voices.length; v++) {
                        var notes = voices[v].Notes || [];
                        for (var n = 0; n < notes.length; n++) {
                            var note = notes[n];
                            if (!note || note.isRest()) continue;
                            // OSMD stores octave 3 below scientific pitch. ToStringShort(3) is written pitch, e.g. A4.
                if (note.Pitch && note.Pitch.ToStringShort) return note.Pitch.ToStringShort(3);
                        }
                    }
                }
            }
        }
        return null;
    }

    function summary() {
        var svg = osmdHost.querySelector("svg");
        return {
            n: current ? current.passage.n : null,
            key: current ? current.passage.key : null,
            time: current ? current.passage.time : null,
            tempo: current ? current.passage.tempo : null,
            file: current ? current.passage.file : null,
            measures: osmd && osmd.Sheet ? osmd.Sheet.SourceMeasures.length : 0,
            systems: (function () {
                if (!osmd || !osmd.GraphicSheet || !osmd.GraphicSheet.MusicPages) return 0;
                return osmd.GraphicSheet.MusicPages.reduce(function (sum, page) {
                    return sum + (page.MusicSystems ? page.MusicSystems.length : 0);
                }, 0);
            }()),
            text: svg ? svg.textContent : "",
            paths: svg ? svg.querySelectorAll("path").length : 0,
            firstPitch: osmd ? firstPitch(osmd) : null,
            title: passageTitle.textContent,
            facts: passageFacts.textContent
        };
    }

    instrumentSelect.addEventListener("change", function () {
        loadInstrument(instrumentSelect.value).then(function () {
            var hash = parseHash();
            if (hash && hash.id === instrument.id && findPassage(hash.n)) display(findPassage(hash.n));
        });
    });

    passageSelect.addEventListener("change", function () {
        var passage = findPassage(Number(passageSelect.value));
        if (passage) display(passage, { focus: true });
    });

    generateButton.addEventListener("click", function () {
        if (!passages.length) return;
        display(pickRandom(), { focus: true });
    });

    downloadButton.addEventListener("click", function () {
        if (!current || !window.CeqPdf) return;
        downloadButton.disabled = true;
        setStatus("Preparing the PDF.");
        window.CeqPdf.download(current).then(function () {
            setStatus("PDF saved for passage " + pad(current.passage.n) + ".");
        }).catch(function (error) {
            showError(error && error.message ? error.message : "The PDF could not be made.");
        }).finally(function () {
            downloadButton.disabled = !current;
        });
    });

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (!current || !osmd || osmdHost.hidden) return;
            var width = osmdHost.clientWidth;
            if (!width || Math.abs(width - renderWidth) < 8) return;
            renderCurrent();
        }, 150);
    });

    window.addEventListener("hashchange", function () {
        var hash = parseHash();
        if (!hash || !instrument || hash.id !== instrument.id) return;
        var passage = findPassage(hash.n);
        if (passage && (!current || current.passage.n !== passage.n)) display(passage);
    });

    window.CeqApp = {
        ready: ready,
        showByNumber: function (n) {
            var passage = findPassage(Number(n));
            if (!passage) return Promise.reject(new Error("No passage " + n));
            return display(passage).then(summary);
        },
        generate: function () {
            return display(pickRandom()).then(summary);
        },
        summary: summary,
        material: function () { return current; }
    };

    fetch("instruments.json").then(function (response) {
        if (!response.ok) throw new Error("The instrument list did not load. Open this page over HTTP, not as a file.");
        return response.json();
    }).then(function (catalog) {
        instruments = catalog.instruments || [];
        if (!instruments.length) throw new Error("No instruments are listed yet.");
        fillInstruments();
        var hash = parseHash();
        var initial = instruments[0].id;
        if (hash && instruments.some(function (item) { return item.id === hash.id; })) initial = hash.id;
        return loadInstrument(initial).then(function () {
            if (hash && hash.id === instrument.id) {
                var passage = findPassage(hash.n);
                if (passage) return display(passage);
            }
        });
    }).catch(function (error) {
        showError(error && error.message ? error.message : "The page did not load.");
    }).finally(function () {
        readyResolve();
    });
}());
