import os
import sys
import unicodedata
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scanner import scan_folders


class TestScanFolders(unittest.TestCase):

    def test_skips_inaccessible_file_without_crash(self):
        """Файл с ошибкой при stat() должен пропускаться, сканирование не падает."""
        with tempfile.TemporaryDirectory() as d:
            ok_file = os.path.join(d, "good.jpg")
            bad_file = os.path.join(d, "bad.jpg")
            open(ok_file, "w").close()
            open(bad_file, "w").close()

            original_stat = os.stat

            def mock_stat(path, **kwargs):
                if path == bad_file:
                    raise OSError("Permission denied")
                return original_stat(path, **kwargs)

            with patch("os.stat", side_effect=mock_stat):
                result = scan_folders([d])

            paths = [r["path"] for r in result]
            self.assertIn(ok_file, paths)
            self.assertNotIn(bad_file, paths)

    def test_unicode_nfd_names_are_found(self):
        """Имена файлов в NFD-кодировке (SMB) должны корректно сканироваться."""
        with tempfile.TemporaryDirectory() as d:
            nfd_name = unicodedata.normalize("NFD", "test_file.jpg")
            nfc_name = unicodedata.normalize("NFC", "test_file.jpg")
            f = os.path.join(d, nfd_name)
            open(f, "w").close()

            result = scan_folders([d])
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["name"], nfc_name)

    def test_hidden_files_are_excluded(self):
        """Скрытые файлы (начинаются с точки) должны пропускаться."""
        with tempfile.TemporaryDirectory() as d:
            hidden = os.path.join(d, ".hidden.jpg")
            visible = os.path.join(d, "visible.jpg")
            open(hidden, "w").close()
            open(visible, "w").close()

            result = scan_folders([d])
            paths = [r["path"] for r in result]
            self.assertNotIn(hidden, paths)
            self.assertIn(visible, paths)

    def test_nonexistent_folder_is_skipped(self):
        """Несуществующая папка не вызывает ошибку."""
        result = scan_folders(["/nonexistent/path/that/does/not/exist"])
        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
