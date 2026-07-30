import gradio as gr
import uvicorn
from app.main import app as fastapi_app

# Define a simple, clean UI for the Hugging Face Space landing page
with gr.Blocks(title="Fermata Backend") as demo:
    gr.HTML("""
        <div style="text-align: center; max-width: 600px; margin: 50px auto; padding: 30px; border-radius: 12px; background: #111; box-shadow: 0 4px 20px rgba(0,0,0,0.5); font-family: sans-serif; color: #fff;">
            <h1 style="color: #1DB954; font-size: 2.5rem; margin-bottom: 10px;">🎵 Fermata Backend</h1>
            <p style="font-size: 1.1rem; color: #aaa; margin-bottom: 30px;">Your production-ready music streaming API is up and running on Hugging Face Spaces!</p>
            <hr style="border: 0; border-top: 1px solid #222; margin: 30px 0;"/>
            <div style="display: flex; justify-content: center; gap: 20px;">
                <a href="/docs" target="_blank" style="background-color: #1DB954; color: white; padding: 12px 24px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 1rem; transition: background 0.3s;">📖 API Swagger Docs</a>
                <a href="/redoc" target="_blank" style="background-color: #333; color: white; padding: 12px 24px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 1rem; transition: background 0.3s;">📑 ReDoc</a>
            </div>
        </div>
    """)

# Mount Gradio app into the FastAPI app
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    # Hugging Face Spaces defaults to port 7860
    uvicorn.run("app:app", host="0.0.0.0", port=7860, reload=False)
