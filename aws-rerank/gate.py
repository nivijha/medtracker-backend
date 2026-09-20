"""Build-time gate: verify the baked CrossEncoder model files exist and are valid."""
import os

path = "/opt/models/ms-marco-MiniLM-L-6-v2"
files = sorted(os.listdir(path))
print("Model files:", files)

assert "config.json" in files, f"missing config.json, have: {files}"
assert "tokenizer.json" in files, f"missing tokenizer.json, have: {files}"

has_safetensors = "model.safetensors" in files
has_bin = "pytorch_model.bin" in files
assert has_safetensors or has_bin, f"missing model weights, have: {files}"

if has_safetensors:
    size = os.path.getsize(os.path.join(path, "model.safetensors"))
    assert size > 1000000, f"model.safetensors too small: {size}"
    print("MODEL BAKE GATE PASSED safetensors", size, "bytes")
else:
    size = os.path.getsize(os.path.join(path, "pytorch_model.bin"))
    assert size > 1000000, f"pytorch_model.bin too small: {size}"
    print("MODEL BAKE GATE PASSED pytorch_model.bin", size, "bytes")