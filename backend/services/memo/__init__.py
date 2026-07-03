"""
services/memo/

Memo generation service that creates professionally formatted Word documents
from the LLM-generated memo text. Uses python-docx for document formatting.
"""

from .memo_generator import MemoGenerator

__all__ = ["MemoGenerator"]
