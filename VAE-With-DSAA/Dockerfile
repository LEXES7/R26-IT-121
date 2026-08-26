# Serving image for the behavioural fraud detector (Stratified VAE + DSAA).
#
# The service loads four small bundles — VAE weights, scaler, k-means centroids,
# thresholds, calibrator and typology index — and does genuine request-time
# inference on seven features. No training stack is needed at runtime, so
# CPU torch is enough and the image stays small.
#
# The bundles are baked in: all four together are under 1 MB, unlike the graph
# component's 170 MB serving bundle, so there is nothing to mount.
#
#   docker build -t deepsentinel/behavioral .
#   docker run -p 8001:8001 deepsentinel/behavioral
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    BEHAVIORAL_API_HOST=0.0.0.0 \
    BEHAVIORAL_API_PORT=8001

WORKDIR /app

# CPU-only torch first (large, rarely changes) so it stays cached across builds.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir \
      numpy pandas scikit-learn "pydantic>=2" fastapi uvicorn

COPY pyproject.toml README.md ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN pip install --no-cache-dir --no-deps -e .

# Bundles are small enough to ship with the image, so the container is
# self-contained and the demo cannot drift from the dissertation.
COPY checkpoints/v4/ ./checkpoints/v4/
COPY data/demo/ ./data/demo/
COPY examples/ ./examples/

EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8001/health',timeout=4)"

CMD ["python", "-m", "uvicorn", "vae_dsaa.api.app:app", "--host", "0.0.0.0", "--port", "8001"]
