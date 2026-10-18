"""Draws the Classmate concept device illustrations (SVG). Run: python3 tools/draw_device.py
Outputs public/assets/device-hero.svg and public/assets/device-lineup.svg."""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'assets')
FONT = "font-family=\"ui-rounded, 'SF Pro Rounded', 'Segoe UI', system-ui, sans-serif\""

TIERS = {
    'lite': dict(name='Lite', bumper='#3f86cf', dark='#2c639c', accent='#2f6fb3', soft='#e3eef9', ring=None, pill='LITE · CLOUD AI'),
    'base': dict(name='Base', bumper='#2f7d5b', dark='#235f45', accent='#2f7d5b', soft='#e2f1e9', ring=None, pill='BASE · E2B'),
    'pro': dict(name='Pro', bumper='#2a2622', dark='#141210', accent='#b9770e', soft='#fbefd9', ring='#b9770e', pill='PRO · E4B'),
}

ICONS = {  # tiny white glyphs centred on (0,0)
    'book': '<path d="M-7 -5 q3.5 -2 6.5 0 v10 q-3 -2 -6.5 0z M7 -5 q-3.5 -2 -6.5 0 v10 q3 -2 6.5 0z" fill="#fff"/>',
    'check': '<polyline points="-6,0 -2,4 6,-5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    'test': '<rect x="-5" y="-7" width="10" height="14" rx="1.5" fill="#fff"/><path d="M-2.5 -3 h5 M-2.5 0 h5 M-2.5 3 h3" stroke="#999" stroke-width="1.2"/>',
    'chart': '<rect x="-6" y="0" width="3" height="6" fill="#fff"/><rect x="-1.5" y="-4" width="3" height="10" fill="#fff"/><rect x="3" y="-7" width="3" height="13" fill="#fff"/>',
    'speaker': '<path d="M-6 -2.5 h3 l4 -3.5 v12 l-4 -3.5 h-3z" fill="#fff"/><path d="M3.5 -3 q2.5 3 0 6" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    'mic': '<rect x="-2.6" y="-7" width="5.2" height="9" rx="2.6" fill="#fff"/><path d="M-5 0 q0 5 5 5 q5 0 5 -5 M0 5 v3" stroke="#fff" stroke-width="1.5" fill="none"/>',
    'globe': '<circle r="6.5" fill="none" stroke="#fff" stroke-width="1.6"/><ellipse rx="2.6" ry="6.5" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M-6.5 0 h13" stroke="#fff" stroke-width="1.3"/>',
    'people': '<circle cx="-3" cy="-3" r="2.6" fill="#fff"/><circle cx="3.5" cy="-2" r="2.2" fill="#fff"/><path d="M-7.5 6 q4.5 -7 9 0z M0.5 6 q3 -6 7 0z" fill="#fff"/>',
}

TILES = [
    ('Read Aloud', 'Hear a child read', '#2f7d5b', 'book', False),
    ('Grade Answers', 'Photo, marks, copying', '#2a9d8f', 'check', False),
    ('Make a Test', 'From any page', '#e0a43a', 'test', False),
    ('Class Report', 'Who needs help', '#8e7dbe', 'chart', False),
    ('Read to Me', 'Any page aloud', '#e76f51', 'speaker', False),
    ('Oral Exam', 'Adaptive, spoken', '#b9770e', 'mic', True),
    ('Home Language', 'Ask in your language', '#b9770e', 'globe', True),
    ('Students', 'Class list', '#7c857f', 'people', False),
]


def front(t, pro_unlocked=None):
    """Front of the device in local coords 0..300 x 0..620."""
    T = TIERS[t]
    pro_unlocked = (t == 'pro') if pro_unlocked is None else pro_unlocked
    s = []
    s.append(f'<rect x="0" y="7" width="300" height="620" rx="54" fill="{T["dark"]}"/>')
    s.append(f'<rect x="0" y="0" width="300" height="620" rx="54" fill="{T["bumper"]}"/>')
    if T['ring']:
        s.append(f'<rect x="1.5" y="1.5" width="297" height="617" rx="52.5" fill="none" stroke="{T["ring"]}" stroke-width="3"/>')
    s.append('<rect x="80" y="-6" width="16" height="9" rx="4" fill="#111"/>')                     # headset jack
    s.append(f'<rect x="299" y="130" width="5" height="40" rx="2" fill="{T["dark"]}"/><rect x="299" y="185" width="5" height="70" rx="2" fill="{T["dark"]}"/>')
    s.append('<rect x="12" y="12" width="276" height="596" rx="44" fill="#151816"/>')
    s.append('<rect x="120" y="24" width="60" height="6" rx="3" fill="#2b302d"/><circle cx="200" cy="27" r="5" fill="#0b0f12" stroke="#2b302d" stroke-width="2"/>')
    s.append('<rect x="22" y="42" width="256" height="530" rx="26" fill="#f8f6f1"/>')
    # status bar
    s.append(f'<text x="38" y="63" font-size="11" font-weight="700" fill="#1d2621" {FONT}>9:41</text>')
    s.append(f'<rect x="96" y="52" width="92" height="15" rx="7.5" fill="{T["soft"]}"/><text x="142" y="63" font-size="8.5" font-weight="800" text-anchor="middle" fill="{T["accent"]}" {FONT}>{T["pill"]}</text>')
    s.append('<g fill="#1d2621"><rect x="226" y="60" width="3" height="4" rx="1"/><rect x="231" y="57" width="3" height="7" rx="1"/><rect x="236" y="54" width="3" height="10" rx="1"/></g>')
    s.append('<rect x="244" y="55" width="20" height="10" rx="2.5" fill="none" stroke="#1d2621" stroke-width="1.3"/><rect x="246" y="57" width="14" height="6" rx="1" fill="#1d2621"/>')
    # greeting
    s.append(f'<text x="36" y="98" font-size="15" font-weight="800" fill="#1d2621" {FONT}>Good morning, teacher</text>')
    s.append(f'<text x="36" y="114" font-size="10" fill="#69736c" {FONT}>Class 3 · 8 students</text>')
    # tiles
    for i, (title, sub, color, icon, pro) in enumerate(TILES):
        x = 36 + (i % 2) * 121
        y = 126 + (i // 2) * 100
        faded = pro and not pro_unlocked
        op = ' opacity="0.5"' if faded else ''
        fill = '#fffaf0' if pro else '#ffffff'
        stroke = '#ecd3a5' if pro else '#e2dccf'
        s.append(f'<g{op}><rect x="{x}" y="{y}" width="113" height="92" rx="12" fill="{fill}" stroke="{stroke}"/>')
        s.append(f'<g transform="translate({x + 22},{y + 24})"><circle r="12" fill="{color}"/>{ICONS[icon]}</g>')
        s.append(f'<text x="{x + 10}" y="{y + 58}" font-size="11" font-weight="800" fill="#1d2621" {FONT}>{title}</text>')
        s.append(f'<text x="{x + 10}" y="{y + 73}" font-size="8.5" fill="#69736c" {FONT}>{sub}</text>')
        if pro:
            s.append(f'<rect x="{x + 72}" y="{y + 14}" width="30" height="13" rx="4" fill="#fbe7c2"/><text x="{x + 87}" y="{y + 24}" font-size="7.5" font-weight="900" text-anchor="middle" fill="#8a5800" {FONT}>PRO</text>')
        s.append('</g>')
    s.append('<rect x="110" y="556" width="80" height="4" rx="2" fill="#cfc8ba"/>')
    # chin
    s.append('<g fill="#2f3632"><circle cx="40" cy="590" r="2.6"/><circle cx="48" cy="590" r="2.6"/><circle cx="56" cy="590" r="2.6"/></g>')
    s.append(f'<text x="262" y="593" font-size="7.5" font-weight="800" letter-spacing="2.4" text-anchor="end" fill="#3c443f" {FONT}>CLASSMATE</text>')
    return '\n'.join(s)


def back(t):
    T = TIERS[t]
    s = []
    s.append(f'<rect x="0" y="7" width="300" height="620" rx="54" fill="{T["dark"]}"/>')
    s.append(f'<rect x="0" y="0" width="300" height="620" rx="54" fill="{T["bumper"]}"/>')
    s.append('<rect x="204" y="-6" width="16" height="9" rx="4" fill="#111"/>')
    s.append(f'<rect x="-4" y="130" width="5" height="40" rx="2" fill="{T["dark"]}"/><rect x="-4" y="185" width="5" height="70" rx="2" fill="{T["dark"]}"/>')
    s.append('<rect x="298" y="250" width="7" height="38" rx="2" fill="#111"/>')                       # microSD
    s.append('<rect x="296" y="380" width="4" height="16" rx="1" fill="#9cc7b2" opacity=".8"/>')       # antenna band
    s.append('<rect x="12" y="12" width="276" height="596" rx="44" fill="#24312b"/>')
    s.append('<rect x="32" y="34" width="74" height="74" rx="18" fill="#151816"/>')
    s.append('<circle cx="58" cy="60" r="15" fill="#0b0f12" stroke="#3a4a45" stroke-width="3"/><circle cx="58" cy="60" r="6" fill="#2b4a5e"/><circle cx="55" cy="57" r="1.8" fill="#9fc3da"/>')
    s.append('<circle cx="88" cy="88" r="6" fill="#f2e7c8"/><circle cx="88" cy="50" r="2" fill="#0b0f12"/>')
    s.append(f'<g transform="translate(150,318) scale(2.4)"><circle r="12" fill="{T["bumper"]}"/>{ICONS["book"]}</g>')
    s.append(f'<text x="150" y="372" font-size="14" font-weight="800" letter-spacing="5" text-anchor="middle" fill="#9fb3a8" {FONT}>CLASSMATE</text>')
    s.append(f'<text x="150" y="392" font-size="10" letter-spacing="2" text-anchor="middle" fill="#6f8479" {FONT}>{T["name"].upper()}</text>')
    s.append('<g fill="#121815">' + ''.join(f'<circle cx="{118 + k * 8}" cy="560" r="2.2"/>' for k in range(9)) + '</g>')
    s.append(f'<text x="150" y="590" font-size="7" text-anchor="middle" fill="#5d7066" {FONT}>Gemma 4 inside · Apache 2.0</text>')
    return '\n'.join(s)


def callout(x_text, y, title, sub, tx, ty, anchor):
    lx = x_text + (8 if anchor == 'start' else -8) * -1
    line_start = (x_text - 8, y - 4) if anchor == 'start' else (x_text + 8, y - 4)
    return (f'<line x1="{line_start[0]}" y1="{line_start[1]}" x2="{tx}" y2="{ty}" stroke="#8b8473" stroke-width="1.2" stroke-dasharray="3 3"/>'
            f'<circle cx="{tx}" cy="{ty}" r="4.5" fill="#fff" stroke="#1d2621" stroke-width="2"/>'
            f'<text x="{x_text}" y="{y}" font-size="15" font-weight="800" text-anchor="{anchor}" fill="#1d2621" {FONT}>{title}</text>'
            f'<text x="{x_text}" y="{y + 18}" font-size="12.5" text-anchor="{anchor}" fill="#5b645e" {FONT}>{sub}</text>')


def hero():
    FX, FY, BX = 340, 90, 760
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 820" width="1400" height="820">',
             '<rect width="1400" height="820" fill="#f2ede3"/>',
             f'<text x="40" y="48" font-size="24" font-weight="800" fill="#1d2621" {FONT}>Classmate · concept device</text>',
             f'<text x="40" y="72" font-size="14" fill="#5b645e" {FONT}>Base shown. Lite and Pro share the same rugged body.</text>',
             f'<g transform="translate({FX},{FY})">{front("base")}</g>',
             f'<g transform="translate({BX},{FY})">{back("base")}</g>',
             f'<text x="{FX + 150}" y="755" font-size="14" font-weight="700" text-anchor="middle" fill="#69736c" {FONT}>FRONT</text>',
             f'<text x="{BX + 150}" y="755" font-size="14" font-weight="700" text-anchor="middle" fill="#69736c" {FONT}>BACK</text>']
    left = [
        (128, '3.5 mm headset jack', 'Private practice, close-talk mic', FX + 88, FY - 2),
        (262, '6.1-inch touch screen', 'Big buttons for small hands', FX + 46, FY + 150),
        (402, 'Gemma 4 on the device', 'E2B (Base) or E4B (Pro), no cloud', FX + 46, FY + 330),
        (548, 'Rubber bumper', 'Survives a fall from a desk', FX + 3, FY + 470),
        (676, 'Dual noise-cancelling mics', 'Clean recordings in a noisy class', FX + 48, FY + 590),
    ]
    right = [
        (138, 'Rear document camera + flash', 'Pages, answer sheets, blackboards', BX + 58, FY + 60),
        (300, 'microSD slot', 'Model + textbook updates, no data', BX + 302, FY + 268),
        (462, 'Data-light 4G and Wi-Fi', 'Kilobytes a week: scores, not voices', BX + 298, FY + 388),
        (582, '5,000 mAh battery', 'A full school day of grading', BX + 220, FY + 470),
        (690, 'Loudspeaker', 'Read to Me and spoken feedback', BX + 182, FY + 560),
    ]
    for y, a, b, tx, ty in left:
        parts.append(callout(300, y, a, b, tx, ty, 'end'))
    for y, a, b, tx, ty in right:
        parts.append(callout(1100, y, a, b, tx, ty, 'start'))
    parts.append(f'<text x="700" y="800" font-size="12" text-anchor="middle" fill="#8b8473" {FONT}>Concept design. Specs are targets for a mid-range Android build running in kiosk mode.</text>')
    parts.append('</svg>')
    return '\n'.join(parts)


def lineup():
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" width="1200" height="760">',
             '<rect width="1200" height="760" fill="#f2ede3"/>']
    rows = [
        ('lite', 'Gemma 4 via API', '2–3 GB RAM', 'Needs internet · daily limit', '$'),
        ('base', 'Gemma 4 E2B on device', '4–6 GB RAM', 'Works offline · no limits', '$$'),
        ('pro', 'Gemma 4 E4B on device', '8 GB RAM', 'Offline · Oral Exam · Home Language', '$$$'),
    ]
    for i, (t, model, ram, net, price) in enumerate(rows):
        cx = 200 + i * 400
        k = 0.82
        x = cx - 150 * k
        parts.append(f'<g transform="translate({x},40) scale({k})">{front(t)}</g>')
        T = TIERS[t]
        parts.append(f'<text x="{cx}" y="595" font-size="30" font-weight="800" text-anchor="middle" fill="#1d2621" {FONT}>Classmate {T["name"]}</text>')
        parts.append(f'<text x="{cx}" y="624" font-size="16" font-weight="700" text-anchor="middle" fill="{T["accent"]}" {FONT}>{model}</text>')
        parts.append(f'<text x="{cx}" y="650" font-size="14" text-anchor="middle" fill="#5b645e" {FONT}>{ram}</text>')
        parts.append(f'<text x="{cx}" y="672" font-size="14" text-anchor="middle" fill="#5b645e" {FONT}>{net}</text>')
        parts.append(f'<text x="{cx}" y="708" font-size="20" font-weight="800" text-anchor="middle" fill="#8b8473" {FONT}>{price}</text>')
    parts.append('</svg>')
    return '\n'.join(parts)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'device-hero.svg'), 'w').write(hero())
    open(os.path.join(OUT, 'device-lineup.svg'), 'w').write(lineup())
    print('wrote', OUT)
