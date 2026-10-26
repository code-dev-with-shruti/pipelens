import json
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class GeminiAPIError(RuntimeError):
    pass


def configured_model() -> str:
    load_dotenv(PROJECT_ROOT / ".env")
    model = os.getenv("MODEL")
    if not model:
        raise RuntimeError("MODEL is missing from the project-root .env file.")
    if model.startswith(("http://", "https://")):
        raise RuntimeError(
            "MODEL must be a Gemini model ID, not a URL (for example, gemini-3.5-flash-lite)."
        )
    return model


def generate_explanations(procedures: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    load_dotenv(PROJECT_ROOT / ".env")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing from the project-root .env file.")
    model = configured_model()

    from google import genai
    from google.genai import errors, types

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model=model,
            contents=json.dumps({"procedures": procedures}, ensure_ascii=True),
            config=types.GenerateContentConfig(
                system_instruction=(
                    "Write concise, factual procedure summaries and ordered steps using only "
                    "the provided parsed relationships. Lead each summary with the procedure's "
                    "business purpose and why it matters to the workflow; use procedure, table, "
                    "and called-procedure names as evidence, and do not merely list reads and writes. "
                    "If purpose is unclear, describe the supported data-flow role without inventing "
                    "business facts. Do not infer or add graph edges, risks, or SQL behavior that "
                    "is not supported by the supplied data. Return only "
                    'valid JSON with shape {"procedures":{"dbo.name":{"summary":"...",'
                    '"steps":["..."]}}}.'
                ),
                response_mime_type="application/json",
            ),
        )
    except errors.APIError as error:
        raise GeminiAPIError(
            "Gemini API request failed. Check the Google AI Studio key, model ID, quota, and network."
        ) from error

    response_text = response.text
    if not isinstance(response_text, str) or not response_text.strip():
        raise ValueError("Gemini returned an empty explanation response.")
    response_text = re.sub(r"\A```(?:json)?\s*|\s*```\Z", "", response_text.strip())
    try:
        result = json.loads(response_text)
    except json.JSONDecodeError as error:
        raise ValueError("Gemini returned invalid JSON for procedure explanations.") from error

    if not isinstance(result, dict):
        raise ValueError("Gemini returned an invalid response shape for procedure explanations.")
    explanations = result.get("procedures")
    expected_ids = {procedure["id"] for procedure in procedures}
    validate_explanations(explanations, expected_ids)
    return explanations


def validate_explanations(
    explanations: Any,
    expected_ids: set[str],
) -> None:
    if not isinstance(explanations, dict) or set(explanations) != expected_ids:
        raise ValueError("Gemini's response did not contain explanations for every procedure.")

    for procedure_id, explanation in explanations.items():
        if (
            not isinstance(explanation, dict)
            or not isinstance(explanation.get("summary"), str)
            or not explanation["summary"].strip()
            or not isinstance(explanation.get("steps"), list)
            or not explanation["steps"]
            or not all(isinstance(step, str) and step.strip() for step in explanation["steps"])
        ):
            raise ValueError(f"Gemini returned an invalid explanation for {procedure_id}.")
