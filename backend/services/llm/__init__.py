"""
services/llm/

LLM integration for memo generation. Currently uses Groq API with
Llama 3.3 70B for development. Production will use Claude Sonnet.
"""

from .groq_service import GroqService

__all__ = ["GroqService"]
