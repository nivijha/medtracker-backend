FROM public.ecr.aws/lambda/python:3.12

ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=300 --retries 5 --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY app.py .

ENV EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ENV HF_HOME=/tmp/hf_cache

RUN python -c "import os; os.environ['HF_HOME']='/tmp/hf_cache'; from sentence_transformers import SentenceTransformer; m = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2'); m.save('/tmp/model-build/all-MiniLM-L6-v2'); print('model saved to /tmp/model-build/all-MiniLM-L6-v2')"

RUN mkdir -p /opt/models && \
    cp -r /tmp/model-build/all-MiniLM-L6-v2 /opt/models/all-MiniLM-L6-v2 && \
    chmod -R a+rX /opt/models/all-MiniLM-L6-v2 && \
    rm -rf /tmp/model-build /tmp/hf_cache

RUN test -f /opt/models/all-MiniLM-L6-v2/model.safetensors && \
    test -s /opt/models/all-MiniLM-L6-v2/model.safetensors && \
    test -f /opt/models/all-MiniLM-L6-v2/config.json && \
    test -f /opt/models/all-MiniLM-L6-v2/tokenizer.json && \
    test -f /opt/models/all-MiniLM-L6-v2/modules.json && \
    test -f /opt/models/all-MiniLM-L6-v2/1_Pooling/config.json && \
    test -d /opt/models/all-MiniLM-L6-v2/2_Normalize && \
    python3 -c "import os; s=os.path.getsize('/opt/models/all-MiniLM-L6-v2/model.safetensors'); assert s > 1000000, s; print('MODEL BAKE GATE PASSED', s, 'bytes')"

RUN python -c "from sentence_transformers import SentenceTransformer; import math; m=SentenceTransformer('/opt/models/all-MiniLM-L6-v2', device='cpu'); v=m.encode(['Patient blood pressure was 120 over 80.'], normalize_embeddings=True); assert v.shape==(1,384); n=math.sqrt(sum(x*x for x in v[0].tolist())); assert abs(n-1.0)<1e-3; print('OFFLINE INFERENCE OK shape=', v.shape, 'norm=', round(n,6))"

CMD ["app.lambda_handler"]
