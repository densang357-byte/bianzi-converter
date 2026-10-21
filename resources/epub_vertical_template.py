"""Load the user's default EPUB vertical template without editing any books."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROFILE = ROOT / 'templates/epub-vertical/default.json'


def apply_punctuation_presentation(body, part='', ledger=None):
    """Keep searchable source text; use upright glyphs for rotated loose marks.

    A font's horizontal baseline can put …/— on the left of a vertical line.
    FE19/FE31 are display glyphs only, never replacement source characters.
    """
    from lxml import etree as ET
    ledger = ledger if ledger is not None else []
    glyphs = {'…': '︙', '—': '︱'}
    for sp in body.iter():
        if not isinstance(sp.tag, str) or 'verbatim-vertical-punctuation' not in sp.get('class', '').split():
            continue
        old = sp.get('data-glyph', '')
        new = ''.join(glyphs.get(c, c) for c in old)
        if new != old:
            sp.set('data-glyph', new)
            ledger.append(dict(partPath=part, fieldXPath=sp.getroottree().getpath(sp) + '/@data-glyph',
                               source=old, displayGlyph=new, category='原文註直排定位呈現', sourceTextUnchanged=True))
    skip = {'script', 'style', 'pre', 'code', 'kbd', 'samp', 'svg', 'math'}
    fields = []
    for node in body.iter():
        if not isinstance(node.tag, str):
            continue
        for kind in ('text', 'tail'):
            if kind == 'tail' and node is body:
                continue
            owner = node if kind == 'text' else node.getparent()
            ancestors = [owner, *owner.iterancestors()]
            if any(ET.QName(a).localname in skip or
                   set(a.get('class', '').split()) & {'vertical-stable-punctuation',
                       'vertical-source-punctuation', 'verbatim-source-punctuation'}
                   for a in ancestors if isinstance(a.tag, str)):
                continue
            if any('horizontal-tb' in a.get('style', '') or 'vertical-cover' in a.get('class', '').split()
                   for a in ancestors):
                continue
            value = getattr(node, kind)
            if value and ('…' in value or '—' in value):
                fields.append((node, kind, value))
    for node, kind, value in fields:
        # Retain punctuation in URLs and literal network addresses as-is.
        protected = [(m.start(), m.end()) for m in re.finditer(r'(?:https?://|www\.)[^\s<>「」]+', value)]
        matches = [m for m in re.finditer('…+|—+', value)
                   if not any(a <= m.start() < b for a, b in protected)]
        if not matches:
            continue
        path = node.getroottree().getpath(node) + '/' + kind
        parent = node if kind == 'text' else node.getparent()
        insert = 0 if kind == 'text' else parent.index(node) + 1
        setattr(node, kind, value[:matches[0].start()])
        for i, m in enumerate(matches):
            ns = ET.QName(parent).namespace or 'http://www.w3.org/1999/xhtml'
            display = ''.join(glyphs[c] for c in m[0])
            sp = ET.Element('{' + ns + '}span', {'class': 'vertical-stable-punctuation', 'data-glyph': display,
                                               'style': 'inline-size:' + str(len(m[0])) + 'em'})
            ET.SubElement(sp, '{' + ns + '}span', {'class': 'vertical-source-punctuation'}).text = m[0]
            sp.tail = value[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(value)]
            parent.insert(insert + i, sp)
            ledger.append(dict(partPath=part, fieldXPath=path, offsetCodepoint=m.start(),
                               source=m[0], displayGlyph=display, category='直排定位呈現', sourceTextUnchanged=True))
    return ledger


def load_template(profile_path=None):
    path = Path(profile_path or DEFAULT_PROFILE).resolve()
    raw = path.read_bytes()
    profile = json.loads(raw)
    if profile.get('schema') != 'epub-vertical-template/v1':
        raise ValueError('Unsupported EPUB vertical template schema')
    css_path = (path.parent / profile['stylesheet']).resolve()
    css = css_path.read_bytes()
    digest = hashlib.sha256(css).hexdigest()
    if digest != profile['stylesheetSHA256']:
        raise ValueError('Template stylesheet hash mismatch; update the version and profile together')
    descriptor = dict(id=profile['id'], name=profile['name'], version=profile['version'],
                      profile=str(path), profileSHA256=hashlib.sha256(raw).hexdigest(),
                      stylesheet=str(css_path), stylesheetSHA256=digest)
    descriptor['fingerprint'] = hashlib.sha256(raw + b'\0' + css).hexdigest()
    return dict(profile=profile, stylesheet=css, descriptor=descriptor)


if __name__ == '__main__':
    print(json.dumps(load_template()['descriptor'], ensure_ascii=False, indent=2))
