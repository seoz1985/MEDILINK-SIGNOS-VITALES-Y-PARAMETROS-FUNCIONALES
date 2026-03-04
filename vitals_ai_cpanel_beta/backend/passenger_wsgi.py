"""WSGI entrypoint para cPanel/Passenger.

- Este archivo debe quedar en el Application Root de tu app Python.
- En 'Setup Python App' usa:
  - Application startup file: passenger_wsgi.py
  - Application Entry point: application
"""

import os
import sys

# Ajusta el path al venv que cPanel crea para la app
INTERP = os.environ.get('VIRTUAL_ENV', '')
if INTERP:
    INTERP = os.path.join(INTERP, 'bin', 'python')
    if sys.executable != INTERP:
        os.execl(INTERP, INTERP, *sys.argv)

# Asegura que el root del proyecto esté en sys.path
sys.path.insert(0, os.path.dirname(__file__))

from app import app as application
