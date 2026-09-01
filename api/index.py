import os
import sys

# Add root directory to python path for Vercel Serverless
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app import app

# WSGI Middleware to normalize Vercel rewrite PATH_INFO & REQUEST_URI
class VercelPathFixMiddleware:
    def __init__(self, app_wsgi):
        self.app_wsgi = app_wsgi

    def __call__(self, environ, start_response):
        # Extract original requested URI before Vercel serverless rewrite
        request_uri = environ.get("HTTP_X_MATCHED_PATH") or environ.get("REQUEST_URI", "")
        if "?" in request_uri:
            request_uri = request_uri.split("?")[0]

        if request_uri and request_uri != "/api/index":
            environ["PATH_INFO"] = request_uri
        else:
            path_info = environ.get("PATH_INFO", "")
            if path_info in ("/api/index", "/api/index/"):
                environ["PATH_INFO"] = "/"
            elif path_info.startswith("/api/index/"):
                environ["PATH_INFO"] = path_info[10:]

        return self.app_wsgi(environ, start_response)

app.wsgi_app = VercelPathFixMiddleware(app.wsgi_app)
