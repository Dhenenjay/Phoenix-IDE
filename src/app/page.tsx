"use client";

import { useState, useRef, useEffect } from "react";
import Globe from "react-globe.gl";

export default function Home() {
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [geeCode, setGeeCode] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const globeRef = useRef<any>(null);

  // Enable auto-rotation for the globe using its controls
  useEffect(() => {
    if (globeRef.current) {
      const controls = globeRef.current.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.1; // Adjust speed as desired
    }
  }, []);

  // Parse coordinates from generated GEE code, if present.
  function parseCoordinatesFromGEE(geeSnippet: string) {
    const regex = /ee\.Geometry\.Point\(\[\s*([0-9.\-]+)\s*,\s*([0-9.\-]+)\s*\]\)/;
    const matches = geeSnippet.match(regex);
    if (matches && matches.length >= 3) {
      const lng = parseFloat(matches[1]);
      const lat = parseFloat(matches[2]);
      return { lat, lng };
    }
    return null;
  }

  // When geeCode updates, attempt to fly the globe to the parsed coordinates.
  useEffect(() => {
    if (geeCode && globeRef.current) {
      const coords = parseCoordinatesFromGEE(geeCode);
      if (coords) {
        globeRef.current.pointOfView(
          { lat: coords.lat, lng: coords.lng, altitude: 2 },
          2000
        );
      }
    }
  }, [geeCode]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) {
      setStatus("Please enter a query.");
      return;
    }
    setStatus("Processing your query...");
    setProgress(20);
    try {
      const res = await fetch("/api/process-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.error) {
        setStatus("Error: " + data.error);
        setProgress(0);
      } else {
        setStatus("Download link: " + data.download_url);
        setGeeCode(data.generated_gee_code);
        setProgress(100);
      }
    } catch (error: any) {
      setStatus("An error occurred: " + error.message);
      setProgress(0);
    }
  };

  return (
    <div className="page-container">
      {/* HERO SECTION */}
      <header className="hero-section">
        <div className="hero-content">
          <img src="/logo.png" alt="EzSpace Logo" className="hero-logo" />
          <h1 className="hero-title">Phoenix 1.0</h1>
          <p className="hero-subtitle">
            No-Code IDE for Planetary Scale Satellite Data Analysis
          </p>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {/* Query Card */}
        <div className="query-card">
          <form onSubmit={handleSubmit} className="query-form">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Give me the raw Sentinel-2 multispectral data for Jalandhar from 25th November 2023 to 30th January 2024"
              rows={5}
              className="query-input"
            />
            <button type="submit" className="query-button">
              Submit Query
            </button>
          </form>
          <div className="status-text">{status}</div>
          <div className="progress-bar">
            <div className="progress" style={{ width: `${progress}%` }}></div>
          </div>
        </div>

        {geeCode && (
          <div className="code-card">
            <h2>Generated GEE Code</h2>
            <pre className="code-block">{geeCode}</pre>
          </div>
        )}

        {/* Globe Card */}
        <div className="globe-card">
          <h2>Explore the Globe</h2>
          <Globe
            ref={globeRef}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
            backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
            animateIn={true}
            style={{ width: "100%", height: "400px" }} // Full width of the container.
          />
        </div>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <p>&copy; 2025 AxionOrbital Space Phoenix 1.0 - MVP</p>
      </footer>
    </div>
  );
}
