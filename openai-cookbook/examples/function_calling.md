# Function Calling Example

How to use function calling to enable GPT to interact with external tools.

## Define Functions

```python
import openai
import json

# Define the functions your assistant can call
functions = [
    {
        "name": "get_current_weather",
        "description": "Get the current weather for a location",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["location"]
        }
    },
    {
        "name": "search_documents",
        "description": "Search internal documentation",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer", "description": "Maximum results"}
            },
            "required": ["query"]
        }
    }
]
```

## Call with Function Definitions

```python
response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "What's the weather in New York?"}
    ],
    functions=functions,
    function_call="auto"  # let the model decide when to call functions
)

if response.choices[0].message.get("function_call"):
    function_call = response.choices[0].message["function_call"]
    print(f"Called: {function_call['name']}")
    print(f"Args: {function_call['arguments']}")
```

## Handle Function Results

```python
def handle_function_call(function_name, args):
    if function_name == "get_current_weather":
        # Call your weather API
        return {"temperature": 72, "condition": "sunny"}
    elif function_name == "search_documents":
        # Search your documents
        return {"results": []}

# Get model response with function call
response = openai.ChatCompletion.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "What's the weather?"}],
    functions=functions,
    function_call="auto"
)

# Execute the function
if response.choices[0].message.get("function_call"):
    func = response.choices[0].message["function_call"]
    result = handle_function_call(func["name"], json.loads(func["arguments"]))
    
    # Call GPT again with the result
    messages = [
        {"role": "user", "content": "What's the weather?"},
        {"role": "assistant", "content": None, "function_call": func},
        {"role": "function", "name": func["name"], "content": json.dumps(result)}
    ]
    
    final_response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=messages,
        functions=functions
    )
```

## Best Practices

- Define clear, specific function descriptions
- Use proper parameter types and requirements
- Handle missing or invalid function calls
- Always validate user input before calling functions
- Log all function calls for debugging
