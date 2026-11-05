import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPost, finalStatus, frameFor, igCrop, postShape } from "../lib/posts.ts";

const now = new Date("2026-11-04T12:00:00Z");
const later = new Date("2026-11-05T12:00:00Z");

test("valid posts pass", () => {
  assert.equal(checkPost({ kinds: ["image"], platforms: ["instagram", "facebook"], caption: "Hi", when: later, now }), null);
  assert.equal(checkPost({ kinds: ["video"], platforms: ["facebook"], caption: "", when: later, now }), null);
  assert.equal(checkPost({ kinds: ["image", "video"], platforms: ["instagram"], caption: "", when: later, now }), null);
});

test("problems are explained", () => {
  assert.match(checkPost({ kinds: [], platforms: ["instagram"], caption: "", when: later, now })!, /at least one/);
  assert.match(checkPost({ kinds: ["image"], platforms: [], caption: "", when: later, now })!, /Instagram, Facebook/);
  assert.match(checkPost({ kinds: Array(11).fill("image"), platforms: ["instagram"], caption: "", when: later, now })!, /up to 10/);
  assert.match(checkPost({ kinds: ["image"], platforms: ["instagram"], caption: "", when: new Date("2026-11-04T11:00:00Z"), now })!, /passed/);
  assert.match(checkPost({ kinds: ["image", "video"], platforms: ["facebook"], caption: "", when: later, now })!, /Facebook can't mix/);
  assert.match(checkPost({ kinds: ["image"], platforms: ["instagram"], caption: Array(31).fill("#tag").join(" "), when: later, now })!, /hashtags/);
  assert.match(checkPost({ kinds: ["image"], platforms: ["instagram"], caption: "", when: new Date("bad"), now })!, /date/);
});

test("post shape per platform", () => {
  assert.deepEqual(postShape(["video"]), { instagram: "Reel", facebook: "Video" });
  assert.deepEqual(postShape(["image"]), { instagram: "Photo", facebook: "Photo" });
  assert.equal(postShape(["image", "image"]).instagram, "Carousel");
});

test("final status", () => {
  assert.equal(finalStatus(["instagram", "facebook"], { instagram: "ok", facebook: "ok" }), "published");
  assert.equal(finalStatus(["instagram", "facebook"], { instagram: "ok", facebook: "failed" }), "partial");
  assert.equal(finalStatus(["instagram"], { instagram: "failed" }), "failed");
  assert.equal(finalStatus(["instagram", "facebook"], { instagram: "pending", facebook: "ok" }), "publishing");
});

test("Instagram crop keeps 4:5 to 1.91:1", () => {
  assert.deepEqual(igCrop(1080, 1350), { x: 0, y: 0, w: 1080, h: 1350 });
  assert.deepEqual(igCrop(1080, 1920), { x: 0, y: 285, w: 1080, h: 1350 });
  const wide = igCrop(3000, 1000);
  assert.equal(wide.h, 1000); assert.equal(wide.w, 1910); assert.equal(wide.x, 545);
});

test("9:16 photos can't go to the Instagram feed", () => {
  const tall = 1080 / 1920;
  assert.match(checkPost({ kinds: ["image"], ratios: [tall], platforms: ["instagram"], caption: "", when: later, now })!, /taller than 4:5/);
  assert.equal(checkPost({ kinds: ["image"], ratios: [tall], platforms: ["facebook"], caption: "", when: later, now }), null);
  assert.equal(checkPost({ kinds: ["video"], ratios: [tall], platforms: ["instagram"], caption: "", when: later, now }), null);
  assert.equal(checkPost({ kinds: ["image"], ratios: [0.8], platforms: ["instagram"], caption: "", when: later, now }), null);
});

test("crop frames for horizontal media", () => {
  assert.deepEqual(frameFor(1920, 1080, 4 / 5), { x: 528, y: 0, w: 864, h: 1080 });
  assert.deepEqual(frameFor(1920, 1080, 9 / 16), { x: 656, y: 0, w: 608, h: 1080 });
  assert.deepEqual(frameFor(1000, 2000, 4 / 5), { x: 0, y: 375, w: 1000, h: 1250 });
});
