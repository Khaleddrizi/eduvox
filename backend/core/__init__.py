"""Business logic layer.

Keep package init lightweight to avoid importing heavy ML dependencies
during web server startup.
"""

__all__ = ["quiz_logic", "pdf_utils", "embeddings_utils"]
