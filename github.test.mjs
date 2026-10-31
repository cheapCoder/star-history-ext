import { test } from "node:test";
import assert from "node:assert/strict";
import { getRepoStarRecords, repoFromUrl } from "./extension/assets/github.js";

const DAY = 86400;
const nowSec = Math.floor(Date.now() / 1000);
const today = Math.floor(nowSec / DAY);
const thisWeek = (today - ((today + 4) % 7)) * DAY;

const dateString = (sec) => {
  const d = new Date(sec * 1000);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};

function history(weekCount) {
  return Array.from({ length: weekCount }, (_, i) => {
    const week = thisWeek - i * 7 * DAY;
    const days = Array.from({ length: 7 }, (_, d) => (week + d * DAY <= nowSec ? 1 : 0));
    return { week, total: days.reduce((a, b) => a + b, 0), days };
  });
}

function mockGitHub(weeks, status = 200) {
  const calls = [];
  const pageCount = Math.max(1, Math.ceil(weeks.length / 30));
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (status !== 200) return new Response(JSON.stringify({ message: "error" }), { status });
    const page = Number(new URL(url).searchParams.get("page") || 1);
    const base = "https://api.github.com/repositories/1/stargazers/history";
    const headers = page === 1 && pageCount > 1
      ? { link: `<${base}?page=2>; rel="next", <${base}?page=${pageCount}>; rel="last"` }
      : {};
    return new Response(JSON.stringify(weeks.slice((page - 1) * 30, page * 30)), { status, headers });
  };
  return calls;
}

test("从标签页地址取 owner/repo，忽略锚点、参数和子路径", () => {
  assert.equal(repoFromUrl("https://github.com/promptfoo/promptfoo#readme"), "promptfoo/promptfoo");
  assert.equal(repoFromUrl("https://github.com/promptfoo/promptfoo?tab=readme-ov-file"), "promptfoo/promptfoo");
  assert.equal(repoFromUrl("https://github.com/promptfoo/promptfoo/tree/main/src"), "promptfoo/promptfoo");
  assert.equal(repoFromUrl("https://github.com/promptfoo"), "");
  assert.equal(repoFromUrl("https://gitlab.com/a/b"), "");
});

test("拉全所有页，按时间升序累加到当前总数", async () => {
  const weeks = history(65);
  const calls = mockGitHub(weeks);
  const records = await getRepoStarRecords("o/r");

  assert.deepEqual(calls.map((c) => new URL(c.url).searchParams.get("page")).sort(), ["1", "2", "3"]);
  assert.ok(calls.every((c) => c.url.startsWith("https://api.github.com/repos/o/r/stargazers/history")));
  assert.ok(records.length >= 2 && records.length <= 30);
  for (let i = 1; i < records.length; i++) {
    assert.ok(records[i].count >= records[i - 1].count);
    assert.ok(new Date(records[i].date) > new Date(records[i - 1].date));
  }
  const oldest = weeks[weeks.length - 1];
  assert.deepEqual(records[0], { date: dateString(oldest.week + 6 * DAY), count: oldest.total });
  assert.deepEqual(records.at(-1), {
    date: dateString(nowSec),
    count: weeks.reduce((sum, w) => sum + w.total, 0),
  });
});

test("短历史每周一个点，只发一个请求", async () => {
  const weeks = history(3);
  const calls = mockGitHub(weeks);
  const records = await getRepoStarRecords("o/r");

  assert.equal(calls.length, 1);
  assert.deepEqual(records.map((r) => r.count), [7, 14, 14 + weeks[0].total]);
});

test("一颗星都没有时抛 data: []，弹窗显示 no star history", async () => {
  mockGitHub([]);
  await assert.rejects(getRepoStarRecords("o/r"), (err) => {
    assert.equal(err.response.status, 200);
    assert.deepEqual(err.data, []);
    return true;
  });
});

test("接口报错原样抛出状态码，弹窗据此提示", async () => {
  for (const status of [401, 403, 404]) {
    mockGitHub(history(1), status);
    await assert.rejects(getRepoStarRecords("o/r"), (err) => err.response.status === status);
  }
});

test("固定接口版本，token 只在有值时带上", async () => {
  let calls = mockGitHub(history(1));
  await getRepoStarRecords("o/r");
  assert.equal(calls[0].headers["X-GitHub-Api-Version"], "2026-03-10");
  assert.equal("Authorization" in calls[0].headers, false);

  calls = mockGitHub(history(1));
  await getRepoStarRecords("o/r", "abc");
  assert.equal(calls[0].headers.Authorization, "token abc");
});

test("本周没过完时最后一个点取当前时间，不受时区影响", async () => {
  const realNow = Date.now;
  const realTz = process.env.TZ;
  const week = Date.UTC(2026, 9, 25) / 1000;
  process.env.TZ = "Asia/Shanghai";
  Date.now = () => (week + 6 * DAY + 20 * 3600) * 1000;
  try {
    mockGitHub([{ week, total: 5, days: [1, 1, 1, 1, 0, 1, 0] }]);
    assert.deepEqual(await getRepoStarRecords("o/r"), [{ date: "2026/11/1", count: 5 }]);
  } finally {
    Date.now = realNow;
    if (realTz === undefined) delete process.env.TZ;
    else process.env.TZ = realTz;
  }
});
