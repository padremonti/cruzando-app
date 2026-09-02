#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CruzAndo — redimensionar los Marianos
═════════════════════════════════════════════════════════════════════════

Los doce `mariano_*.webp` están a 1536x2048 (dos de ellos 2048x2048) y pesan
1,8 MB entre todos, pero en la app NUNCA se pintan a más de 320 px de ancho:

    #mariano-slide-img   182 px   (el aviso de metros, el que parpadeaba)
    #ob-*-mariano        260 px   (onboarding de audio, libro y rezar)
    #ob-mariano-img      280 px
    #ob-bloque1-mariano  320 px   (celebración de bloque)

Se descargan imágenes de dos megapíxeles para dibujarlas del tamaño de un
pulgar. Eso es lo que hace que el aviso de metros entre con la caja vacía y
la imagen aparezca de golpe: cada Mariano es una petición de ~150 KB que
llega DESPUÉS de que la animación haya arrancado.

⚠️ NO bajar a 182 px. Los teléfonos tienen 2x o 3x píxeles físicos, así que
   una imagen de 182 se vería ampliada y blanda en todos ellos. Y el mismo
   archivo se reutiliza a 320 px en la celebración.

   ancho 960  → 3x del uso mayor (320). Nadie lo ve blando. ~700 KB los doce.
   ancho 640  → 3x del aviso de metros, 2x de la celebración. ~450 KB.

⚠️ La salida va FUERA de C:\\R2 a propósito. `rclone sync` espeja la carpeta,
   así que una carpeta de trabajo ahí dentro se subiría al bucket. Se revisa
   el resultado y solo entonces se reemplaza con --reemplazar, que además
   respalda los originales (también fuera de C:\\R2).

Uso
───
    python tools/mariano-resize.py                    # 960 px, a una carpeta nueva
    python tools/mariano-resize.py --ancho 640
    python tools/mariano-resize.py --ancho 960 --reemplazar

Después de reemplazar: correr tools/cruzando-sync-real.bat para subirlos.

Requiere Pillow:  pip install Pillow
"""

import argparse
import os
import shutil
import sys
import time

try:
    from PIL import Image
except ImportError:
    sys.exit('Falta Pillow. Instalar con:  pip install Pillow')

ORIGEN_POR_DEFECTO = r'C:\R2\cruzando-ilustraciones'
# Fuera del arbol que rclone sincroniza: ver el aviso de la cabecera.
DESTINO_BASE       = os.path.join(os.path.expanduser('~'), 'Desktop')
ANCHO_POR_DEFECTO  = 960
CALIDAD            = 82           # webp con alfa; por encima de 85 solo pesa mas


def kb(n):
    return '%.0f KB' % (n / 1024.0)


def marianos(origen):
    """Los mariano_*.webp de la carpeta, en orden natural."""
    if not os.path.isdir(origen):
        sys.exit('No existe la carpeta de origen: ' + origen)
    fs = [f for f in os.listdir(origen)
          if f.lower().startswith('mariano') and f.lower().endswith('.webp')]
    return sorted(fs)


def redimensionar(origen, destino, ancho, calidad):
    os.makedirs(destino, exist_ok=True)
    fs = marianos(origen)
    if not fs:
        sys.exit('No encontre ningun mariano_*.webp en ' + origen)

    print('\norigen : %s' % origen)
    print('destino: %s' % destino)
    print('ancho  : %d px   (calidad webp %d, alfa conservado)\n' % (ancho, calidad))
    print('%-22s %-12s %-12s %9s %9s' % ('archivo', 'antes', 'despues', 'antes', 'despues'))
    print('-' * 70)

    antes_tot = despues_tot = 0
    hechos = []
    for f in fs:
        po = os.path.join(origen, f)
        pd = os.path.join(destino, f)
        im = Image.open(po)
        # Alfa siempre: los doce lo llevan y aplanarlos les pondria un fondo.
        if im.mode != 'RGBA':
            im = im.convert('RGBA')

        if im.width <= ancho:
            # No se amplia nunca: agrandar no anade detalle, solo peso.
            shutil.copy2(po, pd)
            alto = im.height
            nota = '  (ya era menor, copiada tal cual)'
        else:
            alto = int(round(im.height * ancho / float(im.width)))
            # Cada uno conserva SU proporcion: 08 y 10 son cuadrados, el resto 3:4.
            im.resize((ancho, alto), Image.LANCZOS).save(
                pd, 'WEBP', quality=calidad, method=6)
            nota = ''

        a, d = os.path.getsize(po), os.path.getsize(pd)
        antes_tot += a
        despues_tot += d
        hechos.append(f)
        print('%-22s %-12s %-12s %9s %9s%s' % (
            f, '%dx%d' % (im.width, im.height),
            '%dx%d' % (min(ancho, im.width), alto), kb(a), kb(d), nota))

    print('-' * 70)
    ahorro = 100 - (100.0 * despues_tot / antes_tot) if antes_tot else 0
    print('%-22s %-12s %-12s %9s %9s   (%.0f%% menos)\n' % (
        'TOTAL (%d)' % len(hechos), '', '', kb(antes_tot), kb(despues_tot), ahorro))
    return hechos


def reemplazar(origen, destino, hechos):
    """Copia el resultado sobre los originales, con respaldo fuera de C:\\R2."""
    sello   = time.strftime('%Y-%m-%d_%H%M')
    respald = os.path.join(DESTINO_BASE, 'respaldo-marianos-' + sello)
    os.makedirs(respald, exist_ok=True)
    for f in hechos:
        shutil.copy2(os.path.join(origen, f), os.path.join(respald, f))
    for f in hechos:
        shutil.copy2(os.path.join(destino, f), os.path.join(origen, f))
    print('respaldo de los originales -> %s' % respald)
    print('reemplazados %d archivos en %s' % (len(hechos), origen))
    print('\nSiguiente paso: correr tools/cruzando-sync-real.bat para subirlos.\n')


def main():
    p = argparse.ArgumentParser(description='Redimensiona los Marianos de CruzAndo.')
    p.add_argument('--ancho', type=int, default=ANCHO_POR_DEFECTO,
                   help='ancho de salida en px (por defecto %d)' % ANCHO_POR_DEFECTO)
    p.add_argument('--calidad', type=int, default=CALIDAD,
                   help='calidad webp 1-100 (por defecto %d)' % CALIDAD)
    p.add_argument('--origen', default=ORIGEN_POR_DEFECTO)
    p.add_argument('--salida', default=None,
                   help='carpeta de salida (por defecto ~/Desktop/marianos-<ancho>)')
    p.add_argument('--reemplazar', action='store_true',
                   help='tras generar, copia sobre los originales (respaldandolos)')
    a = p.parse_args()

    if a.ancho < 320:
        print('AVISO: por debajo de 320 px la celebracion de bloque, que los pinta a')
        print('       320 px de ancho, los vera ampliados. Ver la cabecera.\n')

    destino = a.salida or os.path.join(DESTINO_BASE, 'marianos-%d' % a.ancho)
    if os.path.abspath(destino).lower().startswith(os.path.abspath(r'C:\R2').lower()):
        sys.exit('La salida no puede estar dentro de C:\\R2: rclone la subiria al bucket.')

    hechos = redimensionar(a.origen, destino, a.ancho, a.calidad)

    if a.reemplazar:
        reemplazar(a.origen, destino, hechos)
    else:
        print('Revisa el resultado y, si convence, vuelve a correrlo con --reemplazar.')
        print('(o copia la carpeta a mano sobre %s)\n' % a.origen)


if __name__ == '__main__':
    main()
