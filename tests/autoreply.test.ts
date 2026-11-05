import { test } from "node:test";
import assert from "node:assert/strict";
import { hasKeyword, matchRule, pickReply, publicReply, fillDm, parseComments, normaliseKeyword } from "../lib/autoreply.ts";

const rule = (o: Partial<any>) => ({ id: "r", keyword: "CAKE", media_id: null, active: true, public_replies: ["Sent!"], dm_text: "Hi {name}! {link}", ...o });

test("keyword matching", () => {
  assert.ok(hasKeyword("cake!!", "CAKE"));
  assert.ok(hasKeyword("CAKE 🎂", "CAKE"));
  assert.ok(hasKeyword("yes Cake please", "CAKE"));
  assert.equal(hasKeyword("cupcake", "CAKE"), false);
  assert.equal(normaliseKeyword(" cake! "), "CAKE");
});

test("post rule beats every-post rule; paused rules ignored", () => {
  const all = rule({ id: "all" }), post = rule({ id: "post", media_id: "M1" }), off = rule({ id: "off", keyword: "BREAD", active: false });
  assert.equal(matchRule("CAKE", "M1", [all, post])?.id, "post");
  assert.equal(matchRule("CAKE", "M2", [all, post])?.id, "all");
  assert.equal(matchRule("BREAD", "M1", [off]), null);
  assert.equal(matchRule("hello", "M1", [all]), null);
});

test("replies and DMs", () => {
  assert.equal(pickReply(["A", "B", "C"], "x"), pickReply(["A", "B", "C"], "x"));
  assert.equal(pickReply([" ", ""], "x"), "Sent! Check your DMs");
  assert.equal(publicReply("tara.best", "Sent!"), "@tara.best Sent!");
  assert.equal(fillDm("Hi {name}! Order here: {link}", { username: "tara.best", link: "https://islandcrumb.com/cake" }), "Hi Tara! Order here: https://islandcrumb.com/cake");
  assert.equal(fillDm("Hi {name}!", { username: null, link: "L" }), "Hi there!\nL");
});

test("parses Instagram comment webhooks", () => {
  const p = { object: "instagram", entry: [{ id: "17841", changes: [
    { field: "comments", value: { id: "c1", text: "CAKE", media: { id: "m1" }, from: { id: "u1", username: "tara.best" } } },
    { field: "mentions", value: { comment_id: "x" } },
  ] }] };
  assert.deepEqual(parseComments(p), [{ igUserId: "17841", commentId: "c1", text: "CAKE", mediaId: "m1", fromId: "u1", fromUsername: "tara.best" }]);
  assert.deepEqual(parseComments({ object: "page" }), []);
});

test("instagram DMs parse, with echoes and attachments", async () => {
  const { parseIgMessages } = await import("../lib/autoreply.ts");
  const p = { object: "instagram", entry: [{ id: "IG1", messaging: [
    { sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 1, message: { mid: "m1", text: "Hi, price for black cake?" } },
    { sender: { id: "IG1" }, recipient: { id: "U1" }, timestamp: 2, message: { mid: "m2", text: "BBD 60", is_echo: true } },
    { sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 3, message: { mid: "m3", attachments: [{ type: "image" }] } },
    { sender: { id: "U1" }, recipient: { id: "IG1" }, timestamp: 4, read: { mid: "m1" } },
  ] }] };
  const out = parseIgMessages(p);
  assert.equal(out.length, 3);
  assert.equal(out[1].isEcho, true);
  assert.equal(out[2].text, "[image]");
  assert.deepEqual(parseIgMessages({ object: "page" }), []);
});
