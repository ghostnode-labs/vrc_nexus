#!/usr/bin/env python3
"""Erzeugt die Symbole des Stream-Deck-Plugins (einfache Vektorformen, keine fremden Grafiken).
Aufruf:  python3 streamdeck/tools/make-icons.py
"""
import math
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'de.ghostnode.vrcnexus.sdPlugin', 'imgs')
CYAN, GOLD, BG, WHITE, GREEN, RED = (56, 213, 230), (243, 194, 98), (8, 13, 20), (226, 232, 240), (80, 250, 123), (255, 85, 85)


def canvas(n, key):
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if key:  # Tastenhintergrund: dunkel mit Rahmen und abgeschnittener Ecke
        c = n * 0.12
        d.polygon([(0, 0), (n - c, 0), (n, c), (n, n), (0, n)], fill=BG + (255,))
        d.line([(n * 0.06, n * 0.94), (n * 0.94, n * 0.94)], fill=CYAN + (90,), width=max(1, n // 48))
    return im, d


def draw(name, d, n, on=False):
    s = n / 100.0
    P = lambda *pts: [(x * s, y * s) for x, y in pts]
    w = max(2, int(7 * s))
    col = GOLD if on else CYAN
    if name == 'status':
        d.ellipse(P((22, 22), (78, 78)), outline=col, width=w)
        d.ellipse(P((36, 36), (64, 64)), fill=GREEN if on else col)
    elif name == 'chatbox':
        d.rounded_rectangle(P((14, 20), (86, 66)), radius=10 * s, outline=col, width=w)
        d.polygon(P((30, 64), (30, 84), (48, 66)), fill=col)
        for x in (34, 50, 66):
            d.ellipse(P((x - 4, 39), (x + 4, 47)), fill=col)
    elif name == 'param':
        d.rounded_rectangle(P((14, 34), (86, 66)), radius=16 * s, outline=col, width=w, fill=(col + (70,)) if on else None)
        cx = 70 if on else 30
        d.ellipse(P((cx - 13, 37), (cx + 13, 63)), fill=GOLD if on else WHITE)
    elif name == 'input':
        d.polygon(P((50, 14), (80, 46), (62, 46), (62, 70), (38, 70), (38, 46), (20, 46)), outline=col, width=w)
        d.line(P((24, 84), (76, 84)), fill=col, width=w)
    elif name == 'rotator':
        d.arc(P((18, 18), (82, 82)), 200, 500, fill=col, width=w)
        d.polygon(P((70, 10), (88, 30), (64, 34)), fill=col)
        d.line(P((50, 32), (50, 52), (64, 60)), fill=GOLD if on else WHITE, width=w)
    elif name == 'friends':
        for cx, r in ((36, 13), (64, 13)):
            d.ellipse(P((cx - r, 22), (cx + r, 22 + 2 * r)), outline=col, width=w)
        d.arc(P((12, 54), (60, 100)), 180, 360, fill=col, width=w)
        d.arc(P((40, 54), (88, 100)), 180, 360, fill=col, width=w)
    elif name == 'players':
        for cx, cy, r in ((50, 26, 12), (24, 40, 9), (76, 40, 9)):
            d.ellipse(P((cx - r, cy - r), (cx + r, cy + r)), fill=col)
        d.pieslice(P((28, 44), (72, 96)), 180, 360, fill=col)
        d.pieslice(P((8, 54), (40, 86)), 180, 360, fill=col + (150,))
        d.pieslice(P((60, 54), (92, 86)), 180, 360, fill=col + (150,))
    elif name == 'launch':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        d.polygon(P((40, 30), (72, 50), (40, 70)), fill=GOLD)
    elif name == 'rejoin':
        d.arc(P((18, 18), (82, 82)), 30, 330, fill=col, width=w)
        d.polygon(P((70, 22), (90, 34), (72, 46)), fill=col)
        d.ellipse(P((42, 42), (58, 58)), fill=GOLD)
    elif name == 'open':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        d.polygon(P((50, 22), (60, 50), (50, 78), (40, 50)), outline=col, width=max(1, w // 2))
        d.polygon(P((50, 22), (60, 50), (40, 50)), fill=GOLD)
    elif name == 'camera':
        d.rounded_rectangle(P((12, 30), (88, 80)), radius=8 * s, outline=col, width=w)
        d.polygon(P((34, 30), (40, 18), (60, 18), (66, 30)), fill=col)
        d.ellipse(P((36, 40), (64, 68)), outline=GOLD if on else WHITE, width=w)
    elif name == 'macro':
        for i, y in enumerate((24, 46, 68)):
            d.ellipse(P((14, y - 6), (26, y + 6)), fill=GOLD if on and i == 1 else col)
            d.line(P((34, y), (86, y)), fill=col, width=w)
    elif name == 'avatar':
        d.ellipse(P((32, 12), (68, 48)), outline=col, width=w)
        d.pieslice(P((16, 52), (84, 120)), 180, 360, outline=col, width=w)
        d.polygon(P((62, 60), (90, 74), (62, 88)), fill=GOLD)
    elif name == 'instance':
        d.ellipse(P((16, 16), (84, 84)), outline=col, width=w)
        d.line(P((50, 30), (50, 70)), fill=GOLD, width=w + 2)
        d.line(P((30, 50), (70, 50)), fill=GOLD, width=w + 2)
    elif name == 'friend':
        d.ellipse(P((32, 14), (68, 50)), fill=GREEN if on else None, outline=col, width=w)
        d.arc(P((14, 56), (86, 120)), 180, 360, fill=col, width=w)
    elif name == 'notifs':
        d.pieslice(P((22, 16), (78, 84)), 180, 360, outline=col, width=w)
        d.rectangle(P((22, 50), (78, 70)), outline=col, width=w)
        d.ellipse(P((42, 72), (58, 88)), fill=col)
        if on:
            d.ellipse(P((62, 8), (90, 36)), fill=RED)
    elif name == 'overlay':
        d.rounded_rectangle(P((10, 30), (90, 70)), radius=14 * s, outline=col, width=w)
        d.ellipse(P((22, 40), (42, 60)), fill=GOLD if on else col)
        d.ellipse(P((58, 40), (78, 60)), fill=GOLD if on else col)
    elif name == 'speech':
        d.rounded_rectangle(P((38, 12), (62, 58)), radius=12 * s, fill=RED if on else col)
        d.arc(P((26, 30), (74, 72)), 0, 180, fill=col, width=w)
        d.line(P((50, 72), (50, 88)), fill=col, width=w)
    elif name == 'dial':
        d.ellipse(P((16, 16), (84, 84)), outline=col, width=w)
        d.line(P((50, 50), (70, 28)), fill=GOLD, width=w)
    elif name == 'media':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        if on:
            d.rectangle(P((38, 34), (46, 66)), fill=GOLD); d.rectangle(P((54, 34), (62, 66)), fill=GOLD)
        else:
            d.polygon(P((40, 32), (68, 50), (40, 68)), fill=WHITE)
    elif name == 'quicktext':
        d.rounded_rectangle(P((12, 22), (80, 66)), radius=10 * s, outline=col, width=w)
        d.polygon(P((28, 64), (28, 82), (44, 66)), fill=col)
        d.polygon(P((62, 8), (46, 44), (60, 44), (52, 74), (82, 34), (66, 34), (76, 8)), fill=GOLD)
    elif name == 'scene':
        d.rectangle(P((14, 34), (86, 82)), outline=col, width=w)
        d.polygon(P((14, 18), (84, 10), (86, 26), (16, 34)), outline=col, width=w)
        for x in (30, 50, 70):
            d.line(P((x - 6, 30), (x + 4, 14)), fill=GOLD, width=max(1, w // 2))
    elif name == 'record':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        d.ellipse(P((32, 32), (68, 68)), fill=RED if on else col)
    elif name == 'chatmods':
        for x, y in ((14, 14), (52, 14), (14, 52), (52, 52)):
            d.rounded_rectangle(P((x, y), (x + 34, y + 34)), radius=6 * s, outline=col, width=w, fill=(GOLD + (160,)) if on and (x, y) == (52, 52) else None)
    elif name == 'tts':
        d.polygon(P((14, 38), (32, 38), (54, 18), (54, 82), (32, 62), (14, 62)), fill=col)
        d.arc(P((52, 30), (76, 70)), 300, 60, fill=GOLD, width=w)
        d.arc(P((56, 18), (92, 82)), 300, 60, fill=GOLD, width=w)
    elif name == 'info':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        d.ellipse(P((45, 24), (55, 34)), fill=GOLD)
        d.line(P((50, 44), (50, 74)), fill=GOLD, width=w + 2)
    elif name == 'heart':
        d.polygon(P((50, 84), (16, 50), (14, 34), (22, 20), (36, 16), (50, 28), (64, 16), (78, 20), (86, 34), (84, 50)), fill=RED if not on else GOLD)
        d.line(P((22, 50), (38, 50), (44, 38), (52, 62), (58, 50), (78, 50)), fill=WHITE, width=max(2, w - 2))
    elif name == 'sleep':
        d.ellipse(P((18, 18), (78, 78)), fill=col)
        d.ellipse(P((34, 10), (92, 66)), fill=BG + (255,))
        for x, y, r in ((70, 70, 4), (82, 52, 3)):
            d.ellipse(P((x - r, y - r), (x + r, y + r)), fill=GOLD)
    elif name == 'avpreset':
        d.polygon(P((30, 16), (42, 24), (58, 24), (70, 16), (88, 30), (78, 44), (70, 40), (70, 86), (30, 86), (30, 40), (22, 44), (12, 30)), outline=col, width=w)
        d.ellipse(P((44, 50), (56, 62)), fill=GOLD)
    elif name == 'warn':
        d.polygon(P((50, 12), (90, 84), (10, 84)), outline=RED if on else col, width=w, fill=(RED + (90,)) if on else None)
        d.line(P((50, 36), (50, 62)), fill=RED if on else GOLD, width=w + 1)
        d.ellipse(P((46, 68), (54, 76)), fill=RED if on else GOLD)
    elif name == 'watchfind':
        d.rounded_rectangle(P((32, 8), (68, 22)), radius=3 * s, fill=col)
        d.rounded_rectangle(P((32, 78), (68, 92)), radius=3 * s, fill=col)
        d.ellipse(P((24, 22), (76, 78)), outline=col, width=w)
        d.line(P((50, 34), (50, 50), (60, 58)), fill=GOLD, width=w)
        for x in (12, 88):
            d.arc(P((x - 10, 36), (x + 10, 64)), 300 if x > 50 else 120, 60 if x > 50 else 240, fill=GOLD, width=max(2, w - 3))
    elif name == 'multi':
        for i, y in enumerate((22, 46, 70)):
            d.rounded_rectangle(P((16, y - 9), (84, y + 9)), radius=4 * s, outline=col, width=max(2, w - 2), fill=(GOLD + (60,)) if i == 1 else None)
            d.polygon(P((24, y - 5), (32, y), (24, y + 5)), fill=GOLD)
    elif name == 'worldkey':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        d.arc(P((32, 14), (68, 86)), 90, 270, fill=col, width=max(2, w - 2)); d.arc(P((32, 14), (68, 86)), 270, 90, fill=col, width=max(2, w - 2))
        d.line(P((14, 50), (86, 50)), fill=col, width=max(2, w - 2))
        d.ellipse(P((58, 58), (90, 90)), fill=GOLD)
    elif name == 'auto':
        d.ellipse(P((14, 14), (86, 86)), outline=col, width=w)
        d.polygon(P((56, 12), (30, 54), (50, 54), (42, 88), (72, 42), (52, 42), (62, 12)), fill=GOLD if not on else CYAN)
    elif name == 'plugin':
        d.polygon(P((50, 8), (88, 30), (88, 70), (50, 92), (12, 70), (12, 30)), outline=CYAN, width=w)
        d.line(P((34, 66), (34, 34), (66, 66), (66, 34)), fill=GOLD, width=w + 2)


def save(name, size, key, on=False, suffix=''):
    im, d = canvas(size, key)
    draw(name, d, size, on)
    im.save(os.path.join(OUT, name + suffix + '.png'))


os.makedirs(OUT, exist_ok=True)
for name in ('status', 'chatbox', 'param', 'input', 'rotator', 'friends', 'players', 'launch', 'rejoin', 'open', 'camera', 'macro', 'avatar', 'friend', 'notifs', 'overlay', 'speech', 'dial',
             'media', 'quicktext', 'scene', 'record', 'chatmods', 'tts', 'info', 'instance', 'heart', 'sleep', 'avpreset', 'warn', 'watchfind', 'auto', 'multi', 'worldkey'):
    save(name, 20, False, suffix='_icon')
    save(name, 40, False, suffix='_icon@2x')
    save(name, 72, True, suffix='_key')
    save(name, 144, True, suffix='_key@2x')
    if name in ('param', 'rotator', 'status', 'camera', 'macro', 'friend', 'notifs', 'overlay', 'speech', 'media', 'record', 'chatmods', 'sleep', 'warn', 'auto'):
        save(name, 72, True, True, '_key_on')
        save(name, 144, True, True, '_key_on@2x')
save('plugin', 28, False, suffix='_category')
save('plugin', 56, False, suffix='_category@2x')
save('plugin', 256, True)
save('plugin', 512, True, suffix='@2x')
print('Symbole erzeugt in', os.path.abspath(OUT))
