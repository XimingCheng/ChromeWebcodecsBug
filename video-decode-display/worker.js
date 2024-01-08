importScripts(
  "demuxer_mp4.js",
  "renderer_2d.js",
  "renderer_webgl.js",
  "renderer_webgpu.js"
);

// Status UI. Messages are batched per animation frame.
let pendingStatus = null;

function setStatus(type, message) {
  if (pendingStatus) {
    pendingStatus[type] = message;
  } else {
    pendingStatus = { [type]: message };
    self.requestAnimationFrame(statusAnimationFrame);
  }
}

function statusAnimationFrame() {
  self.postMessage(pendingStatus);
  pendingStatus = null;
}

// Rendering. Drawing is limited to once per animation frame.
let renderer = null;
let pendingFrame = null;
let startTime = null;
let frameCount = 1;
let savedFrameCount = 1;

function renderFrame(frame, count) {
  if (!pendingFrame) {
    // Schedule rendering in the next animation frame.
    requestAnimationFrame(renderAnimationFrame);
  } else {
    // Close the current pending frame before replacing it.
    pendingFrame.close();
  }
  // Set or replace the pending frame.
  pendingFrame = frame;
  savedFrameCount = count;
}

function renderAnimationFrame() {
  console.log("savedFrameCount ", savedFrameCount);
  renderer.draw(pendingFrame, savedFrameCount);
  pendingFrame = null;
}

// Startup.
function start({ dataUri, rendererName, canvas }) {
  // Pick a renderer to use.
  switch (rendererName) {
    case "2d":
      renderer = new Canvas2DRenderer(canvas);
      break;
    case "webgl":
      renderer = new WebGLRenderer(rendererName, canvas);
      break;
    case "webgl2":
      renderer = new WebGLRenderer(rendererName, canvas);
      break;
    case "webgpu":
      renderer = new WebGPURenderer(canvas);
      break;
  }

  async function onRecvWebCodecFrame(frame) {
    // Update statistics.
    if (startTime == null) {
      startTime = performance.now();
    } else {
      const elapsed = (performance.now() - startTime) / 1000;
      const fps = ++frameCount / elapsed;
      setStatus("render", `${fps.toFixed(0)} fps`);
    }
    console.log("onRecvWebCodecFrame ", frameCount);

    // if run the below code (call copyTo), bug will appear
    const frameSize = frame.allocationSize();
    const data = new Uint8Array(frameSize);
    await frame.copyTo(data);

    // Schedule the frame to be rendered.
    renderFrame(frame, frameCount);
  }

  // Set up a VideoDecoer.
  const decoder = new VideoDecoder({
    output(frame) {
      onRecvWebCodecFrame(frame);
    },
    error(e) {
      setStatus("decode", e);
    },
  });

  // Fetch and demux the media data.
  const demuxer = new MP4Demuxer(dataUri, {
    onConfig(config) {
      // force prefer-hardware
      config.hardwareAcceleration = "prefer-hardware";
      config.optimizeForLatency = true;
      setStatus(
        "decode",
        `${config.codec} @ ${config.codedWidth}x${config.codedHeight}`
      );
      decoder.configure(config);
    },
    onChunk(chunk) {
      decoder.decode(chunk);
    },
    setStatus,
  });
}

// Listen for the start request.
self.addEventListener("message", (message) => start(message.data), {
  once: true,
});
