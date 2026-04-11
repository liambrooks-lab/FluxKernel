from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.tools.file_manager import (
    get_file_tree, read_file, write_file, SecurityException
)
from app.tools.code_executor import execute_python_code

router = APIRouter(prefix="/workspace", tags=["workspace"])

class FileRequest(BaseModel):
    path: str

class FileWriteRequest(BaseModel):
    path: str
    content: str
    
class CodeExecuteRequest(BaseModel):
    code: str

@router.get("/tree")
async def get_tree():
    try:
        tree = get_file_tree("")
        return {"tree": tree}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/read")
async def read_workspace_file(req: FileRequest):
    try:
        content = read_file(req.path)
        return {"path": req.path, "content": content}
    except SecurityException as e:
        raise HTTPException(status_code=403, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/write")
async def write_workspace_file(req: FileWriteRequest):
    try:
        # Represents frontend code approval (e.g. from Diff Viewer hitting 'Approve')
        success = write_file(req.path, req.content)
        return {"success": success, "path": req.path}
    except SecurityException as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute")
async def execute_workspace_code(req: CodeExecuteRequest):
    try:
        result = execute_python_code(req.code)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))