/* A4 PDF of the passage currently on screen. Drawn in the browser; nothing is uploaded. */

(function () {
    var PRINT_CSS_WIDTH = 1000;
    var PRINT_ZOOM = 2;

    function forEngine(xml) {
        // The files keep their MusicXML DOCTYPE. Drop it only for the engraver so the
        // page does not ask musicxml.org for a DTD. The files in the repo are unchanged.
        return String(xml).replace(/<!DOCTYPE[^>]*>/i, "");
    }

    window.CeqXml = { forEngine: forEngine };

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    function timeLabel(time) {
        return time === "cut" ? "Cut time" : time;
    }

    function fileName(instrumentName, n) {
        var slug = instrumentName.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
        return "CEQ-3-Sight-Reading-" + slug + "-" + pad(n) + ".pdf";
    }

    function renderPrint(xml) {
        var host = document.getElementById("printHost");
        var widthPx = PRINT_CSS_WIDTH * PRINT_ZOOM;
        // Kept in the layout (not display:none) so the engraver gets a real width,
        // and shifted off the page by its own width so it does not widen the phone layout.
        host.style.cssText = "position:fixed;left:0;top:0;width:" + widthPx + "px;transform:translateX(-100%);background:#fff;";
        host.replaceChildren();
        var inner = document.createElement("div");
        inner.style.width = widthPx + "px";
        host.appendChild(inner);
        var engine = new opensheetmusicdisplay.OpenSheetMusicDisplay(inner, {
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
        return engine.load(forEngine(xml)).then(function () {
            engine.Zoom = PRINT_ZOOM;
            engine.EngravingRules.RenderXMeasuresPerLineAkaSystem = 4;
            engine.render();
            var svg = inner.querySelector("svg");
            if (!svg) throw new Error("The notation did not draw.");
            svg.setAttribute("contenteditable", "false");
            var texts = svg.querySelectorAll("text, tspan");
            for (var i = 0; i < texts.length; i++) texts[i].setAttribute("contenteditable", "false");
            return rasterizeSvg(svg);
        }).finally(function () {
            host.replaceChildren();
            host.style.cssText = "";
        });
    }

    function rasterizeSvg(svg) {
        var width = Math.ceil((svg.width && svg.width.baseVal && svg.width.baseVal.value) || svg.getBoundingClientRect().width);
        var height = Math.ceil((svg.height && svg.height.baseVal && svg.height.baseVal.value) || svg.getBoundingClientRect().height);
        if (width < 400 || height < 200) throw new Error("The notation did not draw.");
        var clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.setAttribute("width", String(width));
        clone.setAttribute("height", String(height));
        var source = new XMLSerializer().serializeToString(clone);
        var url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
                window.__pdfRaw = { width: width, height: height };
                var canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                var ctx = canvas.getContext("2d");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(url);
                resolve(cropInk(canvas));
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error("The notation did not draw."));
            };
            img.src = url;
        });
    }

    function cropInk(source) {
        var ctx = source.getContext("2d", { willReadFrequently: true });
        var width = source.width;
        var height = source.height;
        var data = ctx.getImageData(0, 0, width, height).data;
        var top = height;
        var bottom = 0;
        var left = width;
        var right = 0;
        var ink = 0;
        var step = 3;
        for (var y = 0; y < height; y += step) {
            var row = y * width;
            for (var x = 0; x < width; x += step) {
                var i = (row + x) * 4;
                if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
                    ink++;
                    if (y < top) top = y;
                    if (y > bottom) bottom = y;
                    if (x < left) left = x;
                    if (x > right) right = x;
                }
            }
        }
        var samples = Math.ceil(height / step) * Math.ceil(width / step);
        if (!samples || ink / samples < 0.004 || right <= left) throw new Error("The notation did not draw.");
        var pad = 18;
        top = Math.max(0, top - pad);
        left = Math.max(0, left - pad);
        bottom = Math.min(height - 1, bottom + pad);
        right = Math.min(width - 1, right + pad);
        var crop = document.createElement("canvas");
        crop.width = right - left + 1;
        crop.height = bottom - top + 1;
        crop.getContext("2d").drawImage(source, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
        return crop;
    }

    function fieldValue(id) {
        var field = document.getElementById(id);
        if (!field || field.value == null) return "";
        return String(field.value).replace(/\s+/g, " ").trim();
    }

    function formatDate(value) {
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!match) return value;
        var year = Number(match[1]);
        var month = Number(match[2]);
        var day = Number(match[3]);
        var months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        if (month < 1 || month > 12) return value;
        var parsed = new Date(Date.UTC(year, month - 1, day));
        if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
            return value;
        }
        return day + " " + months[month - 1] + " " + year;
    }

    function readCandidate() {
        return {
            number: fieldValue("candidateNumber"),
            rank: fieldValue("candidateRank"),
            name: fieldValue("candidateName"),
            date: formatDate(fieldValue("candidateDate")),
            band: fieldValue("candidateBand")
        };
    }

    /*
 * Standard PDF fonts draw WinAnsi, not every Unicode character. A flat
 * or an em dash in a name would otherwise corrupt the whole line.
 * Accents that WinAnsi includes are kept. The scales PDF drops the rest.
 */
function pdfSafe(value) {
    var map = {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "\u0096",
        "\u2014": "\u0097",
        "\u2018": "\u0091",
        "\u2019": "\u0092",
        "\u201C": "\u0093",
        "\u201D": "\u0094",
        "\u2026": "\u0085",
        "\u2022": "\u0095",
        "\u20AC": "\u0080",
        "\u266D": "b",
        "\u266F": "#"
    };
    var text = String(value == null ? "" : value);
    var out = "";
    for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        var code = text.charCodeAt(i);
        if (code === 9) {
            out += " ";
            continue;
        }
        if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
            out += ch;
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(map, ch)) {
            out += map[ch];
            continue;
        }
        if (code < 32) continue;
        out += "?";
    }
    return out;
}

function fitLine(doc, text, slot, size) {
        var value = String(text || "");
        if (!value) return "";
        doc.setFontSize(size);
        while (size > 8 && doc.getTextWidth(value) > slot) {
            size -= 0.5;
            doc.setFontSize(size);
        }
        if (doc.getTextWidth(value) <= slot) return value;
        var clipped = value;
        while (clipped.length > 1 && doc.getTextWidth(clipped + "...") > slot) {
            clipped = clipped.slice(0, -1);
        }
        return clipped + "...";
    }

    /*
     * Same candidate block as the scales sheet: Number, Rank and Date on
     * the first line, Name and Band on the second. Labels stay when a
     * value is blank. Returns the y where the notation can start.
     */
    function drawCandidate(doc, candidate, top, margin, pageW) {
        var details = candidate || {};
        var pt = 25.4 / 72;
        var left = margin;
        var right = pageW - margin;
        var width = right - left;
        var panelH = 68 * pt;
        var labelSize = 8;
        var valueSize = 11;
        var innerLeft = left + 14 * pt;
        var innerRight = right - 12 * pt;
        var innerW = innerRight - innerLeft;
        var label1 = top + 14 * pt;
        var value1 = label1 + 14 * pt;
        var label2 = value1 + 16 * pt;
        var value2 = label2 + 14 * pt;

        doc.setFillColor(243, 246, 249);
        doc.rect(left, top, width, panelH, "F");
        doc.setFillColor(0, 33, 71);
        doc.rect(left, top, 3.2 * pt, panelH, "F");
        doc.setDrawColor(185, 151, 91);
        doc.setLineWidth(0.4);
        doc.line(left, top + panelH, right, top + panelH);

        function label(text, x, y) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(labelSize);
            doc.setTextColor(0, 33, 71);
            doc.text(text, x, y);
        }
        function value(text, x, y, slot) {
            var raw = pdfSafe(text);
            if (!raw || slot < 3) return;
            doc.setFont("helvetica", "bold");
            doc.setTextColor(28, 36, 48);
            doc.setFontSize(valueSize);
            doc.text(fitLine(doc, raw, slot, valueSize), x, y);
        }

        var numberW = innerW * 0.28;
        var rankW = innerW * 0.40;
        var dateX = innerLeft + numberW + rankW;
        label("Number", innerLeft, label1);
        label("Rank", innerLeft + numberW, label1);
        label("Date", dateX, label1);
        value(details.number, innerLeft, value1, numberW - 12 * pt);
        value(details.rank, innerLeft + numberW, value1, rankW - 12 * pt);
        value(details.date, dateX, value1, innerRight - dateX);

        var nameW = innerW * 0.48;
        label("Name", innerLeft, label2);
        label("Band", innerLeft + nameW, label2);
        value(details.name, innerLeft, value2, nameW - 12 * pt);
        value(details.band, innerLeft + nameW, value2, innerW - nameW);

        return top + panelH + 4;
    }

    /*
     * Examiner box under the music: ruled lines for comments, then
     * Mark: ___ / 20. Height is fixed so the notation can leave room
     * for it on the same A4 page.
     */
    function examinerHeight() {
        return 50;
    }

    function drawExaminer(doc, top, margin, pageW) {
        var left = margin;
        var right = pageW - margin;
        var width = right - left;
        var height = examinerHeight();
        var bottom = top + height;
        var innerLeft = left + 5;
        var innerRight = right - 5;
        var pt = 25.4 / 72;

        doc.setFillColor(243, 246, 249);
        doc.rect(left, top, width, height, "F");
        doc.setFillColor(0, 33, 71);
        doc.rect(left, top, 3.2 * pt, height, "F");
        doc.setDrawColor(185, 151, 91);
        doc.setLineWidth(0.4);
        doc.line(left, bottom, right, bottom);

        doc.setFont("times", "bold");
        doc.setFontSize(11);
        doc.setTextColor(0, 33, 71);
        doc.text("Comments", innerLeft, top + 6.5);

        var lineCount = 4;
        var lineGap = 7;
        var firstRule = top + 12;
        doc.setDrawColor(180, 194, 206);
        doc.setLineWidth(0.3);
        for (var i = 0; i < lineCount; i++) {
            doc.line(innerLeft, firstRule + i * lineGap, innerRight, firstRule + i * lineGap);
        }

        var markBaseline = firstRule + (lineCount - 1) * lineGap + 9;
        doc.setFont("times", "bold");
        doc.setFontSize(13);
        doc.setTextColor(0, 33, 71);
        var markLabel = "Mark:";
        var denom = "/ 20";
        var denomW = doc.getTextWidth(denom);
        var denomX = innerRight - denomW;
        var blankW = 24;
        var blankEnd = denomX - 3;
        var blankStart = blankEnd - blankW;
        var markX = blankStart - 3 - doc.getTextWidth(markLabel);
        doc.text(markLabel, markX, markBaseline);
        doc.setDrawColor(0, 33, 71);
        doc.setLineWidth(0.5);
        doc.line(blankStart, markBaseline + 1.2, blankEnd, markBaseline + 1.2);
        doc.text(denom, denomX, markBaseline);

        addExaminerFields(doc, {
            commentsX: innerLeft,
            commentsY: top + 8.4,
            commentsW: innerRight - innerLeft,
            commentsH: 28,
            markX: blankStart,
            markY: markBaseline - 5,
            markW: blankW,
            markH: 6.2
        });
        return bottom;
    }

    function pdfHex(text) {
        var hex = "";
        for (var i = 0; i < text.length; i++) {
            hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0");
        }
        return "<" + hex + ">";
    }

    /*
     * Acrobat runs this when the mark is typed or left. Preview and browser
     * viewers still edit the field; they just do not all run the script.
     * A blank is allowed. Anything else must be a number from 0 to 20.
     */
    function markAction() {
        var script = 'var v=event.value;if(v==""){event.rc=true;}else if(!/^\\d{0,2}(\\.\\d?)?$/.test(v)){event.rc=false;}else if(v=="."||v.charAt(v.length-1)=="."){event.rc=true;}else{var n=Number(v);event.rc=n>=0&&n<=20;}';
        var action = "<</S /JavaScript /JS " + pdfHex(script) + ">>";
        return "<</K " + action + " /V " + action + ">>";
    }

    function addExaminerFields(doc, box) {
        var comments = new doc.AcroFormTextField();
        comments.fieldName = "Comments";
        comments.multiline = true;
        comments.fontName = "times";
        comments.fontSize = 11;
        comments.color = "#1c2430";
        comments.x = box.commentsX;
        comments.y = box.commentsY;
        comments.width = box.commentsW;
        comments.height = box.commentsH;
        doc.addField(comments);

        var mark = new doc.AcroFormTextField();
        mark.fieldName = "Mark";
        mark.fontName = "times";
        mark.fontStyle = "bold";
        mark.fontSize = 12;
        mark.color = "#002147";
        mark.textAlign = "center";
        mark.maxLength = 4;
        mark.doNotSpellCheck = true;
        mark.x = box.markX;
        mark.y = box.markY;
        mark.width = box.markW;
        mark.height = box.markH;
        Object.defineProperty(mark, "AA", {
            configurable: false,
            enumerable: false,
            get: function () { return markAction(); }
        });
        doc.addField(mark);
    }

    function buildBlob(current) {
        var passage = current.passage;
        var instrumentName = current.instrument.name;
        var candidate = readCandidate();
        return renderPrint(current.xml).then(function (canvas) {
            var JsPDF = window.jspdf.jsPDF;
            var doc = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
            var margin = 14;
            var pageW = 210;
            var pageH = 297;
            var contentW = pageW - margin * 2;
            var y = 16;

            doc.setProperties({
                title: "CEQ-3 Sight-Reading " + instrumentName + " " + pad(passage.n),
                subject: passage.key + " " + timeLabel(passage.time) + " " + passage.tempo,
                author: "The Royal Military School of Music",
                creator: "RMSM ARB Class 3 Sight-Reading"
            });

            doc.setTextColor(0, 33, 71);
            doc.setFont("times", "bold");
            doc.setFontSize(11);
            doc.text("THE ROYAL MILITARY SCHOOL OF MUSIC", pageW / 2, y, { align: "center" });
            y += 7;
            doc.setFontSize(16);
            doc.text("ARB Class 3 Sight-Reading", pageW / 2, y, { align: "center" });
            y += 8;
            doc.setFontSize(18);
            doc.text("Passage " + pad(passage.n), pageW / 2, y, { align: "center" });
            y += 7;
            doc.setFont("times", "normal");
            doc.setFontSize(12);
            var facts = instrumentName + ", written pitch    " + passage.key + "    " + timeLabel(passage.time) + "    " + passage.tempo;
            var lines = doc.splitTextToSize(facts, contentW);
            doc.text(lines, pageW / 2, y, { align: "center" });
            y += lines.length * 5.2;

            doc.setDrawColor(0, 33, 71);
            doc.setLineWidth(0.7);
            doc.line(margin, y, pageW - margin, y);
            doc.setDrawColor(185, 151, 91);
            doc.setLineWidth(0.45);
            doc.line(margin, y + 1.3, pageW - margin, y + 1.3);
            y += 4;
            y = drawCandidate(doc, candidate, y, margin, pageW);

            var footerBaseline = pageH - 8;
            var musicGap = 4;
            var boxH = examinerHeight();
            var availH = footerBaseline - 6 - boxH - musicGap - y;
            var drawW = contentW;
            var drawH = canvas.height * (drawW / canvas.width);
            if (drawH > availH) {
                drawH = availH;
                drawW = canvas.width * (drawH / canvas.height);
            }
            var x = margin + (contentW - drawW) / 2;
            doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, drawW, drawH);
            var examinerTop = y + drawH + musicGap;
            drawExaminer(doc, examinerTop, margin, pageW);

            doc.setFont("times", "normal");
            doc.setFontSize(9);
            doc.setTextColor(62, 76, 90);
            doc.text("CEQ-3  ·  " + instrumentName + "  ·  Passage " + pad(passage.n), pageW / 2, pageH - 8, { align: "center" });

            window.__lastPdfStats = {
                rawWidth: window.__pdfRaw ? window.__pdfRaw.width : 0,
                rawHeight: window.__pdfRaw ? window.__pdfRaw.height : 0,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                drawW: Math.round(drawW * 10) / 10,
                drawH: Math.round(drawH * 10) / 10,
                pages: doc.getNumberOfPages(),
                candidate: candidate,
                examinerTop: Math.round(examinerTop * 10) / 10
            };
            return finishExaminerForm(doc.output("arraybuffer"));
        });
    }

    function pdfBinary(buffer) {
        var bytes = new Uint8Array(buffer);
        var parts = [];
        for (var i = 0; i < bytes.length; i += 0x8000) {
            parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
        }
        return parts.join("");
    }

    function pdfBytes(text) {
        var out = new Uint8Array(text.length);
        for (var i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 255;
        return out;
    }

    function objectIdBefore(pdf, at) {
        var head = pdf.lastIndexOf("obj", at);
        var num = pdf.slice(Math.max(0, head - 12), head).match(/(\d+)\s+0\s+$/);
        return num ? num[1] : null;
    }

    function fontObjectId(pdf, base) {
        var at = pdf.indexOf("/BaseFont /" + base + "\n");
        if (at < 0) at = pdf.indexOf("/BaseFont /" + base + "/");
        if (at < 0) return null;
        return objectIdBefore(pdf, at);
    }

    function fieldObjectId(pdf, name) {
        var at = pdf.indexOf("/T (" + name + ")");
        if (at < 0) return null;
        return objectIdBefore(pdf, at);
    }

    function acroFormObjectId(pdf) {
        var match = pdf.match(/\/AcroForm (\d+) 0 R/);
        return match ? match[1] : null;
    }

    function objectBody(pdf, id) {
        var match = new RegExp("(?:^|\\n)(" + id + " 0 obj\\n)").exec(pdf);
        if (!match) return null;
        var start = match.index + (pdf.charAt(match.index) === "\n" ? 1 : 0);
        var end = pdf.indexOf("endobj", start);
        if (end < 0) return null;
        return pdf.slice(start, end + "endobj".length);
    }

    /*
     * jsPDF omits the default appearance on text fields, so a viewer has no
     * font to draw what the examiner types. Add /DA and the Times fonts to
     * the form dictionary with an incremental update, leaving the notation
     * and the candidate details as ordinary page content.
     */
    function finishExaminerForm(buffer) {
        var pdf = pdfBinary(buffer);
        var times = fontObjectId(pdf, "Times-Roman");
        var timesBold = fontObjectId(pdf, "Times-Bold");
        var commentsId = fieldObjectId(pdf, "Comments");
        var markId = fieldObjectId(pdf, "Mark");
        var formId = acroFormObjectId(pdf);
        var startxref = pdf.match(/startxref\n(\d+)\n%%EOF\s*$/);
        if (!times || !timesBold || !commentsId || !markId || !formId || !startxref) return new Blob([buffer], { type: "application/pdf" });

        function withEntry(id, entry) {
            var body = objectBody(pdf, id);
            if (!body) throw new Error("The form field could not be finished.");
            var point = body.indexOf("\n/Length ");
            if (point < 0) point = body.lastIndexOf(">>");
            return body.slice(0, point) + "\n" + entry + body.slice(point);
        }

        var comments = withEntry(commentsId, "/DA (/Times-Roman 11 Tf 0.110 0.141 0.188 rg)");
        var mark = withEntry(markId, "/DA (/Times-Bold 12 Tf 0 0.129 0.278 rg)");
        var form = withEntry(formId,
            "/DR << /Font << /Times-Roman " + times + " 0 R /Times-Bold " + timesBold + " 0 R >> >>\n/NeedAppearances true");

        var root = pdf.match(/\/Root (\d+) 0 R/);
        var info = pdf.match(/\/Info (\d+) 0 R/g);
        var sizes = pdf.match(/\/Size (\d+)/g);
        var size = sizes ? sizes[sizes.length - 1].match(/(\d+)/) : null;
        info = info ? info[info.length - 1].match(/(\d+)/) : null;
        var prev = startxref[1];
        var addition = "\n" + comments + "\n" + mark + "\n" + form + "\n";
        var xrefAt = pdf.length + addition.length;
        var offsets = {};
        offsets[commentsId] = pdf.length + 1;
        offsets[markId] = offsets[commentsId] + comments.length + 1;
        offsets[formId] = offsets[markId] + mark.length + 1;
        var ids = [commentsId, markId, formId].map(Number).sort(function (a, b) { return a - b; });
        var xref = "xref\n";
        ids.forEach(function (id) {
            xref += id + " 1\n" + String(offsets[String(id)]).padStart(10, "0") + " 00000 n \n";
        });
        var trailer = "trailer\n<< /Size " + size[1] + " /Root " + root[1] + " 0 R /Prev " + prev;
        if (info) trailer += " /Info " + info[1] + " 0 R";
        trailer += " >>\nstartxref\n" + xrefAt + "\n%%EOF\n";
        return new Blob([pdfBytes(pdf + addition + xref + trailer)], { type: "application/pdf" });
    }

    function saveBlob(blob, name) {
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    window.CeqPdf = {
        buildBlob: buildBlob,
        download: function (current) {
            return buildBlob(current).then(function (blob) {
                saveBlob(blob, fileName(current.instrument.name, current.passage.n));
                return blob;
            });
        }
    };
}());
