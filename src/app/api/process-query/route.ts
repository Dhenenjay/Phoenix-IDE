// app/api/process-query/route.ts

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";

const execPromise = promisify(exec);

async function callClaudeAPI(query: string): Promise<string> {
  const prompt = `Create ONLY the body of a Python snippet that:
1. Imports ee and reads GEE_PROJECT_ID from env.
2. Parses these exact dates and the location from this query:
   "${query}"
3. Defines a geometry (ee.Geometry.Point or .Rectangle).
4. Filters COPERNICUS/S2 by those literal dates and geometry.
5. Sets: image = collection.first()
DO NOT include any export or URL logic—just define `image` at top level.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing Anthropic API key.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await res.json();
  // Extract the snippet text:
  let geeCode = Array.isArray((data as any).content)
    ? (data as any).content.map((b: any) => b.text).join("")
    : typeof (data as any).completion === "string"
      ? (data as any).completion
      : typeof (data as any).content === "string"
        ? (data as any).content
        : "";

  // Strip any code fences
  geeCode = geeCode.replace(/```(?:python)?\r?\n?/g, "").replace(/```/g, "").trim();

  if (!geeCode) {
    throw new Error("Empty Python snippet from Claude.");
  }
  return geeCode;
}

async function runGEEDownload(query: string): Promise<string> {
  const geeCode = await callClaudeAPI(query);
  // Read template, inject snippet, and write to temp file
  const template = await readFile("gee_template.py", "utf8");
  const script = template.replace("{GENERATED_CODE}", geeCode);
  const tempFile = "temp_gee_code.py";
  await writeFile(tempFile, script, "utf8");

  try {
    // Run the script
    const { stdout, stderr } = await execPromise(`python ${tempFile}`, {
      env: { ...process.env },
    });
    await unlink(tempFile);

    // Combine output and pull the first JSON object
    const all = (stdout + stderr).trim();
    const match = all.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("Python output:\n", all);
      throw new Error("No JSON found in Python output.");
    }
    const parsed = JSON.parse(match[0]);
    if (!parsed.download_url) throw new Error("download_url missing");

    return parsed.download_url;
  } catch (err: any) {
    try { await unlink(tempFile); } catch {}
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "No query provided." }, { status: 400 });
    }
    console.log("Received:", query);

    const downloadURL = await runGEEDownload(query);
    console.log("Download URL:", downloadURL);

    return NextResponse.json({ download_url: downloadURL }, { status: 200 });
  } catch (error: any) {
    console.error("Error in process-query:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
