const MAX_POINTS = 30;
const DAY_MS = 86400000;

async function request(url, token) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" };
  if (token) headers.Authorization = `token ${token}`;
  const response = await fetch(url, { method: "GET", headers });
  if (response.status >= 400) throw { response, data: null };
  return { response, data: await response.json() };
}

export function repoFromUrl(url) {
  const { hostname, pathname } = new URL(url);
  const [owner, name] = pathname.split("/").filter(Boolean);
  return hostname === "github.com" && owner && name ? `${owner}/${name}` : "";
}

function dateString(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 接口按周给加星数，每页固定 30 周、最新的在前；拉全所有页才能累加出每周的总数
export async function getRepoStarRecords(repo, token = "") {
  const url = `https://api.github.com/repos/${repo}/stargazers/history`;
  const first = await request(`${url}?page=1`, token);
  const last = /[?&]page=(\d+)>; rel="last"/.exec(first.response.headers.get("link") || "");
  const pageCount = last ? Number(last[1]) : 1;
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, i) => request(`${url}?page=${i + 2}`, token))
  );
  const weeks = [first, ...rest].flatMap((page) => page.data).sort((a, b) => a.week - b.week);
  if (weeks.length === 0) throw { response: first.response, data: [] };

  const now = Date.now();
  let count = 0;
  const points = weeks.map(({ week, total }) => {
    count += total;
    const start = week * 1000;
    return { date: dateString(start + 7 * DAY_MS > now ? now : start + 6 * DAY_MS), count };
  });
  if (points.length <= MAX_POINTS) return points;
  return Array.from(
    { length: MAX_POINTS },
    (_, i) => points[Math.round((i * (points.length - 1)) / (MAX_POINTS - 1))]
  );
}
