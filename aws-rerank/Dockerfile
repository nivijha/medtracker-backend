FROM public.ecr.aws/lambda/python:3.12

ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=300 --retries 5 --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY app.py gate.py smoke_test.py .

ENV HF_HOME=/tmp/hf_cache

# Download the model at BUILD time (network available here), then move it into
# the image so runtime never needs network access.
RUN python -c "import os; os.environ['HF_HOME']='/tmp/hf_cache'; from sentence_transformers import CrossEncoder; m = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2'); m.save('/tmp/model-build/ms-marco-MiniLM-L-6-v2'); print('model saved to /tmp/model-build/ms-marco-MiniLM-L-6-v2')"

RUN mkdir -p /opt/models && \
    cp -r /tmp/model-build/ms-marco-MiniLM-L-6-v2 /opt/models/ms-marco-MiniLM-L-6-v2 && \
    chmod -R a+rX /opt/models/ms-marco-MiniLM-L-6-v2 && \
    rm -rf /tmp/model-build /tmp/hf_cache

# Offline mode at runtime: never contact the Hugging Face hub. Missing local
# model files fail fast instead of stalling on a network call.
ENV TRANSFORMERS_OFFLINE=1 \
    HF_HUB_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1

RUN python3 gate.py

RUN python3 smoke_test.py

CMD ["app.lambda_handler"]