import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";

const execPromise = promisify(exec);

async function callClaudeAPI(query: string): Promise<string> {
  const prompt = `Convert the following natural language query into a complete Google Earth Engine Python API code snippet.
  
The code must:
1. Define a geometry for the location.
2. Filter the Sentinel-2 image collection using the provided date range and the geometry.
3. Select an image (for example, the first image) from the collection.
4. Create an export task to Google Cloud Storage using ee.batch.Export.image.toCloudStorage with description "Export_Sentinel2_Data".
5. Start the task and poll its status until the task state is "COMPLETED".
6. Once completed, set a variable named "result" to a dictionary with a key "download_url" containing the direct download URL (e.g., "https://storage.googleapis.com/YOUR_GCS_BUCKET/sentinel2_data.tif").
  
Now, convert the following query into code:
Query: "${query}"
Provide the complete code snippet.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing Anthropic API key in environment variables.");
  }
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${errorText}`);
  }
  
  const data = await response.json();
  return data.completion || "";
}

async function runGEEExport(geeCode: string): Promise<string> {
  const templatePath = "gee_template.py";
  const tempFilePath = "temp_gee_code.py";

  // Read the Python template file.
  const templateContent = await readFile(templatePath, "utf8");
  // Replace the placeholder with the generated GEE code.
  const finalContent = templateContent.replace("{GENERATED_CODE}", geeCode);
  // Write the modified content to a temporary file.
  await writeFile(tempFilePath, finalContent, "utf8");

  let stdout = "";
  try {
    const { stdout: out } = await execPromise(`python ${tempFilePath}`);
    stdout = out;
  } catch (error: any) {
    try {
      await unlink(tempFilePath);
    } catch (unlinkError: any) {
      if (unlinkError.code !== "ENOENT") console.error("Error deleting temp file:", unlinkError);
    }
    throw error;
  }

  try {
    await unlink(tempFilePath);
  } catch (unlinkError: any) {
    if (unlinkError.code !== "ENOENT") console.error("Error deleting temp file:", unlinkError);
  }

  try {
    const result = JSON.parse(stdout);
    return result.download_url;
  } catch (e: any) {
    throw new Error("Error parsing output: " + e.message);
  }
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "No query provided." }, { status: 400 });
    }
    console.log("Received query:", query);

    // Generate GEE Python code via Anthropic API.
    const geeCode = await callClaudeAPI(query);
    console.log("Generated GEE code:", geeCode);

    // Run the Python template with the injected GEE code.
    const downloadURL = await runGEEExport(geeCode);
    console.log("GEE export completed. Download URL:", downloadURL);

    return NextResponse.json({
      download_url: downloadURL,
      generated_gee_code: geeCode,
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: "Server error: " + error.message }, { status: 500 });
  }
}
