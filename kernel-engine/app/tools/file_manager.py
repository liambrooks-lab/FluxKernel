import os
from pathlib import Path
from typing import List, Dict

# Define the absolute root of the repository safely
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
WORKSPACE_DIR = (BASE_DIR / "workspace").resolve()

# Ensure workspace folder structure exists
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

class SecurityException(Exception):
    pass

def _resolve_and_check_path(relative_path: str) -> Path:
    """
    Resolves the provided relative path against the WORKSPACE_DIR.
    Raises SecurityException if the path attempts to traverse outside WORKSPACE_DIR bounds.
    """
    # Remove leading slashes to prevent absolute path injection taking over
    clean_path = relative_path.lstrip("/\\")
    
    target_path = (WORKSPACE_DIR / clean_path).resolve()
    
    # Crucial security check using Path relative traversal protection
    try:
        target_path.relative_to(WORKSPACE_DIR)
    except ValueError:
        raise SecurityException(f"Path traversal blocked: '{relative_path}' attempts to access outside workspace secure bounds.")
        
    return target_path

def read_file(relative_path: str) -> str:
    target = _resolve_and_check_path(relative_path)
    if not target.is_file():
        raise FileNotFoundError(f"File not found: {relative_path}")
    return target.read_text(encoding="utf-8")

def write_file(relative_path: str, content: str) -> bool:
    target = _resolve_and_check_path(relative_path)
    # Ensure parents exist natively
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return True

def delete_file(relative_path: str) -> bool:
    target = _resolve_and_check_path(relative_path)
    if target.is_file():
        target.unlink()
        return True
    return False

def get_file_tree(dir_path: str = "") -> List[Dict]:
    target_dir = _resolve_and_check_path(dir_path)
    if not target_dir.is_dir():
        return []
    
    tree = []
    try:
        for entry in os.scandir(target_dir):
            if entry.name == ".flux_temp":
                continue # Hide temporary engine structures
                
            relative_val = Path(entry.path).relative_to(WORKSPACE_DIR).as_posix()
            node = {
                "name": entry.name,
                "path": relative_val,
                "type": "folder" if entry.is_dir(follow_symlinks=False) else "file",
                "id": relative_val
            }
            if node["type"] == "folder":
                node["children"] = get_file_tree(relative_val)
            tree.append(node)
    except Exception as e:
        pass # In a production system, log this. Otherwise, list what is available gracefully.
        
    # Sort folders first, then files
    return sorted(tree, key=lambda x: (x["type"] == "file", x["name"].lower()))