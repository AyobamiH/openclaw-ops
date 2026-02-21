# Embeddings Example

How to use embeddings to find similar documents or search text.

## Create Embeddings

```python
import openai

response = openai.Embedding.create(
    input="The quick brown fox jumps over the lazy dog",
    model="text-embedding-3-small"
)

embedding = response['data'][0]['embedding']
print(f"Embedding dimension: {len(embedding)}")
```

## Similarity Search

Compare embeddings to find similar texts:

```python
import numpy as np

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Get embeddings for documents
doc1_embedding = openai.Embedding.create(
    input="Python programming",
    model="text-embedding-3-small"
)['data'][0]['embedding']

doc2_embedding = openai.Embedding.create(
    input="Python software development",
    model="text-embedding-3-small"
)['data'][0]['embedding']

similarity = cosine_similarity(doc1_embedding, doc2_embedding)
print(f"Similarity: {similarity:.4f}")
```

## Batch Processing

For efficiency, embed multiple texts at once:

```python
texts = [
    "OpenAI API",
    "Machine learning",
    "Natural language processing"
]

response = openai.Embedding.create(
    input=texts,
    model="text-embedding-3-small"
)

embeddings = [item['embedding'] for item in response['data']]
```

## Use Cases

- Semantic search
- Recommendation systems  
- Clustering
- Transfer learning
- Feature extraction
