(() => {
    "use strict";
    function pair(leftId, rightId) {
        const areas = [ document.getElementById(leftId), document.getElementById(rightId) ];
        const mirrors = areas.map(area => {
            const wrap = document.createElement("div");
            wrap.className = "diff-editor";
            area.before(wrap);
            wrap.append(area);
            const mirror = document.createElement("pre");
            mirror.className = "diff-mirror";
            mirror.setAttribute("aria-hidden", "true");
            wrap.prepend(mirror);
            area.classList.add("diff-textarea");
            return mirror;
        });
        let scheduled = false, composing = false, expected = new WeakMap;
        function paint() {
            scheduled = false;
            if (composing) return;
            const [before, after] = areas.map(a => a.value);
            const parts = after || !areas[1].readOnly ? Diff.diffChars(before, after, {
                timeout: 50
            }) : [ {
                value: before,
                removed: false
            } ];
            const changes = parts || [ {
                value: before,
                removed: true
            }, {
                value: after,
                added: true
            } ];
            mirrors.forEach((mirror, index) => {
                const fragment = document.createDocumentFragment();
                for (const part of changes) {
                    if (index === 0 ? part.added : part.removed) continue;
                    const node = document.createElement((index === 0 ? part.removed : part.added) ? "mark" : "span");
                    node.textContent = part.value;
                    fragment.append(node);
                }
                fragment.append(document.createTextNode("\n"));
                mirror.replaceChildren(fragment);
                const style = getComputedStyle(areas[index]);
                for (const prop of [ "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "tabSize", "textAlign" ]) mirror.style[prop] = style[prop];
                mirror.style.width = areas[index].clientWidth + "px";
                mirror.style.height = areas[index].clientHeight + "px";
                mirror.scrollTop = areas[index].scrollTop;
                mirror.scrollLeft = areas[index].scrollLeft;
            });
        }
        function queue() {
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(paint);
            }
        }
        areas.forEach((area, index) => {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
            Object.defineProperty(area, "value", {
                get() {
                    return descriptor.get.call(this);
                },
                set(value) {
                    descriptor.set.call(this, value);
                    queue();
                }
            });
            area.addEventListener("input", queue);
            area.addEventListener("compositionstart", () => {
                composing = true;
                area.classList.add("composing");
            });
            area.addEventListener("compositionend", () => {
                composing = false;
                area.classList.remove("composing");
                queue();
            });
            area.addEventListener("scroll", () => {
                mirrors[index].scrollTop = area.scrollTop;
                mirrors[index].scrollLeft = area.scrollLeft;
                const pending = expected.get(area);
                expected.delete(area);
                if (pending !== undefined && Math.abs(area.scrollTop - pending) < 1) return;
                const other = areas[1 - index], range = area.scrollHeight - area.clientHeight;
                const next = range > 0 ? area.scrollTop / range * (other.scrollHeight - other.clientHeight) : 0;
                expected.set(other, next);
                other.scrollTop = next;
                mirrors[1 - index].scrollTop = other.scrollTop;
            }, {
                passive: true
            });
            new ResizeObserver(queue).observe(area);
        });
        queue();
    }
    pair("input", "output");
    pair("file-before", "file-after");
})();
