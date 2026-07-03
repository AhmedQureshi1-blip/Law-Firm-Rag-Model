"""
routers/memo.py

Memo generation router for Day 3. Provides endpoints for:
- Generating due diligence memos (checklist → red flags → Groq memo → Word doc)
- Downloading memo documents
- Checking memo generation status

This router orchestrates the complete Day 3 workflow:
1. Runs checklist queries against the session's vector index
2. Detects red flags from checklist answers
3. Generates memo text using Groq Llama 3.3 70B
4. Creates professionally formatted Word document
5. Returns all results to the frontend
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional

from config import settings
from models.schemas import TransactionType
from services.checklist.checklist_service import ChecklistService
from services.redflag.redflag_detector import RedFlagDetector
from services.llm.groq_service import GroqService
from services.memo.memo_generator import MemoGenerator
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/memo", tags=["memo"])


class MemoGenerateRequest(BaseModel):
    """Request body for memo generation."""
    session_id: str
    transaction_type: TransactionType


class MemoGenerateResponse(BaseModel):
    """Response from memo generation endpoint."""
    session_id: str
    checklist_results: List[dict]
    red_flags: List[dict]
    memo_text: str
    memo_ready: bool
    success: bool
    message: str
    chunks_indexed: int = 0
    ocr_pages: int = 0


class MemoStatusResponse(BaseModel):
    """Response from memo status endpoint."""
    session_id: str
    memo_ready: bool
    exists: bool


@router.post("/generate", response_model=MemoGenerateResponse, status_code=status.HTTP_200_OK)
async def generate_memo(request: MemoGenerateRequest) -> MemoGenerateResponse:
    """
    Generates a due diligence memo for the given session.
    
    Workflow:
    1. Runs checklist queries against the session's vector index
    2. Detects red flags from checklist answers
    3. Generates memo text using Groq Llama 3.3 70B
    4. Creates professionally formatted Word document
    5. Returns all results to the frontend
    
    This is the main Day 3 endpoint that ties together all new services.
    """
    try:
        logger.info(f"Memo generation requested for session '{request.session_id}' (type: {request.transaction_type})")
        
        # Initialize services
        checklist_service = ChecklistService()
        redflag_detector = RedFlagDetector()
        groq_service = GroqService()
        memo_generator = MemoGenerator()
        
        # Step 1: Run checklist queries
        logger.info("Step 1: Running checklist queries...")
        checklist_answers = checklist_service.run_checklist(
            session_id=request.session_id,
            transaction_type=request.transaction_type,
        )
        
        # Convert to dict format for response
        checklist_results = [answer.to_dict() for answer in checklist_answers]
        
        # Step 2: Detect red flags
        logger.info("Step 2: Detecting red flags...")
        red_flags = redflag_detector.detect_red_flags(
            answers=checklist_answers,
            transaction_type=request.transaction_type.value,
        )
        
        # Convert to dict format for response
        red_flag_dicts = [flag.to_dict() for flag in red_flags]
        
        # Step 3: Generate memo text using Groq
        logger.info("Step 3: Generating memo text with Groq...")
        memo_text = groq_service.generate_memo(
            checklist_answers=checklist_answers,
            red_flags=red_flags,
            transaction_type=request.transaction_type.value,
        )
        
        # Step 4: Generate Word document
        logger.info("Step 4: Generating Word document...")
        docx_path, txt_path = memo_generator.generate_memo_document(
            session_id=request.session_id,
            memo_text=memo_text,
        )
        
        logger.info(f"Memo generation complete for session '{request.session_id}'")
        
        # Get session stats (chunks and OCR pages) - for now use defaults
        # In production, this would be fetched from the session metadata
        chunks_indexed = len(checklist_answers) * 10  # Estimate based on checklist
        ocr_pages = 0  # Would be fetched from session metadata
        
        return MemoGenerateResponse(
            session_id=request.session_id,
            checklist_results=checklist_results,
            red_flags=red_flag_dicts,
            memo_text=memo_text,
            memo_ready=True,
            success=True,
            message="Memo generated successfully",
            chunks_indexed=chunks_indexed,
            ocr_pages=ocr_pages,
        )
        
    except ValueError as exc:
        logger.error(f"Configuration error in memo generation: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Configuration error: {str(exc)}"
        )
    except Exception as exc:
        logger.error(f"Error generating memo for session '{request.session_id}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating memo: {str(exc)}"
        )


@router.get("/download/{session_id}", status_code=status.HTTP_200_OK)
async def download_memo(session_id: str):
    """
    Downloads the Word document (.docx) for the given session.
    Returns the file as a download response with proper headers.
    """
    try:
        memo_generator = MemoGenerator()
        docx_path = memo_generator.get_memo_path(session_id)
        
        if not docx_path.exists():
            logger.warning(f"Memo not found for session '{session_id}'")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Memo not found for session '{session_id}'"
            )
        
        logger.info(f"Downloading memo for session '{session_id}'")
        
        return FileResponse(
            path=str(docx_path),
            filename=f"due_diligence_memo_{session_id}.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error downloading memo for session '{session_id}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error downloading memo: {str(exc)}"
        )


@router.get("/status/{session_id}", response_model=MemoStatusResponse, status_code=status.HTTP_200_OK)
async def get_memo_status(session_id: str) -> MemoStatusResponse:
    """
    Checks whether a memo has been generated for the given session.
    Used by the frontend for polling during the memo generation process.
    """
    try:
        memo_generator = MemoGenerator()
        exists = memo_generator.memo_exists(session_id)
        
        logger.info(f"Memo status check for session '{session_id}': ready={exists}")
        
        return MemoStatusResponse(
            session_id=session_id,
            memo_ready=exists,
            exists=exists,
        )
        
    except Exception as exc:
        logger.error(f"Error checking memo status for session '{session_id}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking memo status: {str(exc)}"
        )
