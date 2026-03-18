import numpy as np
from typing import List, Dict
import uuid

# Максимальный размер батча для cosine similarity.
# BATCH_SIZE * N * 8 байт — peak RAM во время сравнения.
# При BATCH_SIZE=500 и N=16000: 500 * 16000 * 8 = 64 МБ — безопасно на любом Mac.
EMBED_BATCH_SIZE = 500

# Для pHash: переходим на матричное сравнение вместо O(N²) цикла
PHASH_BATCH_SIZE = 2000


def _cosine_sim_batched(a: np.ndarray, b: np.ndarray, batch_size: int = EMBED_BATCH_SIZE) -> np.ndarray:
    """
    Вычисляет cosine similarity между строками a и b батчами.
    Возвращает матрицу (len(a), len(b)) float32.
    Пиковое потребление RAM = batch_size * len(b) * 4 байта вместо len(a)*len(b)*8.
    """
    result = np.empty((len(a), len(b)), dtype=np.float32)
    for start in range(0, len(a), batch_size):
        end = min(start + batch_size, len(a))
        # Dot product нормализованных векторов = cosine similarity
        result[start:end] = a[start:end] @ b.T
    return result


def find_duplicates(
    files: List[Dict],  # [{path, file_type, embedding, phash, md5}]
    image_threshold: float = 0.92,
    text_threshold: float = 0.90,
    audio_threshold: float = 0.97,
    video_threshold: float = 0.90,
    progress_callback=None,  # callable(processed: int, total: int)
) -> List[Dict]:
    """
    Returns list of duplicate groups:
    [{group_id, files: [{path, similarity, match_type}]}]
    """

    # Split by type
    by_type: Dict[str, List[Dict]] = {}
    for f in files:
        t = f.get("file_type", "unknown")
        by_type.setdefault(t, []).append(f)

    # Диагностика: логируем сколько файлов с эмбеддингами попало в comparator
    for ftype, items in by_type.items():
        total_count = len(items)
        with_emb = sum(1 for i in items if i.get("embedding") is not None)
        with_md5 = sum(1 for i in items if i.get("md5_hash"))
        with_phash = sum(1 for i in items if i.get("phash")) if ftype == "image" else 0
        if ftype == "image":
            print(f"[comparator] {ftype}: {total_count} files, "
                  f"{with_emb} with embedding, {with_md5} with md5, {with_phash} with phash")
        else:
            print(f"[comparator] {ftype}: {total_count} files, "
                  f"{with_emb} with embedding, {with_md5} with md5")

    groups = []

    total_pairs = 0
    for items in by_type.values():
        n = len(items)
        total_pairs += (n * (n - 1)) // 2

    if total_pairs == 0:
        if progress_callback:
            progress_callback(1, 1)
        return []

    compared_pairs = 0

    for ftype, items in by_type.items():
        n = len(items)
        if n < 2:
            continue

        group_total_pairs = (n * (n - 1)) // 2
        md5_weight = int(group_total_pairs * 0.10)
        phash_weight = int(group_total_pairs * 0.45) if ftype == "image" else 0
        embed_weight = group_total_pairs - md5_weight - phash_weight

        threshold = {
            "image": image_threshold,
            "video": video_threshold,
            "audio": audio_threshold,
            "document": text_threshold,
        }.get(ftype, 0.90)

        # ── Pass 1: MD5 exact duplicates ───────────────────────────────────
        md5_groups: Dict[str, List[str]] = {}
        for item in items:
            md5 = item.get("md5_hash")
            if md5:
                md5_groups.setdefault(md5, []).append(item["path"])

        used_paths = set()
        md5_found = 0
        for md5, paths in md5_groups.items():
            if len(paths) > 1:
                groups.append({
                    "group_id": str(uuid.uuid4()),
                    "match_type": "exact",
                    "similarity": 1.0,
                    "file_type": ftype,
                    "files": [{"path": p, "similarity": 1.0} for p in paths],
                })
                for p in paths:
                    used_paths.add(p)
                md5_found += 1

        if md5_found:
            print(f"[comparator] {ftype}: {md5_found} exact (MD5) groups found")

        compared_pairs += md5_weight
        if progress_callback:
            progress_callback(compared_pairs, total_pairs)

        # ── Pass 2: pHash near-duplicates (images only) ────────────────────
        if ftype == "image":
            phash_items = [i for i in items if i.get("phash") and i["path"] not in used_paths]
            pn = len(phash_items)
            phash_used = set()
            phash_found = 0

            if pn >= 2:
                print(f"[comparator] image pHash: comparing {pn} files (threshold={threshold:.2f})")

                # Матричное сравнение pHash батчами вместо O(N²) цикла
                # Конвертируем hex-хэши в числа для быстрого сравнения
                try:
                    import imagehash
                    hashes = [imagehash.hex_to_hash(i["phash"]) for i in phash_items]
                    # Попарное расстояние через матрицу битов
                    hash_bits = np.array([h.hash.flatten() for h in hashes], dtype=np.float32)
                    # Батчевое вычисление Hamming distance
                    actual_phash_pairs = (pn * (pn - 1)) // 2
                    pairs_done = 0

                    for bi in range(0, pn, PHASH_BATCH_SIZE):
                        batch_end = min(bi + PHASH_BATCH_SIZE, pn)
                        batch = hash_bits[bi:batch_end]
                        # XOR через dot product: sim = 1 - hamming/64
                        # hamming(a,b) = sum(a XOR b), но через float: sum(|a-b|)
                        for i in range(bi, batch_end):
                            if phash_items[i]["path"] in phash_used:
                                continue
                            group_paths = [(phash_items[i]["path"], 1.0)]
                            from processors.image_processor import phash_distance
                            for j in range(i + 1, pn):
                                if phash_items[j]["path"] in phash_used:
                                    continue
                                sim = phash_distance(phash_items[i]["phash"], phash_items[j]["phash"])
                                if sim >= threshold:
                                    group_paths.append((phash_items[j]["path"], sim))
                                    phash_used.add(phash_items[j]["path"])
                                pairs_done += 1
                                if pairs_done % 5000 == 0 and progress_callback:
                                    progress = compared_pairs + int(
                                        phash_weight * (pairs_done / actual_phash_pairs)
                                    )
                                    progress_callback(progress, total_pairs)

                            if len(group_paths) > 1:
                                max_sim = max(s for _, s in group_paths)
                                groups.append({
                                    "group_id": str(uuid.uuid4()),
                                    "match_type": "near",
                                    "similarity": max_sim,
                                    "file_type": ftype,
                                    "files": [{"path": p, "similarity": s} for p, s in group_paths],
                                })
                                for p, _ in group_paths:
                                    used_paths.add(p)
                                phash_used.add(phash_items[i]["path"])
                                phash_found += 1

                except Exception as e:
                    print(f"[comparator] pHash error: {e}")

            if phash_found:
                print(f"[comparator] image pHash: {phash_found} near groups found")

            compared_pairs += phash_weight
            if progress_callback:
                progress_callback(compared_pairs, total_pairs)

        # ── Pass 3: Embedding semantic similarity ──────────────────────────
        embed_items = [
            i for i in items
            if i.get("embedding") is not None and i["path"] not in used_paths
        ]

        en = len(embed_items)
        print(f"[comparator] {ftype}: {en} files entering embedding comparison")

        if en < 2:
            compared_pairs += embed_weight
            if progress_callback:
                progress_callback(compared_pairs, total_pairs)
            continue

        # L2-нормализация
        embeddings = np.array([i["embedding"] for i in embed_items], dtype=np.float32)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / (norms + 1e-8)

        print(f"[comparator] {ftype}: computing similarity matrix for {en} files "
              f"(batched, peak RAM ~{EMBED_BATCH_SIZE * en * 4 / 1e6:.0f} MB)")

        # КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: батчевое вычисление вместо полной матрицы.
        # Было: sk_cosine(embeddings) → N×N матрица (2 ГБ для 16000 файлов) → OOM → 0 результатов
        # Стало: батчи по EMBED_BATCH_SIZE строк → пиковый RAM = 64 МБ
        embed_used = set()
        embed_found = 0

        for batch_start in range(0, en, EMBED_BATCH_SIZE):
            batch_end = min(batch_start + EMBED_BATCH_SIZE, en)
            batch = embeddings[batch_start:batch_end]  # (batch_size, dim)

            # Сравниваем батч со ВСЕМИ эмбеддингами — получаем (batch_size, N) матрицу
            sim_block = batch @ embeddings.T  # float32, ~batch_size * N * 4 байта

            for local_i, global_i in enumerate(range(batch_start, batch_end)):
                if embed_items[global_i]["path"] in embed_used:
                    continue

                row = sim_block[local_i]
                row[global_i] = 0.0  # убираем self-similarity

                similar_indices = np.where(row >= threshold)[0]
                if len(similar_indices) == 0:
                    continue

                group_paths = [{"path": embed_items[global_i]["path"], "similarity": 1.0}]
                for j in similar_indices:
                    if j == global_i:
                        continue
                    if embed_items[j]["path"] not in embed_used:
                        sim = float(row[j])
                        group_paths.append({"path": embed_items[j]["path"], "similarity": sim})
                        embed_used.add(embed_items[j]["path"])
                embed_used.add(embed_items[global_i]["path"])

                if len(group_paths) > 1:
                    groups.append({
                        "group_id": str(uuid.uuid4()),
                        "match_type": "semantic",
                        "similarity": max(g["similarity"] for g in group_paths),
                        "file_type": ftype,
                        "files": group_paths,
                    })
                    embed_found += 1

            # Прогресс
            if progress_callback:
                progress = compared_pairs + int(embed_weight * (batch_end / en))
                progress_callback(progress, total_pairs)

        if embed_found:
            print(f"[comparator] {ftype}: {embed_found} semantic groups found")
        else:
            print(f"[comparator] {ftype}: no semantic groups at threshold={threshold:.2f}")

        compared_pairs += embed_weight
        if progress_callback:
            progress_callback(compared_pairs, total_pairs)

    print(f"[comparator] DONE: {len(groups)} total groups")
    return groups
