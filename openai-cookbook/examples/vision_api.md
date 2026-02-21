# Vision API Example

How to use GPT-4 Vision to analyze images.

## Analyze From URL

```python
import openai
import base64

response = openai.ChatCompletion.create(
    model="gpt-4-vision-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What's in this image?"},
                {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
            ]
        }
    ],
    max_tokens=1024
)

print(response.choices[0].message["content"])
```

## Analyze Local Image

Encode image as base64:

```python
def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

base64_image = encode_image("screenshot.png")

response = openai.ChatCompletion.create(
    model="gpt-4-vision-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this screenshot"},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
            ]
        }
    ]
)
```

## Multiple Images

Analyze multiple images in one request:

```python
response = openai.ChatCompletion.create(
    model="gpt-4-vision-preview",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Compare these two images"},
                {"type": "image_url", "image_url": {"url": "https://example.com/image1.jpg"}},
                {"type": "image_url", "image_url": {"url": "https://example.com/image2.jpg"}}
            ]
        }
    ]
)
```

## Cost Considerations

- Small images: 85 tokens
- Large images: up to 2,550 tokens
- High detail mode: higher token cost
- Consider image resolution vs token usage
