import os
import json
import base64
import logging
from flask import Flask, render_template, request, Response, jsonify, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv, set_key

# Load environment variables from .env file
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=dotenv_path, override=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Import AI service
from services.ai_service import (
    SUPPORTED_MODELS,
    get_providers_status,
    stream_chat,
    extract_text_from_file_data
)

base_dir = os.path.abspath(os.path.dirname(__file__))
app = Flask(
    __name__,
    template_folder=os.path.join(base_dir, "templates"),
    static_folder=os.path.join(base_dir, "static")
)
CORS(app)


@app.route("/")
def index():
    """Render the main chat interface."""
    return render_template("index.html")


@app.route("/api/status", methods=["GET"])
def api_status():
    """Return status of all providers and API keys."""
    # Reload .env in case user edited it while server is running
    load_dotenv(dotenv_path=dotenv_path, override=True)
    return jsonify({
        "status": "online",
        "providers": get_providers_status()
    })


@app.route("/api/models", methods=["GET"])
def api_models():
    """Return all supported AI models categorized by provider."""
    return jsonify({
        "models": SUPPORTED_MODELS
    })


@app.route("/api/upload", methods=["POST"])
def api_upload_file():
    """Handle document and image uploads for chat context."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    filename = file.filename or "uploaded_file"
    file_bytes = file.read()

    # Determine if image or document
    ext = os.path.splitext(filename)[1].lower()
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

    if ext in image_exts:
        mime = "image/png" if ext == ".png" else "image/jpeg" if ext in (".jpg", ".jpeg") else f"image/{ext[1:]}"
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        data_url = f"data:{mime};base64,{b64}"
        return jsonify({
            "type": "image",
            "filename": filename,
            "data_url": data_url,
            "size": len(file_bytes)
        })
    else:
        text_content = extract_text_from_file_data(filename, file_bytes)
        return jsonify({
            "type": "document",
            "filename": filename,
            "content": text_content,
            "size": len(file_bytes),
            "char_count": len(text_content)
        })


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """Handle chat completion requests and stream tokens back via SSE."""
    # Ensure latest .env values are loaded
    load_dotenv(dotenv_path=dotenv_path, override=True)
    
    data = request.get_json() or {}
    messages = data.get("messages", [])
    provider = data.get("provider", "groq")
    model = data.get("model", "groq/compound")
    temperature = float(data.get("temperature", 0.7))

    if not messages:
        return jsonify({"error": "No messages provided in request payload."}), 400

    def generate_sse():
        try:
            for token in stream_chat(messages, provider, model, temperature):
                # Send SSE data frame
                payload = json.dumps({"token": token})
                yield f"data: {payload}\n\n"
            # Signal end of stream
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Error in SSE generator")
            error_payload = json.dumps({"error": str(e)})
            yield f"data: {error_payload}\n\n"
            yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate_sse()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )


@app.route("/api/keys/update", methods=["POST"])
def api_update_keys():
    """Optionally update API keys in .env directly from the settings UI."""
    data = request.get_json() or {}
    
    groq_key = data.get("groq_key")
    gemini_key = data.get("gemini_key")
    hf_key = data.get("hf_key")

    try:
        if not os.path.exists(dotenv_path):
            with open(dotenv_path, "w", encoding="utf-8") as f:
                f.write("# Environment Configuration\n")

        if groq_key is not None and groq_key.strip():
            set_key(dotenv_path, "GROQ_API_KEY", groq_key.strip())
            os.environ["GROQ_API_KEY"] = groq_key.strip()
            
        if gemini_key is not None and gemini_key.strip():
            set_key(dotenv_path, "GEMINI_API_KEY", gemini_key.strip())
            os.environ["GEMINI_API_KEY"] = gemini_key.strip()
            
        if hf_key is not None and hf_key.strip():
            set_key(dotenv_path, "HUGGINGFACE_API_KEY", hf_key.strip())
            os.environ["HUGGINGFACE_API_KEY"] = hf_key.strip()

        # Reload
        load_dotenv(dotenv_path=dotenv_path, override=True)
        return jsonify({
            "success": True,
            "message": "API keys updated successfully in .env!",
            "providers": get_providers_status()
        })
    except Exception as e:
        logger.exception("Failed to update .env keys")
        return jsonify({"error": f"Failed to update .env: {str(e)}"}), 500


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")
    print(f">> Starting AI Chatbot Flask Server on http://127.0.0.1:{port} ...")
    app.run(host="0.0.0.0", port=port, debug=debug)
