import ee
import json
import sys
import time

try:
    ee.Authenticate()
    ee.Initialize(project='stoked-flame-455410-k2')  # Replace with your actual project ID.
except Exception as e:
    sys.exit(json.dumps({"error": "Failed to initialize Earth Engine: " + str(e)}))

# --- Begin generated code ---
{GENERATED_CODE}
# --- End generated code ---

# If the generated code did not define 'image', create a fallback image.
try:
    image
except NameError:
    geometry = ee.Geometry.Point([75.568, 31.326])  # Approximate coordinates for Jalandhar.
    image = ee.ImageCollection('COPERNICUS/S2') \
              .filterDate('2023-11-25', '2024-01-30') \
              .filterBounds(geometry).first()

# Cast image bands to UInt16 to enforce consistent data types.
try:
    image = image.toUint16()
except Exception as e:
    sys.exit(json.dumps({"error": "Failed to cast image bands: " + str(e)}))

# Create an export task to Google Cloud Storage.
task = ee.batch.Export.image.toCloudStorage(
    image=image,
    description='Export_Sentinel2_Data',
    bucket='my-satellite-data-exports',         # Replace with your GCS bucket name.
    fileNamePrefix='output_data',  # This will be used to generate the output filename.
    scale=10,                         # Spatial resolution in meters.
    region=image.geometry().bounds().getInfo()['coordinates'],
    maxPixels=1e13                    # Allow large exports.
)

task.start()

# Poll the task status until it is completed.
status = task.status()['state']
while status in ['READY', 'RUNNING']:
    time.sleep(5)
    status = task.status()['state']

if status == 'COMPLETED':
    # Construct the download URL based on your GCS bucket and fileNamePrefix.
    # Note: In GCS, the exported file typically gets a name that includes a timestamp or unique identifier.
    # For MVP purposes we assume a fixed name (adjust as needed).
    download_url = "https://storage.googleapis.com/my-satellite-data-exports/output_data.tif"
    result = {"download_url": download_url}
    print(json.dumps(result))
else:
    sys.exit(json.dumps({"error": "Export task failed: " + str(task.status())}))
