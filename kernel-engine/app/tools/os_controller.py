"""
os_controller.py — Deep OS Application Control for FluxKernel.

Provides tools for the LLM to control applications, type text, and evaluate the desktop
environment using visual/accessibility grounding to prevent hallucinations.
"""
from __future__ import annotations

import sys
import platform
import subprocess
import time
from typing import Literal, Optional
from pydantic import BaseModel, Field

try:
    import pyautogui
except ImportError:
    pyautogui = None

try:
    if sys.platform == "win32":
        from pywinauto import Desktop
    else:
        Desktop = None
except ImportError:
    Desktop = None


class OSCommandSchema(BaseModel):
    """Schema for requesting a deep OS action."""
    action: Literal["open_app", "click_ui_element", "type_text", "transcribe_mic", "take_screenshot"] = Field(
        ..., description="The type of OS action to perform."
    )
    app_name: Optional[str] = Field(None, description="The name of the application to interact with.")
    element_name: Optional[str] = Field(None, description="The specific UI element name/text to interact with.")
    text: Optional[str] = Field(None, description="The text to type if action is 'type_text'.")
    require_consent: bool = Field(True, description="Always request user consent before executing destructive or GUI actions.")


class OSController:
    @staticmethod
    def _get_window_bounds_win32(app_name: str, element_name: str | None = None) -> tuple[int, int] | None:
        """Grounds coordinates securely using Windows accessibility trees to avoid blind guesses."""
        if not Desktop:
            return None
        try:
            desktop = Desktop(backend="uia")
            # Try to find exactly the window we need
            window = desktop.window(title_re=f".*{app_name}.*")
            if not window.exists():
                return None
            
            if element_name:
                element = window.child_window(title_re=f".*{element_name}.*", control_type="Button")
                rect = element.rectangle()
                return rect.left + (rect.width() // 2), rect.top + (rect.height() // 2)
            else:
                rect = window.rectangle()
                return rect.left + (rect.width() // 2), rect.top + (rect.height() // 2)
        except Exception:
            return None

    @staticmethod
    def _get_window_bounds_macos(app_name: str) -> tuple[int, int] | None:
        """Grounds coordinates via AppleScript on macOS."""
        script = f'''
        tell application "System Events"
            tell process "{app_name}"
                set p to position of front window
                set s to size of front window
                return p & s
            end tell
        end tell
        '''
        try:
            res = subprocess.check_output(['osascript', '-e', script], text=True).strip()
            # Example response: x, y, width, height
            parts = [int(x.strip()) for x in res.split(',')]
            if len(parts) == 4:
                return parts[0] + (parts[2] // 2), parts[1] + (parts[3] // 2)
        except Exception:
            return None
        return None

    @classmethod
    def execute_action(cls, command: OSCommandSchema) -> dict:
        """
        Executes the validated OS command.
        
        Returns a WAITING_CONSENT context if the action requires user approval.
        """
        if command.require_consent and command.action not in ["take_screenshot"]:
            # Interceptor loop block - this tells the engine to pause
            return {
                "status": "WAITING_CONSENT",
                "message": f"Do you authorize me to perform '{command.action}' on '{command.app_name or 'System'}'?",
                "pending_payload": command.model_dump()
            }

        # Bypassed or consent granted (in a real flow, consent is managed outside, but here is execution)
        if command.action == "open_app" and command.app_name:
            if sys.platform == "win32":
                subprocess.Popen(["cmd.exe", "/c", "start", "", command.app_name], shell=True)
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-a", command.app_name])
            else:
                return {"status": "error", "message": "OS not supported for open_app natively."}
            return {"status": "success", "message": f"Opened {command.app_name}"}

        elif command.action == "click_ui_element" and command.app_name:
            # VISUAL / UI GROUNDING
            coords = None
            if sys.platform == "win32":
                coords = cls._get_window_bounds_win32(command.app_name, command.element_name)
            elif sys.platform == "darwin":
                coords = cls._get_window_bounds_macos(command.app_name)
            
            if not coords:
                return {"status": "error", "message": "Hallucination blocked: Could not resolve exact UI coordinates from accessibility tree."}
            
            if pyautogui:
                pyautogui.click(*coords)
                return {"status": "success", "message": f"Clicked element on {command.app_name}"}
            return {"status": "error", "message": "pyautogui not installed."}

        elif command.action == "type_text" and command.text:
            if pyautogui:
                pyautogui.write(command.text, interval=0.01)
                return {"status": "success", "message": f"Typed text length: {len(command.text)}"}
            return {"status": "error", "message": "pyautogui not installed."}

        elif command.action == "transcribe_mic":
            # Real transcription requires SpeechRecognition injected correctly
            return {"status": "success", "message": "Simulated local whisper transcription ready."}
        
        return {"status": "error", "message": "Unknown action or missing parameters combined with action."}
