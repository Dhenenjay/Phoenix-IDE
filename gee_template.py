# gee_template.py

import ee
import json
import sys
import time
import os
import uuid

# —————————————————————————————
# 1) Initialize Earth Engine
# —————————————————————————————
project_id = os.getenv("GEE_PROJECT_ID")
if not project_id:
    sys.exit(json.dumps({"error": "GEE_PROJECT_ID not set"}))
gcs_bucket = os.getenv("GCS_BUCKET_NAME")
if not gcs_bucket:
    sys.exit(json.dumps({"error": "GCS_BUCKET_NAME not set"}))

try:
    ee.Authenticate()
    ee.Initialize(project=project_id)
except Exception as e:
    sys.exit(json.dumps({"error": "Initialization failed: " + str(e)}))

# —————————————————————————————
# 2) Run user-generated snippet (must define `image`)
# —————————————————————————————
{GENERATED_CODE}

if "image" not in globals():
    sys.exit(json.dumps({"error": "Generated code did not define `image`"}))

# —————————————————————————————
# 3) **Ensure uniform band types** 
# Prevent batch export failures due to mixed UInt16/UInt32:
# Cast every band to float.
# —————————————————————————————
try:
    image = image.toFloat()
except Exception as e:
    sys.exit(json.dumps({"error": "Casting image bands failed: " + str(e)}))

# —————————————————————————————
# 4) Attempt synchronous signed URL (small areas)
# —————————————————————————————
try:
    download_url = image.getDownloadURL({
        "scale": 10,
        "region": image.geometry().bounds().getInfo()["coordinates"],
        "fileFormat": "GeoTIFF",
        "crs": "EPSG:4326"
    })
    print(json.dumps({"download_url": download_url}))
    sys.exit(0)
except Exception as e:
    msg = str(e)
    # If it's not a size‐limit error, abort:
    if "Total request size" not in msg:
        sys.exit(json.dumps({"error": "getDownloadURL failed: " + msg}))
    # Otherwise, fall through to batch export

# —————————————————————————————
# 5) Batch-export fallback for large areas
# —————————————————————————————
timestamp = int(time.time())
uid = uuid.uuid4().hex[:8]
prefix = f"export_{timestamp}_{uid}"

task = ee.batch.Export.image.toCloudStorage(
    image=image,
    description="Export_Sentinel2_Large",
    bucket=gcs_bucket,
    fileNamePrefix=prefix,
    scale=10,
    region=image.geometry().bounds().getInfo()["coordinates"],
    maxPixels=1e13
)
task.start()

# —————————————————————————————
# 6) Poll until done
# —————————————————————————————
state = task.status()["state"]
while state in ("READY", "RUNNING"):
    time.sleep(5)
    state = task.status()["state"]

# —————————————————————————————
# 7) Return the real URI EE wrote
# —————————————————————————————
if state == "COMPLETED":
    status = task.status()
    uris = status.get("destination_uris", [])
    if not uris:
        sys.exit(json.dumps({"error": "No URIs returned by batch export"}))
    gs_path = uris[0]
    https = gs_path.replace("gs://", "https://storage.googleapis.com/")
    print(json.dumps({"download_url": https}))
else:
    sys.exit(json.dumps({"error": "Batch export failed: " + json.dumps(task.status())}))
