#!/usr/bin/env python3
"""8.2: Zifferblatt gegen die offizielle Watch-Face-Format-Spezifikation (XSD 1.1 aus github.com/google/watchface) prüfen
und dazu, ob alle genannten Texte (strings.xml) und Bilder (drawable-nodpi) existieren.
Aufruf: python3 validate_wff.py <Pfad zu documents/1/watchface.xsd>   (braucht das Paket „xmlschema“)"""
import os
import re
import sys

import xmlschema

here = os.path.dirname(os.path.abspath(__file__))
res = os.path.join(here, '..', 'src', 'main', 'res')
face = os.path.join(res, 'raw', 'watchface.xml')
schema = xmlschema.XMLSchema11(sys.argv[1])
errors = [str(e).splitlines()[0] + ' – ' + (re.search(r'Reason: (.*)', str(e)) or [None, ''])[1] for e in schema.iter_errors(face)]
src = open(face, encoding='utf-8').read()
strings = set(re.findall(r'<string name="([^"]+)"', open(os.path.join(res, 'values', 'strings.xml'), encoding='utf-8').read()))
for n in re.findall(r'(?:displayName|screenReaderText)="([^"]+)"', src):
    if n not in strings:
        errors.append('Text fehlt in strings.xml: ' + n)
for n in re.findall(r'(?:icon|resource)="([^"\[]+)"', src):
    if not os.path.exists(os.path.join(res, 'drawable-nodpi', n + '.png')):
        errors.append('Bild fehlt: ' + n)
for e in errors:
    print('✖', e)
print('✔ watchface.xml ist gültig (WFF 1)' if not errors else str(len(errors)) + ' Fehler')
sys.exit(1 if errors else 0)
