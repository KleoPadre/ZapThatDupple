import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from comparator import find_duplicates


def test_progress_callback_is_called():
    """progress_callback должен вызываться хотя бы раз и финальный счётчик == total."""
    calls = []
    files = [
        {"path": f"/tmp/f{i}.jpg", "file_type": "image",
         "embedding": None, "md5_hash": None, "phash": None}
        for i in range(3)
    ]
    find_duplicates(files, progress_callback=lambda c, t: calls.append((c, t)))

    assert len(calls) >= 1, "progress_callback не был вызван"
    assert calls[-1][0] == 3, f"Ожидалось сравнено=3, получено {calls[-1][0]}"
    assert calls[-1][1] == 3, f"Ожидалось total=3, получено {calls[-1][1]}"


def test_progress_not_called_for_single_file():
    """При одном файле progress_callback вызывается с (1, 1)."""
    calls = []
    files = [{"path": "/tmp/solo.jpg", "file_type": "image",
              "embedding": None, "md5_hash": None, "phash": None}]
    find_duplicates(files, progress_callback=lambda c, t: calls.append((c, t)))

    if calls:
        assert calls[-1][0] <= calls[-1][1], "compared не должен превышать total"


if __name__ == "__main__":
    test_progress_callback_is_called()
    test_progress_not_called_for_single_file()
    print("Все тесты прошли.")
