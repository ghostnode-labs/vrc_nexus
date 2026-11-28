#!/usr/bin/env python3
"""Erzeugt die Symbole des Plugins „VRC Nexus 🔞“ (eigene, schlichte Vektorformen im Nexus-Stil – bewusst neutral, keine expliziten Motive).
Aufruf:  python3 streamdeck-adult/tools/make-icons.py
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'de.ghostnode.vrcnexus.adult.sdPlugin', 'imgs')
CYAN, GOLD, BG, WHITE, GREEN, RED, ROSE, AMBER = (56, 213, 230), (243, 194, 98), (12, 8, 18), (226, 232, 240), (80, 250, 123), (255, 85, 85), (255, 92, 158), (255, 184, 76)


def canvas(n, key):
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if key:  # Tastenhintergrund wie beim ersten Plugin, aber mit rosa Kante (gleiche Familie, sofort unterscheidbar)
        c = n * 0.12
        d.polygon([(0, 0), (n - c, 0), (n, c), (n, n), (0, n)], fill=BG + (255,))
        d.line([(n * 0.06, n * 0.94), (n * 0.94, n * 0.94)], fill=ROSE + (110,), width=max(1, n // 48))
    return im, d


def draw(name, d, n, on=False):
    s = n / 100.0
    P = lambda *pts: [(x * s, y * s) for x, y in pts]
    w = max(2, int(7 * s))
    col = GOLD if on else ROSE
    if name == 'panic':
        d.regular_polygon((50 * s, 50 * s, 38 * s), 8, rotation=22.5, fill=RED)
        d.rounded_rectangle(P((45, 26), (55, 58)), radius=3 * s, fill=WHITE)
        d.ellipse(P((45, 64), (55, 74)), fill=WHITE)
    elif name == 'stop':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        d.rounded_rectangle(P((34, 34), (66, 66)), radius=5 * s, fill=WHITE)
    elif name == 'safeword':
        d.ellipse(P((14, 14), (86, 86)), outline=GOLD, width=w)
        d.rounded_rectangle(P((28, 44), (72, 56)), radius=5 * s, fill=GOLD)
    elif name == 'consent':
        d.rounded_rectangle(P((32, 8), (68, 92)), radius=14 * s, outline=WHITE, width=max(2, w - 2))
        for y, c in ((24, RED), (50, AMBER), (76, GREEN)):
            d.ellipse(P((40, y - 9), (60, y + 9)), fill=c)
    elif name == 'level':
        for i, h in enumerate((22, 38, 54, 70)):
            d.rounded_rectangle(P((14 + i * 19, 84 - h), (28 + i * 19, 84)), radius=3 * s, fill=col if i < 3 else WHITE)
    elif name == 'dial':
        d.arc(P((14, 14), (86, 86)), 135, 405, fill=WHITE, width=w)
        d.arc(P((14, 14), (86, 86)), 135, 300, fill=col, width=w)
        d.ellipse(P((42, 42), (58, 58)), fill=col)
    elif name == 'pattern':
        pts = [(10 + i * 2.5, 50 + (22 if (i // 4) % 2 else -22) * (1 - abs((i % 4) - 2) / 2)) for i in range(33)]
        d.line(P(*pts), fill=col, width=w, joint='curve')
        if on:
            d.ellipse(P((76, 10), (92, 26)), fill=GREEN)
    elif name == 'surprise':
        d.polygon(P((50, 10), (60, 40), (90, 50), (60, 60), (50, 90), (40, 60), (10, 50), (40, 40)), fill=col)
        d.ellipse(P((70, 12), (84, 26)), fill=GOLD)
    elif name == 'private':
        d.rounded_rectangle(P((22, 44), (78, 86)), radius=8 * s, fill=col)
        d.arc(P((32, 16), (68, 60)), 180, 360, fill=col, width=w)
        d.line(P((32, 38), (32, 46)), fill=col, width=w)
        d.line(P((68, 38), (68, 46)) if on else P((68, 34), (68, 40)), fill=col, width=w)
        d.ellipse(P((44, 56), (56, 68)), fill=BG)
    elif name == 'follow':
        d.ellipse(P((36, 14), (64, 42)), outline=col, width=w)
        d.arc(P((22, 48), (78, 104)), 180, 360, fill=col, width=w)
        for r in (12, 22):
            d.arc(P((50 - r - 30, 60 - r), (50 + r - 30, 60 + r)), 120, 240, fill=WHITE if on else CYAN, width=max(2, w - 3))
            d.arc(P((50 - r + 30, 60 - r), (50 + r + 30, 60 + r)), 300, 60, fill=WHITE if on else CYAN, width=max(2, w - 3))
    elif name == 'scene':
        d.rounded_rectangle(P((12, 28), (88, 82)), radius=6 * s, outline=col, width=w)
        d.polygon(P((12, 28), (88, 28), (82, 14), (18, 14)), fill=col)
        d.polygon(P((42, 42), (64, 55), (42, 68)) if not on else P((40, 42), (60, 42), (60, 68), (40, 68)), fill=WHITE)
    elif name == 'fade':
        d.pieslice(P((22, 34), (78, 90)), 180, 360, fill=col)
        for i, y in enumerate((70, 78, 86)):
            d.line(P((14 + i * 6, y), (86 - i * 6, y)), fill=WHITE, width=max(2, w - 3 - i))
    elif name == 'meter':
        d.rounded_rectangle(P((38, 10), (62, 90)), radius=12 * s, outline=WHITE, width=max(2, w - 2))
        d.rounded_rectangle(P((44, 46), (56, 84)), radius=6 * s, fill=col)
        for y in (26, 38, 50, 62):
            d.line(P((66, y), (76, y)), fill=CYAN, width=max(2, w - 4))
    elif name == 'infobar':
        d.rounded_rectangle(P((8, 30), (92, 70)), radius=8 * s, outline=col, width=w)
        d.rounded_rectangle(P((16, 52), (70, 60)), radius=3 * s, fill=col)
        d.ellipse(P((76, 40), (86, 50)), fill=GREEN)
        d.line(P((16, 42), (60, 42)), fill=WHITE, width=max(2, w - 3))
    elif name == 'plugin':
        d.polygon(P((50, 8), (88, 30), (88, 70), (50, 92), (12, 70), (12, 30)), outline=ROSE, width=w)
        d.line(P((34, 66), (34, 34), (66, 66), (66, 34)), fill=GOLD, width=w + 2)
        d.ellipse(P((70, 70), (90, 90)), fill=ROSE)


def save(name, size, key, on=False, suffix=''):
    im, d = canvas(size, key)
    draw(name, d, size, on)
    im.save(os.path.join(OUT, name + suffix + '.png'))


os.makedirs(OUT, exist_ok=True)
for name in ('panic', 'stop', 'safeword', 'consent', 'level', 'dial', 'pattern', 'surprise', 'private', 'follow', 'scene', 'fade', 'meter', 'infobar'):
    save(name, 20, False, suffix='_icon')
    save(name, 40, False, suffix='_icon@2x')
    save(name, 72, True, suffix='_key')
    save(name, 144, True, suffix='_key@2x')
    if name in ('pattern', 'private', 'follow', 'scene'):
        save(name, 72, True, True, '_key_on')
        save(name, 144, True, True, '_key_on@2x')
save('plugin', 28, False, suffix='_category')
save('plugin', 56, False, suffix='_category@2x')
save('plugin', 256, True)
save('plugin', 512, True, suffix='@2x')
print('Symbole erzeugt in', os.path.abspath(OUT))
