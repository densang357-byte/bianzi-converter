(function(root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(require("fflate"), require("diff")); else root.BianziDocuments = factory(root.fflate, root.Diff);
})(typeof globalThis === "object" ? globalThis : this, function(zip, Diff) {
    "use strict";
    const LIMITS = {
        file: 50 * 1024 * 1024,
        text: 10 * 1024 * 1024,
        expanded: 200 * 1024 * 1024,
        entry: 32 * 1024 * 1024,
        entries: 5e3,
        characters: 5e6
    };
    const encoder = new TextEncoder;
    const blockTags = new Set("body div p section article aside nav header footer h1 h2 h3 h4 h5 h6 li ul ol dl dt dd blockquote pre figure figcaption table tr td th caption text".split(" "));
    const skipped = new Set([ "script", "style", "code", "kbd", "samp", "math" ]);
    const local = node => (node.localName || node.nodeName || "").replace(/^.*:/, "").toLowerCase();
    const elements = (node, name) => Array.from(node.getElementsByTagName("*")).filter(n => local(n) === name);
    function decode(bytes, encoding = "auto") {
        const automatic = encoding === "auto";
        let uncertain = false;
        const read = name => {
            const text = new TextDecoder(name, {
                fatal: true
            }).decode(bytes);
            if (text.includes("\0")) throw new Error("binary");
            return text;
        };
        try {
            if (automatic) {
                if (bytes[0] === 255 && bytes[1] === 254) encoding = "utf-16le"; else if (bytes[0] === 254 && bytes[1] === 255) encoding = "utf-16be"; else if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) encoding = "utf-8"; else {
                    let even = 0, odd = 0;
                    const sample = bytes.subarray(0, 4096);
                    sample.forEach((b, i) => {
                        if (b === 0) i % 2 ? odd++ : even++;
                    });
                    if (bytes.length % 2 === 0 && Math.max(even, odd) >= 2 && Math.max(even, odd) > 3 * Math.min(even, odd)) encoding = odd > even ? "utf-16le" : "utf-16be"; else {
                        try {
                            return {
                                text: read("utf-8"),
                                encoding: "utf-8",
                                automatic: automatic
                            };
                        } catch {}
                        const weights = typeof module === "object" && module.exports ? require("./encoding-data") : globalThis.BianziEncodingWeights;
                        const candidates = [];
                        for (const name of [ "gb18030", "big5" ]) try {
                            const text = read(name);
                            if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ue000-\uf8ff]/u.test(text)) continue;
                            let score = 0, count = 0;
                            for (const c of text.slice(0, 6e4)) {
                                if (/[\s\x20-\x7e]/u.test(c)) continue;
                                count++;
                                score += weights[c] ?? (/[\u3400-\u9fff]/u.test(c) ? -8 : -12);
                            }
                            candidates.push({
                                name: name,
                                text: text,
                                score: score / Math.max(1, count)
                            });
                        } catch {}
                        candidates.sort((a, b) => b.score - a.score);
                        if (!candidates.length) throw new Error("invalid");
                        const best = candidates[0];
                        uncertain = best.score < -2 || candidates[1] && best.score - candidates[1].score < 1;
                        return {
                            text: best.text,
                            encoding: best.name,
                            automatic: automatic,
                            uncertain: Boolean(uncertain)
                        };
                    }
                }
            }
            return {
                text: read(encoding),
                encoding: encoding,
                automatic: automatic,
                uncertain: uncertain
            };
        } catch {
            throw new Error("無法按此編碼讀取文字。請選擇 GB18030、Big5 或正確的 UTF 編碼再匯入。");
        }
    }
    const xhtmlEntities = {
        AElig: 198,
        Aacute: 193,
        Acirc: 194,
        Agrave: 192,
        Alpha: 913,
        Aring: 197,
        Atilde: 195,
        Auml: 196,
        Beta: 914,
        Ccedil: 199,
        Chi: 935,
        Dagger: 8225,
        Delta: 916,
        ETH: 208,
        Eacute: 201,
        Ecirc: 202,
        Egrave: 200,
        Epsilon: 917,
        Eta: 919,
        Euml: 203,
        Gamma: 915,
        Iacute: 205,
        Icirc: 206,
        Igrave: 204,
        Iota: 921,
        Iuml: 207,
        Kappa: 922,
        Lambda: 923,
        Mu: 924,
        Ntilde: 209,
        Nu: 925,
        OElig: 338,
        Oacute: 211,
        Ocirc: 212,
        Ograve: 210,
        Omega: 937,
        Omicron: 927,
        Oslash: 216,
        Otilde: 213,
        Ouml: 214,
        Phi: 934,
        Pi: 928,
        Prime: 8243,
        Psi: 936,
        Rho: 929,
        Scaron: 352,
        Sigma: 931,
        THORN: 222,
        Tau: 932,
        Theta: 920,
        Uacute: 218,
        Ucirc: 219,
        Ugrave: 217,
        Upsilon: 933,
        Uuml: 220,
        Xi: 926,
        Yacute: 221,
        Yuml: 376,
        Zeta: 918,
        aacute: 225,
        acirc: 226,
        acute: 180,
        aelig: 230,
        agrave: 224,
        alefsym: 8501,
        alpha: 945,
        amp: 38,
        and: 8743,
        ang: 8736,
        aring: 229,
        asymp: 8776,
        atilde: 227,
        auml: 228,
        bdquo: 8222,
        beta: 946,
        brvbar: 166,
        bull: 8226,
        cap: 8745,
        ccedil: 231,
        cedil: 184,
        cent: 162,
        chi: 967,
        circ: 710,
        clubs: 9827,
        cong: 8773,
        copy: 169,
        crarr: 8629,
        cup: 8746,
        curren: 164,
        dArr: 8659,
        dagger: 8224,
        darr: 8595,
        deg: 176,
        delta: 948,
        diams: 9830,
        divide: 247,
        eacute: 233,
        ecirc: 234,
        egrave: 232,
        empty: 8709,
        emsp: 8195,
        ensp: 8194,
        epsilon: 949,
        equiv: 8801,
        eta: 951,
        eth: 240,
        euml: 235,
        euro: 8364,
        exist: 8707,
        fnof: 402,
        forall: 8704,
        frac12: 189,
        frac14: 188,
        frac34: 190,
        frasl: 8260,
        gamma: 947,
        ge: 8805,
        gt: 62,
        hArr: 8660,
        harr: 8596,
        hearts: 9829,
        hellip: 8230,
        iacute: 237,
        icirc: 238,
        iexcl: 161,
        igrave: 236,
        image: 8465,
        infin: 8734,
        int: 8747,
        iota: 953,
        iquest: 191,
        isin: 8712,
        iuml: 239,
        kappa: 954,
        lArr: 8656,
        lambda: 955,
        lang: 9001,
        laquo: 171,
        larr: 8592,
        lceil: 8968,
        ldquo: 8220,
        le: 8804,
        lfloor: 8970,
        lowast: 8727,
        loz: 9674,
        lrm: 8206,
        lsaquo: 8249,
        lsquo: 8216,
        lt: 60,
        macr: 175,
        mdash: 8212,
        micro: 181,
        middot: 183,
        minus: 8722,
        mu: 956,
        nabla: 8711,
        nbsp: 160,
        ndash: 8211,
        ne: 8800,
        ni: 8715,
        not: 172,
        notin: 8713,
        nsub: 8836,
        ntilde: 241,
        nu: 957,
        oacute: 243,
        ocirc: 244,
        oelig: 339,
        ograve: 242,
        oline: 8254,
        omega: 969,
        omicron: 959,
        oplus: 8853,
        or: 8744,
        ordf: 170,
        ordm: 186,
        oslash: 248,
        otilde: 245,
        otimes: 8855,
        ouml: 246,
        para: 182,
        part: 8706,
        permil: 8240,
        perp: 8869,
        phi: 966,
        pi: 960,
        piv: 982,
        plusmn: 177,
        pound: 163,
        prime: 8242,
        prod: 8719,
        prop: 8733,
        psi: 968,
        quot: 34,
        rArr: 8658,
        radic: 8730,
        rang: 9002,
        raquo: 187,
        rarr: 8594,
        rceil: 8969,
        rdquo: 8221,
        real: 8476,
        reg: 174,
        rfloor: 8971,
        rho: 961,
        rlm: 8207,
        rsaquo: 8250,
        rsquo: 8217,
        sbquo: 8218,
        scaron: 353,
        sdot: 8901,
        sect: 167,
        shy: 173,
        sigma: 963,
        sigmaf: 962,
        sim: 8764,
        spades: 9824,
        sub: 8834,
        sube: 8838,
        sum: 8721,
        sup: 8835,
        sup1: 185,
        sup2: 178,
        sup3: 179,
        supe: 8839,
        szlig: 223,
        tau: 964,
        there4: 8756,
        theta: 952,
        thetasym: 977,
        thinsp: 8201,
        thorn: 254,
        tilde: 732,
        times: 215,
        trade: 8482,
        uArr: 8657,
        uacute: 250,
        uarr: 8593,
        ucirc: 251,
        ugrave: 249,
        uml: 168,
        upsih: 978,
        upsilon: 965,
        uuml: 252,
        weierp: 8472,
        xi: 958,
        yacute: 253,
        yen: 165,
        yuml: 255,
        zeta: 950,
        zwj: 8205,
        zwnj: 8204
    };
    function normalizeXhtmlEntities(text, label) {
        return text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|&([A-Za-z][A-Za-z0-9]*);/g, (match, name) => {
            if (!name || [ "amp", "lt", "gt", "quot", "apos" ].includes(name)) return match;
            if (!Object.hasOwn(xhtmlEntities, name)) throw new Error(label + " 含未知 XML 實體：&" + name + ";");
            return "&#" + xhtmlEntities[name] + ";";
        });
    }
    function parseXML(text, label) {
        if (/<!ENTITY\s/i.test(text)) throw new Error(label + " 含自訂 XML 實體，暫不支援。");
        text = normalizeXhtmlEntities(text, label);
        let doc;
        try {
            doc = (new DOMParser).parseFromString(text, "application/xml");
        } catch {
            throw new Error(label + " 不是有效的 XML／XHTML。");
        }
        if (!doc.documentElement || local(doc.documentElement) === "parsererror" || elements(doc, "parsererror").length) throw new Error(label + " 的 XML／XHTML 格式損壞。");
        return doc;
    }
    function xmlText(bytes) {
        return decode(bytes, bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8").text;
    }
    function resolvePath(base, href) {
        if (!href || /^(?:[a-z][\w+.-]*:|\/|\\)/i.test(href)) throw new Error("EPUB 含無法處理的資源路徑：" + href);
        let path;
        try {
            path = decodeURIComponent(href.split(/[?#]/)[0]);
        } catch {
            throw new Error("EPUB 資源路徑編碼損壞。");
        }
        const out = base.split("/").slice(0, -1);
        for (const p of path.split("/")) {
            if (!p || p === ".") continue;
            if (p === "..") {
                if (!out.length) throw new Error("EPUB 資源路徑超出書籍根目錄。");
                out.pop();
            } else if (p.includes("\\") || p.includes("\0")) throw new Error("EPUB 資源路徑無效。"); else out.push(p);
        }
        return out.join("/");
    }
    function splitText(text, max = 8e3) {
        const pieces = [];
        let start = 0;
        while (start < text.length) {
            let end = Math.min(start + max, text.length);
            if (end < text.length) {
                const slice = text.slice(start, end), found = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf("。"), slice.lastIndexOf("！"), slice.lastIndexOf("？"));
                if (found >= max / 2) end = start + found + 1;
                if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
                if (text[end - 1] === "\r" && text[end] === "\n") end--;
            }
            pieces.push({
                text: text.slice(start, end),
                start: start,
                end: end
            });
            start = end;
        }
        return pieces;
    }
    function addGroup(part, slots) {
        const source = slots.map(s => s.value).join("");
        if (!source.trim()) return;
        const spans = [];
        let pos = 0;
        for (const slot of slots) {
            spans.push({
                ...slot,
                from: pos,
                to: pos + slot.value.length
            });
            pos += slot.value.length;
        }
        for (const chunk of splitText(source)) {
            const fragments = spans.filter(s => s.from < chunk.end && s.to > chunk.start).map(s => ({
                node: s.node,
                attribute: s.attribute,
                original: s.value,
                start: Math.max(0, chunk.start - s.from),
                end: Math.min(s.value.length, chunk.end - s.from)
            }));
            part.units.push({
                before: chunk.text,
                after: null,
                fragments: fragments,
                result: null,
                session: null
            });
        }
    }
    function textGroups(part, rootNode) {
        let slots = [];
        const flush = () => {
            addGroup(part, slots);
            slots = [];
        };
        function walk(node) {
            if (node.nodeType === 4) {
                const text = node.ownerDocument.createTextNode(node.nodeValue);
                node.parentNode.replaceChild(text, node);
                node = text;
            }
            if (node.nodeType === 3) {
                slots.push({
                    node: node,
                    attribute: null,
                    value: node.nodeValue
                });
                return;
            }
            if (node.nodeType !== 1) return;
            const tag = local(node);
            if (skipped.has(tag)) {
                flush();
                return;
            }
            if (blockTags.has(tag) || tag === "br") flush();
            for (const child of Array.from(node.childNodes)) walk(child);
            if (blockTags.has(tag) || tag === "br") flush();
        }
        walk(rootNode);
        flush();
    }
    function makePart(path, bytes, kind) {
        const original = xmlText(bytes), doc = parseXML(original, path);
        const part = {
            path: path,
            label: path,
            kind: kind,
            original: original,
            doc: doc,
            units: []
        };
        if (kind === "metadata") {
            for (const name of [ "title", "creator", "contributor", "publisher", "subject", "description", "rights", "coverage" ]) for (const node of elements(doc, name).filter(n => n.namespaceURI === "http://purl.org/dc/elements/1.1/")) textGroups(part, node);
            part.label = "書名與書籍資料";
        } else if (kind === "toc") {
            for (const node of elements(doc, "text")) textGroups(part, node);
            part.label = "目錄 · " + path;
        } else if (kind === "svg") {
            for (const node of elements(doc, "text")) textGroups(part, node);
        } else {
            const titles = elements(doc, "title");
            part.label = titles[0]?.textContent?.trim() || path;
            for (const node of titles) textGroups(part, node);
            const body = elements(doc, "body")[0];
            if (!body) throw new Error(path + " 缺少 body，無法可靠處理章節。");
            textGroups(part, body);
        }
        if (kind === "content" || kind === "svg") {
            for (const node of Array.from(doc.getElementsByTagName("*"))) {
                if (skipped.has(local(node))) continue;
                for (const name of [ "title", "alt", "aria-label" ]) {
                    const value = node.getAttribute(name);
                    if (value) addGroup(part, [ {
                        node: node,
                        attribute: name,
                        value: value
                    } ]);
                }
            }
        }
        return part;
    }
    function importFile(name, bytes, encoding = "auto") {
        if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
        const ext = name.split(".").pop().toLowerCase();
        if (![ "txt", "epub" ].includes(ext)) throw new Error("目前支援 .txt 與 .epub 檔案。");
        if (bytes.length > (ext === "txt" ? LIMITS.text : LIMITS.file)) throw new Error(ext === "txt" ? "TXT 最多 10 MB。" : "EPUB 最多 50 MB。");
        if (ext === "txt") {
            const decoded = decode(bytes, encoding);
            const units = splitText(decoded.text).map(c => ({
                before: c.text,
                after: null,
                result: null,
                session: null
            }));
            return {
                name: name,
                type: "txt",
                encoding: decoded.encoding,
                encodingAutomatic: decoded.automatic,
                encodingUncertain: decoded.uncertain,
                bom: bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191,
                parts: [ {
                    path: name,
                    label: name,
                    units: units
                } ],
                characters: decoded.text.length,
                complete: false
            };
        }
        let total = 0, count = 0;
        const names = new Set;
        let entries;
        try {
            entries = zip.unzipSync(bytes, {
                filter(file) {
                    if (names.has(file.name) || file.name.startsWith("/") || file.name.includes("\\") || file.name.split("/").includes("..") || file.name.includes("\0") || [ "__proto__", "constructor", "prototype" ].includes(file.name)) throw new Error("EPUB 有重複或無效的封裝路徑。");
                    names.add(file.name);
                    total += file.originalSize;
                    count++;
                    if (file.originalSize > LIMITS.entry || total > LIMITS.expanded || count > LIMITS.entries) throw new Error("EPUB 解壓後超過限制（合計 200 MB、單項 32 MB、5000 項）。");
                    return true;
                }
            });
        } catch (error) {
            throw new Error("EPUB 讀取失敗：" + error.message);
        }
        if (!entries.mimetype || decode(entries.mimetype).text !== "application/epub+zip" || !entries["META-INF/container.xml"]) throw new Error("檔案不是有效的 EPUB：缺少 mimetype 或 container.xml。");
        if (entries["META-INF/signatures.xml"]) throw new Error("此 EPUB 含數位簽章，修改會使簽章失效；請使用未簽章的版本。");
        const container = parseXML(xmlText(entries["META-INF/container.xml"]), "container.xml");
        const roots = elements(container, "rootfile");
        if (roots.length !== 1) throw new Error("目前支援只有一套內容的 EPUB，這本書含零個或多個 rootfile。");
        const opfPath = resolvePath("", roots[0].getAttribute("full-path"));
        if (!entries[opfPath]) throw new Error("EPUB 找不到書籍資料檔：" + opfPath);
        const opf = makePart(opfPath, entries[opfPath], "metadata");
        const manifest = new Map;
        for (const item of elements(opf.doc, "item")) {
            const href = item.getAttribute("href"), type = item.getAttribute("media-type");
            if (/^[a-z][\w+.-]*:/i.test(href)) {
                if ([ "application/xhtml+xml", "text/html", "image/svg+xml" ].includes(type)) throw new Error("EPUB 使用外部章節，請先取得完整離線版本。");
                continue;
            }
            const path = resolvePath(opfPath, href);
            manifest.set(item.getAttribute("id"), {
                path: path,
                type: type
            });
        }
        if (entries["META-INF/encryption.xml"]) {
            const encryption = parseXML(xmlText(entries["META-INF/encryption.xml"]), "encryption.xml");
            const allowed = new Set([ "http://www.idpf.org/2008/embedding", "http://ns.adobe.com/pdf/enc#RC" ]);
            for (const item of elements(encryption, "encrypteddata")) {
                const algorithm = elements(item, "encryptionmethod")[0]?.getAttribute("Algorithm");
                const href = elements(item, "cipherreference")[0]?.getAttribute("URI");
                if (!allowed.has(algorithm) || !href || !/\.(otf|ttf|woff2?)$/i.test(resolvePath("", href))) throw new Error("此 EPUB 有加密內容，無法轉換。可處理的字型混淆會原樣保留。");
            }
        }
        const order = [], seen = new Set([ opfPath ]);
        for (const ref of elements(opf.doc, "itemref")) {
            const item = manifest.get(ref.getAttribute("idref"));
            if (!item) throw new Error("EPUB 章節清單引用了不存在的資源。");
            order.push(item);
        }
        order.push(...manifest.values());
        const parts = [];
        for (const item of order) {
            if (seen.has(item.path)) continue;
            seen.add(item.path);
            const kind = [ "application/xhtml+xml", "text/html" ].includes(item.type) ? "content" : item.type === "application/x-dtbncx+xml" ? "toc" : item.type === "image/svg+xml" ? "svg" : null;
            if (!kind) continue;
            if (!entries[item.path]) throw new Error("EPUB 缺少章節或目錄：" + item.path);
            const part = makePart(item.path, entries[item.path], kind);
            parts.push(part);
        }
        if (!parts.some(p => p.kind === "content")) throw new Error("EPUB 找不到可轉換的 XHTML 章節。");
        parts.push(opf);
        const characters = parts.reduce((n, p) => n + p.units.reduce((n, u) => n + u.before.length, 0), 0);
        if (characters > LIMITS.characters) throw new Error("EPUB 文字超過 500 萬字，請先分冊。");
        return {
            name: name,
            type: "epub",
            entries: entries,
            parts: parts,
            characters: characters,
            complete: false
        };
    }
    function distribute(before, after, lengths) {
        const a = Array.from(before), b = Array.from(after), output = lengths.map(() => "");
        const ends = [];
        lengths.reduce((n, len) => {
            ends.push(n + len);
            return n + len;
        }, 0);
        const owner = pos => {
            const i = ends.findIndex(end => pos < end);
            return i < 0 ? lengths.length - 1 : i;
        };
        if (a.length === b.length) {
            b.forEach((c, i) => {
                output[owner(i)] += c;
            });
            return output;
        }
        const changes = Diff.diffChars(before, after, {
            timeout: 200
        });
        if (!changes) throw new Error("此段修改過大，無法在保留行內排版時可靠對齊；請分次縮小修改。");
        let pos = 0;
        for (let i = 0; i < changes.length; i++) {
            const part = changes[i], chars = Array.from(part.value);
            if (part.removed) {
                const next = changes[i + 1];
                if (next?.added) {
                    const added = Array.from(next.value);
                    added.forEach((c, j) => {
                        output[owner(pos + Math.min(chars.length - 1, Math.floor(j * chars.length / added.length)))] += c;
                    });
                    i++;
                }
                pos += chars.length;
            } else if (part.added) {
                output[owner(Math.max(0, pos - 1))] += part.value;
            } else {
                chars.forEach((c, j) => {
                    output[owner(pos + j)] += c;
                });
                pos += chars.length;
            }
        }
        return output;
    }
    function serializePart(part, direction) {
        const updates = new Map;
        for (const unit of part.units) {
            const pieces = distribute(unit.before, unit.after ?? unit.before, unit.fragments.map(f => Array.from(f.original.slice(f.start, f.end)).length));
            unit.fragments.forEach((f, i) => {
                if (!updates.has(f.node)) updates.set(f.node, new Map);
                const attrs = updates.get(f.node);
                if (!attrs.has(f.attribute)) attrs.set(f.attribute, {
                    original: f.original,
                    fragments: []
                });
                attrs.get(f.attribute).fragments.push({
                    start: f.start,
                    end: f.end,
                    value: pieces[i]
                });
            });
        }
        for (const [node, attrs] of updates) for (const [attribute, record] of attrs) {
            let value = "", offset = 0;
            for (const fragment of record.fragments.sort((a, b) => a.start - b.start)) {
                value += record.original.slice(offset, fragment.start) + fragment.value;
                offset = fragment.end;
            }
            value += record.original.slice(offset);
            if (attribute) node.setAttribute(attribute, value); else node.nodeValue = value;
        }
        const lang = direction === "s2t" ? "zh-Hant" : "zh-Hans";
        if (direction) for (const node of Array.from(part.doc.getElementsByTagName("*"))) {
            for (const attr of [ "lang", "xml:lang" ]) if (/^zh(?:-|$)/i.test(node.getAttribute(attr) || "")) node.setAttribute(attr, lang);
            if (part.kind === "metadata" && local(node) === "language" && node.namespaceURI === "http://purl.org/dc/elements/1.1/" && /^zh(?:-|$)/i.test(node.textContent)) node.textContent = lang;
        }
        return (new XMLSerializer).serializeToString(part.doc).replace(/(<\?xml\b[^?]*encoding\s*=\s*)["'][^"']*["']/i, '$1"UTF-8"');
    }
    function exportFile(book, direction) {
        if (!book.complete) throw new Error("請先完成整份檔案轉換，再下載成品。");
        if (book.parts.some(p => p.units.some(u => typeof u.after !== "string"))) throw new Error("檔案尚有未完成的段落。");
        const suffix = direction === "s2t" ? "繁體" : direction === "t2s" ? "簡體" : "校對";
        const name = book.name.replace(/\.[^.]+$/, "") + "-" + suffix + "." + book.type;
        if (book.type === "txt") return {
            name: name,
            type: "text/plain;charset=utf-8",
            data: encoder.encode((book.bom ? "\ufeff" : "") + book.parts[0].units.map(u => u.after).join(""))
        };
        const changed = new Map(book.parts.map(p => [ p.path, encoder.encode(serializePart(p, direction)) ]));
        const entries = Object.create(null);
        entries.mimetype = [ encoder.encode("application/epub+zip"), {
            level: 0
        } ];
        for (const [path, bytes] of Object.entries(book.entries)) if (path !== "mimetype") entries[path] = changed.get(path) || bytes;
        return {
            name: name,
            type: "application/epub+zip",
            data: zip.zipSync(entries, {
                level: 1
            })
        };
    }
    return {
        LIMITS: LIMITS,
        importFile: importFile,
        exportFile: exportFile,
        decode: decode,
        splitText: splitText,
        distribute: distribute,
        resolvePath: resolvePath
    };
});
