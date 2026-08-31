import os
import json
import logging
import base64
import io
import requests
from typing import Generator, List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# Model definitions per provider
SUPPORTED_MODELS = {
    "groq": [
        {
            "id": "groq/compound",
            "name": "Groq Compound",
            "provider": "Groq",
            "description": "Ultra-fast flagship model with advanced reasoning & tool support.",
            "recommended": True
        },
        {
            "id": "groq/compound-mini",
            "name": "Groq Compound Mini",
            "provider": "Groq",
            "description": "Blazing fast lightweight model for instant Q&A.",
            "recommended": False
        },
        {
            "id": "openai/gpt-oss-120b",
            "name": "GPT OSS 120B",
            "provider": "Groq",
            "description": "State-of-the-art 120B open model for complex logic & architecture.",
            "recommended": False
        },
        {
            "id": "openai/gpt-oss-20b",
            "name": "GPT OSS 20B",
            "provider": "Groq",
            "description": "Fast 20B reasoning powerhouse for code and analysis.",
            "recommended": False
        },
        {
            "id": "qwen/qwen3.6-27b",
            "name": "Qwen 3.6 27B",
            "provider": "Groq",
            "description": "Powerful multimodal vision and long-context model.",
            "recommended": False
        },
        {
            "id": "qwen/qwen3.8-27b",
            "name": "Qwen 3.8 27B",
            "provider": "Groq",
            "description": "Next-gen high throughput reasoning model.",
            "recommended": False
        }
    ],
    "gemini": [
        {
            "id": "gemini-3.6-flash",
            "name": "Gemini 3.6 Flash",
            "provider": "Google Gemini",
            "description": "Flagship next-gen multimodal engine with 1M+ token context.",
            "recommended": True
        },
        {
            "id": "gemini-3.7-flash",
            "name": "Gemini 3.7 Flash",
            "provider": "Google Gemini",
            "description": "Ultra-fast high-reasoning model for complex code & vision.",
            "recommended": False
        },
        {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "provider": "Google Gemini",
            "description": "High throughput lightweight multimodal performance.",
            "recommended": False
        },
        {
            "id": "gemini-2.5-pro",
            "name": "Gemini 2.5 Pro",
            "provider": "Google Gemini",
            "description": "Deep analytical reasoning and complex problem solving.",
            "recommended": False
        }
    ],
    "huggingface": [
        {
            "id": "meta-llama/Llama-3.2-3B-Instruct",
            "name": "Llama 3.2 3B Instruct",
            "provider": "Hugging Face",
            "description": "Compact, efficient instruction model.",
            "recommended": True
        },
        {
            "id": "mistralai/Mistral-7B-Instruct-v0.3",
            "name": "Mistral 7B Instruct v0.3",
            "provider": "Hugging Face",
            "description": "High performance versatile instruct model.",
            "recommended": False
        },
        {
            "id": "Qwen/Qwen2.5-72B-Instruct",
            "name": "Qwen 2.5 72B Instruct",
            "provider": "Hugging Face",
            "description": "State-of-the-art open weights model on HF Inference.",
            "recommended": False
        },
        {
            "id": "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
            "name": "DeepSeek R1 Distill Qwen 32B",
            "provider": "Hugging Face",
            "description": "Exceptional mathematical and step-by-step reasoning.",
            "recommended": False
        }
    ]
}


def get_api_key(provider: str) -> Optional[str]:
    """Retrieve the API key for a given provider from environment variables."""
    if provider == "groq":
        return os.getenv("GROQ_API_KEY", "").strip() or None
    elif provider == "gemini":
        return os.getenv("GEMINI_API_KEY", "").strip() or None
    elif provider == "huggingface":
        return (os.getenv("HUGGINGFACE_API_KEY", "").strip() or 
                os.getenv("HF_TOKEN", "").strip() or None)
    return None


def get_providers_status() -> Dict[str, Any]:
    """Check configuration status of each provider."""
    groq_key = get_api_key("groq")
    gemini_key = get_api_key("gemini")
    hf_key = get_api_key("huggingface")

    return {
        "groq": {
            "configured": bool(groq_key),
            "name": "Groq LPU",
            "models_count": len(SUPPORTED_MODELS["groq"]),
            "key_preview": f"••••{groq_key[-4:]}" if groq_key and len(groq_key) > 4 else None
        },
        "gemini": {
            "configured": bool(gemini_key),
            "name": "Google Gemini",
            "models_count": len(SUPPORTED_MODELS["gemini"]),
            "key_preview": f"••••{gemini_key[-4:]}" if gemini_key and len(gemini_key) > 4 else None
        },
        "huggingface": {
            "configured": bool(hf_key),
            "name": "Hugging Face",
            "models_count": len(SUPPORTED_MODELS["huggingface"]),
            "key_preview": f"••••{hf_key[-4:]}" if hf_key and len(hf_key) > 4 else None
        }
    }


def extract_text_from_file_data(filename: str, file_bytes: bytes) -> str:
    """Extract text from uploaded documents (PDF, TXT, CSV, JSON, MD, Code)."""
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            text_pages = []
            for i, page in enumerate(reader.pages):
                extracted = page.extract_text()
                if extracted:
                    text_pages.append(f"--- Page {i+1} ---\n{extracted}")
            return "\n\n".join(text_pages) if text_pages else "*(Empty or scanned PDF)*"
        except Exception as e:
            return f"*(Failed to parse PDF: {str(e)})*"
            
    # Plain text / code formats
    try:
        return file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return file_bytes.decode("latin-1")
        except Exception:
            return "*(Binary file content could not be decoded as text)*"


def format_groq_messages(messages: List[Dict[str, Any]], model: str) -> List[Dict[str, Any]]:
    """Format messages for Groq including multimodal image content if present."""
    formatted = []
    is_vision_model = "vision" in model.lower()

    for msg in messages:
        role = msg.get("role")
        content = msg.get("content", "")
        images = msg.get("images", [])

        if role == "user" and images and is_vision_model:
            content_parts = [{"type": "text", "text": content}]
            for img in images:
                # Expecting data:image/png;base64,...
                content_parts.append({
                    "type": "image_url",
                    "image_url": {"url": img}
                })
            formatted.append({"role": role, "content": content_parts})
        else:
            formatted.append({"role": role, "content": str(content)})

    return formatted


def stream_groq(messages: List[Dict[str, Any]], model: str, api_key: str, temperature: float = 0.7, is_retry: bool = False) -> Generator[str, None, None]:
    """Stream chat completions using Groq SDK or REST API with auto-fallback for decommissioned or rate-limited models."""
    # Map obsolete/decommissioned Groq model IDs to current active models
    OBSOLETE_MODEL_MAP = {
        "llama-3.3-70b-versatile": "groq/compound",
        "llama-3.1-8b-instant": "groq/compound-mini",
        "llama-3.2-11b-vision-preview": "qwen/qwen3.6-27b",
        "llama-3.2-90b-vision-preview": "qwen/qwen3.6-27b",
        "meta-llama/llama-4-scout-17b-16e-instruct": "groq/compound",
        "mixtral-8x7b-32768": "groq/compound",
        "gemma2-9b-it": "groq/compound-mini",
        "qwen-2.5-32b": "qwen/qwen3.6-27b"
    }

    if model in OBSOLETE_MODEL_MAP:
        logger.info(f"Mapping Groq model '{model}' to active model '{OBSOLETE_MODEL_MAP[model]}'")
        model = OBSOLETE_MODEL_MAP[model]

    formatted_messages = format_groq_messages(messages, model)
    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        
        completion = client.chat.completions.create(
            model=model,
            messages=formatted_messages,
            temperature=temperature,
            stream=True
        )
        for chunk in completion:
            content = chunk.choices[0].delta.content
            if content:
                yield content
    except ImportError:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": formatted_messages,
            "temperature": temperature,
            "stream": True
        }
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            stream=True,
            timeout=60
        )
        if response.status_code != 200:
            error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
            # If 404 model_not_found and not already on default compound model, retry with groq/compound
            if response.status_code == 404 and model != "groq/compound":
                logger.warning(f"Model '{model}' returned 404, falling back to 'groq/compound'")
                yield from stream_groq(messages, "groq/compound", api_key, temperature, is_retry=True)
                return
            # If 429 rate limit exceeded, attempt auto-fallback to lightweight model
            if response.status_code == 429 and not is_retry and model != "groq/compound-mini":
                logger.warning(f"Model '{model}' rate limited (429), retrying with 'groq/compound-mini'")
                yield f"*(Rate limit reached for {model}. Automatically retrying with lightweight model `groq/compound-mini`...)*\n\n"
                yield from stream_groq(messages, "groq/compound-mini", api_key, temperature, is_retry=True)
                return

            yield f"\n\n> ⚠️ **Groq API Rate Limit / Error ({response.status_code})**\n>\n> {error_data}"
            return

        for line in response.iter_lines():
            if line:
                decoded = line.decode("utf-8")
                if decoded.startswith("data: ") and decoded != "data: [DONE]":
                    try:
                        data = json.loads(decoded[6:])
                        delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if delta:
                            yield delta
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        logger.exception("Error during Groq streaming")
        err_msg = str(e)
        if ("404" in err_msg or "model_not_found" in err_msg) and model != "groq/compound":
            logger.warning(f"Groq API 404 error for '{model}', falling back to 'groq/compound'")
            yield from stream_groq(messages, "groq/compound", api_key, temperature, is_retry=True)
            return
        if ("429" in err_msg or "Rate limit" in err_msg or "rate_limit" in err_msg) and not is_retry and model != "groq/compound-mini":
            logger.warning(f"Groq API 429 rate limit for '{model}', retrying with 'groq/compound-mini'")
            yield f"*(Groq rate limit reached on `{model}`. Switching to `groq/compound-mini`...)*\n\n"
            yield from stream_groq(messages, "groq/compound-mini", api_key, temperature, is_retry=True)
            return

        yield f"""

> ⏳ **Groq Free Tier Rate Limit Reached**
>
> **Details**: `{err_msg}`
>
> **How to resolve:**
> 1. **Wait ~20 seconds** for your Groq Tokens Per Minute (TPM) quota window to reset, then resend.
> 2. **Switch Provider**: Select **Google Gemini** or **Hugging Face** from the header dropdown for instant high-capacity responses.
> 3. **Upgrade Tier**: Visit [console.groq.com/settings/billing](https://console.groq.com/settings/billing) for higher TPM limits.
"""


def stream_gemini(messages: List[Dict[str, Any]], model: str, api_key: str, temperature: float = 0.7, is_retry: bool = False) -> Generator[str, None, None]:
    """Stream chat completions using Google Gemini REST API with image support and model alias mapping."""
    OBSOLETE_GEMINI_MAP = {
        "gemini-2.0-flash": "gemini-3.6-flash",
        "gemini-1.5-flash": "gemini-3.6-flash",
        "gemini-1.5-pro": "gemini-3.6-flash"
    }

    if model in OBSOLETE_GEMINI_MAP:
        logger.info(f"Mapping deprecated Gemini model '{model}' to active model '{OBSOLETE_GEMINI_MAP[model]}'")
        model = OBSOLETE_GEMINI_MAP[model]

    try:
        contents = []
        system_instruction = None

        for msg in messages:
            role = msg.get("role")
            content = msg.get("content", "")
            images = msg.get("images", [])

            parts = [{"text": content}]

            # Add inline image parts
            for img in images:
                if img.startswith("data:") and ";base64," in img:
                    header, b64_data = img.split(";base64,")
                    mime_type = header.replace("data:", "")
                    parts.append({
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": b64_data
                        }
                    })

            if role == "system":
                system_instruction = {"parts": [{"text": content}]}
            elif role == "user":
                contents.append({"role": "user", "parts": parts})
            elif role == "assistant":
                contents.append({"role": "model", "parts": [{"text": content}]})

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"
        
        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature
            }
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction

        response = requests.post(url, json=payload, stream=True, timeout=60)
        
        if response.status_code != 200:
            if (response.status_code == 404 or response.status_code == 400) and not is_retry and model != "gemini-3.6-flash":
                logger.warning(f"Gemini model '{model}' returned {response.status_code}, falling back to 'gemini-3.6-flash'")
                yield from stream_gemini(messages, "gemini-3.6-flash", api_key, temperature, is_retry=True)
                return
            yield f"\n\n**Gemini Error ({response.status_code})**: {response.text}"
            return

        for line in response.iter_lines():
            if line:
                decoded = line.decode("utf-8")
                if decoded.startswith("data: "):
                    try:
                        data = json.loads(decoded[6:])
                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            for part in parts:
                                text = part.get("text", "")
                                if text:
                                    yield text
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        logger.exception("Error during Gemini streaming")
        err_msg = str(e)
        if ("404" in err_msg or "NOT_FOUND" in err_msg) and not is_retry and model != "gemini-3.6-flash":
            yield from stream_gemini(messages, "gemini-3.6-flash", api_key, temperature, is_retry=True)
            return
        yield f"\n\n**Gemini API Error**: {err_msg}"


def stream_huggingface(messages: List[Dict[str, Any]], model: str, api_key: str, temperature: float = 0.7) -> Generator[str, None, None]:
    """Stream chat completions using Hugging Face router / inference API."""
    try:
        url = "https://router.huggingface.co/hf-inference/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        clean_messages = [{"role": m["role"], "content": str(m["content"])} for m in messages]
        payload = {
            "model": model,
            "messages": clean_messages,
            "temperature": temperature,
            "stream": True,
            "max_tokens": 2048
        }
        response = requests.post(url, headers=headers, json=payload, stream=True, timeout=60)
        
        if response.status_code != 200:
            error_text = response.text
            if response.status_code == 403 or "permissions" in error_text.lower():
                yield f"""

> 🔐 **Hugging Face Token Permission Required (403)**
>
> **Reason**: Your Hugging Face access token does not have permission to invoke Inference Providers.
>
> **How to Fix in 1 Minute:**
> 1. Go to your Hugging Face tokens page: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
> 2. Click **Create new token** (or edit your existing token).
> 3. Select **Fine-grained token** (or **Write** token).
> 4. Under **User Permissions**, check:
>    - ✅ **Inference**: Check **"Make calls to Inference Providers"** (or **"Make calls to serverless Inference API"**).
> 5. Click **Generate token**, copy your new `hf_...` key, and save it in `.env` as `HUGGINGFACE_API_KEY=hf_...` (or update via the **API Settings** modal in the header).
"""
                return
            yield f"\n\n**Hugging Face Error ({response.status_code})**: {error_text}"
            return

        for line in response.iter_lines():
            if line:
                decoded = line.decode("utf-8")
                if decoded.startswith("data: ") and decoded.strip() != "data: [DONE]":
                    try:
                        data = json.loads(decoded[6:])
                        delta = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if delta:
                            yield delta
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        logger.exception("Error during Hugging Face streaming")
        yield f"\n\n**Hugging Face API Error**: {str(e)}"


def stream_chat(messages: List[Dict[str, Any]], provider: str, model: str, temperature: float = 0.7) -> Generator[str, None, None]:
    """Unified entry point for streaming responses from any supported provider."""
    provider = provider.lower()
    api_key = get_api_key(provider)

    if not api_key:
        provider_name = provider.capitalize()
        yield f"""### 🔑 API Key Required for {provider_name}

It looks like the API key for **{provider_name}** is not yet configured in your `.env` file.

#### How to configure:
1. Open the `.env` file in the project folder.
2. Add your API key:
   - For Groq: `GROQ_API_KEY=gsk_...` (Get it at [console.groq.com/keys](https://console.groq.com/keys))
   - For Gemini: `GEMINI_API_KEY=AIza...` (Get it at [aistudio.google.com](https://aistudio.google.com/app/apikey))
   - For Hugging Face: `HUGGINGFACE_API_KEY=hf_...` (Get it at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens))
3. Save the `.env` file and try sending a message again!

*(You can also use the **API Settings** modal in the top-right corner to test keys live.)*"""
        return

    if provider == "groq":
        yield from stream_groq(messages, model or "groq/compound", api_key, temperature)
    elif provider == "gemini":
        yield from stream_gemini(messages, model or "gemini-3.6-flash", api_key, temperature)
    elif provider == "huggingface":
        yield from stream_huggingface(messages, model or "meta-llama/Llama-3.2-3B-Instruct", api_key, temperature)
    else:
        yield f"**Error**: Unknown AI provider '{provider}'."
