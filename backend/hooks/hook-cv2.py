"""
PyInstaller hook for cv2 (opencv-python).
Removes bundled OpenSSL dylibs that conflict with Python's ssl module.
"""
import os
from PyInstaller.utils.hooks import collect_dynamic_libs

# Collect cv2 binaries but strip its bundled OpenSSL
_all_binaries = collect_dynamic_libs('cv2')
binaries = [
    (src, dst) for src, dst in _all_binaries
    if not any(x in os.path.basename(src).lower() for x in ['libssl', 'libcrypto'])
]
