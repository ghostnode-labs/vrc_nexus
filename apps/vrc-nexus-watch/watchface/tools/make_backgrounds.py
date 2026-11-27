#!/usr/bin/env python3
"""8.2: Hintergründe für das Zifferblatt „VRC Nexus“ erzeugen (eigene Motive im Nexus-Stil, 450 × 450 px, dunkel,
damit Uhrzeit und Felder lesbar bleiben) + kleine Vorschaubilder (160 px) für die Auswahl im Zifferblatt-Editor.
Nur zum Erzeugen der PNG-Dateien (Pillow + NumPy auf dem Entwickler-PC) – die App selbst braucht nichts davon.
Aufruf: python3 apps/vrc-nexus-watch/watchface/tools/make_backgrounds.py"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 450
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'res', 'drawable-nodpi')
rng = np.random.default_rng(8202)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
cx = cy = S / 2
dist = np.hypot(xx - cx, yy - cy) / (S / 2)


def rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)


def radial(inner, outer, cyf=0.5, power=1.4):
    d = np.clip(np.hypot(xx - cx, yy - S * cyf) / (S * 0.75), 0, 1) ** power
    return rgb(inner)[None, None] * (1 - d[..., None]) + rgb(outer)[None, None] * d[..., None]


def vignette(a, k=0.55):
    v = 1 - k * np.clip(dist, 0, 1.2) ** 2.2
    return a * v[..., None]


def save(a, name):
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB')
    img.save(os.path.join(OUT, name + '.png'), optimize=True)
    img.resize((160, 160), Image.LANCZOS).save(os.path.join(OUT, name + '_icon.png'), optimize=True)


def lines_layer(draw_fn, blur=1.2):
    lay = Image.new('L', (S, S), 0)
    draw_fn(ImageDraw.Draw(lay))
    if blur:
        lay = lay.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(lay, np.float32)[..., None] / 255


# 1 Nexus: dunkles Petrol mit Waben-Raster und Leuchtkern
def hexes(d):
    r = 26
    h = r * math.sqrt(3)
    for row in range(-1, int(S / h) + 2):
        for col in range(-1, int(S / (1.5 * r)) + 2):
            x = col * 1.5 * r
            y = row * h + (h / 2 if col % 2 else 0)
            pts = [(x + r * math.cos(math.pi / 3 * k), y + r * math.sin(math.pi / 3 * k)) for k in range(7)]
            d.line(pts, fill=110, width=1)


a = radial('#0e3a44', '#03070a', 0.42)
a = a + lines_layer(hexes, 0.6) * rgb('#38d5e6')[None, None] * 0.35 * (1 - np.clip(dist, 0, 1))[..., None]
save(vignette(a), 'bg_nexus')

# 2 Gitter: Synthwave-Boden in Cyan, Horizont-Glühen
def grid(d):
    hz = S * 0.58
    for i in range(-12, 13):
        d.line([(cx + i * 14, hz), (cx + i * 120, S + 40)], fill=200, width=1)
    k = 0.0
    while True:
        y = hz + (S - hz) * (k ** 2)
        if y > S:
            break
        d.line([(0, y), (S, y)], fill=200, width=1)
        k += 0.08


a = np.zeros((S, S, 3), np.float32) + rgb('#05060d')[None, None]
glow = np.exp(-((yy - S * 0.58) / 40) ** 2)[..., None]
a = a + glow * rgb('#7a2a8c')[None, None] * 0.55
a = a + lines_layer(grid, 0.8) * rgb('#38d5e6')[None, None] * 0.55 * (yy > S * 0.58)[..., None]
save(vignette(a, 0.5), 'bg_grid')

# 3 Neon: Magenta/Violett mit diagonalen Lichtstreifen
a = radial('#3a0b4a', '#0b0310', 0.3)
streak = np.zeros((S, S), np.float32)
for off, w, k in ((-120, 14, 0.5), (-20, 6, 0.8), (90, 22, 0.35), (170, 4, 0.9)):
    streak += k * np.exp(-(((xx - yy) - off) / w) ** 2)
a = a + streak[..., None] * rgb('#ff3dcb')[None, None] * 0.35
save(vignette(a), 'bg_neon')

# 4 Ozean: tiefe Blautöne mit weichen Wellenbändern
a = radial('#0b3b5c', '#020910', 0.25)
wave = np.zeros((S, S), np.float32)
for i in range(6):
    y0 = S * (0.45 + i * 0.09)
    wave += np.exp(-((yy - y0 - 14 * np.sin(xx / 55 + i * 1.7)) / 5) ** 2) * (0.6 - i * 0.07)
a = a + wave[..., None] * rgb('#3aa0ff')[None, None] * 0.45
save(vignette(a), 'bg_ocean')

# 5 Polarlicht: dunkles Grün mit Nordlicht-Schleiern
a = radial('#123a22', '#020604', 0.2)
aur = np.zeros((S, S), np.float32)
for i, (amp, ph, k) in enumerate(((30, 0.0, 0.8), (22, 2.1, 0.55), (40, 4.0, 0.4))):
    y0 = S * (0.22 + 0.08 * i) + amp * np.sin(xx / 70 + ph)
    aur += k * np.exp(-((yy - y0) / 26) ** 2) * (0.6 + 0.4 * np.sin(xx / 17 + ph) ** 2)
a = a + aur[..., None] * rgb('#4ade80')[None, None] * 0.5
save(vignette(a), 'bg_aurora')

# 6 Sternennacht: Schwarz mit Sternen und zarter Gold-Nebel
a = np.zeros((S, S, 3), np.float32) + rgb('#03040a')[None, None]
neb = np.exp(-(((xx - S * 0.7) / 120) ** 2 + ((yy - S * 0.3) / 80) ** 2))
a = a + neb[..., None] * rgb('#f3c262')[None, None] * 0.22
neb2 = np.exp(-(((xx - S * 0.25) / 90) ** 2 + ((yy - S * 0.75) / 110) ** 2))
a = a + neb2[..., None] * rgb('#38d5e6')[None, None] * 0.14
stars = Image.new('L', (S, S), 0)
sd = ImageDraw.Draw(stars)
for _ in range(220):
    x, y = rng.uniform(0, S, 2)
    r = rng.choice([0.6, 0.8, 1.0, 1.4], p=[0.5, 0.3, 0.15, 0.05])
    sd.ellipse([x - r, y - r, x + r, y + r], fill=int(rng.uniform(90, 255)))
a = a + np.asarray(stars.filter(ImageFilter.GaussianBlur(0.4)), np.float32)[..., None] / 255 * 230
save(vignette(a, 0.4), 'bg_stars')

# Vorschau für „kein Bild“ (AMOLED-Schwarz) im Editor
icon = Image.new('RGB', (160, 160), (0, 0, 0))
ImageDraw.Draw(icon).ellipse([20, 20, 140, 140], outline=(56, 213, 230), width=3)
icon.save(os.path.join(OUT, 'bg_none_icon.png'), optimize=True)
print('fertig →', os.path.abspath(OUT))
