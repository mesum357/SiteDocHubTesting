import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SWEEP_TARGET_DEG = 120;
const CAPTURE_STEP_DEG = 12;
const MIN_CAPTURED_FRAMES = 4;
const MIN_SWEEP_DEG_FOR_STITCH = 40;
const OVERLAP_PX = 20;

const normalizeAngle = (value) => {
  let angle = Number(value ?? 0);
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
};

const shortestAngularDistance = (from, to) => {
  const a = normalizeAngle(from);
  const b = normalizeAngle(to);
  let delta = b - a;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};

const headingFromEvent = (event) => {
  if (typeof event.alpha === "number") {
    return normalizeAngle(event.alpha);
  }
  if (typeof event.gamma === "number") {
    // Fallback when alpha is unavailable.
    return normalizeAngle(event.gamma + 180);
  }
  return null;
};

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const blendOverlap = (previousFrame, currentFrame, overlap, frameHeight) => {
  const overlapCanvas = document.createElement("canvas");
  overlapCanvas.width = overlap;
  overlapCanvas.height = frameHeight;
  const overlapCtx = overlapCanvas.getContext("2d");
  if (!overlapCtx) return overlapCanvas;

  overlapCtx.drawImage(
    previousFrame,
    previousFrame.width - overlap,
    0,
    overlap,
    frameHeight,
    0,
    0,
    overlap,
    frameHeight,
  );
  const previousData = overlapCtx.getImageData(0, 0, overlap, frameHeight);

  overlapCtx.clearRect(0, 0, overlap, frameHeight);
  overlapCtx.drawImage(
    currentFrame,
    0,
    0,
    overlap,
    frameHeight,
    0,
    0,
    overlap,
    frameHeight,
  );
  const currentData = overlapCtx.getImageData(0, 0, overlap, frameHeight);

  const out = overlapCtx.createImageData(overlap, frameHeight);
  for (let x = 0; x < overlap; x += 1) {
    const t = overlap <= 1 ? 1 : x / (overlap - 1);
    for (let y = 0; y < frameHeight; y += 1) {
      const idx = (y * overlap + x) * 4;
      out.data[idx] = previousData.data[idx] * (1 - t) + currentData.data[idx] * t;
      out.data[idx + 1] = previousData.data[idx + 1] * (1 - t) + currentData.data[idx + 1] * t;
      out.data[idx + 2] = previousData.data[idx + 2] * (1 - t) + currentData.data[idx + 2] * t;
      out.data[idx + 3] = 255;
    }
  }

  overlapCtx.putImageData(out, 0, 0);
  return overlapCanvas;
};

export const usePanorama = ({ onUploadSuccess, onUploadBlob, uploadEndpoint = "/api/upload-panorama" } = {}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pendingPlayRef = useRef(false);
  const sweepRef = useRef({
    active: false,
    startHeading: null,
    lastCapturedSweepDeg: 0,
    nextCaptureDeg: CAPTURE_STEP_DEG,
    flashToken: 0,
  });
  const framesRef = useRef([]);

  const [state, setState] = useState("ready");
  const [error, setError] = useState("");
  const [motionPermissionNeeded, setMotionPermissionNeeded] = useState(false);
  const [motionPermissionGranted, setMotionPermissionGranted] = useState(false);
  const [manualSweepMode, setManualSweepMode] = useState(false);
  const [sweptDeg, setSweptDeg] = useState(0);
  const [capturedCount, setCapturedCount] = useState(0);
  const [flashToken, setFlashToken] = useState(0);
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");

  const supportsDeviceOrientation = typeof window !== "undefined" && "DeviceOrientationEvent" in window;

  const resetSweep = useCallback(() => {
    sweepRef.current = {
      active: false,
      startHeading: null,
      lastCapturedSweepDeg: 0,
      nextCaptureDeg: CAPTURE_STEP_DEG,
      flashToken: 0,
    };
    framesRef.current = [];
    setSweptDeg(0);
    setCapturedCount(0);
    setFlashToken(0);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const ensureCamera = useCallback(async () => {
    if (streamRef.current) {
      pendingPlayRef.current = true;
      return;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError("Camera API is unavailable in this browser context. On iPhone, open this app in Safari over HTTPS.");
      setState("error");
      throw new Error("getUserMedia unavailable");
    }

    if (!window.isSecureContext) {
      setError("Camera requires a secure context on iPhone. Open this app over HTTPS, then allow camera access in Safari.");
      setState("error");
      throw new Error("Insecure context");
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      pendingPlayRef.current = true;
    } catch (cameraError) {
      let message = "Camera access denied. Please allow rear camera access and try again.";
      // iPhone Safari commonly throws NotAllowedError for both explicit deny and site-level block.
      if (cameraError && typeof cameraError === "object" && "name" in cameraError) {
        const name = String(cameraError.name);
        if (name === "NotAllowedError") {
          message =
            "Camera access was blocked. In Safari tap aA > Website Settings > Camera > Allow, then reload this page.";
        } else if (name === "NotReadableError") {
          message = "Camera is currently in use by another app. Close other camera apps and try again.";
        }
      }
      setError(message);
      setState("error");
      throw cameraError;
    }
  }, []);

  const requestMotionPermission = useCallback(async () => {
    if (!supportsDeviceOrientation) {
      setManualSweepMode(true);
      return false;
    }

    const orientationType = window.DeviceOrientationEvent;
    if (typeof orientationType?.requestPermission === "function") {
      try {
        const result = await orientationType.requestPermission();
        if (result !== "granted") {
          // iOS can block motion access; keep capture usable with manual mode.
          setManualSweepMode(true);
          return false;
        }
      } catch {
        setManualSweepMode(true);
        return false;
      }
    }

    setMotionPermissionGranted(true);
    return true;
  }, [supportsDeviceOrientation]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return false;

    const frameCanvas = document.createElement("canvas");
    frameCanvas.width = video.videoWidth;
    frameCanvas.height = video.videoHeight;
    const ctx = frameCanvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height);
    framesRef.current.push(frameCanvas);
    setCapturedCount(framesRef.current.length);
    sweepRef.current.flashToken += 1;
    setFlashToken(sweepRef.current.flashToken);
    return true;
  }, []);

  const stitchFrames = useCallback(() => {
    const frames = framesRef.current;
    if (frames.length === 0) {
      throw new Error("No frames captured");
    }

    const frameWidth = frames[0].width;
    const frameHeight = frames[0].height;
    const overlap = Math.min(OVERLAP_PX, Math.max(0, frameWidth - 1));
    const stitchedWidth =
      frames.length === 1
        ? frameWidth
        : frameWidth + (frames.length - 1) * (frameWidth - overlap);

    const output = document.createElement("canvas");
    output.width = stitchedWidth;
    output.height = frameHeight;
    const outCtx = output.getContext("2d");
    if (!outCtx) {
      throw new Error("Canvas export failed");
    }

    outCtx.drawImage(frames[0], 0, 0);
    let cursorX = frameWidth - overlap;

    for (let i = 1; i < frames.length; i += 1) {
      const previous = frames[i - 1];
      const current = frames[i];

      if (overlap > 0) {
        const blended = blendOverlap(previous, current, overlap, frameHeight);
        outCtx.drawImage(blended, cursorX, 0);
      }

      outCtx.drawImage(
        current,
        overlap,
        0,
        frameWidth - overlap,
        frameHeight,
        cursorX + overlap,
        0,
        frameWidth - overlap,
        frameHeight,
      );
      cursorX += frameWidth - overlap;
    }

    return output;
  }, []);

  const finishSweep = useCallback(() => {
    sweepRef.current.active = false;

    if (framesRef.current.length < MIN_CAPTURED_FRAMES || sweptDeg < MIN_SWEEP_DEG_FOR_STITCH) {
      setError("Sweep was too short for a stable panorama. Move more slowly and cover a wider angle before tapping Done.");
      setState("error");
      return;
    }

    try {
      const stitched = stitchFrames();
      const dataUrl = stitched.toDataURL("image/jpeg", 0.9);
      setPreviewDataUrl(dataUrl);
      setState("preview");
    } catch {
      setError("Failed to export panorama image. Please try again.");
      setState("error");
    }
  }, [stitchFrames, sweptDeg]);

  const waitForVideoReady = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return true;

    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("canplay", onReady);
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(true);
      };
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("canplay", onReady);
      window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
      }, 2000);
    });
  }, []);

  const startSweep = useCallback(async () => {
    setError("");
    setUploadedUrl("");
    setPreviewDataUrl("");

    if (!motionPermissionGranted) {
      const granted = await requestMotionPermission();
      if (!granted) {
        await ensureCamera();
        resetSweep();
        sweepRef.current.active = true;
        setState("sweeping");
        const ready = await waitForVideoReady();
        if (!ready) {
          setError("Camera preview could not start. Please wait a moment and try again.");
          setState("error");
          return;
        }
        captureFrame();
        return;
      }
    }

    await ensureCamera();
    resetSweep();
    sweepRef.current.active = true;
    setState("sweeping");

    // Capture initial anchor frame at 0° so stitching has a start image.
    const ready = await waitForVideoReady();
    if (!ready) {
      setError("Camera preview could not start. Please wait a moment and try again.");
      setState("error");
      return;
    }
    captureFrame();
  }, [captureFrame, ensureCamera, motionPermissionGranted, requestMotionPermission, resetSweep, waitForVideoReady]);

  const doneEarly = useCallback(() => {
    if (state === "sweeping") finishSweep();
  }, [finishSweep, state]);

  const captureManualStep = useCallback(() => {
    if (state !== "sweeping") return;
    const captured = captureFrame();
    if (!captured) return;
    // Simulate 15° progress increments in manual mode.
    setSweptDeg((prev) => {
      const next = Math.min(SWEEP_TARGET_DEG, prev + CAPTURE_STEP_DEG);
      if (next >= SWEEP_TARGET_DEG) {
        setTimeout(() => finishSweep(), 0);
      }
      return next;
    });
  }, [captureFrame, finishSweep, state]);

  const uploadPanorama = useCallback(async () => {
    if (!previewDataUrl) return;

    setState("uploading");
    setError("");

    try {
      const imageBlob = await dataUrlToBlob(previewDataUrl);
      let url = "";

      if (typeof onUploadBlob === "function") {
        url = await onUploadBlob(imageBlob);
      } else {
        const formData = new FormData();
        formData.append("image", imageBlob, `panorama-${Date.now()}.jpg`);

        const response = await fetch(uploadEndpoint, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Upload failed");
        const payload = await response.json();
        url = payload?.url ?? "";
      }

      setUploadedUrl(url);
      setState("success");
      if (typeof onUploadSuccess === "function") onUploadSuccess(url);
    } catch {
      setError("Upload failed. Please check your connection and try again.");
      setState("error");
    }
  }, [onUploadBlob, onUploadSuccess, previewDataUrl, uploadEndpoint]);

  const resetToReady = useCallback(() => {
    resetSweep();
    setError("");
    setPreviewDataUrl("");
    setUploadedUrl("");
    setManualSweepMode(false);
    setState("ready");
  }, [resetSweep]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      void video.play().catch(() => {
        pendingPlayRef.current = true;
      });
    }
  }, [state]);

  useEffect(() => {
    if (!supportsDeviceOrientation) return undefined;

    const orientationType = window.DeviceOrientationEvent;
    const needsPermissionButton = typeof orientationType?.requestPermission === "function";
    setMotionPermissionNeeded(needsPermissionButton);
    if (!needsPermissionButton) setMotionPermissionGranted(true);

    const onOrientation = (event) => {
      const sweep = sweepRef.current;
      if (!sweep.active) return;

      const heading = headingFromEvent(event);
      if (heading === null) return;

      if (sweep.startHeading === null) {
        sweep.startHeading = heading;
        return;
      }

      const swept = Math.abs(shortestAngularDistance(sweep.startHeading, heading));
      setSweptDeg(Math.min(SWEEP_TARGET_DEG, Math.round(swept)));

      if (swept >= sweep.nextCaptureDeg) {
        const captured = captureFrame();
        if (captured) {
          sweep.lastCapturedSweepDeg = swept;
          sweep.nextCaptureDeg += CAPTURE_STEP_DEG;
        }
      }

      if (swept >= SWEEP_TARGET_DEG) {
        finishSweep();
      }
    };

    window.addEventListener("deviceorientation", onOrientation, true);
    return () => {
      window.removeEventListener("deviceorientation", onOrientation, true);
    };
  }, [captureFrame, finishSweep, supportsDeviceOrientation]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const progressPercent = useMemo(() => {
    return Math.max(0, Math.min(100, (sweptDeg / SWEEP_TARGET_DEG) * 100));
  }, [sweptDeg]);

  return {
    videoRef,
    state,
    error,
    supportsDeviceOrientation,
    motionPermissionNeeded,
    motionPermissionGranted,
    sweptDeg,
    targetDeg: SWEEP_TARGET_DEG,
    capturedCount,
    progressPercent,
    flashToken,
    previewDataUrl,
    uploadedUrl,
    manualSweepMode,
    startSweep,
    doneEarly,
    captureManualStep,
    uploadPanorama,
    resetToReady,
    requestMotionPermission,
  };
};
