"""Register HEIC/HEIF support for Pillow. Import this module before any PIL.Image.open() calls."""
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF_SUPPORTED = True
except ImportError:
    HEIF_SUPPORTED = False
