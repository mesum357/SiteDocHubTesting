import styles from "./PanoramaCapture.module.css";
import { usePanorama } from "./usePanorama";

export default function PanoramaCapture({ onUploadSuccess, onUploadBlob, uploadEndpoint = "/api/upload-panorama" }) {
  const {
    videoRef,
    state,
    error,
    supportsDeviceOrientation,
    motionPermissionNeeded,
    motionPermissionGranted,
    sweptDeg,
    targetDeg,
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
  } = usePanorama({
    onUploadSuccess,
    onUploadBlob,
    uploadEndpoint,
  });

  if (!supportsDeviceOrientation) {
    return (
      <div className={styles.root}>
        <p className={`${styles.status} ${styles.error}`}>
          Device motion is not supported on this browser/device.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {state === "ready" && (
        <>
          <p className={styles.instruction}>
            Hold your phone upright and sweep slowly left to right.
          </p>
          <div className={styles.actions}>
            {motionPermissionNeeded && !motionPermissionGranted && (
              <button type="button" className={styles.secondaryButton} onClick={requestMotionPermission}>
                Enable Motion Sensor
              </button>
            )}
            <button type="button" className={styles.primaryButton} onClick={startSweep}>
              Start Sweep
            </button>
          </div>
        </>
      )}

      {state === "sweeping" && (
        <>
          <div className={styles.previewWrap}>
            <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
            <span key={flashToken} className={styles.flash} />
          </div>
          <div className={styles.progressRow}>
            <span>Swept: {sweptDeg}° / {targetDeg}°</span>
            <span>Frames: {capturedCount}</span>
          </div>
          {manualSweepMode ? (
            <p className={styles.instruction}>
              Motion sensor unavailable. Pan slowly and tap Capture Frame at each step.
            </p>
          ) : null}
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <div className={styles.actions}>
            {manualSweepMode ? (
              <button type="button" className={styles.primaryButton} onClick={captureManualStep}>
                Capture Frame
              </button>
            ) : null}
            <button type="button" className={styles.secondaryButton} onClick={doneEarly}>
              Done
            </button>
          </div>
        </>
      )}

      {state === "preview" && (
        <>
          <img src={previewDataUrl} alt="Panorama preview" className={styles.panoramaPreview} />
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={uploadPanorama}>
              Upload
            </button>
            <button type="button" className={styles.secondaryButton} onClick={resetToReady}>
              Retake
            </button>
          </div>
        </>
      )}

      {state === "uploading" && (
        <div className={styles.spinnerRow}>
          <span className={styles.spinner} />
          <span>Uploading panorama...</span>
        </div>
      )}

      {state === "success" && (
        <>
          <p className={`${styles.status} ${styles.success}`}>Panorama uploaded successfully!</p>
          {uploadedUrl ? (
            <>
              <a href={uploadedUrl} target="_blank" rel="noreferrer" className={styles.instruction}>
                {uploadedUrl}
              </a>
              <img src={uploadedUrl} alt="Uploaded panorama" className={styles.panoramaPreview} />
            </>
          ) : null}
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={resetToReady}>
              Capture Another
            </button>
          </div>
        </>
      )}

      {state === "error" && (
        <>
          <p className={`${styles.status} ${styles.error}`}>{error || "Something went wrong."}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={resetToReady}>
              Try Again
            </button>
          </div>
        </>
      )}
    </div>
  );
}
