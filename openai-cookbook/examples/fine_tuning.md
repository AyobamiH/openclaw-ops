# Fine-Tuning Example

How to fine-tune a model on your own data.

## Prepare Data

Formatted JSONL file (one JSON object per line):

```jsonl
{"messages": [{"role": "system", "content": "You are helpful"}, {"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi!"}]}
{"messages": [{"role": "system", "content": "You are helpful"}, {"role": "user", "content": "How are you?"}, {"role": "assistant", "content": "I'm doing well"}]}
```

## Upload Training Data

```python
import openai

with open("training_data.jsonl", "rb") as f:
    response = openai.File.create(
        file=f,
        purpose="fine-tune"
    )
    file_id = response["id"]
```

## Create Fine-Tune Job

```python
ft_response = openai.FineTune.create(
    training_file=file_id,
    model="gpt-3.5-turbo",
    n_epochs=3,
    batch_size=32,
    learning_rate_multiplier=0.1
)

job_id = ft_response["id"]
print(f"Fine-tune job: {job_id}")
```

## Monitor Progress

```python
import time

while True:
    status = openai.FineTune.retrieve(job_id)
    print(f"Status: {status['status']}")
    
    if status['status'] in ['succeeded', 'failed']:
        break
    
    time.sleep(30)

model_name = status['fine_tuned_model']
print(f"Ready to use: {model_name}")
```

## Use Fine-Tuned Model

```python
response = openai.ChatCompletion.create(
    model=model_name,
    messages=[{"role": "user", "content": "Hello"}]
)
```
