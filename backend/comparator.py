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
    
    # Calculate total pair comparisons that will be performed
    # Exact MD5 match is O(N) but we treat it as pairs for progress scale: N * (N-1) / 2
    total_pairs = 0
    for items in by_type.values():
        n = len(items)
        # Each group does MD5 passes, and then Image does Phash, and everyone does Embeddings.
        # But to keep progress simple and monotonic, we consider the total search space to be N*(N-1)//2
        # scaled slightly if there are multiple algorithms. We'll simply use N*(N-1)//2 per group
        # as the definitive "100%" pairs scale, and distribute the progress across the algorithms.
        total_pairs += (n * (n - 1)) // 2
        
    if total_pairs == 0:
        if progress_callback:
            progress_callback(1, 1)  # Signal immediate completion
        return []

    compared_pairs = 0

    for ftype, items in by_type.items():
        n = len(items)
        if n < 2:
            continue
            
        group_total_pairs = (n * (n - 1)) // 2
        
        # We will split the progress for this group among the algorithms used.
        # Images: MD5, Phash, Embeddings (~ 10%, 45%, 45%)
        # Others: MD5, Embeddings (~ 10%, 90%)
        md5_weight = int(group_total_pairs * 0.10)
        phash_weight = int(group_total_pairs * 0.45) if ftype == "image" else 0
        embed_weight = group_total_pairs - md5_weight - phash_weight

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
                    
        compared_pairs += md5_weight
        if progress_callback:
            progress_callback(compared_pairs, total_pairs)

        # Image perceptual hash pass
        if ftype == "image":
            phash_items = [i for i in items if i.get("phash") and i["path"] not in used_paths]
            pn = len(phash_items)
            phash_used = set()
            
            # The actual pairs done here is pn*(pn-1)/2
            actual_phash_pairs = (pn * (pn - 1)) // 2
            
            if actual_phash_pairs > 0:
                pairs_done_in_phash = 0
                for i in range(pn):
                    if phash_items[i]["path"] in phash_used:
                        pairs_done_in_phash += (pn - 1 - i)
                        continue
                    group_paths = [phash_items[i]["path"]]
                    for j in range(i + 1, pn):
                        if phash_items[j]["path"] in phash_used:
                            pairs_done_in_phash += 1
                            continue
                        from processors.image_processor import phash_distance
                        sim = phash_distance(phash_items[i]["phash"], phash_items[j]["phash"])
                        if sim >= 0.85:
                            group_paths.append(phash_items[j]["path"])
                            phash_used.add(phash_items[j]["path"])
                        
                        pairs_done_in_phash += 1
                        
                        # Update progress periodically (every 1000 pairs to avoid UI spam)
                        if pairs_done_in_phash % 1000 == 0:
                            current_progress = compared_pairs + int(phash_weight * (pairs_done_in_phash / actual_phash_pairs))
                            if progress_callback:
                                progress_callback(current_progress, total_pairs)
                                
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

            compared_pairs += phash_weight
            if progress_callback:
                progress_callback(compared_pairs, total_pairs)

        # Embedding similarity pass
        embed_items = [
            i for i in items
            if i.get("embedding") is not None and i["path"] not in used_paths
        ]

        en = len(embed_items)
        if en < 2:
            compared_pairs += embed_weight
            if progress_callback:
                progress_callback(compared_pairs, total_pairs)
            continue

        embeddings = np.array([i["embedding"] for i in embed_items])
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / (norms + 1e-8)

        # Compute pairwise cosine similarity in batches (fast numpy execution)
        sim_matrix = sk_cosine(embeddings)
        np.fill_diagonal(sim_matrix, 0)

        embed_used = set()
        for i in range(en):
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

        compared_pairs += embed_weight
        if progress_callback:
            progress_callback(compared_pairs, total_pairs)

    return groups
