"""
services/redflag/

Red flag detection for automated risk identification in due diligence.
Analyzes checklist answers and detects patterns indicating potential legal risks.
"""

from .redflag_detector import RedFlagDetector

__all__ = ["RedFlagDetector"]
