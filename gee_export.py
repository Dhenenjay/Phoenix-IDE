# gee_export.py
import ee
import json
import sys

def main():
    try:
        # Replace 'YOUR_PROJECT_ID' with your actual registered Earth Engine project ID.
        ee.Authenticate()  # This will prompt if necessary.
        ee.Initialize(project='stoked-flame-455410-k2')
    except Exception as e:
        sys.exit(json.dumps({"error": "Failed to initialize Earth Engine: " + str(e)}))
    
    # The generated GEE Python code should be passed as an argument.
    # Here, we assume it's passed as the first command-line argument.
    if len(sys.argv) < 2:
        sys.exit(json.dumps({"error": "No GEE code provided."}))
    
    gee_code = sys.argv[1]
    
    # Create a local dictionary to capture variables defined by the exec'd code.
    local_env = {}
    
    try:
        # Execute the generated code. The code should define a variable 'result'.
        exec(gee_code, {"ee": ee}, local_env)
        result = local_env.get("result")
        if result is None:
            sys.exit(json.dumps({"error": "No result variable defined in the code."}))
        print(json.dumps(result))
    except Exception as e:
        sys.exit(json.dumps({"error": "Error executing GEE code: " + str(e)}))

if __name__ == "__main__":
    main()
