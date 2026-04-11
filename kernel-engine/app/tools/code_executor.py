import subprocess
import tempfile
import sys
from pathlib import Path
from app.tools.file_manager import WORKSPACE_DIR

def execute_python_code(code_string: str, timeout: int = 10) -> dict:
    """
    Saves the provided Python code string to a secure temporary file within the workspace 
    and executes it using a subprocess with a strict timeout.
    """
    # Use the workspace structure to store temp executions
    temp_dir = WORKSPACE_DIR / ".flux_temp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # Create temp file explicitly within the workspace directory bounds
    try:
        temp_file = tempfile.NamedTemporaryFile(
            dir=str(temp_dir), 
            suffix=".py", 
            delete=False,
            mode='w+',
            encoding='utf-8'
        )
        temp_file.write(code_string)
        temp_file.close() # Close so Windows/OS can execute it easily without locking
        
        # Execute using same Python interpreter to avoid system-level disparities
        result = subprocess.run(
            [sys.executable, temp_file.name],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(WORKSPACE_DIR) # Execute tightly in the workspace directory
        )
        
        Path(temp_file.name).unlink(missing_ok=True)
        
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
        
    except subprocess.TimeoutExpired as e:
        try:
            Path(temp_file.name).unlink(missing_ok=True)
        except Exception:
            pass
        return {
            "success": False,
            "stdout": e.stdout.decode('utf-8') if e.stdout else "",
            "stderr": f"Execution halted: Time limit exceeded ({timeout}s strict timeout).",
            "exit_code": 124 # standard timeout exit code
        }
    except Exception as e:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(e),
            "exit_code": 1
        }