"""
services/checklist/

Checklist runner for automated due diligence question answering.
Each transaction type has a predefined set of legal questions that are
automatically run against the vector index to extract relevant clauses.
"""

from .checklist_service import ChecklistService

__all__ = ["ChecklistService"]
