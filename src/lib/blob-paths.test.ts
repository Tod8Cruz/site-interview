import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlobUrlFor, isPublicBlobUrl, isRecordingPathname } from "./blob-paths";

const id = "0b7c3a52-1f7e-4c1a-9a43-6d2f1e8b9c10";
const other = "9f1d2c33-4b5a-4e6f-8a7b-1c2d3e4f5a6b";

test("isRecordingPathname은 그 면접의 녹음 경로만 받는다", () => {
  assert.ok(isRecordingPathname(id, `interviews/${id}-0.webm`));
  assert.ok(isRecordingPathname(id, `interviews/${id}-125000-AbC123xyz.m4a`));
  assert.ok(!isRecordingPathname(id, `interviews/${other}-0.webm`));
  assert.ok(!isRecordingPathname(id, `interviews/${id}-0.webm/../x`));
  assert.ok(!isRecordingPathname(id, `other/${id}-0.webm`));
  assert.ok(!isRecordingPathname(id, `interviews/${id}-abc.webm`));
});

test("isBlobUrlFor는 Vercel Blob의 같은 경로 URL만 받는다", () => {
  const pathname = `interviews/${id}-0-AbC.webm`;
  assert.ok(isBlobUrlFor(`https://store1.private.blob.vercel-storage.com/${pathname}`, pathname));
  assert.ok(!isBlobUrlFor(`https://evil.example.com/${pathname}`, pathname));
  assert.ok(!isBlobUrlFor(`http://store1.private.blob.vercel-storage.com/${pathname}`, pathname));
  assert.ok(!isBlobUrlFor(`https://store1.private.blob.vercel-storage.com/interviews/${other}-0.webm`, pathname));
  assert.ok(!isBlobUrlFor("not a url", pathname));
});

test("isPublicBlobUrl은 공개 저장소 URL을 가려낸다", () => {
  assert.ok(isPublicBlobUrl("https://abc.public.blob.vercel-storage.com/x.webm"));
  assert.ok(!isPublicBlobUrl("https://abc.private.blob.vercel-storage.com/x.webm"));
});
