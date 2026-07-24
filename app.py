import os
import gradio as gr
import uvicorn
from app.main import app as fastapi_app

# Minimal Gradio interface so Hugging Face Spaces can run it under the Gradio SDK.
with gr.Blocks(title="Fermata API") as demo:
    gr.Markdown("# 🎵 Fermata Music streaming backend API")
    gr.Markdown("The backend API service is running successfully on this Space.")
    gr.Markdown("All API routes (`/tracks`, `/albums`, `/search`, etc.) are mounted.")
    gr.Markdown("To view the interactive Swagger API documentation, visit: **`/docs`** or **`/redoc`** on this host.")

# Mount the Gradio web interface at the '/ui' path.
# This makes FastAPI the root application, preserving all API endpoints.
# The Hugging Face platform handles the rest.
app = gr.mount_gradio_app(fastapi_app, demo, path="/ui")

if __name__ == "__main__":
    # Hugging Face runs app on port 7860 by default
    port = int(os.getenv("PORT", 7860))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
