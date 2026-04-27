import { describe, expect, it } from "vitest";
import { normalizePinPhotoPath } from "./storagePaths";

describe("normalizePinPhotoPath", () => {
  it("returns canonical storage path unchanged", () => {
    expect(normalizePinPhotoPath("job1/floor2/pin3.jpg")).toBe(
      "job1/floor2/pin3.jpg"
    );
  });

  it("extracts storage path from Supabase storage URL", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/sign/pin-photos/job1/floor2/pin3.jpg?token=xyz";
    expect(normalizePinPhotoPath(url)).toBe("job1/floor2/pin3.jpg");
  });

  it("decodes URL-encoded path segments", () => {
    const url =
      "https://abc.supabase.co/storage/v1/object/sign/pin-photos/job%201/floor%202/pin%203.jpg?token=xyz";
    expect(normalizePinPhotoPath(url)).toBe("job 1/floor 2/pin 3.jpg");
  });

  it("returns null for blob URLs", () => {
    expect(normalizePinPhotoPath("blob:http://localhost:8080/123")).toBeNull();
  });

  it("returns null for unrelated URLs", () => {
    expect(normalizePinPhotoPath("https://example.com/image.jpg")).toBeNull();
  });

  it("returns null for empty inputs", () => {
    expect(normalizePinPhotoPath("")).toBeNull();
    expect(normalizePinPhotoPath("   ")).toBeNull();
    expect(normalizePinPhotoPath(null)).toBeNull();
    expect(normalizePinPhotoPath(undefined)).toBeNull();
  });
});

