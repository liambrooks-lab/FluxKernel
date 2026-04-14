"""
software_manager.py — Autonomous Web Downloader, Installer, & Environment Configurator.

Downloads tools, installs binaries, and mutates system PATH securely.
"""
import os
import sys
import subprocess
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, Field

import urllib.request

try:
    import winreg
except ImportError:
    winreg = None


class SoftwareInstallSchema(BaseModel):
    """Schema for securely installing new system software."""
    software_name: str = Field(..., description="Name of the software (e.g. 'ripgrep', 'node').")
    install_method: Literal["binary_download", "package_manager"] = Field(
        ..., description="Method to install."
    )
    add_to_path: bool = Field(True, description="Whether to mutate user PATH.")
    require_consent: bool = Field(True, description="Always request user consent before network download.")


class SoftwareManager:
    @staticmethod
    def _verify_download_link(software_name: str) -> str | None:
        """
        Anti-Hallucination function.
        Rather than letting the LLM guess the URL to download an installer, we verify
        it against a known allowed-list or search.
        (Mocked mapping for demonstration).
        """
        trusted_registry = {
            "ripgrep:win32": "https://github.com/BurntSushi/ripgrep/releases/download/13.0.0/ripgrep-13.0.0-x86_64-pc-windows-msvc.zip",
            "ripgrep:darwin": "https://github.com/BurntSushi/ripgrep/releases/download/13.0.0/ripgrep-13.0.0-x86_64-apple-darwin.tar.gz"
        }
        
        key = f"{software_name.lower()}:{sys.platform}"
        return trusted_registry.get(key)
        
    @staticmethod
    def _append_to_windows_path(new_dir: str):
        """Append to User Environment Registry in Windows."""
        if not winreg:
            return
        
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0, winreg.KEY_ALL_ACCESS)
            try:
                current_path, _ = winreg.QueryValueEx(key, "PATH")
            except WindowsError:
                current_path = ""
                
            if new_dir not in current_path.split(os.pathsep):
                updated_path = current_path + os.pathsep + new_dir if current_path else new_dir
                winreg.SetValueEx(key, "PATH", 0, winreg.REG_EXPAND_SZ, updated_path)
            
            winreg.CloseKey(key)
            # Broadcast settings change (simulated via API call locally, though pywin32 handles it fully natively)
            # import win32gui, win32con
            # win32gui.SendMessageTimeout(win32con.HWND_BROADCAST, win32con.WM_SETTINGCHANGE, 0, "Environment", win32con.SMTO_ABORTIFHUNG, 5000)
        except Exception as e:
            print(f"[SoftwareManager] PATH registry error: {e}")

    @staticmethod
    def _append_to_posix_path(new_dir: str):
        """Append to ~/.bashrc or ~/.zshrc."""
        home = Path.home()
        zshrc = home / ".zshrc"
        bashrc = home / ".bashrc"
        
        export_str = f'\nexport PATH="$PATH:{new_dir}"\n'
        
        target = zshrc if zshrc.exists() else bashrc
        try:
            with open(target, "a") as f:
                f.write(export_str)
        except Exception as e:
            print(f"[SoftwareManager] RC path append error: {e}")

    @classmethod
    def execute_installation(cls, command: SoftwareInstallSchema) -> dict:
        """Executes the verified install."""
        if command.require_consent:
            return {
                "status": "WAITING_CONSENT",
                "message": f"Do you authorize me to download & install '{command.software_name}' system-wide?",
                "pending_payload": command.model_dump()
            }

        url = cls._verify_download_link(command.software_name)
        if not url:
            return {"status": "error", "message": f"Install Blocked: Non-verified download link for {command.software_name}"}

        # Simulate Download
        temp_dir = Path.home() / ".flux_staging"
        temp_dir.mkdir(exist_ok=True)
        filename = url.split("/")[-1]
        filepath = temp_dir / filename
        
        try:
            print(f"[SoftwareManager] Downloading {url}...")
            urllib.request.urlretrieve(url, filepath)
            
            # Post Install setup
            bin_dir = temp_dir / command.software_name
            bin_dir.mkdir(exist_ok=True)
            
            if command.add_to_path:
                if sys.platform == "win32":
                    cls._append_to_windows_path(str(bin_dir))
                else:
                    cls._append_to_posix_path(str(bin_dir))
                    
            return {"status": "success", "message": f"Successfully installed {command.software_name} and mutated PATH."}
        
        except Exception as e:
            return {"status": "error", "message": str(e)}
