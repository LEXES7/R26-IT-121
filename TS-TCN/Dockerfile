# Serving image for the temporal-sequence fraud detector (TS-TCN + fraud_attention).
#
# The service loads a trained Keras checkpoint, a fitted StandardScaler and
# the data-driven type-risk weights, then does genuine request-time inference
# over a system-wide sliding window. TensorFlow is CPU-only here — no GPU is
# needed for inference at this model size (~219K parameters).
#
# outputs/ is NOT baked in (best_tstcn.keras, scaler.pkl, and
# type_risk_weights.json are gitignored, generated artefacts — see
# outputs/README.md): mount it at runtime.
#
#   docker build -t deepsentinel/tstcn .
#   docker run -p 8003:8003 -v "$PWD/outputs:/app/outputs:ro" deepsentinel/tstcn
FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TSTCN_API_HOST=0.0.0.0 \
    TSTCN_API_PORT=8003

WORKDIR /app

# CPU-only TensorFlow first (large, rarely changes) so it stays cached across
# builds, mirroring the CPU-torch-first pattern in GraphSage's/VAE-DSAA's
# Dockerfiles.
RUN pip install --no-cache-dir \
      tensorflow-cpu==2.15.0 numpy pandas scikit-learn joblib \
      "pydantic>=2" fastapi "uvicorn[standard]"

COPY src/ ./src/
COPY api/ ./api/
COPY scripts/ ./scripts/

EXPOSE 8003
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8003/health',timeout=4)"

CMD ["python", "scripts/serve_api.py"]
