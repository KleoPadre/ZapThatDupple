import numpy as np
from typing import List, Dict, Tuple
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine


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
    import uuid

    # Split by type
    by_type: Dict[str, List[Dict]] = {}
    for f in files:
        t = f.get("file_type", "unknown")
        by_type.setdefault(t, []).append(f)

    groups = []
    total_files = len(files)
    compared = 0

    for ftype, items in by_type.items():
        threshold = {
            "image": image_threshold,
            "video": video_threshold,
            "audio": audio_threshold,
            "document": text_threshold,
        }.get(ftype, 0.90)

        # First pass: exact duplicates by MD5
        md5_groups: Dict[str, List[str]] = {}
        for item in items:
            md5 = item.get("md5_hash")
            if md5:
                md5_groups.setdefault(md5, []).append(item["path"])

        used_paths = set()
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

        # Image perceptual hash pass
        if ftype == "image":
            phash_items = [i for i in items if i.get("phash") and i["path"] not in used_paths]
            phash_used = set()
            for i in range(len(phash_items)):
                if phash_items[i]["path"] in phash_used:
                    continue
                group_paths = [phash_items[i]["path"]]
                for j in range(i + 1, len(phash_items)):
                    if phash_items[j]["path"] in phash_used:
                        continue
                    from processors.image_processor import phash_distance
                    sim = phash_distance(phash_items[i]["phash"], phash_items[j]["phash"])
                    if sim >= 0.85:
                        group_paths.append(phash_items[j]["path"])
                        phash_used.add(phash_items[j]["path"])
                if len(group_paths) > 1:
                    groups.append({
                        "group_id": str(uuid.uuid4()),
                        "match_type": "near",
                        "similarity": 0.90,
                        "file_type": ftype,
                        "files": [{"path": p, "similarity": 0.90} for p in group_paths],
                    })
                    for p in group_paths:
                        used_paths.add(p)
                    phash_used.add(phash_items[i]["path"])

        # Embedding similarity pass
        embed_items = [
            i for i in items
            if i.get("embedding") is not None and i["path"] not in used_paths
        ]

        if len(embed_items) < 2:
            compared += len(items)
            if progress_callback:
                progress_callback(compared, total_files)
            continue

        embeddings = np.array([i["embedding"] for i in embed_items])
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / (norms + 1e-8)

        # Compute pairwise cosine similarity in batches
        sim_matrix = sk_cosine(embeddings)
        np.fill_diagonal(sim_matrix, 0)

        embed_used = set()
        for i in range(len(embed_items)):
            if embed_items[i]["path"] in embed_used:
                continue
            similar_indices = np.where(sim_matrix[i] >= threshold)[0]
            if len(similar_indices) == 0:
                continue
            group_paths = [{"path": embed_items[i]["path"], "similarity": 1.0}]
            for j in similar_indices:
                if embed_items[j]["path"] not in embed_used:
                    sim = float(sim_matrix[i][j])
                    group_paths.append({"path": embed_items[j]["path"], "similarity": sim})
                    embed_used.add(embed_items[j]["path"])
            embed_used.add(embed_items[i]["path"])

            if len(group_paths) > 1:
                groups.append({
                    "group_id": str(uuid.uuid4()),
                    "match_type": "semantic",
                    "similarity": max(g["similarity"] for g in group_paths),
                    "file_type": ftype,
                    "files": group_paths,
                })

        compared += len(items)
        if progress_callback:
            progress_callback(compared, total_files)

    return groups
