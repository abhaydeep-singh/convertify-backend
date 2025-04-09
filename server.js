const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const cors = require("cors");
const app = express();
const port = 5000;

// Enable CORS for all routes
app.use(cors());


// Setup storage for uploaded files
const upload = multer({ dest: "uploads/" });

// WebSocket Server
const wss = new WebSocket.Server({ port: 8080 });

// Job queue to track conversions
const jobQueue = {};

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
    const jobId = req.url.split("?jobId=")[1]; // Extract jobId from URL

    if (!jobQueue[jobId]) {
        ws.send(JSON.stringify({ error: "Invalid job ID" }));
        ws.close();
        return;
    }

    jobQueue[jobId].socket = ws;
    console.log(`Client connected for job: ${jobId}`);
});
app.post("/ping", (req,res)=>{
    res.send("Pong")
})
// Upload API - Accepts a video file
app.post("/upload/:outputFormat", upload.single("video"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const jobId = uuidv4(); // Generate a unique job ID
    const inputPath = req.file.path;
    const outputFormat = req.params.outputFormat;
    const outputPath = `converted/${jobId}.${outputFormat}`;

    jobQueue[jobId] = { status: "processing", progress: 0, socket: null };

    // Start conversion
    convertVideo(jobId, inputPath, outputPath,outputFormat);

    res.json({ jobId, message: "Upload successful. Conversion started!" });
});

// Video conversion function
const convertVideo = (jobId, inputPath, outputPath,outputFormat) => {
    ffmpeg(inputPath)
        .output(outputPath)
        .on("progress", (progress) => {
            if (jobQueue[jobId]?.socket) {
                jobQueue[jobId].socket.send(JSON.stringify({ progress: progress.percent.toFixed(2) }));
            }
        })
        .on("end", () => {
            if (jobQueue[jobId]?.socket) {
                jobQueue[jobId].socket.send(JSON.stringify({ status: "done", download: `/download/${jobId}.${outputFormat}` }));
            }
            jobQueue[jobId].status = "completed";

            // Auto delete after 1 hour
            setTimeout(() => {
                fs.unlink(outputPath, () => console.log(`Deleted: ${outputPath}`));
            }, 3600 * 1000);
        })
        .on("error", (err) => console.error("FFmpeg error:", err))
        .run();
};

// Download API - Fetch converted video
app.get("/download/:path", (req, res) => {
    const path = req.params.path;
    const filePath = `converted/${path}`;

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

    res.download(filePath);
});

// Start Express server
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
