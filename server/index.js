const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const youtubedl = require("youtube-dl-exec");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

app.use(cors({
  origin: "*", // Or specific frontend URL
  methods: ["GET", "POST"]
}));

app.post("/api/download", async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: "No URL provided" });
  console.log("📥 Got URL:", url);

  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
    });

    // 🔥 Remove duplicate quality (height) formats
    const formatsMap = new Map();

    info.formats.forEach((f) => {
      if (f.ext === "mp4" && f.height && !formatsMap.has(f.height)) {
        formatsMap.set(f.height, {
          format_id: f.format_id,
          quality: `${f.height}p`,
          hasAudio: f.acodec !== "none",
          videoOnly: f.acodec === "none", // ✅ Added this line
          size: f.filesize
            ? `${(f.filesize / (1024 * 1024)).toFixed(2)} MB`
            : "Unknown",
        });
      }
    });

    const formats = Array.from(formatsMap.values());

    const audioFormat = info.formats.find(
      (f) => f.acodec !== "none" && f.vcodec === "none"
    );

    return res.json({
      title: info.title,
      thumbnail: info.thumbnail || info.thumbnails?.pop()?.url,
      formats,
      audio: audioFormat
        ? {
            format_id: audioFormat.format_id,
            size: audioFormat.filesize
              ? `${(audioFormat.filesize / (1024 * 1024)).toFixed(2)} MB`
              : "Unknown",
          }
        : null,
    });
  } catch (err) {
    console.error("❌ Fetch Info Error:", err);
    res.status(500).json({ error: "Failed to fetch video info" });
  }
});



app.post("/api/download-video", async (req, res) => {
  const { url, format_id, audio_format_id } = req.body;
  if (!url || !format_id) return res.status(400).json({ error: "Missing data" });

  const videoFile = `video-${Date.now()}.mp4`;
  const audioFile = `audio-${Date.now()}.m4a`;
  const outputFile = `merged-${Date.now()}.mp4`;

  try {
    // Download video only
    await youtubedl(url, {
      output: videoFile,
      format: format_id,
    });

    // Download audio only
    await youtubedl(url, {
      output: audioFile,
      format: audio_format_id || "140", // fallback audio format
    });

    // Merge using ffmpeg
    const ffmpeg = require("child_process").spawnSync;
    const merge = ffmpeg("ffmpeg", [
      "-i", videoFile,
      "-i", audioFile,
      "-c", "copy",
      outputFile
    ]);

    // Send the merged file
    res.download(outputFile, () => {
      // Cleanup
      fs.unlinkSync(videoFile);
      fs.unlinkSync(audioFile);
      fs.unlinkSync(outputFile);
    });

  } catch (err) {
    console.error("❌ Merge error:", err);
    res.status(500).json({ error: "Failed to download or merge video" });
  }
});



app.post("/api/download-thumbnail-file", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    const client = url.startsWith("https") ? https : http;

    client.get(url, (streamRes) => {
      res.setHeader("Content-Disposition", 'attachment; filename="thumbnail.jpg"');
      res.setHeader("Content-Type", "image/jpeg");
      streamRes.pipe(res);
    }).on("error", (err) => {
      console.error("❌ Thumbnail stream error:", err);
      res.status(500).json({ error: "Failed to download thumbnail" });
    });

  } catch (err) {
    console.error("❌ Error downloading thumbnail:", err);
    res.status(500).json({ error: "Server error" });
  }
});


const https = require("https");
const http = require("http");

app.get("/api/stream", (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ error: "No URL provided" });
  }

  try {
    const client = videoUrl.startsWith("https") ? https : http;

    client.get(videoUrl, (streamRes) => {
      // Set headers to tell browser to download
      res.setHeader("Content-Disposition", `attachment; filename="video.mp4"`);
      res.setHeader("Content-Type", "video/mp4");

      // Pipe response from YouTube to user
      streamRes.pipe(res);
    }).on("error", (err) => {
      console.error("❌ Stream error:", err);
      res.status(500).json({ error: "Failed to stream video" });
    });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});


app.post("/api/download-audio", async (req, res) => {
  const { url, audioFormat } = req.body;
  if (!url || !audioFormat) {
    return res.status(400).json({ error: "URL or audio format missing" });
  }

  const filename = `audio-${Date.now()}.${audioFormat}`;
  const filepath = path.join(__dirname, filename);

  try {
    await youtubedl(url, {
      output: filepath,
      extractAudio: true,
      audioFormat: audioFormat, // 'mp3', 'wav', etc.
      audioQuality: 0, // best
      // ❌ REMOVE ffmpegLocation if ffmpeg is already in PATH
      // ✅ Uncomment below if you want to provide full path manually
      // ffmpegLocation: "C:\\ffmpeg\\bin\\ffmpeg.exe"
    });

    // Send file to client
    res.download(filepath, () => {
      fs.unlinkSync(filepath); // delete after sending
    });

  } catch (err) {
    console.error("❌ Audio Download error:", err);
    res.status(500).json({ error: "Audio download failed" });
  }
});




app.listen(port, () =>
  console.log(`✅ Server running at http://localhost:${port}`)
);
